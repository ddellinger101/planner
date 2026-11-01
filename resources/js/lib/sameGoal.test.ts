import { describe, expect, it } from 'vitest';
import { isSameGoal, lookAlikeGroups, looksLikeSameGoal } from './sameGoal';

const goal = (title: string, assignee_user_id: number | null = null) => ({
    title,
    assignee_user_id,
});

describe('isSameGoal', () => {
    it.each([
        ['Quit smoking', 'Quit smoking'],
        ['Home workout 3x a week', 'home WORKOUT 3x a week'],
        ['Structure practices with a “lesson plan”', 'Structure practices with a lesson plan!'],
    ])('"%s" and "%s" are the same', (a, b) => {
        expect(isSameGoal(goal(a), goal(b))).toBe(true);
    });

    it('needs the same words', () => {
        expect(isSameGoal(goal('Visit parents'), goal('Visit my parents'))).toBe(false);
    });

    it('keeps each person’s goals apart, but not from a shared one', () => {
        expect(isSameGoal(goal('Gym', 1), goal('Gym', 2))).toBe(false);
        expect(isSameGoal(goal('Gym', 1), goal('Gym', 1))).toBe(true);
        expect(isSameGoal(goal('Gym', 1), goal('Gym'))).toBe(true);
    });
});

describe('looksLikeSameGoal', () => {
    it.each([
        ['Cut the drinking', 'Limit drinking to 2 days a week'],
        ['Drink less', 'Cut the drinking'],
        ['Visit parents', 'Visit my parents'],
        ['Credit cards', 'Keep paying credit cards'],
        ['Insulate the house', 'Get the house insulated for winter'],
        ['Home workout 3x a week', 'Home Workout 2x'],
        ['Funny Farm', 'Finish Funny Farm'],
        ['Boy Who Could Fly', 'Finish The Boy Who Could Fly'],
    ])('"%s" looks like "%s"', (a, b) => {
        expect(looksLikeSameGoal(goal(a), goal(b))).toBe(true);
    });

    it.each([
        ['Gym 3x a week', 'Run 3x a week'],
        ['Gym 3x a week', 'Home workout 3x a week'],
        ['Focus on diet', 'Ramp up the exercise'],
        ['Quit smoking', 'Cut the drinking'],
        ['Finish Funny Farm', 'Finish The Boy Who Could Fly'],
        ['Keep paying credit cards', 'Prepare for car payment'],
        ['Run a 10k', 'Long run every Sunday'],
        ['The other 3.5 demos', 'Demo versions of all 7 songs'],
    ])('"%s" does not look like "%s"', (a, b) => {
        expect(looksLikeSameGoal(goal(a), goal(b))).toBe(false);
    });

    it('has nothing to go on when a title is only filler', () => {
        expect(looksLikeSameGoal(goal('Do more'), goal('Do more this week'))).toBe(false);
    });

    it('keeps each person’s goals apart', () => {
        expect(looksLikeSameGoal(goal('Drink less', 1), goal('Cut the drinking', 2))).toBe(false);
    });
});

describe('lookAlikeGroups', () => {
    it('gathers every wording of a goal and leaves the rest out', () => {
        const groups = lookAlikeGroups([
            goal('Drink less'),
            goal('Run 3x a week'),
            goal('Limit drinking to 2 days a week'),
            goal('Gym 3x a week'),
            goal('Cut the drinking'),
        ]);

        expect(groups.map((group) => group.map(({ title }) => title))).toEqual([
            ['Drink less', 'Limit drinking to 2 days a week', 'Cut the drinking'],
        ]);
    });
});
