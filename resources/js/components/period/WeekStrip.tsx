import { useState, type DragEvent, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { Item, ItemChanges } from '@/api/items';
import type { ImportantDate } from '@/api/planning';
import type { Category, Member } from '@/api/session';
import { assigneeOf } from '@/components/CategoryBox';
import TaskRow, { ITEM_DRAG_TYPE } from '@/components/TaskRow';
import { childPeriods, type Period } from '@/lib/period';
import { periodLabel } from '@/lib/periodLabels';

type Props = {
    week: Period;
    /** The week's day tasks. */
    items: Item[];
    dates: ImportantDate[];
    categories: Category[];
    members: Member[];
    today: string;
    onAdd: (date: string, title: string) => void;
    onChange: (item: Item, changes: ItemChanges) => void;
    onEdit: (item: Item) => void;
};

/**
 * Monday to Sunday, each day with its tasks. Seven columns on a desktop,
 * where a task can be dragged to another day; a row of cards to swipe
 * through on a phone.
 */
export default function WeekStrip({
    week,
    items,
    dates,
    categories,
    members,
    today,
    onAdd,
    onChange,
    onEdit,
}: Props) {
    const [dropTarget, setDropTarget] = useState<string | null>(null);
    // Routine tasks have the routine grid; here they would swamp each day.
    const tasks = items.filter((item) => item.status !== 'dropped' && item.routine === null);
    const colorOf = (item: Item) =>
        categories.find((category) => category.id === item.category_id)?.color ?? 'var(--accent)';

    const drop = (event: DragEvent, date: string) => {
        const item = tasks.find(
            (candidate) => candidate.id === Number(event.dataTransfer.getData(ITEM_DRAG_TYPE)),
        );

        setDropTarget(null);

        if (item && item.due_date !== date) {
            event.preventDefault();
            onChange(item, { period_key: date });
        }
    };

    return (
        <div className="week-strip">
            {childPeriods(week).map((day) => {
                const { title } = periodLabel(day);
                const dayTasks = tasks
                    .filter((item) => item.due_date === day.key)
                    // Timed tasks first, in time order; the rest keep the list order.
                    .sort((a, b) => (a.due_time ?? '99').localeCompare(b.due_time ?? '99'));

                return (
                    <section
                        key={day.key}
                        aria-label={title}
                        className={[
                            'planner-card week-day',
                            day.key === today ? 'is-today' : '',
                            dropTarget === day.key ? 'is-drop-target' : '',
                        ]
                            .filter(Boolean)
                            .join(' ')}
                        onDragOver={(event) => {
                            if (event.dataTransfer.types.includes(ITEM_DRAG_TYPE)) {
                                event.preventDefault();
                                setDropTarget(day.key);
                            }
                        }}
                        onDragLeave={() => setDropTarget(null)}
                        onDrop={(event) => drop(event, day.key)}
                    >
                        <h3 className="week-day-heading">
                            <Link to={`/day/${day.key}`}>
                                <span className="font-display">{title.slice(0, 3)}</span>
                                <span className="week-day-number">{Number(day.key.slice(-2))}</span>
                            </Link>
                        </h3>

                        {dates
                            .filter((date) => date.occurs_on === day.key)
                            .map((date) => (
                                <span key={date.id} className="month-day-chip">
                                    {date.title}
                                </span>
                            ))}

                        <ul className="task-list">
                            {dayTasks.map((item) => (
                                <TaskRow
                                    key={item.id}
                                    item={item}
                                    color={colorOf(item)}
                                    assignee={assigneeOf(item, members)}
                                    compact
                                    onChange={(changes) => onChange(item, changes)}
                                    onEdit={() => onEdit(item)}
                                />
                            ))}
                        </ul>

                        <DayAdd label={title} onAdd={(text) => onAdd(day.key, text)} />
                    </section>
                );
            })}
        </div>
    );
}

function DayAdd({ label, onAdd }: { label: string; onAdd: (title: string) => void }) {
    const [title, setTitle] = useState('');

    const submit = (event: FormEvent) => {
        event.preventDefault();

        if (title.trim()) {
            onAdd(title.trim());
            setTitle('');
        }
    };

    return (
        <form className="inline-add" onSubmit={submit}>
            <input
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Add…"
                aria-label={`Add a task on ${label}`}
                maxLength={255}
                enterKeyHint="done"
            />
        </form>
    );
}
