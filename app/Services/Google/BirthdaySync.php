<?php

namespace App\Services\Google;

use App\Models\GoogleAccount;
use App\Models\ImportantDate;
use Illuminate\Support\Facades\Log;

/**
 * Copies contacts' birthdays into the planner as yearly important dates, so
 * they appear on the Day, Week and Month views like any other. One-way:
 * they are edited in Google Contacts, not here.
 */
class BirthdaySync
{
    public const SOURCE = 'google_contacts';

    /** Used when a contact's birthday has no year. A leap year, so February 29 is valid. */
    private const UNKNOWN_YEAR = 1904;

    public function __construct(private GoogleContactsService $contacts) {}

    public function syncAccount(GoogleAccount $account): void
    {
        $mine = ImportantDate::withoutGlobalScope('household')
            ->where('source', self::SOURCE)
            ->where('owner_user_id', $account->user_id);

        // Turned off, or contacts access was never granted: nothing of ours stays behind.
        if (! $account->canSyncContacts()) {
            $mine->delete();

            return;
        }

        try {
            $birthdays = $this->contacts->listBirthdays($account);
        } catch (GoogleAuthException) {
            $account->update(['needs_reconnect' => true]);
            Log::warning('Birthday sync stopped: the account needs reconnecting.', ['account' => $account->id]);

            return;
        }

        foreach ($birthdays as $birthday) {
            if (! checkdate($birthday['month'], $birthday['day'], $birthday['year'] ?? self::UNKNOWN_YEAR)) {
                continue;
            }

            ImportantDate::withoutGlobalScope('household')->updateOrCreate(
                ['owner_user_id' => $account->user_id, 'google_resource_name' => $birthday['resource_name']],
                [
                    'household_id' => $account->user->household_id,
                    'source' => self::SOURCE,
                    'title' => $birthday['name'].'’s birthday',
                    'date' => sprintf('%04d-%02d-%02d', $birthday['year'] ?? self::UNKNOWN_YEAR, $birthday['month'], $birthday['day']),
                    'repeats_yearly' => true,
                ],
            );
        }

        // A contact that was deleted, or lost its birthday, goes too.
        (clone $mine)->whereNotIn('google_resource_name', array_column($birthdays, 'resource_name'))->delete();

        $account->update(['birthdays_synced_at' => now()]);
    }
}
