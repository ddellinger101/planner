<?php

use App\Models\Household;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

pest()->extend(TestCase::class)
    ->use(RefreshDatabase::class)
    ->in('Feature');

/** Sign in as a new user, optionally in an existing household. */
function signIn(?Household $household = null): User
{
    $user = User::factory()->create($household ? ['household_id' => $household->id] : []);

    test()->actingAs($user);

    return $user;
}
