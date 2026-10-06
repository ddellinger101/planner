<?php

use App\Models\GoogleAccount;
use App\Models\Household;
use App\Models\User;
use Laravel\Socialite\Facades\Socialite;
use Laravel\Socialite\Two\User as GoogleUser;

beforeEach(function () {
    config(['planner.allowed_emails' => ['dustin@example.com', 'elizabeth@example.com']]);
});

function googleReturns(string $email, string $sub = 'sub-1', bool $verified = true, string $name = 'Dustin'): void
{
    $user = (new GoogleUser)
        ->setRaw(['email_verified' => $verified])
        ->map(['id' => $sub, 'name' => $name, 'email' => $email, 'avatar' => 'https://example.com/a.png']);

    Socialite::shouldReceive('driver->user')->andReturn($user);
}

it('signs in an allowlisted Google account and creates the household', function () {
    googleReturns('Dustin@Example.com');

    $this->get('/auth/google/callback')->assertRedirect('/');

    $user = User::sole();

    expect($user->email)->toBe('dustin@example.com')
        ->and($user->name)->toBe('Dustin')
        ->and($user->avatar_url)->toBe('https://example.com/a.png')
        ->and($user->household->name)->toBe(config('planner.household_name'))
        ->and(GoogleAccount::sole()->only(['user_id', 'google_sub']))->toBe(['user_id' => $user->id, 'google_sub' => 'sub-1']);

    $this->assertAuthenticatedAs($user);
});

it('puts the second person in the same household', function () {
    $dustin = User::factory()->create(['email' => 'dustin@example.com']);
    googleReturns('elizabeth@example.com', 'sub-2', name: 'Elizabeth');

    $this->get('/auth/google/callback')->assertRedirect('/');

    expect(Household::count())->toBe(1)
        ->and(User::where('email', 'elizabeth@example.com')->sole()->household_id)->toBe($dustin->household_id);
});

it('does not duplicate a returning user or overwrite their name', function () {
    $dustin = User::factory()->create(['email' => 'dustin@example.com', 'name' => 'Dusty']);
    googleReturns('dustin@example.com');

    $this->get('/auth/google/callback');
    $this->get('/auth/google/callback');

    expect(User::count())->toBe(1)
        ->and(GoogleAccount::count())->toBe(1)
        ->and($dustin->refresh()->name)->toBe('Dusty');
});

it('turns away accounts that are not on the allowlist', function () {
    googleReturns('stranger@example.com');

    $this->get('/auth/google/callback')->assertRedirect('/?auth_error=not_allowed');

    expect(User::count())->toBe(0);
    $this->assertGuest();
});

it('turns away an allowlisted address that Google has not verified', function () {
    googleReturns('dustin@example.com', verified: false);

    $this->get('/auth/google/callback')->assertRedirect('/?auth_error=not_allowed');

    $this->assertGuest();
});

it('recovers when Google returns an error', function () {
    Socialite::shouldReceive('driver->user')->andThrow(new RuntimeException('denied'));

    $this->get('/auth/google/callback')->assertRedirect('/?auth_error=failed');

    $this->assertGuest();
});

it('sends the browser to Google with basic profile scopes', function () {
    config(['services.google.client_id' => 'client-id', 'services.google.client_secret' => 'secret']);

    $location = $this->get('/auth/google/redirect')->assertRedirect()->headers->get('Location');

    expect($location)->toStartWith('https://accounts.google.com/')
        ->and(urldecode($location))->toContain('scope=openid profile email&')
        ->and($location)->not->toContain('tasks')
        ->and($location)->not->toContain('calendar');
});

it('signs out', function () {
    signIn();

    $this->post('/auth/logout')->assertNoContent();

    $this->assertGuest();
});

it('requires sign-in for every API route', function (string $method, string $uri) {
    $this->json($method, $uri)->assertUnauthorized();
})->with([
    ['GET', '/api/me'],
    ['GET', '/api/categories'],
    ['GET', '/api/items'],
    ['POST', '/api/items'],
    ['GET', '/api/journal'],
    ['GET', '/api/meals'],
    ['GET', '/api/weight'],
    ['GET', '/api/habits'],
    ['GET', '/api/brain-dump'],
    ['GET', '/api/rewards'],
]);

it('describes the signed-in user and their household', function () {
    $dustin = signIn();
    $elizabeth = User::factory()->create(['household_id' => $dustin->household_id]);
    User::factory()->create(); // someone in another household

    $this->getJson('/api/me')
        ->assertOk()
        ->assertJsonPath('user.email', $dustin->email)
        ->assertJsonPath('user.timezone', 'America/New_York')
        ->assertJsonPath('household.members.*.id', [$dustin->id, $elizabeth->id])
        ->assertJsonMissingPath('user.password');
});

it('lists the six planner categories in order', function () {
    signIn();

    $this->getJson('/api/categories')
        ->assertOk()
        ->assertJsonPath('*.slug', ['health', 'finances', 'home', 'family', 'only-4-you', 'other']);
});
