<?php

namespace App\Http\Controllers\Api;

use App\Enums\ItemStatus;
use App\Enums\Scope;
use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Models\PeriodReview;
use App\Rules\PeriodKey;
use App\Support\Period;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Period rollover: when a new week, month, quarter or year starts, the
 * previous one's open items are reviewed and each is finished, carried
 * forward or dropped.
 */
class ReviewController extends Controller
{
    // Broadest first, so a new year is reviewed before its last quarter,
    // month and week instead of as four separate interruptions.
    private const SCOPES = [Scope::Year, Scope::Quarter, Scope::Month, Scope::Week];

    /** The periods that have just ended with open items and no review yet. */
    public function pending(Request $request): JsonResponse
    {
        $timezone = $request->user()->timezone;
        $reviewed = PeriodReview::pluck('period_key')->flip();
        $pending = [];

        foreach (self::SCOPES as $scope) {
            $current = Period::today($scope, $timezone);
            $previous = $current->previous();

            $open = Item::where('period_key', $previous->key())
                ->where('status', ItemStatus::Open)
                ->count();

            if ($open > 0 && ! $reviewed->has($previous->key())) {
                $pending[] = [
                    'period_key' => $previous->key(),
                    'scope' => $scope->value,
                    'open_count' => $open,
                    // Where "carry forward" sends an item.
                    'next_period_key' => $current->key(),
                ];
            }
        }

        return response()->json($pending);
    }

    public function store(Request $request): JsonResponse
    {
        $key = $request->validate([
            'period_key' => ['required', new PeriodKey(self::SCOPES)],
        ])['period_key'];

        $review = PeriodReview::firstOrCreate(
            ['period_key' => $key],
            ['reviewed_by' => $request->user()->id],
        );

        return response()->json($review, 201);
    }

    /**
     * Carry an open goal into a later period. The original is closed (as
     * dropped, so it no longer counts against its own period) and the copy
     * points back at it.
     */
    public function carry(Request $request, Item $item): JsonResponse
    {
        abort_if($item->scope === Scope::Day, 422, 'Day tasks are moved, not carried forward.');
        abort_if($item->status !== ItemStatus::Open, 409, 'Only an open item can be carried forward.');

        $from = Period::parse($item->period_key);

        $data = $request->validate([
            'period_key' => [new PeriodKey([$item->scope])],
        ]);

        $target = Period::parse($data['period_key'] ?? $from->next()->key());

        abort_if($target->start->lte($from->start), 422, 'An item can only be carried to a later period.');

        $copy = DB::transaction(function () use ($item, $target, $request) {
            $copy = Item::create([
                ...$item->only([
                    'title', 'notes', 'category_id', 'scope', 'starred', 'assignee_user_id', 'parent_item_id',
                ]),
                'period_key' => $target->key(),
                'carried_from_item_id' => $item->id,
                'created_by' => $request->user()->id,
            ]);

            $item->update(['status' => ItemStatus::Dropped]);

            return $copy;
        });

        return response()->json($copy->refresh(), 201);
    }
}
