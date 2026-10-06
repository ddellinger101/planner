<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WeightEntry extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'weight' => 'float',
        ];
    }
}
