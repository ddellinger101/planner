<?php

use App\Models\User;

it('changes the name, color and time zone a person is shown with', function () {
    $user = signIn();
    $partner = User::factory()->create(['household_id' => $user->household_id, 'name' => 'Elizabeth']);

    $this->patchJson('/api/me', ['name' => 'Dustin', 'color' => '#3b7dd8', 'timezone' => 'America/Chicago'])
        ->assertOk()
        ->assertJsonPath('user.name', 'Dustin')
        ->assertJsonPath('user.color', '#3b7dd8')
        ->assertJsonPath('user.timezone', 'America/Chicago')
        // The household list, which the person filter is drawn from, follows.
        ->assertJsonPath('household.members.0.name', 'Dustin')
        ->assertJsonPath('household.members.0.color', '#3b7dd8');

    // Only your own profile.
    expect($partner->refresh()->name)->toBe('Elizabeth');
});

it('rejects a profile that makes no sense', function () {
    signIn();

    $this->patchJson('/api/me', ['name' => '', 'color' => 'teal', 'timezone' => 'Mars/Olympus'])
        ->assertJsonValidationErrors(['name', 'color', 'timezone']);
});

it('hands out person colors in order, skipping the ones in use', function () {
    $user = signIn();
    $user->update(['color' => User::PERSON_COLORS[1]]);

    expect(User::nextColorFor($user->household_id))->toBe(User::PERSON_COLORS[0]);

    User::factory()->create(['household_id' => $user->household_id, 'color' => User::PERSON_COLORS[0]]);

    expect(User::nextColorFor($user->household_id))->toBe(User::PERSON_COLORS[2]);
});
