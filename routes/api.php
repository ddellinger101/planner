<?php

use App\Http\Controllers\Api\BrainDumpController;
use App\Http\Controllers\Api\HabitController;
use App\Http\Controllers\Api\ImportantDateController;
use App\Http\Controllers\Api\ItemController;
use App\Http\Controllers\Api\JournalController;
use App\Http\Controllers\Api\MealController;
use App\Http\Controllers\Api\MeController;
use App\Http\Controllers\Api\ReviewController;
use App\Http\Controllers\Api\RewardController;
use App\Http\Controllers\Api\WeightController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/me', [MeController::class, 'show']);
    Route::get('/categories', [MeController::class, 'categories']);

    Route::patch('/me', [MeController::class, 'update']);

    Route::get('/items/overdue', [ItemController::class, 'overdue']);
    Route::get('/items/summary', [ItemController::class, 'summary']);
    Route::apiResource('items', ItemController::class);

    Route::post('/items/{item}/carry', [ReviewController::class, 'carry']);

    Route::get('/reviews/pending', [ReviewController::class, 'pending']);
    Route::post('/reviews', [ReviewController::class, 'store']);

    Route::apiResource('important-dates', ImportantDateController::class)->except('show');

    Route::get('/journal', [JournalController::class, 'index']);
    Route::put('/journal/{periodKey}/{type}', [JournalController::class, 'update']);

    Route::get('/meals', [MealController::class, 'index']);

    Route::get('/weight', [WeightController::class, 'index']);
    Route::post('/weight', [WeightController::class, 'store']);
    Route::delete('/weight/{entry}', [WeightController::class, 'destroy'])->whereNumber('entry');
    Route::get('/weight/goals', [WeightController::class, 'goals']);
    Route::put('/weight/goals/{periodKey}', [WeightController::class, 'updateGoal']);

    Route::apiResource('habits', HabitController::class)->except('show');
    Route::put('/habits/{habit}/checks/{date}', [HabitController::class, 'check']);

    Route::apiResource('brain-dump', BrainDumpController::class)
        ->except('show')
        ->parameters(['brain-dump' => 'brainDumpItem']);
    Route::post('/brain-dump/{brainDumpItem}/assign', [BrainDumpController::class, 'assign']);

    Route::apiResource('rewards', RewardController::class)->except('show');
    Route::post('/rewards/{reward}/claim', [RewardController::class, 'claim']);
});
