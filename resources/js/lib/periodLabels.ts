import { periodContains, periodFromDate, type Period, type Scope } from './period';

const LOCALE = 'en-US';

// Period dates are plain calendar dates, so they are always formatted in UTC.
const format = (ymd: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', ...options }).format(
        new Date(`${ymd}T00:00:00Z`),
    );

const year = (ymd: string) => ymd.slice(0, 4);
const month = (ymd: string) => ymd.slice(0, 7);

/** "Jan 4 – 10, 2027", "Jan 26 – Feb 1, 2026" or "Dec 28, 2026 – Jan 3, 2027". */
function dateRange(start: string, end: string): string {
    const monthDay: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

    if (year(start) !== year(end)) {
        return `${format(start, monthDay)}, ${year(start)} – ${format(end, monthDay)}, ${year(end)}`;
    }

    const last =
        month(start) === month(end) ? format(end, { day: 'numeric' }) : format(end, monthDay);

    return `${format(start, monthDay)} – ${last}, ${year(end)}`;
}

/** A heading and a smaller line of detail for a period. */
export function periodLabel(period: Period): { title: string; subtitle: string } {
    switch (period.scope) {
        case 'year':
            return { title: period.key, subtitle: '' };
        case 'quarter':
            return {
                title: `Quarter ${period.key.slice(-1)}`,
                subtitle: `${format(period.start, { month: 'long' })} – ${format(period.end, { month: 'long' })} ${year(period.start)}`,
            };
        case 'month':
            return { title: format(period.start, { month: 'long' }), subtitle: year(period.start) };
        case 'week':
            return {
                title: `Week ${Number(period.key.slice(-2))}`,
                subtitle: dateRange(period.start, period.end),
            };
        case 'day':
            return {
                title: format(period.start, { weekday: 'long' }),
                subtitle: format(period.start, { month: 'long', day: 'numeric', year: 'numeric' }),
            };
    }
}

/** A one-line name, for menus and buttons: "Week 1 (Jan 4 – 10, 2027)". */
export function periodName(period: Period): string {
    const { title, subtitle } = periodLabel(period);

    if (period.scope === 'day') {
        return `${title}, ${format(period.start, { month: 'short', day: 'numeric' })}`;
    }

    if (period.scope === 'month') {
        return `${title} ${subtitle}`;
    }

    return subtitle ? `${title} (${subtitle})` : title;
}

/** "15:30" → "3:30 PM". */
export function formatTime(time: string): string {
    const [hours, minutes] = time.split(':').map(Number);
    const hour = hours % 12 || 12;

    return `${hour}:${String(minutes).padStart(2, '0')} ${hours < 12 ? 'AM' : 'PM'}`;
}

/**
 * The period to show when switching scope from another period. If today is
 * in view, stay on today; otherwise stay near what was being looked at.
 */
export function relatedPeriod(current: Period, scope: Scope, today: string): Period {
    return periodFromDate(scope, periodContains(current, today) ? today : current.start);
}

export const SCOPES: Scope[] = ['day', 'week', 'month', 'quarter', 'year'];

export const SCOPE_NAMES: Record<Scope, string> = {
    day: 'Day',
    week: 'Week',
    month: 'Month',
    quarter: 'Quarter',
    year: 'Year',
};
