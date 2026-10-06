import { describe, expect, it } from 'vitest';
import {
    childPeriods,
    nextPeriod,
    parentPeriod,
    parsePeriod,
    periodContains,
    periodFromDate,
    periodMonths,
    previousPeriod,
    todayPeriod,
    type Period,
    type Scope,
} from './period';

// These cases mirror tests/Unit/PeriodTest.php. Change both together.

const parse = (key: string): Period => {
    const period = parsePeriod(key);

    if (!period) {
        throw new Error(`Expected ${key} to be a valid period key`);
    }

    return period;
};

const keys = (periods: Period[]) => periods.map((period) => period.key);

describe('parsePeriod', () => {
    it.each<[string, Scope, string, string]>([
        ['2027', 'year', '2027-01-01', '2027-12-31'],
        ['2027-Q1', 'quarter', '2027-01-01', '2027-03-31'],
        ['2027-Q4', 'quarter', '2027-10-01', '2027-12-31'],
        ['2027-01', 'month', '2027-01-01', '2027-01-31'],
        ['2028-02', 'month', '2028-02-01', '2028-02-29'],
        ['2027-W01', 'week', '2027-01-04', '2027-01-10'],
        ['2026-W53', 'week', '2026-12-28', '2027-01-03'],
        ['2027-01-04', 'day', '2027-01-04', '2027-01-04'],
    ])('parses and formats %s', (key, scope, start, end) => {
        expect(parsePeriod(key)).toEqual({ scope, key, start, end });
    });

    it.each([
        'abc',
        '',
        '2027-13',
        '2027-00',
        '2027-Q5',
        '2027-W00',
        '2027-W54',
        '2025-W53',
        '2027-02-30',
        '2027-02-29',
        '2027-01-04x',
        '2027-w01',
    ])('rejects %j', (key) => {
        expect(parsePeriod(key)).toBeNull();
    });
});

describe('periodFromDate', () => {
    it.each<[Scope, string, string]>([
        ['year', '2027-06-15', '2027'],
        ['quarter', '2027-06-15', '2027-Q2'],
        ['month', '2027-06-15', '2027-06'],
        ['week', '2027-06-15', '2027-W24'],
        ['day', '2027-06-15', '2027-06-15'],
        ['week', '2027-01-01', '2026-W53'],
        ['week', '2024-12-30', '2025-W01'],
        ['week', '2027-01-10', '2027-W01'],
    ])('finds the %s that contains %s', (scope, date, key) => {
        expect(periodFromDate(scope, date).key).toBe(key);
    });
});

describe('stepping', () => {
    it.each([
        ['2027', '2028'],
        ['2027-Q4', '2028-Q1'],
        ['2027-12', '2028-01'],
        ['2027-01', '2027-02'],
        ['2026-W53', '2027-W01'],
        ['2025-W52', '2026-W01'],
        ['2027-01-31', '2027-02-01'],
        ['2028-02-28', '2028-02-29'],
        ['2027-12-31', '2028-01-01'],
    ])('goes from %s to %s and back', (key, next) => {
        expect(nextPeriod(parse(key)).key).toBe(next);
        expect(previousPeriod(parse(next)).key).toBe(key);
    });

    it('is not shifted by daylight-saving changes', () => {
        // US clocks go forward on March 14, 2027 and back on November 7, 2027.
        expect(nextPeriod(parse('2027-03-14')).key).toBe('2027-03-15');
        expect(nextPeriod(parse('2027-11-07')).key).toBe('2027-11-08');
        expect(previousPeriod(parse('2027-11-07')).key).toBe('2027-11-06');
        expect(childPeriods(periodFromDate('week', '2027-03-14'))).toHaveLength(7);
        expect(childPeriods(periodFromDate('week', '2027-11-07'))).toHaveLength(7);
    });
});

describe('periodContains', () => {
    it('includes both ends and nothing outside', () => {
        const week = parse('2026-W05');

        expect(periodContains(week, '2026-01-25')).toBe(false);
        expect(periodContains(week, '2026-01-26')).toBe(true);
        expect(periodContains(week, '2026-02-01')).toBe(true);
        expect(periodContains(week, '2026-02-02')).toBe(false);
        expect(periodContains(parse('2027-Q1'), '2027-03-31')).toBe(true);
        expect(periodContains(parse('2027-Q1'), '2027-04-01')).toBe(false);
    });
});

describe('hierarchy', () => {
    it('walks up from day to year', () => {
        const chain: string[] = [];

        for (
            let period: Period | null = parse('2027-01-31');
            period;
            period = parentPeriod(period)
        ) {
            chain.push(period.key);
        }

        expect(chain).toEqual(['2027-01-31', '2027-W04', '2027-01', '2027-Q1', '2027']);
    });

    it('assigns a straddling week to the month that contains its Monday', () => {
        const week = parse('2026-W05'); // January 26 to February 1

        expect(parentPeriod(week)?.key).toBe('2026-01');
        expect(keys(periodMonths(week))).toEqual(['2026-01', '2026-02']);
        expect(keys(periodMonths(parse('2026-W06')))).toEqual(['2026-02']);
    });

    it('lists the periods one level down', () => {
        expect(keys(childPeriods(parse('2027')))).toEqual([
            '2027-Q1',
            '2027-Q2',
            '2027-Q3',
            '2027-Q4',
        ]);
        expect(keys(childPeriods(parse('2027-Q4')))).toEqual(['2027-10', '2027-11', '2027-12']);
        expect(keys(childPeriods(parse('2027-W01')))).toEqual([
            '2027-01-04',
            '2027-01-05',
            '2027-01-06',
            '2027-01-07',
            '2027-01-08',
            '2027-01-09',
            '2027-01-10',
        ]);
        expect(childPeriods(parse('2027-01-04'))).toEqual([]);
    });

    it('gives a month only the weeks whose Monday falls in it', () => {
        expect(keys(childPeriods(parse('2026-02')))).toEqual([
            '2026-W06',
            '2026-W07',
            '2026-W08',
            '2026-W09',
        ]);
        expect(keys(childPeriods(parse('2026-01')))).toEqual([
            '2026-W02',
            '2026-W03',
            '2026-W04',
            '2026-W05',
        ]);
    });

    it('gives every week exactly one parent month across a whole year', () => {
        const weeks = childPeriods(parse('2026'))
            .flatMap(childPeriods)
            .flatMap((month) =>
                childPeriods(month).map((week) => {
                    expect(parentPeriod(week)?.key).toBe(month.key);
                    return week.key;
                }),
            );

        expect(weeks).toHaveLength(52);
        expect(weeks[0]).toBe('2026-W02');
        expect(weeks.at(-1)).toBe('2026-W53');
    });
});

describe('todayPeriod', () => {
    it('uses the given timezone to decide what today is', () => {
        const now = new Date('2027-03-15T03:30:00Z');

        expect(todayPeriod('day', 'America/New_York', now).key).toBe('2027-03-14');
        expect(todayPeriod('day', 'UTC', now).key).toBe('2027-03-15');
        expect(todayPeriod('week', 'America/New_York', now).key).toBe('2027-W10');
        expect(todayPeriod('week', 'UTC', now).key).toBe('2027-W11');
    });
});
