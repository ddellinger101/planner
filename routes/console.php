<?php

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
