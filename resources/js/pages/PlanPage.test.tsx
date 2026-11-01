import { createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Item } from '@/api/items';
import { todayPeriod } from '@/lib/period';
import { makeItem, mockApi, renderApp, signedIn } from '@/test/helpers';

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

const goal = (overrides: Partial<Item> = {}) =>
    makeItem({
        scope: 'week',
        period_key: '2027-W01',
        due_date: null,
        assignee_user_id: null,
        ...overrides,
    });

/** Items by period key; anything asked for by date range gets `tasks`. */
const itemsApi = (byPeriod: Record<string, Item[]>, tasks: Item[] = []) => ({
    'GET /api/items': ({ url }: { url: URL }) => ({
        body: url.searchParams.has('period_key')
            ? (byPeriod[url.searchParams.get('period_key')!] ?? [])
            : tasks,
    }),
});

const goToStep = async (name: string) =>
    userEvent.click(await screen.findByRole('button', { name: new RegExp(`\\d${name}$`) }));

describe('rollover review', () => {
    const month = todayPeriod('month', 'America/New_York');
    const pending = [
        { period_key: '2026-12', scope: 'month', open_count: 2, next_period_key: '2027-01' },
        { period_key: '2026-W53', scope: 'week', open_count: 1, next_period_key: '2027-W01' },
    ];
    const leftovers = [
        makeItem({
            id: 41,
            title: 'Paint the hallway',
            scope: 'month',
            period_key: '2026-12',
            due_date: null,
        }),
        makeItem({
            id: 42,
            title: 'File the claim',
            scope: 'month',
            period_key: '2026-12',
            due_date: null,
            category_id: 3,
        }),
    ];

    it('opens by itself once, then waits behind the banner', async () => {
        mockApi({ ...signedIn(), 'GET /api/reviews/pending': { body: pending } });

        const { unmount } = renderApp('/day/2027-01-04');
        const dialog = await screen.findByRole('dialog', { name: 'Review December 2026' });
        expect(within(dialog).getByText('Step 1 of 2')).toBeInTheDocument();

        await userEvent.click(within(dialog).getByRole('button', { name: 'Later' }));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        unmount();

        // Same pending periods on the next visit: no interruption this time.
        renderApp('/day/2027-01-04');
        await screen.findByRole('region', { name: 'Schedule' });
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('finishes, carries forward and drops what is left, then records the review', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            ...itemsApi({ '2026-12': leftovers }),
            'GET /api/reviews/pending': { body: [pending[0]] },
            'PATCH /api/items/41': ({ body }) => ({
                body: { ...leftovers[0], ...(body as object) },
            }),
            'POST /api/items/42/carry': ({ body }) => ({
                status: 201,
                body: { ...leftovers[1], ...(body as object) },
            }),
            'POST /api/reviews': ({ body }) => ({ status: 201, body }),
        });

        renderApp('/settings');
        const dialog = within(await screen.findByRole('dialog', { name: 'Review December 2026' }));

        expect(await dialog.findByText(/2 items are still open/)).toBeInTheDocument();
        expect(dialog.getByLabelText('Best part about December 2026')).toBeInTheDocument();

        await userEvent.click(
            within(dialog.getByRole('group', { name: 'Paint the hallway' })).getByRole('button', {
                name: 'Done',
            }),
        );
        await waitFor(() =>
            expect(calls.find((call) => call.path === '/api/items/41')?.body).toEqual({
                status: 'done',
            }),
        );

        await userEvent.click(
            within(dialog.getByRole('group', { name: 'File the claim' })).getByRole('button', {
                name: 'Carry forward',
            }),
        );
        await waitFor(() =>
            expect(calls.find((call) => call.path === '/api/items/42/carry')?.body).toEqual({
                period_key: '2027-01',
            }),
        );

        await userEvent.click(dialog.getByRole('button', { name: 'Done with review' }));
        await waitFor(() =>
            expect(calls.find((call) => call.path === '/api/reviews')?.body).toEqual({
                period_key: '2026-12',
            }),
        );
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('carries everything forward at once', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            ...itemsApi({ '2026-12': leftovers }),
            'GET /api/reviews/pending': { body: [pending[0]] },
            'POST /api/items/41/carry': { status: 201, body: leftovers[0] },
            'POST /api/items/42/carry': { status: 201, body: leftovers[1] },
        });

        renderApp('/settings');
        const dialog = within(await screen.findByRole('dialog', { name: 'Review December 2026' }));
        await userEvent.click(await dialog.findByRole('button', { name: 'Carry all 2 forward' }));

        await waitFor(() =>
            expect(
                calls.filter((call) => call.path.endsWith('/carry')).map((call) => call.path),
            ).toEqual(['/api/items/41/carry', '/api/items/42/carry']),
        );
    });

    it('shows a banner on the period that follows, which reopens the review there', async () => {
        window.localStorage.setItem('planner.review.prompted', `${month.key}-x`);
        const previous = {
            period_key: '2026-12',
            scope: 'month',
            open_count: 2,
            next_period_key: '2027-01',
        };
        // Already prompted for exactly this set, so nothing opens by itself.
        window.localStorage.setItem('planner.review.prompted', '2026-12');
        mockApi({ ...signedIn(), 'GET /api/reviews/pending': { body: [previous] } });

        renderApp('/month/2027-01');
        const banner = await screen.findByRole('status');

        expect(banner).toHaveTextContent('2 items are still open from December 2026.');
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

        await userEvent.click(within(banner).getByRole('button', { name: 'Review December 2026' }));
        expect(
            await screen.findByRole('dialog', { name: 'Review December 2026' }),
        ).toBeInTheDocument();
    });

    it('shows no banner on other periods', async () => {
        window.localStorage.setItem('planner.review.prompted', '2026-12');
        mockApi({
            ...signedIn(),
            'GET /api/reviews/pending': { body: [pending[0]] },
        });

        renderApp('/month/2027-03');
        await screen.findByRole('heading', { level: 1, name: 'March' });
        await screen.findByRole('region', { name: 'Health' });

        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
});

describe('planning a week', () => {
    it('is reached from the Week view and walks through seven steps', async () => {
        mockApi(signedIn());

        renderApp('/week/2027-W01');
        await userEvent.click(await screen.findByRole('link', { name: 'Plan Week 1' }));

        expect(
            await screen.findByRole('heading', { level: 1, name: 'Plan Week 1' }),
        ).toBeInTheDocument();
        const steps = within(screen.getByRole('list', { name: 'Planning steps' })).getAllByRole(
            'button',
        );
        expect(steps.map((step) => step.textContent)).toEqual([
            '1Capture',
            '2Review',
            '3Pull',
            '4Big 3',
            '5Place',
            '6Meals',
            '7Done',
        ]);
        expect(steps[0]).toHaveAttribute('aria-current', 'step');
        expect(screen.getByRole('button', { name: /Back/ })).toBeDisabled();

        await userEvent.click(screen.getByRole('button', { name: /Next/ }));
        expect(
            await screen.findByRole('heading', { name: 'Look back at Week 53' }),
        ).toBeInTheDocument();
        // The Week tab stays highlighted while planning.
        expect(
            within(screen.getAllByRole('navigation', { name: 'Main' })[0]).getByRole('link', {
                name: 'Week',
            }),
        ).toHaveAttribute('aria-current', 'page');
    });

    it('captures thoughts on the Brain Dump board, right in the first step', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/brain-dump': {
                body: {
                    items: [{ id: 5, bucket: 'call', title: 'Call the vet', notes: null }],
                    assigned_this_week: 0,
                },
            },
            'POST /api/brain-dump': ({ body }) => ({
                status: 201,
                body: { id: 6, notes: null, ...(body as object) },
            }),
        });

        renderApp('/plan/2027-W01');
        expect(await screen.findByText('Call the vet')).toBeInTheDocument();

        await userEvent.type(
            screen.getByRole('textbox', { name: 'Add to Buy' }),
            'Order filters{Enter}',
        );

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                bucket: 'buy',
                title: 'Order filters',
            }),
        );
        // Anything captured can be given a day without leaving the flow.
        expect(
            screen.getByRole('button', { name: 'Add Call the vet to plan' }),
        ).toBeInTheDocument();
    });

    it('reviews last week with this week as the destination', async () => {
        const leftover = goal({ id: 31, title: 'Clean the garage', period_key: '2026-W53' });
        const { calls } = mockApi({
            ...signedIn(),
            ...itemsApi({ '2026-W53': [leftover] }),
            'POST /api/items/31/carry': { status: 201, body: leftover },
        });

        renderApp('/plan/2027-W01');
        await goToStep('Review');
        await userEvent.click(await screen.findByRole('button', { name: 'Carry forward' }));

        await waitFor(() =>
            expect(calls.find((call) => call.path === '/api/items/31/carry')?.body).toEqual({
                period_key: '2027-W01',
            }),
        );
    });

    it('pulls monthly goals into the week, from both months when the week straddles', async () => {
        const january = makeItem({
            id: 61,
            title: 'Run a 10k',
            scope: 'month',
            period_key: '2026-01',
            due_date: null,
            starred: true,
            assignee_user_id: 2,
        });
        const february = makeItem({
            id: 62,
            title: 'Do the taxes',
            scope: 'month',
            period_key: '2026-02',
            due_date: null,
            category_id: 3,
        });
        const already = goal({
            id: 71,
            title: 'Do the taxes',
            period_key: '2026-W05',
            parent_item_id: 62,
        });
        const { calls } = mockApi({
            ...signedIn(),
            ...itemsApi({ '2026-01': [january], '2026-02': [february], '2026-W05': [already] }),
            'POST /api/items': ({ body }) => ({ status: 201, body: goal(body as object) }),
        });

        // Week 5 of 2026 runs January 26 to February 1.
        renderApp('/plan/2026-W05');
        await goToStep('Pull');

        const first = within(await screen.findByRole('region', { name: 'January goals' }));
        const second = within(screen.getByRole('region', { name: 'February goals' }));
        // Already pulled in, so it can't be added twice.
        expect(await second.findByRole('button', { name: 'In Week 5' })).toBeDisabled();

        await userEvent.click(await first.findByRole('button', { name: 'Add to Week 5' }));
        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                title: 'Run a 10k',
                category_id: 1,
                scope: 'week',
                period_key: '2026-W05',
                parent_item_id: 61,
                starred: true,
                assignee_user_id: 2,
            }),
        );
    });

    it('limits the Big 3 to three stars', async () => {
        // The stub remembers the star, as the real server would.
        let goals = [1, 2, 3, 4].map((n) => goal({ id: n, title: `Goal ${n}`, starred: n <= 2 }));
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/items': () => ({ body: goals }),
            'PATCH /api/items/3': ({ body }) => {
                goals = goals.map((entry) =>
                    entry.id === 3 ? { ...entry, ...(body as object) } : entry,
                );
                return { body: goals[2] };
            },
        });

        renderApp('/plan/2027-W01');
        await goToStep('Big 3');

        expect(await screen.findByText('2 of 3 chosen')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Star Goal 3' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ starred: true }),
        );
        expect(await screen.findByText('3 of 3 chosen')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Star Goal 4' })).toBeDisabled();
        // One of the three can still be given up.
        expect(screen.getByRole('button', { name: 'Star Goal 1' })).toBeEnabled();
    });

    it('places a goal on a day from its menu or by dragging it there', async () => {
        const run = goal({ id: 80, title: 'Run three times' });
        const { calls } = mockApi({
            ...signedIn(),
            ...itemsApi({ '2027-W01': [run] }, [
                makeItem({
                    id: 90,
                    title: 'Run three times',
                    parent_item_id: 80,
                    period_key: '2027-01-05',
                    due_date: '2027-01-05',
                }),
            ]),
            'POST /api/items': ({ body }) => ({ status: 201, body: makeItem(body as object) }),
        });

        renderApp('/plan/2027-W01');
        await goToStep('Place');

        const row = within(await screen.findByRole('list', { name: 'Goals to place' }));
        // It already has a task on Tuesday.
        expect(await row.findByText('Tue')).toBeInTheDocument();

        await userEvent.selectOptions(row.getByLabelText('Day for Run three times'), '2027-01-07');
        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                title: 'Run three times',
                category_id: 1,
                scope: 'day',
                period_key: '2027-01-07',
                parent_item_id: 80,
                assignee_user_id: 1, // a goal for both becomes the planner's task
            }),
        );

        const saturday = screen.getByRole('region', { name: 'Saturday' });
        fireEvent(
            saturday,
            createEvent.drop(saturday, {
                dataTransfer: { types: ['application/x-planner-item'], getData: () => '80' },
            }),
        );
        await waitFor(() =>
            expect(calls.filter((call) => call.method === 'POST').at(-1)?.body).toMatchObject({
                period_key: '2027-01-09',
                parent_item_id: 80,
            }),
        );
    });

    it('shows the week’s meals, looks again on return to the tab, and sums up', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            ...itemsApi(
                {
                    '2027-W01': [
                        goal({ id: 1, title: 'Run three times', starred: true }),
                        goal({ id: 2, title: 'Dropped', status: 'dropped' }),
                    ],
                },
                [
                    makeItem({ id: 90 }),
                    makeItem({ id: 91, title: 'Make the bed', routine: 'morning' }),
                ],
            ),
        });

        renderApp('/plan/2027-W01');
        await goToStep('Meals');

        expect(await screen.findByRole('link', { name: 'Plan meals in Chef' })).toHaveAttribute(
            'href',
            'https://chef.dustindellinger.com',
        );
        const before = calls.filter((call) => call.path === '/api/meals').length;
        fireEvent(document, new Event('visibilitychange'));
        await waitFor(() =>
            expect(calls.filter((call) => call.path === '/api/meals').length).toBeGreaterThan(
                before,
            ),
        );

        await goToStep('Done');
        const summary = (await screen.findByText('Goals')).closest('dl')!;
        // One live goal; one task on the calendar, not counting routines.
        expect(summary).toHaveTextContent('Goals1');
        expect(summary).toHaveTextContent('Tasks on the calendar1');
        expect(screen.getByRole('heading', { name: 'Your Big 1' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Open the week' })).toHaveAttribute(
            'href',
            '/week/2027-W01',
        );
    });

    it('rejects a day, or a key that isn’t a period', async () => {
        mockApi(signedIn());

        const { unmount } = renderApp('/plan/2027-01-04');
        expect(
            await screen.findByRole('heading', { name: 'There’s nothing to plan here' }),
        ).toBeInTheDocument();
        unmount();

        renderApp('/plan/soon');
        expect(
            await screen.findByRole('heading', { name: 'There’s nothing to plan here' }),
        ).toBeInTheDocument();
    });
});

describe('what the Plan button plans', () => {
    // Sunday, November 29 2026: last day of Week 48, near the end of the month.
    const sunday = new Date('2026-11-29T13:30:00-05:00');

    const onSunday = async (run: () => Promise<void>) => {
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(sunday);

        try {
            await run();
        } finally {
            vi.useRealTimers();
        }
    };

    it.each([
        ['/week/2026-W48', 'Plan next week', 'Plan Week 49', 'Week'],
        ['/month/2026-11', 'Plan next month', 'Plan December', 'Month'],
        ['/quarter/2026-Q4', 'Plan next quarter', 'Plan Quarter 1', 'Quarter'],
        ['/year/2026', 'Plan next year', 'Plan 2027', 'Year'],
    ])('from %s, opens the following period', async (path, label, heading, tab) => {
        mockApi(signedIn());

        await onSunday(async () => {
            renderApp(path);
            await userEvent.click(await screen.findByRole('link', { name: label }));

            expect(
                await screen.findByRole('heading', { level: 1, name: heading }),
            ).toBeInTheDocument();
            // The period's own tab stays highlighted while planning.
            expect(
                within(screen.getAllByRole('navigation', { name: 'Main' })[0]).getByRole('link', {
                    name: tab,
                }),
            ).toHaveAttribute('aria-current', 'page');
        });
    });

    it('offers no way to plan a period that is over', async () => {
        mockApi(signedIn());

        await onSunday(async () => {
            renderApp('/month/2026-10');
            await screen.findByRole('region', { name: 'Health' });

            expect(screen.queryByRole('link', { name: /^Plan / })).not.toBeInTheDocument();
        });
    });

    it.each([
        ['/plan/2026-W49', 'Week to plan', '2026-W48', 'Plan Week 48'],
        ['/plan/2026-12', 'Month to plan', '2026-11', 'Plan November'],
        ['/plan/2027-Q1', 'Quarter to plan', '2026-Q4', 'Plan Quarter 4'],
        ['/plan/2027', 'Year to plan', '2026', 'Plan 2026'],
    ])('from %s, the "%s" menu reaches the period under way', async (path, menu, key, heading) => {
        mockApi(signedIn());

        await onSunday(async () => {
            renderApp(path);
            await goToStep('Review');
            await userEvent.selectOptions(await screen.findByLabelText(menu), key);

            expect(
                await screen.findByRole('heading', { level: 1, name: heading }),
            ).toBeInTheDocument();
            expect(screen.getByLabelText(menu)).toHaveValue(key);
            // A different period starts from the first step again.
            expect(screen.getByRole('button', { name: '1Capture' })).toHaveAttribute(
                'aria-current',
                'step',
            );
        });
    });

    it('offers the period under way and those ahead, and says which is which', async () => {
        mockApi(signedIn());

        await onSunday(async () => {
            renderApp('/plan/2026-12');

            const options = within(await screen.findByLabelText('Month to plan')).getAllByRole(
                'option',
            ) as HTMLOptionElement[];

            expect(options.slice(0, 3).map((option) => option.text)).toEqual([
                'This month: November 2026',
                'Next month: December 2026',
                'January 2027',
            ]);
            expect(options.find((option) => option.selected)?.value).toBe('2026-12');
        });
    });

    it('still shows a period outside the usual choices as the one being planned', async () => {
        mockApi(signedIn());

        await onSunday(async () => {
            renderApp('/plan/2026-10');

            expect(await screen.findByLabelText('Month to plan')).toHaveValue('2026-10');
        });
    });
});

describe('planning a month, quarter or year', () => {
    const stepNames = () =>
        within(screen.getByRole('list', { name: 'Planning steps' }))
            .getAllByRole('button')
            .map((step) => step.textContent);

    const bigGoal = (overrides: Partial<Item>) =>
        makeItem({ due_date: null, assignee_user_id: null, ...overrides });

    it.each([
        [
            '/plan/2027-02',
            'Plan February',
            ['1Capture', '2Review', '3Pull', '4Big 3', '5Place', '6Dates', '7Done'],
        ],
        [
            '/plan/2027-Q2',
            'Plan Quarter 2',
            ['1Capture', '2Review', '3Pull', '4Big 3', '5Place', '6Done'],
        ],
        ['/plan/2027', 'Plan 2027', ['1Capture', '2Review', '3Goals', '4Big 3', '5Place', '6Done']],
    ])('%s has its own steps', async (path, heading, steps) => {
        mockApi(signedIn());

        renderApp(path);

        expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeInTheDocument();
        expect(stepNames()).toEqual(steps);
    });

    it('reviews the month before, carrying into the month being planned', async () => {
        const leftover = bigGoal({ id: 31, title: 'Paint', scope: 'month', period_key: '2027-01' });
        const { calls } = mockApi({
            ...signedIn(),
            ...itemsApi({ '2027-01': [leftover] }),
            'POST /api/items/31/carry': { status: 201, body: leftover },
        });

        renderApp('/plan/2027-02');
        await goToStep('Review');
        expect(
            await screen.findByRole('heading', { name: 'Look back at January 2027' }),
        ).toBeInTheDocument();
        await userEvent.click(await screen.findByRole('button', { name: 'Carry forward' }));

        await waitFor(() =>
            expect(calls.find((call) => call.path === '/api/items/31/carry')?.body).toEqual({
                period_key: '2027-02',
            }),
        );
    });

    it('pulls a month’s goals from its quarter, and a quarter’s from its year', async () => {
        const quarterGoal = bigGoal({
            id: 61,
            title: 'Run a 10k',
            scope: 'quarter',
            period_key: '2027-Q1',
            assignee_user_id: 2,
        });
        const yearGoal = bigGoal({ id: 62, title: 'Save more', scope: 'year', period_key: '2027' });
        const { calls } = mockApi({
            ...signedIn(),
            ...itemsApi({ '2027-Q1': [quarterGoal], '2027': [yearGoal] }),
            'POST /api/items': ({ body }) => ({ status: 201, body: makeItem(body as object) }),
        });

        const { unmount } = renderApp('/plan/2027-02');
        await goToStep('Pull');
        await userEvent.click(await screen.findByRole('button', { name: 'Add to February 2027' }));
        await waitFor(() =>
            expect(calls.filter((call) => call.method === 'POST').at(-1)?.body).toEqual({
                title: 'Run a 10k',
                category_id: 1,
                scope: 'month',
                period_key: '2027-02',
                parent_item_id: 61,
                starred: false,
                assignee_user_id: 2,
            }),
        );
        unmount();

        renderApp('/plan/2027-Q1');
        await goToStep('Pull');
        await userEvent.click(await screen.findByRole('button', { name: 'Add to Quarter 1' }));
        await waitFor(() =>
            expect(calls.filter((call) => call.method === 'POST').at(-1)?.body).toMatchObject({
                scope: 'quarter',
                period_key: '2027-Q1',
                parent_item_id: 62,
            }),
        );
    });

    it('sets a year’s goals with nothing to pull from', async () => {
        mockApi(signedIn());

        renderApp('/plan/2027');
        await goToStep('Goals');

        expect(
            await screen.findByRole('heading', { name: 'Set the goals for 2027' }),
        ).toBeInTheDocument();
        expect(await screen.findByRole('region', { name: 'Health' })).toBeInTheDocument();
    });

    it('places a month’s goal in a week, by menu or by dragging, but only once', async () => {
        const monthGoal = bigGoal({
            id: 80,
            title: 'Fix the fence',
            scope: 'month',
            period_key: '2027-02',
        });
        const inWeek = bigGoal({
            id: 81,
            title: 'Fix the fence',
            scope: 'week',
            period_key: '2027-W05',
            parent_item_id: 80,
        });
        const { calls } = mockApi({
            ...signedIn(),
            ...itemsApi({ '2027-02': [monthGoal], '2027-W05': [inWeek] }),
            'POST /api/items': ({ body }) => ({ status: 201, body: makeItem(body as object) }),
        });

        renderApp('/plan/2027-02');
        await goToStep('Place');
        expect(await screen.findByRole('heading', { name: 'Give it a week' })).toBeInTheDocument();

        const row = within(await screen.findByRole('list', { name: 'Goals to place' }));
        expect(await row.findByText('Week 5')).toBeInTheDocument();
        // It shows in its week's card as well.
        const placedWeek = within(screen.getByRole('region', { name: 'Week 5' }));
        expect(placedWeek.getByText('Fix the fence')).toBeInTheDocument();

        await userEvent.selectOptions(row.getByLabelText('Week for Fix the fence'), '2027-W06');
        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                title: 'Fix the fence',
                category_id: 1,
                scope: 'week',
                period_key: '2027-W06',
                parent_item_id: 80,
                assignee_user_id: null,
            }),
        );

        const drop = (name: string) => {
            const card = screen.getByRole('region', { name });
            fireEvent(
                card,
                createEvent.drop(card, {
                    dataTransfer: { types: ['application/x-planner-item'], getData: () => '80' },
                }),
            );
        };
        const posts = () => calls.filter((call) => call.method === 'POST');

        drop('Week 7');
        await waitFor(() => expect(posts().at(-1)?.body).toMatchObject({ period_key: '2027-W07' }));

        // Already in Week 5: nothing new.
        const before = posts().length;
        drop('Week 5');
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(posts()).toHaveLength(before);
    });

    it('offers a quarter’s months and a year’s quarters to place in', async () => {
        const quarterGoal = bigGoal({ id: 1, title: 'Q', scope: 'quarter', period_key: '2027-Q2' });
        const yearGoal = bigGoal({ id: 2, title: 'Y', scope: 'year', period_key: '2027' });
        mockApi({ ...signedIn(), ...itemsApi({ '2027-Q2': [quarterGoal], '2027': [yearGoal] }) });

        const optionsFor = async (label: string) =>
            within(await screen.findByLabelText(label))
                .getAllByRole('option')
                .map((option) => option.textContent);

        const { unmount } = renderApp('/plan/2027-Q2');
        await goToStep('Place');
        expect(await optionsFor('Month for Q')).toEqual([
            'Add to a month…',
            'April 2027',
            'May 2027',
            'June 2027',
        ]);
        unmount();

        renderApp('/plan/2027');
        await goToStep('Place');
        expect(await optionsFor('Quarter for Y')).toEqual([
            'Add to a quarter…',
            'Quarter 1 (January – March 2027)',
            'Quarter 2 (April – June 2027)',
            'Quarter 3 (July – September 2027)',
            'Quarter 4 (October – December 2027)',
        ]);
    });

    it('checks a month’s calendar and marks a date', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'POST /api/important-dates': ({ body }) => ({ status: 201, body }),
        });

        renderApp('/plan/2027-02');
        await goToStep('Dates');
        expect(
            await screen.findByRole('heading', { name: 'Check the calendar' }),
        ).toBeInTheDocument();

        await userEvent.type(screen.getByLabelText('What is it?'), 'Recital');
        fireEvent.change(screen.getByLabelText('Date'), { target: { value: '2027-02-14' } });
        await userEvent.click(screen.getByRole('button', { name: 'Add' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
                title: 'Recital',
                date: '2027-02-14',
            }),
        );
    });

    it('sums up, and links the reward to the period that was planned', async () => {
        const planned = bigGoal({
            id: 1,
            title: 'Run a 10k',
            scope: 'month',
            period_key: '2027-02',
            starred: true,
        });
        const unplaced = bigGoal({ id: 2, title: 'Read', scope: 'month', period_key: '2027-02' });
        mockApi({
            ...signedIn(),
            ...itemsApi({
                '2027-02': [planned, unplaced],
                '2027-W06': [
                    bigGoal({
                        id: 3,
                        scope: 'week',
                        period_key: '2027-W06',
                        parent_item_id: 1,
                    }),
                ],
            }),
        });

        renderApp('/plan/2027-02');
        await goToStep('Done');

        const summary = (await screen.findByText('Goals')).closest('dl')!;
        await waitFor(() => expect(summary).toHaveTextContent('Given a week1'));
        expect(summary).toHaveTextContent('Goals2');
        expect(screen.getByRole('link', { name: /Create a reward/ })).toHaveAttribute(
            'href',
            '/rewards?new=big3&period=2027-02',
        );
        expect(screen.getByRole('link', { name: 'Open the month' })).toHaveAttribute(
            'href',
            '/month/2027-02',
        );
    });

    it('starts a reward with the planned period’s Big 3, due when that period ends', async () => {
        mockApi({
            ...signedIn(),
            ...itemsApi({
                '2027-02': [
                    bigGoal({
                        id: 1,
                        title: 'Run a 10k',
                        scope: 'month',
                        period_key: '2027-02',
                        starred: true,
                    }),
                ],
            }),
        });

        renderApp('/rewards?new=big3&period=2027-02');
        const dialog = within(await screen.findByRole('dialog', { name: 'New reward' }));

        expect(await dialog.findByRole('checkbox', { name: 'Run a 10k' })).toBeChecked();
        expect(dialog.getByLabelText('Earn it by the end of')).toHaveValue('2027-02-28');
        expect(dialog.getByRole('button', { name: 'February 2027' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
    });
});

describe('finishing something pulled from a larger goal', () => {
    const parent = makeItem({
        id: 61,
        title: 'Run a 10k',
        scope: 'month',
        period_key: '2027-01',
        due_date: null,
    });
    const child = goal({ id: 71, title: 'Long run', parent_item_id: 61 });

    it('offers to finish the goal too', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            ...itemsApi({ '2027-W01': [child] }),
            'PATCH /api/items/71': ({ body }) => ({ body: { ...child, ...(body as object) } }),
            'GET /api/items/61': { body: parent },
            'PATCH /api/items/61': ({ body }) => ({ body: { ...parent, ...(body as object) } }),
        });

        renderApp('/week/2027-W01');
        await userEvent.click(
            await within(await screen.findByRole('region', { name: 'Health' })).findByRole(
                'checkbox',
                {
                    name: 'Long run',
                },
            ),
        );

        const prompt = await screen.findByText(/That was part of/);
        expect(prompt).toHaveTextContent('That was part of Run a 10k, a goal for January 2027.');

        await userEvent.click(screen.getByRole('button', { name: 'Mark it done' }));
        await waitFor(() =>
            expect(
                calls.find((call) => call.path === '/api/items/61' && call.method === 'PATCH')
                    ?.body,
            ).toEqual({
                status: 'done',
            }),
        );
        expect(screen.queryByText(/That was part of/)).not.toBeInTheDocument();
    });

    it('says nothing when the goal is already done, or when unchecking', async () => {
        let current = { ...child, status: 'done' as Item['status'] };
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/items': () => ({ body: [current] }),
            'PATCH /api/items/71': ({ body }) => {
                current = { ...current, ...(body as object) };
                return { body: current };
            },
            'GET /api/items/61': { body: { ...parent, status: 'done' } },
        });

        renderApp('/week/2027-W01');
        const box = within(await screen.findByRole('region', { name: 'Health' }));

        // Unchecking never asks.
        await userEvent.click(await box.findByRole('checkbox', { name: 'Long run' }));
        await waitFor(() =>
            expect(box.getByRole('checkbox', { name: 'Long run' })).not.toBeChecked(),
        );
        expect(calls.some((call) => call.path === '/api/items/61')).toBe(false);

        // Checking asks the server about the goal, which turns out to be done already.
        await userEvent.click(box.getByRole('checkbox', { name: 'Long run' }));
        await waitFor(() => expect(calls.some((call) => call.path === '/api/items/61')).toBe(true));
        await waitFor(() => expect(box.getByRole('checkbox', { name: 'Long run' })).toBeChecked());
        expect(screen.queryByText(/That was part of/)).not.toBeInTheDocument();
    });
});

describe('recognizing a goal that is already there', () => {
    const month = (id: number, title: string, overrides: Partial<Item> = {}) =>
        goal({ id, title, scope: 'month', period_key: '2026-12', ...overrides });
    const quarter = (id: number, title: string) =>
        goal({ id, title, scope: 'quarter', period_key: '2026-Q4' });

    it('shows a goal with the same title as pulled, and asks about one in other words', async () => {
        mockApi({
            ...signedIn(),
            ...itemsApi({
                '2026-Q4': [
                    quarter(1, 'Quit smoking'),
                    quarter(2, 'Cut the drinking'),
                    quarter(3, 'Run a 10k'),
                ],
                '2026-12': [month(10, 'quit smoking'), month(11, 'Drink less')],
            }),
        });

        renderApp('/plan/2026-12');
        await goToStep('Pull');

        const row = async (name: string) =>
            within((await screen.findByText(new RegExp(`^${name}`))).closest('li')!);

        expect((await row('Quit smoking')).getByRole('button')).toHaveTextContent('In December');
        expect((await row('Quit smoking')).getByRole('button')).toBeDisabled();
        expect(await screen.findByText(/Looks like “Drink less”/)).toBeInTheDocument();
        expect((await row('Cut the drinking')).getByRole('button')).toHaveTextContent('Add anyway');
        expect((await row('Run a 10k')).getByRole('button')).toHaveTextContent('Add to December');
    });

    it('keeps the wording chosen in the Big 3 step and drops the others', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            ...itemsApi({
                '2026-12': [
                    month(10, 'Drink less', { starred: true }),
                    month(11, 'Limit drinking to 2 days a week'),
                    month(12, 'Run 3x a week'),
                ],
            }),
            'PATCH /api/items/10': ({ body }) => ({
                body: { ...month(10, ''), ...(body as object) },
            }),
            'PATCH /api/items/11': ({ body }) => ({
                body: { ...month(11, ''), ...(body as object) },
            }),
        });

        renderApp('/plan/2026-12');
        await goToStep('Big 3');
        await userEvent.click(
            await screen.findByRole('button', { name: 'Keep “Limit drinking to 2 days a week”' }),
        );

        await waitFor(() => {
            const patches = calls.filter((call) => call.method === 'PATCH');

            expect(patches).toContainEqual(
                expect.objectContaining({
                    path: '/api/items/10',
                    body: { status: 'dropped' },
                }),
            );
            // The star isn't lost along with the wording that had it.
            expect(patches).toContainEqual(
                expect.objectContaining({ path: '/api/items/11', body: { starred: true } }),
            );
        });
    });

    it('stops asking about goals kept apart', async () => {
        mockApi({
            ...signedIn(),
            ...itemsApi({
                '2026-12': [month(10, 'Drink less'), month(11, 'Cut the drinking')],
            }),
        });

        const { unmount } = renderApp('/plan/2026-12');
        await goToStep('Big 3');
        await userEvent.click(await screen.findByRole('button', { name: 'Keep them all' }));

        expect(screen.queryByText('These look like the same goal')).not.toBeInTheDocument();
        unmount();

        renderApp('/plan/2026-12');
        await goToStep('Big 3');
        await screen.findByRole('button', { name: 'Star Drink less' });
        expect(screen.queryByText('These look like the same goal')).not.toBeInTheDocument();
    });

    it('carrying everything forward leaves a look-alike for a decision', async () => {
        const november = (id: number, title: string) =>
            goal({ id, title, scope: 'month', period_key: '2026-11' });
        const { calls } = mockApi({
            ...signedIn(),
            ...itemsApi({
                '2026-11': [
                    november(1, 'Cut the drinking'),
                    november(2, 'Quit smoking'),
                    november(3, 'Run a 10k'),
                ],
                '2026-12': [month(10, 'Drink less'), month(11, 'Quit smoking')],
            }),
            'POST /api/items/2/carry': { status: 201, body: month(11, 'Quit smoking') },
            'POST /api/items/3/carry': { status: 201, body: month(12, 'Run a 10k') },
        });

        renderApp('/plan/2026-12');
        await goToStep('Review');

        expect(
            await screen.findByText(/Already in December 2026 as “Drink less”/),
        ).toBeInTheDocument();
        await userEvent.click(
            await screen.findByRole('button', { name: 'Carry the other 2 forward' }),
        );

        await waitFor(() =>
            expect(
                calls.filter((call) => call.path.endsWith('/carry')).map((call) => call.path),
            ).toEqual(['/api/items/2/carry', '/api/items/3/carry']),
        );
    });
});
