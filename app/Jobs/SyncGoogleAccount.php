<?php

namespace App\Jobs;

use App\Models\GoogleAccount;
use App\Services\Google\BirthdaySync;
use App\Services\Google\TaskSync;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

/** One account's full sync: tasks both ways, and optionally contacts' birthdays. */
class SyncGoogleAccount implements ShouldBeUnique, ShouldQueue
{
    use Queueable;

    /** Give up the uniqueness lock if a run dies without releasing it. */
    public int $uniqueFor = 600;

    public function __construct(public int $accountId, public bool $withBirthdays = false) {}

    public function uniqueId(): string
    {
        return $this->accountId.($this->withBirthdays ? ':birthdays' : '');
    }

    public function handle(TaskSync $tasks, BirthdaySync $birthdays): void
    {
        $account = GoogleAccount::find($this->accountId);

        if ($account === null || $account->needs_reconnect) {
            return;
        }

        $tasks->syncAccount($account);

        if ($this->withBirthdays) {
            $birthdays->syncAccount($account->refresh());
        }
    }
}
