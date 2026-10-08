<?php

namespace App\Services\Push;

use App\Models\PushSubscription;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;
use Psr\Http\Client\ClientInterface;

/** Sends through the browser vendors' push services, signed with the planner's VAPID keys. */
class WebPushSender implements PushSender
{
    /** @param  ClientInterface|null  $http  the library finds one itself; tests pass their own */
    public function __construct(private ?ClientInterface $http = null) {}

    public function configured(): bool
    {
        return filled(config('planner.vapid.public_key')) && filled(config('planner.vapid.private_key'));
    }

    public function send(PushSubscription $subscription, array $payload): bool
    {
        if (! $this->configured()) {
            return true;
        }

        $push = new WebPush(
            ['VAPID' => [
                'subject' => config('planner.vapid.subject'),
                'publicKey' => config('planner.vapid.public_key'),
                'privateKey' => config('planner.vapid.private_key'),
            ]],
            // Kept by the push service for an hour if the device is offline.
            ['TTL' => 3600, 'urgency' => 'normal'],
            $this->http,
        );

        $report = $push->sendOneNotification(
            Subscription::create([
                'endpoint' => $subscription->endpoint,
                'keys' => ['p256dh' => $subscription->p256dh, 'auth' => $subscription->auth],
                // The standard encryption (RFC 8291), which every current browser reads.
                // The library still defaults to an older draft that Safari does not.
                'contentEncoding' => 'aes128gcm',
            ]),
            json_encode($payload, JSON_UNESCAPED_UNICODE),
        );

        if ($report->isSubscriptionExpired()) {
            return false;
        }

        if (! $report->isSuccess()) {
            Log::warning('A push notification was not delivered: '.$report->getReason(), ['subscription' => $subscription->id]);

            // Not delivered, but the device may still be there: keep it and say so.
            throw new PushFailedException($report->getReason());
        }

        return true;
    }
}
