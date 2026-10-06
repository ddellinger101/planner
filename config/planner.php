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

];
