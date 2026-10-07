<?php

namespace Tests\Fakes;

use App\Models\GoogleAccount;
use App\Services\Google\GoogleAuthException;
use App\Services\Google\GoogleNotFoundException;
use App\Services\Google\GoogleTasksService;
use DateTimeInterface;

/**
 * An in-memory Google Tasks. It behaves like the real API in the ways sync
 * depends on: every write gives a task a new etag and `updated` time, a
 * deleted task lingers flagged as deleted, and asking for changes since a
 * time returns completed and deleted tasks too.
 */
class FakeGoogleTasks implements GoogleTasksService
{
    /** @var array<string, array<string, mixed>> */
    public array $lists = [];

    /** @var array<string, array<string, array<string, mixed>>> list id → task id → task */
    public array $tasks = [];

    /** Every write made through the service, as "insert", "patch" or "delete". */
    public array $writes = [];

    /** Make every call fail as if access had been revoked. */
    public bool $revoked = false;

    private int $counter = 0;

    public function listTaskLists(GoogleAccount $account): array
    {
        $this->guard();

        return array_values($this->lists);
    }

    public function createTaskList(GoogleAccount $account, string $title): array
    {
        $this->guard();

        return $this->addList($title);
    }

    public function listTasks(GoogleAccount $account, string $listId, ?DateTimeInterface $updatedMin = null): array
    {
        $this->guard();

        return array_values(array_filter(
            $this->tasks[$listId] ?? [],
            fn (array $task) => $updatedMin === null
                ? ! ($task['deleted'] ?? false) && $task['status'] !== 'completed'
                : strtotime($task['updated']) >= $updatedMin->getTimestamp(),
        ));
    }

    public function insertTask(GoogleAccount $account, string $listId, array $task): array
    {
        $this->guard();
        $this->writes[] = 'insert';

        return $this->remoteAdd($listId, $task);
    }

    public function patchTask(GoogleAccount $account, string $listId, string $taskId, array $task): array
    {
        $this->guard();
        $this->find($listId, $taskId);
        $this->writes[] = 'patch';

        return $this->remoteEdit($listId, $taskId, $task);
    }

    public function deleteTask(GoogleAccount $account, string $listId, string $taskId): void
    {
        $this->guard();
        $this->find($listId, $taskId);
        $this->writes[] = 'delete';
        $this->remoteEdit($listId, $taskId, ['deleted' => true]);
    }

    // What follows stands in for a person using the Google Tasks app. ----------

    public function addList(string $title): array
    {
        $id = 'list-'.++$this->counter;
        $this->tasks[$id] = [];

        return $this->lists[$id] = ['id' => $id, 'title' => $title, 'etag' => 'etag-'.$this->counter];
    }

    public function listId(string $title): string
    {
        return collect($this->lists)->firstWhere('title', $title)['id'];
    }

    /** @return array<string, mixed> */
    public function remoteAdd(string $listId, array $task): array
    {
        $id = 'task-'.++$this->counter;

        return $this->tasks[$listId][$id] = [
            'id' => $id,
            'status' => 'needsAction',
            ...array_filter($task, fn ($value) => $value !== null),
            'etag' => 'etag-'.$this->counter,
            'updated' => now()->format('Y-m-d\TH:i:s.000\Z'),
        ];
    }

    /** @return array<string, mixed> */
    public function remoteEdit(string $listId, string $taskId, array $changes): array
    {
        $task = [...$this->tasks[$listId][$taskId], ...$changes];

        // A null clears the field, as it does in the real API.
        $task = array_filter($task, fn ($value) => $value !== null);

        return $this->tasks[$listId][$taskId] = [
            ...$task,
            'etag' => 'etag-'.++$this->counter,
            'updated' => now()->format('Y-m-d\TH:i:s.000\Z'),
        ];
    }

    /** The tasks in a list that haven't been deleted, by title. */
    public function titles(string $listTitle): array
    {
        return array_values(array_map(
            fn (array $task) => $task['title'],
            array_filter($this->tasks[$this->listId($listTitle)], fn (array $task) => ! ($task['deleted'] ?? false)),
        ));
    }

    /** The one live task in a list. */
    public function only(string $listTitle): array
    {
        $live = array_values(array_filter(
            $this->tasks[$this->listId($listTitle)],
            fn (array $task) => ! ($task['deleted'] ?? false),
        ));

        if (count($live) !== 1) {
            throw new \LogicException("Expected one task in {$listTitle}, found ".count($live).'.');
        }

        return $live[0];
    }

    private function find(string $listId, string $taskId): void
    {
        if (! isset($this->tasks[$listId][$taskId]) || ($this->tasks[$listId][$taskId]['deleted'] ?? false)) {
            throw new GoogleNotFoundException("No task {$taskId}.");
        }
    }

    private function guard(): void
    {
        if ($this->revoked) {
            throw new GoogleAuthException('Access was revoked.');
        }
    }
}
