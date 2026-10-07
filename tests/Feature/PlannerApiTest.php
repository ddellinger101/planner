<?php

use App\Models\BrainDumpItem;
use App\Models\Category;
use App\Models\GoogleAccount;
use App\Models\GoogleCalendar;
use App\Models\Habit;
use App\Models\Item;
use App\Models\MealEntry;
use App\Models\Reward;
use App\Models\User;
use App\Models\WeightEntry;

describe('journal', function () {
    it('saves, updates and clears an entry', function () {
        signIn();

        $this->putJson('/api/journal/2027-01-04/gratitude', ['body' => 'Coffee'])
            ->assertOk()->assertJson(['type' => 'gratitude', 'body' => 'Coffee', 'carried' => false]);
        $this->putJson('/api/journal/2027-01-04/gratitude', ['body' => 'Sunshine'])->assertOk();

        $this->getJson('/api/journal?period_key=2027-01-04')
            ->assertJsonCount(1)->assertJsonPath('0.body', 'Sunshine');

        $this->putJson('/api/journal/2027-01-04/gratitude', ['body' => ''])->assertOk();
        $this->getJson('/api/journal?period_key=2027-01-04')->assertJsonCount(0);
    });

    it('carries the most recent affirmation forward until the day gets its own', function () {
        signIn();

        $this->putJson('/api/journal/2027-01-02/affirmation', ['body' => 'Older']);
        $this->putJson('/api/journal/2027-01-04/affirmation', ['body' => 'I finish what I start']);
        $this->putJson('/api/journal/2027-01-09/affirmation', ['body' => 'From the future']);

        $this->getJson('/api/journal?period_key=2027-01-06')
            ->assertJsonCount(1)
            ->assertJsonPath('0', [
                'type' => 'affirmation', 'body' => 'I finish what I start', 'minutes' => null,
                'period_key' => '2027-01-04', 'carried' => true,
            ]);

        $this->putJson('/api/journal/2027-01-06/affirmation', ['body' => 'My own']);

        $this->getJson('/api/journal?period_key=2027-01-06')
            ->assertJsonCount(1)
            ->assertJsonPath('0.body', 'My own')
            ->assertJsonPath('0.carried', false);
    });

    it('has nothing to carry on the first day, and never carries into a week', function () {
        signIn();
        $this->putJson('/api/journal/2027-01-04/affirmation', ['body' => 'Later']);

        $this->getJson('/api/journal?period_key=2027-01-03')->assertJsonCount(0);
        $this->getJson('/api/journal?period_key=2027-W02')->assertJsonCount(0);
    });

    it('keeps each person\'s journal separate', function () {
        $dustin = signIn();
        $this->putJson('/api/journal/2027-01-04/affirmation', ['body' => 'Dustin']);
        $this->putJson('/api/journal/2027-W01/best_part', ['body' => 'The hike']);

        $this->actingAs(User::factory()->create(['household_id' => $dustin->household_id]));

        $this->getJson('/api/journal?period_key=2027-01-05')->assertJsonCount(0);
        $this->getJson('/api/journal?period_key=2027-W01')->assertJsonCount(0);
    });

    it('records meditation minutes and validates the route', function () {
        signIn();

        $this->putJson('/api/journal/2027-01-04/meditation', ['minutes' => 10])
            ->assertOk()->assertJson(['minutes' => 10]);
        $this->putJson('/api/journal/2027-01-04/doodle', ['body' => 'x'])->assertJsonValidationErrors('type');
        $this->putJson('/api/journal/nonsense/gratitude', ['body' => 'x'])->assertJsonValidationErrors('period_key');
    });
});

describe('weight', function () {
    it('keeps one entry per day and replaces it when logged again', function () {
        signIn();

        $this->postJson('/api/weight', ['date' => '2027-01-04', 'weight' => 182.4])->assertOk();
        $this->postJson('/api/weight', ['date' => '2027-01-04', 'weight' => 181.9])->assertOk();
        $this->postJson('/api/weight', ['date' => '2027-01-02', 'weight' => 183])->assertOk();

        $this->getJson('/api/weight')
            ->assertJsonCount(2)
            ->assertJsonPath('*.date', ['2027-01-02', '2027-01-04'])
            ->assertJsonPath('1.weight', 181.9)
            ->assertJsonPath('1.unit', 'lb');

        $this->getJson('/api/weight?from=2027-01-03&to=2027-01-31')->assertJsonCount(1);
    });

    it('is private to each person, even inside a household', function () {
        $dustin = signIn();
        $this->postJson('/api/weight', ['date' => '2027-01-04', 'weight' => 182.4]);
        $this->putJson('/api/weight/goals/2027-01', ['target_weight' => 178]);
        $entry = WeightEntry::sole();

        $this->actingAs(User::factory()->create(['household_id' => $dustin->household_id]));

        $this->getJson('/api/weight')->assertJsonCount(0);
        $this->getJson('/api/weight/goals')->assertJsonCount(0);
        $this->deleteJson("/api/weight/{$entry->id}")->assertNotFound();
        expect(WeightEntry::count())->toBe(1);
    });

    it('sets, changes and clears a goal for a period', function () {
        signIn();

        $this->putJson('/api/weight/goals/2027-Q1', ['target_weight' => 175])
            ->assertOk()->assertJson(['scope' => 'quarter', 'period_key' => '2027-Q1', 'target_weight' => 175]);
        $this->putJson('/api/weight/goals/2027-Q1', ['target_weight' => 174.5])->assertOk();
        $this->putJson('/api/weight/goals/2027-01', ['target_weight' => 178])->assertOk();

        $this->getJson('/api/weight/goals')->assertJsonCount(2);
        $this->getJson('/api/weight/goals?period_keys[]=2027-Q1')
            ->assertJsonCount(1)->assertJsonPath('0.target_weight', 174.5);

        $this->putJson('/api/weight/goals/2027-Q1', ['target_weight' => null])->assertOk();
        $this->getJson('/api/weight/goals')->assertJsonCount(1);
    });

    it('does not allow a goal for a single day', function () {
        signIn();

        $this->putJson('/api/weight/goals/2027-01-04', ['target_weight' => 175])
            ->assertJsonValidationErrors('period_key');
    });
});

describe('habits', function () {
    it('creates a habit and checks days on and off', function () {
        $user = signIn();

        $id = $this->postJson('/api/habits', ['title' => 'Stretch', 'routine' => 'morning', 'active_from' => '2027-01-01'])
            ->assertCreated()
            ->assertJson(['user_id' => $user->id, 'routine' => 'morning', 'target_per_week' => 7])
            ->json('id');

        $this->putJson("/api/habits/{$id}/checks/2027-01-04", ['done' => true])->assertOk();
        $this->putJson("/api/habits/{$id}/checks/2027-01-04", ['done' => true])->assertOk();
        $this->putJson("/api/habits/{$id}/checks/2027-01-05", ['done' => true])->assertOk();
        $this->putJson("/api/habits/{$id}/checks/2027-01-05", ['done' => false])->assertOk();
        $this->putJson("/api/habits/{$id}/checks/2027-02-01", ['done' => true])->assertOk();

        $this->getJson('/api/habits?from=2027-01-04&to=2027-01-10')
            ->assertJsonCount(1)
            ->assertJsonPath('0.checks.*.date', ['2027-01-04']);
    });

    it('only lists habits that are active in the requested range', function () {
        $user = signIn();
        Habit::create(['user_id' => $user->id, 'title' => 'Ended', 'active_from' => '2026-01-01', 'active_to' => '2026-12-31']);
        Habit::create(['user_id' => $user->id, 'title' => 'Not yet', 'active_from' => '2027-06-01']);
        Habit::create(['user_id' => $user->id, 'title' => 'Current', 'active_from' => '2027-01-01']);

        $this->getJson('/api/habits?from=2027-01-04&to=2027-01-10')->assertJsonPath('*.title', ['Current']);
        $this->getJson('/api/habits')->assertJsonCount(3);
    });

    it('cannot touch another household\'s habit', function () {
        $stranger = User::factory()->create();
        $habit = Habit::create([
            'household_id' => $stranger->household_id, 'user_id' => $stranger->id,
            'title' => 'Theirs', 'active_from' => '2027-01-01',
        ]);

        signIn();

        $this->putJson("/api/habits/{$habit->id}/checks/2027-01-04", ['done' => true])->assertNotFound();
        $this->deleteJson("/api/habits/{$habit->id}")->assertNotFound();
    });
});

describe('brain dump', function () {
    it('adds an item to the plan with the bucket\'s default category', function (string $bucket, string $slug) {
        $user = signIn();
        $id = $this->postJson('/api/brain-dump', ['bucket' => $bucket, 'title' => 'Thing'])
            ->assertCreated()->json('id');

        $this->postJson("/api/brain-dump/{$id}/assign", ['period_key' => '2027-01-04'])
            ->assertCreated()
            ->assertJson([
                'title' => 'Thing',
                'scope' => 'day',
                'due_date' => '2027-01-04',
                'source' => 'brain_dump',
                'category_id' => Category::where('slug', $slug)->value('id'),
                'assignee_user_id' => $user->id,
            ]);
    })->with([
        ['health_habits', 'health'],
        ['kids_stuff', 'family'],
        ['only_4_you', 'only-4-you'],
        ['buy', 'home'],
        ['must_do', 'other'],
        ['call', 'other'],
    ]);

    it('takes assigned items off the board and counts them for the week', function () {
        signIn();
        $kept = $this->postJson('/api/brain-dump', ['bucket' => 'call', 'title' => 'Call mom'])->json('id');
        $sent = $this->postJson('/api/brain-dump', ['bucket' => 'buy', 'title' => 'Light bulbs'])->json('id');

        $this->postJson("/api/brain-dump/{$sent}/assign", [
            'period_key' => '2027-01-04', 'category_id' => Category::where('slug', 'finances')->value('id'),
            'due_time' => '15:30', 'starred' => true,
        ])->assertCreated()->assertJson(['starred' => true, 'due_time' => '15:30']);

        $this->getJson('/api/brain-dump')
            ->assertJsonPath('items.*.id', [$kept])
            ->assertJsonPath('assigned_this_week', 1);

        // It can't be added twice.
        $this->postJson("/api/brain-dump/{$sent}/assign", ['period_key' => '2027-01-05'])->assertConflict();
        expect(Item::count())->toBe(1);
    });

    it('can send an item to a week instead of a day', function () {
        signIn();
        $id = $this->postJson('/api/brain-dump', ['bucket' => 'should_do', 'title' => 'Plan trip'])->json('id');

        $this->postJson("/api/brain-dump/{$id}/assign", ['period_key' => '2027-W02', 'due_time' => '09:00'])
            ->assertCreated()
            ->assertJson(['scope' => 'week', 'period_key' => '2027-W02', 'due_date' => null, 'due_time' => null, 'assignee_user_id' => null]);
    });

    it('starts a repeating series when an item is added to the plan with a rule', function () {
        $this->travelTo('2027-01-04 17:00:00');
        signIn();
        $id = $this->postJson('/api/brain-dump', ['bucket' => 'health_habits', 'title' => 'Take vitamins'])->json('id');

        $this->postJson("/api/brain-dump/{$id}/assign", ['period_key' => '2027-01-04', 'recurrence_rule' => 'FREQ=DAILY'])
            ->assertCreated()
            ->assertJson(['recurrence_rule' => 'FREQ=DAILY', 'recurrence_date' => '2027-01-04']);

        expect(Item::count())->toBe(61);
    });

    it('rejects a bad rule, and ignores a rule on a goal', function () {
        signIn();
        $a = $this->postJson('/api/brain-dump', ['bucket' => 'call', 'title' => 'A'])->json('id');
        $b = $this->postJson('/api/brain-dump', ['bucket' => 'call', 'title' => 'B'])->json('id');

        $this->postJson("/api/brain-dump/{$a}/assign", ['period_key' => '2027-01-04', 'recurrence_rule' => 'FREQ=NEVER'])
            ->assertJsonValidationErrors('recurrence_rule');
        $this->postJson("/api/brain-dump/{$b}/assign", ['period_key' => '2027-W01', 'recurrence_rule' => 'FREQ=WEEKLY'])
            ->assertCreated()
            ->assertJson(['recurrence_rule' => null]);

        expect(Item::count())->toBe(1);
    });

    it('moves an item between buckets and is hidden from other households', function () {
        $stranger = User::factory()->create();
        $theirs = BrainDumpItem::create([
            'household_id' => $stranger->household_id, 'created_by' => $stranger->id, 'bucket' => 'call', 'title' => 'Theirs',
        ]);

        signIn();
        $id = $this->postJson('/api/brain-dump', ['bucket' => 'could_do', 'title' => 'Maybe'])->json('id');

        $this->patchJson("/api/brain-dump/{$id}", ['bucket' => 'must_do'])->assertOk()->assertJson(['bucket' => 'must_do']);
        $this->getJson('/api/brain-dump')->assertJsonCount(1, 'items');
        $this->postJson("/api/brain-dump/{$theirs->id}/assign", ['period_key' => '2027-01-04'])->assertNotFound();
    });
});

describe('rewards', function () {
    it('creates a reward linked to tasks and updates the list', function () {
        $user = signIn();
        [$a, $b, $c] = Item::factory()->ownedBy($user)->count(3)->create()->all();

        $id = $this->postJson('/api/rewards', [
            'title' => 'Movie night', 'description' => 'Pick any film', 'deadline' => '2027-01-10T23:59:00-05:00',
            'item_ids' => [$a->id, $b->id],
        ])
            ->assertCreated()
            ->assertJson(['status' => 'active', 'created_by' => $user->id, 'beneficiary_user_id' => null])
            ->assertJsonPath('items.*.id', [$a->id, $b->id])
            ->json('id');

        $this->patchJson("/api/rewards/{$id}", ['item_ids' => [$c->id]])
            ->assertOk()->assertJsonPath('items.*.id', [$c->id]);

        expect(Reward::sole()->deadline->toIso8601String())->toBe('2027-01-11T04:59:00+00:00');
    });

    it('treats a bare date as the end of that day in the user\'s timezone', function () {
        $user = signIn();
        $item = Item::factory()->ownedBy($user)->create();

        $this->postJson('/api/rewards', ['title' => 'Treat', 'deadline' => '2027-07-10', 'item_ids' => [$item->id]])
            ->assertCreated();

        // 23:59:59 on July 10 in New York (UTC-4 in summer).
        expect(Reward::sole()->deadline->toIso8601String())->toBe('2027-07-11T03:59:59+00:00');
    });

    it('needs at least one task from this household', function () {
        signIn();
        $theirs = Item::factory()->ownedBy(User::factory()->create())->create();

        $this->postJson('/api/rewards', ['title' => 'x', 'deadline' => '2027-01-10', 'item_ids' => []])
            ->assertJsonValidationErrors('item_ids');
        $this->postJson('/api/rewards', ['title' => 'x', 'deadline' => '2027-01-10', 'item_ids' => [$theirs->id]])
            ->assertJsonValidationErrors('item_ids.0');
    });

    it('can only be claimed once it has been earned', function () {
        $user = signIn();
        $reward = Reward::create(['created_by' => $user->id, 'title' => 'Treat', 'deadline' => '2027-01-10']);

        $this->postJson("/api/rewards/{$reward->id}/claim")->assertConflict();

        $reward->update(['status' => 'earned', 'earned_at' => now()]);

        $this->postJson("/api/rewards/{$reward->id}/claim")->assertOk()->assertJson(['status' => 'claimed']);
        expect($reward->refresh()->claimed_at)->not->toBeNull();
    });
});

describe('meals', function () {
    it('lists the household\'s cached meals for a date range, read-only', function () {
        $user = signIn();
        $account = GoogleAccount::create(['user_id' => $user->id, 'google_sub' => 'sub', 'email' => $user->email]);
        $calendar = GoogleCalendar::create([
            'google_account_id' => $account->id, 'google_calendar_id' => 'menu', 'summary' => 'Menu', 'role' => 'menu',
        ]);

        foreach ([['2027-01-04', 'dinner', 'Tacos'], ['2027-01-05', 'lunch', 'Soup'], ['2027-02-01', 'dinner', 'Later']] as $i => [$date, $slot, $title]) {
            MealEntry::create([
                'date' => $date, 'slot' => $slot, 'title' => $title,
                'google_event_id' => "event-{$i}", 'google_calendar_id' => $calendar->id,
            ]);
        }

        $this->getJson('/api/meals?from=2027-01-04&to=2027-01-10')
            ->assertJsonPath('*.title', ['Tacos', 'Soup'])
            ->assertJsonPath('0.slot', 'dinner')
            ->assertJsonPath('0.date', '2027-01-04');

        $this->getJson('/api/meals')->assertJsonValidationErrors(['from', 'to']);
        $this->postJson('/api/meals', ['title' => 'Pizza'])->assertStatus(405);
    });

    it('keeps a note for a meal Chef hasn\'t planned', function () {
        signIn();

        $this->putJson('/api/meals', ['date' => '2027-01-08', 'slot' => 'dinner', 'title' => ' Chicken soup '])
            ->assertOk()
            ->assertJsonPath('title', 'Chicken soup')
            ->assertJsonPath('source', 'note')
            ->assertJsonPath('chef_url', null);

        // Writing again changes the same note; an empty one clears it.
        $this->putJson('/api/meals', ['date' => '2027-01-08', 'slot' => 'dinner', 'title' => 'Chicken noodle soup'])->assertOk();
        $this->putJson('/api/meals', ['date' => '2027-01-08', 'slot' => 'lunch', 'title' => 'Leftovers'])->assertOk();

        $this->getJson('/api/meals?from=2027-01-08&to=2027-01-08')
            ->assertJsonPath('*.title', ['Chicken noodle soup', 'Leftovers']);

        $this->putJson('/api/meals', ['date' => '2027-01-08', 'slot' => 'dinner', 'title' => ''])->assertNoContent();

        expect(MealEntry::pluck('title')->all())->toBe(['Leftovers']);

        $this->putJson('/api/meals', ['date' => 'Friday', 'slot' => 'brunch'])
            ->assertJsonValidationErrors(['date', 'slot', 'title']);
    });

    it('keeps each household\'s notes apart', function () {
        signIn();
        $this->putJson('/api/meals', ['date' => '2027-01-08', 'slot' => 'dinner', 'title' => 'Chicken soup'])->assertOk();

        signIn();

        $this->getJson('/api/meals?from=2027-01-08&to=2027-01-08')->assertJsonCount(0);
    });
});
