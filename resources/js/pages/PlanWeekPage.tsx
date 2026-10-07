import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Gift, MapPinOff, Star } from 'lucide-react';
import { useEffect, useState, type CSSProperties, type DragEvent } from 'react';
import { Link, useParams } from 'react-router';
import { CHEF_URL, useMeals } from '@/api/day';
import { useCreateItem, useItems, useUpdateItem, type Item } from '@/api/items';
import { useImportantDates, useItemsBetween } from '@/api/planning';
import { fetchCategories } from '@/api/session';
import BrainDumpBoard from '@/components/brain/BrainDumpBoard';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import GoalBoxes from '@/components/period/GoalBoxes';
import { WeekMeals } from '@/components/period/WeekExtras';
import WeekStrip from '@/components/period/WeekStrip';
import ReviewPeriod from '@/components/review/ReviewPeriod';
import { ITEM_DRAG_TYPE } from '@/components/TaskRow';
import { useItemEditor } from '@/context/ItemEditorContext';
import { useSession } from '@/context/SessionContext';
import { childPeriods, parsePeriod, periodMonths, previousPeriod, type Period } from '@/lib/period';
import { periodLabel, periodName } from '@/lib/periodLabels';
import { useToday } from '@/lib/useCurrentPeriod';

const STEPS = ['Capture', 'Review', 'Pull', 'Big 3', 'Place', 'Meals', 'Done'] as const;
const BIG = 3;

type StepProps = { week: Period };

/**
 * Plan a week in a few guided steps. Every step saves as you go and any of
 * them can be skipped, so leaving halfway loses nothing.
 */
export default function PlanWeekPage() {
    const { key } = useParams();
    const week = key ? parsePeriod(key) : null;
    const [step, setStep] = useState(0);

    if (!week || week.scope !== 'week') {
        return (
            <>
                <PageHeader showPersonFilter={false}>Not found</PageHeader>
                <main className="container-fluid page-body">
                    <EmptyState icon={MapPinOff} title="That week doesn’t exist">
                        Open a week and choose “Plan this week”.
                    </EmptyState>
                </main>
            </>
        );
    }

    const Step = [Capture, Review, Pull, BigThree, Place, Meals, Done][step];
    const last = step === STEPS.length - 1;

    return (
        <>
            <PageHeader showPersonFilter={false}>
                <div>
                    <h1 className="page-title">Plan {periodLabel(week).title}</h1>
                    <div className="page-subtitle">{periodLabel(week).subtitle}</div>
                </div>
            </PageHeader>
            <main className="container-fluid page-body">
                <ol className="plan-steps" aria-label="Planning steps">
                    {STEPS.map((name, index) => (
                        <li key={name}>
                            <button
                                type="button"
                                aria-current={index === step ? 'step' : undefined}
                                className={index < step ? 'is-done' : ''}
                                onClick={() => setStep(index)}
                            >
                                <span className="plan-step-number">{index + 1}</span>
                                {name}
                            </button>
                        </li>
                    ))}
                </ol>

                <div className="plan-step">
                    <Step week={week} />
                </div>

                <div className="plan-nav">
                    <button
                        type="button"
                        className="button-plain d-inline-flex align-items-center gap-2"
                        disabled={step === 0}
                        onClick={() => setStep(step - 1)}
                    >
                        <ArrowLeft aria-hidden="true" size={16} /> Back
                    </button>
                    {last ? (
                        <Link
                            className="button-ink d-inline-flex align-items-center"
                            to={`/week/${week.key}`}
                        >
                            Open the week
                        </Link>
                    ) : (
                        <button
                            type="button"
                            className="button-ink d-inline-flex align-items-center gap-2"
                            onClick={() => setStep(step + 1)}
                        >
                            Next <ArrowRight aria-hidden="true" size={16} />
                        </button>
                    )}
                </div>
            </main>
        </>
    );
}

function StepIntro({ title, children }: { title: string; children: string }) {
    return (
        <>
            <h2 className="font-display h3 mb-1">{title}</h2>
            <p className="text-soft">{children}</p>
        </>
    );
}

const useCategories = () =>
    useQuery({ queryKey: ['categories'], queryFn: fetchCategories }).data ?? [];

// 1. Capture --------------------------------------------------------------------

function Capture() {
    return (
        <>
            <StepIntro title="Get it out of your head">
                Write down everything on your mind. It waits on the Brain Dump until you give it a
                day, which you can do right here.
            </StepIntro>
            <BrainDumpBoard />
        </>
    );
}

// 2. Review last week ---------------------------------------------------------------

function Review({ week }: StepProps) {
    const previous = previousPeriod(week);

    return (
        <>
            <StepIntro title="Look back at last week">
                Close out what’s left from last week before filling the new one.
            </StepIntro>
            <ReviewPeriod periodKey={previous.key} nextPeriodKey={week.key} />
        </>
    );
}

// 3. Pull from the month ---------------------------------------------------------------

function Pull({ week }: StepProps) {
    // A week that straddles two months can draw on both.
    const months = periodMonths(week);
    const weekGoals = useItems({ periodKey: week.key, person: null });

    return (
        <>
            <StepIntro title="Pull from the month">
                Choose which monthly goals to move forward this week, then add anything new.
            </StepIntro>
            {months.map((month) => (
                <MonthGoals
                    key={month.key}
                    month={month}
                    week={week}
                    weekGoals={weekGoals.data ?? []}
                />
            ))}
            <h3 className="font-display section-heading">This week’s goals</h3>
            <GoalBoxes period={week} />
        </>
    );
}

function MonthGoals({
    month,
    week,
    weekGoals,
}: {
    month: Period;
    week: Period;
    weekGoals: Item[];
}) {
    const categories = useCategories();
    const goals = useItems({ periodKey: month.key, person: null });
    const createItem = useCreateItem();
    const open = (goals.data ?? []).filter((goal) => goal.status === 'open');
    const colorOf = (goal: Item) =>
        categories.find((category) => category.id === goal.category_id)?.color;

    return (
        <section className="planner-card p-3 mb-3" aria-label={`${periodLabel(month).title} goals`}>
            <h3 className="font-display h4">{periodName(month)}</h3>
            {goals.isSuccess && open.length === 0 ? (
                <p className="text-soft small mb-0">No open goals this month.</p>
            ) : (
                <ul className="review-list">
                    {open.map((goal) => {
                        const pulled = weekGoals.some(
                            (item) => item.parent_item_id === goal.id && item.status !== 'dropped',
                        );

                        return (
                            <li
                                key={goal.id}
                                className="cat"
                                style={{ '--cat': colorOf(goal) } as CSSProperties}
                            >
                                <span className="review-title">
                                    <span className="month-day-dot is-done" aria-hidden="true" />
                                    {goal.title}
                                </span>
                                <button
                                    type="button"
                                    className="button-plain is-small"
                                    aria-pressed={pulled}
                                    disabled={pulled || createItem.isPending}
                                    onClick={() =>
                                        createItem.mutate({
                                            title: goal.title,
                                            category_id: goal.category_id,
                                            scope: 'week',
                                            period_key: week.key,
                                            parent_item_id: goal.id,
                                            starred: goal.starred,
                                            assignee_user_id: goal.assignee_user_id,
                                        })
                                    }
                                >
                                    {pulled ? (
                                        <>
                                            <Check aria-hidden="true" size={14} /> In this week
                                        </>
                                    ) : (
                                        'Add to this week'
                                    )}
                                </button>
                            </li>
                        );
                    })}
                </ul>
            )}
        </section>
    );
}

// 4. Big 3 ----------------------------------------------------------------------------

function BigThree({ week }: StepProps) {
    const categories = useCategories();
    const goals = useItems({ periodKey: week.key, person: null });
    const updateItem = useUpdateItem();
    const open = (goals.data ?? []).filter((goal) => goal.status === 'open');
    const starred = open.filter((goal) => goal.starred).length;
    const colorOf = (goal: Item) =>
        categories.find((category) => category.id === goal.category_id)?.color;

    return (
        <>
            <StepIntro title="Pick your Big 3">
                Star up to three goals that matter most this week. They stay at the top of their
                boxes.
            </StepIntro>
            <p className="fw-bold" aria-live="polite">
                {starred} of {BIG} chosen
            </p>
            {goals.isSuccess && open.length === 0 ? (
                <p className="text-soft">No goals for this week yet. Go back a step to add some.</p>
            ) : (
                <ul className="review-list">
                    {open.map((goal) => (
                        <li
                            key={goal.id}
                            className="cat"
                            style={{ '--cat': colorOf(goal) } as CSSProperties}
                        >
                            <span className="review-title">
                                <span className="month-day-dot is-done" aria-hidden="true" />
                                {goal.title}
                            </span>
                            <button
                                type="button"
                                className="icon-button star"
                                aria-pressed={goal.starred}
                                aria-label={`Star ${goal.title}`}
                                // Three is the point; unstar one to choose another.
                                disabled={!goal.starred && starred >= BIG}
                                onClick={() =>
                                    updateItem.mutate({
                                        id: goal.id,
                                        changes: { starred: !goal.starred },
                                    })
                                }
                            >
                                <Star aria-hidden="true" size={20} />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </>
    );
}

// 5. Place it ---------------------------------------------------------------------------

function Place({ week }: StepProps) {
    const { household, user } = useSession();
    const { editItem } = useItemEditor();
    const today = useToday();
    const categories = useCategories();
    const goals = useItems({ periodKey: week.key, person: null });
    const tasks = useItemsBetween(week.start, week.end, null);
    const dates = useImportantDates(week.start, week.end);
    const createItem = useCreateItem();
    const updateItem = useUpdateItem();
    const open = (goals.data ?? []).filter((goal) => goal.status === 'open');
    const days = childPeriods(week);
    const other = categories.find((category) => category.slug === 'other') ?? categories.at(-1);

    /** Put a goal on a day as a task that remembers which goal it serves. */
    const schedule = (goal: Item, date: string) =>
        createItem.mutate({
            title: goal.title,
            category_id: goal.category_id,
            scope: 'day',
            period_key: date,
            parent_item_id: goal.id,
            assignee_user_id: goal.assignee_user_id ?? user.id,
        });

    return (
        <>
            <StepIntro title="Give it a day">
                Decide when each goal gets worked on. Drag a goal onto a day, or pick the day from
                its menu.
            </StepIntro>
            {open.length === 0 ? (
                <p className="text-soft">No open goals to place.</p>
            ) : (
                <ul className="review-list mb-3" aria-label="Goals to place">
                    {open.map((goal) => {
                        const placed = (tasks.data ?? []).filter(
                            (task) => task.parent_item_id === goal.id,
                        );

                        return (
                            <PlaceRow
                                key={goal.id}
                                goal={goal}
                                color={
                                    categories.find((category) => category.id === goal.category_id)
                                        ?.color
                                }
                                days={days}
                                placedOn={placed.map((task) => task.due_date!)}
                                onSchedule={(date) => schedule(goal, date)}
                            />
                        );
                    })}
                </ul>
            )}
            <WeekStrip
                week={week}
                items={tasks.data ?? []}
                dates={dates.data ?? []}
                categories={categories}
                members={household.members}
                today={today}
                onAdd={(date, title) =>
                    createItem.mutate({
                        title,
                        category_id: other?.id ?? null,
                        scope: 'day',
                        period_key: date,
                    })
                }
                onChange={(item, changes) => updateItem.mutate({ id: item.id, changes })}
                onEdit={editItem}
                onDropOther={(id, date) => {
                    const goal = open.find((candidate) => candidate.id === id);

                    if (goal) {
                        schedule(goal, date);
                    }
                }}
            />
        </>
    );
}

type PlaceRowProps = {
    goal: Item;
    color?: string;
    days: Period[];
    /** The dates this goal already has a task on. */
    placedOn: string[];
    onSchedule: (date: string) => void;
};

function PlaceRow({ goal, color, days, placedOn, onSchedule }: PlaceRowProps) {
    const startDrag = (event: DragEvent) => {
        event.dataTransfer.setData(ITEM_DRAG_TYPE, String(goal.id));
        event.dataTransfer.effectAllowed = 'copy';
    };

    return (
        <li
            className="cat place-row"
            style={{ '--cat': color } as CSSProperties}
            draggable
            onDragStart={startDrag}
        >
            <span className="review-title">
                <span className="month-day-dot is-done" aria-hidden="true" />
                {goal.title}
                {placedOn.length > 0 && (
                    <span className="task-badge">
                        {placedOn
                            .sort()
                            .map((date) => periodLabel(parsePeriod(date)!).title.slice(0, 3))
                            .join(', ')}
                    </span>
                )}
            </span>
            <select
                className="field-input place-select"
                aria-label={`Day for ${goal.title}`}
                value=""
                onChange={(event) => event.target.value && onSchedule(event.target.value)}
            >
                <option value="">Add to a day…</option>
                {days.map((day) => (
                    <option key={day.key} value={day.key}>
                        {periodName(day)}
                    </option>
                ))}
            </select>
        </li>
    );
}

// 6. Meals -----------------------------------------------------------------------------

function Meals({ week }: StepProps) {
    const meals = useMeals(week.start, week.end);
    const { refetch } = meals;

    // Meals are planned in Chef, in another tab; look again on the way back.
    useEffect(() => {
        const onVisible = () => document.visibilityState === 'visible' && refetch();

        document.addEventListener('visibilitychange', onVisible);

        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [refetch]);

    return (
        <>
            <StepIntro title="Check the meals">
                Meals are planned in Chef and show up here. Fill any empty days there, then come
                back.
            </StepIntro>
            <WeekMeals week={week} meals={meals.data ?? []} />
            <a
                className="button-plain d-inline-flex align-items-center mt-3"
                href={CHEF_URL}
                target="_blank"
                rel="noreferrer"
            >
                Plan meals in Chef
            </a>
        </>
    );
}

// 7. Done --------------------------------------------------------------------------------

function Done({ week }: StepProps) {
    const goals = useItems({ periodKey: week.key, person: null });
    const tasks = useItemsBetween(week.start, week.end, null);
    const active = (goals.data ?? []).filter((goal) => goal.status !== 'dropped');
    const big = active.filter((goal) => goal.starred);
    const planned = (tasks.data ?? []).filter(
        (task) => task.status !== 'dropped' && task.routine === null,
    );

    return (
        <>
            <StepIntro title="You’re set">Here’s the week you’ve planned.</StepIntro>
            <dl className="plan-summary">
                <div>
                    <dt>Goals</dt>
                    <dd>{active.length}</dd>
                </div>
                <div>
                    <dt>Tasks on the calendar</dt>
                    <dd>{planned.length}</dd>
                </div>
            </dl>
            {big.length > 0 && (
                <>
                    <Link
                        className="button-plain d-inline-flex align-items-center gap-2 mb-3"
                        to="/rewards?new=big3"
                    >
                        <Gift aria-hidden="true" size={16} /> Create a reward for your Big{' '}
                        {big.length}
                    </Link>
                    <h3 className="font-display h4">Your Big {big.length}</h3>
                    <ul className="review-list">
                        {big.map((goal) => (
                            <li key={goal.id}>
                                <span className="review-title">
                                    <Star aria-hidden="true" size={16} className="plan-star" />
                                    {goal.title}
                                </span>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </>
    );
}
