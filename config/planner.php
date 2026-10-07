<?php

return [

    /*
    | The only Google accounts allowed to sign in, as a comma-separated list
    | in PLANNER_ALLOWED_EMAILS. Everyone on the list shares one planner.
    */
    'allowed_emails' => array_values(array_filter(array_map(
        fn (string $email) => strtolower(trim($email)),
        explode(',', (string) env('PLANNER_ALLOWED_EMAILS', '')),
    ))),

    'household_name' => env('PLANNER_HOUSEHOLD_NAME', 'Our Planner'),

    // Shown on the public privacy and terms pages. Leave empty to show no address.
    'contact_email' => env('PLANNER_CONTACT_EMAIL'),

    // Keys that sign push notifications. Make a pair with `php artisan push:keys`.
    'vapid' => [
        'public_key' => env('VAPID_PUBLIC_KEY'),
        'private_key' => env('VAPID_PRIVATE_KEY'),
        // Who the push services can contact about this sender: a mailto: or https: address.
        'subject' => env('VAPID_SUBJECT', env('APP_URL')),
    ],

];
