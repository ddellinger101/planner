<?php

namespace App\Providers;

use App\Services\Google\GoogleContactsService;
use App\Services\Google\GoogleTasksService;
use App\Services\Google\HttpGoogleContactsService;
use App\Services\Google\HttpGoogleTasksService;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // Google is reached through interfaces so tests can swap in fakes.
        $this->app->bind(GoogleTasksService::class, HttpGoogleTasksService::class);
        $this->app->bind(GoogleContactsService::class, HttpGoogleContactsService::class);
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        //
    }
}
