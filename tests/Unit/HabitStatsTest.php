<?php

use App\Support\HabitStats;

/** Consecutive dates ending on (and including) $end. */
function run(string $end, int $length): array
{
    return array_map(
        fn (int $back) => date('Y-m-d', strtotime("{$end} -{$back} days")),
        range(0, $length - 1),
    );
}

// Wednesday, January 20, 2027.
const TODAY = '2027-01-20';

describe('a daily habit', function () {
    it('counts the run that ends today', function () {
        $stats = HabitStats::for(7, run(TODAY, 5), TODAY, '2026-01-01');

        expect($stats)->toMatchArray(['streak_unit' => 'days', 'current_streak' => 5, 'best_streak' => 5, 'done_total' => 5]);
    });

    it('keeps the streak alive when today hasn\'t been done yet', function () {
        expect(HabitStats::for(7, run('2027-01-19', 4), TODAY, '2026-01-01')['current_streak'])->toBe(4);
    });

    it('ends the streak after a missed day', function () {
        $stats = HabitStats::for(7, run('2027-01-18', 6), TODAY, '2026-01-01');

        expect($stats['current_streak'])->toBe(0)
            ->and($stats['best_streak'])->toBe(6);
    });

    it('remembers a longer streak from the past', function () {
        $dates = [...run('2026-12-10', 12), ...run(TODAY, 3)];

        expect(HabitStats::for(7, $dates, TODAY, '2026-01-01'))
            ->toMatchArray(['current_streak' => 3, 'best_streak' => 12]);
    });

    it('counts across a month and year boundary, ignoring duplicates and future dates', function () {
        $dates = [...run('2027-01-02', 5), '2027-01-02', '2027-02-01'];

        expect(HabitStats::for(7, $dates, '2027-01-02', '2026-01-01'))
            ->toMatchArray(['current_streak' => 5, 'best_streak' => 5, 'done_total' => 5]);
    });

    it('has no streak with nothing checked', function () {
        expect(HabitStats::for(7, [], TODAY, '2026-01-01'))
            ->toMatchArray(['current_streak' => 0, 'best_streak' => 0, 'completion' => 0, 'done_total' => 0]);
    });

    it('reports completion over the last 30 days', function () {
        // 15 of the last 30 days.
        expect(HabitStats::for(7, run(TODAY, 15), TODAY, '2026-01-01')['completion'])->toBe(50)
            ->and(HabitStats::for(7, run(TODAY, 30), TODAY, '2026-01-01')['completion'])->toBe(100)
            // Older than the window: doesn't count.
            ->and(HabitStats::for(7, run('2026-11-30', 20), TODAY, '2026-01-01')['completion'])->toBe(0);
    });

    it('measures a new habit from the day it started', function () {
        // Started four days ago and done every day since.
        expect(HabitStats::for(7, run(TODAY, 4), TODAY, '2027-01-17')['completion'])->toBe(100)
            ->and(HabitStats::for(7, run(TODAY, 2), TODAY, '2027-01-17')['completion'])->toBe(50)
            ->and(HabitStats::for(7, [], TODAY, '2027-02-01')['completion'])->toBe(0);
    });
});

describe('a habit with a weekly target', function () {
    // Weeks run Monday to Sunday; this week is January 18 to 24.
    $threeIn = fn (string $monday) => [
        $monday,
        date('Y-m-d', strtotime("{$monday} +2 days")),
        date('Y-m-d', strtotime("{$monday} +4 days")),
    ];

    it('counts weeks that met the target', function () use ($threeIn) {
        $dates = [...$threeIn('2027-01-04'), ...$threeIn('2027-01-11'), '2027-01-18', '2027-01-19', '2027-01-20'];

        expect(HabitStats::for(3, $dates, TODAY, '2026-01-01'))
            ->toMatchArray(['streak_unit' => 'weeks', 'current_streak' => 3, 'best_streak' => 3]);
    });

    it('doesn\'t break the streak while this week is still under way', function () use ($threeIn) {
        $dates = [...$threeIn('2027-01-04'), ...$threeIn('2027-01-11'), '2027-01-18'];

        expect(HabitStats::for(3, $dates, TODAY, '2026-01-01')['current_streak'])->toBe(2);
    });

    it('breaks the streak on a week that fell short', function () use ($threeIn) {
        $dates = [...$threeIn('2027-01-04'), '2027-01-11', '2027-01-12', ...$threeIn('2027-01-18')];

        expect(HabitStats::for(3, $dates, '2027-01-24', '2026-01-01'))
            ->toMatchArray(['current_streak' => 1, 'best_streak' => 1]);
    });

    it('runs across a year boundary', function () use ($threeIn) {
        // The week of December 28, 2026 is the last ISO week of 2026.
        $dates = [...$threeIn('2026-12-21'), ...$threeIn('2026-12-28'), ...$threeIn('2027-01-04')];

        expect(HabitStats::for(3, $dates, '2027-01-10', '2026-01-01')['current_streak'])->toBe(3);
    });

    it('scales completion to the target', function () {
        // Three a week is about 13 over 30 days; 13 done is everything.
        expect(HabitStats::for(3, run(TODAY, 13), TODAY, '2026-01-01')['completion'])->toBe(100)
            // Doing more than asked doesn't go past 100.
            ->and(HabitStats::for(3, run(TODAY, 30), TODAY, '2026-01-01')['completion'])->toBe(100);
    });
});
