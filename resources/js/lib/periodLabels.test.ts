import { describe, expect, it } from 'vitest';
import { parsePeriod, type Period } from './period';
import { formatTime, periodLabel, periodName, relatedPeriod } from './periodLabels';
import { periodFromPath } from './useCurrentPeriod';

const parse = (key: string) => parsePeriod(key) as Period;

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
