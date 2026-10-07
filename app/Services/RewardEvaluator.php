<?php

namespace App\Services;

use App\Enums\ItemStatus;
use App\Enums\RewardStatus;
use App\Models\Item;
use App\Models\Reward;
use App\Services\Push\PushNotifier;

/**
 * Decides when a reward has been earned or has expired.
 *
 * A reward is earned once every task linked to it is done and each was
 * finished by the deadline. It expires if the deadline passes first. Dropped
 * and deleted tasks stop counting, so letting one go doesn't sink the reward.
 * Earned, expired and claimed are final: nothing here moves a reward back.
 */
class RewardEvaluator
{
    public function evaluate(Reward $reward): Reward
    {
        if ($reward->status !== RewardStatus::Active) {
            return $reward;
        }

        $items = $reward->items()
            ->withoutGlobalScope('household')
            ->where('status', '!=', ItemStatus::Dropped)
            ->get();

        $earned = $items->isNotEmpty() && $items->every(
            fn (Item $item) => $item->status === ItemStatus::Done
                && $item->completed_at !== null
                && $item->completed_at->lte($reward->deadline),
        );

        if ($earned) {
            $reward->update(['status' => RewardStatus::Earned, 'earned_at' => now()]);
            app(PushNotifier::class)->rewardEarned($reward);
        } elseif (now()->gt($reward->deadline)) {
            $reward->update(['status' => RewardStatus::Expired]);
        }

        return $reward;
    }

    /** Re-check the rewards a task belongs to, after the task changes. */
    public function evaluateForItem(Item $item): void
    {
        $this->active()
            ->whereHas('items', fn ($query) => $query->withoutGlobalScope('household')->withTrashed()->whereKey($item->id))
            ->get()
            ->each(fn (Reward $reward) => $this->evaluate($reward));
    }

    /** Re-check every active reward, or one household's. Run nightly by the scheduler. */
    public function evaluateAll(?int $householdId = null): void
    {
        $this->active()
            ->when($householdId, fn ($query) => $query->where('household_id', $householdId))
            ->get()
            ->each(fn (Reward $reward) => $this->evaluate($reward));
    }

    private function active()
    {
        return Reward::withoutGlobalScope('household')->where('status', RewardStatus::Active);
    }
}
