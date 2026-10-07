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
        await userEvent.click(await screen.findByRole('link', { name: 'Plan this week' }));

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
            await screen.findByRole('heading', { name: 'Look back at last week' }),
        ).toBeInTheDocument();
        // The Week tab stays highlighted while planning.
        expect(
            within(screen.getAllByRole('navigation', { name: 'Main' })[0]).getByRole('link', {
                name: 'Week',
            }),
        ).toHaveAttribute('aria-current', 'page');
    });

    it('captures thoughts into the brain dump', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/brain-dump': {
                body: {
                    items: [{ id: 5, bucket: 'call', title: 'Call the vet', notes: null }],
                    assigned_this_week: 0,
                },
            },
            'POST /api/brain-dump': ({ body }) => ({ status: 201, body }),
            'DELETE /api/brain-dump/5': { status: 204 },
        });

        renderApp('/plan/2027-W01');
        expect(await screen.findByText('Call the vet')).toBeInTheDocument();

        await userEvent.type(screen.getByLabelText('Something on your mind'), 'Order filters');
        await userEvent.selectOptions(screen.getByLabelText('Kind'), 'buy');
        await userEvent.click(screen.getByRole('button', { name: 'Add' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                bucket: 'buy',
                title: 'Order filters',
            }),
        );

        await userEvent.click(screen.getByRole('button', { name: 'Delete Call the vet' }));
        await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
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
        expect(await second.findByRole('button', { name: 'In this week' })).toBeDisabled();

        await userEvent.click(await first.findByRole('button', { name: 'Add to this week' }));
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

    it('rejects a key that isn’t a week', async () => {
        mockApi(signedIn());

        renderApp('/plan/2027-01');

        expect(
            await screen.findByRole('heading', { name: 'That week doesn’t exist' }),
        ).toBeInTheDocument();
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
