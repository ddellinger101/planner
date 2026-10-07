<?php

namespace App\Http\Controllers\Api;

use App\Enums\Scope;
use App\Enums\SyncState;
use App\Http\Controllers\Controller;
use App\Models\GoogleAccount;
use App\Models\GoogleTaskList;
use App\Models\ImportantDate;
use App\Models\Item;
use App\Services\Google\BirthdaySync;
use App\Services\Google\GoogleAuthException;
use App\Services\Google\GoogleClient;
use App\Services\Google\TaskSync;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * The signed-in person's Google connection: its status, which Google Tasks
 * list each category uses, and a manual "sync now".
 */
class GoogleController extends Controller
{
    public function __construct(private TaskSync $tasks, private BirthdaySync $birthdays) {}

    public function show(Request $request): JsonResponse
    {
        $account = $request->user()->googleAccount;
        $mine = fn () => Item::withTrashed()
            ->where('scope', Scope::Day)
            ->where(fn ($q) => $q
                ->where('assignee_user_id', $request->user()->id)
                ->orWhere(fn ($q) => $q->whereNull('assignee_user_id')->where('created_by', $request->user()->id)));

        return response()->json([
            'email' => $account?->email,
            'tasks_connected' => (bool) $account?->canSyncTasks(),
            'contacts_connected' => (bool) $account?->hasGranted(GoogleClient::SCOPE_CONTACTS),
            'needs_reconnect' => (bool) $account?->needs_reconnect,
            'sync_birthdays' => (bool) ($account?->sync_birthdays ?? true),
            'tasks_last_synced_at' => $account?->tasks_last_synced_at,
            'birthdays_synced_at' => $account?->birthdays_synced_at,
            'birthday_count' => ImportantDate::where('source', BirthdaySync::SOURCE)
                ->where('owner_user_id', $request->user()->id)->count(),
            'pending' => $account?->canSyncTasks() ? $mine()->where('sync_state', SyncState::Dirty)->count() : 0,
            'errors' => $account ? $mine()->where('sync_state', SyncState::Error)->count() : 0,
            'lists' => $account?->taskLists()->orderBy('title')->get(['id', 'title', 'category_id']) ?? [],
        ]);
    }

    /** Re-read the account's task lists from Google. */
    public function refreshLists(Request $request): JsonResponse
    {
        return $this->withAccount($request, fn (GoogleAccount $account) => $this->tasks->refreshLists($account));
    }

    /** Create a Google list for each category that has none. */
    public function createMissingLists(Request $request): JsonResponse
    {
        return $this->withAccount($request, fn (GoogleAccount $account) => $this->tasks->createMissingLists($account));
    }

    /** Choose which category a list belongs to, or none. */
    public function updateList(Request $request, int $list): JsonResponse
    {
        $account = $request->user()->googleAccount;
        $taskList = GoogleTaskList::where('google_account_id', $account?->id)->findOrFail($list);

        $categoryId = $request->validate([
            'category_id' => ['present', 'nullable', 'integer', Rule::exists('categories', 'id')],
        ])['category_id'];

        if ($categoryId !== null) {
            // A category uses one list: taking it frees it from any other.
            $account->taskLists()->where('category_id', $categoryId)->whereKeyNot($taskList->id)->update(['category_id' => null]);
        }

        // A newly mapped list gets a full import on the next sync.
        $taskList->update(['category_id' => $categoryId, 'last_synced_at' => null]);

        return $this->show($request);
    }

    public function update(Request $request): JsonResponse
    {
        $data = $request->validate(['sync_birthdays' => ['required', 'boolean']]);
        $account = $request->user()->googleAccount;

        abort_if($account === null, 409, 'Google is not connected.');

        $account->update($data);
        // Turning birthdays off removes them straight away; on fetches them.
        $this->birthdays->syncAccount($account);

        return $this->show($request);
    }

    /** Sync now, without waiting for the next poll. */
    public function sync(Request $request): JsonResponse
    {
        return $this->withAccount($request, function (GoogleAccount $account) {
            $this->tasks->syncAccount($account);
            $this->birthdays->syncAccount($account->refresh());
        });
    }

    private function withAccount(Request $request, callable $work): JsonResponse
    {
        $account = $request->user()->googleAccount;

        abort_if($account === null || $account->refresh_token === null, 409, 'Google is not connected.');

        try {
            $work($account);
        } catch (GoogleAuthException) {
            $account->update(['needs_reconnect' => true]);
        }

        return $this->show($request);
    }
}
