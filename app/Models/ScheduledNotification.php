<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ScheduledNotification extends Model
{
    protected $guarded = [];

    protected function casts(): array
    {
        return [
            'send_at' => 'datetime',
            'payload' => 'array',
            'sent_at' => 'datetime',
        ];
    }
}
