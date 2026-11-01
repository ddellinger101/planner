import { describe, expect, it } from 'vitest';
import { habitFor, habitFromGoal, isVague } from './goalChecks';

describe('isVague', () => {
    it.each([
        'Cut the drinking',
        'Drink less',
        'Keep paying credit cards',
        'Focus on diet',
        'Ramp up the exercise',
        'Increase savings',
        'Play more regular live shows',
    ])('"%s" is vague', (title) => {
        expect(isVague(title)).toBe(true);
    });

    it.each([
        'Limit drinking to 2 days a week',
        'Pay $500 toward the credit cards',
        'Keep paying credit cards by Nov 30',
        'Increase savings by the end of the year',
        'Visit my parents',
        'Release the book',
        'Quit smoking',
        'Marketing plan',
        'Scut work',
    ])('"%s" is not vague', (title) => {
        expect(isVague(title)).toBe(false);
    });
});

describe('habitFor', () => {
    const habits = [
        { title: 'No Drinking', user_id: 1 },
        { title: 'No Smoking', user_id: 1 },
        { title: 'Keto', user_id: 1 },
        { title: 'Workout', user_id: 1 },
        { title: 'Practice', user_id: 1 },
        { title: 'Rocket Money', user_id: 1 },
    ];
    const goal = (title: string, assignee_user_id: number | null = 1) => ({
        title,
        assignee_user_id,
    });

    it.each([
        ['Quit smoking', 'No Smoking'],
        ['Cut the drinking', 'No Drinking'],
        ['Limit drinking to 2 days a week', 'No Drinking'],
        ['Keto', 'Keto'],
        ['Home workout 3x a week', 'Workout'],
    ])('"%s" is covered by %s', (title, habit) => {
        expect(habitFor(goal(title), habits)?.title).toBe(habit);
    });

    it.each([
        'Gym 3x a week',
        'Focus on diet',
        'Structure our practices with a “lesson plan”',
        'Keep paying credit cards',
    ])('"%s" has no habit', (title) => {
        expect(habitFor(goal(title), habits)).toBeUndefined();
    });

    it('counts a shared goal, but not someone else’s', () => {
        expect(habitFor(goal('Keto', null), habits)?.title).toBe('Keto');
        expect(habitFor(goal('Keto', 2), habits)).toBeUndefined();
    });
});

describe('habitFromGoal', () => {
    it.each([
        ['Gym 3x a week', 'Gym', 3],
        ['Home Workout 2x', 'Home Workout', 2],
        ['Run 4 times per week', 'Run', 4],
        ['Meditate', 'Meditate', 7],
        ['Read 20 pages', 'Read 20 pages', 7],
    ])('"%s" becomes %s, %i times a week', (goal, title, target) => {
        expect(habitFromGoal(goal)).toEqual({ title, target });
    });
});
