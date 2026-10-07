<?php

namespace App\Http\Controllers\Api;

use App\Enums\SyncState;
use App\Http\Controllers\Controller;
use App\Jobs\PushEventToGoogle;
use App\Models\Event;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Calendar events: those read from Google Calendar and those made here,
 * which are sent to the maker's own Google calendar.
 */
class EventController extends Controller
{
    /** The events that touch a range of days, as the signed-in person's clock has them. */
    public function index(Request $request): JsonResponse
    {
        $range = $request->validate([
            'from' => ['required', 'date_format:Y-m-d'],
            'to' => ['required', 'date_format:Y-m-d', 'after_or_equal:from'],
        ]);

        $timezone = $request->user()->timezone;
        $start = CarbonImmutable::parse($range['from'], $timezone)->startOfDay()->utc();
        $end = CarbonImmutable::parse($range['to'], $timezone)->addDay()->startOfDay()->utc();

        return response()->json(
            Event::with('calendar')
                ->where(fn ($q) => $q
                    ->where(fn ($q) => $q->where('all_day', false)->where('starts_at', '<', $end)->where('ends_at', '>', $start))
                    // An event with no length still belongs to the moment it starts.
                    ->orWhere(fn ($q) => $q->where('all_day', false)->whereColumn('ends_at', 'starts_at')
                        ->where('starts_at', '>=', $start)->where('starts_at', '<', $end))
                    ->orWhere(fn ($q) => $q->where('all_day', true)
                        ->whereDate('starts_on', '<=', $range['to'])->whereDate('ends_on', '>=', $range['from'])))
                ->orderByRaw('coalesce(starts_at, starts_on)')
                ->orderBy('id')
                ->get(),
        );
    }

    public function store(Request $request): JsonResponse
    {
        $event = Event::create([
            'owner_user_id' => $request->user()->id,
            'sync_state' => SyncState::Dirty,
            ...$this->validated($request),
        ]);

        PushEventToGoogle::dispatch($event->id);

        return response()->json($event->refresh()->load('calendar'), 201);
    }

    public function update(Request $request, Event $event): JsonResponse
    {
        abort_unless($event->editable, 403, 'This event is changed in Google Calendar.');

        $event->update([...$this->validated($request), 'sync_state' => SyncState::Dirty]);

        PushEventToGoogle::dispatch($event->id);

        return response()->json($event->refresh()->load('calendar'));
    }

    public function destroy(Event $event): Response
    {
        abort_unless($event->editable, 403, 'This event is removed in Google Calendar.');

        if ($event->google_event_id === null) {
            // It never reached Google.
            $event->forceDelete();
        } else {
            $event->update(['sync_state' => SyncState::Dirty]);
            $event->delete();

            PushEventToGoogle::dispatch($event->id);
        }

        return response()->noContent();
    }

    /**
     * Times arrive as the person's own clock shows them and are kept in UTC.
     *
     * @return array<string, mixed>
     */
    private function validated(Request $request): array
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'location' => ['nullable', 'string', 'max:255'],
            'all_day' => ['required', 'boolean'],
            'date' => ['required', 'date_format:Y-m-d'],
            'end_date' => ['nullable', 'date_format:Y-m-d', 'after_or_equal:date'],
            'start_time' => ['required_if:all_day,false', 'nullable', 'date_format:H:i'],
            'end_time' => ['nullable', 'date_format:H:i'],
        ]);

        $times = ['starts_at' => null, 'ends_at' => null, 'starts_on' => null, 'ends_on' => null];

        if ($data['all_day']) {
            $times['starts_on'] = $data['date'];
            $times['ends_on'] = $data['end_date'] ?? $data['date'];
        } else {
            $timezone = $request->user()->timezone;
            $start = CarbonImmutable::parse("{$data['date']} {$data['start_time']}", $timezone);
            $end = isset($data['end_time'])
                ? CarbonImmutable::parse("{$data['date']} {$data['end_time']}", $timezone)
                : $start->addHour();

            // An end before the start means it runs past midnight.
            $times['starts_at'] = $start->utc();
            $times['ends_at'] = ($end->lt($start) ? $end->addDay() : $end)->utc();
        }

        return [
            'title' => $data['title'],
            'location' => $data['location'] ?? null,
            'all_day' => $data['all_day'],
            ...$times,
        ];
    }
}
