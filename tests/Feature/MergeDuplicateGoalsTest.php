<?php

use App\Models\Item;

function goalWithId(int $id, string $title, array $extra = []): Item
{
    return Item::factory()->ownedBy(test()->user)->period($extra['period_key'] ?? '2026-11')
        ->create(['id' => $id, 'title' => $title, ...$extra]);
}

function runMergeDuplicateGoals(): void
{
    (require database_path('migrations/2026_11_01_000001_merge_duplicate_goals.php'))->up();
}

beforeEach(function () {
    $this->user = signIn();
});

it('drops the extras and moves what hung off them to the goal that stays', function () {
    $kept = goalWithId(763, 'Quit smoking');
    $extra = goalWithId(33, 'Quit smoking');
    $week = goalWithId(789, 'Quit smoking', ['period_key' => '2026-W45', 'parent_item_id' => 33]);

    runMergeDuplicateGoals();

    expect($extra->fresh()->status->value)->toBe('dropped')
        ->and($kept->fresh()->status->value)->toBe('open')
        ->and($week->fresh()->parent_item_id)->toBe(763);
});

it('leaves alone anything changed since the list was made', function () {
    goalWithId(760, 'Keep paying credit cards');
    $renamed = goalWithId(547, 'Credit cards, renamed');
    goalWithId(764, 'Visit my parents', ['status' => 'done']);
    $keeperClosed = goalWithId(548, 'Visit parents');

    runMergeDuplicateGoals();

    expect($renamed->fresh()->status->value)->toBe('open')
        ->and($keeperClosed->fresh()->status->value)->toBe('open');
});

it('corrects the links of goals that stay', function () {
    goalWithId(513, 'Cut the drinking', ['period_key' => '2026-Q4']);
    $month = goalWithId(751, 'Limit drinking to 2 days a week');

    runMergeDuplicateGoals();

    expect($month->fresh()->parent_item_id)->toBe(513);
});

it('does nothing on a database without these goals', function () {
    runMergeDuplicateGoals();

    expect(Item::count())->toBe(0);
});
