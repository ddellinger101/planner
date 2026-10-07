<?php

namespace Tests\Fakes;

use App\Models\GoogleAccount;
use App\Services\Google\GoogleAuthException;
use App\Services\Google\GoogleContactsService;

/** An in-memory list of contacts' birthdays. */
class FakeGoogleContacts implements GoogleContactsService
{
    /** @var list<array{resource_name: string, name: string, month: int, day: int, year: int|null}> */
    public array $birthdays = [];

    public bool $revoked = false;

    public function listBirthdays(GoogleAccount $account): array
    {
        if ($this->revoked) {
            throw new GoogleAuthException('Access was revoked.');
        }

        return $this->birthdays;
    }

    public function add(string $name, int $month, int $day, ?int $year = null): string
    {
        $resource = 'people/c'.(count($this->birthdays) + 1);
        $this->birthdays[] = ['resource_name' => $resource, 'name' => $name, 'month' => $month, 'day' => $day, 'year' => $year];

        return $resource;
    }
}
