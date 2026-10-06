<?php

use Illuminate\Support\Facades\DB;

it('reports a healthy server', function () {
    $this->getJson('/health')
        ->assertOk()
        ->assertJson(['status' => 'ok', 'database' => 'ok'])
        ->assertJsonStructure(['status', 'database', 'time']);
});

it('reports a degraded server when the database is unreachable', function () {
    DB::shouldReceive('connection')->andThrow(new RuntimeException('down'));

    $this->getJson('/health')
        ->assertStatus(503)
        ->assertJson(['status' => 'degraded', 'database' => 'error']);
});

it('serves the single-page app on any front-end route', function (string $path) {
    $this->withoutVite()
        ->get($path)
        ->assertOk()
        ->assertSee('<div id="app"></div>', false);
})->with(['/', '/week/2027-W01', '/brain-dump']);
