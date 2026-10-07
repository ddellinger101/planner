<?php

use App\Enums\MealSlot;
use App\Services\Google\ChefMealParser;

// Events in the shape Chef writes them: see docs/chef-calendar-format.md.

function chefMeal(array $event): ?array
{
    return (new ChefMealParser)->parse(['all_day' => false, 'description' => null, ...$event], 'America/New_York');
}

it('reads a dinner with sides and its link back to Chef', function () {
    $meal = chefMeal([
        'title' => 'Chicken Tikka Masala',
        'start' => '2027-01-05T18:00:00-05:00',
        'description' => "• Chicken Tikka Masala\n• Naan\n• Cucumber salad\n\nServes 4.\nhttps://chef.dustindellinger.com/tonight?date=2027-01-05",
    ]);

    expect($meal)->toBe([
        'date' => '2027-01-05',
        'slot' => MealSlot::Dinner,
        'title' => 'Chicken Tikka Masala',
        'description' => "Naan\nCucumber salad",
        'chef_url' => 'https://chef.dustindellinger.com/tonight?date=2027-01-05',
    ]);
});

it('takes the slot from the title when a slot has no main dish', function () {
    $meal = chefMeal([
        'title' => 'Breakfast: Yogurt, Granola',
        'start' => '2027-01-05T08:00:00-05:00',
        'description' => "• Yogurt\n• Granola\n\nServes 2.\nhttps://chef.dustindellinger.com/tonight?date=2027-01-05",
    ]);

    expect($meal['slot'])->toBe(MealSlot::Breakfast)
        ->and($meal['title'])->toBe('Yogurt, Granola')
        ->and($meal['description'])->toBeNull();
});

it('tells the slot from the time Chef uses for it', function (string $start, MealSlot $slot) {
    expect(chefMeal(['title' => 'Something', 'start' => $start])['slot'])->toBe($slot);
})->with([
    'breakfast at 8:00' => ['2027-01-05T08:00:00-05:00', MealSlot::Breakfast],
    'lunch at 12:30' => ['2027-01-05T12:30:00-05:00', MealSlot::Lunch],
    'dinner at 6:00' => ['2027-01-05T18:00:00-05:00', MealSlot::Dinner],
    'an event moved to mid-afternoon' => ['2027-01-05T15:00:00-05:00', MealSlot::Dinner],
]);

it('uses the day in the household\'s time zone', function () {
    // 6 PM in New York, written in UTC, is already the next day there.
    expect(chefMeal(['title' => 'Tacos', 'start' => '2027-01-05T23:00:00Z'])['date'])->toBe('2027-01-05')
        ->and(chefMeal(['title' => 'Tacos', 'start' => '2027-01-06T01:00:00Z'])['date'])->toBe('2027-01-05');
});

it('accepts an all-day event someone added by hand', function () {
    $meal = chefMeal(['title' => 'Leftovers', 'start' => '2027-01-07', 'end' => '2027-01-08', 'all_day' => true]);

    expect($meal['date'])->toBe('2027-01-07')->and($meal['slot'])->toBe(MealSlot::Unknown);

    expect(chefMeal(['title' => 'Snack: Apples', 'start' => '2027-01-07', 'all_day' => true]))
        ->toMatchArray(['slot' => MealSlot::Snack, 'title' => 'Apples']);
});

it('copes with a description Google returns as HTML, or with none', function () {
    $meal = chefMeal([
        'title' => 'Tacos',
        'start' => '2027-01-05T18:00:00-05:00',
        'description' => '• Tacos<br>• Rice &amp; beans<br><br>Serves 4.<br><a href="https://chef.dustindellinger.com/tonight?date=2027-01-05">https://chef.dustindellinger.com/tonight?date=2027-01-05</a>',
    ]);

    expect($meal['description'])->toBe('Rice & beans')
        ->and($meal['chef_url'])->toBe('https://chef.dustindellinger.com/tonight?date=2027-01-05')
        ->and(chefMeal(['title' => 'Tacos', 'start' => '2027-01-05T18:00:00-05:00']))->toMatchArray(['description' => null, 'chef_url' => null]);
});

it('ignores an event with no title', function () {
    expect(chefMeal(['title' => '  ', 'start' => '2027-01-05T18:00:00-05:00']))->toBeNull();
});
