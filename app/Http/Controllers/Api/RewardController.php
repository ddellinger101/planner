<?php

namespace App\Http\Controllers\Api;

use App\Enums\RewardStatus;
use App\Http\Controllers\Controller;
use App\Models\Reward;
use App\Services\RewardEvaluator;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class RewardController extends Controller
{
    public function __construct(private RewardEvaluator $evaluator) {}

    public function index(Request $request): JsonResponse
    {
        // Catch any deadline that has passed since the last look.
        $this->evaluator->evaluateAll($request->user()->household_id);

        return response()->json(Reward::with('items')->orderBy('deadline')->get());
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);

        $reward = DB::transaction(function () use ($request, $data) {
            $reward = Reward::create([
                ...collect($data)->except('item_ids'),
                'created_by' => $request->user()->id,
            ]);
            $reward->items()->sync($data['item_ids']);

            return $reward;
        });

        // The tasks chosen may all be done already.
        $this->evaluator->evaluate($reward->refresh());

        return response()->json($reward->refresh()->load('items'), 201);
    }

    public function update(Request $request, Reward $reward): JsonResponse
    {
        $data = $this->validated($request, $reward);

        DB::transaction(function () use ($reward, $data) {
            $reward->update(collect($data)->except('item_ids')->all());

            if (array_key_exists('item_ids', $data)) {
                $reward->items()->sync($data['item_ids']);
            }

            // A later deadline gives an expired reward another chance.
            if ($reward->status === RewardStatus::Expired && $reward->deadline->isFuture()) {
                $reward->update(['status' => RewardStatus::Active]);
            }
        });

        $this->evaluator->evaluate($reward->refresh());

        return response()->json($reward->refresh()->load('items'));
    }

    public function destroy(Reward $reward): Response
    {
        $reward->delete();

        return response()->noContent();
    }

    public function claim(Reward $reward): JsonResponse
    {
        abort_unless($reward->status === RewardStatus::Earned, 409, 'Only an earned reward can be claimed.');

        $reward->update(['status' => RewardStatus::Claimed, 'claimed_at' => now()]);

        return response()->json($reward->refresh()->load('items'));
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Reward $reward = null): array
    {
        $householdId = $request->user()->household_id;
        $required = $reward ? 'sometimes' : 'required';

        $data = $request->validate([
            'title' => [$required, 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'deadline' => [$required, 'date'],
            'beneficiary_user_id' => [
                'nullable', 'integer',
                Rule::exists('users', 'id')->where('household_id', $householdId),
            ],
            'item_ids' => [$required, 'array', 'min:1'],
            'item_ids.*' => [
                'integer', 'distinct',
                Rule::exists('items', 'id')->where('household_id', $householdId)->whereNull('deleted_at'),
            ],
        ]);

        // Deadlines are stored in UTC. One without an offset is in the user's
        // timezone, and a bare date means the end of that day.
        if (isset($data['deadline'])) {
            $deadline = CarbonImmutable::parse($data['deadline'], $request->user()->timezone);

            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $data['deadline'])) {
                $deadline = $deadline->endOfDay()->startOfSecond();
            }

            $data['deadline'] = $deadline->utc();
        }

        return $data;
    }
}
