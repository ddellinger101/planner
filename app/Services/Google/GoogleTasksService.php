<?php

namespace App\Services\Google;

use App\Models\GoogleAccount;
use DateTimeInterface;

/**
 * The Google Tasks calls the planner makes. Tasks and lists are passed
 * around as the API's own arrays (id, title, notes, due, status, etag,
 * updated, deleted…).
 *
 * Every method can throw GoogleAuthException; the ones that address an
 * existing task can throw GoogleNotFoundException.
 */
interface GoogleTasksService
{
    /** @return list<array<string, mixed>> */
    public function listTaskLists(GoogleAccount $account): array;

    /** @return array<string, mixed> */
    public function createTaskList(GoogleAccount $account, string $title): array;

    /**
     * Tasks in a list. With $updatedMin, only those changed since then,
     * including completed and deleted ones; without it, the open tasks.
     *
     * @return list<array<string, mixed>>
     */
    public function listTasks(GoogleAccount $account, string $listId, ?DateTimeInterface $updatedMin = null): array;

    /**
     * @param  array<string, mixed>  $task
     * @return array<string, mixed>
     */
    public function insertTask(GoogleAccount $account, string $listId, array $task): array;

    /**
     * @param  array<string, mixed>  $task
     * @return array<string, mixed>
     */
    public function patchTask(GoogleAccount $account, string $listId, string $taskId, array $task): array;

    public function deleteTask(GoogleAccount $account, string $listId, string $taskId): void;
}
