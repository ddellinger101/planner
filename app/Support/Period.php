<?php

namespace App\Support;

use App\Enums\Scope;
use Carbon\CarbonImmutable;
use DateTimeInterface;
use InvalidArgumentException;
use Stringable;

/**
 * A planner period (year, quarter, month, ISO week or day), identified by a
 * key such as 2027, 2027-Q1, 2027-01, 2027-W01 or 2027-01-04.
 *
 * Periods are calendar dates with no time or zone, so all arithmetic runs in
 * UTC and daylight-saving changes can't shift a boundary. Only today() needs
 * a timezone.
 */
final readonly class Period implements Stringable
{
    private function __construct(
        public Scope $scope,
        public CarbonImmutable $start,
    ) {}

    public static function parse(string $key): self
    {
        $start = match (true) {
            (bool) preg_match('/^(\d{4})$/', $key, $m) => self::date((int) $m[1], 1, 1),
            (bool) preg_match('/^(\d{4})-Q([1-4])$/', $key, $m) => self::date((int) $m[1], ((int) $m[2] - 1) * 3 + 1, 1),
            (bool) preg_match('/^(\d{4})-(\d{2})$/', $key, $m) => self::date((int) $m[1], (int) $m[2], 1),
            (bool) preg_match('/^(\d{4})-W(\d{2})$/', $key, $m) => self::isoWeekStart((int) $m[1], (int) $m[2]),
            (bool) preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $key, $m) => self::date((int) $m[1], (int) $m[2], (int) $m[3]),
            default => null,
        };

        $scope = match (strlen($key)) {
            4 => Scope::Year,
            7 => match ($key[5]) {
                'Q' => Scope::Quarter,
                default => Scope::Month,
            },
            8 => Scope::Week,
            default => Scope::Day,
        };

        if ($start === null) {
            throw new InvalidArgumentException("Invalid period key [{$key}].");
        }

        return new self($scope, $start);
    }

    public static function tryParse(string $key): ?self
    {
        try {
            return self::parse($key);
        } catch (InvalidArgumentException) {
            return null;
        }
    }

    /** The period of the given scope that contains the date. */
    public static function fromDate(Scope $scope, DateTimeInterface|string $date): self
    {
        $day = self::day($date);

        return new self($scope, match ($scope) {
            Scope::Year => $day->startOfYear(),
            Scope::Quarter => $day->startOfQuarter(),
            Scope::Month => $day->startOfMonth(),
            Scope::Week => $day->startOfWeek(CarbonImmutable::MONDAY),
            Scope::Day => $day,
        });
    }

    public static function today(Scope $scope, string $timezone): self
    {
        return self::fromDate($scope, CarbonImmutable::now($timezone)->toDateString());
    }

    public function key(): string
    {
        return match ($this->scope) {
            Scope::Year => $this->start->format('Y'),
            Scope::Quarter => $this->start->format('Y').'-Q'.$this->start->quarter,
            Scope::Month => $this->start->format('Y-m'),
            Scope::Week => $this->start->format('o-\WW'),
            Scope::Day => $this->start->format('Y-m-d'),
        };
    }

    /** The last day of the period. */
    public function end(): CarbonImmutable
    {
        return match ($this->scope) {
            Scope::Year => $this->start->endOfYear()->startOfDay(),
            Scope::Quarter => $this->start->endOfQuarter()->startOfDay(),
            Scope::Month => $this->start->endOfMonth()->startOfDay(),
            Scope::Week => $this->start->addDays(6),
            Scope::Day => $this->start,
        };
    }

    public function next(): self
    {
        return $this->shift(1);
    }

    public function previous(): self
    {
        return $this->shift(-1);
    }

    public function contains(DateTimeInterface|string $date): bool
    {
        return self::day($date)->betweenIncluded($this->start, $this->end());
    }

    /**
     * Day → week → month → quarter → year. A week belongs to the month that
     * contains its Monday.
     */
    public function parent(): ?self
    {
        return match ($this->scope) {
            Scope::Year => null,
            Scope::Quarter => self::fromDate(Scope::Year, $this->start),
            Scope::Month => self::fromDate(Scope::Quarter, $this->start),
            Scope::Week => self::fromDate(Scope::Month, $this->start),
            Scope::Day => self::fromDate(Scope::Week, $this->start),
        };
    }

    /**
     * The periods one level down. A month's children are the weeks whose
     * Monday falls in it, mirroring parent().
     *
     * @return list<self>
     */
    public function children(): array
    {
        $childScope = match ($this->scope) {
            Scope::Year => Scope::Quarter,
            Scope::Quarter => Scope::Month,
            Scope::Month => Scope::Week,
            Scope::Week => Scope::Day,
            Scope::Day => null,
        };

        if ($childScope === null) {
            return [];
        }

        $child = self::fromDate($childScope, $this->start);

        if ($child->start->lt($this->start)) {
            $child = $child->next();
        }

        $children = [];

        while ($child->start->lte($this->end())) {
            $children[] = $child;
            $child = $child->next();
        }

        return $children;
    }

    /**
     * Every month the period touches. A week that straddles two months
     * returns both, so weekly planning can offer goals from each.
     *
     * @return list<self>
     */
    public function months(): array
    {
        $month = self::fromDate(Scope::Month, $this->start);
        $months = [];

        while ($month->start->lte($this->end())) {
            $months[] = $month;
            $month = $month->next();
        }

        return $months;
    }

    public function equals(self $other): bool
    {
        return $this->scope === $other->scope && $this->start->equalTo($other->start);
    }

    public function __toString(): string
    {
        return $this->key();
    }

    private function shift(int $step): self
    {
        return new self($this->scope, match ($this->scope) {
            Scope::Year => $this->start->addYearsNoOverflow($step),
            Scope::Quarter => $this->start->addMonthsNoOverflow($step * 3),
            Scope::Month => $this->start->addMonthsNoOverflow($step),
            Scope::Week => $this->start->addWeeks($step),
            Scope::Day => $this->start->addDays($step),
        });
    }

    private static function date(int $year, int $month, int $day): ?CarbonImmutable
    {
        return checkdate($month, $day, $year)
            ? CarbonImmutable::create($year, $month, $day, 0, 0, 0, 'UTC')
            : null;
    }

    private static function isoWeekStart(int $year, int $week): ?CarbonImmutable
    {
        if ($week < 1) {
            return null;
        }

        $monday = CarbonImmutable::now('UTC')->setISODate($year, $week, 1)->startOfDay();

        // Week 53 only exists in long ISO years; otherwise it rolls into the next year.
        return $monday->isoWeekYear === $year && $monday->isoWeek === $week ? $monday : null;
    }

    private static function day(DateTimeInterface|string $date): CarbonImmutable
    {
        $ymd = $date instanceof DateTimeInterface ? $date->format('Y-m-d') : substr($date, 0, 10);

        return CarbonImmutable::createFromFormat('!Y-m-d', $ymd, 'UTC');
    }
}
