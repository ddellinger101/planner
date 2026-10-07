<?php

namespace App\Services\Push;

use App\Models\PushSubscription;
use App\Models\Reward;
use App\Models\ScheduledNotification;
use App\Models\User;
use App\Support\NotificationPreferences;
use Throwable;

/** Sends a notification to every device a person has turned notifications on for. */
class PushNotifier
{
    public function __construct(private PushSender $sender) {}

    /**
     * @param  array{title: string, body: string, url: string, tag?: string}  $payload
     * @return int how many devices it went to
     */
    public function notify(User $user, array $payload): int
    {
        $payload['tag'] ??= 'planner';
        $sent = 0;

        foreach (PushSubscription::where('user_id', $user->id)->get() as $subscription) {
            try {
                if ($this->sender->send($subscription, $payload)) {
                    $sent++;
                } else {
                    // The browser unsubscribed, or the app was removed from the phone.
                    $subscription->delete();
                }
            } catch (Throwable $e) {
                report($e);
            }
        }

        return $sent;
    }

    /**
     * Send something at most once. `$key` names what it is about; a second
     * call with the same key does nothing.
     *
     * @param  array{title: string, body: string, url: string, tag?: string}  $payload
     */
    public function notifyOnce(User $user, string $type, string $key, array $payload, ?int $itemId = null): bool
    {
        $record = ScheduledNotification::firstOrCreate(
            ['dedupe_key' => "{$key}:u{$user->id}"],
            ['user_id' => $user->id, 'type' => $type, 'item_id' => $itemId, 'send_at' => now(), 'payload' => $payload],
        );

        if (! $record->wasRecentlyCreated) {
            return false;
        }

        $this->notify($user, ['tag' => $key, ...$payload]);
        $record->update(['sent_at' => now()]);

        return true;
    }

    /** Tell whoever a reward is for that it has been earned. */
    public function rewardEarned(Reward $reward): void
    {
        $people = $reward->beneficiary_user_id !== null
            ? User::whereKey($reward->beneficiary_user_id)->get()
            : User::where('household_id', $reward->household_id)->get();

        foreach ($people as $user) {
            if (NotificationPreferences::for($user)['rewards'] && PushSubscription::where('user_id', $user->id)->exists()) {
                $this->notifyOnce($user, 'reward_earned', "reward-earned:{$reward->id}", [
                    'title' => 'Reward earned!',
                    'body' => "You earned “{$reward->title}”. Go claim it.",
                    'url' => '/rewards',
                ]);
            }
        }
    }
}
