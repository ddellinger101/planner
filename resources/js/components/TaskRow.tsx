import { Clock, Repeat, Star, Trash2 } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import type { Item, ItemChanges } from '@/api/items';
import type { Member } from '@/api/session';
import { formatTime } from '@/lib/periodLabels';
import Burst from './Burst';

type Props = {
    item: Item;
    /** Who the item is assigned to, shown when the household has two people. */
    assignee?: Member;
    onChange: (changes: ItemChanges) => void;
    onDelete: () => void;
};

/** Briefly true after `trigger()`, to play a one-off animation. */
function useFlash(duration: number): [boolean, () => void] {
    const [active, setActive] = useState(false);

    useEffect(() => {
        if (!active) {
            return;
        }

        const timer = window.setTimeout(() => setActive(false), duration);

        return () => window.clearTimeout(timer);
    }, [active, duration]);

    return [active, () => setActive(true)];
}

/**
 * One checkable task or goal. It must sit inside a `.cat` element, which
 * supplies the category color.
 */
export default function TaskRow({ item, assignee, onChange, onDelete }: Props) {
    const done = item.status === 'done';
    const [justChecked, flashCheck] = useFlash(700);
    const [justStarred, flashStar] = useFlash(450);

    const toggleDone = () => {
        if (!done) {
            flashCheck();
            // A tiny tap of feedback on phones that support it.
            navigator.vibrate?.(10);
        }

        onChange({ status: done ? 'open' : 'done' });
    };

    const toggleStar = () => {
        if (!item.starred) {
            flashStar();
        }

        onChange({ starred: !item.starred });
    };

    return (
        <li className={`task-row${done ? ' is-done' : ''}`}>
            <button
                type="button"
                role="checkbox"
                aria-checked={done}
                aria-label={item.title}
                className={`check${justChecked ? ' just-checked' : ''}`}
                onClick={toggleDone}
            >
                <span className="check-box">
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
                {justChecked && <Burst />}
            </button>

            <div className="task-body">
                <span className="task-title">{item.title}</span>
                {item.due_time && (
                    <span className="task-badge">
                        <Clock aria-hidden="true" size={12} />
                        {formatTime(item.due_time)}
                    </span>
                )}
                {item.recurrence_rule && (
                    <span className="task-badge" title="Repeats">
                        <Repeat aria-hidden="true" size={12} />
                        <span className="visually-hidden">Repeats</span>
                    </span>
                )}
                {assignee && (
                    <span
                        className="person-dot"
                        style={{ '--person': assignee.color } as CSSProperties}
                        title={assignee.name}
                    >
                        <span aria-hidden="true">{assignee.name.charAt(0)}</span>
                        <span className="visually-hidden">Assigned to {assignee.name}</span>
                    </span>
                )}
            </div>

            <button
                type="button"
                className="icon-button task-delete"
                aria-label={`Delete ${item.title}`}
                onClick={onDelete}
            >
                <Trash2 aria-hidden="true" size={17} />
            </button>
            <button
                type="button"
                className={`icon-button star${justStarred ? ' just-starred' : ''}`}
                aria-pressed={item.starred}
                aria-label={`Star ${item.title}`}
                onClick={toggleStar}
            >
                <Star aria-hidden="true" size={19} />
            </button>
        </li>
    );
}
