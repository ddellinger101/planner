import { useState } from 'react';
import { useHabitsBetween } from '@/api/day';
import { useUpdateItem, type Item } from '@/api/items';
import { habitFor, isVague } from '@/lib/goalChecks';
import type { Period } from '@/lib/period';
import { MakeHabitButton, RewordGoal } from './GoalFixes';

// By wording, not id: the same goal carried on to the next period isn't asked about again.
const KEPT_AS_IS = 'planner.goals-kept-as-is';

/**
 * A look over a period's goals before choosing what matters: which are already
 * habits, and which have no way of ever being finished. It only asks.
 */
export default function GoalCheckup({ goals, period }: { goals: Item[]; period: Period }) {
    const updateItem = useUpdateItem();
    const habits = useHabitsBetween(period.start, period.end, null).data ?? [];
    const [keptAsIs, setKeptAsIs] = useState<string[]>(() =>
        JSON.parse(window.localStorage.getItem(KEPT_AS_IS) ?? '[]'),
    );
    const [rewording, setRewording] = useState<number | null>(null);

    const keepAsIs = (goal: Item) => {
        const next = [...keptAsIs, goal.title.toLowerCase()];

        window.localStorage.setItem(KEPT_AS_IS, JSON.stringify(next));
        setKeptAsIs(next);
    };

    const toAsk = goals.filter((goal) => !keptAsIs.includes(goal.title.toLowerCase()));
    const covered = toAsk.flatMap((goal) => {
        const habit = habitFor(goal, habits);

        return habit ? [{ goal, habit }] : [];
    });
    const vague = toAsk.filter(
        (goal) => isVague(goal.title) && !covered.some((row) => row.goal.id === goal.id),
    );

    const keepButton = (goal: Item) => (
        <button type="button" className="button-plain is-small" onClick={() => keepAsIs(goal)}>
            Keep as is
        </button>
    );

    return (
        <>
            {covered.length > 0 && (
                <section className="planner-card p-3 mb-3" aria-label="Goals that are habits">
                    <h3 className="font-display h4">Already habits</h3>
                    <p className="text-soft small">
                        You check these off in your routines, so they don’t need to be goals too.
                    </p>
                    <ul className="goal-checkup">
                        {covered.map(({ goal, habit }) => (
                            <li key={goal.id}>
                                <span>
                                    {goal.title}
                                    <span className="same-goal-note">
                                        Looks like your “{habit.title}” habit
                                    </span>
                                </span>
                                <span
                                    className="goal-checkup-actions"
                                    role="group"
                                    aria-label={goal.title}
                                >
                                    <button
                                        type="button"
                                        className="button-plain is-small"
                                        onClick={() =>
                                            updateItem.mutate({
                                                id: goal.id,
                                                changes: { status: 'dropped' },
                                            })
                                        }
                                    >
                                        Remove the goal
                                    </button>
                                    {keepButton(goal)}
                                </span>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
            {vague.length > 0 && (
                <section className="planner-card p-3 mb-3" aria-label="Goals with no finish line">
                    <h3 className="font-display h4">How will you know it’s done?</h3>
                    <p className="text-soft small">
                        A number or a date gives these a finish line. If one never really ends, it
                        may be a habit.
                    </p>
                    <ul className="goal-checkup">
                        {vague.map((goal) => (
                            <li key={goal.id}>
                                {rewording === goal.id ? (
                                    <RewordGoal goal={goal} onDone={() => setRewording(null)} />
                                ) : (
                                    <>
                                        <span>{goal.title}</span>
                                        <span
                                            className="goal-checkup-actions"
                                            role="group"
                                            aria-label={goal.title}
                                        >
                                            <button
                                                type="button"
                                                className="button-plain is-small"
                                                onClick={() => setRewording(goal.id)}
                                            >
                                                Reword
                                            </button>
                                            <MakeHabitButton goal={goal} />
                                            {keepButton(goal)}
                                        </span>
                                    </>
                                )}
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </>
    );
}
