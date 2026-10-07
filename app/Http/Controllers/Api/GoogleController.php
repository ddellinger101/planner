<?php

namespace App\Http\Controllers\Api;

use App\Enums\CalendarRole;
use App\Enums\Scope;
use App\Enums\SyncState;
use App\Http\Controllers\Controller;
use App\Jobs\SyncGoogleAccount;
use App\Models\GoogleAccount;
use App\Models\GoogleCalendar;
use App\Models\GoogleTaskList;
use App\Models\ImportantDate;
use App\Models\Item;
use App\Services\Google\BirthdaySync;
use App\Services\Google\CalendarSync;
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
    public function __construct(private TaskSync $tasks, private BirthdaySync $birthdays, private CalendarSync $calendar) {}

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
            'pending' => $account?->canSyncTasks() ? $this->tasks->pending($account)->count() : 0,
            'errors' => $account ? $mine()->where('sync_state', SyncState::Error)->count() : 0,
            'lists' => $account?->taskLists()->orderBy('title')->get(['id', 'title', 'category_id']) ?? [],
            'calendar_connected' => (bool) $account?->canSyncCalendar(),
            'calendar_last_synced_at' => $account?->calendar_last_synced_at,
            'calendars' => $account?->calendars()->orderByDesc('is_primary')->orderBy('summary')->get()
                ->map(fn (GoogleCalendar $calendar) => [
                    'id' => $calendar->id,
                    'summary' => $calendar->summary,
                    'color' => $calendar->color,
                    'is_primary' => $calendar->is_primary,
                    'writable' => $calendar->isWritable(),
                    'mode' => $calendar->mode(),
                ]) ?? [],
            'shared_calendars' => $this->sharedCalendars($request),
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

    /** Re-read the account's calendars from Google. */
    public function refreshCalendars(Request $request): JsonResponse
    {
        return $this->withAccount($request, fn (GoogleAccount $account) => $this->calendar->refreshCalendars($account));
    }

    /** Show a calendar's events, read it as Chef's Menu calendar, or hide it. */
    public function updateCalendar(Request $request, int $calendar): JsonResponse
    {
        $account = $request->user()->googleAccount;
        $row = GoogleCalendar::where('google_account_id', $account?->id)->findOrFail($calendar);

        $mode = $request->validate(['mode' => ['required', Rule::in(['hidden', 'events', 'menu'])]])['mode'];

        $this->calendar->setMode($row, $mode);

        // Its events arrive with the next run of the queue, within a minute.
        SyncGoogleAccount::dispatch($account->id);

        return $this->show($request);
    }

    /** Show or hide, for the signed-in person only, a calendar someone else in the household shows. */
    public function updateSharedCalendar(Request $request, int $calendar): JsonResponse
    {
        $user = $request->user();
        $row = GoogleCalendar::whereHas('googleAccount.user', fn ($q) => $q
            ->where('household_id', $user->household_id)->whereKeyNot($user->id))
            ->findOrFail($calendar);

        $visible = $request->validate(['visible' => ['required', 'boolean']])['visible'];

        $visible ? $user->hiddenCalendars()->detach($row->id) : $user->hiddenCalendars()->syncWithoutDetaching([$row->id]);

        return $this->show($request);
    }

    /**
     * The calendars other people in the household show in the planner,
     * and whether the signed-in person sees each one.
     *
     * @return list<array<string, mixed>>
     */
    private function sharedCalendars(Request $request): array
    {
        $user = $request->user();
        $hidden = $user->hiddenCalendars()->pluck('google_calendars.id')->all();

        return GoogleCalendar::with('googleAccount.user')
            ->where('sync_enabled', true)
            ->where('role', '!=', CalendarRole::Menu)
            ->whereHas('googleAccount.user', fn ($q) => $q
                ->where('household_id', $user->household_id)->whereKeyNot($user->id))
            ->orderByDesc('is_primary')
            ->orderBy('summary')
            ->get()
            ->map(fn (GoogleCalendar $calendar) => [
                'id' => $calendar->id,
                'summary' => $calendar->summary,
                'color' => $calendar->color,
                'owner_user_id' => $calendar->googleAccount->user_id,
                'visible' => ! in_array($calendar->id, $hidden, true),
            ])
            ->all();
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
            $this->calendar->syncAccount($account->refresh());
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
