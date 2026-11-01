import { Repeat } from 'lucide-react';
import { useState, type CSSProperties, type FormEvent } from 'react';
import type { Habit } from '@/api/day';
import type { HabitStats } from '@/api/habits';
import type { Item, ItemChanges, Routine } from '@/api/items';
import type { Category, Member } from '@/api/session';
import { assigneeOf } from '@/components/CategoryBox';
import Streaks from '@/components/habits/Streaks';
import TaskRow from '@/components/TaskRow';

type Props = {
    /** The day's tasks that belong to a routine. */
    items: Item[];
    habits: Habit[];
    stats: Record<number, HabitStats>;
    categories: Category[];
    members: Member[];
    onAdd: (routine: Routine, title: string) => void;
    onChange: (item: Item, changes: ItemChanges) => void;
    onEdit: (item: Item) => void;
    onCheckHabit: (habit: Habit, done: boolean) => void;
};

const TASK_GROUPS: { key: Routine; title: string }[] = [
    { key: 'morning', title: 'Morning tasks' },
    { key: 'evening', title: 'Evening tasks' },
];

// One list, in roughly the order the day goes.
const HABIT_ORDER: Habit['routine'][] = ['morning', 'evening', 'anytime'];

/** The day's streaks, every habit to check off beneath them, then any routine tasks. */
export default function Routines({
    items,
    habits,
    stats,
    categories,
    members,
    onAdd,
    onChange,
    onEdit,
    onCheckHabit,
}: Props) {
    const [title, setTitle] = useState('');
    const [routine, setRoutine] = useState<Routine>('morning');
    const live = items.filter((item) => item.status !== 'dropped');
    const ordered = HABIT_ORDER.flatMap((key) => habits.filter((habit) => habit.routine === key));
    const colorOf = (categoryId: number | null) =>
        categories.find((category) => category.id === categoryId)?.color;

    const submit = (event: FormEvent) => {
        event.preventDefault();

        if (title.trim()) {
            onAdd(routine, title.trim());
            setTitle('');
        }
    };

    return (
        <section className="planner-card routine-card" aria-labelledby="day-routines">
            <h2 id="day-routines" className="font-display h4 routine-heading">
                <Repeat aria-hidden="true" size={20} />
                Routines &amp; habits
            </h2>

            <Streaks habits={ordered} stats={stats} categories={categories} compact />

            {ordered.length + live.length === 0 && (
                <p className="category-box-empty">No habits or routine tasks yet.</p>
            )}

            {ordered.length > 0 && (
                <ul className="task-list">
                    {ordered.map((habit) => {
                        const done = habit.checks.some((check) => check.done);

                        return (
                            <li
                                key={habit.id}
                                className={`cat task-row${done ? ' is-done' : ''}`}
                                style={
                                    {
                                        '--cat': habit.color ?? colorOf(habit.category_id),
                                    } as CSSProperties
                                }
                            >
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={done}
                                    aria-label={habit.title}
                                    className="check"
                                    onClick={() => onCheckHabit(habit, !done)}
                                >
                                    <span className="check-box is-round">
                                        <svg
                                            aria-hidden="true"
                                            width="16"
                                            height="16"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="3.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        >
                                            <path d="M5 12.5l4.5 4.5L19 7.5" />
                                        </svg>
                                    </span>
                                </button>
                                <div className="task-body">
                                    <span className="task-title">{habit.title}</span>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}

            {TASK_GROUPS.map((group) => {
                const tasks = live.filter((item) => item.routine === group.key);

                return (
                    tasks.length > 0 && (
                        <section key={group.key} aria-labelledby={`routine-${group.key}`}>
                            <h3 id={`routine-${group.key}`} className="field-label routine-tasks">
                                {group.title}
                            </h3>
                            <ul className="task-list">
                                {tasks.map((item) => (
                                    <TaskRow
                                        key={item.id}
                                        item={item}
                                        color={colorOf(item.category_id) ?? 'var(--accent)'}
                                        assignee={assigneeOf(item, members)}
                                        onChange={(changes) => onChange(item, changes)}
                                        onEdit={() => onEdit(item)}
                                    />
                                ))}
                            </ul>
                        </section>
                    )
                );
            })}

            <form className="inline-add routine-add" onSubmit={submit}>
                <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Add a routine task…"
                    aria-label="Add a routine task"
                    maxLength={255}
                    enterKeyHint="done"
                />
                <select
                    value={routine}
                    onChange={(event) => setRoutine(event.target.value as Routine)}
                    aria-label="Which routine"
                >
                    <option value="morning">Morning</option>
                    <option value="evening">Evening</option>
                </select>
            </form>
        </section>
    );
}
