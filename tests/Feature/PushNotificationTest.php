<?php

use App\Models\Category;
use App\Models\Habit;
use App\Models\HabitCheck;
use App\Models\Item;
use App\Models\PushSubscription;
use App\Models\Reward;
use App\Models\ScheduledNotification;
use App\Models\User;
use App\Services\Push\PushSender;
use App\Services\Push\ReminderPlanner;
use Carbon\CarbonImmutable;
use Tests\Fakes\FakePushSender;

function device(User $user, string $name = 'phone'): PushSubscription
{
    return PushSubscription::create([
        'user_id' => $user->id, 'endpoint' => "https://push.example.com/{$name}-{$user->id}", 'p256dh' => 'key', 'auth' => 'secret',
    ]);
}

/** Move the clock to a time of day in New York and run the reminders, as the scheduler would. */
function remindAt(string $localTime): void
{
    test()->travelTo(CarbonImmutable::parse($localTime, 'America/New_York'));
    app(ReminderPlanner::class)->run();
}

function dayTask(User $user, array $attributes = []): Item
{
    return Item::create([
        'household_id' => $user->household_id, 'created_by' => $user->id, 'assignee_user_id' => $user->id,
        'category_id' => Category::where('slug', 'home')->value('id'), 'title' => 'Call the plumber',
        'scope' => 'day', 'period_key' => '2027-01-04', 'due_date' => '2027-01-04', 'due_time' => '15:30',
        ...$attributes,
    ]);
}

beforeEach(function () {
    // Monday, January 4, 2027, mid-morning in New York.
    $this->travelTo(CarbonImmutable::parse('2027-01-04 10:00', 'America/New_York'));

    $this->push = new FakePushSender;
    $this->app->instance(PushSender::class, $this->push);

    $this->user = signIn();
    device($this->user);
});

describe('devices', function () {
    it('reports whether notifications are set up, and the defaults', function () {
        config(['planner.vapid.public_key' => 'public-key']);

        $this->getJson('/api/notifications')->assertOk()
            ->assertJsonPath('configured', true)
            ->assertJsonPath('vapid_public_key', 'public-key')
            ->assertJsonPath('devices', 1)
            ->assertJsonPath('preferences.tasks', true)
            ->assertJsonPath('preferences.task_lead_minutes', 10)
            ->assertJsonPath('preferences.morning_time', '07:00');

        $this->push->configured = false;

        $this->getJson('/api/notifications')->assertJsonPath('configured', false);
    });

    it('remembers a device, and moves it to whoever signs in on it next', function () {
        $body = ['endpoint' => 'https://push.example.com/tablet', 'keys' => ['p256dh' => 'p', 'auth' => 'a']];

        $this->postJson('/api/notifications/subscriptions', $body)->assertOk()->assertJsonPath('devices', 2);
        $this->postJson('/api/notifications/subscriptions', $body)->assertOk()->assertJsonPath('devices', 2);

        $partner = signIn($this->user->household);
        $this->postJson('/api/notifications/subscriptions', $body)->assertOk()->assertJsonPath('devices', 1);

        expect(PushSubscription::where('endpoint', 'https://push.example.com/tablet')->value('user_id'))->toBe($partner->id);
    });

    it('forgets a device, but only your own', function () {
        $mine = PushSubscription::where('user_id', $this->user->id)->value('endpoint');

        signIn($this->user->household);
        $this->deleteJson('/api/notifications/subscriptions', ['endpoint' => $mine])->assertNoContent();
        expect(PushSubscription::count())->toBe(1);

        $this->actingAs($this->user);
        $this->deleteJson('/api/notifications/subscriptions', ['endpoint' => $mine])->assertNoContent();
        expect(PushSubscription::count())->toBe(0);
    });

    it('rejects a subscription that isn\'t one', function () {
        $this->postJson('/api/notifications/subscriptions', ['endpoint' => 'http://insecure.example.com/x'])
            ->assertJsonValidationErrors(['endpoint', 'keys.p256dh', 'keys.auth']);
    });

    it('sends a test to every device, and drops one that has gone', function () {
        device($this->user, 'old-laptop');
        $this->push->expired = ["https://push.example.com/old-laptop-{$this->user->id}"];

        $this->postJson('/api/notifications/test')->assertOk()->assertJsonPath('sent', 1);

        expect($this->push->titles())->toBe(['Notifications are working'])
            ->and(PushSubscription::count())->toBe(1);
    });

    it('won\'t pretend to send without keys', function () {
        $this->push->configured = false;

        $this->postJson('/api/notifications/test')->assertStatus(409);
    });

    it('saves which reminders are wanted', function () {
        $this->patchJson('/api/notifications', ['morning' => false, 'task_lead_minutes' => 30, 'evening_time' => '21:15'])
            ->assertOk()
            ->assertJsonPath('preferences.morning', false)
            ->assertJsonPath('preferences.task_lead_minutes', 30)
            ->assertJsonPath('preferences.evening_time', '21:15')
            // Untouched ones keep their value.
            ->assertJsonPath('preferences.weekly', true);

        $this->patchJson('/api/notifications', ['task_lead_minutes' => 7, 'morning_time' => 'dawn'])
            ->assertJsonValidationErrors(['task_lead_minutes', 'morning_time']);
    });
});

describe('task reminders', function () {
    it('reminds once, ten minutes before a task with a time', function () {
        dayTask($this->user);

        remindAt('2027-01-04 15:19');
        expect($this->push->sent)->toBe([]);

        remindAt('2027-01-04 15:20');
        remindAt('2027-01-04 15:21');
        remindAt('2027-01-04 15:30');

        expect($this->push->sent)->toHaveCount(1)
            ->and($this->push->sent[0])->toMatchArray(['title' => 'Call the plumber', 'body' => 'At 3:30 PM', 'url' => '/day/2027-01-04']);
    });

    it('uses the lead time the person chose', function () {
        $this->user->update(['notification_preferences' => ['task_lead_minutes' => 60]]);
        dayTask($this->user);

        remindAt('2027-01-04 14:30');

        expect($this->push->titles())->toBe(['Call the plumber']);
    });

    it('still reminds if the minute was missed, but not once the task has started', function () {
        dayTask($this->user);
        dayTask($this->user, ['title' => 'Long past', 'due_time' => '09:00']);

        remindAt('2027-01-04 15:27');

        expect($this->push->titles())->toBe(['Call the plumber']);
    });

    it('says nothing about tasks that are done, untimed, on another day or someone else\'s', function () {
        $partner = User::factory()->create(['household_id' => $this->user->household_id]);

        dayTask($this->user, ['status' => 'done']);
        dayTask($this->user, ['due_time' => null]);
        dayTask($this->user, ['period_key' => '2027-01-05', 'due_date' => '2027-01-05']);
        dayTask($this->user, ['assignee_user_id' => $partner->id]);

        remindAt('2027-01-04 15:25');

        expect($this->push->sent)->toBe([]);
    });

    it('reminds both people of a task that belongs to both', function () {
        $partner = User::factory()->create(['household_id' => $this->user->household_id]);
        device($partner);
        dayTask($this->user, ['assignee_user_id' => null]);

        remindAt('2027-01-04 15:25');

        expect($this->push->titles($this->user->id))->toBe(['Call the plumber'])
            ->and($this->push->titles($partner->id))->toBe(['Call the plumber']);
    });

    it('reminds again when the task is moved to a later time', function () {
        $task = dayTask($this->user);
        remindAt('2027-01-04 15:25');

        $task->update(['due_time' => '17:00']);
        remindAt('2027-01-04 16:55');

        expect($this->push->sent)->toHaveCount(2)->and($this->push->sent[1]['body'])->toBe('At 5:00 PM');
    });

    it('uses each person\'s own clock', function () {
        $this->user->update(['timezone' => 'America/Los_Angeles']);
        dayTask($this->user);

        // 3:25 PM in New York is only 12:25 in Los Angeles.
        remindAt('2027-01-04 15:25');
        expect($this->push->sent)->toBe([]);

        remindAt('2027-01-04 18:25');
        expect($this->push->titles())->toBe(['Call the plumber']);
    });

    it('can be turned off, and skips people with no device', function () {
        $this->user->update(['notification_preferences' => ['tasks' => false]]);
        dayTask($this->user);

        $partner = User::factory()->create(['household_id' => $this->user->household_id]);
        dayTask($partner, ['title' => 'Theirs']);

        remindAt('2027-01-04 15:25');

        expect($this->push->sent)->toBe([])->and(ScheduledNotification::count())->toBe(0);
    });
});

describe('routine reminders', function () {
    it('nudges for the morning routine when something in it is still to do', function () {
        dayTask($this->user, ['title' => 'Make the bed', 'routine' => 'morning', 'due_time' => null]);
        Habit::create(['household_id' => $this->user->household_id, 'user_id' => $this->user->id, 'title' => 'Stretch', 'routine' => 'morning', 'active_from' => '2027-01-01']);

        remindAt('2027-01-04 06:59');
        expect($this->push->sent)->toBe([]);

        remindAt('2027-01-04 07:00');
        remindAt('2027-01-04 07:10');

        expect($this->push->sent)->toHaveCount(1)
            ->and($this->push->sent[0])->toMatchArray(['title' => 'Morning routine', 'body' => '2 things to do.']);
    });

    it('stays quiet when the routine is empty or already done', function () {
        $habit = Habit::create(['household_id' => $this->user->household_id, 'user_id' => $this->user->id, 'title' => 'Floss', 'routine' => 'evening', 'active_from' => '2027-01-01']);
        HabitCheck::create(['habit_id' => $habit->id, 'date' => '2027-01-04', 'done' => true]);
        dayTask($this->user, ['title' => 'Tidy up', 'routine' => 'evening', 'due_time' => null, 'status' => 'done']);

        remindAt('2027-01-04 20:30');

        expect($this->push->sent)->toBe([]);
    });

    it('leaves out the other person\'s habits', function () {
        $partner = User::factory()->create(['household_id' => $this->user->household_id]);
        Habit::create(['household_id' => $this->user->household_id, 'user_id' => $partner->id, 'title' => 'Read', 'routine' => 'evening', 'active_from' => '2027-01-01']);

        remindAt('2027-01-04 20:30');

        expect($this->push->sent)->toBe([]);
    });

    it('comes at the time the person set', function () {
        $this->user->update(['notification_preferences' => ['evening_time' => '21:15']]);
        Habit::create(['household_id' => $this->user->household_id, 'user_id' => $this->user->id, 'title' => 'Floss', 'routine' => 'evening', 'active_from' => '2027-01-01']);

        remindAt('2027-01-04 20:45');
        expect($this->push->sent)->toBe([]);

        remindAt('2027-01-04 21:15');
        expect($this->push->sent[0])->toMatchArray(['title' => 'Evening routine', 'body' => '1 thing to do.']);
    });
});

describe('planning reminders', function () {
    it('suggests planning the week on Sunday evening', function () {
        remindAt('2027-01-09 17:00'); // Saturday
        expect($this->push->sent)->toBe([]);

        remindAt('2027-01-10 17:00');
        remindAt('2027-01-10 17:20');

        expect($this->push->sent)->toHaveCount(1)
            ->and($this->push->sent[0])->toMatchArray(['title' => 'Plan the week ahead', 'url' => '/plan/2027-W02']);
    });

    it('marks the first of the month', function () {
        remindAt('2027-02-01 08:00');
        remindAt('2027-02-01 08:05');

        expect($this->push->sent)->toHaveCount(1)
            ->and($this->push->sent[0])->toMatchArray([
                'title' => 'It’s February',
                'body' => 'Look back at January and set this month’s goals.',
                'url' => '/month/2027-02',
            ]);
    });
});

describe('reward notifications', function () {
    function rewardFor(User $user, array $attributes = []): Reward
    {
        return Reward::create([
            'household_id' => $user->household_id, 'created_by' => $user->id, 'title' => 'Movie night',
            'deadline' => now()->addDays(3), ...$attributes,
        ]);
    }

    it('announces a reward the moment its last task is done', function () {
        $partner = User::factory()->create(['household_id' => $this->user->household_id]);
        device($partner);

        $task = dayTask($this->user, ['due_time' => null]);
        rewardFor($this->user)->items()->attach($task->id);

        $this->patchJson("/api/items/{$task->id}", ['status' => 'done'])->assertOk();

        // It is for both of them, and is announced once.
        $this->getJson('/api/rewards')->assertOk();

        expect($this->push->titles($this->user->id))->toBe(['Reward earned!'])
            ->and($this->push->titles($partner->id))->toBe(['Reward earned!'])
            ->and($this->push->sent[0]['body'])->toBe('You earned “Movie night”. Go claim it.');
    });

    it('tells only the person a reward is for', function () {
        $partner = User::factory()->create(['household_id' => $this->user->household_id]);
        device($partner);

        $task = dayTask($this->user, ['due_time' => null]);
        rewardFor($this->user, ['beneficiary_user_id' => $partner->id])->items()->attach($task->id);

        $this->patchJson("/api/items/{$task->id}", ['status' => 'done'])->assertOk();

        expect($this->push->titles($this->user->id))->toBe([])
            ->and($this->push->titles($partner->id))->toBe(['Reward earned!']);
    });

    it('warns once when a reward has a day or less to go', function () {
        $task = dayTask($this->user, ['due_time' => null]);
        rewardFor($this->user, ['deadline' => now()->addHours(30)])->items()->attach($task->id);

        remindAt('2027-01-04 10:05');
        expect($this->push->sent)->toBe([]);

        remindAt('2027-01-04 18:00');
        remindAt('2027-01-04 19:00');

        expect($this->push->sent)->toHaveCount(1)
            ->and($this->push->sent[0])->toMatchArray(['title' => '“Movie night” is nearly out of time', 'body' => 'About 22 hours left to earn it.']);
    });

    it('respects the rewards switch', function () {
        $this->user->update(['notification_preferences' => ['rewards' => false]]);
        $task = dayTask($this->user, ['due_time' => null]);
        rewardFor($this->user, ['deadline' => now()->addHours(5)])->items()->attach($task->id);

        remindAt('2027-01-04 10:05');
        $this->patchJson("/api/items/{$task->id}", ['status' => 'done'])->assertOk();

        expect($this->push->sent)->toBe([]);
    });
});

it('prints a key pair for the server', function () {
    $this->artisan('push:keys')
        ->expectsOutputToContain('VAPID_PUBLIC_KEY=')
        ->expectsOutputToContain('VAPID_PRIVATE_KEY=')
        ->assertSuccessful();
})->skip(PHP_OS_FAMILY === 'Windows', 'OpenSSL on Windows often has no configuration to make EC keys with.');
