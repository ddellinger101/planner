import { CalendarClock, ChefHat, ChevronDown, ExternalLink, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { CHEF_URL, useMeals, type Meal, type MealSlot } from '@/api/day';
import type { CalendarEvent } from '@/api/events';
import { useGoogle } from '@/api/google';
import type { Item, ItemChanges } from '@/api/items';
import EventChip from '@/components/EventChip';
import MealNote from '@/components/MealNote';
import { useEventEditor } from '@/context/EventEditorContext';
import { parsePeriod } from '@/lib/period';
import { periodName } from '@/lib/periodLabels';

const SLOTS: { slot: MealSlot; label: string }[] = [
    { slot: 'breakfast', label: 'Breakfast' },
    { slot: 'lunch', label: 'Lunch' },
    { slot: 'dinner', label: 'Dinner' },
    { slot: 'snack', label: 'Snacks' },
];

/** A meal's main dish, linked to Chef, with anything served alongside it. */
function MealLine({ meal }: { meal: Meal }) {
    return (
        <span className="meal-line">
            {meal.chef_url ? (
                <a href={meal.chef_url} target="_blank" rel="noreferrer">
                    {meal.title}
                </a>
            ) : (
                meal.title
            )}
            {meal.description && (
                <small className="text-soft">with {meal.description.split('\n').join(', ')}</small>
            )}
        </span>
    );
}

/** The day's meals as planned in Chef, with a line to write on wherever Chef has nothing. */
export function MealPlan({ date }: { date: string }) {
    const meals = useMeals(date, date);
    // A meal Chef didn't label is most likely dinner.
    const inSlot = (slot: MealSlot) =>
        (meals.data ?? []).filter(
            (meal) => (meal.slot === 'unknown' ? 'dinner' : meal.slot) === slot,
        );

    return (
        <section className="planner-card side-card" aria-labelledby="meals-heading">
            <div className="d-flex align-items-center justify-content-between">
                <h2 id="meals-heading" className="font-display h4 routine-heading">
                    <ChefHat aria-hidden="true" size={20} />
                    Meal plan
                </h2>
                <a className="small fw-bold" href={CHEF_URL} target="_blank" rel="noreferrer">
                    Open in Chef <ExternalLink aria-hidden="true" size={13} />
                </a>
            </div>
            <dl className="meal-list">
                {SLOTS.map(({ slot, label }) => (
                    <div key={slot}>
                        <dt>{label}</dt>
                        <dd>
                            {inSlot(slot).some((meal) => meal.source === 'chef') ? (
                                inSlot(slot).map((meal) => <MealLine key={meal.id} meal={meal} />)
                            ) : (
                                <MealNote
                                    date={date}
                                    slot={slot as Exclude<MealSlot, 'unknown'>}
                                    note={inSlot(slot)[0]}
                                    label={label}
                                />
                            )}
                        </dd>
                    </div>
                ))}
            </dl>
            <p className="text-soft small mb-0">
                Jot a meal on any empty line. Chef’s plan replaces it once that meal is planned
                there.
            </p>
        </section>
    );
}

type DayEventsProps = {
    date: string;
    isToday: boolean;
    /** The day's events, already narrowed to the person filter. */
    events: CalendarEvent[];
};

/** The day's calendar events, with a way to add one. */
export function DayEvents({ date, isToday, events }: DayEventsProps) {
    const { newEvent } = useEventEditor();
    const google = useGoogle();

    return (
        <section className="planner-card side-card" aria-labelledby="events-heading">
            <div className="d-flex align-items-center justify-content-between">
                <h2 id="events-heading" className="font-display h4 routine-heading">
                    <CalendarClock aria-hidden="true" size={20} />
                    {isToday ? 'Today’s events' : 'Events'}
                </h2>
                <button
                    type="button"
                    className="icon-button is-small"
                    aria-label="Add an event"
                    onClick={() => newEvent({ date })}
                >
                    <Plus aria-hidden="true" size={18} />
                </button>
            </div>
            {events.length === 0 ? (
                <p className="text-soft small mb-0">
                    {google.data && !google.data.calendar_connected ? (
                        <>
                            Connect Google Calendar in <Link to="/settings">Settings</Link> to see
                            your events here.
                        </>
                    ) : (
                        'Nothing on the calendar.'
                    )}
                </p>
            ) : (
                <ul className="event-list">
                    {events.map((event) => (
                        <li key={event.id}>
                            <EventChip event={event} day={date} />
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

type OverdueProps = {
    items: Item[];
    /** Today's period key, where "Move to today" sends a task. */
    today: string;
    onChange: (item: Item, changes: ItemChanges) => void;
};

/** Open tasks from earlier days, each with a one-tap way to deal with it. */
export function OverdueStrip({ items, today, onChange }: OverdueProps) {
    const [open, setOpen] = useState(true);

    if (items.length === 0) {
        return null;
    }

    return (
        <section className="planner-card overdue" aria-labelledby="overdue-heading">
            <h2 id="overdue-heading" className="mb-0">
                <button
                    type="button"
                    className="overdue-toggle"
                    aria-expanded={open}
                    aria-controls="overdue-list"
                    onClick={() => setOpen(!open)}
                >
                    <ChevronDown aria-hidden="true" size={18} className={open ? '' : 'is-closed'} />
                    <span className="font-display">From earlier</span>
                    <span className="category-box-count">{items.length}</span>
                </button>
            </h2>
            {open && (
                <ul id="overdue-list" className="overdue-list">
                    {items.map((item) => (
                        <li key={item.id}>
                            <span className="overdue-title">
                                {item.title}
                                <span className="text-soft small">
                                    {periodName(parsePeriod(item.period_key)!)}
                                </span>
                            </span>
                            <span className="overdue-actions" role="group" aria-label={item.title}>
                                <button
                                    type="button"
                                    className="button-plain is-small"
                                    onClick={() => onChange(item, { period_key: today })}
                                >
                                    Move to today
                                </button>
                                <button
                                    type="button"
                                    className="button-plain is-small"
                                    onClick={() => onChange(item, { status: 'done' })}
                                >
                                    Done
                                </button>
                                <button
                                    type="button"
                                    className="button-plain is-small"
                                    onClick={() => onChange(item, { status: 'dropped' })}
                                >
                                    Drop
                                </button>
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

/** A ring showing how much of the day's list is done. */
export function ProgressRing({ done, total }: { done: number; total: number }) {
    const radius = 17;
    const circumference = 2 * Math.PI * radius;
    const fraction = total === 0 ? 0 : done / total;

    return (
        <span className="progress-ring" role="img" aria-label={`${done} of ${total} tasks done`}>
            <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden="true">
                <circle cx="22" cy="22" r={radius} className="progress-ring-track" />
                <circle
                    cx="22"
                    cy="22"
                    r={radius}
                    className="progress-ring-value"
                    strokeDasharray={circumference}
                    strokeDashoffset={circumference * (1 - fraction)}
                    transform="rotate(-90 22 22)"
                />
            </svg>
            <span aria-hidden="true">
                {done}/{total}
            </span>
        </span>
    );
}
