import { useEffect, useState, type CSSProperties, type DragEvent } from 'react';
import type { CalendarEvent } from '@/api/events';
import type { Item, ItemChanges } from '@/api/items';
import type { Category, Member } from '@/api/session';
import { assigneeOf } from '@/components/CategoryBox';
import EventChip from '@/components/EventChip';
import TaskRow, { ITEM_DRAG_TYPE } from '@/components/TaskRow';
import { formatTime } from '@/lib/periodLabels';

/** Height of one hour on the timeline, in pixels. */
const HOUR_HEIGHT = 52;
const DEFAULT_MINUTES = 30;
const SNAP_MINUTES = 15;
/** The least a block is drawn at, however short it is, so its title can be read and tapped. */
const MIN_BLOCK_HEIGHT = 32;
/** Blocks starting closer together than this would cover each other's titles, so they share the width. */
const SIDE_BY_SIDE_MINUTES = 30;

/** A calendar event and the minutes of this day it covers. */
export type TimedEvent = { event: CalendarEvent; start: number; end: number };

type Props = {
    items: Item[];
    /** The day's events that have times. */
    events?: TimedEvent[];
    /** The day's events that last all of it; they sit above the hours. */
    allDay?: CalendarEvent[];
    /** The day shown, as YYYY-MM-DD. */
    date: string;
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

type Block = {
    item?: Item;
    event?: CalendarEvent;
    start: number;
    end: number;
    /** Where it stops on screen, which for a short block is later than it ends. */
    bottom: number;
    /** How many longer blocks it lies over. */
    depth: number;
    /** Its place among blocks that start together, and how many of them there are. */
    column: number;
    columns: number;
};

/**
 * Give every timed task and event the full width of the day. One that starts
 * while another is going on is laid over it, stepped in a little so the edge
 * of the one underneath still shows. Only blocks that start at about the same
 * time sit side by side, since one would otherwise hide the other's title.
 */
function layOut(items: Item[], events: TimedEvent[]): Block[] {
    const minimum = Math.ceil((MIN_BLOCK_HEIGHT / HOUR_HEIGHT) * 60);
    const block = (start: number, end: number) => ({
        start,
        end,
        bottom: Math.max(end, start + minimum),
        depth: 0,
        column: 0,
        columns: 1,
    });

    const blocks: Block[] = [
        // Events first, so they keep the left-hand place next to a task at the same time.
        ...events.map(({ event, start, end }) => ({
            event,
            ...block(start, Math.max(end, start + DEFAULT_MINUTES)),
        })),
        ...items.map((item) => {
            const start = toMinutes(item.due_time!);

            return { item, ...block(start, start + (item.duration_minutes ?? DEFAULT_MINUTES)) };
        }),
    ].sort((a, b) => a.start - b.start);

    const placed: Block[] = [];
    let together: Block[] = [];

    const settle = () => {
        together.forEach((member, index) => {
            member.column = index;
            member.columns = together.length;
        });
        placed.push(...together);
        together = [];
    };

    for (const next of blocks) {
        const joins =
            together.length > 0 &&
            next.start - together[0].start < SIDE_BY_SIDE_MINUTES &&
            together.some((other) => other.bottom > next.start);

        if (joins) {
            next.depth = together[0].depth;
        } else {
            settle();

            const under = placed.filter((other) => other.bottom > next.start);
            next.depth = under.length > 0 ? Math.max(...under.map((other) => other.depth)) + 1 : 0;
        }

        together.push(next);
    }

    settle();

    return blocks;
}

/**
 * The day in time order: tasks with no time first, then the hours with the
 * timed tasks laid on them. On desktop a task can be dragged onto an hour to
 * give it a time, or back to "Anytime" to clear it.
 */
export default function Timeline({
    items,
    events = [],
    allDay = [],
    date,
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
    const blocks = layOut(
        active.filter((item) => item.due_time),
        events,
    );
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

            {allDay.length > 0 && (
                <ul className="timeline-all-day" aria-label="All-day events">
                    {allDay.map((event) => (
                        <li key={event.id}>
                            <EventChip event={event} day={date} />
                        </li>
                    ))}
                </ul>
            )}

            <div
                className={`timeline-anytime${dropTarget === 'anytime' ? ' is-drop-target' : ''}`}
                onDragOver={(event) => allowDrop(event, 'anytime')}
                onDragLeave={() => setDropTarget(null)}
                onDrop={dropOnAnytime}
            >
                <h3 className="field-label mb-1">Anytime</h3>
                {untimed.length === 0 ? (
                    <p className="text-soft small mb-0">
                        {blocks.some((block) => block.item)
                            ? 'Everything has a time.'
                            : 'Nothing planned yet.'}
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

                <ul className="timeline-blocks" aria-label="Timed tasks and events">
                    {blocks.map(({ item, event, start, end, depth, column, columns }) => {
                        // The stylesheet turns these three into a left edge and a width.
                        const place = {
                            top: offset(start),
                            height: Math.max(((end - start) / 60) * HOUR_HEIGHT, MIN_BLOCK_HEIGHT),
                            '--depth': depth,
                            '--column': column,
                            '--columns': columns,
                        } as CSSProperties;

                        return item ? (
                            <TaskRow
                                key={`item-${item.id}`}
                                item={item}
                                // Fall back to the accent color for a task whose category is unknown.
                                color={colorOf(item) ?? 'var(--accent)'}
                                className="timeline-block"
                                style={place}
                                assignee={assigneeOf(item, members)}
                                compact
                                onChange={(changes) => onChange(item, changes)}
                                onEdit={() => onEdit(item)}
                            />
                        ) : (
                            <li key={`event-${event!.id}`} className="timeline-event" style={place}>
                                <EventChip event={event!} day={date} />
                            </li>
                        );
                    })}
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
