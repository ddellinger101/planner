<?php

use App\Enums\Routine;
use App\Models\Category;
use App\Models\Item;
use App\Models\User;
use App\Services\RecurrenceService;

beforeEach(function () {
    // A Monday, midday in New York.
    $this->travelTo('2027-01-04 17:00:00');
    $this->user = signIn();
});

/** Create a repeating task through the API and return its id. */
function repeating(string $rule, array $extra = []): int
{
    return test()->postJson('/api/items', [
        'title' => 'Take vitamins',
        'category_id' => Category::where('slug', 'health')->value('id'),
        'scope' => 'day',
        'period_key' => '2027-01-04',
        'recurrence_rule' => $rule,
        ...$extra,
    ])->assertCreated()->json('id');
}

function occurrenceOn(string $date): ?Item
{
    return Item::where('period_key', $date)->first();
}

function dates(): array
{
    return Item::orderBy('period_key')->pluck('period_key')->all();
}

it('generates a daily task 60 days ahead', function () {
    $id = repeating('FREQ=DAILY');

    expect(Item::count())->toBe(61)
        ->and(dates()[0])->toBe('2027-01-04')
        ->and(last(dates()))->toBe('2027-03-05')
        ->and(Item::where('recurrence_parent_id', $id)->count())->toBe(60)
        ->and(Item::find($id)->recurrence_date->toDateString())->toBe('2027-01-04');
});

it('copies the task onto each occurrence', function () {
    $liz = User::factory()->create(['household_id' => $this->user->household_id]);

    repeating('FREQ=WEEKLY;BYDAY=MO,WE', [
        'due_time' => '07:30', 'duration_minutes' => 15, 'starred' => true,
        'routine' => 'morning', 'assignee_user_id' => $liz->id, 'notes' => 'With breakfast',
    ]);

    expect(array_slice(dates(), 0, 4))->toBe(['2027-01-04', '2027-01-06', '2027-01-11', '2027-01-13']);

    expect(occurrenceOn('2027-01-06')->only([
        'title', 'notes', 'due_time', 'duration_minutes', 'starred', 'routine', 'assignee_user_id',
        'recurrence_rule', 'household_id', 'created_by',
    ]))->toBe([
        'title' => 'Take vitamins', 'notes' => 'With breakfast', 'due_time' => '07:30', 'duration_minutes' => 15,
        'starred' => true, 'routine' => Routine::Morning, 'assignee_user_id' => $liz->id,
        'recurrence_rule' => 'FREQ=WEEKLY;BYDAY=MO,WE', 'household_id' => $this->user->household_id,
        'created_by' => $this->user->id,
    ]);
});

it('supports the monthly and yearly presets', function (string $rule, array $expected) {
    repeating($rule);
    $this->getJson('/api/items?from=2027-01-04&to=2027-12-31'); // look a year ahead

    expect(array_slice(dates(), 0, count($expected)))->toBe($expected);
})->with([
    'every two weeks' => ['FREQ=WEEKLY;INTERVAL=2', ['2027-01-04', '2027-01-18', '2027-02-01']],
    'weekdays' => ['FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', ['2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08', '2027-01-11']],
    'monthly on the 4th' => ['FREQ=MONTHLY;BYMONTHDAY=4', ['2027-01-04', '2027-02-04', '2027-03-04']],
    'first Monday of the month' => ['FREQ=MONTHLY;BYDAY=1MO', ['2027-01-04', '2027-02-01', '2027-03-01']],
]);

it('completes one occurrence without touching the others', function () {
    repeating('FREQ=DAILY');

    $this->patchJson('/api/items/'.occurrenceOn('2027-01-05')->id, ['status' => 'done'])->assertOk();

    expect(Item::where('status', 'done')->count())->toBe(1)
        ->and(occurrenceOn('2027-01-06')->status->value)->toBe('open');
});

it('rejects an invalid rule, and a rule on anything but a day task', function () {
    $category = Category::where('slug', 'health')->value('id');

    $this->postJson('/api/items', [
        'title' => 'x', 'category_id' => $category, 'scope' => 'day', 'period_key' => '2027-01-04',
        'recurrence_rule' => 'FREQ=SOMETIMES',
    ])->assertJsonValidationErrors('recurrence_rule');

    $this->postJson('/api/items', [
        'title' => 'x', 'category_id' => $category, 'scope' => 'week', 'period_key' => '2027-W01',
        'recurrence_rule' => 'FREQ=WEEKLY',
    ])->assertJsonValidationErrors('recurrence_rule');
});

it('generates further ahead when someone looks at a later date', function () {
    repeating('FREQ=WEEKLY');

    expect(occurrenceOn('2027-06-07'))->toBeNull();

    $this->getJson('/api/items?period_key=2027-06-07')->assertJsonCount(1);
    $this->getJson('/api/items?period_key=2027-06-07')->assertJsonCount(1);
});

it('tops up as days pass, without creating duplicates', function () {
    repeating('FREQ=DAILY');
    $service = app(RecurrenceService::class);

    expect($service->generateAll())->toBeLessThanOrEqual(1); // the scheduler's horizon is a day wider

    $this->travelTo('2027-01-14 17:00:00');
    $before = Item::count();

    expect($service->generateAll())->toBe(10)
        ->and($service->generateAll())->toBe(0)
        ->and(Item::count())->toBe($before + 10)
        ->and(Item::select('period_key')->groupBy('period_key')->havingRaw('count(*) > 1')->get())->toBeEmpty();
});

it('does not bring back an occurrence that was deleted or moved', function () {
    repeating('FREQ=DAILY');

    $this->deleteJson('/api/items/'.occurrenceOn('2027-01-05')->id)->assertNoContent();
    $this->patchJson('/api/items/'.occurrenceOn('2027-01-06')->id, ['period_key' => '2027-01-09'])->assertOk();

    $this->travelTo('2027-01-10 17:00:00');
    app(RecurrenceService::class)->generateAll();

    expect(occurrenceOn('2027-01-05'))->toBeNull()
        ->and(occurrenceOn('2027-01-06'))->toBeNull()
        ->and(Item::where('period_key', '2027-01-09')->count())->toBe(2);
});

it('keeps generating after the first occurrence alone is deleted', function () {
    $id = repeating('FREQ=DAILY');

    $this->deleteJson("/api/items/{$id}")->assertNoContent();
    $this->travelTo('2027-01-10 17:00:00');

    expect(app(RecurrenceService::class)->generateAll())->toBeGreaterThan(0)
        ->and(occurrenceOn('2027-01-04'))->toBeNull();
});

it('edits one occurrence only by default', function () {
    $id = repeating('FREQ=DAILY');

    $this->patchJson('/api/items/'.occurrenceOn('2027-01-06')->id, ['title' => 'Vitamins and fish oil', 'due_time' => '08:00'])
        ->assertOk();

    expect(Item::where('title', 'Vitamins and fish oil')->count())->toBe(1)
        ->and(Item::find($id)->title)->toBe('Take vitamins');
});

it('edits every open occurrence, and leaves finished ones alone', function () {
    $id = repeating('FREQ=DAILY');
    $done = occurrenceOn('2027-01-05');
    $done->update(['status' => 'done']);

    $this->patchJson('/api/items/'.occurrenceOn('2027-01-08')->id.'?apply_to=all', ['title' => 'Supplements', 'starred' => true])
        ->assertOk();

    expect(Item::where('title', 'Supplements')->where('starred', true)->count())->toBe(60)
        ->and($done->refresh()->title)->toBe('Take vitamins')
        ->and(Item::find($id)->title)->toBe('Supplements');
});

it('edits this and the following occurrences by splitting the series', function () {
    $id = repeating('FREQ=DAILY');
    $pivot = occurrenceOn('2027-01-10');

    $this->patchJson("/api/items/{$pivot->id}?apply_to=following", ['title' => 'New routine'])
        ->assertOk()
        ->assertJson(['recurrence_parent_id' => null, 'recurrence_rule' => 'FREQ=DAILY', 'title' => 'New routine']);

    expect(Item::find($id)->recurrence_rule)->toBe('FREQ=DAILY;UNTIL=20270109')
        ->and(occurrenceOn('2027-01-09')->title)->toBe('Take vitamins')
        ->and(occurrenceOn('2027-01-11')->only(['title', 'recurrence_parent_id']))
        ->toBe(['title' => 'New routine', 'recurrence_parent_id' => $pivot->id])
        ->and(Item::count())->toBe(61);

    // The old series is finished; only the new one grows.
    $this->travelTo('2027-01-06 17:00:00');
    app(RecurrenceService::class)->generateAll();

    expect(Item::where('recurrence_parent_id', $id)->count())->toBe(5)
        ->and(Item::select('period_key')->groupBy('period_key')->havingRaw('count(*) > 1')->get())->toBeEmpty();
});

it('re-lays out future occurrences when the rule changes, without back-filling the past', function () {
    $id = repeating('FREQ=DAILY');
    $this->travelTo('2027-01-13 17:00:00'); // a Wednesday

    $this->patchJson('/api/items/'.occurrenceOn('2027-01-13')->id.'?apply_to=all', ['recurrence_rule' => 'FREQ=WEEKLY;BYDAY=TU'])
        ->assertOk();

    $after = Item::where('period_key', '>', '2027-01-13')->orderBy('period_key')->pluck('period_key');

    expect($after->take(3)->all())->toBe(['2027-01-19', '2027-01-26', '2027-02-02'])
        // Earlier days keep what was already there: no new Tuesdays, nothing removed.
        ->and(Item::where('period_key', '<=', '2027-01-13')->count())->toBe(10)
        ->and(Item::find($id)->recurrence_rule)->toBe('FREQ=WEEKLY;BYDAY=TU')
        ->and(Item::whereNotNull('recurrence_parent_id')->where('recurrence_rule', 'FREQ=DAILY')->count())->toBe(0);
});

it('stops repeating when the rule is cleared for the whole series', function () {
    $id = repeating('FREQ=DAILY');

    $this->patchJson('/api/items/'.occurrenceOn('2027-01-06')->id.'?apply_to=all', ['recurrence_rule' => null])->assertOk();

    expect(dates())->toBe(['2027-01-04', '2027-01-05', '2027-01-06'])
        ->and(Item::whereNotNull('recurrence_rule')->count())->toBe(0);

    $this->travelTo('2027-02-01 17:00:00');
    expect(app(RecurrenceService::class)->generateAll())->toBe(0);
});

it('turns an existing task into a repeating one', function () {
    $item = Item::factory()->ownedBy($this->user)->create();

    $this->patchJson("/api/items/{$item->id}", ['recurrence_rule' => 'FREQ=WEEKLY'])
        ->assertOk()
        ->assertJson(['recurrence_rule' => 'FREQ=WEEKLY', 'recurrence_date' => '2027-01-04']);

    expect(array_slice(dates(), 0, 3))->toBe(['2027-01-04', '2027-01-11', '2027-01-18']);
});

it('deletes this and the following occurrences', function () {
    $id = repeating('FREQ=DAILY');

    $this->deleteJson('/api/items/'.occurrenceOn('2027-01-07')->id.'?apply_to=following')->assertNoContent();

    expect(dates())->toBe(['2027-01-04', '2027-01-05', '2027-01-06'])
        ->and(Item::find($id)->recurrence_rule)->toBe('FREQ=DAILY;UNTIL=20270106');
});

it('deletes the whole series but keeps what was already done', function () {
    repeating('FREQ=DAILY');
    occurrenceOn('2027-01-05')->update(['status' => 'done']);

    $this->deleteJson('/api/items/'.occurrenceOn('2027-01-08')->id.'?apply_to=all')->assertNoContent();

    expect(dates())->toBe(['2027-01-05']);

    $this->travelTo('2027-02-01 17:00:00');
    expect(app(RecurrenceService::class)->generateAll())->toBe(0);
});

it('rejects an unknown apply_to', function () {
    $id = repeating('FREQ=DAILY');

    $this->patchJson("/api/items/{$id}?apply_to=everything", ['title' => 'x'])->assertJsonValidationErrors('apply_to');
});

it('never generates into another household', function () {
    repeating('FREQ=DAILY');
    $mine = Item::count();

    $this->actingAs(User::factory()->create());

    $this->getJson('/api/items?period_key=2027-01-05')->assertJsonCount(0);
    expect(Item::count())->toBe(0)
        ->and(Item::withoutGlobalScope('household')->count())->toBe($mine);
});

describe('overdue', function () {
    it('lists open day tasks from earlier days, newest first', function () {
        $old = Item::factory()->ownedBy($this->user)->period('2027-01-01')->create(['title' => 'old']);
        $recent = Item::factory()->ownedBy($this->user)->period('2027-01-03')->create(['title' => 'recent']);
        Item::factory()->ownedBy($this->user)->period('2027-01-02')->create(['status' => 'done']);
        Item::factory()->ownedBy($this->user)->period('2027-01-02')->create(['status' => 'dropped']);
        Item::factory()->ownedBy($this->user)->period('2027-01-04')->create(['title' => 'today']);
        Item::factory()->ownedBy($this->user)->period('2026-W53')->create(['title' => 'a goal']);

        $this->getJson('/api/items/overdue?before=2027-01-04')->assertJsonPath('*.id', [$recent->id, $old->id]);
        $this->getJson('/api/items/overdue')->assertJsonValidationErrors('before');
    });

    it('shows a missed repeating task once, as its latest occurrence', function () {
        $this->travelTo('2026-12-28 17:00:00');
        $id = $this->postJson('/api/items', [
            'title' => 'Take vitamins', 'category_id' => Category::where('slug', 'health')->value('id'),
            'scope' => 'day', 'period_key' => '2026-12-28', 'recurrence_rule' => 'FREQ=DAILY',
        ])->json('id');
        $this->travelTo('2027-01-04 17:00:00');

        $this->getJson('/api/items/overdue?before=2027-01-04')
            ->assertJsonCount(1)
            ->assertJsonPath('0.period_key', '2027-01-03')
            ->assertJsonPath('0.recurrence_parent_id', $id);
    });

    it('respects the person filter', function () {
        $liz = User::factory()->create(['household_id' => $this->user->household_id]);
        $mine = Item::factory()->ownedBy($this->user)->period('2027-01-02')->create(['assignee_user_id' => $this->user->id]);
        $hers = Item::factory()->ownedBy($this->user)->period('2027-01-02')->create(['assignee_user_id' => $liz->id]);

        $this->getJson("/api/items/overdue?before=2027-01-04&person={$liz->id}")->assertJsonPath('*.id', [$hers->id]);
        $this->getJson('/api/items/overdue?before=2027-01-04')->assertJsonPath('*.id', [$mine->id, $hers->id]);
    });
});

describe('day settings', function () {
    it('reports and updates the timeline hours', function () {
        $this->getJson('/api/me')->assertJsonPath('user.day_start_hour', 6)->assertJsonPath('user.day_end_hour', 23);

        $this->patchJson('/api/me', ['day_start_hour' => 5, 'day_end_hour' => 22])
            ->assertOk()
            ->assertJsonPath('user.day_start_hour', 5)
            ->assertJsonPath('user.day_end_hour', 22);
    });

    it('rejects a day that ends before it starts', function () {
        $this->patchJson('/api/me', ['day_start_hour' => 9, 'day_end_hour' => 8])->assertStatus(422);
        $this->patchJson('/api/me', ['day_end_hour' => 6])->assertStatus(422);
        $this->patchJson('/api/me', ['day_start_hour' => 30])->assertJsonValidationErrors('day_start_hour');
    });
});
