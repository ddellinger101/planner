import { createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeItem, mockApi, renderApp, signedIn } from '@/test/helpers';

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

const region = (name: string | RegExp) => screen.findByRole('region', { name });

const goal = (overrides = {}) =>
    makeItem({
        scope: 'week',
        period_key: '2027-W01',
        due_date: null,
        assignee_user_id: null,
        ...overrides,
    });

describe('week', () => {
    // Goals are fetched by period, day tasks by date range.
    const weekApi = (
        tasks = [makeItem()],
        goals = [goal({ id: 50, title: 'Run three times' })],
    ) => ({
        ...signedIn(),
        'GET /api/items': ({ url }: { url: URL }) => ({
            body: url.searchParams.has('period_key') ? goals : tasks,
        }),
    });

    it('shows the week’s goals and each day’s tasks', async () => {
        const { calls } = mockApi(
            weekApi([
                makeItem({ id: 1, title: 'Gym' }),
                makeItem({
                    id: 2,
                    title: 'Dentist',
                    period_key: '2027-01-06',
                    due_date: '2027-01-06',
                    due_time: '15:30',
                }),
                makeItem({ id: 3, title: 'Make the bed', routine: 'morning' }),
            ]),
        );

        renderApp('/week/2027-W01');

        expect(
            await within(await region('Health')).findByRole('checkbox', {
                name: 'Run three times',
            }),
        ).toBeInTheDocument();
        expect(
            await within(await region('Monday')).findByRole('checkbox', { name: 'Gym' }),
        ).toBeInTheDocument();
        expect(within(await region('Wednesday')).getByText('3:30 PM')).toBeInTheDocument();
        // Routine tasks belong to the routine grid, not the day columns.
        expect(
            within(await region('Monday')).queryByRole('checkbox', { name: 'Make the bed' }),
        ).not.toBeInTheDocument();

        const range = calls.find((call) => call.path === '/api/items' && call.query.has('from'));
        expect([range?.query.get('from'), range?.query.get('to')]).toEqual([
            '2027-01-04',
            '2027-01-10',
        ]);
        expect(within(await region('Monday')).getByRole('link', { name: /Mon/ })).toHaveAttribute(
            'href',
            '/day/2027-01-04',
        );
    });

    it('moves a task to another day when it is dropped there', async () => {
        // The stub remembers the move, as the real server would.
        let task = makeItem({ id: 9, title: 'Gym' });
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/items': ({ url }: { url: URL }) => ({
                body: url.searchParams.has('period_key') ? [] : [task],
            }),
            'PATCH /api/items/9': ({ body }) => {
                const changes = body as { period_key: string };
                task = { ...task, ...changes, due_date: changes.period_key };
                return { body: task };
            },
        });

        renderApp('/week/2027-W01');
        await within(await region('Monday')).findByRole('checkbox', { name: 'Gym' });

        const thursday = await region('Thursday');
        const drop = createEvent.drop(thursday, {
            dataTransfer: { types: ['application/x-planner-item'], getData: () => '9' },
        });
        fireEvent(thursday, drop);

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
                period_key: '2027-01-07',
            }),
        );
        expect(await within(thursday).findByRole('checkbox', { name: 'Gym' })).toBeInTheDocument();
        expect(
            within(await region('Monday')).queryByRole('checkbox', { name: 'Gym' }),
        ).not.toBeInTheDocument();
    });

    it('adds a task straight into a day', async () => {
        const { calls } = mockApi({
            ...weekApi([]),
            'POST /api/items': ({ body }) => ({ status: 201, body: makeItem(body as object) }),
        });

        renderApp('/week/2027-W01');
        await userEvent.type(
            await screen.findByRole('textbox', { name: 'Add a task on Friday' }),
            'Grocery run{Enter}',
        );

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                title: 'Grocery run',
                category_id: 3, // Other, until it's edited
                scope: 'day',
                period_key: '2027-01-08',
            }),
        );
    });

    it('saves the best part of the week', async () => {
        const { calls } = mockApi({
            ...weekApi(),
            'PUT /api/journal/2027-W01/best_part': ({ body }) => ({ body }),
        });

        renderApp('/week/2027-W01');
        const field = await screen.findByLabelText('Best part about this week');
        await waitFor(() => expect(field).toBeEnabled());
        await userEvent.type(field, 'The hike{Enter}');

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ body: 'The hike' }),
        );
    });

    it('sets a weight goal in the Health box', async () => {
        const { calls } = mockApi({
            ...weekApi(),
            'PUT /api/weight/goals/2027-W01': ({ body }) => ({ body }),
        });

        renderApp('/week/2027-W01');
        const field = within(await region('Health')).getByLabelText('Weight goal');
        await waitFor(() => expect(field).toBeEnabled());
        await userEvent.type(field, '180{Enter}');

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
                target_weight: 180,
            }),
        );
    });

    it('lists the week’s meals and points empty days at Chef', async () => {
        mockApi({
            ...weekApi(),
            'GET /api/meals': {
                body: [
                    {
                        id: 1,
                        date: '2027-01-05',
                        slot: 'dinner',
                        title: 'Tacos',
                        description: null,
                        chef_url: null,
                    },
                ],
            },
        });

        renderApp('/week/2027-W01');
        const meals = within(await region('Meal plan'));

        expect((await meals.findByText('Tacos')).closest('div')).toHaveTextContent('Tue');
        expect(meals.getAllByRole('link', { name: 'Plan in Chef' })).toHaveLength(6);
    });

    it('lines routines up in a grid and checks them off by day', async () => {
        const { calls } = mockApi({
            ...weekApi([
                makeItem({
                    id: 11,
                    title: 'Make the bed',
                    routine: 'morning',
                    recurrence_parent_id: 10,
                }),
                makeItem({
                    id: 12,
                    title: 'Make the bed',
                    routine: 'morning',
                    recurrence_parent_id: 10,
                    period_key: '2027-01-05',
                    due_date: '2027-01-05',
                    status: 'done',
                }),
            ]),
            'GET /api/habits': {
                body: [
                    {
                        id: 4,
                        user_id: 1,
                        title: 'Floss',
                        category_id: 1,
                        icon: null,
                        color: null,
                        routine: 'evening',
                        checks: [{ date: '2027-01-04', done: true }],
                    },
                ],
            },
            'PUT /api/habits/4/checks/2027-01-06': ({ body }) => ({ body }),
            'PATCH /api/items/11': ({ body }) => ({
                body: makeItem({ id: 11, ...(body as object) }),
            }),
        });

        renderApp('/week/2027-W01');
        const grid = within(await region('Routines this week'));

        // One row for the repeating task, however many days it covers.
        expect(await grid.findAllByRole('rowheader', { name: 'Make the bed' })).toHaveLength(1);
        expect(grid.getByRole('checkbox', { name: 'Make the bed, Tuesday' })).toBeChecked();
        expect(
            grid.queryByRole('checkbox', { name: 'Make the bed, Wednesday' }),
        ).not.toBeInTheDocument();
        expect(grid.getByRole('checkbox', { name: 'Floss, Monday' })).toBeChecked();

        await userEvent.click(grid.getByRole('checkbox', { name: 'Floss, Wednesday' }));
        await waitFor(() =>
            expect(
                calls.find((call) => call.path === '/api/habits/4/checks/2027-01-06')?.body,
            ).toEqual({ done: true }),
        );

        await userEvent.click(grid.getByRole('checkbox', { name: 'Make the bed, Monday' }));
        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ status: 'done' }),
        );
    });
});

describe('month', () => {
    const dates = [
        {
            id: 1,
            title: 'Anniversary',
            date: '2019-01-12',
            repeats_yearly: true,
            category_id: null,
            occurs_on: '2027-01-12',
        },
        {
            id: 2,
            title: 'From next month',
            date: '2027-02-03',
            repeats_yearly: false,
            category_id: null,
            occurs_on: '2027-02-03',
        },
    ];

    const monthApi = () => ({
        ...signedIn(),
        'GET /api/items': ({ url }: { url: URL }) => ({
            body: url.searchParams.has('period_key')
                ? [
                      goal({ id: 60, scope: 'month', period_key: '2027-01', status: 'done' }),
                      goal({ id: 61, scope: 'month', period_key: '2027-01', title: 'Second' }),
                      goal({
                          id: 62,
                          scope: 'month',
                          period_key: '2027-01',
                          title: 'Dropped',
                          status: 'dropped',
                      }),
                  ]
                : [
                      makeItem({ id: 1, status: 'done' }),
                      makeItem({ id: 2, title: 'Stretch' }),
                      makeItem({ id: 3, title: 'Skipped', status: 'dropped' }),
                  ],
        }),
        'GET /api/important-dates': { body: dates },
    });

    it('draws whole weeks and summarises each day', async () => {
        const { calls } = mockApi(monthApi());

        renderApp('/month/2027-01');

        const busy = await screen.findByRole('link', {
            name: 'Monday, January 4, 2027, 1 of 2 tasks done',
        });
        expect(busy).toHaveAttribute('href', '/day/2027-01-04');
        expect(
            screen.getByRole('link', { name: 'Tuesday, January 12, 2027, no tasks, Anniversary' }),
        ).toBeInTheDocument();
        // January 2027 starts on a Friday, so the grid opens on Monday, December 28.
        expect(screen.getByRole('link', { name: /Monday, December 28, 2026/ })).toHaveClass(
            'is-outside',
        );

        const range = calls.find((call) => call.path === '/api/important-dates');
        expect([range?.query.get('from'), range?.query.get('to')]).toEqual([
            '2026-12-28',
            '2027-01-31',
        ]);
    });

    it('shows goal progress per category, leaving out dropped goals', async () => {
        mockApi(monthApi());

        renderApp('/month/2027-01');
        const progress = within(await region('Goal progress'));

        expect((await progress.findByText('Health')).closest('.completion')).toHaveTextContent(
            '1 of 2',
        );
        expect(progress.getByText('Other').closest('.completion')).toHaveTextContent('No goals');
    });

    it('lists only this month’s important dates, and adds one', async () => {
        const { calls } = mockApi({
            ...monthApi(),
            'POST /api/important-dates': ({ body }) => ({ status: 201, body }),
        });

        renderApp('/month/2027-01');
        const card = within(await region('Important dates'));

        expect(await card.findByText('Tuesday, Jan 12')).toBeInTheDocument();
        expect(card.getByText('Repeats every year')).toBeInTheDocument();
        expect(card.queryByText('From next month')).not.toBeInTheDocument();
        expect(card.getByRole('button', { name: 'Add' })).toBeDisabled();

        await userEvent.type(card.getByLabelText('What is it?'), 'Recital');
        fireEvent.change(card.getByLabelText('Date'), { target: { value: '2027-01-20' } });
        await userEvent.click(card.getByLabelText('Every year'));
        await userEvent.click(card.getByRole('button', { name: 'Add' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                title: 'Recital',
                date: '2027-01-20',
                repeats_yearly: true,
            }),
        );
        await waitFor(() => expect(card.getByLabelText('What is it?')).toHaveValue(''));
    });

    it('edits and deletes an important date', async () => {
        const { calls } = mockApi({
            ...monthApi(),
            'PATCH /api/important-dates/1': ({ body }) => ({ body }),
            'DELETE /api/important-dates/1': { status: 204 },
        });

        renderApp('/month/2027-01');
        const card = within(await region('Important dates'));

        await userEvent.click(await card.findByRole('button', { name: 'Edit Anniversary' }));
        // Editing works on the date it was set for, not this year's occurrence.
        expect(card.getByLabelText('Date')).toHaveValue('2019-01-12');
        expect(card.getByLabelText('Every year')).toBeChecked();

        await userEvent.type(card.getByLabelText('What is it?'), ' (10th)');
        await userEvent.click(card.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
                title: 'Anniversary (10th)',
                date: '2019-01-12',
                repeats_yearly: true,
            }),
        );

        await userEvent.click(card.getByRole('button', { name: 'Delete Anniversary' }));
        await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
    });
});

describe('quarter and year', () => {
    it('shows each month of the quarter with its goal completion', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/items/summary': {
                body: [
                    { period_key: '2027-01', category_id: 1, total: 2, done: 1 },
                    { period_key: '2027-01', category_id: 2, total: 1, done: 1 },
                    { period_key: '2027-03', category_id: 1, total: 4, done: 0 },
                ],
            },
        });

        renderApp('/quarter/2027-Q1');

        const january = within(await region('January'));
        expect(await january.findByText('2 of 3')).toBeInTheDocument();
        expect(january.getByRole('link', { name: 'January' })).toHaveAttribute(
            'href',
            '/month/2027-01',
        );
        expect(within(await region('February')).getByText('No goals')).toBeInTheDocument();
        expect(within(await region('March')).getByText('0 of 4')).toBeInTheDocument();
        // A small calendar: only the month's own days.
        expect(january.getAllByRole('link', { name: /January \d+, 2027/ })).toHaveLength(31);

        const summary = calls.find((call) => call.path === '/api/items/summary');
        expect(summary?.query.getAll('period_keys[]')).toEqual(['2027-01', '2027-02', '2027-03']);
    });

    it('shows the four quarters of the year', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/items/summary': {
                body: [{ period_key: '2027-Q2', category_id: 1, total: 5, done: 2 }],
            },
        });

        renderApp('/year/2027');

        const second = within(await region('Quarter 2'));
        expect(await second.findByText('2 of 5')).toBeInTheDocument();
        expect(second.getByText('April – June')).toBeInTheDocument();
        expect(second.getByRole('link', { name: 'Quarter 2' })).toHaveAttribute(
            'href',
            '/quarter/2027-Q2',
        );
        expect(second.getByRole('link', { name: 'May' })).toHaveAttribute('href', '/month/2027-05');

        expect(
            calls.find((call) => call.path === '/api/items/summary')?.query.getAll('period_keys[]'),
        ).toEqual(['2027-Q1', '2027-Q2', '2027-Q3', '2027-Q4']);
    });

    it('recounts goals after one is checked off', async () => {
        let goals = [goal({ id: 70, scope: 'year', period_key: '2027', title: 'Family trip' })];
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/items': () => ({ body: goals }),
            'PATCH /api/items/70': ({ body }) => {
                goals = [{ ...goals[0], ...(body as object) }];
                return { body: goals[0] };
            },
        });

        renderApp('/year/2027');
        await userEvent.click(
            await within(await region('Health')).findByRole('checkbox', { name: 'Family trip' }),
        );

        await waitFor(() =>
            expect(
                calls.filter((call) => call.path === '/api/items/summary').length,
            ).toBeGreaterThan(1),
        );
    });
});

describe('day', () => {
    it('shows the day’s important dates as chips', async () => {
        mockApi({
            ...signedIn(),
            'GET /api/important-dates': {
                body: [
                    {
                        id: 1,
                        title: 'Anniversary',
                        date: '2019-01-04',
                        repeats_yearly: true,
                        category_id: null,
                        occurs_on: '2027-01-04',
                    },
                ],
            },
        });

        renderApp('/day/2027-01-04');

        expect(
            await within(await screen.findByRole('list', { name: 'Important dates' })).findByText(
                'Anniversary',
            ),
        ).toBeInTheDocument();
    });
});
