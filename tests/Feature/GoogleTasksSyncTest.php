<?php

use App\Enums\SyncState;
use App\Models\BrainDumpItem;
use App\Models\Category;
use App\Models\GoogleAccount;
use App\Models\Item;
use App\Models\Reward;
use App\Models\User;
use App\Services\Google\GoogleClient;
use App\Services\Google\GoogleContactsService;
use App\Services\Google\GoogleTasksService;
use App\Services\Google\TaskSync;
use App\Services\RecurrenceService;
use Tests\Fakes\FakeGoogleContacts;
use Tests\Fakes\FakeGoogleTasks;

beforeEach(function () {
    // Monday, midday in New York.
    $this->travelTo('2027-01-04 17:00:00');

    $this->google = new FakeGoogleTasks;
    $this->app->instance(GoogleTasksService::class, $this->google);
    $this->app->instance(GoogleContactsService::class, new FakeGoogleContacts);

    foreach (['Home', 'Finance', 'Health', 'Family', 'Only 4 You', 'Get It Done', 'My Tasks'] as $title) {
        $this->google->addList($title);
    }

    $this->user = signIn();
    $this->account = connect($this->user);
    $this->sync = app(TaskSync::class);
    $this->sync->refreshLists($this->account);
    $this->account->refresh();
});

function connect(User $user): GoogleAccount
{
    return GoogleAccount::create([
        'user_id' => $user->id, 'google_sub' => 'sub-'.$user->id, 'email' => $user->email,
        'refresh_token' => 'refresh', 'access_token' => 'access', 'expires_at' => now()->addHour(),
        'scopes' => [GoogleClient::SCOPE_TASKS, GoogleClient::SCOPE_CONTACTS],
    ]);
}

function category(string $slug): int
{
    return Category::where('slug', $slug)->value('id');
}

/** Create a day task through the API and return it. */
function task(array $attributes = []): Item
{
    $id = test()->postJson('/api/items', [
        'title' => 'Morning run', 'category_id' => category('health'), 'scope' => 'day', 'period_key' => '2027-01-04',
        ...$attributes,
    ])->assertCreated()->json('id');

    return Item::find($id);
}

/** Let time pass and run the poll, as the scheduler would. */
function poll(int $minutes = 5): void
{
    test()->travel($minutes)->minutes();
    test()->sync->syncAccount(test()->account->refresh());
}

describe('lists', function () {
    it('matches Google lists to categories by name, including the two that differ', function () {
        $mapped = $this->account->taskLists()->get()->mapWithKeys(
            fn ($list) => [$list->title => Category::find($list->category_id)?->slug],
        );

        expect($mapped->all())->toBe([
            'Home' => 'home', 'Finance' => 'finances', 'Health' => 'health', 'Family' => 'family',
            'Only 4 You' => 'only-4-you', 'Get It Done' => 'other', 'My Tasks' => null,
        ]);
    });

    it('keeps a mapping made by hand and drops lists deleted in Google', function () {
        $mine = $this->account->taskLists()->where('title', 'My Tasks')->first();
        $this->patchJson("/api/google/lists/{$mine->id}", ['category_id' => category('other')])->assertOk();
        unset($this->google->lists[$this->google->listId('Family')]);

        $this->sync->refreshLists($this->account);

        expect($mine->refresh()->category_id)->toBe(category('other'))
            // The category has one list: Get It Done gave it up.
            ->and($this->account->taskLists()->where('title', 'Get It Done')->value('category_id'))->toBeNull()
            ->and($this->account->taskLists()->where('title', 'Family')->exists())->toBeFalse();
    });

    it('creates a list for each category that has none', function () {
        $this->account->taskLists()->whereIn('title', ['Family', 'Get It Done'])->update(['category_id' => null]);

        $this->postJson('/api/google/lists/create-missing')->assertOk();

        expect(collect($this->google->lists)->pluck('title')->all())->toContain('Other')
            ->and($this->account->taskLists()->whereNotNull('category_id')->count())->toBe(6);
    });
});

describe('planner to Google', function () {
    it('creates a Google task in the category\'s list', function () {
        $item = task(['due_time' => '06:30', 'starred' => true, 'notes' => 'Around the lake']);

        expect($this->google->only('Health'))->toMatchArray([
            'title' => '⭐ Morning run',
            'notes' => "⏰ 6:30 AM\nAround the lake",
            'due' => '2027-01-04T00:00:00.000Z',
            'status' => 'needsAction',
        ]);

        expect($item->google_task_id)->not->toBeNull()
            ->and($item->sync_state)->toBe(SyncState::Clean);
    });

    it('sends edits, completion and reopening', function () {
        $item = task();

        $this->patchJson("/api/items/{$item->id}", ['title' => 'Evening run', 'status' => 'done']);
        expect($this->google->only('Health'))->toMatchArray(['title' => 'Evening run', 'status' => 'completed']);

        $this->patchJson("/api/items/{$item->id}", ['status' => 'open']);
        expect($this->google->only('Health'))->toMatchArray(['status' => 'needsAction'])
            ->and($this->google->writes)->toBe(['insert', 'patch', 'patch']);
    });

    it('moves the Google task when the day changes', function () {
        $item = task();

        $this->patchJson("/api/items/{$item->id}", ['period_key' => '2027-01-06']);

        expect($this->google->only('Health')['due'])->toBe('2027-01-06T00:00:00.000Z');
    });

    it('moves it to another list when the category changes', function () {
        $item = task();

        $this->patchJson("/api/items/{$item->id}", ['category_id' => category('home')]);

        expect($this->google->titles('Health'))->toBe([])
            ->and($this->google->titles('Home'))->toBe(['Morning run'])
            ->and($item->refresh()->google_task_list_id)
            ->toBe($this->account->taskLists()->where('title', 'Home')->value('id'));
    });

    it('removes the Google task when the item is deleted or dropped', function () {
        $deleted = task();
        $dropped = task(['title' => 'Stretch']);

        $this->deleteJson("/api/items/{$deleted->id}");
        $this->patchJson("/api/items/{$dropped->id}", ['status' => 'dropped']);

        expect($this->google->titles('Health'))->toBe([])
            ->and($dropped->refresh()->google_task_id)->toBeNull();
    });

    it('leaves goals in the planner', function () {
        $this->postJson('/api/items', [
            'title' => 'Run a 10k', 'category_id' => category('health'), 'scope' => 'month', 'period_key' => '2027-01',
        ])->assertCreated();

        expect($this->google->writes)->toBe([]);
    });

    it('sends a task to its assignee\'s account, or the creator\'s when it is for both', function () {
        $liz = User::factory()->create(['household_id' => $this->user->household_id]);

        task(['title' => 'Hers', 'assignee_user_id' => $liz->id]);
        task(['title' => 'Ours', 'assignee_user_id' => null]);

        // Elizabeth hasn't connected Google, so hers stays in the planner.
        expect($this->google->titles('Health'))->toBe(['Ours']);
    });

    it('re-creates a task that was deleted in Google before the poll noticed', function () {
        $item = task();
        $this->google->remoteEdit($this->google->listId('Health'), $item->google_task_id, ['deleted' => true]);

        $this->patchJson("/api/items/{$item->id}", ['title' => 'Still on']);

        expect($this->google->titles('Health'))->toBe(['Still on']);
    });

    it('sends what already existed once Google is connected', function () {
        $this->account->update(['refresh_token' => null]);
        task(['title' => 'Before connecting']);
        task(['title' => 'Old news', 'period_key' => '2027-01-02']);
        expect($this->google->writes)->toBe([]);

        $this->account->update(['refresh_token' => 'refresh']);
        poll();

        // Today's and later, not the backlog.
        expect($this->google->titles('Health'))->toBe(['Before connecting']);
    });
});

describe('Google to planner', function () {
    it('brings a dated task onto its day, in the list\'s category', function () {
        $this->google->remoteAdd($this->google->listId('Finance'), [
            'title' => '⭐ Pay the electric bill', 'notes' => "⏰ 3:30 PM\nAccount 1234", 'due' => '2027-01-06T00:00:00.000Z',
        ]);

        poll();

        expect(Item::sole()->only(['title', 'starred', 'notes', 'due_time', 'period_key', 'category_id', 'assignee_user_id', 'created_by']))
            ->toBe([
                'title' => 'Pay the electric bill', 'starred' => true, 'notes' => 'Account 1234', 'due_time' => '15:30',
                'period_key' => '2027-01-06', 'category_id' => category('finances'),
                'assignee_user_id' => $this->user->id, 'created_by' => $this->user->id,
            ])
            ->and(Item::sole()->source->value)->toBe('google_tasks')
            // Importing it must not send it straight back.
            ->and($this->google->writes)->toBe([]);
    });

    it('puts a task with no date on the Brain Dump, then on its day once Google gives it one', function () {
        $list = $this->google->listId('Get It Done');
        $remote = $this->google->remoteAdd($list, ['title' => 'Find the spare keys']);

        poll();
        poll(); // seeing it again changes nothing

        expect(Item::count())->toBe(0)
            ->and(BrainDumpItem::sole()->only(['bucket', 'title']))->toMatchArray(['title' => 'Find the spare keys'])
            ->and(BrainDumpItem::sole()->bucket->value)->toBe('other');

        $this->google->remoteEdit($list, $remote['id'], ['due' => '2027-01-08T00:00:00.000Z']);
        poll();

        expect(Item::sole()->period_key)->toBe('2027-01-08')
            ->and(BrainDumpItem::sole()->assigned_item_id)->toBe(Item::sole()->id);
        $this->getJson('/api/brain-dump')->assertJsonCount(0, 'items');
    });

    it('gives the Google task a date when its Brain Dump item is added to the plan', function () {
        $this->google->remoteAdd($this->google->listId('Home'), ['title' => 'Fix the gate']);
        poll();

        $this->postJson('/api/brain-dump/'.BrainDumpItem::sole()->id.'/assign', ['period_key' => '2027-01-05'])->assertCreated();

        // The same task, now dated: not a second one.
        expect($this->google->only('Home'))->toMatchArray(['title' => 'Fix the gate', 'due' => '2027-01-05T00:00:00.000Z'])
            ->and($this->google->writes)->toBe(['patch']);
    });

    it('removes a Brain Dump item that was finished or deleted in Google', function () {
        $list = $this->google->listId('Home');
        $done = $this->google->remoteAdd($list, ['title' => 'Done there']);
        $gone = $this->google->remoteAdd($list, ['title' => 'Deleted there']);
        poll();

        $this->google->remoteEdit($list, $done['id'], ['status' => 'completed']);
        $this->google->remoteEdit($list, $gone['id'], ['deleted' => true]);
        poll();

        expect(BrainDumpItem::count())->toBe(0);
    });

    it('applies edits, completion and deletion made in Google', function () {
        $item = task();
        $other = task(['title' => 'Stretch']);
        $list = $this->google->listId('Health');

        $this->google->remoteEdit($list, $item->google_task_id, ['title' => 'Long run', 'status' => 'completed']);
        $this->google->remoteEdit($list, $other->google_task_id, ['deleted' => true]);
        poll();

        expect($item->refresh()->only(['title']))->toBe(['title' => 'Long run'])
            ->and($item->status->value)->toBe('done')
            ->and($item->completed_at)->not->toBeNull()
            ->and(Item::find($other->id))->toBeNull()
            ->and(Item::withTrashed()->find($other->id)->trashed())->toBeTrue();
    });

    it('earns a reward when its last task is finished in Google', function () {
        $item = task();
        $reward = Reward::create(['created_by' => $this->user->id, 'title' => 'Treat', 'deadline' => '2027-01-10 00:00:00']);
        $reward->items()->attach($item->id);

        $this->google->remoteEdit($this->google->listId('Health'), $item->google_task_id, ['status' => 'completed']);
        poll();

        expect($reward->refresh()->status->value)->toBe('earned');
    });

    it('keeps a planner task on its day when Google clears its date', function () {
        $item = task();

        $this->google->remoteEdit($this->google->listId('Health'), $item->google_task_id, ['due' => null, 'title' => 'Renamed']);
        poll();

        expect($item->refresh()->only(['title', 'period_key']))->toBe(['title' => 'Renamed', 'period_key' => '2027-01-04'])
            ->and(BrainDumpItem::count())->toBe(0);
    });

    it('imports only open tasks the first time, and skips finished strangers afterwards', function () {
        $list = $this->google->listId('Health');
        $this->google->remoteAdd($list, ['title' => 'Old and done', 'due' => '2026-12-01T00:00:00.000Z', 'status' => 'completed']);
        $this->google->remoteAdd($list, ['title' => 'Still open', 'due' => '2027-01-05T00:00:00.000Z']);
        poll();

        $this->google->remoteAdd($list, ['title' => 'Added and finished', 'due' => '2027-01-05T00:00:00.000Z', 'status' => 'completed']);
        poll();

        expect(Item::pluck('title')->all())->toBe(['Still open']);
    });

    it('ignores lists that aren\'t mapped to a category', function () {
        $this->google->remoteAdd($this->google->listId('My Tasks'), ['title' => 'Elsewhere', 'due' => '2027-01-05T00:00:00.000Z']);

        poll();

        expect(Item::count())->toBe(0);
    });
});

describe('keeping the two in step', function () {
    it('does not echo its own change back and forth', function () {
        $item = task();
        $updatedAt = $item->updated_at;

        poll();
        poll();

        expect($this->google->writes)->toBe(['insert'])
            ->and($item->refresh()->updated_at->eq($updatedAt))->toBeTrue()
            ->and($item->sync_state)->toBe(SyncState::Clean);
    });

    it('lets the later change win when both sides changed', function () {
        $list = $this->google->listId('Health');
        $newerHere = task(['title' => 'A']);
        $newerThere = task(['title' => 'B']);

        // Google is down, so changes made here pile up unsent.
        $this->google->revoked = true;
        $this->google->tasks[$list][$newerHere->google_task_id]['title'] = 'A (Google)';
        $this->google->tasks[$list][$newerHere->google_task_id]['etag'] = 'changed-1';
        $this->travel(1)->minutes();
        $this->patchJson("/api/items/{$newerHere->id}", ['title' => 'A (planner)']);
        $this->patchJson("/api/items/{$newerThere->id}", ['title' => 'B (planner)']);

        $this->google->revoked = false;
        // Reconnecting clears the flag the failed push set.
        $this->account->refresh()->update(['needs_reconnect' => false]);
        $this->travel(1)->minutes();
        $this->google->remoteEdit($list, $newerThere->google_task_id, ['title' => 'B (Google)']);
        poll(1);

        expect($newerHere->refresh()->title)->toBe('A (planner)')
            ->and($newerThere->refresh()->title)->toBe('B (Google)')
            ->and($this->google->titles('Health'))->toEqualCanonicalizing(['A (planner)', 'B (Google)'])
            ->and(Item::where('sync_state', '!=', 'clean')->count())->toBe(0);
    });

    it('sends occurrences of a repeating task a week ahead, and more as days pass', function () {
        task(['title' => 'Take vitamins', 'recurrence_rule' => 'FREQ=DAILY']);

        // Today plus the next seven days; the other 53 wait.
        expect($this->google->titles('Health'))->toHaveCount(8)
            ->and(Item::count())->toBe(61);

        $this->travel(2)->days();
        app(RecurrenceService::class)->generateAll();
        poll();

        expect($this->google->titles('Health'))->toHaveCount(10);
    });

    it('counts as waiting only what a sync would send', function () {
        task(['title' => 'Take vitamins', 'recurrence_rule' => 'FREQ=DAILY']);

        // The 53 later occurrences aren't waiting; they simply aren't due to go yet.
        $this->getJson('/api/google')->assertOk()->assertJsonPath('pending', 0);

        $this->travel(2)->days();
        app(RecurrenceService::class)->generateAll();

        $this->getJson('/api/google')->assertJsonPath('pending', 2);
    });

    it('stops and asks to reconnect when Google revokes access, then catches up', function () {
        $this->google->revoked = true;
        $item = task();

        expect($this->account->refresh()->needs_reconnect)->toBeTrue()
            ->and($item->refresh()->sync_state)->toBe(SyncState::Dirty);

        $this->getJson('/api/google')->assertJson(['needs_reconnect' => true, 'tasks_connected' => false]);

        // Reconnecting clears the flag; the waiting change then goes out.
        $this->google->revoked = false;
        $this->account->update(['needs_reconnect' => false]);
        poll();

        expect($this->google->titles('Health'))->toBe(['Morning run'])
            ->and($item->refresh()->sync_state)->toBe(SyncState::Clean);
    });

    it('records an error on the item when Google rejects it, and tries again later', function () {
        $failing = new class extends FakeGoogleTasks
        {
            public bool $broken = true;

            public function insertTask($account, string $listId, array $task): array
            {
                if ($this->broken) {
                    throw new RuntimeException('Backend error');
                }

                return parent::insertTask($account, $listId, $task);
            }
        };
        $failing->lists = $this->google->lists;
        $failing->tasks = $this->google->tasks;
        $this->app->instance(GoogleTasksService::class, $failing);
        $this->sync = app(TaskSync::class);

        $item = task();
        expect($item->sync_state)->toBe(SyncState::Error)
            ->and($item->sync_error)->toBe('Backend error');
        $this->getJson('/api/google')->assertJson(['errors' => 1]);

        $failing->broken = false;
        poll();

        expect($item->refresh()->sync_state)->toBe(SyncState::Clean)
            ->and($failing->titles('Health'))->toBe(['Morning run']);
    });
});

describe('the settings API', function () {
    it('describes the connection', function () {
        task();

        $this->getJson('/api/google')
            ->assertOk()
            ->assertJson([
                'email' => $this->user->email, 'tasks_connected' => true, 'contacts_connected' => true,
                'needs_reconnect' => false, 'sync_birthdays' => true, 'pending' => 0, 'errors' => 0,
            ])
            ->assertJsonCount(7, 'lists')
            ->assertJsonMissingPath('refresh_token');
    });

    it('reports someone who has only signed in as not connected', function () {
        $this->actingAs(User::factory()->create(['household_id' => $this->user->household_id]));

        $this->getJson('/api/google')->assertJson(['email' => null, 'tasks_connected' => false, 'lists' => []]);
        $this->postJson('/api/google/sync')->assertConflict();
    });

    it('syncs on request', function () {
        $this->google->remoteAdd($this->google->listId('Home'), ['title' => 'Water the plants', 'due' => '2027-01-04T00:00:00.000Z']);

        $this->postJson('/api/google/sync')->assertOk();

        expect(Item::sole()->title)->toBe('Water the plants')
            ->and($this->account->refresh()->tasks_last_synced_at)->not->toBeNull();
    });

    it('can\'t remap another person\'s list', function () {
        $liz = User::factory()->create(['household_id' => $this->user->household_id]);
        $hers = connect($liz)->taskLists()->create(['google_list_id' => 'x', 'title' => 'Hers']);

        $this->patchJson("/api/google/lists/{$hers->id}", ['category_id' => null])->assertNotFound();
    });
});
