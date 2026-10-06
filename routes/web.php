<?php

use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect']);
Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback']);
Route::post('/auth/logout', [GoogleAuthController::class, 'logout']);

// Everything else is the React single-page app.
Route::view('/{any?}', 'app')->where('any', '^(?!api/|auth/|health$|up$).*$');
