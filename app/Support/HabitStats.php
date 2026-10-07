<?php

namespace App\Support;

use App\Enums\Scope;
use Carbon\CarbonImmutable;

/**
 * Streaks and completion for one habit, worked out from the dates it was
 * checked off.
 *
 * A daily habit's streak is counted in days. A habit with a weekly target
 * (say three times a week) is counted in weeks that met the target. Either
 * way, a streak isn't broken by a day or week that is still under way.
 */
final class HabitStats
{
    private const WINDOW_DAYS = 30;

    /**
     * @param  list<string>  $doneDates  Y-m-d dates the habit was done on
     * @return array{streak_unit: string, current_streak: int, best_streak: int, completion: int, done_total: int}
     */
    public static function for(int $targetPerWeek, array $doneDates, string $today, string $activeFrom): array
    {
        $doneDates = array_values(array_unique(array_filter($doneDates, fn (string $date) => $date <= $today)));
        sort($doneDates);

        $daily = $targetPerWeek >= 7;

        // The units a streak is made of, as consecutive integers: day numbers
        // for a daily habit, week numbers for a weekly one.
        if ($daily) {
            $met = array_map(fn (string $date) => self::dayNumber($date), $doneDates);
            $now = self::dayNumber($today);
        } else {
            $perWeek = array_count_values(array_map(fn (string $date) => self::weekNumber($date), $doneDates));
            $met = array_keys(array_filter($perWeek, fn (int $count) => $count >= $targetPerWeek));
            sort($met);
            $now = self::weekNumber($today);
        }

        return [
            'streak_unit' => $daily ? 'days' : 'weeks',
            'current_streak' => self::currentRun($met, $now),
            'best_streak' => self::longestRun($met),
            'completion' => self::completion($targetPerWeek, $doneDates, $today, $activeFrom),
            'done_total' => count($doneDates),
        ];
    }

    /**
     * The run ending now, or ending just before now when the current day or
     * week hasn't been done yet.
     *
     * @param  list<int>  $met
     */
    private static function currentRun(array $met, int $now): int
    {
        $set = array_flip($met);
        $cursor = isset($set[$now]) ? $now : $now - 1;
        $run = 0;

        while (isset($set[$cursor])) {
            $run++;
            $cursor--;
        }

        return $run;
    }

    /** @param  list<int>  $met  sorted ascending */
    private static function longestRun(array $met): int
    {
        $best = 0;
        $run = 0;
        $previous = null;

        foreach ($met as $unit) {
            $run = $previous !== null && $unit === $previous + 1 ? $run + 1 : 1;
            $best = max($best, $run);
            $previous = $unit;
        }

        return $best;
    }

    /**
     * How much of what was expected got done over the last 30 days, or since
     * the habit started if that is more recent. 0 to 100.
     *
     * @param  list<string>  $doneDates
     */
    private static function completion(int $targetPerWeek, array $doneDates, string $today, string $activeFrom): int
    {
        $end = CarbonImmutable::parse($today, 'UTC');
        $start = max($end->subDays(self::WINDOW_DAYS - 1)->toDateString(), $activeFrom);

        if ($start > $today) {
            return 0;
        }

        $days = (int) CarbonImmutable::parse($start, 'UTC')->diffInDays($end) + 1;
        $expected = $targetPerWeek >= 7 ? $days : max(1, (int) round($days * $targetPerWeek / 7));
        $done = count(array_filter($doneDates, fn (string $date) => $date >= $start));

        return (int) min(100, round($done / $expected * 100));
    }

    private static function dayNumber(string $date): int
    {
        return (int) (CarbonImmutable::parse($date, 'UTC')->getTimestamp() / 86400);
    }

    /** Weeks numbered consecutively across years, Monday first. */
    private static function weekNumber(string $date): int
    {
        return intdiv(self::dayNumber(Period::fromDate(Scope::Week, $date)->start->toDateString()), 7);
    }
}
