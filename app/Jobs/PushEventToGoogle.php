<?php

namespace App\Jobs;

use App\Models\Event;
use App\Services\Google\CalendarSync;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Sends one event that was made, changed or deleted in the planner to Google
 * Calendar. Queued, so saving it never waits on Google; the poll sends
 * anything a failed job leaves behind.
 */
class PushEventToGoogle implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public int $eventId) {}

    public function handle(CalendarSync $sync): void
    {
        $event = Event::withTrashed()->withoutGlobalScope('household')->find($this->eventId);

        if ($event !== null) {
            $sync->pushEvent($event);
        }
    }
}
