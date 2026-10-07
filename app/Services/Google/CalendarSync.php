<?php

namespace App\Services\Google;

use App\Enums\CalendarRole;
use App\Enums\SyncState;
use App\Models\Event;
use App\Models\GoogleAccount;
use App\Models\GoogleCalendar;
use App\Models\ImportantDate;
use App\Models\MealEntry;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Log;

/**
 * Keeps Google Calendar and the planner in step.
 *
 * Each calendar a person chose to show is read into `events`. The one marked
 * as Chef's Menu calendar is read into `meal_entries` instead and is never
 * written to. Events made or changed in the planner are sent to Google, and
 * an important date can be mirrored as a yearly event.
 *
 * Google is asked for a window of days around today rather than for a sync
 * token: with repeating events expanded into occurrences, a window is what
 * stays correct as the days move on.
 */
class CalendarSync
{
    /** How far back and ahead events are kept. */
    public const DAYS_BACK = 60;

    public const DAYS_AHEAD = 365;

    public function __construct(private GoogleCalendarService $google, private ChefMealParser $meals) {}

    /** Pull every chosen calendar, then send what is waiting here. */
    public function syncAccount(GoogleAccount $account): void
    {
        if (! $account->canSyncCalendar()) {
            return;
        }

        try {
            foreach ($account->calendars()->where('sync_enabled', true)->get() as $calendar) {
                $this->pull($account, $calendar);
            }

            $this->pushPending($account);
            $account->update(['calendar_last_synced_at' => now()]);
        } catch (GoogleAuthException $e) {
            if ($e->revoked) {
                $account->update(['needs_reconnect' => true]);
            }

            Log::warning('Google Calendar sync stopped: '.$e->getMessage(), ['account' => $account->id]);
        }
    }

    /**
     * Fetch the account's calendars. A new one starts hidden, except the
     * person's own calendar, and a calendar that is plainly Chef's.
     */
    public function refreshCalendars(GoogleAccount $account): void
    {
        $remote = collect($this->google->listCalendars($account));
        $householdHasMenu = $this->menuCalendars($account)->exists();

        foreach ($remote as $calendar) {
            $row = $account->calendars()->firstOrNew(['google_calendar_id' => $calendar['id']]);
            $row->fill([
                'summary' => mb_substr($calendar['summary'], 0, 255),
                'color' => $calendar['color'] !== null ? substr($calendar['color'], 0, 7) : null,
                'is_primary' => $calendar['primary'],
                'access_role' => $calendar['access_role'],
            ]);

            if (! $row->exists) {
                $looksLikeMenu = ! $householdHasMenu && ! $calendar['primary']
                    && preg_match('/\b(menu|meals?|chef)\b/i', $calendar['summary']) === 1;

                $row->role = match (true) {
                    $looksLikeMenu => CalendarRole::Menu,
                    $calendar['primary'] => CalendarRole::Primary,
                    default => CalendarRole::Other,
                };
                $row->sync_enabled = $looksLikeMenu || $calendar['primary'];
                $householdHasMenu = $householdHasMenu || $looksLikeMenu;
            }

            $row->save();
        }

        // A calendar the person removed or lost access to takes its events with it.
        $account->calendars()->whereNotIn('google_calendar_id', $remote->pluck('id'))->get()->each->delete();
    }

    /**
     * Choose what a calendar is for: "hidden", "events", or "menu" for the
     * one calendar Chef writes meals to.
     */
    public function setMode(GoogleCalendar $calendar, string $mode): void
    {
        $account = $calendar->googleAccount;

        if ($mode === 'menu') {
            // A household has one Menu calendar.
            $this->menuCalendars($account)->whereKeyNot($calendar->id)->get()
                ->each(fn (GoogleCalendar $other) => $this->setMode($other, 'hidden'));
        }

        // What it held was read under its old purpose.
        Event::withTrashed()->withoutGlobalScope('household')->where('google_calendar_id', $calendar->id)
            ->where('sync_state', SyncState::Clean)->forceDelete();
        MealEntry::withoutGlobalScope('household')->where('google_calendar_id', $calendar->id)->delete();

        $calendar->update([
            'role' => match (true) {
                $mode === 'menu' => CalendarRole::Menu,
                $calendar->is_primary => CalendarRole::Primary,
                default => CalendarRole::Other,
            },
            'sync_enabled' => $mode !== 'hidden',
            'last_synced_at' => null,
            'full_synced_at' => null,
        ]);
    }

    /** Read one calendar: everything in the window once a day, changes otherwise. */
    public function pull(GoogleAccount $account, GoogleCalendar $calendar): void
    {
        $startedAt = now();
        $today = CarbonImmutable::now($account->user->timezone)->startOfDay();
        $from = $today->subDays(self::DAYS_BACK)->utc();
        $to = $today->addDays(self::DAYS_AHEAD)->utc();
        $full = $calendar->full_synced_at === null || $calendar->full_synced_at->lt(now()->subDay());
        $remote = null;

        if (! $full) {
            try {
                // A minute of overlap covers clocks that disagree.
                $remote = $this->google->listEvents($account, $calendar->google_calendar_id, $from, $to, $calendar->last_synced_at->subMinute());
            } catch (GoogleNotFoundException) {
                // Google no longer has changes that far back; read it all again.
                $full = true;
            }
        }

        $remote ??= $this->google->listEvents($account, $calendar->google_calendar_id, $from, $to);
        $isMenu = $calendar->role === CalendarRole::Menu;
        // An important date mirrored to this calendar is shown as the date, not as an event too.
        $mirrored = ImportantDate::withoutGlobalScope('household')->where('google_calendar_id', $calendar->id)
            ->whereNotNull('google_event_id')->pluck('google_event_id')->flip();

        foreach ($remote as $event) {
            if ($isMenu) {
                $this->applyMeal($account, $calendar, $event);
            } elseif (! $mirrored->has($event['id']) && ! $mirrored->has($event['recurring_event_id'] ?? '')) {
                $this->applyEvent($account, $calendar, $event);
            }
        }

        if ($full) {
            // Whatever Google didn't return has been deleted or left the window.
            $seen = array_column($remote, 'id');

            $isMenu
                ? MealEntry::withoutGlobalScope('household')->where('google_calendar_id', $calendar->id)
                    ->whereNotIn('google_event_id', $seen)->delete()
                : Event::withoutGlobalScope('household')->where('google_calendar_id', $calendar->id)
                    ->whereNotNull('google_event_id')->where('sync_state', SyncState::Clean)
                    ->whereNotIn('google_event_id', $seen)->forceDelete();
        }

        $calendar->update(['last_synced_at' => $startedAt, ...($full ? ['full_synced_at' => $startedAt] : [])]);
    }

    /** @param  array<string, mixed>  $remote */
    private function applyEvent(GoogleAccount $account, GoogleCalendar $calendar, array $remote): void
    {
        $event = Event::withTrashed()->withoutGlobalScope('household')
            ->where('google_calendar_id', $calendar->id)->where('google_event_id', $remote['id'])->first();

        // A change made here that hasn't been sent yet is not overwritten.
        if ($event?->sync_state === SyncState::Dirty) {
            return;
        }

        if ($remote['status'] === 'cancelled' || $remote['start'] === null || $remote['end'] === null) {
            $event?->forceDelete();

            return;
        }

        $event ??= new Event(['google_calendar_id' => $calendar->id, 'google_event_id' => $remote['id']]);
        $event->fill([
            'household_id' => $account->user->household_id,
            'owner_user_id' => $account->user_id,
            'title' => mb_substr($remote['title'] !== '' ? $remote['title'] : '(No title)', 0, 255),
            'location' => $remote['location'] !== null ? mb_substr($remote['location'], 0, 255) : null,
            'etag' => $remote['etag'],
            'recurring_event_id' => $remote['recurring_event_id'],
            'html_link' => $remote['html_link'] !== null ? mb_substr($remote['html_link'], 0, 1024) : null,
            'sync_state' => SyncState::Clean,
            ...$this->times($remote),
        ]);
        $event->deleted_at = null;
        $event->save();
    }

    /** @param  array<string, mixed>  $remote */
    private function applyMeal(GoogleAccount $account, GoogleCalendar $calendar, array $remote): void
    {
        $key = ['google_calendar_id' => $calendar->id, 'google_event_id' => $remote['id']];
        $meal = $remote['status'] === 'cancelled' ? null : $this->meals->parse($remote, $account->user->timezone);

        if ($meal === null) {
            MealEntry::withoutGlobalScope('household')->where($key)->delete();

            return;
        }

        MealEntry::withoutGlobalScope('household')->updateOrCreate($key, [
            'household_id' => $account->user->household_id,
            'etag' => $remote['etag'],
            ...$meal,
        ]);

        // Chef's plan replaces a note typed into the planner for the same meal.
        MealEntry::withoutGlobalScope('household')
            ->where('household_id', $account->user->household_id)
            ->whereNull('google_event_id')
            ->whereDate('date', $meal['date'])
            ->whereIn('slot', MealEntry::slotsShownAs($meal['slot']))
            ->delete();
    }

    /** Send every event and important date of this account's that is waiting. */
    public function pushPending(GoogleAccount $account): void
    {
        Event::withTrashed()->withoutGlobalScope('household')
            ->where('owner_user_id', $account->user_id)
            ->where('sync_state', SyncState::Dirty)
            ->get()
            ->each(fn (Event $event) => $this->pushEvent($event, $account));

        ImportantDate::withoutGlobalScope('household')
            ->where('household_id', $account->user->household_id)
            ->where(fn ($q) => $q
                ->where(fn ($q) => $q->where('add_to_calendar', true)->whereNull('google_event_id')->where('owner_user_id', $account->user_id))
                ->orWhere(fn ($q) => $q->where('add_to_calendar', false)->whereNotNull('google_event_id')
                    ->whereIn('google_calendar_id', $account->calendars()->select('id'))))
            ->get()
            ->each(fn (ImportantDate $date) => $this->pushImportantDate($date));
    }

    /** Create, update or delete the Google event for one planner event. */
    public function pushEvent(Event $event, ?GoogleAccount $account = null): void
    {
        $account ??= GoogleAccount::where('user_id', $event->owner_user_id)->first();

        if ($account === null || ! $account->canSyncCalendar() || $event->sync_state !== SyncState::Dirty) {
            return;
        }

        // An event made here goes to the person's own calendar.
        $calendar = $event->google_calendar_id !== null
            ? $account->calendars->firstWhere('id', $event->google_calendar_id)
            : $account->calendars->firstWhere('is_primary', true);

        if ($calendar === null || ! $calendar->isWritable()) {
            return;
        }

        try {
            if ($event->trashed()) {
                if ($event->google_event_id !== null) {
                    $this->google->deleteEvent($account, $calendar->google_calendar_id, $event->google_event_id);
                }

                $event->forceDelete();

                return;
            }

            $remote = $event->google_event_id === null
                ? $this->google->insertEvent($account, $calendar->google_calendar_id, $this->toGoogle($event, $account))
                : $this->google->patchEvent($account, $calendar->google_calendar_id, $event->google_event_id, $this->toGoogle($event, $account));

            $event->forceFill([
                'google_calendar_id' => $calendar->id,
                'google_event_id' => $remote['id'],
                'etag' => $remote['etag'],
                'html_link' => $remote['html_link'],
                'sync_state' => SyncState::Clean,
            ])->save();
        } catch (GoogleNotFoundException) {
            // It was deleted in Google in the meantime, so it goes here too.
            $event->forceDelete();
        } catch (GoogleAuthException $e) {
            if ($e->revoked) {
                throw $e;
            }

            $event->forceFill(['sync_state' => SyncState::Error])->save();
            Log::warning('Google refused a calendar event: '.$e->getMessage(), ['event' => $event->id]);
        }
    }

    /**
     * Mirror an important date as an all-day event, repeating yearly if the
     * date does, or remove the event when that is no longer wanted.
     */
    public function pushImportantDate(ImportantDate $date): void
    {
        $calendar = $date->google_calendar_id !== null
            ? GoogleCalendar::find($date->google_calendar_id)
            : GoogleCalendar::where('is_primary', true)
                ->whereHas('googleAccount', fn ($q) => $q->where('user_id', $date->owner_user_id))->first();
        $account = $calendar?->googleAccount;

        if ($calendar === null || ! $account->canSyncCalendar() || ! $calendar->isWritable()) {
            return;
        }

        try {
            if (! $date->add_to_calendar) {
                if ($date->google_event_id !== null) {
                    $this->removeEvent($calendar, $date->google_event_id);
                    $date->forceFill(['google_event_id' => null, 'google_calendar_id' => null])->save();
                }

                return;
            }

            $body = [
                'title' => $date->title,
                'all_day' => true,
                'start' => $date->date->toDateString(),
                'end' => $date->date->copy()->addDay()->toDateString(),
                'yearly' => $date->repeats_yearly,
            ];

            try {
                $remote = $date->google_event_id === null
                    ? $this->google->insertEvent($account, $calendar->google_calendar_id, $body)
                    : $this->google->patchEvent($account, $calendar->google_calendar_id, $date->google_event_id, $body);
            } catch (GoogleNotFoundException) {
                // Its event was deleted in Google; make it again.
                $remote = $this->google->insertEvent($account, $calendar->google_calendar_id, $body);
            }

            $date->forceFill(['google_event_id' => $remote['id'], 'google_calendar_id' => $calendar->id])->save();

            // The planner shows the date itself, not a second copy from the calendar.
            Event::withTrashed()->withoutGlobalScope('household')->where('google_calendar_id', $calendar->id)
                ->where(fn ($q) => $q->where('google_event_id', $remote['id'])->orWhere('recurring_event_id', $remote['id']))
                ->forceDelete();
        } catch (GoogleAuthException $e) {
            if ($e->revoked) {
                $account->update(['needs_reconnect' => true]);
            }

            Log::warning('Google refused an important date: '.$e->getMessage(), ['date' => $date->id]);
        }
    }

    /** Delete an event from Google; one that is already gone is fine. */
    public function removeEvent(GoogleCalendar $calendar, string $eventId): void
    {
        try {
            $this->google->deleteEvent($calendar->googleAccount, $calendar->google_calendar_id, $eventId);
        } catch (GoogleNotFoundException) {
            //
        }
    }

    /** The Menu calendars of the account's household: normally one or none. */
    private function menuCalendars(GoogleAccount $account)
    {
        return GoogleCalendar::where('role', CalendarRole::Menu)
            ->whereHas('googleAccount.user', fn ($q) => $q->where('household_id', $account->user->household_id));
    }

    /**
     * Where an event falls, as the events table keeps it: UTC moments for a
     * timed event, first and last day for an all-day one.
     *
     * @param  array<string, mixed>  $remote
     * @return array<string, mixed>
     */
    private function times(array $remote): array
    {
        if ($remote['all_day']) {
            return [
                'all_day' => true,
                'starts_on' => $remote['start'],
                // Google's end is the day after the last one.
                'ends_on' => max($remote['start'], CarbonImmutable::parse($remote['end'])->subDay()->toDateString()),
                'starts_at' => null,
                'ends_at' => null,
            ];
        }

        return [
            'all_day' => false,
            'starts_at' => CarbonImmutable::parse($remote['start'])->utc(),
            'ends_at' => CarbonImmutable::parse($remote['end'])->utc(),
            'starts_on' => null,
            'ends_on' => null,
        ];
    }

    /** @return array<string, mixed> */
    private function toGoogle(Event $event, GoogleAccount $account): array
    {
        $timezone = $account->user->timezone;

        return [
            'title' => $event->title,
            'location' => $event->location,
            'all_day' => $event->all_day,
            'time_zone' => $timezone,
            'start' => $event->all_day
                ? $event->starts_on->toDateString()
                : $event->starts_at->copy()->setTimezone($timezone)->toRfc3339String(),
            'end' => $event->all_day
                ? $event->ends_on->copy()->addDay()->toDateString()
                : $event->ends_at->copy()->setTimezone($timezone)->toRfc3339String(),
        ];
    }
}
