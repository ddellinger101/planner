import { Clock, Repeat, Star, Trash2 } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type DragEvent } from 'react';
import type { Item, ItemChanges } from '@/api/items';
import type { Member } from '@/api/session';
import { formatTime } from '@/lib/periodLabels';
import Burst from './Burst';

/** The drag-and-drop payload type for a task being dragged to a new time or day. */
export const ITEM_DRAG_TYPE = 'application/x-planner-item';

type Props = {
    item: Item;
    /** Who the item is assigned to, shown when the household has two people. */
    assignee?: Member;
    onChange: (changes: ItemChanges) => void;
    /** Open the full editor. Without it, the title is plain text. */
    onEdit?: () => void;
    /** Without it, there is no delete button on the row. */
    onDelete?: () => void;
    /** Leave out the star and badges, for tight spots like the timeline. */
    compact?: boolean;
    /**
     * The category color, for a row that isn't already inside a `.cat`
     * element (a list that mixes categories, such as the timeline).
     */
    color?: string;
    className?: string;
    style?: CSSProperties;
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
 * One checkable task or goal. Its color comes from the `.cat` element it
 * sits in, or from the `color` prop.
 */
export default function TaskRow({
    item,
    assignee,
    onChange,
    onEdit,
    onDelete,
    compact,
    color,
    className = '',
    style,
}: Props) {
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

    const startDrag = (event: DragEvent) => {
        event.dataTransfer.setData(ITEM_DRAG_TYPE, String(item.id));
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <li
            className={`task-row${done ? ' is-done' : ''}${compact ? ' is-compact' : ''}${color ? ' cat' : ''} ${className}`.trim()}
            style={color ? ({ '--cat': color, ...style } as CSSProperties) : style}
            draggable={item.scope === 'day'}
            onDragStart={startDrag}
        >
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
                {compact && item.due_time && (
                    <span className="task-time">{formatTime(item.due_time)}</span>
                )}
                {onEdit ? (
                    <button
                        type="button"
                        className="task-title-button"
                        aria-label={`Edit ${item.title}`}
                        onClick={onEdit}
                    >
                        {/* An inline span, so the strike-through follows each wrapped line. */}
                        <span className="task-title">{item.title}</span>
                    </button>
                ) : (
                    <span className="task-title">{item.title}</span>
                )}
                {!compact && item.due_time && (
                    <span className="task-badge">
                        <Clock aria-hidden="true" size={12} />
                        {formatTime(item.due_time)}
                    </span>
                )}
                {!compact && item.recurrence_rule && (
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

            {onDelete && (
                <button
                    type="button"
                    className="icon-button task-delete"
                    aria-label={`Delete ${item.title}`}
                    onClick={onDelete}
                >
                    <Trash2 aria-hidden="true" size={17} />
                </button>
            )}
            {!compact && (
                <button
                    type="button"
                    className={`icon-button star${justStarred ? ' just-starred' : ''}`}
                    aria-pressed={item.starred}
                    aria-label={`Star ${item.title}`}
                    onClick={toggleStar}
                >
                    <Star aria-hidden="true" size={19} />
                </button>
            )}
        </li>
    );
}
