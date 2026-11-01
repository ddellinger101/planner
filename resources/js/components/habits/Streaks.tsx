import { Flame } from 'lucide-react';
import type { CSSProperties } from 'react';
import type { Habit } from '@/api/day';
import type { HabitStats } from '@/api/habits';
import type { Category } from '@/api/session';

type Props = {
    habits: Habit[];
    stats: Record<number, HabitStats>;
    categories: Category[];
    /** The small version, for sitting above a checklist: just the count and the name. */
    compact?: boolean;
};

/**
 * How long each habit has been kept up, as of now: the longest run first.
 * These are today's figures, whichever period the page around them shows.
 */
export default function Streaks({ habits, stats, categories, compact = false }: Props) {
    const colorOf = (habit: Habit) =>
        habit.color ?? categories.find((category) => category.id === habit.category_id)?.color;
    const streaks = habits
        .flatMap((habit) => (stats[habit.id] ? [{ habit, ...stats[habit.id] }] : []))
        // Longest first, counting a week as seven days so the two kinds compare.
        .sort((a, b) => inDays(b) - inDays(a));

    if (streaks.length === 0) {
        return null;
    }

    return (
        <section className="streaks" aria-labelledby="streaks-heading">
            <h3 id="streaks-heading" className="field-label">
                <Flame aria-hidden="true" size={14} /> Current streaks
            </h3>
            <ul className={`streak-list${compact ? ' is-compact' : ''}`}>
                {streaks.map(({ habit, current_streak, best_streak, streak_unit }) => (
                    <li
                        key={habit.id}
                        className={`streak-tile cat${current_streak === 0 ? ' is-idle' : ''}`}
                        style={{ '--cat': colorOf(habit) } as CSSProperties}
                    >
                        <span className="streak-count">
                            <Flame aria-hidden="true" size={compact ? 14 : 22} />
                            {current_streak}
                        </span>
                        <span className="streak-unit">
                            {current_streak === 1 ? streak_unit.slice(0, -1) : streak_unit}
                            <span className={compact ? 'visually-hidden' : undefined}>
                                {' '}
                                in a row
                            </span>
                        </span>
                        <span className="streak-title">{habit.title}</span>
                        {!compact && (
                            <span className="streak-best">
                                {current_streak > 0 && current_streak >= best_streak
                                    ? 'Your best yet'
                                    : `Best: ${best_streak}`}
                            </span>
                        )}
                    </li>
                ))}
            </ul>
        </section>
    );
}

const inDays = (streak: HabitStats) =>
    streak.current_streak * (streak.streak_unit === 'weeks' ? 7 : 1);
