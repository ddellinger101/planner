<?php

use App\Models\Category;
use App\Models\ImportantDate;
use App\Models\Item;
use App\Models\User;

describe('important dates', function () {
    it('creates, edits and deletes a date', function () {
        $user = signIn();
        $family = Category::where('slug', 'family')->value('id');

        $id = $this->postJson('/api/important-dates', [
            'title' => 'Anniversary', 'date' => '2027-06-12', 'repeats_yearly' => true, 'category_id' => $family,
        ])
            ->assertCreated()
            ->assertJson(['title' => 'Anniversary', 'date' => '2027-06-12', 'repeats_yearly' => true, 'household_id' => $user->household_id])
            ->json('id');

        $this->patchJson("/api/important-dates/{$id}", ['title' => 'Wedding anniversary'])
            ->assertOk()->assertJson(['title' => 'Wedding anniversary', 'date' => '2027-06-12']);

        $this->deleteJson("/api/important-dates/{$id}")->assertNoContent();
        expect(ImportantDate::count())->toBe(0);
    });

    it('lists the dates in a range in order, repeating the yearly ones', function () {
        signIn();
        ImportantDate::create(['title' => 'Recital', 'date' => '2027-06-20']);
        ImportantDate::create(['title' => 'Anniversary', 'date' => '2019-06-12', 'repeats_yearly' => true]);
        ImportantDate::create(['title' => 'Dentist', 'date' => '2027-07-02']);
        ImportantDate::create(['title' => 'One-off last year', 'date' => '2026-06-15']);

        $this->getJson('/api/important-dates?from=2027-06-01&to=2027-06-30')
            ->assertJsonPath('*.title', ['Anniversary', 'Recital'])
            ->assertJsonPath('0.occurs_on', '2027-06-12')
            ->assertJsonPath('0.date', '2019-06-12')
            ->assertJsonPath('1.occurs_on', '2027-06-20');

        // A range that spans two years shows a yearly date in both.
        $this->getJson('/api/important-dates?from=2027-06-01&to=2028-06-30')
            ->assertJsonPath('*.occurs_on', ['2027-06-12', '2027-06-20', '2027-07-02', '2028-06-12']);
    });

    it('does not show a yearly date before its first year', function () {
        signIn();
        ImportantDate::create(['title' => 'Birthday', 'date' => '2027-03-10', 'repeats_yearly' => true]);

        $this->getJson('/api/important-dates?from=2026-03-01&to=2026-03-31')->assertJsonCount(0);
        $this->getJson('/api/important-dates?from=2028-03-01&to=2028-03-31')->assertJsonCount(1);
    });

    it('keeps a February 29 date on the 28th in other years', function () {
        signIn();
        ImportantDate::create(['title' => 'Leap birthday', 'date' => '2024-02-29', 'repeats_yearly' => true]);

        $this->getJson('/api/important-dates?from=2027-02-01&to=2027-02-28')->assertJsonPath('0.occurs_on', '2027-02-28');
        $this->getJson('/api/important-dates?from=2028-02-01&to=2028-02-29')->assertJsonPath('0.occurs_on', '2028-02-29');
    });

    it('validates input and hides other households', function () {
        $stranger = User::factory()->create();
        $theirs = ImportantDate::create(['household_id' => $stranger->household_id, 'title' => 'Theirs', 'date' => '2027-06-12']);

        signIn();

        $this->postJson('/api/important-dates', ['title' => '', 'date' => 'June 12'])->assertJsonValidationErrors(['title', 'date']);
        $this->getJson('/api/important-dates')->assertJsonValidationErrors(['from', 'to']);
        $this->getJson('/api/important-dates?from=2027-06-01&to=2027-06-30')->assertJsonCount(0);
        $this->patchJson("/api/important-dates/{$theirs->id}", ['title' => 'Mine'])->assertNotFound();
        $this->deleteJson("/api/important-dates/{$theirs->id}")->assertNotFound();
    });
});

describe('goal summary', function () {
    it('counts items and finished items per period and category', function () {
        $user = signIn();
        $health = Category::where('slug', 'health')->value('id');
        $home = Category::where('slug', 'home')->value('id');
        $make = fn (string $key, int $category, string $status = 'open') => Item::factory()
            ->ownedBy($user)->period($key)->create(['category_id' => $category, 'status' => $status]);

        $make('2027-01', $health, 'done');
        $make('2027-01', $health);
        $make('2027-01', $home, 'done');
        $make('2027-01', $home, 'dropped');
        $make('2027-02', $health);
        $make('2027-03', $health); // not asked for

        $this->getJson('/api/items/summary?period_keys[]=2027-01&period_keys[]=2027-02')
            ->assertExactJson([
                ['period_key' => '2027-01', 'category_id' => $health, 'total' => 2, 'done' => 1],
                ['period_key' => '2027-01', 'category_id' => $home, 'total' => 1, 'done' => 1],
                ['period_key' => '2027-02', 'category_id' => $health, 'total' => 1, 'done' => 0],
            ]);
    });

    it('respects the person filter and the household', function () {
        $user = signIn();
        $liz = User::factory()->create(['household_id' => $user->household_id]);
        Item::factory()->ownedBy($user)->period('2027-01')->create(['assignee_user_id' => $user->id]);
        Item::factory()->ownedBy($user)->period('2027-01')->create(['assignee_user_id' => $liz->id]);
        Item::factory()->ownedBy($user)->period('2027-01')->create(['assignee_user_id' => null]);
        Item::factory()->ownedBy(User::factory()->create())->period('2027-01')->create();

        $this->getJson('/api/items/summary?period_keys[]=2027-01')->assertJsonPath('0.total', 3);
        $this->getJson("/api/items/summary?period_keys[]=2027-01&person={$liz->id}")->assertJsonPath('0.total', 2);
        $this->getJson('/api/items/summary')->assertJsonValidationErrors('period_keys');
        $this->getJson('/api/items/summary?period_keys[]=nonsense')->assertJsonValidationErrors('period_keys.0');
    });
});
