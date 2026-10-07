<?php

namespace Tests\Fakes;

use App\Models\GoogleAccount;
use App\Services\Google\GoogleAuthException;
use App\Services\Google\GoogleCalendarService;
use App\Services\Google\GoogleNotFoundException;
use Carbon\CarbonImmutable;
use DateTimeInterface;

/**
 * An in-memory Google Calendar. Like the real API: every write gives an
 * event a new etag and `updated` time, a deleted event lingers as
 * "cancelled" and is only reported when asking for changes, and a yearly
 * event is listed as one occurrence per year.
 */
class FakeGoogleCalendar implements GoogleCalendarService
{
    /** @var array<string, array<string, mixed>> */
    public array $calendars = [];

    /** @var array<string, array<string, array<string, mixed>>> calendar id → event id → event */
    public array $events = [];

    /** Every write made through the service, as "insert", "patch" or "delete". */
    public array $writes = [];

    /** How many times events were listed in full, and for changes only. */
    public array $reads = ['full' => 0, 'changes' => 0];

    /** Fail as if access had been revoked. */
    public bool $revoked = false;

    /** Refuse writes as Google does for a calendar that can't be changed. */
    public bool $refuseWrites = false;

    /** Pretend the change history asked for is too old. */
    public bool $forgetHistory = false;

    private int $counter = 0;

    public function addCalendar(string $summary, bool $primary = false, string $accessRole = 'owner', ?string $id = null): string
    {
        $id ??= $primary ? 'primary@example.com' : 'cal-'.(count($this->calendars) + 1);
        $this->calendars[$id] = ['id' => $id, 'summary' => $summary, 'color' => '#4285f4', 'primary' => $primary, 'access_role' => $accessRole];
        $this->events[$id] ??= [];

        return $id;
    }

    /** Put an event on a calendar as if it had been made in Google. */
    public function addEvent(string $calendarId, array $event): string
    {
        $id = $event['id'] ?? 'event-'.(++$this->counter);
        $allDay = $event['all_day'] ?? ! str_contains((string) $event['start'], 'T');

        $this->events[$calendarId][$id] = $this->stamp([
            'id' => $id,
            'status' => 'confirmed',
            'title' => 'Untitled',
            'description' => null,
            'location' => null,
            'all_day' => $allDay,
            'end' => $allDay
                ? CarbonImmutable::parse($event['start'])->addDay()->toDateString()
                : CarbonImmutable::parse($event['start'])->addHour()->toRfc3339String(),
            'recurring_event_id' => null,
            'html_link' => "https://calendar.google.com/event?eid={$id}",
            ...$event,
        ]);

        return $id;
    }

    public function changeEvent(string $calendarId, string $eventId, array $changes): void
    {
        $this->events[$calendarId][$eventId] = $this->stamp([...$this->events[$calendarId][$eventId], ...$changes]);
    }

    public function cancelEvent(string $calendarId, string $eventId): void
    {
        $this->changeEvent($calendarId, $eventId, ['status' => 'cancelled']);
    }

    /** @return list<string> titles of the events that still exist on a calendar */
    public function titles(string $calendarId): array
    {
        return array_values(array_map(
            fn (array $event) => $event['title'],
            array_filter($this->events[$calendarId] ?? [], fn (array $event) => $event['status'] !== 'cancelled'),
        ));
    }

    public function listCalendars(GoogleAccount $account): array
    {
        $this->guard();

        return array_values($this->calendars);
    }

    public function listEvents(
        GoogleAccount $account,
        string $calendarId,
        DateTimeInterface $from,
        DateTimeInterface $to,
        ?DateTimeInterface $updatedSince = null,
    ): array {
        $this->guard();

        if ($updatedSince !== null && $this->forgetHistory) {
            throw new GoogleNotFoundException('updatedMin is too far in the past.');
        }

        $this->reads[$updatedSince === null ? 'full' : 'changes']++;
        $found = [];

        foreach ($this->events[$calendarId] ?? [] as $event) {
            foreach ($this->occurrences($event, $from, $to) as $occurrence) {
                $changed = $updatedSince === null || strtotime($occurrence['updated']) >= $updatedSince->getTimestamp();
                $shown = $updatedSince !== null || $occurrence['status'] !== 'cancelled';
                $start = CarbonImmutable::parse($occurrence['start']);
                $end = CarbonImmutable::parse($occurrence['end']);

                if ($changed && $shown && $start->lt($to) && $end->gt($from)) {
                    unset($occurrence['updated'], $occurrence['yearly']);
                    $found[] = $occurrence;
                }
            }
        }

        return $found;
    }

    public function insertEvent(GoogleAccount $account, string $calendarId, array $event): array
    {
        $this->guard(writing: true);
        $this->writes[] = 'insert';

        $id = $this->addEvent($calendarId, $event);

        return $this->events[$calendarId][$id];
    }

    public function patchEvent(GoogleAccount $account, string $calendarId, string $eventId, array $event): array
    {
        $this->guard(writing: true);

        if (($this->events[$calendarId][$eventId]['status'] ?? 'cancelled') === 'cancelled') {
            throw new GoogleNotFoundException('No such event.');
        }

        $this->writes[] = 'patch';
        $this->changeEvent($calendarId, $eventId, $event);

        return $this->events[$calendarId][$eventId];
    }

    public function deleteEvent(GoogleAccount $account, string $calendarId, string $eventId): void
    {
        $this->guard(writing: true);

        if (($this->events[$calendarId][$eventId]['status'] ?? 'cancelled') === 'cancelled') {
            throw new GoogleNotFoundException('No such event.');
        }

        $this->writes[] = 'delete';
        $this->cancelEvent($calendarId, $eventId);
    }

    /**
     * A yearly event becomes one occurrence for each year the window touches.
     *
     * @return list<array<string, mixed>>
     */
    private function occurrences(array $event, DateTimeInterface $from, DateTimeInterface $to): array
    {
        if (! ($event['yearly'] ?? false)) {
            return [$event];
        }

        $first = CarbonImmutable::parse($event['start']);
        $occurrences = [];

        foreach (range((int) $from->format('Y'), (int) $to->format('Y')) as $year) {
            if ($year >= $first->year) {
                $day = $first->setYear($year);
                $occurrences[] = [
                    ...$event,
                    'id' => "{$event['id']}_{$year}",
                    'recurring_event_id' => $event['id'],
                    'start' => $day->toDateString(),
                    'end' => $day->addDay()->toDateString(),
                ];
            }
        }

        return $occurrences;
    }

    private function stamp(array $event): array
    {
        $this->counter++;

        return [...$event, 'etag' => "\"etag-{$this->counter}\"", 'updated' => now()->toRfc3339String()];
    }

    private function guard(bool $writing = false): void
    {
        if ($this->revoked) {
            throw new GoogleAuthException('Access was revoked.');
        }

        if ($writing && $this->refuseWrites) {
            throw new GoogleAuthException('Forbidden.', revoked: false);
        }
    }
}
