<?php

namespace App\Models;

use App\Models\Concerns\BelongsToHousehold;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ImportantDate extends Model
{
    use BelongsToHousehold;

    protected $guarded = [];

    protected $attributes = ['source' => 'app', 'add_to_calendar' => false];

    protected $hidden = ['google_resource_name', 'google_event_id', 'google_calendar_id', 'hidden_at'];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'repeats_yearly' => 'boolean',
            'add_to_calendar' => 'boolean',
            'hidden_at' => 'datetime',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }
}
