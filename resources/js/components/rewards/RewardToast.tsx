import { Trophy, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { useRewards } from '@/api/rewards';
import Burst from '@/components/Burst';

const SEEN_KEY = 'planner.rewards.celebrated';

const readSeen = (): number[] => {
    try {
        return JSON.parse(window.localStorage.getItem(SEEN_KEY) ?? '[]');
    } catch {
        return [];
    }
};

/**
 * Celebrates a reward the moment it is earned, wherever in the app the last
 * task was checked off. Each reward is announced once per device.
 */
export default function RewardToast() {
    const rewards = useRewards();
    const [seen, setSeen] = useState(readSeen);
    const fresh = (rewards.data ?? []).find(
        (reward) => reward.status === 'earned' && !seen.includes(reward.id),
    );

    if (!fresh) {
        return null;
    }

    const dismiss = () => {
        const next = [...seen, fresh.id];
        setSeen(next);

        try {
            window.localStorage.setItem(SEEN_KEY, JSON.stringify(next));
        } catch {
            // Private browsing: it may be announced again next visit.
        }
    };

    return (
        <div className="planner-card toast-prompt is-reward" role="status">
            <span className="reward-icon">
                <Trophy aria-hidden="true" size={20} />
                <Burst big />
            </span>
            <p className="mb-0">
                You earned <strong>{fresh.title}</strong>!
            </p>
            <Link className="button-ink is-small" to="/rewards" onClick={dismiss}>
                Claim it
            </Link>
            <button
                type="button"
                className="icon-button is-small"
                aria-label="Dismiss"
                onClick={dismiss}
            >
                <X aria-hidden="true" size={16} />
            </button>
        </div>
    );
}
