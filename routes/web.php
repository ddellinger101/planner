<?php

use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

Route::get('/health', HealthController::class);

// Everything else is the React single-page app.
Route::view('/{any?}', 'app')->where('any', '^(?!api/|health$|up$).*$');
