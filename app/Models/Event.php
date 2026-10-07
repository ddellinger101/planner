<?php

namespace App\Models;

use App\Enums\SyncState;
use App\Models\Concerns\BelongsToHousehold;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Event extends Model
{
    use BelongsToHousehold, SoftDeletes;

    protected $guarded = [];

    protected $hidden = ['etag', 'sync_state', 'google_calendar_id', 'recurring_event_id', 'deleted_at', 'calendar'];

    protected $appends = ['editable', 'repeats', 'color', 'calendar_name'];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'ends_at' => 'datetime',
            'starts_on' => 'date:Y-m-d',
            'ends_on' => 'date:Y-m-d',
            'all_day' => 'boolean',
            'sync_state' => SyncState::class,
        ];
    }

    public function owner(): BelongsTo
    {
        return $this->belongsTo(User::class, 'owner_user_id');
    }

    public function calendar(): BelongsTo
    {
        return $this->belongsTo(GoogleCalendar::class, 'google_calendar_id');
    }

    /**
     * An event can be changed here when it was made here, or sits on a
     * calendar the person can write to. One occurrence of a repeating event
     * is left to Google Calendar, which knows about the rest of the series.
     */
    protected function editable(): Attribute
    {
        return Attribute::get(fn () => $this->google_calendar_id === null
            || ($this->recurring_event_id === null && (bool) $this->calendar?->isWritable()));
    }

    protected function repeats(): Attribute
    {
        return Attribute::get(fn () => $this->recurring_event_id !== null);
    }

    protected function color(): Attribute
    {
        return Attribute::get(fn () => $this->calendar?->color);
    }

    protected function calendarName(): Attribute
    {
        return Attribute::get(fn () => $this->calendar?->summary);
    }
}
