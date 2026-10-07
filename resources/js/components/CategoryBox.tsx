import { useEffect, useRef, useState, type CSSProperties, type FormEvent } from 'react';
import type { Item, ItemChanges } from '@/api/items';
import type { Category, Member } from '@/api/session';
import Burst from './Burst';
import CategoryIcon from './CategoryIcon';
import TaskRow from './TaskRow';

type Props = {
    category: Category;
    items: Item[];
    /** Household members, to label who each item belongs to. */
    members: Member[];
    /** What one entry is called on this page: "task" or "goal". */
    noun: string;
    onAdd: (title: string) => void;
    onChange: (item: Item, changes: ItemChanges) => void;
    onDelete: (item: Item) => void;
};

/** A category's box on a period page: its heading, its items and a quick add. */
export default function CategoryBox({
    category,
    items,
    members,
    noun,
    onAdd,
    onChange,
    onDelete,
}: Props) {
    const [title, setTitle] = useState('');
    const active = items.filter((item) => item.status !== 'dropped');
    const doneCount = active.filter((item) => item.status === 'done').length;
    const allDone = active.length > 0 && doneCount === active.length;
    const celebrating = useCelebration(allDone);

    const submit = (event: FormEvent) => {
        event.preventDefault();

        if (title.trim()) {
            onAdd(title.trim());
            setTitle('');
        }
    };

    return (
        <section
            className="cat planner-card category-box"
            style={{ '--cat': category.color } as CSSProperties}
            aria-labelledby={`category-${category.id}`}
        >
            <header className="category-box-header">
                <span className="category-box-icon position-relative">
                    <CategoryIcon icon={category.icon} size={22} />
                    {celebrating && <Burst big />}
                </span>
                <h2 id={`category-${category.id}`} className="highlight-heading">
                    {category.name}
                </h2>
                {active.length > 0 && (
                    <span className="category-box-count">
                        <span aria-hidden="true">
                            {doneCount}/{active.length}
                        </span>
                        <span className="visually-hidden">
                            {doneCount} of {active.length} done
                        </span>
                    </span>
                )}
            </header>

            {active.length === 0 ? (
                <p className="category-box-empty">Nothing here yet.</p>
            ) : (
                <ul className="task-list">
                    {active.map((item) => (
                        <TaskRow
                            key={item.id}
                            item={item}
                            assignee={
                                members.length > 1
                                    ? members.find((member) => member.id === item.assignee_user_id)
                                    : undefined
                            }
                            onChange={(changes) => onChange(item, changes)}
                            onDelete={() => onDelete(item)}
                        />
                    ))}
                </ul>
            )}

            <form className="inline-add" onSubmit={submit}>
                <input
                    type="text"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder={`Add a ${noun}…`}
                    aria-label={`Add a ${category.name} ${noun}`}
                    maxLength={255}
                    enterKeyHint="done"
                />
            </form>
        </section>
    );
}

/** True for a moment when the box goes from unfinished to all done. */
function useCelebration(allDone: boolean): boolean {
    const wasDone = useRef(allDone);
    const [celebrating, setCelebrating] = useState(false);

    useEffect(() => {
        const justFinished = allDone && !wasDone.current;
        wasDone.current = allDone;

        if (!justFinished) {
            return;
        }

        setCelebrating(true);
        const timer = window.setTimeout(() => setCelebrating(false), 1000);

        return () => window.clearTimeout(timer);
    }, [allDone]);

    return celebrating;
}
