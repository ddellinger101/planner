<?php

namespace App\Http\Controllers\Api;

use App\Enums\BrainDumpBucket;
use App\Enums\ItemSource;
use App\Enums\Scope;
use App\Http\Controllers\Controller;
use App\Models\BrainDumpItem;
use App\Models\Category;
use App\Models\Item;
use App\Rules\PeriodKey;
use App\Support\Period;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class BrainDumpController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $week = Period::today(Scope::Week, $request->user()->timezone);

        return response()->json([
            // Items stay on the board until they are added to the plan.
            'items' => BrainDumpItem::whereNull('assigned_item_id')
                ->orderBy('sort')
                ->orderBy('id')
                ->get(),
            'assigned_this_week' => BrainDumpItem::whereNotNull('assigned_at')
                ->where('assigned_at', '>=', $week->start->shiftTimezone($request->user()->timezone)->utc())
                ->count(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'bucket' => ['required', Rule::enum(BrainDumpBucket::class)],
            'title' => ['required', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'sort' => ['integer', 'min:0'],
        ]);

        $item = BrainDumpItem::create([...$data, 'created_by' => $request->user()->id]);

        return response()->json($item->refresh(), 201);
    }

    public function update(Request $request, BrainDumpItem $brainDumpItem): JsonResponse
    {
        $brainDumpItem->update($request->validate([
            'bucket' => [Rule::enum(BrainDumpBucket::class)],
            'title' => ['sometimes', 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'sort' => ['integer', 'min:0'],
        ]));

        return response()->json($brainDumpItem->refresh());
    }

    public function destroy(BrainDumpItem $brainDumpItem): Response
    {
        $brainDumpItem->delete();

        return response()->noContent();
    }

    /** "Add to Plan": turn the brain-dump item into a planner item. */
    public function assign(Request $request, BrainDumpItem $brainDumpItem): JsonResponse
    {
        abort_if($brainDumpItem->assigned_item_id !== null, 409, 'This item is already in the plan.');

        $data = $request->validate([
            'period_key' => ['required', new PeriodKey],
            'category_id' => ['integer', Rule::exists('categories', 'id')],
            'due_time' => ['nullable', 'date_format:H:i'],
            'starred' => ['boolean'],
            'recurrence_rule' => ['nullable', 'string', 'max:255'],
        ]);

        $period = Period::parse($data['period_key']);
        $isDay = $period->scope === Scope::Day;

        $item = DB::transaction(function () use ($request, $brainDumpItem, $data, $period, $isDay) {
            $item = Item::create([
                'title' => $brainDumpItem->title,
                'notes' => $brainDumpItem->notes,
                'category_id' => $data['category_id']
                    ?? Category::where('slug', $brainDumpItem->bucket->defaultCategorySlug())->value('id'),
                'scope' => $period->scope,
                'period_key' => $period->key(),
                'due_date' => $isDay ? $period->key() : null,
                'due_time' => $isDay ? ($data['due_time'] ?? null) : null,
                'starred' => $data['starred'] ?? false,
                'recurrence_rule' => $data['recurrence_rule'] ?? null,
                'source' => ItemSource::BrainDump,
                'created_by' => $request->user()->id,
                'assignee_user_id' => $isDay ? $request->user()->id : null,
            ]);

            $brainDumpItem->update(['assigned_item_id' => $item->id, 'assigned_at' => now()]);

            return $item;
        });

        return response()->json($item->refresh(), 201);
    }
}
