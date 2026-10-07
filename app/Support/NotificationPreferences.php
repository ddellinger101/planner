<?php

namespace App\Support;

use App\Models\User;

/** Which reminders a person wants, and when. Stored on the user as JSON. */
class NotificationPreferences
{
    public const DEFAULTS = [
        // A reminder before each task that has a time.
        'tasks' => true,
        'task_lead_minutes' => 10,
        'morning' => true,
        'morning_time' => '07:00',
        'evening' => true,
        'evening_time' => '20:30',
        // Sunday: plan the week ahead.
        'weekly' => true,
        'weekly_time' => '17:00',
        // The 1st: review last month and set this month's goals.
        'monthly' => true,
        'rewards' => true,
    ];

    /** @return array<string, mixed> */
    public static function for(User $user): array
    {
        return [...self::DEFAULTS, ...array_intersect_key($user->notification_preferences ?? [], self::DEFAULTS)];
    }

    /** @return array<string, list<string>> */
    public static function rules(): array
    {
        return [
            'tasks' => ['boolean'],
            'task_lead_minutes' => ['integer', 'in:0,5,10,15,30,60'],
            'morning' => ['boolean'],
            'morning_time' => ['date_format:H:i'],
            'evening' => ['boolean'],
            'evening_time' => ['date_format:H:i'],
            'weekly' => ['boolean'],
            'weekly_time' => ['date_format:H:i'],
            'monthly' => ['boolean'],
            'rewards' => ['boolean'],
        ];
    }
}
