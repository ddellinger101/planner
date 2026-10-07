<?php

use App\Jobs\SyncGoogleAccount;
use App\Models\GoogleAccount;
use App\Services\RecurrenceService;
use App\Services\RewardEvaluator;
use Illuminate\Support\Facades\Schedule;

// Keep recurring tasks generated 60 days ahead. Opening the app tops them up
// too, so a missed run only delays things until the next visit.
Schedule::call(fn (RecurrenceService $recurrence) => $recurrence->generateAll())
    ->name('recurrence:generate')
    ->dailyAt('03:15');

// Expire rewards whose deadline has passed. Rewards are also re-checked when
// a linked task changes and whenever the Rewards page is opened.
Schedule::call(fn (RewardEvaluator $rewards) => $rewards->evaluateAll())
    ->name('rewards:evaluate')
    ->dailyAt('00:10');

// Google Tasks has no webhook, so each connected account is polled.
Schedule::call(fn () => GoogleAccount::whereNotNull('refresh_token')->where('needs_reconnect', false)
    ->pluck('id')->each(fn (int $id) => SyncGoogleAccount::dispatch($id)))
    ->name('google:sync')
    ->everyFiveMinutes();

Schedule::call(fn () => GoogleAccount::whereNotNull('refresh_token')->where('needs_reconnect', false)
    ->pluck('id')->each(fn (int $id) => SyncGoogleAccount::dispatch($id, withBirthdays: true)))
    ->name('google:birthdays')
    ->dailyAt('04:30');

// There is no long-running queue worker on the server, so the scheduler
// drains the queue every minute: a change made here reaches Google within
// about that long.
Schedule::command('queue:work --stop-when-empty --max-time=50 --tries=3')
    ->everyMinute()
    ->withoutOverlapping(5);
