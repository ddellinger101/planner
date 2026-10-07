<?php

use App\Models\Item;
use App\Models\PeriodReview;
use App\Models\User;

beforeEach(function () {
    // Monday, January 4, 2027: the first day of week 1. The periods that
    // have just ended are 2026, 2026-Q4, 2026-12 and 2026-W53.
    $this->travelTo('2027-01-04 17:00:00');
    $this->user = signIn();
});

function openGoal(string $key, array $extra = []): Item
{
    return Item::factory()->ownedBy(test()->user)->period($key)->create($extra);
}

describe('pending reviews', function () {
    it('lists the periods that just ended with open items, broadest first', function () {
        openGoal('2026');
        openGoal('2026-Q4');
        openGoal('2026-Q4');
        openGoal('2026-12');
        openGoal('2026-W53');

        $this->getJson('/api/reviews/pending')->assertExactJson([
            ['period_key' => '2026', 'scope' => 'year', 'open_count' => 1, 'next_period_key' => '2027'],
            ['period_key' => '2026-Q4', 'scope' => 'quarter', 'open_count' => 2, 'next_period_key' => '2027-Q1'],
            ['period_key' => '2026-12', 'scope' => 'month', 'open_count' => 1, 'next_period_key' => '2027-01'],
            ['period_key' => '2026-W53', 'scope' => 'week', 'open_count' => 1, 'next_period_key' => '2027-W01'],
        ]);
    });

    it('ignores finished items, older periods, the current period and other households', function () {
        openGoal('2026-12', ['status' => 'done']);
        openGoal('2026-12', ['status' => 'dropped']);
        openGoal('2026-11');
        openGoal('2027-01');
        Item::factory()->ownedBy(User::factory()->create())->period('2026-12')->create();

        $this->getJson('/api/reviews/pending')->assertExactJson([]);
    });

    it('uses the user\'s timezone to decide which period has ended', function () {
        openGoal('2026-12');
        // 3 AM UTC on January 1 is still December 31 in New York.
        $this->travelTo('2027-01-01 03:00:00');

        $this->getJson('/api/reviews/pending')->assertJsonMissing(['period_key' => '2026-12']);

        $this->travelTo('2027-01-01 06:00:00');

        $this->getJson('/api/reviews/pending')->assertJsonFragment(['period_key' => '2026-12']);
    });

    it('stops listing a period once its review is marked done, for the whole household', function () {
        openGoal('2026-12');

        $this->postJson('/api/reviews', ['period_key' => '2026-12'])->assertCreated();
        $this->postJson('/api/reviews', ['period_key' => '2026-12'])->assertCreated(); // harmless to repeat

        expect(PeriodReview::count())->toBe(1);
        $this->getJson('/api/reviews/pending')->assertExactJson([]);

        $this->actingAs(User::factory()->create(['household_id' => $this->user->household_id]));
        $this->getJson('/api/reviews/pending')->assertExactJson([]);
    });

    it('does not accept a review of a single day', function () {
        $this->postJson('/api/reviews', ['period_key' => '2027-01-03'])->assertJsonValidationErrors('period_key');
    });
});

describe('carry forward', function () {
    it('copies a goal into the next period and closes the original', function () {
        $parent = openGoal('2026-Q4');
        $liz = User::factory()->create(['household_id' => $this->user->household_id]);
        $goal = openGoal('2026-12', [
            'title' => 'Paint the hallway', 'notes' => 'Two coats', 'starred' => true,
            'assignee_user_id' => $liz->id, 'parent_item_id' => $parent->id,
        ]);

        $this->postJson("/api/items/{$goal->id}/carry")
            ->assertCreated()
            ->assertJson([
                'title' => 'Paint the hallway', 'notes' => 'Two coats', 'starred' => true,
                'scope' => 'month', 'period_key' => '2027-01', 'status' => 'open',
                'assignee_user_id' => $liz->id, 'parent_item_id' => $parent->id,
                'carried_from_item_id' => $goal->id, 'category_id' => $goal->category_id,
            ]);

        expect($goal->refresh()->status->value)->toBe('dropped');
    });

    it('crosses a year boundary and can target a later period', function () {
        $week = openGoal('2026-W53');
        $year = openGoal('2026');

        $this->postJson("/api/items/{$week->id}/carry")->assertJson(['period_key' => '2027-W01']);
        $this->postJson("/api/items/{$year->id}/carry", ['period_key' => '2028'])->assertJson(['period_key' => '2028']);
    });

    it('refuses day tasks, finished items, earlier periods and mismatched scopes', function () {
        $day = Item::factory()->ownedBy($this->user)->create();
        $done = openGoal('2026-12', ['status' => 'done']);
        $goal = openGoal('2026-12');

        $this->postJson("/api/items/{$day->id}/carry")->assertStatus(422);
        $this->postJson("/api/items/{$done->id}/carry")->assertConflict();
        $this->postJson("/api/items/{$goal->id}/carry", ['period_key' => '2026-11'])->assertStatus(422);
        $this->postJson("/api/items/{$goal->id}/carry", ['period_key' => '2026-12'])->assertStatus(422);
        $this->postJson("/api/items/{$goal->id}/carry", ['period_key' => '2027-W01'])->assertJsonValidationErrors('period_key');

        expect(Item::count())->toBe(3);
    });

    it('cannot carry another household\'s item', function () {
        $theirs = Item::factory()->ownedBy(User::factory()->create())->period('2026-12')->create();

        $this->postJson("/api/items/{$theirs->id}/carry")->assertNotFound();
    });

    it('clears a period from the pending list once everything is dealt with', function () {
        $a = openGoal('2026-12');
        $b = openGoal('2026-12');

        $this->postJson("/api/items/{$a->id}/carry");
        $this->patchJson("/api/items/{$b->id}", ['status' => 'done']);

        $this->getJson('/api/reviews/pending')->assertExactJson([]);
    });
});
