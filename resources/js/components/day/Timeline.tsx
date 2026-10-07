import { useEffect, useState, type DragEvent } from 'react';
import type { Item, ItemChanges } from '@/api/items';
import type { Category, Member } from '@/api/session';
import { assigneeOf } from '@/components/CategoryBox';
import TaskRow, { ITEM_DRAG_TYPE } from '@/components/TaskRow';
import { formatTime } from '@/lib/periodLabels';

/** Height of one hour on the timeline, in pixels. */
const HOUR_HEIGHT = 52;
const DEFAULT_MINUTES = 30;
const SNAP_MINUTES = 15;

type Props = {
    items: Item[];
    categories: Category[];
    members: Member[];
    /** The hours the user wants shown; widened to fit any task outside them. */
    startHour: number;
    endHour: number;
    /** Minutes since midnight right now, when this is today's timeline. */
    nowMinutes: number | null;
    onChange: (item: Item, changes: ItemChanges) => void;
    onEdit: (item: Item) => void;
};

const toMinutes = (time: string) => {
    const [hours, minutes] = time.split(':').map(Number);

    return hours * 60 + minutes;
};

const toTime = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

const hourLabel = (hour: number) => formatTime(`${hour % 24}:00`).replace(':00', '');

type Block = { item: Item; start: number; end: number; lane: number; lanes: number };

/** Place timed tasks side by side where they overlap. */
function layOut(items: Item[]): Block[] {
    const blocks = items
        .map((item) => {
            const start = toMinutes(item.due_time!);

            return {
                item,
                start,
                end: start + (item.duration_minutes ?? DEFAULT_MINUTES),
                lane: 0,
                lanes: 1,
            };
        })
        .sort((a, b) => a.start - b.start || a.item.id - b.item.id);

    let group: Block[] = [];
    let groupEnd = -1;

    const closeGroup = () => {
        const lanes = Math.max(0, ...group.map((block) => block.lane)) + 1;
        group.forEach((block) => (block.lanes = lanes));
        group = [];
    };

    for (const block of blocks) {
        if (block.start >= groupEnd) {
            closeGroup();
        }

        // The first lane whose last task has finished by the time this one starts.
        const taken = group.filter((other) => other.end > block.start).map((other) => other.lane);
        block.lane = [...Array(group.length + 1).keys()].find((lane) => !taken.includes(lane))!;

        group.push(block);
        groupEnd = Math.max(groupEnd, block.end);
    }

    closeGroup();

    return blocks;
}

/**
 * The day in time order: tasks with no time first, then the hours with the
 * timed tasks laid on them. On desktop a task can be dragged onto an hour to
 * give it a time, or back to "Anytime" to clear it.
 */
export default function Timeline({
    items,
    categories,
    members,
    startHour,
    endHour,
    nowMinutes,
    onChange,
    onEdit,
}: Props) {
    const [dropTarget, setDropTarget] = useState<number | 'anytime' | null>(null);
    const active = items.filter((item) => item.status !== 'dropped');
    // "Anytime" is what is still waiting for a slot: finished tasks and routine
    // tasks (which have their own checklists) would only crowd it.
    const untimed = active.filter(
        (item) => !item.due_time && item.status === 'open' && item.routine === null,
    );
    const blocks = layOut(active.filter((item) => item.due_time));
    const colorOf = (item: Item) =>
        categories.find((category) => category.id === item.category_id)?.color;

    // Widen the day to include anything scheduled outside the usual hours.
    const firstHour = Math.min(startHour, ...blocks.map((block) => Math.floor(block.start / 60)));
    const lastHour = Math.min(
        24,
        Math.max(endHour, ...blocks.map((block) => Math.ceil(block.end / 60))),
    );
    const hours = Array.from({ length: lastHour - firstHour }, (_, index) => firstHour + index);
    const offset = (minutes: number) => ((minutes - firstHour * 60) / 60) * HOUR_HEIGHT;

    const draggedItem = (event: DragEvent) =>
        active.find((item) => item.id === Number(event.dataTransfer.getData(ITEM_DRAG_TYPE)));

    const allowDrop = (event: DragEvent, target: number | 'anytime') => {
        if (event.dataTransfer.types.includes(ITEM_DRAG_TYPE)) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'move';
            setDropTarget(target);
        }
    };

    const dropOnHours = (event: DragEvent<HTMLDivElement>) => {
        const item = draggedItem(event);
        setDropTarget(null);

        if (!item) {
            return;
        }

        event.preventDefault();

        const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
        const minutes = firstHour * 60 + (y / HOUR_HEIGHT) * 60;
        const snapped = Math.round(minutes / SNAP_MINUTES) * SNAP_MINUTES;
        const time = toTime(Math.min(Math.max(snapped, 0), 24 * 60 - SNAP_MINUTES));

        if (time !== item.due_time) {
            onChange(item, { due_time: time });
        }
    };

    const dropOnAnytime = (event: DragEvent) => {
        const item = draggedItem(event);
        setDropTarget(null);

        if (item?.due_time) {
            event.preventDefault();
            onChange(item, { due_time: null, duration_minutes: null });
        }
    };

    return (
        <section className="planner-card timeline" aria-labelledby="timeline-heading">
            <h2 id="timeline-heading" className="font-display h4 timeline-heading">
                Schedule
            </h2>

            <div
                className={`timeline-anytime${dropTarget === 'anytime' ? ' is-drop-target' : ''}`}
                onDragOver={(event) => allowDrop(event, 'anytime')}
                onDragLeave={() => setDropTarget(null)}
                onDrop={dropOnAnytime}
            >
                <h3 className="field-label mb-1">Anytime</h3>
                {untimed.length === 0 ? (
                    <p className="text-soft small mb-0">
                        {blocks.length === 0 ? 'Nothing planned yet.' : 'Everything has a time.'}
                    </p>
                ) : (
                    <ul className="task-list">
                        {untimed.map((item) => (
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
                )}
            </div>

            <div
                className="timeline-hours"
                style={{ height: hours.length * HOUR_HEIGHT }}
                onDragOver={(event) => {
                    const y = event.clientY - event.currentTarget.getBoundingClientRect().top;
                    allowDrop(event, firstHour + Math.floor(y / HOUR_HEIGHT));
                }}
                onDragLeave={() => setDropTarget(null)}
                onDrop={dropOnHours}
            >
                {hours.map((hour) => (
                    <div
                        key={hour}
                        className={`timeline-hour${dropTarget === hour ? ' is-drop-target' : ''}`}
                        style={{ height: HOUR_HEIGHT }}
                    >
                        <span className="timeline-hour-label">{hourLabel(hour)}</span>
                    </div>
                ))}

                {nowMinutes !== null &&
                    nowMinutes >= firstHour * 60 &&
                    nowMinutes <= lastHour * 60 && (
                        <div
                            className="timeline-now"
                            style={{ top: offset(nowMinutes) }}
                            aria-hidden="true"
                        />
                    )}

                <ul className="timeline-blocks" aria-label="Timed tasks">
                    {blocks.map(({ item, start, end, lane, lanes }) => (
                        <TaskRow
                            key={item.id}
                            item={item}
                            // Fall back to the accent color for a task whose category is unknown.
                            color={colorOf(item) ?? 'var(--accent)'}
                            className="timeline-block"
                            style={{
                                top: offset(start),
                                height: Math.max(((end - start) / 60) * HOUR_HEIGHT, 32),
                                left: `${(lane / lanes) * 100}%`,
                                width: `${100 / lanes}%`,
                            }}
                            assignee={assigneeOf(item, members)}
                            compact
                            onChange={(changes) => onChange(item, changes)}
                            onEdit={() => onEdit(item)}
                        />
                    ))}
                </ul>
            </div>
        </section>
    );
}

/** Minutes since midnight in the given timezone, refreshed every minute. */
export function useNowMinutes(timeZone: string, enabled: boolean): number | null {
    const read = () => {
        const parts = new Intl.DateTimeFormat('en-GB', {
            timeZone,
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(new Date());
        const part = (type: string) =>
            Number(parts.find((candidate) => candidate.type === type)?.value);

        return part('hour') * 60 + part('minute');
    };

    const [minutes, setMinutes] = useState(read);

    useEffect(() => {
        if (!enabled) {
            return;
        }

        const timer = window.setInterval(() => setMinutes(read()), 60_000);

        return () => window.clearInterval(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [timeZone, enabled]);

    return enabled ? minutes : null;
}
