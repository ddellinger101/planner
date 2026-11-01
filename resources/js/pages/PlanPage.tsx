import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, Gift, MapPinOff, Star } from 'lucide-react';
import { useEffect, useState, type ComponentType, type CSSProperties, type DragEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { CHEF_URL, useMeals } from '@/api/day';
import { eventsFor, useEvents } from '@/api/events';
import { useCreateItem, useItems, useItemsIn, useUpdateItem, type Item } from '@/api/items';
import { useImportantDates, useItemsBetween } from '@/api/planning';
import { fetchCategories } from '@/api/session';
import BrainDumpBoard from '@/components/brain/BrainDumpBoard';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { periodPath } from '@/components/PeriodNav';
import GoalBoxes from '@/components/period/GoalBoxes';
import ImportantDates from '@/components/period/ImportantDates';
import MonthCalendar, { calendarDays } from '@/components/period/MonthCalendar';
import { WeekMeals } from '@/components/period/WeekExtras';
import WeekStrip from '@/components/period/WeekStrip';
import ReviewPeriod from '@/components/review/ReviewPeriod';
import { ITEM_DRAG_TYPE } from '@/components/TaskRow';
import { useItemEditor } from '@/context/ItemEditorContext';
import { useSession } from '@/context/SessionContext';
import {
    childPeriods,
    parentPeriod,
    parsePeriod,
    periodMonths,
    previousPeriod,
    type Period,
    type Scope,
} from '@/lib/period';
import {
    periodLabel,
    periodName,
    periodShortName,
    periodsToPlan,
    planChoiceName,
    SCOPE_NAMES,
} from '@/lib/periodLabels';
import { isSameGoal, lookAlikeGroups, looksLikeSameGoal } from '@/lib/sameGoal';
import { useToday } from '@/lib/useCurrentPeriod';

const BIG = 3;

type StepProps = { period: Period };

type Step = { name: string; Body: ComponentType<StepProps> };

const noun = (scope: Scope) => SCOPE_NAMES[scope].toLowerCase();

/** The next scope down: what a period's goals get placed into. */
const childScope = (period: Period) => childPeriods(period)[0].scope;

/**
 * Plan a week, month, quarter or year in a few guided steps. Every step saves
 * as you go and any of them can be skipped, so leaving halfway loses nothing.
 */
export default function PlanPage() {
    const { key } = useParams();
    const period = key ? parsePeriod(key) : null;

    if (!period || period.scope === 'day') {
        return (
            <>
                <PageHeader showPersonFilter={false}>Not found</PageHeader>
                <main className="container-fluid page-body">
                    <EmptyState icon={MapPinOff} title="There’s nothing to plan here">
                        Open a week, month, quarter or year and choose its Plan button.
                    </EmptyState>
                </main>
            </>
        );
    }

    // Keyed so switching to another period starts again from the first step.
    return <PlanFlow key={period.key} period={period} />;
}

function PlanFlow({ period }: StepProps) {
    const today = useToday();
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const steps = stepsFor(period);
    const { Body } = steps[step];
    const last = step === steps.length - 1;
    const { title, subtitle } = periodLabel(period);

    return (
        <>
            <PageHeader showPersonFilter={false}>
                <div>
                    <h1 className="page-title">Plan {title}</h1>
                    {subtitle && <div className="page-subtitle">{subtitle}</div>}
                </div>
            </PageHeader>
            <main className="container-fluid page-body">
                {/* The Plan buttons look ahead, so this is the way to any other period. */}
                <div className="plan-period">
                    <label className="field-label" htmlFor="plan-period">
                        {SCOPE_NAMES[period.scope]} to plan
                    </label>
                    <select
                        id="plan-period"
                        className="field-input"
                        value={period.key}
                        onChange={(event) =>
                            navigate(`/plan/${event.target.value}`, { replace: true })
                        }
                    >
                        {periodsToPlan(period, today).map((choice) => (
                            <option key={choice.key} value={choice.key}>
                                {planChoiceName(choice, today)}
                            </option>
                        ))}
                    </select>
                </div>

                <ol className="plan-steps" aria-label="Planning steps">
                    {steps.map(({ name }, index) => (
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
                    <Body period={period} />
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
                            to={periodPath(period)}
                        >
                            Open the {noun(period.scope)}
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

function stepsFor(period: Period): Step[] {
    const start = [
        { name: 'Capture', Body: Capture },
        { name: 'Review', Body: Review },
    ];
    const big3 = { name: 'Big 3', Body: BigThree };
    const place = { name: 'Place', Body: PlaceInPeriods };
    const done = { name: 'Done', Body: Done };
    const pull = { name: 'Pull', Body: Pull };

    switch (period.scope) {
        case 'week':
            return [
                ...start,
                pull,
                big3,
                { name: 'Place', Body: PlaceOnDays },
                { name: 'Meals', Body: Meals },
                done,
            ];
        case 'month':
            return [...start, pull, big3, place, { name: 'Dates', Body: Dates }, done];
        case 'quarter':
            return [...start, pull, big3, place, done];
        default:
            // A year has nothing above it to pull from.
            return [...start, { name: 'Goals', Body: YearGoals }, big3, place, done];
    }
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

// Capture --------------------------------------------------------------------

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

// Review the period before ---------------------------------------------------------

function Review({ period }: StepProps) {
    const previous = previousPeriod(period);

    return (
        <>
            <StepIntro title={`Look back at ${periodShortName(previous)}`}>
                {`Close out what’s left before filling ${periodShortName(period)}.`}
            </StepIntro>
            <ReviewPeriod periodKey={previous.key} nextPeriodKey={period.key} />
        </>
    );
}

// Pull from the period above ---------------------------------------------------------

function Pull({ period }: StepProps) {
    // A week that straddles two months can draw on both.
    const sources = period.scope === 'week' ? periodMonths(period) : [parentPeriod(period)!];
    const name = periodShortName(period);
    const goals = useItems({ periodKey: period.key, person: null });

    return (
        <>
            <StepIntro title={`Pull from the ${noun(sources[0].scope)}`}>
                {`Choose which of the ${noun(sources[0].scope)}’s goals to move forward in ${name}, then add anything new.`}
            </StepIntro>
            {sources.map((source) => (
                <SourceGoals
                    key={source.key}
                    source={source}
                    period={period}
                    pulledInto={goals.data ?? []}
                />
            ))}
            <h3 className="font-display section-heading">Goals for {name}</h3>
            <GoalBoxes period={period} />
        </>
    );
}

function SourceGoals({
    source,
    period,
    pulledInto,
}: {
    source: Period;
    period: Period;
    pulledInto: Item[];
}) {
    const categories = useCategories();
    const goals = useItems({ periodKey: source.key, person: null });
    const createItem = useCreateItem();
    const open = (goals.data ?? []).filter((goal) => goal.status === 'open');
    const name = periodShortName(period);
    const colorOf = (goal: Item) =>
        categories.find((category) => category.id === goal.category_id)?.color;

    return (
        <section
            className="planner-card p-3 mb-3"
            aria-label={`${periodLabel(source).title} goals`}
        >
            <h3 className="font-display h4">{periodName(source)}</h3>
            {goals.isSuccess && open.length === 0 ? (
                <p className="text-soft small mb-0">No open goals in {periodShortName(source)}.</p>
            ) : (
                <ul className="review-list">
                    {open.map((goal) => {
                        const here = pulledInto.filter((item) => item.status !== 'dropped');
                        const pulled = here.some(
                            (item) => item.parent_item_id === goal.id || isSameGoal(item, goal),
                        );
                        const alike = pulled
                            ? undefined
                            : here.find((item) => looksLikeSameGoal(item, goal));

                        return (
                            <li
                                key={goal.id}
                                className="cat"
                                style={{ '--cat': colorOf(goal) } as CSSProperties}
                            >
                                <span className="review-title">
                                    <span className="month-day-dot is-done" aria-hidden="true" />
                                    {goal.title}
                                    {alike && (
                                        <span className="same-goal-note">
                                            Looks like “{alike.title}”, already in {name}
                                        </span>
                                    )}
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
                                            scope: period.scope,
                                            period_key: period.key,
                                            parent_item_id: goal.id,
                                            starred: goal.starred,
                                            assignee_user_id: goal.assignee_user_id,
                                        })
                                    }
                                >
                                    {pulled ? (
                                        <>
                                            <Check aria-hidden="true" size={14} /> In {name}
                                        </>
                                    ) : alike ? (
                                        'Add anyway'
                                    ) : (
                                        `Add to ${name}`
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

function YearGoals({ period }: StepProps) {
    return (
        <>
            <StepIntro title={`Set the goals for ${period.key}`}>
                What do you want to be true by the end of the year?
            </StepIntro>
            <GoalBoxes period={period} />
        </>
    );
}

// Big 3 ----------------------------------------------------------------------------

function BigThree({ period }: StepProps) {
    const categories = useCategories();
    const goals = useItems({ periodKey: period.key, person: null });
    const updateItem = useUpdateItem();
    const open = (goals.data ?? []).filter((goal) => goal.status === 'open');
    const starred = open.filter((goal) => goal.starred).length;
    const name = periodShortName(period);
    const colorOf = (goal: Item) =>
        categories.find((category) => category.id === goal.category_id)?.color;

    return (
        <>
            <StepIntro title="Pick your Big 3">
                {`Star up to three goals that matter most in ${name}. They stay at the top of their boxes.`}
            </StepIntro>
            <p className="fw-bold" aria-live="polite">
                {starred} of {BIG} chosen
            </p>
            <LookAlikes goals={open} />
            {goals.isSuccess && open.length === 0 ? (
                <p className="text-soft">No goals for {name} yet. Go back a step to add some.</p>
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

const KEPT_APART = 'planner.goals-kept-apart';

const groupKey = (group: Item[]) =>
    group
        .map((goal) => goal.id)
        .sort((a, b) => a - b)
        .join('-');

/** Offer to merge goals that look like one goal, with the last word left to the person. */
function LookAlikes({ goals }: { goals: Item[] }) {
    const updateItem = useUpdateItem();
    // Remembered, so that goals they've said are different stop being asked about.
    const [keptApart, setKeptApart] = useState<string[]>(() =>
        JSON.parse(window.localStorage.getItem(KEPT_APART) ?? '[]'),
    );
    const groups = lookAlikeGroups(goals).filter((group) => !keptApart.includes(groupKey(group)));

    const keepOne = (kept: Item, group: Item[]) => {
        group
            .filter((goal) => goal.id !== kept.id)
            .forEach((goal) => updateItem.mutate({ id: goal.id, changes: { status: 'dropped' } }));

        if (!kept.starred && group.some((goal) => goal.starred)) {
            updateItem.mutate({ id: kept.id, changes: { starred: true } });
        }
    };

    const keepAll = (group: Item[]) => {
        const next = [...keptApart, groupKey(group)];

        window.localStorage.setItem(KEPT_APART, JSON.stringify(next));
        setKeptApart(next);
    };

    if (groups.length === 0) {
        return null;
    }

    return (
        <section className="planner-card p-3 mb-3" aria-label="Goals that look the same">
            <h3 className="font-display h4">These look like the same goal</h3>
            <p className="text-soft small">Keep the wording you like best, or keep them all.</p>
            {groups.map((group) => (
                <div key={groupKey(group)} className="same-goal-group" role="group">
                    {group.map((goal) => (
                        <button
                            key={goal.id}
                            type="button"
                            className="button-plain is-small"
                            onClick={() => keepOne(goal, group)}
                        >
                            Keep “{goal.title}”
                        </button>
                    ))}
                    <button
                        type="button"
                        className="button-plain is-small"
                        onClick={() => keepAll(group)}
                    >
                        Keep them all
                    </button>
                </div>
            ))}
        </section>
    );
}

// Place it: a week's goals onto days ---------------------------------------------------

function PlaceOnDays({ period: week }: StepProps) {
    const { household, user } = useSession();
    const { editItem } = useItemEditor();
    const today = useToday();
    const categories = useCategories();
    const goals = useItems({ periodKey: week.key, person: null });
    const tasks = useItemsBetween(week.start, week.end, null);
    const dates = useImportantDates(week.start, week.end);
    // Both people's events: the plan has to fit around all of them.
    const events = useEvents(week.start, week.end);
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
            {goals.isSuccess && open.length === 0 ? (
                <p className="text-soft">No open goals to place.</p>
            ) : (
                <ul className="review-list mb-3" aria-label="Goals to place">
                    {open.map((goal) => (
                        <PlaceRow
                            key={goal.id}
                            goal={goal}
                            color={
                                categories.find((category) => category.id === goal.category_id)
                                    ?.color
                            }
                            options={days}
                            placedIn={(tasks.data ?? [])
                                .filter((task) => task.parent_item_id === goal.id)
                                .map((task) => task.due_date!)}
                            onPlace={(date) => schedule(goal, date)}
                        />
                    ))}
                </ul>
            )}
            <WeekStrip
                week={week}
                items={tasks.data ?? []}
                dates={dates.data ?? []}
                events={eventsFor(events.data ?? [], null)}
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

// Place it: a larger period's goals into the periods inside it -----------------------------

function PlaceInPeriods({ period }: StepProps) {
    const categories = useCategories();
    const goals = useItems({ periodKey: period.key, person: null });
    const children = childPeriods(period);
    const placed = useItemsIn(children).filter((item) => item.status !== 'dropped');
    const createItem = useCreateItem();
    const open = (goals.data ?? []).filter((goal) => goal.status === 'open');
    const child = noun(childScope(period));
    const colorOf = (goal: Item) =>
        categories.find((category) => category.id === goal.category_id)?.color;

    const placedIn = (goal: Item) =>
        placed.filter((item) => item.parent_item_id === goal.id).map((item) => item.period_key);

    /**
     * Copy a goal into a smaller period, remembering which goal it serves. It
     * belongs there once: a goal is worked on across periods, not twice in one.
     */
    const place = (goal: Item, key: string) => {
        if (!placedIn(goal).includes(key)) {
            createItem.mutate({
                title: goal.title,
                category_id: goal.category_id,
                scope: childScope(period),
                period_key: key,
                parent_item_id: goal.id,
                assignee_user_id: goal.assignee_user_id,
            });
        }
    };

    return (
        <>
            <StepIntro title={`Give it a ${child}`}>
                {`Decide which ${child} each goal gets worked on. Drag a goal onto a ${child}, or pick one from its menu. It will be there to plan when the ${child} comes.`}
            </StepIntro>
            {goals.isSuccess && open.length === 0 ? (
                <p className="text-soft">No open goals to place.</p>
            ) : (
                <ul className="review-list mb-3" aria-label="Goals to place">
                    {open.map((goal) => (
                        <PlaceRow
                            key={goal.id}
                            goal={goal}
                            color={colorOf(goal)}
                            options={children}
                            placedIn={placedIn(goal)}
                            onPlace={(key) => place(goal, key)}
                        />
                    ))}
                </ul>
            )}
            <div className="row g-3">
                {children.map((target) => (
                    <div
                        key={target.key}
                        className={
                            children.length === 3 ? 'col-12 col-md-4' : 'col-12 col-sm-6 col-xl-3'
                        }
                    >
                        <PeriodDropCard
                            period={target}
                            items={placed.filter((item) => item.period_key === target.key)}
                            colorOf={colorOf}
                            onDropGoal={(id) => {
                                const goal = open.find((candidate) => candidate.id === id);

                                if (goal) {
                                    place(goal, target.key);
                                }
                            }}
                        />
                    </div>
                ))}
            </div>
        </>
    );
}

function PeriodDropCard({
    period,
    items,
    colorOf,
    onDropGoal,
}: {
    period: Period;
    items: Item[];
    colorOf: (item: Item) => string | undefined;
    onDropGoal: (id: number) => void;
}) {
    const [isTarget, setIsTarget] = useState(false);
    const { title, subtitle } = periodLabel(period);

    return (
        <section
            className={`planner-card place-period h-100${isTarget ? ' is-drop-target' : ''}`}
            aria-label={title}
            onDragOver={(event) => {
                if (event.dataTransfer.types.includes(ITEM_DRAG_TYPE)) {
                    event.preventDefault();
                    setIsTarget(true);
                }
            }}
            onDragLeave={() => setIsTarget(false)}
            onDrop={(event) => {
                event.preventDefault();
                setIsTarget(false);
                onDropGoal(Number(event.dataTransfer.getData(ITEM_DRAG_TYPE)));
            }}
        >
            <h3 className="font-display h4 mb-0">
                <Link to={periodPath(period)}>{title}</Link>
            </h3>
            {subtitle && <p className="text-soft small mb-2">{subtitle}</p>}
            {items.length === 0 ? (
                <p className="text-soft small mb-0">Nothing here yet.</p>
            ) : (
                <ul className="place-period-list">
                    {items.map((item) => (
                        <li
                            key={item.id}
                            className="cat"
                            style={{ '--cat': colorOf(item) } as CSSProperties}
                        >
                            <span className="month-day-dot is-done" aria-hidden="true" />
                            {item.title}
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

type PlaceRowProps = {
    goal: Item;
    color?: string;
    /** The periods it can be placed in. */
    options: Period[];
    /** The keys of the periods this goal is already in. */
    placedIn: string[];
    onPlace: (key: string) => void;
};

/** "Tue" for a day; "Week 45", "November" or "Q1" for anything larger. */
const placeBadge = (period: Period) =>
    period.scope === 'day'
        ? periodLabel(period).title.slice(0, 3)
        : periodLabel(period, true).title;

function PlaceRow({ goal, color, options, placedIn, onPlace }: PlaceRowProps) {
    const scope = options[0].scope;

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
                {placedIn.length > 0 && (
                    <span className="task-badge">
                        {[...placedIn]
                            .sort()
                            .map((key) => placeBadge(parsePeriod(key)!))
                            .join(', ')}
                    </span>
                )}
            </span>
            <select
                className="field-input place-select"
                aria-label={`${SCOPE_NAMES[scope]} for ${goal.title}`}
                value=""
                onChange={(event) => event.target.value && onPlace(event.target.value)}
            >
                <option value="">Add to a {noun(scope)}…</option>
                {options.map((option) => (
                    <option key={option.key} value={option.key}>
                        {periodName(option)}
                    </option>
                ))}
            </select>
        </li>
    );
}

// Meals (a week) -------------------------------------------------------------------------

function Meals({ period: week }: StepProps) {
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

// Important dates (a month) ----------------------------------------------------------------

function Dates({ period: month }: StepProps) {
    const today = useToday();
    const categories = useCategories();
    const days = calendarDays(month);
    const from = days[0].key;
    const to = days.at(-1)!.key;
    const tasks = useItemsBetween(from, to, null);
    const dates = useImportantDates(from, to);
    const events = useEvents(from, to);

    return (
        <>
            <StepIntro title="Check the calendar">
                {`See what’s already on for ${periodShortName(month)}, and mark the dates that matter.`}
            </StepIntro>
            <div className="row g-3">
                <div className="col-12 col-xl-8">
                    <div className="planner-card p-2 p-md-3">
                        <MonthCalendar
                            month={month}
                            items={tasks.data ?? []}
                            dates={dates.data ?? []}
                            events={eventsFor(events.data ?? [], null)}
                            categories={categories}
                            today={today}
                        />
                    </div>
                </div>
                <div className="col-12 col-xl-4">
                    <ImportantDates
                        month={month}
                        // The grid also shows days from the months either side.
                        dates={(dates.data ?? []).filter(
                            (date) => date.occurs_on >= month.start && date.occurs_on <= month.end,
                        )}
                    />
                </div>
            </div>
        </>
    );
}

// Done --------------------------------------------------------------------------------

function Done({ period }: StepProps) {
    const goals = useItems({ periodKey: period.key, person: null });
    const active = (goals.data ?? []).filter((goal) => goal.status !== 'dropped');
    const big = active.filter((goal) => goal.starred);

    return (
        <>
            <StepIntro title="You’re set">
                {`Here’s the ${noun(period.scope)} you’ve planned.`}
            </StepIntro>
            <dl className="plan-summary">
                <div>
                    <dt>Goals</dt>
                    <dd>{active.length}</dd>
                </div>
                {period.scope === 'week' ? (
                    <TasksPlanned week={period} />
                ) : (
                    <GoalsPlaced period={period} goals={active} />
                )}
            </dl>
            {big.length > 0 && (
                <>
                    <Link
                        className="button-plain d-inline-flex align-items-center gap-2 mb-3"
                        to={`/rewards?new=big3&period=${period.key}`}
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

function TasksPlanned({ week }: { week: Period }) {
    const tasks = useItemsBetween(week.start, week.end, null);
    const planned = (tasks.data ?? []).filter(
        (task) => task.status !== 'dropped' && task.routine === null,
    );

    return (
        <div>
            <dt>Tasks on the calendar</dt>
            <dd>{planned.length}</dd>
        </div>
    );
}

function GoalsPlaced({ period, goals }: { period: Period; goals: Item[] }) {
    const placed = useItemsIn(childPeriods(period)).filter((item) => item.status !== 'dropped');

    return (
        <div>
            <dt>Given a {noun(childScope(period))}</dt>
            <dd>
                {goals.filter((goal) => placed.some((i) => i.parent_item_id === goal.id)).length}
            </dd>
        </div>
    );
}
