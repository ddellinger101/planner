import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { WeightEntry, WeightGoal } from '@/api/weight';
import { parsePeriod } from '@/lib/period';

const HEIGHT = 280;
const MARGIN = { top: 18, right: 58, bottom: 30, left: 40 };
/** Above this many points, only the last one gets a marker. */
const MAX_MARKERS = 45;
const DAY = 86_400_000;

const GOAL_NAMES: Record<WeightGoal['scope'], string> = {
    week: 'Week',
    month: 'Month',
    quarter: 'Quarter',
    year: 'Year',
};

const time = (ymd: string) => Date.parse(`${ymd}T00:00:00Z`);

const formatDate = (ymd: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options }).format(new Date(time(ymd)));

const formatWeight = (value: number) =>
    Number.isInteger(value) ? String(value) : value.toFixed(1);

/** Round tick values that cover the data with a little room either side. */
function yTicks(low: number, high: number): number[] {
    const span = Math.max(high - low, 1);
    const step = [0.5, 1, 2, 5, 10, 20, 50].find((candidate) => span / candidate <= 5) ?? 100;
    const first = Math.floor((low - step * 0.25) / step) * step;
    const last = Math.ceil((high + step * 0.25) / step) * step;
    const ticks: number[] = [];

    for (let tick = first; tick <= last + step / 2; tick += step) {
        ticks.push(Number(tick.toFixed(1)));
    }

    return ticks;
}

/** A handful of evenly spread dates along the bottom. */
function xTicks(from: number, to: number, width: number): string[] {
    const count = Math.max(2, Math.min(6, Math.floor(width / 110)));
    const span = to - from;

    return Array.from({ length: count }, (_, index) =>
        new Date(from + Math.round((span * index) / (count - 1) / DAY) * DAY)
            .toISOString()
            .slice(0, 10),
    );
}

/** Track an element's width, so the chart is drawn at its real size. */
function useWidth(): [React.RefObject<HTMLDivElement | null>, number] {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(640);

    useEffect(() => {
        const element = ref.current;

        if (!element || typeof ResizeObserver === 'undefined') {
            return;
        }

        const observer = new ResizeObserver(([entry]) =>
            setWidth(Math.max(280, entry.contentRect.width)),
        );
        observer.observe(element);

        return () => observer.disconnect();
    }, []);

    return [ref, width];
}

type Props = {
    /** Entries in the range, oldest first. */
    entries: WeightEntry[];
    goals: WeightGoal[];
    /** The range drawn, as YYYY-MM-DD. */
    from: string;
    to: string;
};

/**
 * Weight over time: one line, with each goal drawn as a level across the
 * period it applies to. Hovering (or arrowing with the keyboard) reads out
 * the nearest entry; every value is also in the history list.
 */
export default function WeightChart({ entries, goals, from, to }: Props) {
    const [containerRef, width] = useWidth();
    const [active, setActive] = useState<number | null>(null);

    const start = time(from);
    const end = Math.max(time(to), start + DAY);
    const plotWidth = width - MARGIN.left - MARGIN.right;
    const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

    // Each goal covers the part of its period that is on screen.
    const levels = goals
        .map((goal) => ({ goal, period: parsePeriod(goal.period_key)! }))
        .filter(({ period }) => period && time(period.end) >= start && time(period.start) <= end)
        .map(({ goal, period }) => ({
            goal,
            x1: Math.max(time(period.start), start),
            x2: Math.min(time(period.end), end),
        }));

    const values = [
        ...entries.map((entry) => entry.weight),
        ...levels.map(({ goal }) => goal.target_weight),
    ];
    const ticks = values.length > 0 ? yTicks(Math.min(...values), Math.max(...values)) : [0, 1];
    const low = ticks[0];
    const high = ticks.at(-1)!;

    const x = (value: number) => MARGIN.left + ((value - start) / (end - start)) * plotWidth;
    const y = (value: number) => MARGIN.top + (1 - (value - low) / (high - low)) * plotHeight;

    const points = entries.map((entry) => ({ entry, x: x(time(entry.date)), y: y(entry.weight) }));
    const line = points
        .map((point, index) => `${index ? 'L' : 'M'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
        .join(' ');
    const last = points.at(-1);
    const selected = active !== null ? points[active] : undefined;

    const nearest = (clientX: number, bounds: DOMRect) => {
        const pointer = clientX - bounds.left;
        let best = 0;

        points.forEach((point, index) => {
            if (Math.abs(point.x - pointer) < Math.abs(points[best].x - pointer)) {
                best = index;
            }
        });

        return best;
    };

    const onPointerMove = (event: PointerEvent<SVGSVGElement>) => {
        if (points.length > 0) {
            setActive(nearest(event.clientX, event.currentTarget.getBoundingClientRect()));
        }
    };

    const onKeyDown = (event: KeyboardEvent) => {
        if (points.length === 0) {
            return;
        }

        const current = active ?? points.length - 1;
        const next = {
            ArrowLeft: Math.max(0, active === null ? current : current - 1),
            ArrowRight: Math.min(points.length - 1, current + 1),
            Home: 0,
            End: points.length - 1,
        }[event.key];

        if (next !== undefined) {
            event.preventDefault();
            setActive(next);
        } else if (event.key === 'Escape') {
            setActive(null);
        }
    };

    if (entries.length === 0) {
        return (
            <div ref={containerRef} className="weight-chart is-empty">
                <p className="text-soft mb-0">No weight logged in this range yet.</p>
            </div>
        );
    }

    const summary =
        entries.length === 1
            ? `Weight on ${formatDate(entries[0].date, { month: 'long', day: 'numeric' })}: ${formatWeight(entries[0].weight)} lb`
            : `Weight from ${formatDate(entries[0].date, { month: 'long', day: 'numeric' })} to ${formatDate(entries.at(-1)!.date, { month: 'long', day: 'numeric' })}: ${formatWeight(entries[0].weight)} to ${formatWeight(entries.at(-1)!.weight)} lb`;

    return (
        <div ref={containerRef} className="weight-chart">
            <svg
                width={width}
                height={HEIGHT}
                role="img"
                aria-label={`${summary}. Use the arrow keys to step through entries.`}
                tabIndex={0}
                onPointerMove={onPointerMove}
                onPointerLeave={() => setActive(null)}
                onKeyDown={onKeyDown}
                onBlur={() => setActive(null)}
            >
                {ticks.map((tick) => (
                    <g key={tick}>
                        <line
                            className="chart-grid"
                            x1={MARGIN.left}
                            x2={width - MARGIN.right}
                            y1={y(tick)}
                            y2={y(tick)}
                        />
                        <text
                            className="chart-tick"
                            x={MARGIN.left - 8}
                            y={y(tick)}
                            textAnchor="end"
                            dominantBaseline="central"
                        >
                            {formatWeight(tick)}
                        </text>
                    </g>
                ))}

                {xTicks(start, end, plotWidth).map((date, index, all) => (
                    <text
                        key={date}
                        className="chart-tick"
                        x={x(time(date))}
                        y={HEIGHT - 8}
                        textAnchor={
                            index === 0 ? 'start' : index === all.length - 1 ? 'end' : 'middle'
                        }
                    >
                        {formatDate(
                            date,
                            end - start > 200 * DAY
                                ? { month: 'short', year: '2-digit' }
                                : { month: 'short', day: 'numeric' },
                        )}
                    </text>
                ))}

                {levels.map(({ goal, x1, x2 }) => (
                    <line
                        key={goal.period_key}
                        className="chart-goal"
                        x1={x(x1)}
                        x2={x(x2)}
                        y1={y(goal.target_weight)}
                        y2={y(goal.target_weight)}
                    />
                ))}

                {points.length > 1 && (
                    <>
                        <path
                            className="chart-area"
                            d={`${line} L${last!.x.toFixed(1)} ${y(low)} L${points[0].x.toFixed(1)} ${y(low)} Z`}
                        />
                        <path className="chart-line" d={line} />
                    </>
                )}

                {(points.length <= MAX_MARKERS ? points : [last!]).map((point) => (
                    <circle
                        key={point.entry.id}
                        className="chart-dot"
                        cx={point.x}
                        cy={point.y}
                        r={4}
                    />
                ))}

                {/* Goal labels go on top of the line and markers, and only where a
                    level is long enough to hold the words. */}
                {levels.map(
                    ({ goal, x1, x2 }) =>
                        x(x2) - x(x1) > 96 && (
                            <text
                                key={goal.period_key}
                                className="chart-goal-label"
                                x={x(x2)}
                                y={y(goal.target_weight) - 6}
                                textAnchor="end"
                            >
                                {GOAL_NAMES[goal.scope]} goal {formatWeight(goal.target_weight)}
                            </text>
                        ),
                )}

                {last && (
                    <text
                        className="chart-end-label"
                        x={last.x + 9}
                        y={last.y}
                        dominantBaseline="central"
                    >
                        {formatWeight(last.entry.weight)}
                    </text>
                )}

                {selected && (
                    <>
                        <line
                            className="chart-crosshair"
                            x1={selected.x}
                            x2={selected.x}
                            y1={MARGIN.top}
                            y2={HEIGHT - MARGIN.bottom}
                        />
                        <circle
                            className="chart-dot is-active"
                            cx={selected.x}
                            cy={selected.y}
                            r={6}
                        />
                    </>
                )}
            </svg>

            {selected && (
                <div
                    className="chart-tooltip"
                    role="status"
                    style={{
                        // Flip to the left of the point near the right edge.
                        left: selected.x > width - 150 ? undefined : selected.x + 12,
                        right: selected.x > width - 150 ? width - selected.x + 12 : undefined,
                        top: Math.max(4, selected.y - 44),
                    }}
                >
                    <strong>{formatWeight(selected.entry.weight)} lb</strong>
                    <span>
                        {formatDate(selected.entry.date, {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            year: 'numeric',
                        })}
                    </span>
                </div>
            )}
        </div>
    );
}
