import { Moon, Sunrise } from 'lucide-react';
import { useState, type CSSProperties, type FormEvent } from 'react';
import type { Habit } from '@/api/day';
import type { Item, ItemChanges, Routine } from '@/api/items';
import type { Category, Member } from '@/api/session';
import { assigneeOf } from '@/components/CategoryBox';
import TaskRow from '@/components/TaskRow';

type Props = {
    /** The day's tasks that belong to a routine. */
    items: Item[];
    habits: Habit[];
    categories: Category[];
    members: Member[];
    onAdd: (routine: Routine, title: string) => void;
    onChange: (item: Item, changes: ItemChanges) => void;
    onEdit: (item: Item) => void;
    onCheckHabit: (habit: Habit, done: boolean) => void;
};

const ROUTINES: { key: Routine; title: string; icon: typeof Sunrise }[] = [
    { key: 'morning', title: 'Morning routine', icon: Sunrise },
    { key: 'evening', title: 'Evening routine', icon: Moon },
];

/** The morning and evening checklists: routine tasks and habits together. */
export default function Routines(props: Props) {
    return (
        <>
            {ROUTINES.map((routine) => (
                <RoutineCard key={routine.key} routine={routine} {...props} />
            ))}
        </>
    );
}

function RoutineCard({
    routine,
    items,
    habits,
    categories,
    members,
    onAdd,
    onChange,
    onEdit,
    onCheckHabit,
}: Props & { routine: (typeof ROUTINES)[number] }) {
    const [title, setTitle] = useState('');
    const Icon = routine.icon;
    const tasks = items.filter((item) => item.routine === routine.key && item.status !== 'dropped');
    const routineHabits = habits.filter((habit) => habit.routine === routine.key);
    const colorOf = (categoryId: number | null) =>
        categories.find((category) => category.id === categoryId)?.color;

    const submit = (event: FormEvent) => {
        event.preventDefault();

        if (title.trim()) {
            onAdd(routine.key, title.trim());
            setTitle('');
        }
    };

    return (
        <section className="planner-card routine-card" aria-labelledby={`routine-${routine.key}`}>
            <h2 id={`routine-${routine.key}`} className="font-display h4 routine-heading">
                <Icon aria-hidden="true" size={20} />
                {routine.title}
            </h2>

            {tasks.length + routineHabits.length === 0 ? (
                <p className="category-box-empty">Nothing in this routine yet.</p>
            ) : (
                <ul className="task-list">
                    {routineHabits.map((habit) => {
                        const done = habit.checks.some((check) => check.done);

                        return (
                            <li
                                key={`habit-${habit.id}`}
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
                                    <span className="task-badge">Habit</span>
                                </div>
                            </li>
                        );
                    })}
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
            )}

            <form className="inline-add" onSubmit={submit}>
                <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="Add to this routine…"
                    aria-label={`Add to the ${routine.title.toLowerCase()}`}
                    maxLength={255}
                    enterKeyHint="done"
                />
            </form>
        </section>
    );
}
