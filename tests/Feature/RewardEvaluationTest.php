<?php

use App\Models\Item;
use App\Models\Reward;
use App\Models\User;
use App\Services\RewardEvaluator;

beforeEach(function () {
    $this->travelTo('2027-01-04 17:00:00');
    $this->user = signIn();
});

/** A reward due at the end of January 10 (New York), linked to the given number of tasks. */
function rewardWith(int $tasks, array $extra = []): array
{
    $items = Item::factory()->ownedBy(test()->user)->count($tasks)->create();

    $id = test()->postJson('/api/rewards', [
        'title' => 'Movie night', 'deadline' => '2027-01-10', 'item_ids' => $items->pluck('id')->all(), ...$extra,
    ])->assertCreated()->json('id');

    return [Reward::find($id), $items];
}

function finish(Item $item): void
{
    test()->patchJson("/api/items/{$item->id}", ['status' => 'done'])->assertOk();
}

it('is earned when the last linked task is finished before the deadline', function () {
    [$reward, $items] = rewardWith(3);

    finish($items[0]);
    finish($items[1]);
    expect($reward->refresh()->status->value)->toBe('active');

    $this->travelTo('2027-01-06 15:00:00');
    finish($items[2]);

    expect($reward->refresh()->status->value)->toBe('earned')
        ->and($reward->earned_at->toDateTimeString())->toBe('2027-01-06 15:00:00');
});

it('stays earned if a task is reopened afterwards', function () {
    [$reward, $items] = rewardWith(1);
    finish($items[0]);

    $this->patchJson("/api/items/{$items[0]->id}", ['status' => 'open']);

    expect($reward->refresh()->status->value)->toBe('earned');
});

it('expires when the deadline passes first', function () {
    [$reward, $items] = rewardWith(2);
    finish($items[0]);

    // The deadline is 23:59:59 on January 10 in New York: 04:59:59 UTC on the 11th.
    $this->travelTo('2027-01-11 04:59:00');
    app(RewardEvaluator::class)->evaluateAll();
    expect($reward->refresh()->status->value)->toBe('active');

    $this->travelTo('2027-01-11 05:00:00');
    app(RewardEvaluator::class)->evaluateAll();
    expect($reward->refresh()->status->value)->toBe('expired');

    // Finishing late doesn't bring it back.
    finish($items[1]);
    expect($reward->refresh()->status->value)->toBe('expired');
});

it('is not earned by a task finished after the deadline', function () {
    [$reward, $items] = rewardWith(1);

    $this->travelTo('2027-01-12 17:00:00');
    finish($items[0]);

    expect($reward->refresh()->status->value)->toBe('expired');
});

it('stops counting tasks that are dropped or deleted', function () {
    [$reward, $items] = rewardWith(3);
    finish($items[0]);

    $this->patchJson("/api/items/{$items[1]->id}", ['status' => 'dropped']);
    expect($reward->refresh()->status->value)->toBe('active');

    $this->deleteJson("/api/items/{$items[2]->id}");
    expect($reward->refresh()->status->value)->toBe('earned');
});

it('is not earned when every task was dropped', function () {
    [$reward, $items] = rewardWith(1);

    $this->patchJson("/api/items/{$items[0]->id}", ['status' => 'dropped']);

    expect($reward->refresh()->status->value)->toBe('active');
});

it('is earned at once when the chosen tasks are already done', function () {
    $item = Item::factory()->ownedBy($this->user)->create();
    finish($item);

    $this->postJson('/api/rewards', ['title' => 'Treat', 'deadline' => '2027-01-10', 'item_ids' => [$item->id]])
        ->assertCreated()
        ->assertJson(['status' => 'earned']);
});

it('expires overdue rewards when the list is opened, and revives one given a later deadline', function () {
    [$reward] = rewardWith(1);
    $this->travelTo('2027-01-15 17:00:00');

    $this->getJson('/api/rewards')->assertJsonPath('0.status', 'expired');

    $this->patchJson("/api/rewards/{$reward->id}", ['deadline' => '2027-01-20'])
        ->assertOk()
        ->assertJson(['status' => 'active']);
});

it('walks from active to earned to claimed', function () {
    [$reward, $items] = rewardWith(1);

    $this->postJson("/api/rewards/{$reward->id}/claim")->assertConflict();
    finish($items[0]);
    $this->postJson("/api/rewards/{$reward->id}/claim")->assertOk()->assertJson(['status' => 'claimed']);
    $this->postJson("/api/rewards/{$reward->id}/claim")->assertConflict();
});

it('only touches the rewards a task belongs to, in its own household', function () {
    [$mine, $items] = rewardWith(1);
    [$other] = rewardWith(1);

    $stranger = User::factory()->create();
    $theirItem = Item::factory()->ownedBy($stranger)->create();
    $theirs = Reward::withoutGlobalScope('household')->create([
        'household_id' => $stranger->household_id, 'created_by' => $stranger->id,
        'title' => 'Theirs', 'deadline' => '2027-01-10 00:00:00',
    ]);
    $theirs->items()->attach($theirItem->id);

    finish($items[0]);

    expect($mine->refresh()->status->value)->toBe('earned')
        ->and($other->refresh()->status->value)->toBe('active')
        ->and(Reward::withoutGlobalScope('household')->find($theirs->id)->status->value)->toBe('active');
});
