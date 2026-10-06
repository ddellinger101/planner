<?php

namespace App\Http\Controllers\Api;

use App\Enums\Scope;
use App\Http\Controllers\Controller;
use App\Models\WeightEntry;
use App\Models\WeightGoal;
use App\Rules\PeriodKey;
use App\Support\Period;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Validator;

/**
 * Weight is personal: each person only ever reads and writes their own.
 */
class WeightController extends Controller
{
    private const GOAL_SCOPES = [Scope::Year, Scope::Quarter, Scope::Month, Scope::Week];

    public function index(Request $request): JsonResponse
    {
        $range = $request->validate([
            'from' => ['date_format:Y-m-d'],
            'to' => ['date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        return response()->json(
            WeightEntry::where('user_id', $request->user()->id)
                ->when($range['from'] ?? null, fn ($q, $from) => $q->whereDate('date', '>=', $from))
                ->when($range['to'] ?? null, fn ($q, $to) => $q->whereDate('date', '<=', $to))
                ->orderBy('date')
                ->get(),
        );
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'weight' => ['required', 'numeric', 'between:1,999.9'],
        ]);

        // One entry per day; logging again replaces it.
        $entry = WeightEntry::where('user_id', $request->user()->id)
            ->whereDate('date', $data['date'])
            ->first() ?? new WeightEntry(['user_id' => $request->user()->id, 'date' => $data['date']]);

        $entry->fill(['weight' => $data['weight']])->save();

        return response()->json($entry->refresh());
    }

    public function destroy(Request $request, int $entry): Response
    {
        WeightEntry::where('user_id', $request->user()->id)->findOrFail($entry)->delete();

        return response()->noContent();
    }

    public function goals(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'period_keys' => ['array'],
            'period_keys.*' => [new PeriodKey(self::GOAL_SCOPES)],
        ]);

        return response()->json(
            WeightGoal::where('user_id', $request->user()->id)
                ->when($filters['period_keys'] ?? null, fn ($q, $keys) => $q->whereIn('period_key', $keys))
                ->orderBy('period_key')
                ->get(),
        );
    }

    public function updateGoal(Request $request, string $periodKey): JsonResponse
    {
        Validator::make(['period_key' => $periodKey], [
            'period_key' => [new PeriodKey(self::GOAL_SCOPES)],
        ])->validate();

        $data = $request->validate(['target_weight' => ['present', 'nullable', 'numeric', 'between:1,999.9']]);
        $identity = ['user_id' => $request->user()->id, 'period_key' => $periodKey];

        if ($data['target_weight'] === null) {
            WeightGoal::where($identity)->delete();

            return response()->json(null);
        }

        return response()->json(WeightGoal::updateOrCreate($identity, [
            'scope' => Period::parse($periodKey)->scope,
            'target_weight' => $data['target_weight'],
        ])->refresh());
    }
}
