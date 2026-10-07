import { Scale, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import {
    useDeleteWeight,
    useLogWeight,
    useWeightEntries,
    useWeightGoals,
    type WeightEntry,
    type WeightGoal,
} from '@/api/weight';
import PageHeader from '@/components/PageHeader';
import WeightChart from '@/components/weight/WeightChart';
import { parsePeriod, periodContains, type Period } from '@/lib/period';
import { periodName } from '@/lib/periodLabels';
import { useToday } from '@/lib/useCurrentPeriod';

const RANGES = [
    { key: '1M', days: 30, label: 'Last month' },
    { key: '3M', days: 91, label: 'Last 3 months' },
    { key: '6M', days: 182, label: 'Last 6 months' },
    { key: '1Y', days: 365, label: 'Last year' },
    { key: 'All', days: null, label: 'All time' },
] as const;

type RangeKey = (typeof RANGES)[number]['key'];

const daysBefore = (ymd: string, days: number) =>
    new Date(Date.parse(`${ymd}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

const format = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

const signed = (value: number) =>
    `${value > 0 ? '+' : value < 0 ? '−' : ''}${format(Math.abs(value))}`;

/** Weight is personal: this page only ever shows the signed-in person's own. */
export default function WeightPage() {
    const today = useToday();
    const [range, setRange] = useState<RangeKey>('3M');
    const days = RANGES.find((entry) => entry.key === range)!.days;
    const from = days === null ? null : daysBefore(today, days);
    const entries = useWeightEntries(from, today);
    const goals = useWeightGoals();
    const list = entries.data ?? [];
    const first = list[0];
    const latest = list.at(-1);

    // The goal that applies now, the nearest-term one first.
    const currentGoal = ['week', 'month', 'quarter', 'year']
        .map((scope) =>
            (goals.data ?? []).find(
                (goal) =>
                    goal.scope === scope && periodContains(parsePeriod(goal.period_key)!, today),
            ),
        )
        .find(Boolean);

    return (
        <>
            <PageHeader showPersonFilter={false}>Weight</PageHeader>
            <main className="container-fluid page-body">
                <div className="row g-3">
                    <div className="col-12 col-xl-4 order-xl-2">
                        <LogForm today={today} />
                    </div>

                    <div className="col-12 col-xl-8 order-xl-1">
                        <div className="segmented mb-3" role="group" aria-label="Time range">
                            {RANGES.map((entry) => (
                                <button
                                    key={entry.key}
                                    type="button"
                                    aria-pressed={range === entry.key}
                                    aria-label={entry.label}
                                    onClick={() => setRange(entry.key)}
                                >
                                    {entry.key}
                                </button>
                            ))}
                        </div>

                        <div className="stat-tiles">
                            <Stat
                                label="Latest"
                                value={latest ? `${format(latest.weight)} lb` : '—'}
                            />
                            <Stat
                                label="Change in this range"
                                value={
                                    latest && first && latest !== first
                                        ? `${signed(latest.weight - first.weight)} lb`
                                        : '—'
                                }
                            />
                            <Stat
                                label={currentGoal ? `To ${currentGoal.scope} goal` : 'To goal'}
                                value={
                                    currentGoal && latest
                                        ? `${signed(currentGoal.target_weight - latest.weight)} lb`
                                        : '—'
                                }
                                note={
                                    currentGoal
                                        ? `Goal ${format(currentGoal.target_weight)} lb`
                                        : 'No goal set'
                                }
                            />
                        </div>

                        <section className="planner-card p-3 mt-3" aria-label="Weight over time">
                            <WeightChart
                                entries={list}
                                goals={goals.data ?? []}
                                from={from ?? first?.date ?? today}
                                to={today}
                            />
                        </section>
                    </div>

                    <div className="col-12 order-xl-3">
                        <History entries={list} />
                    </div>
                </div>
            </main>
        </>
    );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
    return (
        <div className="planner-card stat-tile">
            <span className="stat-label">{label}</span>
            <span className="stat-value">{value}</span>
            {note && <span className="stat-note">{note}</span>}
        </div>
    );
}

function LogForm({ today }: { today: string }) {
    const log = useLogWeight();
    const [date, setDate] = useState(today);
    const [weight, setWeight] = useState('');
    const value = Number(weight);
    const valid = weight.trim() !== '' && value > 0 && value < 1000 && date !== '';

    const submit = (event: FormEvent) => {
        event.preventDefault();

        if (valid) {
            log.mutate({ date, weight: value }, { onSuccess: () => setWeight('') });
        }
    };

    return (
        <form className="planner-card p-3" onSubmit={submit} aria-labelledby="weight-log">
            <h2 id="weight-log" className="font-display h4 routine-heading">
                <Scale aria-hidden="true" size={20} />
                Log your weight
            </h2>
            <div className="row g-2">
                <div className="col-6 col-xl-12">
                    <label className="field-label" htmlFor="weight-log-date">
                        Day
                    </label>
                    <input
                        id="weight-log-date"
                        className="field-input"
                        type="date"
                        value={date}
                        max={today}
                        onChange={(event) => setDate(event.target.value)}
                    />
                </div>
                <div className="col-6 col-xl-12">
                    <label className="field-label" htmlFor="weight-log-value">
                        Weight (lb)
                    </label>
                    <input
                        id="weight-log-value"
                        className="field-input"
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min="1"
                        max="999"
                        value={weight}
                        onChange={(event) => setWeight(event.target.value)}
                    />
                </div>
            </div>
            <button type="submit" className="button-ink mt-3" disabled={!valid || log.isPending}>
                Log weight
            </button>
            {log.isError && (
                <p className="small mt-2 mb-0" role="alert" style={{ color: 'var(--danger)' }}>
                    That didn’t save. Please try again.
                </p>
            )}
            <p className="text-soft small mt-2 mb-0">
                Logging a day again replaces that day’s entry. Only you can see your weight.
            </p>
        </form>
    );
}

/** Every entry in the range as a table: the chart's values, in words. */
function History({ entries }: { entries: WeightEntry[] }) {
    const remove = useDeleteWeight();
    const newestFirst = [...entries].reverse();

    return (
        <section className="planner-card p-3" aria-labelledby="weight-history">
            <h2 id="weight-history" className="font-display h4">
                History
            </h2>
            {entries.length === 0 ? (
                <p className="text-soft small mb-0">Nothing logged in this range.</p>
            ) : (
                <div className="routine-grid-scroll">
                    <table className="history-table">
                        <thead>
                            <tr>
                                <th scope="col">Day</th>
                                <th scope="col" className="is-number">
                                    Weight
                                </th>
                                <th scope="col" className="is-number">
                                    Change
                                </th>
                                <td />
                            </tr>
                        </thead>
                        <tbody>
                            {newestFirst.map((entry, index) => {
                                const previous = newestFirst[index + 1];
                                const day = periodName(parsePeriod(entry.date) as Period);

                                return (
                                    <tr key={entry.id}>
                                        <th scope="row">
                                            {day}, {entry.date.slice(0, 4)}
                                        </th>
                                        <td className="is-number">{format(entry.weight)} lb</td>
                                        <td className="is-number text-soft">
                                            {previous
                                                ? signed(entry.weight - previous.weight)
                                                : '—'}
                                        </td>
                                        <td>
                                            <button
                                                type="button"
                                                className="icon-button is-small task-delete-always"
                                                aria-label={`Delete the entry for ${day}`}
                                                onClick={() => remove.mutate(entry.id)}
                                            >
                                                <Trash2 aria-hidden="true" size={15} />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </section>
    );
}

/** The year's weight line, for the Year view. */
export function YearWeight({ year }: { year: Period }) {
    const today = useToday();
    // A year still under way is drawn up to today, not to an empty December.
    const to = year.end < today ? year.end : year.start > today ? year.end : today;
    const entries = useWeightEntries(year.start, year.end);
    const goals = useWeightGoals();

    return (
        <section className="planner-card p-3" aria-label={`Weight in ${year.key}`}>
            <WeightChart
                entries={entries.data ?? []}
                goals={(goals.data ?? []) as WeightGoal[]}
                from={year.start}
                to={to}
            />
        </section>
    );
}
