<?php

namespace App\Jobs;

use App\Models\GoogleCalendar;
use App\Models\ImportantDate;
use App\Services\Google\CalendarSync;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Adds, updates or removes the Google Calendar event that mirrors an
 * important date. For a date that has been deleted, pass the calendar and
 * event it left behind.
 */
class PushImportantDateToGoogle implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(
        public int $dateId,
        public ?int $orphanCalendarId = null,
        public ?string $orphanEventId = null,
    ) {}

    public function handle(CalendarSync $sync): void
    {
        if ($this->orphanEventId !== null) {
            $calendar = GoogleCalendar::find($this->orphanCalendarId);

            if ($calendar?->googleAccount->canSyncCalendar()) {
                $sync->removeEvent($calendar, $this->orphanEventId);
            }

            return;
        }

        $date = ImportantDate::withoutGlobalScope('household')->find($this->dateId);

        if ($date !== null) {
            $sync->pushImportantDate($date);
        }
    }
}
