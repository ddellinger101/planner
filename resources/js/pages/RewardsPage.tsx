import { useQuery } from '@tanstack/react-query';
import { Clock, Gift, Pencil, Plus, Trophy, User } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useUpdateItem } from '@/api/items';
import { countedItems, useClaimReward, useRewards, type Reward } from '@/api/rewards';
import { fetchCategories } from '@/api/session';
import Burst from '@/components/Burst';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { CompletionBar } from '@/components/period/Summaries';
import RewardSheet, { type RewardTarget } from '@/components/rewards/RewardSheet';
import TaskRow from '@/components/TaskRow';
import { usePersonFilter } from '@/context/PersonFilterContext';
import { useSession } from '@/context/SessionContext';

const HOUR = 3_600_000;

/** "3 days left", "Due today" and so on, for a deadline in the future. */
export function timeLeft(deadline: string, now = Date.now()): { text: string; urgent: boolean } {
    const hours = (Date.parse(deadline) - now) / HOUR;

    if (hours <= 0) {
        return { text: 'Deadline passed', urgent: true };
    }

    if (hours < 24) {
        return {
            text: hours < 1 ? 'Less than an hour left' : `${Math.floor(hours)} hours left`,
            urgent: true,
        };
    }

    const days = Math.floor(hours / 24);

    return { text: days === 1 ? '1 day left' : `${days} days left`, urgent: days <= 1 };
}

const formatDay = (timestamp: string, timeZone: string) =>
    new Intl.DateTimeFormat('en-US', {
        timeZone,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
    }).format(new Date(timestamp));

export default function RewardsPage() {
    const rewards = useRewards();
    const [params, setParams] = useSearchParams();
    // The weekly planning flow links here to make a reward of the Big 3.
    const [sheet, setSheet] = useState<RewardTarget | null>(
        params.get('new') === 'big3' ? { kind: 'create', starredThisWeek: true } : null,
    );
    const { person } = usePersonFilter();
    // A reward for both people shows under either of them.
    const all = (rewards.data ?? []).filter(
        (reward) =>
            person === null ||
            reward.beneficiary_user_id === null ||
            reward.beneficiary_user_id === person,
    );
    const earned = all.filter((reward) => reward.status === 'earned');
    const active = all.filter((reward) => reward.status === 'active');
    const past = all.filter((reward) => reward.status === 'claimed' || reward.status === 'expired');

    const close = () => {
        setSheet(null);

        if (params.has('new')) {
            setParams({}, { replace: true });
        }
    };

    return (
        <>
            <PageHeader>Rewards</PageHeader>
            <main className="container-fluid page-body">
                <button
                    type="button"
                    className="button-ink d-inline-flex align-items-center gap-2 mb-3"
                    onClick={() => setSheet({ kind: 'create' })}
                >
                    <Plus aria-hidden="true" size={18} /> Add a reward
                </button>

                {rewards.isSuccess && all.length === 0 && (
                    <EmptyState icon={Gift} title="Something to look forward to">
                        Pick a task or a few, name a reward and set a deadline. Finish them all in
                        time and it’s yours.
                    </EmptyState>
                )}

                {earned.length > 0 && (
                    <>
                        <h2 className="font-display section-heading mt-0">Earned: claim it!</h2>
                        <div className="row g-3 mb-2">
                            {earned.map((reward) => (
                                <div key={reward.id} className="col-12 col-md-6 col-xl-4">
                                    <RewardCard
                                        reward={reward}
                                        onEdit={() => setSheet({ kind: 'edit', reward })}
                                    />
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {active.length > 0 && (
                    <>
                        <h2 className="font-display section-heading">In progress</h2>
                        <div className="row g-3">
                            {active.map((reward) => (
                                <div key={reward.id} className="col-12 col-md-6 col-xl-4">
                                    <RewardCard
                                        reward={reward}
                                        onEdit={() => setSheet({ kind: 'edit', reward })}
                                    />
                                </div>
                            ))}
                        </div>
                    </>
                )}

                {past.length > 0 && (
                    <PastRewards
                        rewards={past}
                        onEdit={(reward) => setSheet({ kind: 'edit', reward })}
                    />
                )}
            </main>

            {sheet && (
                <RewardSheet
                    key={sheet.kind === 'edit' ? sheet.reward.id : 'create'}
                    target={sheet}
                    onClose={close}
                />
            )}
        </>
    );
}

function RewardCard({ reward, onEdit }: { reward: Reward; onEdit: () => void }) {
    const { user, household } = useSession();
    const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
    const updateItem = useUpdateItem();
    const claim = useClaimReward();
    const earned = reward.status === 'earned';
    const items = countedItems(reward);
    const done = items.filter((item) => item.status === 'done').length;
    const left = timeLeft(reward.deadline);
    const beneficiary = household.members.find(
        (member) => member.id === reward.beneficiary_user_id,
    );

    return (
        <section
            className={`planner-card reward-card${earned ? ' is-earned' : ''}`}
            aria-label={reward.title}
        >
            <div className="reward-head">
                <span className="reward-icon">
                    {earned ? (
                        <Trophy aria-hidden="true" size={20} />
                    ) : (
                        <Gift aria-hidden="true" size={20} />
                    )}
                    {/* The biggest celebration in the app, played when the card appears. */}
                    {earned && <Burst big />}
                </span>
                <h3>{reward.title}</h3>
                <button
                    type="button"
                    className="icon-button is-small"
                    aria-label={`Edit ${reward.title}`}
                    onClick={onEdit}
                >
                    <Pencil aria-hidden="true" size={15} />
                </button>
            </div>

            {reward.description && <p className="mb-0">{reward.description}</p>}

            <div className="reward-meta">
                {earned ? (
                    <span>
                        Earned {reward.earned_at ? formatDay(reward.earned_at, user.timezone) : ''}
                    </span>
                ) : (
                    <span className={left.urgent ? 'is-urgent' : ''}>
                        <Clock aria-hidden="true" size={14} />
                        {left.text} (by {formatDay(reward.deadline, user.timezone)})
                    </span>
                )}
                <span>
                    <User aria-hidden="true" size={14} />
                    For{' '}
                    {beneficiary
                        ? beneficiary.name
                        : household.members.length > 1
                          ? 'both of you'
                          : 'you'}
                </span>
            </div>

            <CompletionBar label="Tasks done" done={done} total={items.length} />

            {earned ? (
                <button
                    type="button"
                    className="button-ink justify-self-start"
                    disabled={claim.isPending}
                    onClick={() => claim.mutate(reward.id)}
                >
                    Claim it
                </button>
            ) : (
                <ul className="reward-tasks">
                    {items.map((item) => (
                        <TaskRow
                            key={item.id}
                            item={item}
                            color={
                                categories.data?.find(
                                    (category) => category.id === item.category_id,
                                )?.color ?? 'var(--accent)'
                            }
                            compact
                            onChange={(changes) => updateItem.mutate({ id: item.id, changes })}
                        />
                    ))}
                </ul>
            )}
        </section>
    );
}

function PastRewards({ rewards, onEdit }: { rewards: Reward[]; onEdit: (reward: Reward) => void }) {
    const { user } = useSession();

    return (
        <section aria-labelledby="past-rewards">
            <h2 id="past-rewards" className="font-display section-heading">
                Claimed and expired
            </h2>
            <ul className="planner-card reward-history p-3">
                {rewards.map((reward) => (
                    <li key={reward.id}>
                        <strong>{reward.title}</strong>
                        <span className="text-soft small">
                            {reward.status === 'claimed'
                                ? `Claimed ${reward.claimed_at ? formatDay(reward.claimed_at, user.timezone) : ''}`
                                : `Expired ${formatDay(reward.deadline, user.timezone)}`}
                        </span>
                        {/* An expired reward can be given a later deadline. */}
                        {reward.status === 'expired' && (
                            <button
                                type="button"
                                className="button-plain is-small ms-auto"
                                onClick={() => onEdit(reward)}
                            >
                                Extend or edit
                            </button>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}
