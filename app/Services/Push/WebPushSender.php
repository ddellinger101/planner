<?php

namespace App\Services\Push;

use App\Models\PushSubscription;
use Illuminate\Support\Facades\Log;
use Minishlink\WebPush\Subscription;
use Minishlink\WebPush\WebPush;

/** Sends through the browser vendors' push services, signed with the planner's VAPID keys. */
class WebPushSender implements PushSender
{
    public function configured(): bool
    {
        return filled(config('planner.vapid.public_key')) && filled(config('planner.vapid.private_key'));
    }

    public function send(PushSubscription $subscription, array $payload): bool
    {
        if (! $this->configured()) {
            return true;
        }

        $push = new WebPush(['VAPID' => [
            'subject' => config('planner.vapid.subject'),
            'publicKey' => config('planner.vapid.public_key'),
            'privateKey' => config('planner.vapid.private_key'),
        ]], ['TTL' => 3600, 'urgency' => 'normal'], 20);

        $report = $push->sendOneNotification(
            Subscription::create([
                'endpoint' => $subscription->endpoint,
                'keys' => ['p256dh' => $subscription->p256dh, 'auth' => $subscription->auth],
            ]),
            json_encode($payload, JSON_UNESCAPED_UNICODE),
        );

        if ($report->isSubscriptionExpired()) {
            return false;
        }

        if (! $report->isSuccess()) {
            Log::warning('A push notification was not delivered: '.$report->getReason(), ['subscription' => $subscription->id]);
        }

        return true;
    }
}
