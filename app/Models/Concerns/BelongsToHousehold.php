<?php

namespace App\Models\Concerns;

use App\Models\Household;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

/**
 * Scopes every query to the signed-in user's household and stamps new rows
 * with it, so one household can never read or write another's data. Outside
 * a request (jobs, commands, tests without a user) no scope is applied and
 * household_id must be set explicitly.
 */
trait BelongsToHousehold
{
    public static function bootBelongsToHousehold(): void
    {
        static::addGlobalScope('household', function (Builder $query) {
            if (Auth::hasUser()) {
                $query->where($query->qualifyColumn('household_id'), Auth::user()->household_id);
            }
        });

        static::creating(function ($model) {
            if ($model->household_id === null && Auth::hasUser()) {
                $model->household_id = Auth::user()->household_id;
            }
        });
    }

    public function household(): BelongsTo
    {
        return $this->belongsTo(Household::class);
    }
}
