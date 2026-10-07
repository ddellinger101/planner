<?php

namespace App\Services\Google;

use App\Models\GoogleAccount;

class HttpGoogleContactsService implements GoogleContactsService
{
    private const URL = 'https://people.googleapis.com/v1/people/me/connections';

    public function __construct(private GoogleClient $client) {}

    public function listBirthdays(GoogleAccount $account): array
    {
        $birthdays = [];
        $query = ['personFields' => 'names,birthdays', 'pageSize' => 1000];

        do {
            $page = $this->client->request($account, 'GET', self::URL, $query)->json();

            foreach ($page['connections'] ?? [] as $person) {
                // A contact can carry several birthdays (one per linked
                // profile); the one marked primary is the one to trust.
                $all = collect($person['birthdays'] ?? [])->filter(fn ($birthday) => isset($birthday['date']['month'], $birthday['date']['day']));
                $date = ($all->firstWhere('metadata.primary', true) ?? $all->first())['date'] ?? null;
                $name = collect($person['names'] ?? [])->firstWhere('metadata.primary', true)['displayName']
                    ?? $person['names'][0]['displayName']
                    ?? null;

                if ($date !== null && $name !== null) {
                    $birthdays[] = [
                        'resource_name' => $person['resourceName'],
                        'name' => $name,
                        'month' => (int) $date['month'],
                        'day' => (int) $date['day'],
                        'year' => empty($date['year']) ? null : (int) $date['year'],
                    ];
                }
            }

            $query['pageToken'] = $page['nextPageToken'] ?? null;
        } while ($query['pageToken'] !== null);

        return $birthdays;
    }
}
