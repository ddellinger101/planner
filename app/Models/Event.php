<?php

namespace App\Models;

use App\Enums\SyncState;
use App\Models\Concerns\BelongsToHousehold;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\SoftDeletes;

class Event extends Model
{
    use BelongsToHousehold, SoftDeletes;

    protected $guarded = [];

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
}
