import { describe, expect, it } from 'vitest';
import { parsePeriod, type Period } from './period';
import {
    formatTime,
    periodLabel,
    periodName,
    periodsToPlan,
    periodToPlan,
    planChoiceName,
    relatedPeriod,
} from './periodLabels';
import { periodFromPath } from './useCurrentPeriod';

const parse = (key: string) => parsePeriod(key) as Period;

describe('periodToPlan', () => {
    it.each([
        // A Sunday, the last day of its week.
        ['2026-W44', '2026-11-01', '2026-W45', 'Plan next week'],
        // The rule doesn't depend on the day: a Monday looks ahead as well.
        ['2026-W45', '2026-11-02', '2026-W46', 'Plan next week'],
        ['2026-11', '2026-11-29', '2026-12', 'Plan next month'],
        ['2026-Q4', '2026-11-29', '2027-Q1', 'Plan next quarter'],
        ['2026', '2026-11-29', '2027', 'Plan next year'],
        // Across a year boundary.
        ['2026-12', '2026-12-27', '2027-01', 'Plan next month'],
        ['2026-W53', '2027-01-03', '2027-W01', 'Plan next week'],
        // Already looking at the next period: the same plan.
        ['2026-12', '2026-11-29', '2026-12', 'Plan next month'],
        // Further ahead plans what's on screen, by name.
        ['2027-02', '2026-11-29', '2027-02', 'Plan February 2027'],
        ['2027-W10', '2026-11-29', '2027-W10', 'Plan Week 10'],
        ['2027-Q3', '2026-11-29', '2027-Q3', 'Plan Quarter 3'],
        ['2028', '2026-11-29', '2028', 'Plan 2028'],
    ])('from %s on %s plans %s', (viewed, today, planned, label) => {
        const plan = periodToPlan(parse(viewed), today);

        expect(plan?.period.key).toBe(planned);
        expect(plan?.label).toBe(label);
    });

    it('has nothing to plan once a period is over', () => {
        expect(periodToPlan(parse('2026-10'), '2026-11-01')).toBeNull();
    });
});

describe('periodsToPlan', () => {
    const keys = (viewed: string, today: string) =>
        periodsToPlan(parse(viewed), today).map((period) => period.key);

    it.each([
        // The Sunday that ends a week and starts a month.
        ['2026-W45', '2026-11-01', '2026-W44', '2026-W51', 8],
        ['2026-12', '2026-11-01', '2026-11', '2027-10', 12],
        ['2027-Q1', '2026-11-01', '2026-Q4', '2027-Q3', 4],
        ['2027', '2026-11-01', '2026', '2028', 3],
    ])('from %s on %s runs from %s to %s', (viewed, today, first, last, count) => {
        const choices = keys(viewed, today);

        expect(choices[0]).toBe(first);
        expect(choices.at(-1)).toBe(last);
        expect(choices).toHaveLength(count);
    });

    it('keeps a period outside the list in it, in date order', () => {
        expect(keys('2026-10', '2026-11-01').slice(0, 2)).toEqual(['2026-10', '2026-11']);
        expect(keys('2028-06', '2026-11-01').slice(-2)).toEqual(['2027-10', '2028-06']);
    });
});

describe('planChoiceName', () => {
    it.each([
        ['2026-W44', 'This week: Oct 26 – Nov 1, 2026'],
        ['2026-W45', 'Next week: Nov 2 – 8, 2026'],
        ['2026-W46', 'Week 46 (Nov 9 – 15, 2026)'],
        ['2026-11', 'This month: November 2026'],
        ['2026-12', 'Next month: December 2026'],
        ['2027-01', 'January 2027'],
        ['2026-Q4', 'This quarter: Q4 (Oct – Dec 2026)'],
        ['2027-Q2', 'Q2 (Apr – Jun 2027)'],
        ['2027', 'Next year: 2027'],
    ])('%s is "%s"', (key, name) => {
        expect(planChoiceName(parse(key), '2026-11-01')).toBe(name);
    });
});

describe('periodLabel', () => {
    it.each([
        ['2027', '2027', ''],
        ['2027-Q1', 'Quarter 1', 'January – March 2027'],
        ['2027-03', 'March', '2027'],
        ['2027-W01', 'Week 1', 'Jan 4 – 10, 2027'],
        ['2026-W05', 'Week 5', 'Jan 26 – Feb 1, 2026'],
        ['2026-W53', 'Week 53', 'Dec 28, 2026 – Jan 3, 2027'],
        ['2027-01-04', 'Monday', 'January 4, 2027'],
    ])('labels %s', (key, title, subtitle) => {
        expect(periodLabel(parse(key))).toEqual({ title, subtitle });
    });

    it.each([
        ['2027-Q4', 'Q4', 'Oct – Dec 2027'],
        ['2027-09-30', 'Thursday', 'Sep 30, 2027'],
        ['2027-03', 'March', '2027'],
    ])('shortens %s for a phone', (key, title, subtitle) => {
        expect(periodLabel(parse(key), true)).toEqual({ title, subtitle });
    });
});

describe('periodName', () => {
    it.each([
        ['2027', '2027'],
        ['2027-Q1', 'Quarter 1 (January – March 2027)'],
        ['2027-03', 'March 2027'],
        ['2027-W01', 'Week 1 (Jan 4 – 10, 2027)'],
        ['2027-01-04', 'Monday, Jan 4'],
    ])('names %s', (key, name) => {
        expect(periodName(parse(key))).toBe(name);
    });
});

describe('formatTime', () => {
    it.each([
        ['00:00', '12:00 AM'],
        ['06:30', '6:30 AM'],
        ['12:05', '12:05 PM'],
        ['15:30', '3:30 PM'],
        ['23:59', '11:59 PM'],
    ])('formats %s', (time, text) => {
        expect(formatTime(time)).toBe(text);
    });
});

describe('relatedPeriod', () => {
    it('stays on today when today is in view', () => {
        expect(relatedPeriod(parse('2027-01'), 'day', '2027-01-20').key).toBe('2027-01-20');
        expect(relatedPeriod(parse('2027-01'), 'week', '2027-01-20').key).toBe('2027-W03');
    });

    it('otherwise stays near what was on screen', () => {
        expect(relatedPeriod(parse('2027-03'), 'day', '2027-01-20').key).toBe('2027-03-01');
        expect(relatedPeriod(parse('2027-03-15'), 'quarter', '2027-01-20').key).toBe('2027-Q1');
        expect(relatedPeriod(parse('2026-W05'), 'month', '2027-01-20').key).toBe('2026-01');
    });
});

describe('periodFromPath', () => {
    const zone = 'America/New_York';

    it('reads the period from a period page', () => {
        expect(periodFromPath('/week/2027-W01', zone)?.key).toBe('2027-W01');
        expect(periodFromPath('/year/2027', zone)?.key).toBe('2027');
    });

    it('means "now" when there is no key', () => {
        expect(periodFromPath('/month', zone)?.scope).toBe('month');
    });

    it('returns null for other pages and for keys of the wrong kind', () => {
        expect(periodFromPath('/settings', zone)).toBeNull();
        expect(periodFromPath('/', zone)).toBeNull();
        expect(periodFromPath('/week/2027-03', zone)).toBeNull();
        expect(periodFromPath('/week/2025-W53', zone)).toBeNull();
    });
});
