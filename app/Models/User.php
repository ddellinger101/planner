<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

#[Fillable([
    'household_id', 'name', 'email', 'email_verified_at', 'avatar_url', 'color', 'timezone',
    'notification_preferences', 'day_start_hour', 'day_end_hour',
])]
#[Hidden(['password', 'remember_token'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected $attributes = [
        'color' => '#2f8f83',
        'timezone' => 'America/New_York',
        'day_start_hour' => 6,
        'day_end_hour' => 23,
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'notification_preferences' => 'array',
            'password' => 'hashed',
        ];
    }

    /**
     * The colors a person can be shown in. They are told apart from each
     * other, not from the category colors, which mark a different thing.
     */
    public const PERSON_COLORS = ['#2f8f83', '#e8677a', '#3b7dd8', '#8257d6', '#d9822b', '#64748b'];

    /** The first person color nobody in the household is using yet. */
    public static function nextColorFor(int $householdId): string
    {
        $taken = static::where('household_id', $householdId)->pluck('color')->all();

        return collect(self::PERSON_COLORS)->first(fn (string $color) => ! in_array($color, $taken, true))
            ?? self::PERSON_COLORS[0];
    }

    public function household(): BelongsTo
    {
        return $this->belongsTo(Household::class);
    }

    /** Calendars belonging to someone else in the household that this person has hidden. */
    public function hiddenCalendars(): BelongsToMany
    {
        return $this->belongsToMany(GoogleCalendar::class, 'hidden_calendars')->withTimestamps();
    }

    public function googleAccount(): HasOne
    {
        return $this->hasOne(GoogleAccount::class);
    }
}
