<?php

namespace App\Http\Controllers\Api;

use App\Enums\ItemStatus;
use App\Enums\Scope;
use App\Http\Controllers\Controller;
use App\Models\Item;
use App\Rules\PeriodKey;
use App\Support\Period;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ItemController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'scope' => [Rule::enum(Scope::class)],
            'period_key' => [new PeriodKey],
            'from' => ['date_format:Y-m-d'],
            'to' => ['date_format:Y-m-d', 'after_or_equal:from'],
            'status' => [Rule::enum(ItemStatus::class)],
            'person' => ['integer'],
        ]);

        $items = Item::query()
            ->when($filters['scope'] ?? null, fn ($q, $scope) => $q->where('scope', $scope))
            ->when($filters['period_key'] ?? null, fn ($q, $key) => $q->where('period_key', $key))
            ->when($filters['from'] ?? null, fn ($q, $from) => $q->whereDate('due_date', '>=', $from))
            ->when($filters['to'] ?? null, fn ($q, $to) => $q->whereDate('due_date', '<=', $to))
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            // A person sees their own items and the ones that belong to both.
            ->when($filters['person'] ?? null, fn ($q, $person) => $q->where(
                fn ($q) => $q->where('assignee_user_id', $person)->orWhereNull('assignee_user_id'),
            ))
            ->orderByDesc('starred')
            ->orderBy('sort')
            ->orderBy('id')
            ->get();

        return response()->json($items);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $period = Period::parse($data['period_key']);

        // Goals default to both people; day tasks default to whoever added them.
        if (! array_key_exists('assignee_user_id', $data)) {
            $data['assignee_user_id'] = $period->scope === Scope::Day ? $request->user()->id : null;
        }

        $item = Item::create([...$data, 'created_by' => $request->user()->id]);

        return response()->json($item->refresh(), 201);
    }

    public function show(Item $item): JsonResponse
    {
        return response()->json($item);
    }

    public function update(Request $request, Item $item): JsonResponse
    {
        $item->update($this->validated($request, $item));

        return response()->json($item->refresh());
    }

    public function destroy(Item $item): Response
    {
        $item->delete();

        return response()->noContent();
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Item $item = null): array
    {
        $householdId = $request->user()->household_id;
        $required = $item ? 'sometimes' : 'required';

        $data = $request->validate([
            'title' => [$required, 'string', 'max:255'],
            'notes' => ['nullable', 'string', 'max:5000'],
            'category_id' => [$required, 'integer', Rule::exists('categories', 'id')],
            'scope' => [$required, Rule::enum(Scope::class)],
            'period_key' => [$required, new PeriodKey],
            'due_date' => ['nullable', 'date_format:Y-m-d'],
            'due_time' => ['nullable', 'date_format:H:i'],
            'duration_minutes' => ['nullable', 'integer', 'between:1,1440'],
            'starred' => ['boolean'],
            'status' => [Rule::enum(ItemStatus::class)],
            'routine' => ['nullable', Rule::in(['morning', 'evening'])],
            'recurrence_rule' => ['nullable', 'string', 'max:255'],
            'sort' => ['integer', 'min:0'],
            'assignee_user_id' => [
                'nullable', 'integer',
                Rule::exists('users', 'id')->where('household_id', $householdId),
            ],
            'parent_item_id' => [
                'nullable', 'integer',
                Rule::exists('items', 'id')->where('household_id', $householdId)->whereNull('deleted_at'),
            ],
        ]);

        // scope and period_key describe the same thing, so they must agree
        // even when only one of them is being changed.
        $scope = $data['scope'] ?? $item?->scope->value;
        $period = Period::parse($data['period_key'] ?? $item->period_key);

        if ($period->scope->value !== $scope) {
            throw ValidationException::withMessages([
                'period_key' => "The period key must be a {$scope} period.",
            ]);
        }

        // A day item is always due on its own day.
        if ($period->scope === Scope::Day) {
            $data['due_date'] = $period->key();
        }

        return $data;
    }
}
