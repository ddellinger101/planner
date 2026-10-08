<?php

use App\Jobs\PushEventToGoogle;
use App\Jobs\PushImportantDateToGoogle;
use App\Jobs\SyncGoogleAccount;
use App\Models\Event;
use App\Models\GoogleAccount;
use App\Models\GoogleCalendar;
use App\Models\ImportantDate;
use App\Models\MealEntry;
use App\Models\User;
use App\Services\Google\CalendarSync;
use App\Services\Google\GoogleAuthException;
use App\Services\Google\GoogleCalendarService;
use App\Services\Google\GoogleClient;
use App\Services\Google\GoogleContactsService;
use App\Services\Google\GoogleTasksService;
use App\Services\Google\HttpGoogleCalendarService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Tests\Fakes\FakeGoogleCalendar;
use Tests\Fakes\FakeGoogleContacts;
use Tests\Fakes\FakeGoogleTasks;

const CALENDAR_SCOPES = [GoogleClient::SCOPE_CALENDAR_EVENTS, GoogleClient::SCOPE_CALENDAR_LIST];

function connectCalendar(User $user, array $scopes = CALENDAR_SCOPES): GoogleAccount
{
    return GoogleAccount::create([
        'user_id' => $user->id, 'google_sub' => 'sub-'.$user->id, 'email' => $user->email,
        'refresh_token' => 'refresh', 'access_token' => 'access', 'expires_at' => now()->addHour(),
        'scopes' => $scopes,
    ]);
}

/** Let time pass and run the calendar poll, as the scheduler would. */
function pollCalendar(int $minutes = 5): void
{
    test()->travel($minutes)->minutes();
    test()->sync->syncAccount(test()->account->refresh());
}

function calendarRow(string $googleId): GoogleCalendar
{
    return GoogleCalendar::where('google_calendar_id', $googleId)->firstOrFail();
}

beforeEach(function () {
    // A Monday afternoon in New York (noon EST is 17:00 UTC).
    $this->travelTo('2027-01-04 17:00:00');

    $this->google = new FakeGoogleCalendar;
    $this->app->instance(GoogleCalendarService::class, $this->google);
    $this->app->instance(GoogleTasksService::class, new FakeGoogleTasks);
    $this->app->instance(GoogleContactsService::class, new FakeGoogleContacts);

    $this->mine = $this->google->addCalendar('Dustin', primary: true);
    $this->menu = $this->google->addCalendar('Menu');
    $this->holidays = $this->google->addCalendar('Holidays in United States', accessRole: 'reader');

    $this->user = signIn();
    $this->account = connectCalendar($this->user);
    $this->sync = app(CalendarSync::class);
    $this->sync->refreshCalendars($this->account);
    $this->account->refresh();
});

describe('calendars', function () {
    it('shows the person\'s own calendar, reads a Menu calendar as meals and hides the rest', function () {
        $modes = $this->account->calendars()->get()->mapWithKeys(fn ($c) => [$c->summary => $c->mode()]);

        expect($modes->all())->toEqual(['Dustin' => 'events', 'Menu' => 'menu', 'Holidays in United States' => 'hidden']);

        $this->getJson('/api/google')->assertOk()
            ->assertJsonPath('calendar_connected', true)
            ->assertJsonPath('calendars.0.summary', 'Dustin')
            ->assertJsonPath('calendars.0.is_primary', true)
            ->assertJsonPath('calendars.1.writable', false);
    });

    it('keeps the choices made here when the list is read again, and follows renames and removals', function () {
        $this->patchJson('/api/google/calendars/'.calendarRow($this->holidays)->id, ['mode' => 'events'])->assertOk();

        $this->google->calendars[$this->holidays]['summary'] = 'US Holidays';
        unset($this->google->calendars[$this->menu]);

        $this->postJson('/api/google/calendars/refresh')->assertOk()
            ->assertJsonCount(2, 'calendars')
            ->assertJsonPath('calendars.1.summary', 'US Holidays')
            ->assertJsonPath('calendars.1.mode', 'events');
    });

    it('allows one Menu calendar in the household', function () {
        $other = $this->google->addCalendar('Dinner ideas');
        $this->sync->refreshCalendars($this->account);

        // Not guessed as a second Menu calendar.
        expect(calendarRow($other)->mode())->toBe('hidden');

        $this->patchJson('/api/google/calendars/'.calendarRow($other)->id, ['mode' => 'menu'])->assertOk();

        expect(calendarRow($other)->mode())->toBe('menu')
            ->and(calendarRow($this->menu)->mode())->toBe('hidden');
    });

    it('forgets a calendar\'s events when it is hidden and reads them again when shown', function () {
        Queue::fake();
        $this->google->addEvent($this->mine, ['title' => 'Dentist', 'start' => '2027-01-05T14:00:00-05:00']);
        pollCalendar();
        expect(Event::count())->toBe(1);

        $id = calendarRow($this->mine)->id;
        $this->patchJson("/api/google/calendars/{$id}", ['mode' => 'hidden'])->assertOk();
        expect(Event::count())->toBe(0);

        $this->patchJson("/api/google/calendars/{$id}", ['mode' => 'events'])->assertOk();
        Queue::assertPushed(SyncGoogleAccount::class);
        pollCalendar();

        expect(Event::count())->toBe(1);
    });

    it('can\'t change another person\'s calendar', function () {
        $id = calendarRow($this->mine)->id;

        signIn($this->user->household);

        $this->patchJson("/api/google/calendars/{$id}", ['mode' => 'hidden'])->assertNotFound();
    });
});

describe('events from Google', function () {
    it('brings in timed and all-day events and lists them by day', function () {
        $this->google->addEvent($this->mine, [
            'title' => 'Dentist', 'location' => '12 Main St',
            'start' => '2027-01-05T14:00:00-05:00', 'end' => '2027-01-05T15:00:00-05:00',
        ]);
        // All-day events end on the day after their last one.
        $this->google->addEvent($this->mine, ['title' => 'Conference', 'start' => '2027-01-06', 'end' => '2027-01-08']);
        pollCalendar();

        $this->getJson('/api/events?from=2027-01-05&to=2027-01-05')->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.title', 'Dentist')
            ->assertJsonPath('0.location', '12 Main St')
            ->assertJsonPath('0.all_day', false)
            ->assertJsonPath('0.starts_at', '2027-01-05T19:00:00.000000Z')
            ->assertJsonPath('0.owner_user_id', $this->user->id)
            ->assertJsonPath('0.color', '#4285f4')
            ->assertJsonPath('0.calendar_name', 'Dustin')
            ->assertJsonPath('0.editable', true);

        $this->getJson('/api/events?from=2027-01-07&to=2027-01-09')->assertOk()
            ->assertJsonCount(1)
            ->assertJsonPath('0.title', 'Conference')
            ->assertJsonPath('0.starts_on', '2027-01-06')
            ->assertJsonPath('0.ends_on', '2027-01-07');

        $this->getJson('/api/events?from=2027-01-08&to=2027-01-09')->assertOk()->assertJsonCount(0);
    });

    it('puts a late-evening event on the day it happens here, not in UTC', function () {
        $this->google->addEvent($this->mine, ['title' => 'Late show', 'start' => '2027-01-05T22:30:00-05:00']);
        pollCalendar();

        $this->getJson('/api/events?from=2027-01-05&to=2027-01-05')->assertJsonCount(1);
        $this->getJson('/api/events?from=2027-01-06&to=2027-01-06')->assertJsonCount(0);
    });

    it('follows changes and cancellations without reading everything again', function () {
        $id = $this->google->addEvent($this->mine, ['title' => 'Dentist', 'start' => '2027-01-05T14:00:00-05:00']);
        $gone = $this->google->addEvent($this->mine, ['title' => 'Haircut', 'start' => '2027-01-06T10:00:00-05:00']);
        pollCalendar();

        $this->google->changeEvent($this->mine, $id, ['title' => 'Dentist (moved)', 'start' => '2027-01-07T09:00:00-05:00', 'end' => '2027-01-07T10:00:00-05:00']);
        $this->google->cancelEvent($this->mine, $gone);
        pollCalendar();

        expect(Event::pluck('title')->all())->toBe(['Dentist (moved)'])
            ->and(Event::first()->starts_at->toDateTimeString())->toBe('2027-01-07 14:00:00')
            // One full read per calendar the first time; changes only after that.
            ->and($this->google->reads)->toBe(['full' => 2, 'changes' => 2]);
    });

    it('reads everything again once a day, dropping what has gone', function () {
        $id = $this->google->addEvent($this->mine, ['title' => 'Dentist', 'start' => '2027-01-05T14:00:00-05:00']);
        pollCalendar();

        // Removed without a trace, as when an event leaves the window.
        unset($this->google->events[$this->mine][$id]);
        pollCalendar();
        expect(Event::count())->toBe(1);

        pollCalendar(60 * 24);
        expect(Event::count())->toBe(0);
    });

    it('reads everything again when Google has forgotten the changes', function () {
        pollCalendar();
        $this->google->addEvent($this->mine, ['title' => 'Dentist', 'start' => '2027-01-05T14:00:00-05:00']);
        $this->google->forgetHistory = true;
        pollCalendar();

        expect(Event::pluck('title')->all())->toBe(['Dentist']);
    });

    it('leaves occurrences of a repeating event, and events on read-only calendars, to Google', function () {
        $this->sync->setMode(calendarRow($this->holidays), 'events');
        $this->google->addEvent($this->holidays, ['title' => 'Martin Luther King Jr. Day', 'start' => '2027-01-18']);
        $this->google->addEvent($this->mine, ['title' => 'Stand-up', 'start' => '2027-01-05T09:00:00-05:00', 'recurring_event_id' => 'series-1']);
        pollCalendar();

        $events = $this->getJson('/api/events?from=2027-01-01&to=2027-01-31')->assertOk()->json();

        expect(collect($events)->pluck('editable', 'title')->all())->toBe(['Stand-up' => false, 'Martin Luther King Jr. Day' => false])
            ->and($events[0]['repeats'])->toBeTrue();

        $this->deleteJson('/api/events/'.$events[0]['id'])->assertForbidden();
        $this->putJson('/api/events/'.$events[1]['id'], ['title' => 'X', 'all_day' => true, 'date' => '2027-01-18'])->assertForbidden();
    });

    it('keeps each household\'s events apart', function () {
        $this->google->addEvent($this->mine, ['title' => 'Dentist', 'start' => '2027-01-05T14:00:00-05:00']);
        pollCalendar();

        signIn();

        $this->getJson('/api/events?from=2027-01-01&to=2027-01-31')->assertOk()->assertJsonCount(0);
    });

    it('lets each person hide a calendar the other one shows', function () {
        $this->google->addEvent($this->mine, ['title' => 'Client call', 'start' => '2027-01-05T14:00:00-05:00']);
        pollCalendar();
        $calendar = calendarRow($this->mine);

        // Something Dustin made in the planner, not on any calendar yet.
        Queue::fake();
        $this->postJson('/api/events', ['title' => 'Pick up cake', 'all_day' => true, 'date' => '2027-01-05'])->assertCreated();

        // It isn't the owner's to hide this way: they have their own Calendars list.
        $this->patchJson("/api/google/shared-calendars/{$calendar->id}", ['visible' => false])->assertNotFound();
        $this->getJson('/api/google')->assertJsonPath('shared_calendars', []);

        $partner = signIn($this->user->household);

        $this->getJson('/api/google')->assertOk()
            ->assertJsonCount(1, 'shared_calendars')
            ->assertJsonPath('shared_calendars.0.summary', 'Dustin')
            ->assertJsonPath('shared_calendars.0.owner_user_id', $this->user->id)
            ->assertJsonPath('shared_calendars.0.visible', true);
        $this->getJson('/api/events?from=2027-01-05&to=2027-01-05')->assertJsonCount(2);

        $this->patchJson("/api/google/shared-calendars/{$calendar->id}", ['visible' => false])
            ->assertOk()->assertJsonPath('shared_calendars.0.visible', false);

        // The calendar's events go; what Dustin made by hand stays.
        $this->getJson('/api/events?from=2027-01-05&to=2027-01-05')->assertJsonCount(1)->assertJsonPath('0.title', 'Pick up cake');

        // Dustin still sees his own calendar.
        $this->actingAs($this->user);
        $this->getJson('/api/events?from=2027-01-05&to=2027-01-05')->assertJsonCount(2);

        $this->actingAs($partner);
        $this->patchJson("/api/google/shared-calendars/{$calendar->id}", ['visible' => true])->assertOk();
        $this->getJson('/api/events?from=2027-01-05&to=2027-01-05')->assertJsonCount(2);
    });

    it('won\'t hide a calendar from another household', function () {
        $id = calendarRow($this->mine)->id;

        signIn();

        $this->patchJson("/api/google/shared-calendars/{$id}", ['visible' => false])->assertNotFound();
    });

    it('flags the account when access is revoked, but not when Google merely refuses', function () {
        $this->google->revoked = true;
        pollCalendar();

        expect($this->account->refresh()->needs_reconnect)->toBeTrue();
    });

    it('does nothing without calendar access', function () {
        $this->account->update(['scopes' => [GoogleClient::SCOPE_TASKS]]);
        $this->google->addEvent($this->mine, ['title' => 'Dentist', 'start' => '2027-01-05T14:00:00-05:00']);
        pollCalendar();

        expect(Event::count())->toBe(0);
        $this->getJson('/api/google')->assertJsonPath('calendar_connected', false);
    });
});

describe('events made here', function () {
    it('sends a new timed event to the person\'s own calendar', function () {
        $this->postJson('/api/events', [
            'title' => 'Parent-teacher night', 'location' => 'Room 4', 'all_day' => false,
            'date' => '2027-01-06', 'start_time' => '18:30', 'end_time' => '19:15',
        ])->assertCreated()->assertJsonPath('starts_at', '2027-01-06T23:30:00.000000Z')->assertJsonPath('editable', true);

        $sent = array_values($this->google->events[$this->mine])[0];

        expect($sent['title'])->toBe('Parent-teacher night')
            ->and($sent['location'])->toBe('Room 4')
            ->and($sent['start'])->toBe('2027-01-06T18:30:00-05:00')
            ->and($sent['end'])->toBe('2027-01-06T19:15:00-05:00')
            ->and($sent['time_zone'])->toBe('America/New_York')
            ->and(Event::first()->google_event_id)->toBe($sent['id']);

        // The poll then sees its own event and doesn't make a second.
        pollCalendar();
        expect(Event::count())->toBe(1)->and($this->google->writes)->toBe(['insert']);
    });

    it('gives an event an hour when no end is given, and lets it run past midnight', function () {
        $this->postJson('/api/events', ['title' => 'Call', 'all_day' => false, 'date' => '2027-01-06', 'start_time' => '09:00'])
            ->assertJsonPath('ends_at', '2027-01-06T15:00:00.000000Z');

        $this->postJson('/api/events', ['title' => 'Party', 'all_day' => false, 'date' => '2027-01-06', 'start_time' => '21:00', 'end_time' => '01:00'])
            ->assertJsonPath('ends_at', '2027-01-07T06:00:00.000000Z');
    });

    it('sends an all-day event with Google\'s day-after end', function () {
        $this->postJson('/api/events', ['title' => 'Trip', 'all_day' => true, 'date' => '2027-01-08', 'end_date' => '2027-01-10'])
            ->assertCreated()->assertJsonPath('starts_on', '2027-01-08')->assertJsonPath('ends_on', '2027-01-10');

        $sent = array_values($this->google->events[$this->mine])[0];

        expect($sent['start'])->toBe('2027-01-08')->and($sent['end'])->toBe('2027-01-11');
    });

    it('sends edits and deletions', function () {
        $id = $this->postJson('/api/events', ['title' => 'Call', 'all_day' => false, 'date' => '2027-01-06', 'start_time' => '09:00'])->json('id');

        $this->putJson("/api/events/{$id}", ['title' => 'Call Sam', 'all_day' => false, 'date' => '2027-01-07', 'start_time' => '10:00', 'end_time' => '10:30'])
            ->assertOk()->assertJsonPath('title', 'Call Sam');

        expect($this->google->titles($this->mine))->toBe(['Call Sam']);

        $this->deleteJson("/api/events/{$id}")->assertNoContent();

        expect($this->google->titles($this->mine))->toBe([])
            ->and(Event::withTrashed()->count())->toBe(0)
            ->and($this->google->writes)->toBe(['insert', 'patch', 'delete']);
    });

    it('edits an event that came from Google', function () {
        $googleId = $this->google->addEvent($this->mine, ['title' => 'Dentist', 'start' => '2027-01-05T14:00:00-05:00']);
        pollCalendar();

        $this->putJson('/api/events/'.Event::first()->id, ['title' => 'Dentist: cleaning', 'all_day' => false, 'date' => '2027-01-05', 'start_time' => '14:30'])
            ->assertOk();

        expect($this->google->events[$this->mine][$googleId]['title'])->toBe('Dentist: cleaning')
            ->and($this->google->events[$this->mine][$googleId]['start'])->toBe('2027-01-05T14:30:00-05:00');
    });

    it('keeps an unsent change through a poll, and sends it then', function () {
        Queue::fake();
        $this->postJson('/api/events', ['title' => 'Call', 'all_day' => false, 'date' => '2027-01-06', 'start_time' => '09:00'])->assertCreated();
        Queue::assertPushed(PushEventToGoogle::class);

        expect($this->google->titles($this->mine))->toBe([]);

        pollCalendar();

        expect($this->google->titles($this->mine))->toBe(['Call'])->and(Event::count())->toBe(1);
    });

    it('keeps an event made before Google was connected, and sends it once it is', function () {
        $this->account->update(['scopes' => []]);
        $this->postJson('/api/events', ['title' => 'Call', 'all_day' => false, 'date' => '2027-01-06', 'start_time' => '09:00'])->assertCreated();

        $this->getJson('/api/events?from=2027-01-06&to=2027-01-06')->assertJsonCount(1)->assertJsonPath('0.editable', true);
        expect($this->google->writes)->toBe([]);

        $this->account->update(['scopes' => CALENDAR_SCOPES]);
        pollCalendar();

        expect($this->google->titles($this->mine))->toBe(['Call']);
    });

    it('drops an event here when it was deleted in Google before an edit arrived', function () {
        $id = $this->postJson('/api/events', ['title' => 'Call', 'all_day' => false, 'date' => '2027-01-06', 'start_time' => '09:00'])->json('id');
        $this->google->cancelEvent($this->mine, Event::first()->google_event_id);

        // Jobs run at once in tests, so the event is already gone when the reply is built.
        $this->putJson("/api/events/{$id}", ['title' => 'Call Sam', 'all_day' => false, 'date' => '2027-01-06', 'start_time' => '09:00'])->assertNotFound();

        expect(Event::withTrashed()->count())->toBe(0);
    });

    it('marks an event Google refuses without asking to reconnect', function () {
        $this->google->refuseWrites = true;
        $this->postJson('/api/events', ['title' => 'Call', 'all_day' => false, 'date' => '2027-01-06', 'start_time' => '09:00'])->assertCreated();

        expect(Event::first()->sync_state->value)->toBe('error')
            ->and($this->account->refresh()->needs_reconnect)->toBeFalse();
    });

    it('validates what it is given', function () {
        $this->postJson('/api/events', ['title' => '', 'all_day' => false, 'date' => '2027-01-06'])
            ->assertJsonValidationErrors(['title', 'start_time']);
        $this->postJson('/api/events', ['title' => 'Trip', 'all_day' => true, 'date' => '2027-01-06', 'end_date' => '2027-01-05'])
            ->assertJsonValidationErrors(['end_date']);
    });
});

describe('meals from Chef', function () {
    /** An event as Chef writes it. */
    function chefEvent(string $title, string $start, array $dishes, string $date): array
    {
        return [
            'title' => $title,
            'start' => $start,
            'description' => implode("\n", [...array_map(fn ($dish) => "• {$dish}", $dishes), '', 'Serves 4.', "https://chef.dustindellinger.com/tonight?date={$date}"]),
        ];
    }

    it('reads the Menu calendar into meals, not events', function () {
        $this->google->addEvent($this->menu, chefEvent('Chicken Tikka Masala', '2027-01-05T18:00:00-05:00', ['Chicken Tikka Masala', 'Naan', 'Cucumber salad'], '2027-01-05'));
        $this->google->addEvent($this->menu, chefEvent('Lunch: Sandwiches, Fruit', '2027-01-05T12:30:00-05:00', ['Sandwiches', 'Fruit'], '2027-01-05'));
        $this->google->addEvent($this->menu, chefEvent('Oatmeal', '2027-01-06T08:00:00-05:00', ['Oatmeal'], '2027-01-06'));
        pollCalendar();

        expect(Event::count())->toBe(0);

        $this->getJson('/api/meals?from=2027-01-05&to=2027-01-05')->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.slot', 'dinner')
            ->assertJsonPath('0.title', 'Chicken Tikka Masala')
            ->assertJsonPath('0.description', "Naan\nCucumber salad")
            ->assertJsonPath('0.chef_url', 'https://chef.dustindellinger.com/tonight?date=2027-01-05')
            ->assertJsonPath('1.slot', 'lunch')
            ->assertJsonPath('1.title', 'Sandwiches, Fruit')
            ->assertJsonPath('1.description', null);

        $this->getJson('/api/meals?from=2027-01-06&to=2027-01-06')->assertJsonPath('0.slot', 'breakfast');
    });

    it('follows a changed and a removed meal', function () {
        $dinner = $this->google->addEvent($this->menu, chefEvent('Tacos', '2027-01-05T18:00:00-05:00', ['Tacos'], '2027-01-05'));
        $lunch = $this->google->addEvent($this->menu, chefEvent('Soup', '2027-01-05T12:30:00-05:00', ['Soup'], '2027-01-05'));
        pollCalendar();

        $this->google->changeEvent($this->menu, $dinner, ['title' => 'Burrito bowls']);
        $this->google->cancelEvent($this->menu, $lunch);
        pollCalendar();

        expect(MealEntry::pluck('title')->all())->toBe(['Burrito bowls']);
    });

    it('shows meals to the whole household', function () {
        $this->google->addEvent($this->menu, chefEvent('Tacos', '2027-01-05T18:00:00-05:00', ['Tacos'], '2027-01-05'));
        pollCalendar();

        signIn($this->user->household);

        $this->getJson('/api/meals?from=2027-01-05&to=2027-01-05')->assertJsonCount(1);
    });

    it('replaces a note typed here once Chef plans that meal', function () {
        $this->putJson('/api/meals', ['date' => '2027-01-08', 'slot' => 'dinner', 'title' => 'chicken soup'])->assertOk();
        $this->putJson('/api/meals', ['date' => '2027-01-08', 'slot' => 'lunch', 'title' => 'Leftovers'])->assertOk();
        $this->putJson('/api/meals', ['date' => '2027-01-09', 'slot' => 'dinner', 'title' => 'Pizza?'])->assertOk();

        $this->google->addEvent($this->menu, chefEvent('Chicken Soup', '2027-01-08T18:00:00-05:00', ['Chicken Soup', 'Bread'], '2027-01-08'));
        pollCalendar();

        // Only the note for that day's dinner gives way.
        expect(MealEntry::orderBy('date')->orderBy('id')->get()->map(fn ($meal) => "{$meal->date->toDateString()} {$meal->slot->value} {$meal->title} ({$meal->source})")->all())
            ->toBe(['2027-01-08 lunch Leftovers (note)', '2027-01-08 dinner Chicken Soup (chef)', '2027-01-09 dinner Pizza? (note)']);

        // And a slot Chef has planned can't be written over here.
        $this->putJson('/api/meals', ['date' => '2027-01-08', 'slot' => 'dinner', 'title' => 'Something else'])->assertStatus(409);
    });

    it('keeps notes when the Menu calendar is read in full', function () {
        $this->putJson('/api/meals', ['date' => '2027-01-09', 'slot' => 'dinner', 'title' => 'Pizza?'])->assertOk();

        pollCalendar();
        pollCalendar(60 * 24);

        expect(MealEntry::pluck('title')->all())->toBe(['Pizza?']);
    });

    it('never writes to the Menu calendar', function () {
        $this->google->addEvent($this->menu, chefEvent('Tacos', '2027-01-05T18:00:00-05:00', ['Tacos'], '2027-01-05'));
        pollCalendar();
        pollCalendar();

        expect($this->google->writes)->toBe([]);
    });
});

describe('important dates on the calendar', function () {
    it('adds a yearly all-day event, and shows the date once', function () {
        $id = $this->postJson('/api/important-dates', [
            'title' => 'Anniversary', 'date' => '2019-01-12', 'repeats_yearly' => true, 'add_to_calendar' => true,
        ])->assertCreated()->assertJsonPath('add_to_calendar', true)->json('id');

        $sent = array_values($this->google->events[$this->mine])[0];

        expect($sent['title'])->toBe('Anniversary')
            ->and($sent['all_day'])->toBeTrue()
            ->and($sent['start'])->toBe('2019-01-12')
            ->and($sent['end'])->toBe('2019-01-13')
            ->and($sent['yearly'])->toBeTrue()
            ->and(ImportantDate::find($id)->google_event_id)->toBe($sent['id']);

        // The calendar hands the event back as occurrences; they aren't shown as events too.
        pollCalendar();

        expect(Event::count())->toBe(0);
        $this->getJson('/api/important-dates?from=2027-01-01&to=2027-01-31')->assertJsonCount(1);
    });

    it('updates the event with the date and removes it when unticked', function () {
        $id = $this->postJson('/api/important-dates', ['title' => 'Recital', 'date' => '2027-01-20', 'add_to_calendar' => true])->json('id');

        $this->patchJson("/api/important-dates/{$id}", ['title' => 'Piano recital', 'date' => '2027-01-21'])->assertOk();

        $sent = array_values($this->google->events[$this->mine])[0];
        expect($sent['title'])->toBe('Piano recital')->and($sent['start'])->toBe('2027-01-21');

        $this->patchJson("/api/important-dates/{$id}", ['add_to_calendar' => false])->assertOk();

        expect($this->google->titles($this->mine))->toBe([])
            ->and(ImportantDate::find($id)->google_event_id)->toBeNull();
    });

    it('removes the event when the date is deleted', function () {
        $id = $this->postJson('/api/important-dates', ['title' => 'Recital', 'date' => '2027-01-20', 'add_to_calendar' => true])->json('id');

        $this->deleteJson("/api/important-dates/{$id}")->assertNoContent();

        expect($this->google->titles($this->mine))->toBe([]);
    });

    it('leaves Google alone for a date that isn\'t on the calendar', function () {
        Queue::fake();

        $id = $this->postJson('/api/important-dates', ['title' => 'Recital', 'date' => '2027-01-20'])->json('id');
        $this->patchJson("/api/important-dates/{$id}", ['title' => 'Piano recital'])->assertOk();
        $this->deleteJson("/api/important-dates/{$id}")->assertNoContent();

        Queue::assertNotPushed(PushImportantDateToGoogle::class);
    });

    it('adds the event at the next poll if Google could not be reached', function () {
        Queue::fake();
        $this->postJson('/api/important-dates', ['title' => 'Recital', 'date' => '2027-01-20', 'add_to_calendar' => true])->assertCreated();

        pollCalendar();

        expect($this->google->titles($this->mine))->toBe(['Recital']);
    });
});

describe('talking to Google Calendar', function () {
    beforeEach(function () {
        $this->app->forgetInstance(GoogleCalendarService::class);
        $this->http = app(HttpGoogleCalendarService::class);
    });

    it('lists calendars with the name the person sees', function () {
        Http::fake(['*/users/me/calendarList*' => Http::response(['items' => [
            ['id' => 'me@example.com', 'summary' => 'me@example.com', 'summaryOverride' => 'Dustin', 'backgroundColor' => '#9fe1e7', 'primary' => true, 'accessRole' => 'owner'],
            ['id' => 'x@group.calendar.google.com', 'summary' => 'Menu', 'accessRole' => 'writer'],
        ]])]);

        expect($this->http->listCalendars($this->account))->toBe([
            ['id' => 'me@example.com', 'summary' => 'Dustin', 'color' => '#9fe1e7', 'primary' => true, 'access_role' => 'owner'],
            ['id' => 'x@group.calendar.google.com', 'summary' => 'Menu', 'color' => null, 'primary' => false, 'access_role' => 'writer'],
        ]);
    });

    it('asks for occurrences in a window, and for changes with cancellations', function () {
        Http::fake(['*/events*' => Http::sequence()
            ->push(['items' => [
                ['id' => 'a', 'summary' => 'Dentist', 'start' => ['dateTime' => '2027-01-05T14:00:00-05:00'], 'end' => ['dateTime' => '2027-01-05T15:00:00-05:00'], 'etag' => '"1"', 'htmlLink' => 'https://calendar.google.com/a'],
            ], 'nextPageToken' => 'next'])
            ->push(['items' => [
                ['id' => 'b_20270106', 'summary' => 'Trip', 'start' => ['date' => '2027-01-06'], 'end' => ['date' => '2027-01-08'], 'recurringEventId' => 'b'],
            ]])
            ->push(['items' => [['id' => 'a', 'status' => 'cancelled']]])]);

        $events = $this->http->listEvents($this->account, 'me@example.com', now()->subDay(), now()->addDays(30));

        expect($events)->toHaveCount(2)
            ->and($events[0])->toMatchArray(['id' => 'a', 'status' => 'confirmed', 'title' => 'Dentist', 'all_day' => false, 'start' => '2027-01-05T14:00:00-05:00', 'html_link' => 'https://calendar.google.com/a'])
            ->and($events[1])->toMatchArray(['all_day' => true, 'start' => '2027-01-06', 'end' => '2027-01-08', 'recurring_event_id' => 'b']);

        $changes = $this->http->listEvents($this->account, 'me@example.com', now()->subDay(), now()->addDays(30), now()->subMinutes(6));

        expect($changes[0])->toMatchArray(['id' => 'a', 'status' => 'cancelled', 'start' => null]);

        Http::assertSent(fn (Request $request) => str_contains($request->url(), '/calendars/me%40example.com/events')
            && $request['singleEvents'] === 'true' && $request['showDeleted'] === 'false'
            && $request['timeMin'] === '2027-01-03T17:00:00Z' && ! isset($request['updatedMin']) && ! isset($request['pageToken']));
        Http::assertSent(fn (Request $request) => ($request['pageToken'] ?? null) === 'next');
        Http::assertSent(fn (Request $request) => ($request['updatedMin'] ?? null) === '2027-01-04T16:54:00Z' && $request['showDeleted'] === 'true');
    });

    it('writes events in Google\'s shape', function () {
        Http::fake(['*/events*' => Http::response(['id' => 'new', 'summary' => 'Call', 'start' => ['dateTime' => '2027-01-06T09:00:00-05:00'], 'end' => ['dateTime' => '2027-01-06T10:00:00-05:00'], 'etag' => '"2"'])]);

        $this->http->insertEvent($this->account, 'me@example.com', [
            'title' => 'Call', 'location' => null, 'all_day' => false, 'time_zone' => 'America/New_York',
            'start' => '2027-01-06T09:00:00-05:00', 'end' => '2027-01-06T10:00:00-05:00',
        ]);
        $this->http->patchEvent($this->account, 'me@example.com', 'new', [
            'title' => 'Anniversary', 'all_day' => true, 'start' => '2019-01-12', 'end' => '2019-01-13', 'yearly' => true,
        ]);

        Http::assertSent(fn (Request $request) => $request->method() === 'POST'
            && $request['summary'] === 'Call'
            && $request['start'] === ['dateTime' => '2027-01-06T09:00:00-05:00', 'timeZone' => 'America/New_York']
            && ! isset($request['recurrence']));
        Http::assertSent(fn (Request $request) => $request->method() === 'PATCH'
            && str_ends_with($request->url(), '/events/new')
            // Changing to all-day clears the time it had.
            && $request['start'] === ['date' => '2019-01-12', 'dateTime' => null, 'timeZone' => null]
            && $request['recurrence'] === ['RRULE:FREQ=YEARLY']);
    });

    it('tells a refused request from revoked access', function () {
        Http::fake(['*/calendarList*' => Http::response(['error' => ['message' => 'Google Calendar API has not been used in project 1 before or it is disabled.']], 403)]);

        try {
            $this->http->listCalendars($this->account);
            $this->fail('Expected an exception.');
        } catch (GoogleAuthException $e) {
            expect($e->revoked)->toBeFalse()->and($e->getMessage())->toContain('disabled');
        }
    });
});

it('keeps the notes Google has with an event', function () {
    $this->google->addEvent($this->mine, ['title' => 'Dentist', 'start' => '2027-01-05T14:00:00-05:00', 'description' => "Bring the insurance card.\nPark behind the building.", 'location' => '12 Main St']);
    $this->google->addEvent($this->mine, ['title' => 'Lunch', 'start' => '2027-01-05T12:00:00-05:00', 'description' => '']);
    pollCalendar();

    $this->getJson('/api/events?from=2027-01-05&to=2027-01-05')->assertOk()
        ->assertJsonPath('0.title', 'Lunch')
        ->assertJsonPath('0.description', null)
        ->assertJsonPath('1.description', "Bring the insurance card.\nPark behind the building.")
        ->assertJsonPath('1.location', '12 Main St');
});
