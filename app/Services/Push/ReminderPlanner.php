<?php

namespace App\Services\Push;

use App\Enums\ItemStatus;
use App\Enums\RewardStatus;
use App\Enums\Scope;
use App\Models\Habit;
use App\Models\Item;
use App\Models\Reward;
use App\Models\User;
use App\Support\NotificationPreferences;
use App\Support\Period;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;

/**
 * Works out which reminders are due and sends them. Run every minute.
 *
 * Nothing is scheduled ahead of time: each run looks at how things stand
 * now, so a task whose time is moved or that gets done simply stops (or
 * starts) qualifying. `PushNotifier::notifyOnce` keeps each one to a single
 * send.
 */
class ReminderPlanner
{
    /** How long after its moment a timed reminder may still go out, if a run was missed. */
    private const GRACE_MINUTES = 30;

    public function __construct(private PushNotifier $notifier) {}

    public function run(?CarbonImmutable $now = null): void
    {
        $now ??= CarbonImmutable::now();

        // Only people with a device to send to.
        foreach (User::whereIn('id', fn ($q) => $q->select('user_id')->from('push_subscriptions'))->get() as $user) {
            $local = $now->setTimezone($user->timezone);
            $preferences = NotificationPreferences::for($user);

            if ($preferences['tasks']) {
                $this->tasks($user, $local, (int) $preferences['task_lead_minutes']);
            }

            foreach (['morning', 'evening'] as $routine) {
                if ($preferences[$routine] && $this->isTime($local, $preferences["{$routine}_time"])) {
                    $this->routine($user, $local, $routine);
                }
            }

            if ($preferences['weekly'] && $local->isSunday() && $this->isTime($local, $preferences['weekly_time'])) {
                $next = Period::today(Scope::Week, $user->timezone)->next();

                $this->notifier->notifyOnce($user, 'weekly_planning', "plan:{$next->key()}", [
                    'title' => 'Plan the week ahead',
                    'body' => 'Ten minutes now makes Monday easier.',
                    'url' => "/plan/{$next->key()}",
                ]);
            }

            if ($preferences['monthly'] && $local->day === 1 && $this->isTime($local, '08:00')) {
                $this->notifier->notifyOnce($user, 'month_rollover', "month:{$local->format('Y-m')}", [
                    'title' => "It’s {$local->format('F')}",
                    'body' => "Look back at {$local->subMonthNoOverflow()->format('F')} and set this month’s goals.",
                    'url' => "/month/{$local->format('Y-m')}",
                ]);
            }

            if ($preferences['rewards']) {
                $this->rewardDeadlines($user, $now);
            }
        }
    }

    /** A reminder shortly before each of today's tasks that has a time. */
    private function tasks(User $user, CarbonImmutable $local, int $lead): void
    {
        $today = $local->toDateString();

        $tasks = $this->mine(Item::withoutGlobalScope('household'), $user)
            ->where('scope', Scope::Day)
            ->where('status', ItemStatus::Open)
            ->whereDate('due_date', $today)
            ->whereNotNull('due_time')
            ->get();

        foreach ($tasks as $task) {
            $time = substr((string) $task->getRawOriginal('due_time'), 0, 5);
            $due = CarbonImmutable::parse("{$today} {$time}", $user->timezone);

            // From the lead time until the task starts; after that it is too late to be a reminder.
            if ($local->lt($due->subMinutes($lead)) || $local->gt($due)) {
                continue;
            }

            $this->notifier->notifyOnce($user, 'task_reminder', "task:{$task->id}:{$today}T{$time}", [
                'title' => $task->title,
                'body' => $local->gte($due->subMinute()) ? 'Now' : 'At '.$due->format('g:i A'),
                'url' => "/day/{$today}",
            ], $task->id);
        }
    }

    /** A nudge for the morning or evening routine, if anything in it is still to do. */
    private function routine(User $user, CarbonImmutable $local, string $routine): void
    {
        $today = $local->toDateString();

        $tasks = $this->mine(Item::withoutGlobalScope('household'), $user)
            ->where('scope', Scope::Day)
            ->where('status', ItemStatus::Open)
            ->where('routine', $routine)
            ->whereDate('due_date', $today)
            ->count();

        $habits = Habit::withoutGlobalScope('household')
            ->where('user_id', $user->id)
            ->where('routine', $routine)
            ->where(fn (Builder $q) => $q->whereNull('active_from')->orWhereDate('active_from', '<=', $today))
            ->where(fn (Builder $q) => $q->whereNull('active_to')->orWhereDate('active_to', '>=', $today))
            ->whereDoesntHave('checks', fn (Builder $q) => $q->whereDate('date', $today)->where('done', true))
            ->count();

        $count = $tasks + $habits;

        if ($count === 0) {
            return;
        }

        $this->notifier->notifyOnce($user, "{$routine}_routine", "routine:{$routine}:{$today}", [
            'title' => ucfirst($routine).' routine',
            'body' => $count === 1 ? '1 thing to do.' : "{$count} things to do.",
            'url' => "/day/{$today}",
        ]);
    }

    /** One warning when a reward that hasn't been earned yet has a day or less to go. */
    private function rewardDeadlines(User $user, CarbonImmutable $now): void
    {
        $rewards = Reward::withoutGlobalScope('household')
            ->where('household_id', $user->household_id)
            ->where('status', RewardStatus::Active)
            ->where('deadline', '>', $now)
            ->where('deadline', '<=', $now->addDay())
            ->where(fn (Builder $q) => $q->whereNull('beneficiary_user_id')->orWhere('beneficiary_user_id', $user->id))
            ->get();

        foreach ($rewards as $reward) {
            $hours = max(1, (int) round($now->diffInMinutes($reward->deadline) / 60));

            $this->notifier->notifyOnce($user, 'reward_deadline', "reward-deadline:{$reward->id}:{$reward->deadline->timestamp}", [
                'title' => "“{$reward->title}” is nearly out of time",
                'body' => $hours === 1 ? 'About an hour left to earn it.' : "About {$hours} hours left to earn it.",
                'url' => '/rewards',
            ]);
        }
    }

    /** Whether the clock has reached a time of day, and not long ago. */
    private function isTime(CarbonImmutable $local, string $time): bool
    {
        $at = CarbonImmutable::parse("{$local->toDateString()} {$time}", $local->timezone);

        return $local->gte($at) && $local->lt($at->addMinutes(self::GRACE_MINUTES));
    }

    /** The person's own items and the ones that belong to both. */
    private function mine(Builder $query, User $user): Builder
    {
        return $query
            ->where('household_id', $user->household_id)
            ->where(fn (Builder $q) => $q->where('assignee_user_id', $user->id)->orWhereNull('assignee_user_id'));
    }
}
