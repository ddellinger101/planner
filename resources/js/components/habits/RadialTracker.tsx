import type { CSSProperties } from 'react';
import type { Habit } from '@/api/day';
import type { Category } from '@/api/session';
import { periodDays, type Period } from '@/lib/period';
import { periodLabel, periodName } from '@/lib/periodLabels';

const SIZE = 320;
const CENTER = SIZE / 2;
const OUTER = 134;
const INNER = 44;
const MAX_RING = 22;
const RING_GAP = 3;
/** Degrees left empty between one day's segment and the next. */
const DAY_GAP = 1.2;

const point = (radius: number, degrees: number) => {
    const radians = ((degrees - 90) * Math.PI) / 180;

    return `${(CENTER + radius * Math.cos(radians)).toFixed(2)} ${(CENTER + radius * Math.sin(radians)).toFixed(2)}`;
};

/** One day's slice of one habit's ring. */
const segment = (outer: number, inner: number, from: number, to: number) =>
    `M ${point(outer, from)} A ${outer} ${outer} 0 0 1 ${point(outer, to)} ` +
    `L ${point(inner, to)} A ${inner} ${inner} 0 0 0 ${point(inner, from)} Z`;

type Props = {
    month: Period;
    /** Habits with their checks for the month. */
    habits: Habit[];
    categories: Category[];
    today: string;
};

/**
 * A month of habits as a wheel: each habit is a ring, each day a segment,
 * filled in the habit's color when it was done. The picture is decorative;
 * the list beside it carries the same counts in words.
 */
export default function RadialTracker({ month, habits, categories, today }: Props) {
    const days = periodDays(month);
    const step = 360 / days.length;
    const ring = Math.min(MAX_RING, (OUTER - INNER) / Math.max(habits.length, 1));
    const colorOf = (habit: Habit) =>
        habit.color ??
        categories.find((category) => category.id === habit.category_id)?.color ??
        'var(--accent)';

    if (habits.length === 0) {
        return (
            <p className="text-soft small mb-0">
                Add a habit and its month will fill in here, one ring per habit.
            </p>
        );
    }

    return (
        <div className="radial-tracker">
            <svg
                viewBox={`0 0 ${SIZE} ${SIZE}`}
                role="img"
                aria-label={`Habit wheel for ${periodName(month)}`}
            >
                {habits.map((habit, index) => {
                    const outer = OUTER - index * ring;
                    const inner = outer - ring + RING_GAP;
                    const done = new Set(
                        habit.checks.filter((check) => check.done).map((check) => check.date),
                    );

                    return (
                        <g
                            key={habit.id}
                            className="cat"
                            style={{ '--cat': colorOf(habit) } as CSSProperties}
                        >
                            {days.map((day, dayIndex) => (
                                <path
                                    key={day.key}
                                    d={segment(
                                        outer,
                                        inner,
                                        dayIndex * step + DAY_GAP / 2,
                                        (dayIndex + 1) * step - DAY_GAP / 2,
                                    )}
                                    className={[
                                        'radial-segment',
                                        done.has(day.key) ? 'is-done' : '',
                                        day.key > today ? 'is-future' : '',
                                    ]
                                        .filter(Boolean)
                                        .join(' ')}
                                />
                            ))}
                        </g>
                    );
                })}

                {/* Day numbers around the rim: the 1st, every fifth, and today. */}
                {days.map((day, index) => {
                    const number = index + 1;

                    return number === 1 || number % 5 === 0 || day.key === today ? (
                        <text
                            key={day.key}
                            className={`radial-day${day.key === today ? ' is-today' : ''}`}
                            textAnchor="middle"
                            dominantBaseline="central"
                            {...xy(OUTER + 13, (index + 0.5) * step)}
                        >
                            {number}
                        </text>
                    ) : null;
                })}

                <text
                    className="radial-month"
                    textAnchor="middle"
                    dominantBaseline="central"
                    x={CENTER}
                    y={CENTER}
                >
                    {periodLabel(month).title.slice(0, 3)}
                </text>
            </svg>

            <ul className="radial-legend">
                {habits.map((habit) => {
                    const count = habit.checks.filter((check) => check.done).length;

                    return (
                        <li
                            key={habit.id}
                            className="cat"
                            style={{ '--cat': colorOf(habit) } as CSSProperties}
                        >
                            <span className="radial-swatch" aria-hidden="true" />
                            <span className="radial-legend-title">{habit.title}</span>
                            <span className="text-soft">
                                {count} of {days.length} days
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

const xy = (radius: number, degrees: number) => {
    const [x, y] = point(radius, degrees).split(' ');

    return { x, y };
};
