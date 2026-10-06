<?php

namespace App\Models;

use App\Enums\RewardStatus;
use App\Models\Concerns\BelongsToHousehold;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class Reward extends Model
{
    use BelongsToHousehold;

    protected $guarded = [];

    protected $attributes = ['status' => 'active'];

    protected function casts(): array
    {
        return [
            'status' => RewardStatus::class,
            'deadline' => 'datetime',
            'earned_at' => 'datetime',
            'claimed_at' => 'datetime',
        ];
    }

    public function items(): BelongsToMany
    {
        return $this->belongsToMany(Item::class, 'reward_items');
    }
}
