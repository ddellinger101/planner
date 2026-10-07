<?php

use App\Models\Category;
use App\Models\Habit;
use App\Models\Item;
use App\Models\User;

beforeEach(function () {
    $this->travelTo('2027-01-20 17:00:00');
    $this->user = signIn();
});

function habit(array $extra = []): Habit
{
    return Habit::create(['user_id' => test()->user->id, 'title' => 'Floss', 'active_from' => '2026-01-01', ...$extra]);
}

it('reports streaks and completion for each habit', function () {
    $floss = habit();
    $run = habit(['title' => 'Run', 'target_per_week' => 3]);

    foreach (['2027-01-18', '2027-01-19', '2027-01-20'] as $date) {
        $floss->checks()->create(['date' => $date]);
    }
    foreach (['2027-01-11', '2027-01-13', '2027-01-15'] as $date) {
        $run->checks()->create(['date' => $date]);
    }

    $this->getJson('/api/habits/stats')
        ->assertOk()
        ->assertJsonPath("{$floss->id}.streak_unit", 'days')
        ->assertJsonPath("{$floss->id}.current_streak", 3)
        ->assertJsonPath("{$floss->id}.completion", 10)
        ->assertJsonPath("{$run->id}.streak_unit", 'weeks')
        ->assertJsonPath("{$run->id}.current_streak", 1)
        ->assertJsonPath("{$run->id}.done_total", 3);
});

it('decides what today is in the user\'s timezone', function () {
    $floss = habit();
    $floss->checks()->create(['date' => '2027-01-20']);

    // 2 AM UTC on the 21st is still the evening of the 20th in New York.
    $this->travelTo('2027-01-21 02:00:00');

    $this->getJson('/api/habits/stats')->assertJsonPath("{$floss->id}.current_streak", 1);
});

it('returns an object, filters by person and leaves out other households', function () {
    $this->getJson('/api/habits/stats')->assertExactJson([]);
    expect($this->getJson('/api/habits/stats')->getContent())->toBe('{}');

    $liz = User::factory()->create(['household_id' => $this->user->household_id]);
    $mine = habit();
    $hers = habit(['user_id' => $liz->id, 'title' => 'Read']);
    $stranger = User::factory()->create();
    $theirs = Habit::create([
        'household_id' => $stranger->household_id, 'user_id' => $stranger->id, 'title' => 'Theirs', 'active_from' => '2026-01-01',
    ]);

    expect(array_keys($this->getJson('/api/habits/stats')->json()))->toBe([$mine->id, $hers->id])
        ->and(array_keys($this->getJson("/api/habits/stats?person={$liz->id}")->json()))->toBe([$hers->id])
        ->and($theirs->exists)->toBeTrue();
});

it('puts a new habit at the end and reorders on request', function () {
    $a = $this->postJson('/api/habits', ['title' => 'A'])->json('id');
    $b = $this->postJson('/api/habits', ['title' => 'B'])->json('id');
    $c = $this->postJson('/api/habits', ['title' => 'C'])->json('id');

    $this->getJson('/api/habits')->assertJsonPath('*.id', [$a, $b, $c]);

    $this->postJson('/api/habits/reorder', ['ids' => [$c, $a, $b]])->assertNoContent();

    $this->getJson('/api/habits')->assertJsonPath('*.id', [$c, $a, $b]);
});

it('ignores another household\'s habit when reordering', function () {
    $mine = habit();
    $stranger = User::factory()->create();
    $theirs = Habit::create([
        'household_id' => $stranger->household_id, 'user_id' => $stranger->id, 'title' => 'Theirs',
        'active_from' => '2026-01-01', 'sort' => 5,
    ]);

    $this->postJson('/api/habits/reorder', ['ids' => [$theirs->id, $mine->id]])->assertNoContent();

    expect(Habit::withoutGlobalScope('household')->find($theirs->id)->sort)->toBe(5)
        ->and($mine->refresh()->sort)->toBe(1);
});

it('lists the repeating tasks in a routine, one row per series', function () {
    $category = Category::where('slug', 'home')->value('id');
    $make = fn (array $extra) => $this->postJson('/api/items', [
        'title' => 'Make the bed', 'category_id' => $category, 'scope' => 'day', 'period_key' => '2027-01-20', ...$extra,
    ])->json('id');

    $morning = $make(['routine' => 'morning', 'recurrence_rule' => 'FREQ=DAILY']);
    $make(['title' => 'Tidy up', 'routine' => 'evening', 'recurrence_rule' => 'FREQ=DAILY']);
    $make(['title' => 'One-off', 'routine' => 'morning']);

    expect(Item::count())->toBeGreaterThan(100);

    $this->getJson('/api/items?series=1&routine=morning')->assertJsonPath('*.id', [$morning]);
    $this->getJson('/api/items?series=1')->assertJsonCount(2);
    $this->getJson('/api/items?routine=bedtime')->assertJsonValidationErrors('routine');
});
