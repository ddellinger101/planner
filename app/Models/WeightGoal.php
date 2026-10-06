<?php

namespace App\Models;

use App\Enums\Scope;
use Illuminate\Database\Eloquent\Model;

class WeightGoal extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'scope' => Scope::class,
            'target_weight' => 'float',
        ];
    }
}
