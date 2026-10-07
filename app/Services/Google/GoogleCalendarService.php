<?php

namespace App\Services\Google;

use App\Models\GoogleAccount;
use DateTimeInterface;

/**
 * The Google Calendar calls the planner makes. Events cross this boundary in
 * one plain shape, so nothing else needs to know Google's:
 *
 *   id, status ("confirmed" or "cancelled"), title, description, location,
 *   all_day, start, end, etag, recurring_event_id, html_link
 *
 * For an all-day event `start` and `end` are dates (Y-m-d) and `end` is the
 * day after the last one, as Google has it. Otherwise both are RFC 3339 times.
 * When writing, `time_zone` names the zone of a timed event and `yearly`
 * makes an all-day event repeat every year.
 */
interface GoogleCalendarService
{
    /** @return list<array{id: string, summary: string, color: string|null, primary: bool, access_role: string}> */
    public function listCalendars(GoogleAccount $account): array;

    /**
     * Events that fall between two moments, with repeating events expanded
     * into their occurrences. With `$updatedSince`, only what changed since
     * then, including cancellations.
     *
     * @return list<array<string, mixed>>
     *
     * @throws GoogleNotFoundException when `$updatedSince` is further back than Google keeps changes
     */
    public function listEvents(
        GoogleAccount $account,
        string $calendarId,
        DateTimeInterface $from,
        DateTimeInterface $to,
        ?DateTimeInterface $updatedSince = null,
    ): array;

    /**
     * @param  array<string, mixed>  $event
     * @return array<string, mixed>
     */
    public function insertEvent(GoogleAccount $account, string $calendarId, array $event): array;

    /**
     * @param  array<string, mixed>  $event
     * @return array<string, mixed>
     */
    public function patchEvent(GoogleAccount $account, string $calendarId, string $eventId, array $event): array;

    public function deleteEvent(GoogleAccount $account, string $calendarId, string $eventId): void;
}
