<?php

it('serves the privacy policy and terms to visitors who are not signed in', function (string $path, string $heading) {
    $this->withoutVite()
        ->get($path)
        ->assertOk()
        ->assertSee("<h1 class=\"h2\">{$heading}</h1>", false)
        ->assertSee('href="/privacy"', false)
        ->assertSee('href="/terms"', false)
        // Rendered on the server, not handed to the single-page app.
        ->assertDontSee('<div id="app"></div>', false);
})->with([
    ['/privacy', 'Privacy Policy'],
    ['/terms', 'Terms of Service'],
]);

it('states how Google user data is handled', function () {
    $this->withoutVite()
        ->get('/privacy')
        ->assertSee('Google API Services User Data Policy')
        ->assertSee('Limited Use')
        ->assertSee('myaccount.google.com/permissions');
});

it('shows the contact address only when one is configured', function () {
    config(['planner.contact_email' => null]);
    $this->withoutVite()->get('/privacy')->assertDontSee('mailto:')->assertSee("sent to the app's owner", false);

    config(['planner.contact_email' => 'owner@example.com']);
    $this->withoutVite()->get('/privacy')->assertSee('mailto:owner@example.com', false);
    $this->withoutVite()->get('/terms')->assertSee('mailto:owner@example.com', false);
});
