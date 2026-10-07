import { describe, expect, it } from 'vitest';
import { describeRule, repeatOptions, ruleParts, weeklyRule } from './rrule';

describe('repeatOptions', () => {
    it('offers presets built from the task’s date', () => {
        // January 4, 2027 is the first Monday of the month.
        expect(repeatOptions('2027-01-04')).toEqual([
            { rule: 'FREQ=DAILY', label: 'Every day' },
            { rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', label: 'Every weekday' },
            { rule: 'FREQ=WEEKLY;BYDAY=MO', label: 'Every week on Monday' },
            { rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO', label: 'Every 2 weeks on Monday' },
            { rule: 'FREQ=MONTHLY;BYMONTHDAY=4', label: 'Every month on the 4th' },
            { rule: 'FREQ=MONTHLY;BYDAY=1MO', label: 'Every month on the first Monday' },
            { rule: 'FREQ=YEARLY', label: 'Every year on January 4' },
        ]);
    });

    it('says "last" when it is the final such weekday of the month', () => {
        // January 29, 2027 is the fifth and last Friday.
        const labels = repeatOptions('2027-01-29').map((option) => option.label);

        expect(labels).toContain('Every month on the last Friday');
        expect(labels).toContain('Every month on the 29th');
        // January 25 is the fourth Monday and also the last one.
        expect(repeatOptions('2027-01-25').map((option) => option.rule)).toContain(
            'FREQ=MONTHLY;BYDAY=-1MO',
        );
    });
});

describe('weeklyRule', () => {
    it('orders the days Monday first and adds an interval when needed', () => {
        expect(weeklyRule(['WE', 'MO'])).toBe('FREQ=WEEKLY;BYDAY=MO,WE');
        expect(weeklyRule(['SU', 'SA'], 3)).toBe('FREQ=WEEKLY;INTERVAL=3;BYDAY=SA,SU');
    });
});

describe('ruleParts', () => {
    it('splits a rule, with or without the RRULE: prefix', () => {
        expect(ruleParts('RRULE:FREQ=WEEKLY;BYDAY=MO,WE')).toEqual({
            FREQ: 'WEEKLY',
            BYDAY: 'MO,WE',
        });
    });
});

describe('describeRule', () => {
    it.each([
        ['FREQ=DAILY;INTERVAL=3', 'Every 3 days'],
        ['FREQ=WEEKLY', 'Every week on Monday'],
        ['FREQ=WEEKLY;BYDAY=MO,WE,FR', 'Every week on Monday, Wednesday and Friday'],
        ['FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH', 'Every 2 weeks on Tuesday and Thursday'],
        ['FREQ=MONTHLY', 'Every month on the 4th'],
        ['FREQ=MONTHLY;BYMONTHDAY=22', 'Every month on the 22nd'],
        ['FREQ=MONTHLY;BYMONTHDAY=11', 'Every month on the 11th'],
        ['FREQ=MONTHLY;BYDAY=-1FR', 'Every month on the last Friday'],
        ['FREQ=MONTHLY;BYDAY=3TU', 'Every month on the third Tuesday'],
        ['FREQ=DAILY;UNTIL=20270109', 'Every day, until January 9'],
        ['FREQ=WEEKLY;BYDAY=MO;COUNT=5', 'Every week on Monday, 5 times'],
    ])('%s → %s', (rule, text) => {
        expect(describeRule(rule, '2027-01-04')).toBe(text);
    });

    it.each([
        'FREQ=MONTHLY;INTERVAL=3',
        'FREQ=YEARLY;BYMONTH=6',
        'FREQ=HOURLY',
        'FREQ=MONTHLY;BYDAY=MO,TU',
        'FREQ=WEEKLY;BYDAY=XX',
    ])('falls back for %s', (rule) => {
        expect(describeRule(rule, '2027-01-04')).toBe('Custom repeat');
    });
});
