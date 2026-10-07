<?php

use App\Models\Category;
use App\Models\Item;
use App\Models\User;

function categoryId(string $slug = 'health'): int
{
    return Category::where('slug', $slug)->value('id');
}

it('creates a day task assigned to the person who added it', function () {
    $user = signIn();

    $this->postJson('/api/items', [
        'title' => 'Morning run',
        'category_id' => categoryId(),
        'scope' => 'day',
        'period_key' => '2027-01-04',
        'due_time' => '06:30',
        'starred' => true,
    ])
        ->assertCreated()
        ->assertJson([
            'title' => 'Morning run',
            'scope' => 'day',
            'period_key' => '2027-01-04',
            'due_date' => '2027-01-04',
            'starred' => true,
            'status' => 'open',
            'source' => 'app',
            'created_by' => $user->id,
            'assignee_user_id' => $user->id,
            'household_id' => $user->household_id,
        ]);
});

it('creates a goal that belongs to both people by default', function () {
    signIn();

    $this->postJson('/api/items', [
        'title' => 'Paint the hallway',
        'category_id' => categoryId('home'),
        'scope' => 'month',
        'period_key' => '2027-03',
    ])
        ->assertCreated()
        ->assertJson(['assignee_user_id' => null, 'due_date' => null]);
});

it('gives a Health goal to whoever added it, since health is personal', function () {
    $user = signIn();

    $this->postJson('/api/items', ['title' => 'Run a 10k', 'category_id' => categoryId(), 'scope' => 'month', 'period_key' => '2027-03'])
        ->assertCreated()
        ->assertJson(['assignee_user_id' => $user->id]);

    // It can still be given to both, or to the other person, on purpose.
    $this->postJson('/api/items', ['title' => 'Walk together', 'category_id' => categoryId(), 'scope' => 'month', 'period_key' => '2027-03', 'assignee_user_id' => null])
        ->assertCreated()
        ->assertJson(['assignee_user_id' => null]);
});

it('leaves out the other person\'s Health items when asked for own health only', function () {
    $user = signIn();
    $partner = User::factory()->create(['household_id' => $user->household_id]);

    $add = fn (string $title, string $slug, ?int $assignee) => Item::create([
        'title' => $title, 'category_id' => categoryId($slug), 'scope' => 'day', 'period_key' => '2027-01-04',
        'due_date' => '2027-01-04', 'created_by' => $user->id, 'assignee_user_id' => $assignee,
    ]);

    $add('My run', 'health', $user->id);
    $add('Their yoga', 'health', $partner->id);
    $add('Walk together', 'health', null);
    $add('Their errand', 'home', $partner->id);

    $titles = fn (string $query) => collect($this->getJson("/api/items?{$query}")->assertOk()->json())->pluck('title')->sort()->values()->all();

    expect($titles('period_key=2027-01-04&own_health=1'))->toBe(['My run', 'Their errand', 'Walk together'])
        ->and($titles('period_key=2027-01-04'))->toBe(['My run', 'Their errand', 'Their yoga', 'Walk together'])
        ->and($titles('from=2027-01-04&to=2027-01-04&own_health=1'))->toBe(['My run', 'Their errand', 'Walk together']);

    // The same goes for what is overdue and for the goal counts.
    expect(collect($this->getJson('/api/items/overdue?before=2027-01-05&own_health=1')->json())->pluck('title')->sort()->values()->all())
        ->toBe(['My run', 'Their errand', 'Walk together']);

    $health = collect($this->getJson('/api/items/summary?period_keys[]=2027-01-04&own_health=1')->json())
        ->firstWhere('category_id', categoryId());

    expect($health['total'])->toBe(2);
});

it('rejects a period key that does not match the scope', function (array $payload, string $field) {
    signIn();

    $this->postJson('/api/items', ['title' => 'x', 'category_id' => categoryId(), ...$payload])
        ->assertUnprocessable()
        ->assertJsonValidationErrors($field);
})->with([
    'month key on a week item' => [['scope' => 'week', 'period_key' => '2027-03'], 'period_key'],
    'malformed key' => [['scope' => 'week', 'period_key' => '2027-W60'], 'period_key'],
    'unknown scope' => [['scope' => 'decade', 'period_key' => '2027'], 'scope'],
    'missing category' => [['scope' => 'day', 'period_key' => '2027-01-04', 'category_id' => null], 'category_id'],
]);

it('keeps scope and period key consistent when only one is updated', function () {
    $user = signIn();
    $item = Item::factory()->ownedBy($user)->period('2027-03')->create();

    $this->patchJson("/api/items/{$item->id}", ['period_key' => '2027-W10'])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('period_key');

    $this->patchJson("/api/items/{$item->id}", ['period_key' => '2027-04'])
        ->assertOk()
        ->assertJson(['scope' => 'month', 'period_key' => '2027-04']);
});

it('moves a day task to another day', function () {
    $user = signIn();
    $item = Item::factory()->ownedBy($user)->create();

    $this->patchJson("/api/items/{$item->id}", ['period_key' => '2027-01-05'])
        ->assertOk()
        ->assertJson(['period_key' => '2027-01-05', 'due_date' => '2027-01-05']);
});

it('stamps and clears the completion time as the status changes', function () {
    $user = signIn();
    $item = Item::factory()->ownedBy($user)->create();

    $this->patchJson("/api/items/{$item->id}", ['status' => 'done'])->assertOk();
    expect($item->refresh()->completed_at)->not->toBeNull();

    $this->patchJson("/api/items/{$item->id}", ['status' => 'open'])->assertOk();
    expect($item->refresh()->completed_at)->toBeNull();

    $this->patchJson("/api/items/{$item->id}", ['status' => 'dropped'])->assertOk();
    expect($item->refresh()->completed_at)->toBeNull();
});

it('filters by period, status and person', function () {
    $dustin = signIn();
    $elizabeth = User::factory()->create(['household_id' => $dustin->household_id]);

    $mine = Item::factory()->ownedBy($dustin)->create(['assignee_user_id' => $dustin->id, 'title' => 'mine']);
    $hers = Item::factory()->ownedBy($dustin)->create(['assignee_user_id' => $elizabeth->id, 'title' => 'hers']);
    $both = Item::factory()->ownedBy($dustin)->create(['assignee_user_id' => null, 'title' => 'both', 'status' => 'done']);
    $goal = Item::factory()->ownedBy($dustin)->period('2027-01')->create(['title' => 'goal']);

    $this->getJson('/api/items?period_key=2027-01-04')->assertJsonCount(3);
    $this->getJson('/api/items?scope=month')->assertJsonPath('*.id', [$goal->id]);
    $this->getJson('/api/items?period_key=2027-01-04&status=open')->assertJsonPath('*.id', [$mine->id, $hers->id]);
    $this->getJson("/api/items?period_key=2027-01-04&person={$dustin->id}")->assertJsonPath('*.id', [$mine->id, $both->id]);
    $this->getJson("/api/items?period_key=2027-01-04&person={$elizabeth->id}")->assertJsonPath('*.id', [$hers->id, $both->id]);
    $this->getJson('/api/items?from=2027-01-01&to=2027-01-31')->assertJsonCount(3);
    $this->getJson('/api/items?from=2027-01-05&to=2027-01-31')->assertJsonCount(0);
});

it('lists starred items first, then by manual order', function () {
    $user = signIn();
    $second = Item::factory()->ownedBy($user)->create(['sort' => 2]);
    $first = Item::factory()->ownedBy($user)->create(['sort' => 1]);
    $starred = Item::factory()->ownedBy($user)->create(['sort' => 9, 'starred' => true]);

    $this->getJson('/api/items')->assertJsonPath('*.id', [$starred->id, $first->id, $second->id]);
});

it('soft-deletes an item', function () {
    $user = signIn();
    $item = Item::factory()->ownedBy($user)->create();

    $this->deleteJson("/api/items/{$item->id}")->assertNoContent();

    $this->getJson('/api/items')->assertJsonCount(0);
    expect(Item::withTrashed()->find($item->id)->trashed())->toBeTrue();
});

it('hides another household\'s items completely', function () {
    $stranger = User::factory()->create();
    $theirs = Item::factory()->ownedBy($stranger)->create();

    $user = signIn();

    $this->getJson('/api/items')->assertJsonCount(0);
    $this->getJson("/api/items/{$theirs->id}")->assertNotFound();
    $this->patchJson("/api/items/{$theirs->id}", ['title' => 'hacked'])->assertNotFound();
    $this->deleteJson("/api/items/{$theirs->id}")->assertNotFound();

    // Nor can it be referenced from this household's data.
    $this->postJson('/api/items', [
        'title' => 'x', 'category_id' => categoryId(), 'scope' => 'day', 'period_key' => '2027-01-04',
        'parent_item_id' => $theirs->id,
    ])->assertJsonValidationErrors('parent_item_id');

    $this->postJson('/api/items', [
        'title' => 'x', 'category_id' => categoryId(), 'scope' => 'day', 'period_key' => '2027-01-04',
        'assignee_user_id' => $stranger->id,
    ])->assertJsonValidationErrors('assignee_user_id');

    expect($theirs->refresh()->title)->not->toBe('hacked')
        ->and(Item::count())->toBe(0); // scoped to the signed-in household
});

it('links a week item to the month goal it was pulled from', function () {
    $user = signIn();
    $goal = Item::factory()->ownedBy($user)->period('2027-03')->create();

    $this->postJson('/api/items', [
        'title' => 'First step', 'category_id' => categoryId(), 'scope' => 'week', 'period_key' => '2027-W10',
        'parent_item_id' => $goal->id,
    ])->assertCreated()->assertJson(['parent_item_id' => $goal->id]);

    expect($goal->children()->count())->toBe(1);
});
