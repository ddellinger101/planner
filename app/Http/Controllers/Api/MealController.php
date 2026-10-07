<?php

namespace App\Http\Controllers\Api;

use App\Enums\MealSlot;
use App\Http\Controllers\Controller;
use App\Models\MealEntry;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Validation\Rule;

/**
 * The meal plan. Chef plans the meals and the planner reads them; a slot
 * Chef has left empty can hold a note typed here, until Chef fills it.
 */
class MealController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $range = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        return response()->json(
            MealEntry::whereDate('date', '>=', $range['from'])
                ->whereDate('date', '<=', $range['to'])
                ->orderBy('date')
                ->orderBy('id')
                ->get(),
        );
    }

    /** Write, change or (with an empty title) clear the note for one slot of one day. */
    public function update(Request $request): JsonResponse|Response
    {
        $data = $request->validate([
            'date' => ['required', 'date_format:Y-m-d'],
            'slot' => ['required', Rule::in(['breakfast', 'lunch', 'dinner', 'snack'])],
            'title' => ['present', 'nullable', 'string', 'max:255'],
        ]);

        $slot = MealSlot::from($data['slot']);
        $title = trim((string) $data['title']);
        $inSlot = fn () => MealEntry::whereDate('date', $data['date'])
            ->whereIn('slot', MealEntry::slotsShownAs($slot));

        abort_if($inSlot()->whereNotNull('google_event_id')->exists(), 409, 'Chef has already planned this meal.');

        $note = $inSlot()->first();

        if ($title === '') {
            $note?->delete();

            return response()->noContent();
        }

        $note ??= new MealEntry(['date' => $data['date'], 'slot' => $slot]);
        $note->fill(['title' => $title])->save();

        return response()->json($note->refresh());
    }
}
