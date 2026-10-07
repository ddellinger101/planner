import { CalendarClock, ChefHat, ChevronDown, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { CHEF_URL, useMeals, type MealSlot } from '@/api/day';
import type { Item, ItemChanges } from '@/api/items';
import { parsePeriod } from '@/lib/period';
import { periodName } from '@/lib/periodLabels';

const SLOTS: { slot: MealSlot; label: string }[] = [
    { slot: 'breakfast', label: 'Breakfast' },
    { slot: 'lunch', label: 'Lunch' },
    { slot: 'dinner', label: 'Dinner' },
    { slot: 'snack', label: 'Snacks' },
];

/** The day's meals, as planned in Chef. The planner only reads them. */
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
                            {inSlot(slot).length === 0 ? (
                                <span className="text-soft">—</span>
                            ) : (
                                inSlot(slot).map((meal) =>
                                    meal.chef_url ? (
                                        <a
                                            key={meal.id}
                                            href={meal.chef_url}
                                            target="_blank"
                                            rel="noreferrer"
                                        >
                                            {meal.title}
                                        </a>
                                    ) : (
                                        <span key={meal.id}>{meal.title}</span>
                                    ),
                                )
                            )}
                        </dd>
                    </div>
                ))}
            </dl>
            {meals.isSuccess && meals.data.length === 0 && (
                <p className="text-soft small mb-0">Nothing planned for this day yet.</p>
            )}
        </section>
    );
}

/** Calendar events arrive with Google Calendar sync; until then, a note. */
export function EventsPlaceholder() {
    return (
        <section className="planner-card side-card" aria-labelledby="events-heading">
            <h2 id="events-heading" className="font-display h4 routine-heading">
                <CalendarClock aria-hidden="true" size={20} />
                Today’s events
            </h2>
            <p className="text-soft small mb-0">
                Your Google Calendar events will show here, and on the schedule, once the calendar
                is connected.
            </p>
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
