<?php

namespace Tests\Fakes;

use App\Models\PushSubscription;
use App\Services\Push\PushSender;

/** Records what would have been pushed, and to which device. */
class FakePushSender implements PushSender
{
    /** @var list<array{endpoint: string, user_id: int, title: string, body: string, url: string, tag: string}> */
    public array $sent = [];

    public bool $configured = true;

    /** Endpoints the push service reports as gone. */
    public array $expired = [];

    public function configured(): bool
    {
        return $this->configured;
    }

    public function send(PushSubscription $subscription, array $payload): bool
    {
        if (in_array($subscription->endpoint, $this->expired, true)) {
            return false;
        }

        $this->sent[] = ['endpoint' => $subscription->endpoint, 'user_id' => $subscription->user_id, ...$payload];

        return true;
    }

    /** @return list<string> */
    public function titles(?int $userId = null): array
    {
        return array_values(array_map(
            fn (array $push) => $push['title'],
            array_filter($this->sent, fn (array $push) => $userId === null || $push['user_id'] === $userId),
        ));
    }
}
