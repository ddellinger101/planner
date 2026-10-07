<?php

namespace App\Models;

use App\Enums\CalendarRole;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GoogleCalendar extends Model
{
    protected $guarded = [];

    protected $hidden = ['sync_token'];

    protected function casts(): array
    {
        return [
            'role' => CalendarRole::class,
            'sync_enabled' => 'boolean',
            'is_primary' => 'boolean',
            'last_synced_at' => 'datetime',
            'full_synced_at' => 'datetime',
        ];
    }

    /** Whether events can be added to and changed on this calendar. */
    public function isWritable(): bool
    {
        return in_array($this->access_role, ['owner', 'writer'], true);
    }

    /** What the calendar is used for, as Settings names it. */
    public function mode(): string
    {
        return match (true) {
            ! $this->sync_enabled => 'hidden',
            $this->role === CalendarRole::Menu => 'menu',
            default => 'events',
        };
    }

    public function googleAccount(): BelongsTo
    {
        return $this->belongsTo(GoogleAccount::class);
    }
}
