<?php

namespace App\Services\Google;

use App\Models\GoogleAccount;

interface GoogleContactsService
{
    /**
     * Every contact that has a birthday. `year` is null when the contact's
     * birthday has no year.
     *
     * @return list<array{resource_name: string, name: string, month: int, day: int, year: int|null}>
     *
     * @throws GoogleAuthException
     */
    public function listBirthdays(GoogleAccount $account): array;
}
