/**
 * Recurrence rules. Tasks store an iCalendar RRULE string; this module
 * builds the common ones from a task's date and puts them into words. The
 * server expands the rule into occurrences.
 */

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ORDINALS = ['first', 'second', 'third', 'fourth'];
const WEEKDAYS = 'MO,TU,WE,TH,FR';

/** Monday-first, the way the planner shows a week. */
export const WEEK_DAYS = [1, 2, 3, 4, 5, 6, 0].map((index) => ({
    code: DAY_CODES[index],
    name: DAY_NAMES[index],
}));

const dateParts = (ymd: string) => {
    const date = new Date(`${ymd}T00:00:00Z`);
    const day = date.getUTCDate();
    const lastDay = new Date(
        Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
    ).getUTCDate();

    return {
        weekday: date.getUTCDay(),
        day,
        // Which Monday (say) of the month this is; -1 once there are no more after it.
        nth: day + 7 > lastDay ? -1 : Math.ceil(day / 7),
        monthDay: new Intl.DateTimeFormat('en-US', {
            timeZone: 'UTC',
            month: 'long',
            day: 'numeric',
        }).format(date),
    };
};

const ordinal = (n: number) => {
    const suffix =
        n % 10 === 1 && n !== 11
            ? 'st'
            : n % 10 === 2 && n !== 12
              ? 'nd'
              : n % 10 === 3 && n !== 13
                ? 'rd'
                : 'th';

    return `${n}${suffix}`;
};

const nthName = (nth: number) => (nth === -1 ? 'last' : ORDINALS[nth - 1]);

export type RepeatOption = { rule: string; label: string };

/** The ready-made choices for a task that starts on the given date. */
export function repeatOptions(ymd: string): RepeatOption[] {
    const { weekday, day, nth } = dateParts(ymd);
    const code = DAY_CODES[weekday];

    const rules = [
        'FREQ=DAILY',
        `FREQ=WEEKLY;BYDAY=${WEEKDAYS}`,
        `FREQ=WEEKLY;BYDAY=${code}`,
        `FREQ=WEEKLY;INTERVAL=2;BYDAY=${code}`,
        `FREQ=MONTHLY;BYMONTHDAY=${day}`,
        `FREQ=MONTHLY;BYDAY=${nth}${code}`,
        'FREQ=YEARLY',
    ];

    return rules.map((rule) => ({ rule, label: describeRule(rule, ymd) }));
}

/** A weekly rule on the given days ("MO", "WE"…), every `interval` weeks. */
export function weeklyRule(days: string[], interval = 1): string {
    const ordered = WEEK_DAYS.map((day) => day.code).filter((code) => days.includes(code));

    return ['FREQ=WEEKLY', interval > 1 ? `INTERVAL=${interval}` : '', `BYDAY=${ordered.join(',')}`]
        .filter(Boolean)
        .join(';');
}

/** The rule's parts as a lookup, e.g. { FREQ: 'WEEKLY', BYDAY: 'MO,WE' }. */
export function ruleParts(rule: string): Record<string, string> {
    return Object.fromEntries(
        rule
            .replace(/^RRULE:/i, '')
            .split(';')
            .filter(Boolean)
            .map((part) => part.split('=') as [string, string]),
    );
}

const listDays = (codes: string[]) => {
    const names = codes.map(
        (code) => DAY_NAMES[DAY_CODES.indexOf(code as (typeof DAY_CODES)[number])],
    );

    return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];
};

/**
 * A rule in plain words. `ymd` is the task's date, which a rule such as
 * FREQ=YEARLY needs in order to say which day it falls on.
 */
export function describeRule(rule: string, ymd: string): string {
    const { FREQ, INTERVAL, BYDAY, BYMONTHDAY, UNTIL, COUNT, ...rest } = ruleParts(rule);
    const interval = Number(INTERVAL ?? 1);
    const date = dateParts(ymd);
    let text: string | null = null;

    if (Object.keys(rest).length === 0) {
        if (FREQ === 'DAILY' && !BYDAY && !BYMONTHDAY) {
            text = interval === 1 ? 'Every day' : `Every ${interval} days`;
        } else if (FREQ === 'WEEKLY' && !BYMONTHDAY) {
            const days = BYDAY ? BYDAY.split(',') : [DAY_CODES[date.weekday]];
            const valid = days.every((code) => (DAY_CODES as readonly string[]).includes(code));

            if (valid && BYDAY === WEEKDAYS && interval === 1) {
                text = 'Every weekday';
            } else if (valid) {
                text = `Every ${interval === 1 ? 'week' : `${interval} weeks`} on ${listDays(days)}`;
            }
        } else if (FREQ === 'MONTHLY' && interval === 1) {
            const nthDay = BYDAY?.match(/^(-1|[1-4])([A-Z]{2})$/);

            if (nthDay && !BYMONTHDAY) {
                text = `Every month on the ${nthName(Number(nthDay[1]))} ${listDays([nthDay[2]])}`;
            } else if (!BYDAY && /^\d+$/.test(BYMONTHDAY ?? String(date.day))) {
                text = `Every month on the ${ordinal(Number(BYMONTHDAY ?? date.day))}`;
            }
        } else if (FREQ === 'YEARLY' && interval === 1 && !BYDAY && !BYMONTHDAY) {
            text = `Every year on ${date.monthDay}`;
        }
    }

    if (text === null) {
        return 'Custom repeat';
    }

    if (COUNT) {
        return `${text}, ${COUNT} times`;
    }

    const until = UNTIL?.match(/^(\d{4})(\d{2})(\d{2})/);

    return until
        ? `${text}, until ${dateParts(`${until[1]}-${until[2]}-${until[3]}`).monthDay}`
        : text;
}
