<?php

namespace App\Models;

use App\Models\Concerns\BelongsToHousehold;
use Illuminate\Database\Eloquent\Model;

class PeriodReview extends Model
{
    use BelongsToHousehold;

    protected $guarded = [];
}
