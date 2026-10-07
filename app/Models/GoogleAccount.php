<?php

namespace App\Models;

use App\Services\Google\GoogleClient;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GoogleAccount extends Model
{
    protected $guarded = [];

    protected $hidden = ['refresh_token', 'access_token'];

    protected $attributes = [
        'needs_reconnect' => false,
        'sync_birthdays' => true,
    ];

    protected function casts(): array
    {
        return [
            'refresh_token' => 'encrypted',
            'access_token' => 'encrypted',
            'expires_at' => 'datetime',
            'scopes' => 'array',
            'needs_reconnect' => 'boolean',
            'sync_birthdays' => 'boolean',
            'tasks_last_synced_at' => 'datetime',
            'birthdays_synced_at' => 'datetime',
            'calendar_last_synced_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function taskLists(): HasMany
    {
        return $this->hasMany(GoogleTaskList::class);
    }

    public function calendars(): HasMany
    {
        return $this->hasMany(GoogleCalendar::class);
    }

    /** Signing in alone grants no API access; this is true once access was granted and still works. */
    public function hasGranted(string $scope): bool
    {
        return $this->refresh_token !== null
            && ! $this->needs_reconnect
            && in_array($scope, $this->scopes ?? [], true);
    }

    public function canSyncTasks(): bool
    {
        return $this->hasGranted(GoogleClient::SCOPE_TASKS);
    }

    public function canSyncCalendar(): bool
    {
        return $this->hasGranted(GoogleClient::SCOPE_CALENDAR_EVENTS) && $this->hasGranted(GoogleClient::SCOPE_CALENDAR_LIST);
    }

    public function canSyncContacts(): bool
    {
        return $this->sync_birthdays && $this->hasGranted(GoogleClient::SCOPE_CONTACTS);
    }
}
