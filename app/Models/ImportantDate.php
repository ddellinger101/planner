<?php

namespace App\Models;

use App\Models\Concerns\BelongsToHousehold;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ImportantDate extends Model
{
    use BelongsToHousehold;

    protected $guarded = [];

    protected $attributes = ['source' => 'app'];

    protected $hidden = ['google_resource_name'];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'repeats_yearly' => 'boolean',
        ];
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }
}
