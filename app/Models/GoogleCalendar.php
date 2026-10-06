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
        ];
    }

    public function googleAccount(): BelongsTo
    {
        return $this->belongsTo(GoogleAccount::class);
    }
}
