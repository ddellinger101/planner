<?php

namespace App\Http\Controllers\Api;

use App\Enums\ItemStatus;
use App\Enums\Scope;
use App\Http\Controllers\Controller;
use App\Models\Category;
use App\Models\Item;
use App\Rules\PeriodKey;
use App\Services\RecurrenceService;
use App\Support\Period;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ItemController extends Controller
{
    public function __construct(private RecurrenceService $recurrence) {}

    public function index(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'scope' => [Rule::enum(Scope::class)],
            'period_key' => [new PeriodKey],
            'from' => ['date_format:Y-m-d'],
            'to' => ['date_format:Y-m-d', 'after_or_equal:from'],
            'status' => [Rule::enum(ItemStatus::class)],
            'person' => ['integer'],
            'own_health' => ['boolean'],
            'routine' => [Rule::in(['morning', 'evening'])],
            'series' => ['boolean'],
        ]);

        // Recurring tasks are generated ahead of time; top them up as far as
        // the dates being asked for.
        $this->recurrence->ensureGenerated($request->user(), $filters['to'] ?? (
            isset($filters['period_key']) ? Period::parse($filters['period_key'])->end()->toDateString() : null
        ));

        $items = Item::query()
            ->when($filters['scope'] ?? null, fn ($q, $scope) => $q->where('scope', $scope))
            ->when($filters['period_key'] ?? null, fn ($q, $key) => $q->where('period_key', $key))
            ->when($filters['from'] ?? null, fn ($q, $from) => $q->whereDate('due_date', '>=', $from))
            ->when($filters['to'] ?? null, fn ($q, $to) => $q->whereDate('due_date', '<=', $to))
            ->when($filters['status'] ?? null, fn ($q, $status) => $q->where('status', $status))
            ->when($filters['routine'] ?? null, fn ($q, $routine) => $q->where('routine', $routine))
            // One row per repeating task: the occurrence that holds its rule.
            ->when($filters['series'] ?? false, fn ($q) => $q->whereNotNull('recurrence_rule')->whereNull('recurrence_parent_id'))
            ->tap(fn ($q) => $this->forPerson($q, $request, $filters))
            ->orderByDesc('starred')
            ->orderBy('sort')
            ->orderBy('id')
            ->get();

        return response()->json($items);
    }

    /** Open day tasks from before the given date, newest first. */
    public function overdue(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'before' => ['required', 'date_format:Y-m-d'],
            'person' => ['integer'],
            'own_health' => ['boolean'],
        ]);

        $items = Item::query()
            ->where('scope', Scope::Day)
            ->where('status', ItemStatus::Open)
            ->whereDate('due_date', '<', $filters['before'])
            ->tap(fn ($q) => $this->forPerson($q, $request, $filters))
            ->orderByDesc('due_date')
            ->orderBy('id')
            ->get()
            // A missed daily task would otherwise show up once per day
            // missed; only its most recent occurrence is worth showing.
            ->unique(fn (Item $item) => $item->recurrence_parent_id ?? $item->id)
            ->values();

        return response()->json($items);
    }

    /**
     * How many items each period has and how many are done, per category.
     * Dropped items don't count either way.
     */
    public function summary(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'period_keys' => ['required', 'array', 'max:60'],
            'period_keys.*' => [new PeriodKey],
            'person' => ['integer'],
            'own_health' => ['boolean'],
        ]);

        $rows = Item::query()
            ->whereIn('period_key', $filters['period_keys'])
            ->where('status', '!=', ItemStatus::Dropped)
            ->tap(fn ($q) => $this->forPerson($q, $request, $filters))
            ->groupBy('period_key', 'category_id')
            ->orderBy('period_key')
            ->orderBy('category_id')
            ->selectRaw('period_key, category_id, count(*) as total, sum(case when status = ? then 1 else 0 end) as done', [ItemStatus::Done->value])
            ->toBase()
            ->get()
            ->map(fn ($row) => [
                'period_key' => $row->period_key,
                'category_id' => $row->category_id,
                'total' => (int) $row->total,
                'done' => (int) $row->done,
            ]);

        return response()->json($rows);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $period = Period::parse($data['period_key']);

        // Goals default to both people. Day tasks, and anything in Health,
        // which is personal, default to whoever added them.
        if (! array_key_exists('assignee_user_id', $data)) {
            $personal = $period->scope === Scope::Day
                || ($data['category_id'] ?? null) === Category::where('slug', 'health')->value('id');

            $data['assignee_user_id'] = $personal ? $request->user()->id : null;
        }

        $item = Item::create([...$data, 'created_by' => $request->user()->id]);

        if ($item->recurrence_rule) {
            $this->recurrence->start($item, $request->user());
        }

        return response()->json($item->refresh(), 201);
    }

    public function show(Item $item): JsonResponse
    {
        return response()->json($item);
    }

    public function update(Request $request, Item $item): JsonResponse
    {
        $item = $this->recurrence->update(
            $item,
            $this->validated($request, $item),
            $this->applyTo($request),
            $request->user(),
        );

        return response()->json($item->refresh());
    }

    public function destroy(Request $request, Item $item): Response
    {
        $this->recurrence->delete($item, $this->applyTo($request));

        return response()->noContent();
    }

    /**
     * A person sees their own items and the ones that belong to both. With
     * `own_health`, Health items that belong to someone else are left out:
     * health is personal even when everything else is shared.
     *
     * @param  array<string, mixed>  $filters
     */
    private function forPerson($query, Request $request, array $filters): void
    {
        if (($person = $filters['person'] ?? null) !== null) {
            $query->where(fn ($q) => $q->where('assignee_user_id', $person)->orWhereNull('assignee_user_id'));
        }

        if ($filters['own_health'] ?? false) {
            $health = Category::where('slug', 'health')->value('id');

            $query->where(fn ($q) => $q
                ->where('category_id', '!=', $health)
                ->orWhereNull('category_id')
                ->orWhereNull('assignee_user_id')
                ->orWhere('assignee_user_id', $request->user()->id));
        }
    }

    /** How far a change to a recurring task reaches. */
    private function applyTo(Request $request): string
    {
        return $request->validate([
            'apply_to' => [Rule::in(['one', 'following', 'all'])],
        ])['apply_to'] ?? 'one';
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
            'duration_minutes' => ['nullable', 'integer', 'between:5,1440'],
            'starred' => ['boolean'],
            'status' => [Rule::enum(ItemStatus::class)],
            'routine' => ['nullable', Rule::in(['morning', 'evening'])],
            'recurrence_rule' => [
                'nullable', 'string', 'max:255',
                function (string $attribute, mixed $value, Closure $fail) {
                    if (! RecurrenceService::isValidRule($value)) {
                        $fail('The :attribute is not a valid recurrence rule.');
                    }
                },
            ],
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

        if ($period->scope !== Scope::Day && ($data['recurrence_rule'] ?? null) !== null) {
            throw ValidationException::withMessages([
                'recurrence_rule' => 'Only day tasks can repeat.',
            ]);
        }

        // A day item is always due on its own day.
        if ($period->scope === Scope::Day) {
            $data['due_date'] = $period->key();
        }

        return $data;
    }
}
