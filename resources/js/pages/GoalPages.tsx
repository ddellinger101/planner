import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, History } from 'lucide-react';
import { Link } from 'react-router';
import { useCheckHabit, useHabitsBetween, useMeals } from '@/api/day';
import { useCreateItem, useItems, useUpdateItem, type Item, type ItemChanges } from '@/api/items';
import { useGoalSummary, useImportantDates, useItemsBetween } from '@/api/planning';
import { usePendingReviews } from '@/api/review';
import { fetchCategories } from '@/api/session';
import GoalBoxes from '@/components/period/GoalBoxes';
import ImportantDates from '@/components/period/ImportantDates';
import MonthCalendar, { calendarDays } from '@/components/period/MonthCalendar';
import { BestPart, CategoryProgress, CompletionBar } from '@/components/period/Summaries';
import { RoutineGrid, WeekMeals } from '@/components/period/WeekExtras';
import WeekStrip from '@/components/period/WeekStrip';
import { MonthHabits } from '@/pages/RoutinesPage';
import { YearWeight } from '@/pages/WeightPage';
import { useItemEditor } from '@/context/ItemEditorContext';
import { useReview } from '@/context/PlannerContexts';
import { usePersonFilter } from '@/context/PersonFilterContext';
import { useSession } from '@/context/SessionContext';
import { childPeriods, parsePeriod, type Period } from '@/lib/period';
import { periodLabel, periodShortName } from '@/lib/periodLabels';
import { useToday } from '@/lib/useCurrentPeriod';

const useCategories = () =>
    useQuery({ queryKey: ['categories'], queryFn: fetchCategories }).data ?? [];

/** Shown on a period view while the period before it still needs its review. */
function ReviewBanner({ period }: { period: Period }) {
    const pending = usePendingReviews();
    const { openReview } = useReview();
    const due = (pending.data ?? []).find(
        (entry) => entry.scope === period.scope && entry.next_period_key === period.key,
    );

    if (!due) {
        return null;
    }

    const name = periodShortName(parsePeriod(due.period_key)!);

    return (
        <div className="planner-card review-banner" role="status">
            <p>
                <History aria-hidden="true" size={18} />
                {due.open_count === 1 ? '1 item is' : `${due.open_count} items are`} still open from{' '}
                {name}.
            </p>
            <button
                type="button"
                className="button-ink is-small"
                onClick={() => openReview(due.period_key)}
            >
                Review {name}
            </button>
        </div>
    );
}

function SectionHeading({ children }: { children: string }) {
    return <h2 className="font-display section-heading">{children}</h2>;
}

export function WeekPage({ period }: { period: Period }) {
    const { household } = useSession();
    const { person } = usePersonFilter();
    const { editItem } = useItemEditor();
    const today = useToday();
    const categories = useCategories();
    const tasks = useItemsBetween(period.start, period.end, person);
    const dates = useImportantDates(period.start, period.end);
    const meals = useMeals(period.start, period.end);
    const habits = useHabitsBetween(period.start, period.end, person);
    const createItem = useCreateItem();
    const updateItem = useUpdateItem();
    const checkHabit = useCheckHabit();

    const change = (item: Item, changes: ItemChanges) =>
        updateItem.mutate({ id: item.id, changes });
    // A task added from a day column has no category yet; "Other" until it's edited.
    const other = categories.find((category) => category.slug === 'other') ?? categories.at(-1);

    return (
        <>
            <ReviewBanner period={period} />
            <div className="row g-3 align-items-center">
                <div className="col-12 col-lg-6">
                    <BestPart key={period.key} period={period} />
                </div>
                <div className="col-12 col-lg-6">
                    <Link
                        className="button-ink d-inline-flex align-items-center gap-2"
                        to={`/plan/${period.key}`}
                    >
                        <CalendarCheck aria-hidden="true" size={18} /> Plan this week
                    </Link>
                </div>
            </div>

            <SectionHeading>Weekly goals</SectionHeading>
            <GoalBoxes period={period} />

            <SectionHeading>Day by day</SectionHeading>
            <WeekStrip
                week={period}
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
                onChange={change}
                onEdit={editItem}
            />

            <div className="row g-3 mt-1">
                <div className="col-12 col-lg-5">
                    <WeekMeals week={period} meals={meals.data ?? []} />
                </div>
                <div className="col-12 col-lg-7">
                    <RoutineGrid
                        week={period}
                        items={tasks.data ?? []}
                        habits={habits.data ?? []}
                        categories={categories}
                        onChange={change}
                        onCheckHabit={(habit, date, done) =>
                            checkHabit.mutate({ id: habit.id, date, done })
                        }
                    />
                </div>
            </div>
        </>
    );
}

export function MonthPage({ period }: { period: Period }) {
    const { person } = usePersonFilter();
    const today = useToday();
    const categories = useCategories();
    const goals = useItems({ periodKey: period.key, person });
    const days = calendarDays(period);
    const from = days[0].key;
    const to = days.at(-1)!.key;
    const tasks = useItemsBetween(from, to, person);
    const gridDates = useImportantDates(from, to);

    return (
        <>
            <ReviewBanner period={period} />
            <div className="row g-3">
                <div className="col-12 col-lg-6">
                    <BestPart key={period.key} period={period} />
                </div>
                <div className="col-12 col-lg-6">
                    <CategoryProgress
                        title="Goal progress"
                        categories={categories}
                        items={goals.data ?? []}
                    />
                </div>
            </div>

            <SectionHeading>Monthly goals</SectionHeading>
            <GoalBoxes period={period} />

            <SectionHeading>Calendar</SectionHeading>
            <div className="row g-3">
                <div className="col-12 col-xl-8">
                    <div className="planner-card p-2 p-md-3">
                        <MonthCalendar
                            month={period}
                            items={tasks.data ?? []}
                            dates={gridDates.data ?? []}
                            categories={categories}
                            today={today}
                        />
                    </div>
                </div>
                <div className="col-12 col-xl-4">
                    <ImportantDates
                        key={period.key}
                        month={period}
                        // The grid also shows days from the months either side.
                        dates={(gridDates.data ?? []).filter(
                            (date) =>
                                date.occurs_on >= period.start && date.occurs_on <= period.end,
                        )}
                    />
                </div>
            </div>

            <SectionHeading>Habits</SectionHeading>
            <MonthHabits month={period} />
        </>
    );
}

export function QuarterPage({ period }: { period: Period }) {
    const { person } = usePersonFilter();
    const today = useToday();
    const categories = useCategories();
    const months = childPeriods(period);
    const tasks = useItemsBetween(period.start, period.end, person);
    const dates = useImportantDates(period.start, period.end);
    const summary = useGoalSummary(
        months.map((month) => month.key),
        person,
    );

    return (
        <>
            <ReviewBanner period={period} />
            <SectionHeading>Quarter goals</SectionHeading>
            <GoalBoxes period={period} />

            <SectionHeading>The three months</SectionHeading>
            <div className="row g-3">
                {months.map((month) => {
                    const { title } = periodLabel(month);

                    return (
                        <div key={month.key} className="col-12 col-md-4">
                            <section className="planner-card p-3 h-100" aria-label={title}>
                                <h3 className="font-display h4 mb-2">
                                    <Link to={`/month/${month.key}`}>{title}</Link>
                                </h3>
                                <CompletionBar
                                    label="Monthly goals"
                                    {...(summary.data?.[month.key] ?? { total: 0, done: 0 })}
                                />
                                <MonthCalendar
                                    month={month}
                                    items={tasks.data ?? []}
                                    dates={dates.data ?? []}
                                    categories={categories}
                                    today={today}
                                    compact
                                />
                            </section>
                        </div>
                    );
                })}
            </div>
        </>
    );
}

export function YearPage({ period }: { period: Period }) {
    const { person } = usePersonFilter();
    const quarters = childPeriods(period);
    const summary = useGoalSummary(
        quarters.map((quarter) => quarter.key),
        person,
    );

    return (
        <>
            <ReviewBanner period={period} />
            <SectionHeading>One-year goals</SectionHeading>
            <GoalBoxes period={period} />

            <SectionHeading>The four quarters</SectionHeading>
            <div className="row g-3">
                {quarters.map((quarter) => {
                    const { title, subtitle } = periodLabel(quarter);

                    return (
                        <div key={quarter.key} className="col-12 col-sm-6 col-xl-3">
                            <section className="planner-card p-3 h-100" aria-label={title}>
                                <h3 className="font-display h4 mb-0">
                                    <Link to={`/quarter/${quarter.key}`}>{title}</Link>
                                </h3>
                                <p className="text-soft small">{subtitle.replace(/ \d{4}$/, '')}</p>
                                <CompletionBar
                                    label="Quarter goals"
                                    {...(summary.data?.[quarter.key] ?? { total: 0, done: 0 })}
                                />
                                <ul className="quarter-months">
                                    {childPeriods(quarter).map((month) => (
                                        <li key={month.key}>
                                            <Link to={`/month/${month.key}`}>
                                                {periodLabel(month).title}
                                            </Link>
                                        </li>
                                    ))}
                                </ul>
                            </section>
                        </div>
                    );
                })}
            </div>

            <SectionHeading>Weight this year</SectionHeading>
            <YearWeight year={period} />
        </>
    );
}
