import { Scale } from 'lucide-react';
import { Link } from 'react-router';
import { useWeightEntries, useWeightGoals } from '@/api/weight';
import { parsePeriod, periodFromDate, type Period, type Scope } from '@/lib/period';
import { periodLabel, periodName } from '@/lib/periodLabels';

const GOAL_SCOPES: Exclude<Scope, 'day'>[] = ['week', 'month', 'quarter', 'year'];

const pounds = (value: number) =>
    `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })} lb`;

/** How far a weight is from a goal, said without assuming which way is the right way. */
function distance(current: number, target: number): string {
    const difference = Math.round((current - target) * 10) / 10;

    if (difference === 0) {
        return 'At goal';
    }

    return `${pounds(Math.abs(difference))} ${difference > 0 ? 'above' : 'below'}`;
}

/**
 * Your latest weight beside the goals it is working toward: this week's, and
 * those of the month, quarter and year the week falls in. Your own, like
 * everything about weight.
 */
export default function WeekWeight({ week, today }: { week: Period; today: string }) {
    // The week as it stood: nothing logged after it counts toward an earlier week.
    const entries = useWeightEntries(null, week.end < today ? week.end : today);
    const goals = useWeightGoals();
    const latest = entries.data?.at(-1);

    // A week can straddle two months; it belongs with the one its Thursday is in,
    // the same rule that decides which year a week is numbered in. The current
    // week uses today instead, so the month on screen is the one you are in.
    const anchor = today >= week.start && today <= week.end ? today : shiftDays(week.start, 3);

    const rows = GOAL_SCOPES.flatMap((scope) => {
        const period = scope === 'week' ? week : periodFromDate(scope, anchor);
        const goal = goals.data?.find((candidate) => candidate.period_key === period.key);

        return goal ? [{ period, target: Number(goal.target_weight) }] : [];
    });

    return (
        <section className="planner-card week-weight" aria-labelledby="week-weight">
            <div className="week-weight-now">
                <h2 id="week-weight" className="field-label mb-0">
                    <Scale aria-hidden="true" size={14} /> Weight
                </h2>
                {latest ? (
                    <>
                        <span className="week-weight-value">{pounds(Number(latest.weight))}</span>
                        <span className="text-soft small">
                            {periodName(parsePeriod(latest.date)!)}
                        </span>
                    </>
                ) : (
                    <span className="text-soft small">
                        {entries.isPending ? 'Loading…' : 'Nothing logged yet.'}
                    </span>
                )}
                <Link className="small fw-bold" to="/weight">
                    {latest ? 'Chart and history' : 'Log your weight'}
                </Link>
            </div>

            {rows.length === 0 ? (
                <p className="text-soft small mb-0 week-weight-empty">
                    {goals.isPending
                        ? 'Loading…'
                        : 'No weight goals set. Add one in the Health box of a week, month, quarter or year.'}
                </p>
            ) : (
                <dl className="week-weight-goals">
                    {rows.map(({ period, target }) => (
                        <div key={period.key}>
                            <dt>{periodLabel(period).title}</dt>
                            <dd>
                                <span className="week-weight-target">{pounds(target)}</span>
                                {latest && (
                                    <span className="text-soft small">
                                        {distance(Number(latest.weight), target)}
                                    </span>
                                )}
                            </dd>
                        </div>
                    ))}
                </dl>
            )}
        </section>
    );
}

/** A date some days after another, both as YYYY-MM-DD. */
function shiftDays(date: string, days: number): string {
    const [year, month, day] = date.split('-').map(Number);
    const shifted = new Date(Date.UTC(year, month - 1, day + days));

    return shifted.toISOString().slice(0, 10);
}
