<?php

use App\Services\RecurrenceService;
use Illuminate\Support\Facades\Schedule;

// Keep recurring tasks generated 60 days ahead. Opening the app tops them up
// too, so a missed run only delays things until the next visit.
Schedule::call(fn (RecurrenceService $recurrence) => $recurrence->generateAll())
    ->name('recurrence:generate')
    ->dailyAt('03:15');
