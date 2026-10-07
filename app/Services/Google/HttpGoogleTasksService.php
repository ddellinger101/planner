<?php

namespace App\Services\Google;

use App\Models\GoogleAccount;
use DateTimeInterface;

class HttpGoogleTasksService implements GoogleTasksService
{
    private const BASE = 'https://tasks.googleapis.com/tasks/v1';

    public function __construct(private GoogleClient $client) {}

    public function listTaskLists(GoogleAccount $account): array
    {
        return $this->pages($account, self::BASE.'/users/@me/lists', ['maxResults' => 100]);
    }

    public function createTaskList(GoogleAccount $account, string $title): array
    {
        return $this->client->request($account, 'POST', self::BASE.'/users/@me/lists', ['title' => $title])->json();
    }

    public function listTasks(GoogleAccount $account, string $listId, ?DateTimeInterface $updatedMin = null): array
    {
        $changes = $updatedMin !== null;

        return $this->pages($account, self::BASE."/lists/{$listId}/tasks", array_filter([
            'maxResults' => 100,
            // Google wants these as the strings "true" and "false".
            'showCompleted' => $changes ? 'true' : 'false',
            'showDeleted' => $changes ? 'true' : 'false',
            'showHidden' => $changes ? 'true' : 'false',
            'updatedMin' => $updatedMin?->format('Y-m-d\TH:i:s\Z'),
        ]));
    }

    public function insertTask(GoogleAccount $account, string $listId, array $task): array
    {
        return $this->client->request($account, 'POST', self::BASE."/lists/{$listId}/tasks", $task)->json();
    }

    public function patchTask(GoogleAccount $account, string $listId, string $taskId, array $task): array
    {
        return $this->client->request($account, 'PATCH', self::BASE."/lists/{$listId}/tasks/{$taskId}", $task)->json();
    }

    public function deleteTask(GoogleAccount $account, string $listId, string $taskId): void
    {
        $this->client->request($account, 'DELETE', self::BASE."/lists/{$listId}/tasks/{$taskId}");
    }

    /**
     * Follow nextPageToken until every item has been collected.
     *
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
