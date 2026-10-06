<?php

use App\Enums\Scope;
use App\Support\Period;
use Carbon\CarbonImmutable;

function keys(array $periods): array
{
    return array_map(fn (Period $period) => $period->key(), $periods);
}

it('parses and formats every kind of key', function (string $key, Scope $scope, string $start, string $end) {
    $period = Period::parse($key);

    expect($period->scope)->toBe($scope)
        ->and($period->key())->toBe($key)
        ->and((string) $period)->toBe($key)
        ->and($period->start->toDateString())->toBe($start)
        ->and($period->end()->toDateString())->toBe($end);
})->with([
    ['2027', Scope::Year, '2027-01-01', '2027-12-31'],
    ['2027-Q1', Scope::Quarter, '2027-01-01', '2027-03-31'],
    ['2027-Q4', Scope::Quarter, '2027-10-01', '2027-12-31'],
    ['2027-01', Scope::Month, '2027-01-01', '2027-01-31'],
    ['2028-02', Scope::Month, '2028-02-01', '2028-02-29'],
    ['2027-W01', Scope::Week, '2027-01-04', '2027-01-10'],
    ['2026-W53', Scope::Week, '2026-12-28', '2027-01-03'],
    ['2027-01-04', Scope::Day, '2027-01-04', '2027-01-04'],
]);

it('rejects invalid keys', function (string $key) {
    expect(Period::tryParse($key))->toBeNull()
        ->and(fn () => Period::parse($key))->toThrow(InvalidArgumentException::class);
})->with([
    'not a key' => 'abc',
    'empty' => '',
    'month 13' => '2027-13',
    'month 0' => '2027-00',
    'quarter 5' => '2027-Q5',
    'week 0' => '2027-W00',
    'week 54' => '2027-W54',
    'week 53 in a 52-week year' => '2025-W53',
    'February 30' => '2027-02-30',
    'February 29 outside a leap year' => '2027-02-29',
    'trailing text' => '2027-01-04x',
    'lowercase week' => '2027-w01',
]);

it('finds the period that contains a date', function (Scope $scope, string $date, string $key) {
    expect(Period::fromDate($scope, $date)->key())->toBe($key);
})->with([
    [Scope::Year, '2027-06-15', '2027'],
    [Scope::Quarter, '2027-06-15', '2027-Q2'],
    [Scope::Month, '2027-06-15', '2027-06'],
    [Scope::Week, '2027-06-15', '2027-W24'],
    [Scope::Day, '2027-06-15', '2027-06-15'],
    'January 1 in the last ISO week of the previous year' => [Scope::Week, '2027-01-01', '2026-W53'],
    'late December in the first ISO week of the next year' => [Scope::Week, '2024-12-30', '2025-W01'],
    'a Sunday belongs to the week that started on Monday' => [Scope::Week, '2027-01-10', '2027-W01'],
]);

it('accepts date objects as well as strings', function () {
    $date = new DateTimeImmutable('2027-06-15 23:30:00', new DateTimeZone('America/New_York'));

    expect(Period::fromDate(Scope::Day, $date)->key())->toBe('2027-06-15');
});

it('steps forwards and backwards across boundaries', function (string $key, string $next) {
    expect(Period::parse($key)->next()->key())->toBe($next)
        ->and(Period::parse($next)->previous()->key())->toBe($key);
})->with([
    ['2027', '2028'],
    ['2027-Q4', '2028-Q1'],
    ['2027-12', '2028-01'],
    ['2027-01', '2027-02'],
    ['2026-W53', '2027-W01'],
    ['2025-W52', '2026-W01'],
    ['2027-01-31', '2027-02-01'],
    ['2028-02-28', '2028-02-29'],
    ['2027-12-31', '2028-01-01'],
]);

it('knows which dates it contains', function () {
    $week = Period::parse('2026-W05');

    expect($week->contains('2026-01-25'))->toBeFalse()
        ->and($week->contains('2026-01-26'))->toBeTrue()
        ->and($week->contains('2026-02-01'))->toBeTrue()
        ->and($week->contains('2026-02-02'))->toBeFalse()
        ->and(Period::parse('2027-Q1')->contains('2027-03-31'))->toBeTrue()
        ->and(Period::parse('2027-Q1')->contains('2027-04-01'))->toBeFalse();
});

it('walks up from day to year', function () {
    $day = Period::parse('2027-01-31');

    expect($day->parent()->key())->toBe('2027-W04')
        ->and($day->parent()->parent()->key())->toBe('2027-01')
        ->and($day->parent()->parent()->parent()->key())->toBe('2027-Q1')
        ->and($day->parent()->parent()->parent()->parent()->key())->toBe('2027')
        ->and(Period::parse('2027')->parent())->toBeNull();
});

it('assigns a straddling week to the month that contains its Monday', function () {
    $week = Period::parse('2026-W05'); // January 26 to February 1

    expect($week->parent()->key())->toBe('2026-01')
        ->and(keys($week->months()))->toBe(['2026-01', '2026-02'])
        ->and(keys(Period::parse('2026-W06')->months()))->toBe(['2026-02']);
});

it('lists the periods one level down', function () {
    expect(keys(Period::parse('2027')->children()))->toBe(['2027-Q1', '2027-Q2', '2027-Q3', '2027-Q4'])
        ->and(keys(Period::parse('2027-Q4')->children()))->toBe(['2027-10', '2027-11', '2027-12'])
        ->and(keys(Period::parse('2027-W01')->children()))->toBe([
            '2027-01-04', '2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08', '2027-01-09', '2027-01-10',
        ])
        ->and(Period::parse('2027-01-04')->children())->toBe([]);
});

it('gives a month only the weeks whose Monday falls in it', function () {
    // 2026-W05 starts in January, so it is January's week, not February's.
    expect(keys(Period::parse('2026-02')->children()))->toBe(['2026-W06', '2026-W07', '2026-W08', '2026-W09'])
        ->and(keys(Period::parse('2026-01')->children()))->toBe(['2026-W02', '2026-W03', '2026-W04', '2026-W05']);
});

it('gives every week exactly one parent month across a whole year', function () {
    $fromMonths = [];

    foreach (Period::parse('2026')->children() as $quarter) {
        foreach ($quarter->children() as $month) {
            foreach ($month->children() as $week) {
                expect($week->parent()->equals($month))->toBeTrue();
                $fromMonths[] = $week->key();
            }
        }
    }

    // 2026-W01 starts on December 29, 2025, so it belongs to December 2025.
    expect($fromMonths)->toHaveCount(52)
        ->and($fromMonths[0])->toBe('2026-W02')
        ->and(end($fromMonths))->toBe('2026-W53');
});

it('is not shifted by daylight-saving changes', function () {
    // US clocks go forward on March 14, 2027 and back on November 7, 2027.
    expect(Period::parse('2027-03-14')->next()->key())->toBe('2027-03-15')
        ->and(Period::parse('2027-11-07')->next()->key())->toBe('2027-11-08')
        ->and(Period::parse('2027-11-07')->previous()->key())->toBe('2027-11-06')
        ->and(Period::fromDate(Scope::Week, '2027-03-14')->children())->toHaveCount(7)
        ->and(Period::fromDate(Scope::Week, '2027-11-07')->children())->toHaveCount(7);
});

it('uses the given timezone to decide what today is', function () {
    CarbonImmutable::setTestNow(CarbonImmutable::parse('2027-03-15 03:30:00', 'UTC'));

    try {
        expect(Period::today(Scope::Day, 'America/New_York')->key())->toBe('2027-03-14')
            ->and(Period::today(Scope::Day, 'UTC')->key())->toBe('2027-03-15')
            ->and(Period::today(Scope::Week, 'America/New_York')->key())->toBe('2027-W10')
            ->and(Period::today(Scope::Week, 'UTC')->key())->toBe('2027-W11');
    } finally {
        CarbonImmutable::setTestNow();
    }
});

it('compares periods by scope and start', function () {
    expect(Period::parse('2027-01')->equals(Period::fromDate(Scope::Month, '2027-01-20')))->toBeTrue()
        ->and(Period::parse('2027-01')->equals(Period::parse('2027-Q1')))->toBeFalse();
});
