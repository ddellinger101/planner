/**
 * Planner periods: the TypeScript twin of app/Support/Period.php. Keep the
 * two in step; both are tested against the same cases.
 *
 * A period is identified by a key such as 2027, 2027-Q1, 2027-01, 2027-W01
 * (ISO week, Monday start) or 2027-01-04. Dates are plain YYYY-MM-DD strings
 * and all arithmetic runs in UTC, so daylight-saving changes can't shift a
 * boundary. Only todayPeriod() needs a timezone.
 */

export type Scope = 'year' | 'quarter' | 'month' | 'week' | 'day';

export type Period = {
    scope: Scope;
    key: string;
    /** First day, YYYY-MM-DD. */
    start: string;
    /** Last day, YYYY-MM-DD. */
    end: string;
};

const DAY_MS = 86_400_000;

const pad = (value: number, length = 2) => String(value).padStart(length, '0');

const utc = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));

const toDate = (ymd: string) => new Date(`${ymd.slice(0, 10)}T00:00:00Z`);

const toYmd = (date: Date) =>
    `${pad(date.getUTCFullYear(), 4)}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/** Monday of the ISO week that contains the date. */
const mondayOf = (date: Date) => addDays(date, -((date.getUTCDay() + 6) % 7));

/** ISO week-numbering year and week of the date. */
function isoWeek(date: Date): [year: number, week: number] {
    // The Thursday of a week decides which year the week belongs to.
    const thursday = addDays(mondayOf(date), 3);
    const year = thursday.getUTCFullYear();
    const dayOfYear = Math.round((thursday.getTime() - Date.UTC(year, 0, 1)) / DAY_MS);

    return [year, Math.floor(dayOfYear / 7) + 1];
}

function isoWeekStart(year: number, week: number): Date | null {
    if (week < 1) {
        return null;
    }

    // January 4 is always in week 1.
    const monday = addDays(mondayOf(utc(year, 1, 4)), (week - 1) * 7);
    const [actualYear, actualWeek] = isoWeek(monday);

    // Week 53 only exists in long ISO years; otherwise it rolls into the next year.
    return actualYear === year && actualWeek === week ? monday : null;
}

function validDate(year: number, month: number, day: number): Date | null {
    const date = utc(year, month, day);

    return date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
        ? date
        : null;
}

function build(scope: Scope, start: Date): Period {
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth() + 1;

    switch (scope) {
        case 'year':
            return { scope, key: pad(year, 4), start: toYmd(start), end: toYmd(utc(year, 12, 31)) };
        case 'quarter': {
            const quarter = Math.floor((month - 1) / 3) + 1;
            return {
                scope,
                key: `${pad(year, 4)}-Q${quarter}`,
                start: toYmd(start),
                end: toYmd(utc(year, month + 3, 0)),
            };
        }
        case 'month':
            return {
                scope,
                key: `${pad(year, 4)}-${pad(month)}`,
                start: toYmd(start),
                end: toYmd(utc(year, month + 1, 0)),
            };
        case 'week': {
            const [isoYear, week] = isoWeek(start);
            return {
                scope,
                key: `${pad(isoYear, 4)}-W${pad(week)}`,
                start: toYmd(start),
                end: toYmd(addDays(start, 6)),
            };
        }
        case 'day':
            return { scope, key: toYmd(start), start: toYmd(start), end: toYmd(start) };
    }
}

/** Parse a period key, or return null when it isn't a valid one. */
export function parsePeriod(key: string): Period | null {
    let match: RegExpMatchArray | null;
    let scope: Scope;
    let start: Date | null;

    if ((match = key.match(/^(\d{4})$/))) {
        scope = 'year';
        start = utc(+match[1], 1, 1);
    } else if ((match = key.match(/^(\d{4})-Q([1-4])$/))) {
        scope = 'quarter';
        start = utc(+match[1], (+match[2] - 1) * 3 + 1, 1);
    } else if ((match = key.match(/^(\d{4})-(\d{2})$/))) {
        scope = 'month';
        start = validDate(+match[1], +match[2], 1);
    } else if ((match = key.match(/^(\d{4})-W(\d{2})$/))) {
        scope = 'week';
        start = isoWeekStart(+match[1], +match[2]);
    } else if ((match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/))) {
        scope = 'day';
        start = validDate(+match[1], +match[2], +match[3]);
    } else {
        return null;
    }

    return start ? build(scope, start) : null;
}

/** The period of the given scope that contains the date (YYYY-MM-DD). */
export function periodFromDate(scope: Scope, ymd: string): Period {
    const date = toDate(ymd);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;

    switch (scope) {
        case 'year':
            return build(scope, utc(year, 1, 1));
        case 'quarter':
            return build(scope, utc(year, Math.floor((month - 1) / 3) * 3 + 1, 1));
        case 'month':
            return build(scope, utc(year, month, 1));
        case 'week':
            return build(scope, mondayOf(date));
        case 'day':
            return build(scope, date);
    }
}

/** Today's period for someone in the given IANA timezone. */
export function todayPeriod(scope: Scope, timeZone: string, now: Date = new Date()): Period {
    // en-CA formats dates as YYYY-MM-DD.
    const ymd = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(now);

    return periodFromDate(scope, ymd);
}

function shift(period: Period, step: number): Period {
    const start = toDate(period.start);
    const year = start.getUTCFullYear();
    const month = start.getUTCMonth() + 1;

    switch (period.scope) {
        case 'year':
            return build('year', utc(year + step, 1, 1));
        case 'quarter':
            return build('quarter', utc(year, month + step * 3, 1));
        case 'month':
            return build('month', utc(year, month + step, 1));
        case 'week':
            return build('week', addDays(start, step * 7));
        case 'day':
            return build('day', addDays(start, step));
    }
}

export const nextPeriod = (period: Period) => shift(period, 1);

export const previousPeriod = (period: Period) => shift(period, -1);

export function periodContains(period: Period, ymd: string): boolean {
    const day = ymd.slice(0, 10);

    return day >= period.start && day <= period.end;
}

const PARENT: Record<Scope, Scope | null> = {
    year: null,
    quarter: 'year',
    month: 'quarter',
    week: 'month',
    day: 'week',
};

const CHILD: Record<Scope, Scope | null> = {
    year: 'quarter',
    quarter: 'month',
    month: 'week',
    week: 'day',
    day: null,
};

/**
 * Day → week → month → quarter → year. A week belongs to the month that
 * contains its Monday.
 */
export function parentPeriod(period: Period): Period | null {
    const scope = PARENT[period.scope];

    return scope ? periodFromDate(scope, period.start) : null;
}

/**
 * The periods one level down. A month's children are the weeks whose Monday
 * falls in it, mirroring parentPeriod().
 */
export function childPeriods(period: Period): Period[] {
    const scope = CHILD[period.scope];

    if (!scope) {
        return [];
    }

    let child = periodFromDate(scope, period.start);

    if (child.start < period.start) {
        child = nextPeriod(child);
    }

    const children: Period[] = [];

    while (child.start <= period.end) {
        children.push(child);
        child = nextPeriod(child);
    }

    return children;
}

/**
 * Every month the period touches. A week that straddles two months returns
 * both, so weekly planning can offer goals from each.
 */
export function periodMonths(period: Period): Period[] {
    const months: Period[] = [];

    for (
        let month = periodFromDate('month', period.start);
        month.start <= period.end;
        month = nextPeriod(month)
    ) {
        months.push(month);
    }

    return months;
}
