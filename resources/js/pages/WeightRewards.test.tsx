import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Reward } from '@/api/rewards';
import { todayPeriod } from '@/lib/period';
import { makeItem, mockApi, renderApp, signedIn } from '@/test/helpers';
import { timeLeft } from './RewardsPage';

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

const today = todayPeriod('day', 'America/New_York');
const month = todayPeriod('month', 'America/New_York');
const daysAgo = (days: number) =>
    new Date(Date.parse(`${today.key}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

const entries = [
    { id: 1, date: daysAgo(20), weight: 186, unit: 'lb' },
    { id: 2, date: daysAgo(10), weight: 184.5, unit: 'lb' },
    { id: 3, date: daysAgo(0), weight: 182.4, unit: 'lb' },
];

describe('weight', () => {
    const weightApi = () => ({
        ...signedIn(),
        'GET /api/weight': { body: entries },
        'GET /api/weight/goals': {
            body: [{ scope: 'month', period_key: month.key, target_weight: 180 }],
        },
    });

    it('shows the latest weight, the change and the distance to the current goal', async () => {
        mockApi(weightApi());

        renderApp('/weight');

        await screen.findByText('Latest');
        await waitFor(() =>
            expect(screen.getByText('Latest').parentElement).toHaveTextContent('182.4 lb'),
        );
        expect(screen.getByText('Change in this range').parentElement).toHaveTextContent('−3.6 lb');
        const goal = (await screen.findByText('To month goal')).parentElement!;
        expect(goal).toHaveTextContent('−2.4 lb');
        expect(goal).toHaveTextContent('Goal 180 lb');
    });

    it('draws the chart with a text summary, and reads out entries from the keyboard', async () => {
        mockApi(weightApi());

        renderApp('/weight');
        const chart = await screen.findByRole('img', { name: /^Weight from .* 186 to 182\.4 lb/ });

        // One marker per entry, the last value labelled, and the goal as a level.
        expect(chart.querySelectorAll('.chart-dot')).toHaveLength(3);
        expect(within(chart).getByText('182.4')).toHaveClass('chart-end-label');
        // The goal is drawn as a level across the part of its month on screen.
        await waitFor(() => expect(chart.querySelectorAll('.chart-goal')).toHaveLength(1));

        chart.focus();
        await userEvent.keyboard('{ArrowLeft}');
        expect(screen.getByRole('status')).toHaveTextContent('182.4 lb');
        await userEvent.keyboard('{ArrowLeft}');
        expect(screen.getByRole('status')).toHaveTextContent('184.5 lb');
        await userEvent.keyboard('{Home}');
        expect(screen.getByRole('status')).toHaveTextContent('186 lb');
        await userEvent.keyboard('{Escape}');
        expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });

    it('asks for a different range, and for everything', async () => {
        const { calls } = mockApi(weightApi());

        renderApp('/weight');
        await screen.findByText('Latest');

        const ranged = () => calls.filter((call) => call.path === '/api/weight').at(-1)!.query;
        expect(ranged().get('from')).toBe(daysAgo(91));
        expect(ranged().get('to')).toBe(today.key);

        await userEvent.click(screen.getByRole('button', { name: 'Last month' }));
        await waitFor(() => expect(ranged().get('from')).toBe(daysAgo(30)));

        await userEvent.click(screen.getByRole('button', { name: 'All time' }));
        await waitFor(() => expect(ranged().has('from')).toBe(false));
    });

    it('logs a weight for a chosen day', async () => {
        const { calls } = mockApi({
            ...weightApi(),
            'POST /api/weight': ({ body }) => ({
                body: { id: 9, unit: 'lb', ...(body as object) },
            }),
        });

        renderApp('/weight');
        const form = within(await screen.findByRole('form', { name: 'Log your weight' }));

        expect(form.getByLabelText('Day')).toHaveValue(today.key);
        expect(form.getByRole('button', { name: 'Log weight' })).toBeDisabled();

        fireEvent.change(form.getByLabelText('Day'), { target: { value: daysAgo(1) } });
        await userEvent.type(form.getByLabelText('Weight (lb)'), '183.1');
        await userEvent.click(form.getByRole('button', { name: 'Log weight' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                date: daysAgo(1),
                weight: 183.1,
            }),
        );
        await waitFor(() => expect(form.getByLabelText('Weight (lb)')).toHaveValue(null));
    });

    it('lists the history newest first with the change from the entry before, and deletes', async () => {
        const { calls } = mockApi({ ...weightApi(), 'DELETE /api/weight/2': { status: 204 } });

        renderApp('/weight');
        const history = within(await screen.findByRole('region', { name: 'History' }));
        await history.findByText('186 lb');
        const rows = history.getAllByRole('row');

        expect(rows).toHaveLength(4);
        expect(rows[1]).toHaveTextContent('182.4 lb');
        expect(rows[1]).toHaveTextContent('−2.1');
        expect(rows[3]).toHaveTextContent('186 lb');
        expect(rows[3]).toHaveTextContent('—');

        await userEvent.click(
            within(rows[2]).getByRole('button', { name: /^Delete the entry for/ }),
        );
        await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
    });

    it('says so when nothing is logged', async () => {
        mockApi(signedIn());

        renderApp('/weight');

        expect(await screen.findByText('No weight logged in this range yet.')).toBeInTheDocument();
        expect(screen.getByText('No goal set')).toBeInTheDocument();
        expect(screen.getByText('Nothing logged in this range.')).toBeInTheDocument();
    });

    it('puts the year’s chart on the Year view', async () => {
        const { calls } = mockApi(weightApi());

        renderApp('/year/2027');

        expect(await screen.findByRole('region', { name: 'Weight in 2027' })).toBeInTheDocument();
        await waitFor(() =>
            expect(
                calls.some(
                    (call) =>
                        call.path === '/api/weight' &&
                        call.query.get('from') === '2027-01-01' &&
                        call.query.get('to') === '2027-12-31',
                ),
            ).toBe(true),
        );
    });
});

const reward = (overrides: Partial<Reward> = {}): Reward => ({
    id: 1,
    title: 'Movie night',
    description: 'Pick any film',
    deadline: new Date(Date.now() + 3 * 86_400_000 + 3_600_000).toISOString(),
    status: 'active',
    earned_at: null,
    claimed_at: null,
    beneficiary_user_id: null,
    items: [
        makeItem({ id: 11, title: 'Run three times', status: 'done' }),
        makeItem({ id: 12, title: 'Clean the garage' }),
        makeItem({ id: 13, title: 'Dropped one', status: 'dropped' }),
    ],
    ...overrides,
});

describe('rewards', () => {
    it('shows progress, the countdown and the tasks, leaving out dropped ones', async () => {
        mockApi({ ...signedIn(), 'GET /api/rewards': { body: [reward()] } });

        renderApp('/rewards');
        const card = within(await screen.findByRole('region', { name: 'Movie night' }));

        expect(card.getByText('Pick any film')).toBeInTheDocument();
        expect(card.getByText(/^3 days left/)).toBeInTheDocument();
        expect(card.getByText('For both of you')).toBeInTheDocument();
        expect(card.getByText('1 of 2')).toBeInTheDocument();
        expect(card.getByRole('checkbox', { name: 'Run three times' })).toBeChecked();
        expect(card.queryByRole('checkbox', { name: 'Dropped one' })).not.toBeInTheDocument();
    });

    it('checks a task off from the card and looks again for earned rewards', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/rewards': { body: [reward()] },
            'PATCH /api/items/12': ({ body }) => ({
                body: makeItem({ id: 12, ...(body as object) }),
            }),
        });

        renderApp('/rewards');
        const before = () => calls.filter((call) => call.path === '/api/rewards').length;
        const card = within(await screen.findByRole('region', { name: 'Movie night' }));
        const fetched = before();
        await userEvent.click(card.getByRole('checkbox', { name: 'Clean the garage' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ status: 'done' }),
        );
        await waitFor(() => expect(before()).toBeGreaterThan(fetched));
    });

    it('celebrates an earned reward once, and lets it be claimed', async () => {
        const earned = reward({
            id: 5,
            title: 'Sunday sleep-in',
            status: 'earned',
            earned_at: new Date().toISOString(),
        });
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/rewards': { body: [earned] },
            'POST /api/rewards/5/claim': { body: { ...earned, status: 'claimed' } },
        });

        const { unmount } = renderApp('/day/2027-01-04');
        const toast = await screen.findByText(/You earned/);
        expect(toast).toHaveTextContent('You earned Sunday sleep-in!');

        // "Claim it" goes to the Rewards page and doesn't announce again.
        await userEvent.click(screen.getByRole('link', { name: 'Claim it' }));
        expect(
            await screen.findByRole('heading', { name: 'Earned: claim it!' }),
        ).toBeInTheDocument();
        expect(screen.queryByText(/You earned/)).not.toBeInTheDocument();

        await userEvent.click(
            within(screen.getByRole('region', { name: 'Sunday sleep-in' })).getByRole('button', {
                name: 'Claim it',
            }),
        );
        await waitFor(() =>
            expect(calls.some((call) => call.path === '/api/rewards/5/claim')).toBe(true),
        );
        unmount();

        renderApp('/day/2027-01-04');
        await screen.findByRole('region', { name: 'Schedule' });
        expect(screen.queryByText(/You earned/)).not.toBeInTheDocument();
    });

    it('creates a reward from chosen tasks, including all starred this week', async () => {
        const goals = [
            makeItem({
                id: 21,
                title: 'Run three times',
                scope: 'week',
                due_date: null,
                starred: true,
            }),
            makeItem({ id: 22, title: 'Finish the setlist', scope: 'week', due_date: null }),
            makeItem({
                id: 23,
                title: 'Already done',
                scope: 'week',
                due_date: null,
                status: 'done',
            }),
        ];
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/items': ({ url }: { url: URL }) => ({
                body: url.searchParams.get('period_key')?.includes('W') ? goals : [],
            }),
            'POST /api/rewards': ({ body }) => ({ status: 201, body: reward(body as object) }),
        });

        renderApp('/rewards');
        await userEvent.click(await screen.findByRole('button', { name: 'Add a reward' }));

        const dialog = within(screen.getByRole('dialog', { name: 'New reward' }));
        expect(dialog.getByRole('button', { name: 'Create reward' })).toBeDisabled();
        // Only open tasks are offered.
        expect(
            await dialog.findByRole('checkbox', { name: 'Run three times' }),
        ).toBeInTheDocument();
        expect(dialog.queryByRole('checkbox', { name: 'Already done' })).not.toBeInTheDocument();

        await userEvent.type(dialog.getByLabelText('The reward'), 'Pizza night');
        await userEvent.click(dialog.getByRole('button', { name: 'All starred this week' }));
        await userEvent.type(dialog.getByLabelText('Search tasks'), 'setlist');
        expect(dialog.queryByRole('checkbox', { name: 'Run three times' })).not.toBeInTheDocument();
        await userEvent.click(dialog.getByRole('checkbox', { name: 'Finish the setlist' }));
        expect(dialog.getByText('Tasks to finish (2 chosen)')).toBeInTheDocument();

        fireEvent.change(dialog.getByLabelText('Earn it by the end of'), {
            target: { value: '2027-01-10' },
        });
        await userEvent.selectOptions(dialog.getByLabelText('Who it’s for'), '2');
        await userEvent.click(dialog.getByRole('button', { name: 'Create reward' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                title: 'Pizza night',
                description: null,
                deadline: '2027-01-10',
                beneficiary_user_id: 2,
                item_ids: [21, 22],
            }),
        );
    });

    it('starts a Big 3 reward with this week’s starred goals chosen', async () => {
        mockApi({
            ...signedIn(),
            'GET /api/items': ({ url }: { url: URL }) => ({
                body: url.searchParams.get('period_key')?.includes('W')
                    ? [
                          makeItem({
                              id: 21,
                              title: 'Run three times',
                              scope: 'week',
                              due_date: null,
                              starred: true,
                          }),
                      ]
                    : [],
            }),
        });

        renderApp('/rewards?new=big3');
        const dialog = within(await screen.findByRole('dialog', { name: 'New reward' }));

        expect(await dialog.findByRole('checkbox', { name: 'Run three times' })).toBeChecked();
        expect(dialog.getByText('Tasks to finish (1 chosen)')).toBeInTheDocument();
    });

    it('edits a reward with its tasks and deadline filled in, and can delete it', async () => {
        const existing = reward({ deadline: '2027-01-11T04:59:59Z' });
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/rewards': { body: [existing] },
            'PATCH /api/rewards/1': ({ body }) => ({ body: { ...existing, ...(body as object) } }),
            'DELETE /api/rewards/1': { status: 204 },
        });

        renderApp('/rewards');
        await userEvent.click(await screen.findByRole('button', { name: 'Edit Movie night' }));

        let dialog = within(screen.getByRole('dialog', { name: 'Edit reward' }));
        // Stored in UTC, shown as the New York day it falls on.
        expect(dialog.getByLabelText('Earn it by the end of')).toHaveValue('2027-01-10');
        expect(dialog.getByText('Tasks to finish (3 chosen)')).toBeInTheDocument();

        await userEvent.clear(dialog.getByLabelText('The reward'));
        await userEvent.type(dialog.getByLabelText('The reward'), 'Film night');
        await userEvent.click(dialog.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toMatchObject({
                title: 'Film night',
                deadline: '2027-01-10',
                item_ids: [11, 12, 13],
            }),
        );

        await userEvent.click(await screen.findByRole('button', { name: 'Edit Movie night' }));
        dialog = within(screen.getByRole('dialog', { name: 'Edit reward' }));
        await userEvent.click(dialog.getByRole('button', { name: 'Delete this reward' }));
        await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
    });

    it('keeps claimed and expired rewards in a list, and invites a first one when empty', async () => {
        mockApi({
            ...signedIn(),
            'GET /api/rewards': {
                body: [
                    reward({
                        id: 2,
                        title: 'Takeout',
                        status: 'claimed',
                        claimed_at: '2027-01-03T17:00:00Z',
                    }),
                    reward({
                        id: 3,
                        title: 'Record shop',
                        status: 'expired',
                        deadline: '2027-01-02T04:59:59Z',
                    }),
                ],
            },
        });

        const { unmount } = renderApp('/rewards');
        const past = within(await screen.findByRole('region', { name: 'Claimed and expired' }));

        expect(past.getByText('Takeout').closest('li')).toHaveTextContent('Claimed Sun, Jan 3');
        expect(past.getByText('Record shop').closest('li')).toHaveTextContent('Expired Fri, Jan 1');
        expect(past.getByRole('button', { name: 'Extend or edit' })).toBeInTheDocument();
        unmount();

        mockApi(signedIn());
        renderApp('/rewards');
        expect(
            await screen.findByRole('heading', { name: 'Something to look forward to' }),
        ).toBeInTheDocument();
    });
});

describe('timeLeft', () => {
    const now = Date.parse('2027-01-04T12:00:00Z');
    const at = (iso: string) => timeLeft(iso, now);

    it.each([
        ['2027-01-10T12:00:00Z', '6 days left', false],
        ['2027-01-05T13:00:00Z', '1 day left', true],
        ['2027-01-05T11:00:00Z', '23 hours left', true],
        ['2027-01-04T12:30:00Z', 'Less than an hour left', true],
        ['2027-01-04T11:00:00Z', 'Deadline passed', true],
    ])('%s → %s', (deadline, text, urgent) => {
        expect(at(deadline)).toEqual({ text, urgent });
    });
});
