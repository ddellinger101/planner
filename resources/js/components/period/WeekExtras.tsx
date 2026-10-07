import { ChefHat, ExternalLink, Sunrise } from 'lucide-react';
import type { CSSProperties } from 'react';
import { CHEF_URL, type Habit, type Meal } from '@/api/day';
import type { Item, ItemChanges } from '@/api/items';
import type { Category } from '@/api/session';
import { childPeriods, type Period } from '@/lib/period';
import { periodLabel } from '@/lib/periodLabels';

const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'unknown', 'snack'];

/** The week's meals from Chef, one row per day. */
export function WeekMeals({ week, meals }: { week: Period; meals: Meal[] }) {
    return (
        <section className="planner-card p-3 h-100" aria-labelledby="week-meals">
            <div className="d-flex align-items-center justify-content-between">
                <h2 id="week-meals" className="font-display h4 routine-heading">
                    <ChefHat aria-hidden="true" size={20} />
                    Meal plan
                </h2>
                <a className="small fw-bold" href={CHEF_URL} target="_blank" rel="noreferrer">
                    Open in Chef <ExternalLink aria-hidden="true" size={13} />
                </a>
            </div>
            <dl className="week-meals">
                {childPeriods(week).map((day) => {
                    const dayMeals = meals
                        .filter((meal) => meal.date === day.key)
                        .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot));

                    return (
                        <div key={day.key}>
                            <dt>{periodLabel(day).title.slice(0, 3)}</dt>
                            <dd>
                                {dayMeals.length === 0 ? (
                                    <a
                                        className="text-soft"
                                        href={CHEF_URL}
                                        target="_blank"
                                        rel="noreferrer"
                                    >
                                        Plan in Chef
                                    </a>
                                ) : (
                                    dayMeals.map((meal) =>
                                        meal.chef_url ? (
                                            <a
                                                key={meal.id}
                                                href={meal.chef_url}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                {meal.title}
                                            </a>
                                        ) : (
                                            <span key={meal.id}>{meal.title}</span>
                                        ),
                                    )
                                )}
                            </dd>
                        </div>
                    );
                })}
            </dl>
        </section>
    );
}

type GridProps = {
    week: Period;
    /** The week's day tasks; the ones in a routine become rows. */
    items: Item[];
    habits: Habit[];
    categories: Category[];
    onChange: (item: Item, changes: ItemChanges) => void;
    onCheckHabit: (habit: Habit, date: string, done: boolean) => void;
    title?: string;
};

type Row = {
    key: string;
    title: string;
    color?: string;
    /** For each day of the week: whether it's done, or null when it doesn't apply. */
    cells: { date: string; done: boolean; toggle: () => void }[];
};

/**
 * Routines across the week: a row per habit or routine task, a column per
 * day, like the check grid in a bullet journal.
 */
export function RoutineGrid({
    week,
    items,
    habits,
    categories,
    onChange,
    onCheckHabit,
    title = 'Routines this week',
}: GridProps) {
    const days = childPeriods(week);
    const colorOf = (categoryId: number | null) =>
        categories.find((category) => category.id === categoryId)?.color;

    const habitRows: Row[] = habits.map((habit) => ({
        key: `habit-${habit.id}`,
        title: habit.title,
        color: habit.color ?? colorOf(habit.category_id),
        cells: days.map((day) => {
            const done = habit.checks.some((check) => check.date === day.key && check.done);

            return { date: day.key, done, toggle: () => onCheckHabit(habit, day.key, !done) };
        }),
    }));

    // Occurrences of the same repeating task share a row; one-off routine
    // tasks are grouped by name.
    const groups = new Map<string, Item[]>();

    for (const item of items) {
        if (item.routine !== null && item.status !== 'dropped') {
            const key = String(
                item.recurrence_parent_id ?? (item.recurrence_rule ? item.id : item.title),
            );
            groups.set(key, [...(groups.get(key) ?? []), item]);
        }
    }

    const taskRows: Row[] = [...groups.entries()].map(([key, group]) => ({
        key: `task-${key}`,
        title: group[0].title,
        color: colorOf(group[0].category_id),
        cells: group.map((item) => ({
            date: item.due_date!,
            done: item.status === 'done',
            toggle: () => onChange(item, { status: item.status === 'done' ? 'open' : 'done' }),
        })),
    }));

    const rows = [...habitRows, ...taskRows];

    return (
        <section className="planner-card p-3 h-100" aria-labelledby="routine-grid">
            <h2 id="routine-grid" className="font-display h4 routine-heading">
                <Sunrise aria-hidden="true" size={20} />
                {title}
            </h2>
            {rows.length === 0 ? (
                <p className="text-soft small mb-0">
                    Routine tasks and habits will line up here, one row each.
                </p>
            ) : (
                <div className="routine-grid-scroll">
                    <table className="routine-grid">
                        <thead>
                            <tr>
                                <td />
                                {days.map((day) => (
                                    <th key={day.key} scope="col">
                                        <abbr title={periodLabel(day).title}>
                                            {periodLabel(day).title.charAt(0)}
                                        </abbr>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((row) => (
                                <tr
                                    key={row.key}
                                    className="cat"
                                    style={
                                        { '--cat': row.color ?? 'var(--accent)' } as CSSProperties
                                    }
                                >
                                    <th scope="row">{row.title}</th>
                                    {days.map((day) => {
                                        const cell = row.cells.find(
                                            (candidate) => candidate.date === day.key,
                                        );

                                        return (
                                            <td key={day.key}>
                                                {cell && (
                                                    <button
                                                        type="button"
                                                        role="checkbox"
                                                        aria-checked={cell.done}
                                                        aria-label={`${row.title}, ${periodLabel(day).title}`}
                                                        className="grid-check"
                                                        onClick={cell.toggle}
                                                    />
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}
