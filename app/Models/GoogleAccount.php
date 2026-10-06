<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class GoogleAccount extends Model
{
    protected $guarded = [];

    protected $hidden = ['refresh_token', 'access_token'];

    protected function casts(): array
    {
        return [
            'refresh_token' => 'encrypted',
            'access_token' => 'encrypted',
            'expires_at' => 'datetime',
            'scopes' => 'array',
            'needs_reconnect' => 'boolean',
            'tasks_last_synced_at' => 'datetime',
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
}
