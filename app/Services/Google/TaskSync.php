<?php

namespace App\Services\Google;

use App\Enums\BrainDumpBucket;
use App\Enums\ItemSource;
use App\Enums\ItemStatus;
use App\Enums\Scope;
use App\Enums\SyncState;
use App\Models\BrainDumpItem;
use App\Models\Category;
use App\Models\GoogleAccount;
use App\Models\GoogleTaskList;
use App\Models\Item;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Two-way sync between planner items and Google Tasks.
 *
 * Only day tasks sync; goals for a week or longer stay in the planner. Each
 * category maps to one Google list per person, and a task lives in the list
 * of whoever it is assigned to (the creator's, when it belongs to both).
 *
 * Google has no webhook for Tasks, so changes made there are picked up by
 * polling each list for what has changed since the last look. Changes made
 * here are pushed by a queued job as they happen.
 */
class TaskSync
{
    /** Google list names that don't match a category's name exactly. */
    private const LIST_ALIASES = [
        'finance' => 'finances',
        'get it done' => 'other',
    ];

    /** How far back a list's first sync looks for finished and deleted tasks. */
    private const FIRST_PASS_DAYS = 30;

    /** How far ahead occurrences of a repeating task are sent to Google. */
    private const REPEAT_WINDOW_DAYS = 7;

    /** True while a change from Google is being applied, so it isn't pushed straight back. */
    private static bool $applyingRemote = false;

    public function __construct(private GoogleTasksService $tasks) {}

    public static function isApplyingRemote(): bool
    {
        return self::$applyingRemote;
    }

    /** Pull what changed in Google, then push what is waiting here. */
    public function syncAccount(GoogleAccount $account): void
    {
        if (! $account->canSyncTasks()) {
            return;
        }

        try {
            foreach ($account->taskLists()->whereNotNull('category_id')->get() as $list) {
                $this->pullList($account, $list);
            }

            $this->pushPending($account);
            $account->update(['tasks_last_synced_at' => now()]);
        } catch (GoogleAuthException $e) {
            $account->update(['needs_reconnect' => true]);
            Log::warning('Google Tasks sync stopped: the account needs reconnecting.', ['account' => $account->id]);
        }
    }

    /**
     * Fetch the account's lists from Google and match them to categories by
     * name. A list that was mapped by hand keeps its mapping.
     */
    public function refreshLists(GoogleAccount $account): void
    {
        $categories = Category::pluck('id', 'slug');
        $byName = Category::pluck('slug', 'name')->mapWithKeys(fn ($slug, $name) => [strtolower($name) => $slug]);
        $remote = $this->tasks->listTaskLists($account);

        foreach ($remote as $list) {
            $name = strtolower(trim($list['title']));
            $slug = self::LIST_ALIASES[$name] ?? $byName[$name] ?? null;
            $existing = $account->taskLists()->where('google_list_id', $list['id'])->first();
            $taken = $slug !== null && $account->taskLists()->where('category_id', $categories[$slug])->exists();

            $account->taskLists()->updateOrCreate(
                ['google_list_id' => $list['id']],
                [
                    'title' => $list['title'],
                    'etag' => $list['etag'] ?? null,
                    // One list per category: the first match wins.
                    'category_id' => $existing?->category_id ?? ($slug !== null && ! $taken ? $categories[$slug] : null),
                ],
            );
        }

        $account->taskLists()->whereNotIn('google_list_id', array_column($remote, 'id'))->delete();
    }

    /** Create a Google list for every category that has none. */
    public function createMissingLists(GoogleAccount $account): void
    {
        $mapped = $account->taskLists()->whereNotNull('category_id')->pluck('category_id');

        foreach (Category::whereNotIn('id', $mapped)->orderBy('sort')->get() as $category) {
            $list = $this->tasks->createTaskList($account, $category->name);

            $account->taskLists()->create([
                'google_list_id' => $list['id'],
                'title' => $list['title'],
                'etag' => $list['etag'] ?? null,
                'category_id' => $category->id,
            ]);
        }
    }

    public function pullList(GoogleAccount $account, GoogleTaskList $list): void
    {
        $startedAt = now();

        if ($list->last_synced_at === null) {
            // The first pass: everything still open, plus recent changes so
            // that tasks the planner already sent are seen finishing or
            // disappearing. Old finished tasks are left in Google.
            $tasks = collect([
                ...$this->tasks->listTasks($account, $list->google_list_id),
                ...$this->tasks->listTasks($account, $list->google_list_id, now()->subDays(self::FIRST_PASS_DAYS)),
            ])->keyBy('id')->values()->all();
        } else {
            // Later passes ask for what changed, with a minute's overlap in
            // case the two clocks disagree.
            $tasks = $this->tasks->listTasks($account, $list->google_list_id, $list->last_synced_at->subMinute());
        }

        foreach ($tasks as $task) {
            try {
                $this->applyRemote($account, $list, $task);
            } catch (Throwable $e) {
                // One odd task shouldn't stop the rest of the list.
                report($e);
            }
        }

        $list->update(['last_synced_at' => $startedAt]);
    }

    /**
     * Bring one Google task into the planner.
     *
     * @param  array<string, mixed>  $task
     */
    public function applyRemote(GoogleAccount $account, GoogleTaskList $list, array $task): void
    {
        $user = $account->user;
        $deleted = (bool) ($task['deleted'] ?? false);
        $remote = TaskFormat::decode($task);
        $etag = $task['etag'] ?? null;

        $item = Item::withTrashed()->withoutGlobalScope('household')
            ->where('household_id', $user->household_id)
            ->where('google_task_id', $task['id'])
            ->first();

        $dump = BrainDumpItem::withoutGlobalScope('household')
            ->where('household_id', $user->household_id)
            ->where('google_task_id', $task['id'])
            ->whereNull('assigned_item_id')
            ->first();

        self::$applyingRemote = true;

        try {
            if ($item !== null) {
                $this->updateItem($item, $list, $remote, $etag, $task, $deleted);
            } elseif ($deleted || $remote['done']) {
                // Gone or finished before the planner ever saw it.
                $dump?->delete();
            } elseif ($remote['due_date'] === null) {
                // No date yet: it waits on the Brain Dump to be given one.
                BrainDumpItem::withoutGlobalScope('household')->updateOrCreate(
                    ['id' => $dump?->id],
                    [
                        'household_id' => $user->household_id,
                        'created_by' => $dump?->created_by ?? $user->id,
                        'bucket' => $dump?->bucket ?? BrainDumpBucket::Other,
                        'title' => ($remote['starred'] ? '⭐ ' : '').$remote['title'],
                        'notes' => $remote['notes'],
                        'google_task_id' => $task['id'],
                        'google_task_list_id' => $list->id,
                        'google_etag' => $etag,
                    ],
                );
            } else {
                $item = Item::create([
                    'household_id' => $user->household_id,
                    'created_by' => $user->id,
                    'assignee_user_id' => $user->id,
                    'category_id' => $list->category_id,
                    'title' => $remote['title'],
                    'notes' => $remote['notes'],
                    'scope' => Scope::Day,
                    'period_key' => $remote['due_date'],
                    'due_date' => $remote['due_date'],
                    'due_time' => $remote['due_time'],
                    'starred' => $remote['starred'],
                    'source' => ItemSource::GoogleTasks,
                    'google_task_id' => $task['id'],
                    'google_task_list_id' => $list->id,
                    'google_etag' => $etag,
                    'google_updated_at' => $task['updated'] ?? null,
                ]);

                // It was on the Brain Dump and has now been given a date in Google.
                $dump?->update(['assigned_item_id' => $item->id, 'assigned_at' => now()]);
            }
        } finally {
            self::$applyingRemote = false;
        }
    }

    /**
     * @param  array{title: string, starred: bool, notes: string|null, due_time: string|null, due_date: string|null, done: bool}  $remote
     * @param  array<string, mixed>  $task
     */
    private function updateItem(Item $item, GoogleTaskList $list, array $remote, ?string $etag, array $task, bool $deleted): void
    {
        // Our own push coming back around.
        if ($etag !== null && $etag === $item->google_etag && ! $deleted) {
            return;
        }

        $remoteTime = isset($task['updated']) ? CarbonImmutable::parse($task['updated']) : now();

        // Changed on both sides: the later change wins. A local change that
        // is newer stays, and goes to Google on the next push.
        if ($item->sync_state === SyncState::Dirty && $item->updated_at->gt($remoteTime)) {
            Log::info('Google Tasks conflict: kept the planner\'s newer version.', ['item' => $item->id, 'task' => $task['id']]);

            return;
        }

        if ($item->sync_state === SyncState::Dirty) {
            Log::info('Google Tasks conflict: took Google\'s newer version.', ['item' => $item->id, 'task' => $task['id']]);
        }

        if ($deleted) {
            $item->forceFill(['google_task_id' => null, 'google_etag' => null, 'sync_state' => SyncState::Clean])->save();
            $item->delete();

            return;
        }

        if ($item->trashed()) {
            $item->restore();
        }

        $item->forceFill([
            'title' => $remote['title'],
            'notes' => $remote['notes'],
            'starred' => $remote['starred'],
            'due_time' => $remote['due_time'],
            // A dropped task that Google still shows open stays dropped until
            // it is finished or reopened there.
            'status' => $remote['done'] ? ItemStatus::Done : ($item->status === ItemStatus::Done ? ItemStatus::Open : $item->status),
            'category_id' => $list->category_id,
            'google_task_list_id' => $list->id,
            'google_etag' => $etag,
            'google_updated_at' => $remoteTime,
            'sync_state' => SyncState::Clean,
            'sync_error' => null,
        ]);

        // A task whose date was cleared in Google keeps its day in the planner.
        if ($remote['due_date'] !== null) {
            $item->forceFill(['period_key' => $remote['due_date'], 'due_date' => $remote['due_date']]);
        }

        $item->save();
    }

    /** Send every item of this account's that is waiting to go to Google. */
    public function pushPending(GoogleAccount $account): void
    {
        $today = CarbonImmutable::now($account->user->timezone)->toDateString();
        $horizon = CarbonImmutable::parse($today)->addDays(self::REPEAT_WINDOW_DAYS)->toDateString();

        Item::withTrashed()->withoutGlobalScope('household')
            ->where('household_id', $account->user->household_id)
            ->where('scope', Scope::Day)
            ->where(fn (Builder $q) => $q
                ->where('assignee_user_id', $account->user_id)
                ->orWhere(fn (Builder $q) => $q->whereNull('assignee_user_id')->where('created_by', $account->user_id)))
            ->where(fn (Builder $q) => $q
                // Changed since it was last sent…
                ->where('sync_state', SyncState::Dirty)
                // …or open, upcoming and never sent.
                ->orWhere(fn (Builder $q) => $q
                    ->whereNull('google_task_id')
                    ->whereNull('deleted_at')
                    ->where('status', ItemStatus::Open)
                    ->whereDate('due_date', '>=', $today)))
            // Occurrences of a repeating task go out a week ahead, not sixty days.
            ->where(fn (Builder $q) => $q
                ->whereNotNull('google_task_id')
                ->orWhereNull('recurrence_rule')
                ->orWhereDate('due_date', '<=', $horizon))
            ->orderBy('due_date')
            ->limit(500)
            ->get()
            ->each(fn (Item $item) => $this->pushItem($item, $account));
    }

    /** Create, update or delete the Google task for one item. */
    public function pushItem(Item $item, ?GoogleAccount $account = null): void
    {
        $account ??= self::accountFor($item);

        if ($account === null || ! $account->canSyncTasks() || $item->scope !== Scope::Day) {
            return;
        }

        $list = $account->taskLists->firstWhere('category_id', $item->category_id);
        $gone = $item->trashed() || $item->status === ItemStatus::Dropped;
        $current = $item->google_task_list_id !== null
            ? $account->taskLists->firstWhere('id', $item->google_task_list_id)
            : null;

        self::$applyingRemote = true;

        try {
            // Deleted or dropped here, or its category has no list any more.
            if ($gone || $list === null) {
                $this->deleteRemote($account, $current, $item);
                $item->forceFill(['google_task_id' => null, 'google_task_list_id' => null, 'google_etag' => null]);
            } else {
                // Google can't move a task between lists; remove and re-create.
                if ($current !== null && $current->id !== $list->id) {
                    $this->deleteRemote($account, $current, $item);
                    $item->google_task_id = null;
                }

                $body = TaskFormat::encode($item);

                try {
                    $task = $item->google_task_id === null
                        ? $this->tasks->insertTask($account, $list->google_list_id, $body)
                        : $this->tasks->patchTask($account, $list->google_list_id, $item->google_task_id, $body);
                } catch (GoogleNotFoundException) {
                    // It was deleted in Google and the poll hasn't seen that yet.
                    $task = $this->tasks->insertTask($account, $list->google_list_id, $body);
                }

                $item->forceFill([
                    'google_task_id' => $task['id'],
                    'google_task_list_id' => $list->id,
                    'google_etag' => $task['etag'] ?? null,
                    'google_updated_at' => $task['updated'] ?? now(),
                ]);
            }

            $item->forceFill(['sync_state' => SyncState::Clean, 'sync_error' => null]);
            // Not a change to the task: leave "last edited" where it was.
            $item->timestamps = false;
            $item->save();
        } catch (GoogleAuthException $e) {
            $account->update(['needs_reconnect' => true]);
        } catch (Throwable $e) {
            report($e);
            $item->timestamps = false;
            $item->forceFill(['sync_state' => SyncState::Error, 'sync_error' => mb_substr($e->getMessage(), 0, 500)])->save();
        } finally {
            $item->timestamps = true;
            self::$applyingRemote = false;
        }
    }

    /** The Google account an item syncs to: its assignee's, or its creator's when it is for both. */
    public static function accountFor(Item $item): ?GoogleAccount
    {
        return GoogleAccount::where('user_id', $item->assignee_user_id ?? $item->created_by)->first();
    }

    private function deleteRemote(GoogleAccount $account, ?GoogleTaskList $list, Item $item): void
    {
        if ($list === null || $item->google_task_id === null) {
            return;
        }

        try {
            $this->tasks->deleteTask($account, $list->google_list_id, $item->google_task_id);
        } catch (GoogleNotFoundException) {
            // Already gone.
        }
    }
}
