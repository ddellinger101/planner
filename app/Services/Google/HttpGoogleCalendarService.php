<?php

namespace App\Services\Google;

use App\Models\GoogleAccount;
use DateTimeInterface;

class HttpGoogleCalendarService implements GoogleCalendarService
{
    private const BASE = 'https://www.googleapis.com/calendar/v3';

    public function __construct(private GoogleClient $client) {}

    public function listCalendars(GoogleAccount $account): array
    {
        $calendars = $this->pages($account, self::BASE.'/users/me/calendarList', ['maxResults' => 250]);

        return array_map(fn (array $calendar) => [
            'id' => (string) $calendar['id'],
            // The name the person gave it, if they renamed it for themselves.
            'summary' => (string) ($calendar['summaryOverride'] ?? $calendar['summary'] ?? $calendar['id']),
            'color' => $calendar['backgroundColor'] ?? null,
            'primary' => (bool) ($calendar['primary'] ?? false),
            'access_role' => (string) ($calendar['accessRole'] ?? 'reader'),
        ], $calendars);
    }

    public function listEvents(
        GoogleAccount $account,
        string $calendarId,
        DateTimeInterface $from,
        DateTimeInterface $to,
        ?DateTimeInterface $updatedSince = null,
    ): array {
        $events = $this->pages($account, $this->eventsUrl($calendarId), array_filter([
            'maxResults' => 2500,
            // Occurrences rather than rules: the planner shows days, not series.
            'singleEvents' => 'true',
            'showDeleted' => $updatedSince !== null ? 'true' : 'false',
            'timeMin' => $from->format('Y-m-d\TH:i:s\Z'),
            'timeMax' => $to->format('Y-m-d\TH:i:s\Z'),
            'updatedMin' => $updatedSince?->format('Y-m-d\TH:i:s\Z'),
        ]));

        return array_map($this->fromGoogle(...), $events);
    }

    public function insertEvent(GoogleAccount $account, string $calendarId, array $event): array
    {
        return $this->fromGoogle(
            $this->client->request($account, 'POST', $this->eventsUrl($calendarId), $this->toGoogle($event, clearing: false))->json(),
        );
    }

    public function patchEvent(GoogleAccount $account, string $calendarId, string $eventId, array $event): array
    {
        return $this->fromGoogle(
            $this->client->request($account, 'PATCH', $this->eventsUrl($calendarId).'/'.rawurlencode($eventId), $this->toGoogle($event))->json(),
        );
    }

    public function deleteEvent(GoogleAccount $account, string $calendarId, string $eventId): void
    {
        $this->client->request($account, 'DELETE', $this->eventsUrl($calendarId).'/'.rawurlencode($eventId));
    }

    private function eventsUrl(string $calendarId): string
    {
        return self::BASE.'/calendars/'.rawurlencode($calendarId).'/events';
    }

    /**
     * @param  array<string, mixed>  $event
     * @return array<string, mixed>
     */
    private function fromGoogle(array $event): array
    {
        $allDay = isset($event['start']['date']);

        return [
            'id' => (string) ($event['id'] ?? ''),
            'status' => ($event['status'] ?? 'confirmed') === 'cancelled' ? 'cancelled' : 'confirmed',
            'title' => (string) ($event['summary'] ?? ''),
            'description' => $event['description'] ?? null,
            'location' => $event['location'] ?? null,
            'all_day' => $allDay,
            'start' => $allDay ? $event['start']['date'] : ($event['start']['dateTime'] ?? null),
            'end' => $allDay ? ($event['end']['date'] ?? null) : ($event['end']['dateTime'] ?? null),
            'etag' => $event['etag'] ?? null,
            'recurring_event_id' => $event['recurringEventId'] ?? null,
            'html_link' => $event['htmlLink'] ?? null,
        ];
    }

    /**
     * @param  array<string, mixed>  $event
     * @return array<string, mixed>
     */
    private function toGoogle(array $event, bool $clearing = true): array
    {
        $when = function (string $value) use ($event, $clearing) {
            // On an update, naming the other form as null clears it when an event changes kind.
            $time = $event['all_day']
                ? ['date' => $value, 'dateTime' => null, 'timeZone' => null]
                : ['dateTime' => $value, 'date' => null, 'timeZone' => $event['time_zone'] ?? 'UTC'];

            return $clearing ? $time : array_filter($time);
        };

        return [
            'summary' => $event['title'],
            'location' => $event['location'] ?? null,
            'start' => $when($event['start']),
            'end' => $when($event['end']),
            ...(array_key_exists('description', $event) ? ['description' => $event['description']] : []),
            ...(array_key_exists('yearly', $event) ? ['recurrence' => $event['yearly'] ? ['RRULE:FREQ=YEARLY'] : []] : []),
        ];
    }

    /**
     * @param  array<string, mixed>  $query
     * @return list<array<string, mixed>>
     */
    private function pages(GoogleAccount $account, string $url, array $query): array
    {
        $items = [];

        do {
            $page = $this->client->request($account, 'GET', $url, $query)->json();
            $items = [...$items, ...($page['items'] ?? [])];
            $query['pageToken'] = $page['nextPageToken'] ?? null;
        } while ($query['pageToken'] !== null);

        return $items;
    }
}
