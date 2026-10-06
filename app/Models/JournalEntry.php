<?php

namespace App\Models;

use App\Enums\JournalType;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class JournalEntry extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return ['type' => JournalType::class];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
