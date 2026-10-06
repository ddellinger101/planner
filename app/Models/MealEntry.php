<?php

namespace App\Models;

use App\Enums\MealSlot;
use App\Models\Concerns\BelongsToHousehold;
use Illuminate\Database\Eloquent\Model;

class MealEntry extends Model
{
    use BelongsToHousehold;

    protected $guarded = [];

    protected $hidden = ['etag'];

    protected function casts(): array
    {
        return [
            'slot' => MealSlot::class,
            'date' => 'date:Y-m-d',
        ];
    }
}
