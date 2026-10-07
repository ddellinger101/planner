import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { eventsOn, type CalendarEvent } from '@/api/events';
import type { Item } from '@/api/items';
import type { ImportantDate } from '@/api/planning';
import type { Category } from '@/api/session';
import { useSession } from '@/context/SessionContext';
import { nextPeriod, periodFromDate, type Period } from '@/lib/period';
import { periodLabel } from '@/lib/periodLabels';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_DOTS = 6;
const MAX_EVENTS = 2;

/** Every day shown for a month: whole weeks, Monday first. */
export function calendarDays(month: Period): Period[] {
    const last = periodFromDate('week', month.end).end;
    const days: Period[] = [];

    for (
        let day = periodFromDate('day', periodFromDate('week', month.start).start);
        day.key <= last;
        day = nextPeriod(day)
    ) {
        days.push(day);
    }

    return days;
}

type Props = {
    month: Period;
    /** Day tasks in the range shown. */
    items: Item[];
    dates: ImportantDate[];
    /** Calendar events in the range shown, already narrowed to the person filter. */
    events?: CalendarEvent[];
    categories: Category[];
    today: string;
    /** A small version for the quarter view: no chips, no days from other months. */
    compact?: boolean;
};

/** A month as a grid of days. Each day links to its Day view. */
export default function MonthCalendar({
    month,
    items,
    dates,
    events = [],
    categories,
    today,
    compact,
}: Props) {
    const { user } = useSession();
    const colorOf = (item: Item) =>
        categories.find((category) => category.id === item.category_id)?.color ?? 'var(--accent)';

    return (
        <div className={`month-calendar${compact ? ' is-compact' : ''}`}>
            <div className="month-calendar-head" aria-hidden="true">
                {WEEKDAYS.map((name) => (
                    <span key={name}>{compact ? name.charAt(0) : name}</span>
                ))}
            </div>
            <div className="month-calendar-grid">
                {calendarDays(month).map((day) => {
                    const inMonth = day.key >= month.start && day.key <= month.end;

                    if (compact && !inMonth) {
                        return <span key={day.key} className="month-day is-blank" />;
                    }

                    const tasks = items.filter(
                        (item) => item.due_date === day.key && item.status !== 'dropped',
                    );
                    const done = tasks.filter((item) => item.status === 'done').length;
                    const marked = dates.filter((date) => date.occurs_on === day.key);
                    const dayEvents = eventsOn(events, day.key, user.timezone);
                    const { title, subtitle } = periodLabel(day);

                    const summary = [
                        `${title}, ${subtitle}`,
                        tasks.length > 0 ? `${done} of ${tasks.length} tasks done` : 'no tasks',
                        ...marked.map((date) => date.title),
                        ...dayEvents.map((event) => event.title),
                    ].join(', ');

                    return (
                        <Link
                            key={day.key}
                            to={`/day/${day.key}`}
                            aria-label={summary}
                            className={[
                                'month-day',
                                inMonth ? '' : 'is-outside',
                                day.key === today ? 'is-today' : '',
                                marked.length > 0 ? 'is-marked' : '',
                            ]
                                .filter(Boolean)
                                .join(' ')}
                        >
                            <span className="month-day-number">{Number(day.key.slice(-2))}</span>
                            {compact ? (
                                tasks.length > 0 && <span className="month-day-dot" />
                            ) : (
                                <>
                                    {marked.map((date) => (
                                        <span key={date.id} className="month-day-chip">
                                            {date.title}
                                        </span>
                                    ))}
                                    {dayEvents.slice(0, MAX_EVENTS).map((event) => (
                                        <span
                                            key={event.id}
                                            className="month-day-chip is-event"
                                            style={
                                                event.color
                                                    ? ({ '--event': event.color } as CSSProperties)
                                                    : undefined
                                            }
                                        >
                                            {event.title}
                                        </span>
                                    ))}
                                    {dayEvents.length > MAX_EVENTS && (
                                        <span className="month-day-more">
                                            +{dayEvents.length - MAX_EVENTS} more
                                        </span>
                                    )}
                                    <span className="month-day-dots">
                                        {tasks.slice(0, MAX_DOTS).map((item) => (
                                            <span
                                                key={item.id}
                                                className={`cat month-day-dot${item.status === 'done' ? ' is-done' : ''}`}
                                                style={{ '--cat': colorOf(item) } as CSSProperties}
                                            />
                                        ))}
                                        {tasks.length > MAX_DOTS && (
                                            <span className="month-day-more">
                                                +{tasks.length - MAX_DOTS}
                                            </span>
                                        )}
                                    </span>
                                </>
                            )}
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
