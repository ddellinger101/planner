<?php

namespace App\Services\Push;

use App\Models\PushSubscription;

/** Delivers one notification to one device. Behind an interface so tests can stand in for it. */
interface PushSender
{
    /** Whether a public and private key have been set, without which nothing can be sent. */
    public function configured(): bool;

    /**
     * @param  array{title: string, body: string, url: string, tag: string}  $payload
     * @return bool false when the push service says the subscription no longer exists
     */
    public function send(PushSubscription $subscription, array $payload): bool;
}
