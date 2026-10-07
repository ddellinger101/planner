import { useQuery } from '@tanstack/react-query';
import {
    ArrowDown,
    ArrowUp,
    ChevronLeft,
    ChevronRight,
    Flame,
    Moon,
    Pencil,
    Plus,
    Repeat,
    Sparkles,
    Sunrise,
    type LucideIcon,
} from 'lucide-react';
import { useState, type CSSProperties } from 'react';
import { useCheckHabit, useHabitsBetween, type Habit } from '@/api/day';
import {
    useAllHabits,
    useHabitStats,
    useReorderHabits,
    useRoutineSeries,
    type HabitStats,
} from '@/api/habits';
import type { Routine } from '@/api/items';
import { fetchCategories, type Category } from '@/api/session';
import HabitSheet, { type HabitTarget } from '@/components/habits/HabitSheet';
import RadialTracker from '@/components/habits/RadialTracker';
import PageHeader from '@/components/PageHeader';
import { RoutineGrid } from '@/components/period/WeekExtras';
import { useItemEditor } from '@/context/ItemEditorContext';
import { usePersonFilter } from '@/context/PersonFilterContext';
import { useSession } from '@/context/SessionContext';
import { nextPeriod, periodFromDate, previousPeriod, type Period } from '@/lib/period';
import { periodName } from '@/lib/periodLabels';
import { describeRule } from '@/lib/rrule';
import { useToday } from '@/lib/useCurrentPeriod';

const SECTIONS: { routine: Habit['routine']; title: string; icon: LucideIcon }[] = [
    { routine: 'morning', title: 'Morning routine', icon: Sunrise },
    { routine: 'evening', title: 'Evening routine', icon: Moon },
    { routine: 'anytime', title: 'Anytime', icon: Sparkles },
];

/** Routines and habits: what's in each routine, and how the habits are going. */
export default function RoutinesPage() {
    const { person } = usePersonFilter();
    const today = useToday();
    const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories }).data ?? [];
    const [week, setWeek] = useState(() => periodFromDate('week', today));
    const [month, setMonth] = useState(() => periodFromDate('month', today));
    const [sheet, setSheet] = useState<HabitTarget | null>(null);

    const habits = useAllHabits(person);
    const weekHabits = useHabitsBetween(week.start, week.end, person);
    const monthHabits = useHabitsBetween(month.start, month.end, person);
    const stats = useHabitStats(person);
    const reorder = useReorderHabits();
    const checkHabit = useCheckHabit();
    const all = habits.data ?? [];

    /** Swap a habit with its neighbour in the same routine, keeping the rest in place. */
    const move = (habit: Habit, direction: -1 | 1) => {
        const peers = all.filter((candidate) => candidate.routine === habit.routine);
        const other = peers[peers.indexOf(habit) + direction];

        if (other) {
            const ids = all.map((candidate) => candidate.id);
            const from = ids.indexOf(habit.id);
            const to = ids.indexOf(other.id);

            [ids[from], ids[to]] = [ids[to], ids[from]];
            reorder.mutate(ids);
        }
    };

    return (
        <>
            <PageHeader>Routines &amp; Habits</PageHeader>
            <main className="container-fluid page-body">
                <div className="row g-3">
                    {SECTIONS.map((section) => (
                        <div key={section.routine} className="col-12 col-lg-4">
                            <RoutineEditor
                                {...section}
                                habits={all.filter((habit) => habit.routine === section.routine)}
                                stats={stats.data ?? {}}
                                categories={categories}
                                onAdd={() => setSheet({ kind: 'create', routine: section.routine })}
                                onEdit={(habit) => setSheet({ kind: 'edit', habit })}
                                onMove={move}
                            />
                        </div>
                    ))}
                </div>

                <div className="tracker-heading">
                    <h2 className="font-display section-heading">Week by week</h2>
                    <Stepper
                        label={periodName(week)}
                        unit="week"
                        onPrevious={() => setWeek(previousPeriod(week))}
                        onNext={() => setWeek(nextPeriod(week))}
                    />
                </div>
                <RoutineGrid
                    week={week}
                    items={[]}
                    habits={weekHabits.data ?? []}
                    categories={categories}
                    title="Habit check-off"
                    onChange={() => {}}
                    onCheckHabit={(habit, date, done) =>
                        checkHabit.mutate({ id: habit.id, date, done })
                    }
                />

                <div className="tracker-heading">
                    <h2 className="font-display section-heading">Month at a glance</h2>
                    <Stepper
                        label={periodName(month)}
                        unit="month"
                        onPrevious={() => setMonth(previousPeriod(month))}
                        onNext={() => setMonth(nextPeriod(month))}
                    />
                </div>
                <section className="planner-card p-3" aria-label={`Habits in ${periodName(month)}`}>
                    <RadialTracker
                        month={month}
                        habits={monthHabits.data ?? []}
                        categories={categories}
                        today={today}
                    />
                </section>
            </main>

            {sheet && (
                <HabitSheet
                    key={sheet.kind === 'edit' ? sheet.habit.id : `new-${sheet.routine}`}
                    target={sheet}
                    onClose={() => setSheet(null)}
                />
            )}
        </>
    );
}

type StepperProps = {
    label: string;
    unit: string;
    onPrevious: () => void;
    onNext: () => void;
};

function Stepper({ label, unit, onPrevious, onNext }: StepperProps) {
    return (
        <div className="tracker-stepper">
            <button
                type="button"
                className="icon-button"
                aria-label={`Previous ${unit}`}
                onClick={onPrevious}
            >
                <ChevronLeft aria-hidden="true" />
            </button>
            <span aria-live="polite">{label}</span>
            <button
                type="button"
                className="icon-button"
                aria-label={`Next ${unit}`}
                onClick={onNext}
            >
                <ChevronRight aria-hidden="true" />
            </button>
        </div>
    );
}

type EditorProps = {
    routine: Habit['routine'];
    title: string;
    icon: LucideIcon;
    habits: Habit[];
    stats: Record<number, HabitStats>;
    categories: Category[];
    onAdd: () => void;
    onEdit: (habit: Habit) => void;
    onMove: (habit: Habit, direction: -1 | 1) => void;
};

/** One routine: its habits in order, and the repeating tasks that belong to it. */
function RoutineEditor({
    routine,
    title,
    icon: Icon,
    habits,
    stats,
    categories,
    onAdd,
    onEdit,
    onMove,
}: EditorProps) {
    const { household } = useSession();
    const colorOf = (habit: Habit) =>
        habit.color ?? categories.find((category) => category.id === habit.category_id)?.color;
    const ownerOf = (habit: Habit) =>
        household.members.length > 1
            ? household.members.find((member) => member.id === habit.user_id)
            : undefined;

    return (
        <section
            className="planner-card routine-editor h-100"
            aria-labelledby={`editor-${routine}`}
        >
            <h2 id={`editor-${routine}`} className="font-display h4 routine-heading">
                <Icon aria-hidden="true" size={20} />
                {title}
            </h2>

            {habits.length === 0 ? (
                <p className="text-soft small">No habits here yet.</p>
            ) : (
                <ol className="habit-list">
                    {habits.map((habit, index) => {
                        const habitStats = stats[habit.id];
                        const owner = ownerOf(habit);

                        return (
                            <li
                                key={habit.id}
                                className="cat"
                                style={{ '--cat': colorOf(habit) } as CSSProperties}
                            >
                                <span className="radial-swatch" aria-hidden="true" />
                                <span className="habit-list-body">
                                    <span className="habit-list-title">
                                        {habit.title}
                                        {owner && (
                                            <span
                                                className="person-dot"
                                                style={{ '--person': owner.color } as CSSProperties}
                                                title={owner.name}
                                            >
                                                <span aria-hidden="true">
                                                    {owner.name.charAt(0)}
                                                </span>
                                                <span className="visually-hidden">
                                                    {owner.name}’s habit
                                                </span>
                                            </span>
                                        )}
                                    </span>
                                    <span className="habit-list-stats">
                                        {habit.target_per_week >= 7
                                            ? 'Every day'
                                            : habit.target_per_week === 1
                                              ? 'Once a week'
                                              : `${habit.target_per_week} times a week`}
                                        {habitStats && (
                                            <>
                                                <span className="habit-streak">
                                                    <Flame aria-hidden="true" size={13} />
                                                    {habitStats.current_streak}{' '}
                                                    {habitStats.current_streak === 1
                                                        ? habitStats.streak_unit.slice(0, -1)
                                                        : habitStats.streak_unit}
                                                    <span className="visually-hidden">
                                                        {' '}
                                                        in a row
                                                    </span>
                                                </span>
                                                <span>{habitStats.completion}% in 30 days</span>
                                            </>
                                        )}
                                    </span>
                                </span>
                                <button
                                    type="button"
                                    className="icon-button is-small"
                                    aria-label={`Move ${habit.title} up`}
                                    disabled={index === 0}
                                    onClick={() => onMove(habit, -1)}
                                >
                                    <ArrowUp aria-hidden="true" size={15} />
                                </button>
                                <button
                                    type="button"
                                    className="icon-button is-small"
                                    aria-label={`Move ${habit.title} down`}
                                    disabled={index === habits.length - 1}
                                    onClick={() => onMove(habit, 1)}
                                >
                                    <ArrowDown aria-hidden="true" size={15} />
                                </button>
                                <button
                                    type="button"
                                    className="icon-button is-small"
                                    aria-label={`Edit ${habit.title}`}
                                    onClick={() => onEdit(habit)}
                                >
                                    <Pencil aria-hidden="true" size={15} />
                                </button>
                            </li>
                        );
                    })}
                </ol>
            )}

            <button type="button" className="button-plain is-small" onClick={onAdd}>
                <Plus aria-hidden="true" size={14} /> Add a habit
            </button>

            {routine !== 'anytime' && <RepeatingTasks routine={routine} />}
        </section>
    );
}

/** The repeating tasks in a routine. They are edited like any other task. */
function RepeatingTasks({ routine }: { routine: Routine }) {
    const { person } = usePersonFilter();
    const { editItem } = useItemEditor();
    const series = useRoutineSeries(routine, person);

    if (!series.data?.length) {
        return null;
    }

    return (
        <>
            <h3 className="field-label mt-3 mb-1">Repeating tasks</h3>
            <ul className="habit-list">
                {series.data.map((item) => (
                    <li key={item.id}>
                        <Repeat aria-hidden="true" size={15} className="text-soft" />
                        <span className="habit-list-body">
                            <span className="habit-list-title">{item.title}</span>
                            <span className="habit-list-stats">
                                {describeRule(item.recurrence_rule!, item.due_date!)}
                            </span>
                        </span>
                        <button
                            type="button"
                            className="icon-button is-small"
                            aria-label={`Edit ${item.title}`}
                            onClick={() => editItem(item)}
                        >
                            <Pencil aria-hidden="true" size={15} />
                        </button>
                    </li>
                ))}
            </ul>
        </>
    );
}

/** The month's habit wheel, for the Month view. */
export function MonthHabits({ month }: { month: Period }) {
    const { person } = usePersonFilter();
    const today = useToday();
    const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories }).data ?? [];
    const habits = useHabitsBetween(month.start, month.end, person);

    return (
        <section className="planner-card p-3" aria-labelledby="month-habits">
            <h2 id="month-habits" className="font-display h4 routine-heading">
                <Flame aria-hidden="true" size={20} />
                Habits this month
            </h2>
            <RadialTracker
                month={month}
                habits={habits.data ?? []}
                categories={categories}
                today={today}
            />
        </section>
    );
}
