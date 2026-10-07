<?php

use App\Jobs\SyncGoogleAccount;
use App\Models\GoogleAccount;
use App\Services\Push\ReminderPlanner;
use App\Services\RecurrenceService;
use App\Services\RewardEvaluator;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;
use Minishlink\WebPush\VAPID;

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

// Reminders: each minute, send whatever has just come due.
Schedule::call(fn (ReminderPlanner $reminders) => $reminders->run())
    ->name('push:reminders')
    ->everyMinute();

// Prints a new pair of keys for signing push notifications, to paste into .env.
Artisan::command('push:keys', function () {
    $keys = VAPID::createVapidKeys();

    $this->line('VAPID_PUBLIC_KEY='.$keys['publicKey']);
    $this->line('VAPID_PRIVATE_KEY='.$keys['privateKey']);
    $this->line('VAPID_SUBJECT=mailto:you@example.com');
    $this->comment('Add these to .env (with your own address), then redeploy or run `php artisan optimize`.');
    $this->comment('Changing the keys later signs every device out of notifications.');
})->purpose('Generate VAPID keys for push notifications');

// There is no long-running queue worker on the server, so the scheduler
// drains the queue every minute: a change made here reaches Google within
// about that long.
Schedule::command('queue:work --stop-when-empty --max-time=50 --tries=3')
    ->everyMinute()
    ->withoutOverlapping(5);
