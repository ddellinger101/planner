<?php

use App\Jobs\SyncGoogleAccount;
use App\Models\GoogleAccount;
use App\Models\ImportantDate;
use App\Models\User;
use App\Services\Google\BirthdaySync;
use App\Services\Google\GoogleAuthException;
use App\Services\Google\GoogleClient;
use App\Services\Google\GoogleContactsService;
use App\Services\Google\GoogleNotFoundException;
use App\Services\Google\GoogleTasksService;
use App\Services\Google\HttpGoogleContactsService;
use App\Services\Google\HttpGoogleTasksService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as SocialiteUser;
use Tests\Fakes\FakeGoogleContacts;
use Tests\Fakes\FakeGoogleTasks;

const BOTH_SCOPES = [GoogleClient::SCOPE_TASKS, GoogleClient::SCOPE_CONTACTS];

function account(User $user, array $extra = []): GoogleAccount
{
    return GoogleAccount::create([
        'user_id' => $user->id, 'google_sub' => 'sub-'.$user->id, 'email' => $user->email,
        'refresh_token' => 'refresh', 'access_token' => 'access', 'expires_at' => now()->addHour(),
        'scopes' => BOTH_SCOPES, ...$extra,
    ]);
}

describe('connecting', function () {
    beforeEach(function () {
        config([
            'planner.allowed_emails' => ['dustin@example.com'],
            'services.google.client_id' => 'client-id',
            'services.google.client_secret' => 'secret',
        ]);
    });

    /** What Google hands back at the end of the consent screen. */
    function googleGrants(array $scopes, ?string $refreshToken = 'new-refresh'): void
    {
        $user = (new SocialiteUser)
            ->setRaw(['email_verified' => true])
            ->map(['id' => 'sub-1', 'name' => 'Dustin', 'email' => 'dustin@example.com', 'avatar' => null])
            ->setToken('new-access')
            ->setRefreshToken($refreshToken)
            ->setExpiresIn(3599)
            ->setApprovedScopes(['openid', 'email', ...$scopes]);

        Socialite::shouldReceive('driver->user')->andReturn($user);
    }

    it('turns a guest away from the connect route', function () {
        $this->getJson('/auth/google/connect')->assertUnauthorized();
    });

    it('builds a consent URL for Tasks, Calendar and Contacts with offline access', function () {
        signIn();

        $location = urldecode($this->get('/auth/google/connect')->assertRedirect()->headers->get('Location'));

        expect($location)->toContain('auth/tasks')
            ->toContain('auth/contacts.readonly')
            ->toContain('access_type=offline')
            ->toContain('prompt=consent')
            ->toContain('auth/calendar.events')
            ->toContain('auth/calendar.readonly')
            ->toContain('include_granted_scopes=true');
    });

    it('stores the tokens, reads the lists and starts a first sync', function () {
        Queue::fake();
        $tasks = new FakeGoogleTasks;
        $tasks->addList('Health');
        $this->app->instance(GoogleTasksService::class, $tasks);
        googleGrants(BOTH_SCOPES);

        $this->withSession(['google_connecting' => true])
            ->get('/auth/google/callback')
            ->assertRedirect('/settings?google=connected');

        $account = GoogleAccount::sole();

        expect($account->refresh_token)->toBe('new-refresh')
            ->and($account->access_token)->toBe('new-access')
            ->and($account->canSyncTasks())->toBeTrue()
            ->and($account->canSyncContacts())->toBeTrue()
            ->and($account->taskLists()->pluck('title')->all())->toBe(['Health'])
            // Stored encrypted, never as plain text.
            ->and(DB::table('google_accounts')->value('refresh_token'))->not->toContain('new-refresh');

        Queue::assertPushed(SyncGoogleAccount::class, fn ($job) => $job->accountId === $account->id && $job->withBirthdays);
    });

    it('gives the second person to sign in a color of their own', function () {
        config(['planner.allowed_emails' => ['dustin@example.com', 'elizabeth@example.com']]);
        $dustin = User::factory()->create(['email' => 'dustin@example.com', 'color' => User::PERSON_COLORS[0]]);

        $google = (new SocialiteUser)
            ->setRaw(['email_verified' => true])
            ->map(['id' => 'sub-2', 'name' => 'Elizabeth', 'email' => 'elizabeth@example.com', 'avatar' => null])
            ->setToken('token')->setApprovedScopes(['openid', 'email']);
        Socialite::shouldReceive('driver->user')->andReturn($google);

        $this->get('/auth/google/callback')->assertRedirect('/');

        $elizabeth = User::where('email', 'elizabeth@example.com')->firstOrFail();

        expect($elizabeth->household_id)->toBe($dustin->household_id)
            ->and($elizabeth->color)->toBe(User::PERSON_COLORS[1]);

        // Signing in again doesn't change a color she has since picked.
        $elizabeth->update(['color' => '#8257d6']);
        $this->get('/auth/google/callback');

        expect($elizabeth->refresh()->color)->toBe('#8257d6');
    });

    it('says so when the consent boxes were left unticked', function () {
        Queue::fake();
        googleGrants([]);

        $this->withSession(['google_connecting' => true])
            ->get('/auth/google/callback')
            ->assertRedirect('/settings?google=declined');

        Queue::assertNothingPushed();
    });

    it('clears the reconnect flag when access is granted again', function () {
        Queue::fake();
        $this->app->instance(GoogleTasksService::class, new FakeGoogleTasks);
        $user = User::factory()->create(['email' => 'dustin@example.com']);
        GoogleAccount::create([
            'user_id' => $user->id, 'google_sub' => 'sub-1', 'email' => $user->email,
            'refresh_token' => 'dead', 'scopes' => BOTH_SCOPES, 'needs_reconnect' => true,
        ]);
        googleGrants(BOTH_SCOPES);

        $this->withSession(['google_connecting' => true])->get('/auth/google/callback');

        expect(GoogleAccount::sole()->only(['needs_reconnect', 'refresh_token']))
            ->toBe(['needs_reconnect' => false, 'refresh_token' => 'new-refresh']);
    });

    it('does not lose a working connection when the person simply signs in again', function () {
        $user = User::factory()->create(['email' => 'dustin@example.com']);
        GoogleAccount::create([
            'user_id' => $user->id, 'google_sub' => 'sub-1', 'email' => $user->email,
            'refresh_token' => 'kept', 'access_token' => 'kept-access', 'scopes' => BOTH_SCOPES,
        ]);
        // A plain sign-in: no refresh token, and only the basic scopes.
        googleGrants([], refreshToken: null);

        $this->get('/auth/google/callback')->assertRedirect('/');

        $account = GoogleAccount::sole();
        expect($account->refresh_token)->toBe('kept')
            ->and($account->access_token)->toBe('kept-access')
            ->and($account->canSyncTasks())->toBeTrue();
    });
});

describe('talking to Google', function () {
    beforeEach(function () {
        config(['services.google.client_id' => 'client-id', 'services.google.client_secret' => 'secret']);
        $this->account = account(User::factory()->create());
    });

    it('lists tasks page by page, asking for changes the way Google expects', function () {
        Http::fake([
            'tasks.googleapis.com/*' => Http::sequence()
                ->push(['items' => [['id' => 'a']], 'nextPageToken' => 'page-2'])
                ->push(['items' => [['id' => 'b']]]),
        ]);

        $tasks = app(HttpGoogleTasksService::class)->listTasks($this->account, 'list-1', now()->setDate(2027, 1, 4)->setTime(17, 0));

        expect(array_column($tasks, 'id'))->toBe(['a', 'b']);
        Http::assertSent(fn (Request $request) => $request->hasHeader('Authorization', 'Bearer access')
            && $request['showCompleted'] === 'true'
            && $request['showDeleted'] === 'true'
            && $request['showHidden'] === 'true'
            && $request['updatedMin'] === '2027-01-04T17:00:00Z');
        Http::assertSent(fn (Request $request) => ($request['pageToken'] ?? null) === 'page-2');
    });

    it('asks only for open tasks on a first import', function () {
        Http::fake(['tasks.googleapis.com/*' => Http::response(['items' => []])]);

        app(HttpGoogleTasksService::class)->listTasks($this->account, 'list-1');

        Http::assertSent(fn (Request $request) => $request['showCompleted'] === 'false' && ! isset($request['updatedMin']));
    });

    it('refreshes an expired access token before calling', function () {
        $this->account->update(['expires_at' => now()->subMinute()]);
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'fresh', 'expires_in' => 3600]),
            'tasks.googleapis.com/*' => Http::response(['items' => []]),
        ]);

        app(HttpGoogleTasksService::class)->listTaskLists($this->account);

        Http::assertSent(fn (Request $request) => str_contains($request->url(), 'oauth2')
            && $request['refresh_token'] === 'refresh'
            && $request['grant_type'] === 'refresh_token'
            && $request['client_id'] === 'client-id');
        Http::assertSent(fn (Request $request) => $request->hasHeader('Authorization', 'Bearer fresh'));
        expect($this->account->refresh()->access_token)->toBe('fresh')
            ->and($this->account->expires_at->isFuture())->toBeTrue();
    });

    it('refreshes and retries once when Google rejects the token early', function () {
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['access_token' => 'fresh', 'expires_in' => 3600]),
            'tasks.googleapis.com/*' => Http::sequence()->push([], 401)->push(['id' => 't1', 'etag' => 'e']),
        ]);

        $task = app(HttpGoogleTasksService::class)->insertTask($this->account, 'list-1', ['title' => 'x']);

        expect($task['id'])->toBe('t1');
    });

    it('reports revoked access, and a missing task, as their own errors', function () {
        Http::fake([
            'oauth2.googleapis.com/token' => Http::response(['error' => 'invalid_grant'], 400),
            'tasks.googleapis.com/tasks/v1/lists/list-1/tasks/gone' => Http::response([], 404),
            'tasks.googleapis.com/*' => Http::response([], 401),
        ]);
        $service = app(HttpGoogleTasksService::class);

        expect(fn () => $service->deleteTask($this->account, 'list-1', 'gone'))->toThrow(GoogleNotFoundException::class)
            ->and(fn () => $service->listTaskLists($this->account))->toThrow(GoogleAuthException::class);
    });

    it('reads birthdays from contacts, taking the primary name and date', function () {
        Http::fake(['people.googleapis.com/*' => Http::response(['connections' => [
            [
                'resourceName' => 'people/c1',
                'names' => [['displayName' => 'Nickname'], ['displayName' => 'Ada Lovelace', 'metadata' => ['primary' => true]]],
                'birthdays' => [
                    ['date' => ['month' => 1, 'day' => 1]],
                    ['date' => ['year' => 1815, 'month' => 12, 'day' => 10], 'metadata' => ['primary' => true]],
                ],
            ],
            ['resourceName' => 'people/c2', 'names' => [['displayName' => 'No Year']], 'birthdays' => [['date' => ['month' => 2, 'day' => 29]]]],
            ['resourceName' => 'people/c3', 'names' => [['displayName' => 'No Birthday']]],
            ['resourceName' => 'people/c4', 'birthdays' => [['date' => ['month' => 3, 'day' => 3]]]],
            ['resourceName' => 'people/c5', 'names' => [['displayName' => 'Text Only']], 'birthdays' => [['text' => 'spring']]],
        ]])]);

        expect(app(HttpGoogleContactsService::class)->listBirthdays($this->account))->toBe([
            ['resource_name' => 'people/c1', 'name' => 'Ada Lovelace', 'month' => 12, 'day' => 10, 'year' => 1815],
            ['resource_name' => 'people/c2', 'name' => 'No Year', 'month' => 2, 'day' => 29, 'year' => null],
        ]);
        Http::assertSent(fn (Request $request) => $request['personFields'] === 'names,birthdays');
    });
});

describe('birthdays', function () {
    beforeEach(function () {
        $this->travelTo('2027-01-04 17:00:00');
        $this->contacts = new FakeGoogleContacts;
        $this->app->instance(GoogleContactsService::class, $this->contacts);
        $this->app->instance(GoogleTasksService::class, new FakeGoogleTasks);
        $this->user = signIn();
        $this->account = account($this->user);
        $this->sync = app(BirthdaySync::class);
    });

    it('adds each contact\'s birthday as a yearly important date', function () {
        $this->contacts->add('Ada Lovelace', 12, 10, 1815);
        $this->contacts->add('Grace', 1, 9);

        $this->sync->syncAccount($this->account);

        $this->getJson('/api/important-dates?from=2027-01-01&to=2027-12-31')
            ->assertJsonPath('*.title', ['Grace’s birthday', 'Ada Lovelace’s birthday'])
            ->assertJsonPath('*.occurs_on', ['2027-01-09', '2027-12-10'])
            ->assertJsonPath('0.source', 'google_contacts')
            ->assertJsonPath('0.repeats_yearly', true)
            ->assertJsonMissingPath('0.google_resource_name');

        expect($this->account->refresh()->birthdays_synced_at)->not->toBeNull();
    });

    it('keeps a birthday hidden once it has been removed here', function () {
        $this->contacts->add('Elizabeth Hughes', 10, 2, 1975);
        $this->contacts->add('Grace', 1, 9);
        $this->sync->syncAccount($this->account);

        $hidden = ImportantDate::where('title', 'Elizabeth Hughes’s birthday')->firstOrFail();
        $this->deleteJson("/api/important-dates/{$hidden->id}")->assertNoContent();

        // The next read of Google Contacts doesn't bring it back.
        $this->sync->syncAccount($this->account);

        $this->getJson('/api/important-dates?from=2027-01-01&to=2027-12-31')
            ->assertJsonCount(1)
            ->assertJsonPath('0.title', 'Grace’s birthday');
        $this->getJson('/api/google')->assertJsonPath('birthday_count', 1);
        expect(ImportantDate::count())->toBe(2);
    });

    it('handles a February 29 birthday with no year', function () {
        $this->contacts->add('Leap', 2, 29);
        $this->sync->syncAccount($this->account);

        $this->getJson('/api/important-dates?from=2027-02-01&to=2027-02-28')->assertJsonPath('0.occurs_on', '2027-02-28');
        $this->getJson('/api/important-dates?from=2028-02-01&to=2028-02-29')->assertJsonPath('0.occurs_on', '2028-02-29');
    });

    it('follows renames, changed dates and removed contacts without duplicating', function () {
        $ada = $this->contacts->add('Ada', 12, 10);
        $this->contacts->add('Grace', 1, 9);
        $this->sync->syncAccount($this->account);

        $this->contacts->birthdays = [['resource_name' => $ada, 'name' => 'Ada L.', 'month' => 12, 'day' => 11, 'year' => null]];
        $this->sync->syncAccount($this->account);
        $this->sync->syncAccount($this->account);

        expect(ImportantDate::pluck('title')->all())->toBe(['Ada L.’s birthday'])
            ->and(ImportantDate::sole()->date->format('m-d'))->toBe('12-11');
    });

    it('leaves dates typed into the planner alone', function () {
        ImportantDate::create(['title' => 'Anniversary', 'date' => '2019-06-12', 'repeats_yearly' => true]);
        $this->contacts->add('Ada', 12, 10);

        $this->sync->syncAccount($this->account);
        $this->contacts->birthdays = [];
        $this->sync->syncAccount($this->account);

        expect(ImportantDate::pluck('title')->all())->toBe(['Anniversary']);
    });

    it('shows them to the whole household, and keeps each person\'s contacts apart', function () {
        $liz = User::factory()->create(['household_id' => $this->user->household_id]);
        $this->contacts->add('Ada', 12, 10);
        $this->sync->syncAccount($this->account);

        // Elizabeth's own sync finds no contacts; Dustin's birthdays stay.
        $this->contacts->birthdays = [];
        $this->sync->syncAccount(account($liz));

        $this->actingAs($liz);
        $this->getJson('/api/important-dates?from=2027-12-01&to=2027-12-31')->assertJsonCount(1);
    });

    it('can be turned off, which removes them, and back on', function () {
        $this->contacts->add('Ada', 12, 10);
        $this->sync->syncAccount($this->account);

        $this->patchJson('/api/google', ['sync_birthdays' => false])->assertOk()->assertJson(['sync_birthdays' => false, 'birthday_count' => 0]);
        expect(ImportantDate::count())->toBe(0);

        $this->patchJson('/api/google', ['sync_birthdays' => true])->assertJson(['birthday_count' => 1]);
    });

    it('can\'t be edited or deleted in the planner', function () {
        $this->contacts->add('Ada', 12, 10);
        $this->sync->syncAccount($this->account);
        $id = ImportantDate::sole()->id;

        $this->patchJson("/api/important-dates/{$id}", ['title' => 'Renamed'])->assertForbidden();
        $this->deleteJson("/api/important-dates/{$id}")->assertForbidden();
    });

    it('does nothing without contacts access, and flags a revoked account', function () {
        $this->contacts->add('Ada', 12, 10);

        $this->account->update(['scopes' => [GoogleClient::SCOPE_TASKS]]);
        $this->sync->syncAccount($this->account);
        expect(ImportantDate::count())->toBe(0);

        $this->account->update(['scopes' => BOTH_SCOPES]);
        $this->contacts->revoked = true;
        $this->sync->syncAccount($this->account);
        expect($this->account->refresh()->needs_reconnect)->toBeTrue();
    });

    it('is included when syncing on request', function () {
        $this->contacts->add('Ada', 12, 10);

        $this->postJson('/api/google/sync')->assertOk()->assertJson(['birthday_count' => 1, 'contacts_connected' => true]);
    });
});

it('schedules the poll, the birthday sync and the queue worker', function () {
    $this->artisan('schedule:list')
        ->expectsOutputToContain('google:sync')
        ->expectsOutputToContain('google:birthdays')
        ->expectsOutputToContain('queue:work');
});
