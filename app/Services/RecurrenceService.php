<?php

namespace App\Services;

use App\Enums\ItemStatus;
use App\Models\Item;
use App\Models\User;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use RRule\RRule;
use Throwable;

/**
 * Recurring tasks.
 *
 * A series is its first occurrence (the "parent": it holds the rule and has
 * no recurrence_parent_id) plus one generated item per later occurrence.
 * Each occurrence is an ordinary item, so completing one never affects the
 * others. Occurrences are generated a rolling 60 days ahead, and further
 * when someone looks at a later date.
 */
class RecurrenceService
{
    public const HORIZON_DAYS = 60;

    /** How far ahead looking at a future date can push generation. */
    public const MAX_DAYS = 400;

    /** What every occurrence of a series has in common. */
    private const SHARED = [
        'title', 'notes', 'category_id', 'due_time', 'duration_minutes',
        'starred', 'routine', 'assignee_user_id', 'recurrence_rule',
    ];

    public static function isValidRule(string $rule): bool
    {
        try {
            new RRule($rule, '2027-01-04');

            return true;
        } catch (Throwable) {
            return false;
        }
    }

    /**
     * Create the occurrences of a series that don't exist yet, up to and
     * including $through. $from stops a changed rule from back-filling the
     * past. Returns how many were created.
     */
    public function generateFor(Item $parent, CarbonImmutable $through, ?string $from = null): int
    {
        if ($parent->recurrence_rule === null || $parent->recurrence_parent_id !== null) {
            return 0;
        }

        $start = self::ymd($parent->recurrence_date ?? $parent->due_date);
        $from = max($from ?? $start, $start);

        $existing = Item::withTrashed()
            ->withoutGlobalScope('household')
            ->where('recurrence_parent_id', $parent->id)
            ->toBase()
            ->pluck('recurrence_date')
            ->map(fn ($date) => self::ymd($date))
            ->flip();

        $created = 0;

        foreach ((new RRule($parent->recurrence_rule, $start))->getOccurrencesBetween($from, $through->toDateString()) as $occurrence) {
            $date = $occurrence->format('Y-m-d');

            if ($date === $start || $existing->has($date)) {
                continue;
            }

            Item::create([
                ...$parent->only([...self::SHARED, 'household_id', 'created_by', 'scope']),
                'period_key' => $date,
                'due_date' => $date,
                'recurrence_date' => $date,
                'recurrence_parent_id' => $parent->id,
            ]);

            $created++;
        }

        return $created;
    }

    /** Top up every series in every household. Run daily by the scheduler. */
    public function generateAll(): int
    {
        $through = CarbonImmutable::now('UTC')->addDays(self::HORIZON_DAYS + 1);

        return $this->parents(Item::withTrashed()->withoutGlobalScope('household'))
            ->get()
            ->sum(fn (Item $parent) => $this->generateFor($parent, $through));
    }

    /**
     * Make sure the user's household has occurrences through the horizon,
     * or through $needed when they are looking further ahead. Cheap to call
     * on every request: it only does work when the horizon has moved.
     */
    public function ensureGenerated(User $user, ?string $needed = null): void
    {
        $through = $this->horizon($user, $needed);
        $key = "recurrence:through:{$user->household_id}";

        if (Cache::get($key, '') >= $through->toDateString()) {
            return;
        }

        $this->parents(Item::withTrashed()->withoutGlobalScope('household'))
            ->where('household_id', $user->household_id)
            ->get()
            ->each(fn (Item $parent) => $this->generateFor($parent, $through));

        Cache::put($key, $through->toDateString(), now()->addDay());
    }

    /** Turn a newly created item with a rule into a series. */
    public function start(Item $item, User $user): Item
    {
        $item->update(['recurrence_date' => $item->due_date, 'recurrence_parent_id' => null]);
        $this->generateFor($item, $this->horizon($user, Cache::get("recurrence:through:{$user->household_id}")));

        return $item;
    }

    /**
     * Update an item. For an occurrence of a series, $applyTo says how far
     * the change reaches: "one", "following" or "all".
     *
     * @param  array<string, mixed>  $data
     */
    public function update(Item $item, array $data, string $applyTo, User $user): Item
    {
        return DB::transaction(function () use ($item, $data, $applyTo, $user) {
            $parent = $this->seriesParent($item);

            if ($parent === null) {
                $item->update($data);

                return $item->recurrence_rule ? $this->start($item, $user) : $item;
            }

            if ($applyTo === 'one') {
                // One occurrence can't have its own rule.
                $item->update(Arr::except($data, ['recurrence_rule']));

                return $item;
            }

            $date = self::ymd($item->recurrence_date ?? $item->due_date);
            $rule = array_key_exists('recurrence_rule', $data) ? $data['recurrence_rule'] : $parent->recurrence_rule;

            if ($applyTo === 'following' && ! $item->is($parent)) {
                // Split the series: the old one ends the day before, and this
                // occurrence becomes the first of a new one.
                $parent->update(['recurrence_rule' => self::endingBefore($parent->recurrence_rule, $date)]);
                $this->open($parent)->whereDate('recurrence_date', '>', $date)->whereKeyNot($item->id)->forceDelete();

                $item->update([...$data, 'recurrence_rule' => $rule, 'recurrence_parent_id' => null]);

                return $rule ? $this->start($item, $user) : $item;
            }

            // "all", or "following" from the first occurrence, which is the same thing.
            $shared = Arr::only($data, self::SHARED);
            $ruleChanged = $rule !== $parent->recurrence_rule;

            $parent->update($shared);

            if ($ruleChanged) {
                // Later occurrences were laid out by the old rule.
                $this->open($parent)->whereDate('recurrence_date', '>', $date)->whereKeyNot($item->id)->forceDelete();
                $this->occurrences($parent)->update(['recurrence_rule' => $rule]);
            }

            // Finished occurrences are history and keep what they said.
            $this->open($parent)->update(Arr::except($shared, ['recurrence_rule']));
            $item->refresh()->update(Arr::except($data, self::SHARED));

            if ($rule) {
                $this->generateFor($parent->refresh(), $this->horizon($user), $ruleChanged ? $date : null);
            }

            return $item;
        });
    }

    public function delete(Item $item, string $applyTo): void
    {
        DB::transaction(function () use ($item, $applyTo) {
            $parent = $this->seriesParent($item);

            if ($parent === null || $applyTo === 'one') {
                // A deleted first occurrence still anchors its series.
                $item->delete();

                return;
            }

            if ($applyTo === 'following' && ! $item->is($parent)) {
                $date = self::ymd($item->recurrence_date ?? $item->due_date);

                $parent->update(['recurrence_rule' => self::endingBefore($parent->recurrence_rule, $date)]);
                $this->open($parent)->whereDate('recurrence_date', '>=', $date)->get()->each->delete();
                $item->delete();

                return;
            }

            // The whole series: stop generating and remove what isn't done.
            $this->open($parent)->get()->each->delete();
            $parent->update(['recurrence_rule' => null]);

            if ($parent->status !== ItemStatus::Done || $item->is($parent)) {
                $parent->delete();
            }

            $item->delete();
        });
    }

    /** The item that holds the rule for this item's series, if it is in a live one. */
    private function seriesParent(Item $item): ?Item
    {
        $parent = $item->recurrence_parent_id
            ? Item::withTrashed()->withoutGlobalScope('household')->find($item->recurrence_parent_id)
            : $item;

        return $parent?->recurrence_rule ? $parent : null;
    }

    private function parents(Builder $query): Builder
    {
        return $query->whereNotNull('recurrence_rule')->whereNull('recurrence_parent_id');
    }

    private function occurrences(Item $parent): Builder
    {
        return Item::withoutGlobalScope('household')->where('recurrence_parent_id', $parent->id);
    }

    private function open(Item $parent): Builder
    {
        return $this->occurrences($parent)->where('status', ItemStatus::Open);
    }

    private function horizon(User $user, ?string $needed = null): CarbonImmutable
    {
        $today = CarbonImmutable::now($user->timezone)->startOfDay();
        $horizon = $today->addDays(self::HORIZON_DAYS);

        if ($needed !== null && $needed > $horizon->toDateString()) {
            $horizon = CarbonImmutable::parse($needed, $user->timezone)->min($today->addDays(self::MAX_DAYS));
        }

        return $horizon;
    }

    /** The same rule, with its last occurrence before the given date. */
    private static function endingBefore(string $rule, string $date): string
    {
        $parts = array_filter(
            explode(';', $rule),
            fn (string $part) => ! str_starts_with($part, 'UNTIL=') && ! str_starts_with($part, 'COUNT='),
        );

        $parts[] = 'UNTIL='.CarbonImmutable::parse($date)->subDay()->format('Ymd');

        return implode(';', $parts);
    }

    private static function ymd(mixed $date): string
    {
        return $date instanceof \DateTimeInterface ? $date->format('Y-m-d') : substr((string) $date, 0, 10);
    }
}
