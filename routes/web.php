<?php

use App\Http\Controllers\Auth\GoogleAuthController;
use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

Route::get('/auth/google/redirect', [GoogleAuthController::class, 'redirect']);
Route::get('/auth/google/callback', [GoogleAuthController::class, 'callback']);
Route::post('/auth/logout', [GoogleAuthController::class, 'logout']);

// Public and server-rendered: Google's OAuth branding review reads these.
Route::view('/privacy', 'legal.privacy');
Route::view('/terms', 'legal.terms');

// Everything else is the React single-page app.
Route::view('/{any?}', 'app')->where('any', '^(?!api/|auth/|health$|up$).*$');
