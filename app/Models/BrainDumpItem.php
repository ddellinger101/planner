<?php

namespace App\Models;

use App\Enums\BrainDumpBucket;
use App\Models\Concerns\BelongsToHousehold;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class BrainDumpItem extends Model
{
    use BelongsToHousehold;

    protected $guarded = [];

    protected $attributes = ['sort' => 0];

    protected function casts(): array
    {
        return [
            'bucket' => BrainDumpBucket::class,
            'assigned_at' => 'datetime',
        ];
    }

    public function assignedItem(): BelongsTo
    {
        return $this->belongsTo(Item::class, 'assigned_item_id');
    }
}
