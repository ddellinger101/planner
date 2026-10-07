<?php

namespace App\Jobs;

use App\Enums\SyncState;
use App\Models\Item;
use App\Services\Google\TaskSync;
use Carbon\CarbonImmutable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/**
 * Sends one changed item to Google Tasks. Queued, so saving a task in the
 * planner never waits on Google.
 */
class PushItemToGoogle implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public function __construct(public int $itemId) {}

    public function handle(TaskSync $sync): void
    {
        $item = Item::withTrashed()->withoutGlobalScope('household')->find($this->itemId);

        // Already sent by an earlier job or the poll.
        if ($item === null || $item->sync_state !== SyncState::Dirty) {
            return;
        }

        // A far-off occurrence of a repeating task waits; the poll sends it
        // when it comes within a week.
        if ($item->recurrence_rule !== null && $item->google_task_id === null) {
            $account = TaskSync::accountFor($item);
            $horizon = CarbonImmutable::now($account?->user->timezone ?? 'UTC')->addDays(7)->toDateString();

            if ($item->due_date->toDateString() > $horizon) {
                return;
            }
        }

        $sync->pushItem($item);
    }
}
