<?php

namespace App\Http\Controllers\Api;

use App\Enums\JournalType;
use App\Enums\Scope;
use App\Http\Controllers\Controller;
use App\Models\JournalEntry;
use App\Rules\PeriodKey;
use App\Support\Period;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;
use Illuminate\Validation\Rule;

class JournalController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $key = $request->validate(['period_key' => ['required', new PeriodKey]])['period_key'];

        $entries = JournalEntry::where('user_id', $request->user()->id)
            ->where('period_key', $key)
            ->get()
            ->map(fn (JournalEntry $entry) => [...$entry->only(['type', 'body', 'minutes', 'period_key']), 'carried' => false]);

        $isDay = Period::parse($key)->scope === Scope::Day;

        // A day with no affirmation of its own shows the most recent earlier one.
        if ($isDay && ! $entries->contains('type', JournalType::Affirmation)) {
            $previous = JournalEntry::where('user_id', $request->user()->id)
                ->where('type', JournalType::Affirmation)
                ->where('period_key', 'like', '____-__-__')
                ->where('period_key', '<', $key)
                ->orderByDesc('period_key')
                ->first();

            if ($previous) {
                $entries->push([...$previous->only(['type', 'body', 'minutes', 'period_key']), 'carried' => true]);
            }
        }

        return response()->json($entries->values());
    }

    public function update(Request $request, string $periodKey, string $type): JsonResponse
    {
        Validator::make(['period_key' => $periodKey, 'type' => $type], [
            'period_key' => [new PeriodKey],
            'type' => [Rule::enum(JournalType::class)],
        ])->validate();

        $data = $request->validate([
            'body' => ['nullable', 'string', 'max:5000'],
            'minutes' => ['nullable', 'integer', 'between:0,1440'],
        ]);

        $identity = ['user_id' => $request->user()->id, 'period_key' => $periodKey, 'type' => $type];

        // Clearing an entry removes it, so an emptied affirmation carries over again.
        if (blank($data['body'] ?? null) && blank($data['minutes'] ?? null)) {
            JournalEntry::where($identity)->delete();

            return response()->json(null);
        }

        $entry = JournalEntry::updateOrCreate($identity, [
            'body' => $data['body'] ?? null,
            'minutes' => $data['minutes'] ?? null,
        ]);

        return response()->json([...$entry->only(['type', 'body', 'minutes', 'period_key']), 'carried' => false]);
    }
}
