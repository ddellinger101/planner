<?php

namespace App\Models;

use App\Enums\Routine;
use App\Models\Concerns\BelongsToHousehold;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Habit extends Model
{
    use BelongsToHousehold;

    protected $guarded = [];

    protected $attributes = [
        'routine' => 'anytime',
        'target_per_week' => 7,
        'sort' => 0,
    ];

    protected function casts(): array
    {
        return [
            'routine' => Routine::class,
            'active_from' => 'date:Y-m-d',
            'active_to' => 'date:Y-m-d',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function checks(): HasMany
    {
        return $this->hasMany(HabitCheck::class);
    }
}
