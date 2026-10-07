<?php

use App\Models\Household;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    // No test may reach the real internet: Google is always faked.
    ->beforeEach(fn () => Http::preventStrayRequests())
    ->in('Feature');

/** Sign in as a new user, optionally in an existing household. */
function signIn(?Household $household = null): User
{
    $user = User::factory()->create($household ? ['household_id' => $household->id] : []);

    test()->actingAs($user);

    return $user;
}
