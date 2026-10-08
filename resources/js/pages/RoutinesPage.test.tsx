import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Habit } from '@/api/day';
import { todayPeriod } from '@/lib/period';
import { makeItem, mockApi, renderApp, signedIn } from '@/test/helpers';

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

const habit = (overrides: Partial<Habit> = {}): Habit => ({
    id: 1,
    user_id: 1,
    title: 'Floss',
    category_id: 1,
    icon: null,
    color: null,
    routine: 'evening',
    target_per_week: 7,
    active_from: '2026-01-01',
    active_to: null,
    checks: [],
    ...overrides,
});

const habits = [
    habit({ id: 1, title: 'Floss' }),
    habit({ id: 2, title: 'Read', user_id: 2 }),
    habit({ id: 3, title: 'Stretch', routine: 'morning' }),
    habit({ id: 4, title: 'Guitar', routine: 'anytime', target_per_week: 4, category_id: 2 }),
];

const stats = {
    1: { streak_unit: 'days', current_streak: 4, best_streak: 9, completion: 80, done_total: 40 },
    4: { streak_unit: 'weeks', current_streak: 1, best_streak: 6, completion: 100, done_total: 30 },
};

const region = (name: string | RegExp) => screen.findByRole('region', { name });

describe('routine editors', () => {
    it('lists each routine’s habits with how they are going', async () => {
        // Whose a habit is gets said only in the Both view.
        window.localStorage.setItem('planner.person', 'both');
        mockApi({
            ...signedIn(),
            'GET /api/habits': { body: habits },
            'GET /api/habits/stats': { body: stats },
        });

        renderApp('/routines');

        const evening = within(await region('Evening routine'));
        const items = await evening.findAllByRole('listitem');
        expect(items).toHaveLength(2);
        expect(items[0]).toHaveTextContent('Floss');
        expect(items[1]).toHaveTextContent('Read');
        expect(items[0]).toHaveTextContent('Every day');
        expect(await within(items[0]).findByText('80% in 30 days')).toBeInTheDocument();
        expect(items[0]).toHaveTextContent('4 days in a row');
        // The second person's habit is marked as theirs.
        expect(within(items[1]).getByText('Elizabeth’s habit')).toBeInTheDocument();

        const anytime = within(await region('Anytime'));
        expect(await anytime.findByText('4 times a week')).toBeInTheDocument();
        // One week, not "1 weeks".
        expect(anytime.getByText('Guitar').closest('li')).toHaveTextContent('1 week in a row');
        expect(within(await region('Morning routine')).getByText('Stretch')).toBeInTheDocument();
    });

    it('shows the streaks beside the month, longest first, above the routines', async () => {
        mockApi({
            ...signedIn(),
            'GET /api/habits': { body: habits },
            'GET /api/habits/stats': { body: stats },
        });

        renderApp('/routines');

        const streaks = within(await region('Current streaks'));
        const tiles = await streaks.findAllByRole('listitem');
        // One week outlasts four days.
        expect(tiles[0]).toHaveTextContent('Guitar');
        expect(tiles[0]).toHaveTextContent('1week in a row');
        expect(tiles[0]).toHaveTextContent('Best: 6');
        expect(tiles[1]).toHaveTextContent('Floss');
        expect(tiles[1]).toHaveTextContent('4days in a row');

        const month = screen.getByRole('heading', { name: 'Month at a glance' });
        const routines = screen.getByRole('heading', { name: 'Your routines' });
        expect(
            month.compareDocumentPosition(routines) & Node.DOCUMENT_POSITION_FOLLOWING,
        ).toBeTruthy();
    });

    it('adds a habit to the routine it was started from', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'POST /api/habits': ({ body }) => ({ status: 201, body: habit(body as object) }),
        });

        renderApp('/routines');
        await userEvent.click(
            within(await region('Morning routine')).getByRole('button', { name: 'Add a habit' }),
        );

        const dialog = within(screen.getByRole('dialog', { name: 'New habit' }));
        expect(dialog.getByRole('radio', { name: 'Morning' })).toBeChecked();
        expect(dialog.getByRole('button', { name: 'Add habit' })).toBeDisabled();

        await userEvent.type(dialog.getByLabelText('Habit'), 'Drink water');
        await userEvent.selectOptions(dialog.getByLabelText('How often'), '5');
        await userEvent.selectOptions(dialog.getByLabelText('Whose habit'), '2');
        await userEvent.click(dialog.getByRole('button', { name: 'Add habit' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                title: 'Drink water',
                routine: 'morning',
                category_id: 1, // Health, by default
                target_per_week: 5,
                user_id: 2,
            }),
        );
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('edits a habit, and deletes one only after confirming', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/habits': { body: habits },
            'PATCH /api/habits/1': ({ body }) => ({ body: habit(body as object) }),
            'DELETE /api/habits/1': { status: 204 },
        });

        renderApp('/routines');
        await userEvent.click(await screen.findByRole('button', { name: 'Edit Floss' }));

        let dialog = within(screen.getByRole('dialog', { name: 'Edit habit' }));
        expect(dialog.getByLabelText('Habit')).toHaveValue('Floss');
        await userEvent.click(dialog.getByRole('radio', { name: 'Morning' }));
        await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toMatchObject({
                title: 'Floss',
                routine: 'morning',
            }),
        );

        await userEvent.click(await screen.findByRole('button', { name: 'Edit Floss' }));
        dialog = within(screen.getByRole('dialog', { name: 'Edit habit' }));
        await userEvent.click(dialog.getByRole('button', { name: 'Delete this habit' }));

        // Nothing is deleted until the second, explicit step.
        expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
        expect(dialog.getByText(/its whole history/)).toBeInTheDocument();

        await userEvent.click(dialog.getByRole('button', { name: 'Delete habit' }));
        await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
    });

    it('moves a habit within its routine without disturbing the others', async () => {
        let order = habits;
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/habits': () => ({ body: order }),
            'POST /api/habits/reorder': ({ body }) => {
                const { ids } = body as { ids: number[] };
                order = [...order].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
                return { status: 204 };
            },
        });

        renderApp('/routines');
        const evening = within(await region('Evening routine'));

        expect(await evening.findByRole('button', { name: 'Move Floss up' })).toBeDisabled();
        expect(evening.getByRole('button', { name: 'Move Read down' })).toBeDisabled();

        await userEvent.click(evening.getByRole('button', { name: 'Move Read up' }));

        // Read and Floss swap; Stretch and Guitar stay where they were.
        await waitFor(() =>
            expect(calls.find((call) => call.path === '/api/habits/reorder')?.body).toEqual({
                ids: [2, 1, 3, 4],
            }),
        );
        await waitFor(() => expect(evening.getAllByRole('listitem')[0]).toHaveTextContent('Read'));
    });

    it('shows a routine’s repeating tasks and opens them in the task editor', async () => {
        const series = makeItem({
            id: 55,
            title: 'Make the bed',
            routine: 'morning',
            recurrence_rule: 'FREQ=DAILY',
        });
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/items': ({ url }: { url: URL }) => ({
                body: url.searchParams.get('routine') === 'morning' ? [series] : [],
            }),
        });

        renderApp('/routines');
        const morning = within(await region('Morning routine'));

        expect(await morning.findByText('Make the bed')).toBeInTheDocument();
        expect(morning.getByText('Every day')).toBeInTheDocument();
        expect(
            calls.find((call) => call.query.get('routine') === 'morning')?.query.get('series'),
        ).toBe('1');

        await userEvent.click(morning.getByRole('button', { name: 'Edit Make the bed' }));
        expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeInTheDocument();
    });
});

describe('trackers', () => {
    const week = todayPeriod('week', 'America/New_York');
    const month = todayPeriod('month', 'America/New_York');

    it('checks a habit off in the weekly grid, with streaks already loaded', async () => {
        // The stub remembers the check, as the real server would.
        let checks: Habit['checks'] = [];
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/habits': () => ({ body: [habit({ checks })] }),
            'GET /api/habits/stats': { body: stats },
            [`PUT /api/habits/1/checks/${week.start}`]: ({ body }) => {
                checks = [{ date: week.start, done: true }];
                return { body };
            },
        });

        renderApp('/routines');
        const grid = within(await region('Habit check-off'));
        await userEvent.click(await grid.findByRole('checkbox', { name: 'Floss, Monday' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ done: true }),
        );
        await waitFor(() =>
            expect(grid.getByRole('checkbox', { name: 'Floss, Monday' })).toBeChecked(),
        );
        // The cached streak figures aren't a list; the page must survive updating around them.
        expect(
            screen.getByRole('heading', { level: 1, name: 'Routines & Habits' }),
        ).toBeInTheDocument();
        expect(await screen.findByText('80% in 30 days')).toBeInTheDocument();
    });

    it('steps the weekly grid back and forth', async () => {
        const { calls } = mockApi({ ...signedIn(), 'GET /api/habits': { body: habits } });

        renderApp('/routines');
        await userEvent.click(await screen.findByRole('button', { name: 'Previous week' }));

        await waitFor(() =>
            expect(
                calls.some(
                    (call) =>
                        call.path === '/api/habits' &&
                        (call.query.get('to') ?? '9999') < week.start,
                ),
            ).toBe(true),
        );
    });

    it('draws the month as a wheel, with the same counts in words', async () => {
        const days = Number(month.end.slice(-2));
        mockApi({
            ...signedIn(),
            'GET /api/habits': {
                body: [
                    habit({
                        checks: [
                            { date: month.start, done: true },
                            { date: `${month.key}-02`, done: true },
                        ],
                    }),
                ],
            },
        });

        renderApp('/routines');
        const wheel = await screen.findByRole('img', { name: /^Habit wheel for/ });

        // One segment per day, two of them filled.
        expect(wheel.querySelectorAll('.radial-segment')).toHaveLength(days);
        expect(wheel.querySelectorAll('.radial-segment.is-done')).toHaveLength(2);
        expect(screen.getByText(`2 of ${days} days`)).toBeInTheDocument();
    });

    it('invites a first habit when there are none', async () => {
        mockApi(signedIn());

        renderApp('/routines');

        expect(
            await screen.findByText(/Add a habit and its month will fill in here/),
        ).toBeInTheDocument();
        expect(screen.getAllByText('No habits here yet.')).toHaveLength(3);
    });

    it('shows the habit wheel on the Month view', async () => {
        mockApi({ ...signedIn(), 'GET /api/habits': { body: [habit()] } });

        renderApp('/month/2027-01');

        const card = within(await region('Habits this month'));
        expect(
            await card.findByRole('img', { name: 'Habit wheel for January 2027' }),
        ).toBeInTheDocument();
        expect(card.getByText('0 of 31 days')).toBeInTheDocument();
    });
});
