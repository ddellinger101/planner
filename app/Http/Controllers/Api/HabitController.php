<?php

namespace App\Http\Controllers\Api;

use App\Enums\Routine;
use App\Http\Controllers\Controller;
use App\Models\Habit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class HabitController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $range = $request->validate([
            'from' => ['required_with:to', 'date_format:Y-m-d'],
            'to' => ['required_with:from', 'date_format:Y-m-d', 'after_or_equal:from'],
            'person' => ['integer'],
        ]);

        $habits = Habit::query()
            ->when($range['person'] ?? null, fn ($q, $person) => $q->where('user_id', $person))
            // With a date range, include that range's checks and hide habits not active in it.
            ->when($range['from'] ?? null, fn ($q) => $q
                ->whereDate('active_from', '<=', $range['to'])
                ->where(fn ($q) => $q->whereNull('active_to')->orWhereDate('active_to', '>=', $range['from']))
                ->with(['checks' => fn ($q) => $q
                    ->whereDate('date', '>=', $range['from'])
                    ->whereDate('date', '<=', $range['to'])
                    ->orderBy('date')]))
            ->orderBy('sort')
            ->orderBy('id')
            ->get();

        return response()->json($habits);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $data['user_id'] ??= $request->user()->id;
        $data['active_from'] ??= now($request->user()->timezone)->toDateString();

        return response()->json(Habit::create($data)->refresh(), 201);
    }

    public function update(Request $request, Habit $habit): JsonResponse
    {
        $habit->update($this->validated($request, $habit));

        return response()->json($habit->refresh());
    }

    public function destroy(Habit $habit): Response
    {
        $habit->delete();

        return response()->noContent();
    }

    public function check(Request $request, Habit $habit, string $date): JsonResponse
    {
        Validator::make(['date' => $date], ['date' => ['date_format:Y-m-d']])->validate();
        $done = $request->validate(['done' => ['required', 'boolean']])['done'];

        $check = $habit->checks()->whereDate('date', $date)->first();

        if (! $done) {
            $check?->delete();

            return response()->json(['date' => $date, 'done' => false]);
        }

        $check ??= $habit->checks()->create(['date' => $date, 'done' => true]);

        return response()->json(['date' => $date, 'done' => true]);
    }

    /** @return array<string, mixed> */
    private function validated(Request $request, ?Habit $habit = null): array
    {
        return $request->validate([
            'title' => [$habit ? 'sometimes' : 'required', 'string', 'max:255'],
            'category_id' => ['nullable', 'integer', Rule::exists('categories', 'id')],
            'icon' => ['nullable', 'string', 'max:64'],
            'color' => ['nullable', 'hex_color'],
            'routine' => [Rule::enum(Routine::class)],
            'target_per_week' => ['integer', 'between:1,7'],
            'active_from' => ['date_format:Y-m-d'],
            'active_to' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:active_from'],
            'sort' => ['integer', 'min:0'],
            'user_id' => [
                'integer',
                Rule::exists('users', 'id')->where('household_id', $request->user()->household_id),
            ],
        ]);
    }
}
