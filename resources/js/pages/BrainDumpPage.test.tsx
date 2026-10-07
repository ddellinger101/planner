import { createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrainDumpItem } from '@/api/brainDump';
import { nextPeriod, todayPeriod } from '@/lib/period';
import { makeItem, mockApi, renderApp, signedIn } from '@/test/helpers';

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

const today = todayPeriod('day', 'America/New_York');
const region = (name: string) => screen.findByRole('region', { name });

const entry = (overrides: Partial<BrainDumpItem> = {}): BrainDumpItem => ({
    id: 1,
    bucket: 'call',
    title: 'Call the vet',
    notes: null,
    from_google: false,
    suggested_category_id: null,
    ...overrides,
});

/** A board whose stub remembers adds, moves, deletes and assignments. */
function boardApi(initial: BrainDumpItem[] = [], assignedThisWeek = 0) {
    let items = initial;
    let assigned = assignedThisWeek;
    let nextId = 100;

    return {
        ...signedIn(),
        'GET /api/brain-dump': () => ({ body: { items, assigned_this_week: assigned } }),
        'POST /api/brain-dump': ({ body }: { body: unknown }) => {
            const created = entry({ id: nextId++, ...(body as object) });
            items = [...items, created];
            return { status: 201, body: created };
        },
        ...Object.fromEntries(
            initial.flatMap((item) => [
                [
                    `PATCH /api/brain-dump/${item.id}`,
                    ({ body }: { body: unknown }) => {
                        items = items.map((candidate) =>
                            candidate.id === item.id
                                ? { ...candidate, ...(body as object) }
                                : candidate,
                        );
                        return { body: items.find((candidate) => candidate.id === item.id) };
                    },
                ],
                [
                    `DELETE /api/brain-dump/${item.id}`,
                    () => {
                        items = items.filter((candidate) => candidate.id !== item.id);
                        return { status: 204 };
                    },
                ],
                [
                    `POST /api/brain-dump/${item.id}/assign`,
                    ({ body }: { body: unknown }) => {
                        items = items.filter((candidate) => candidate.id !== item.id);
                        assigned++;
                        return { status: 201, body: makeItem(body as object) };
                    },
                ],
            ]),
        ),
    };
}

describe('the board', () => {
    it('has all ten boxes, in the template’s order, with items in their boxes', async () => {
        mockApi(boardApi([entry(), entry({ id: 2, bucket: 'buy', title: 'Light bulbs' })]));

        renderApp('/brain-dump');

        await screen.findByText('Call the vet');
        expect(
            screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent),
        ).toEqual([
            'Must Do',
            'Should Do',
            'Could Do',
            'Call',
            'Email',
            'Buy',
            'Other',
            'Health Habits',
            'Kids Stuff',
            'Only 4 You',
        ]);
        expect(within(await region('Call')).getByText('Call the vet')).toBeInTheDocument();
        expect(within(await region('Buy')).getByText('Light bulbs')).toBeInTheDocument();
        expect(within(await region('Email')).queryAllByRole('listitem')).toHaveLength(0);
    });

    it('adds one item after another without leaving the box', async () => {
        const { calls } = mockApi(boardApi());

        renderApp('/brain-dump');
        const input = await screen.findByRole('textbox', { name: 'Add to Must Do' });
        await userEvent.type(input, 'Renew passport{Enter}Book flights{Enter}');

        await waitFor(() =>
            expect(calls.filter((call) => call.method === 'POST').map((call) => call.body)).toEqual(
                [
                    { bucket: 'must_do', title: 'Renew passport' },
                    { bucket: 'must_do', title: 'Book flights' },
                ],
            ),
        );
        expect(input).toHaveFocus();
        expect(input).toHaveValue('');

        const box = within(await region('Must Do'));
        expect(await box.findByText('Book flights')).toBeInTheDocument();
        expect(box.getByText('Renew passport')).toBeInTheDocument();
    });

    it('moves an item to another box when it is dragged there', async () => {
        const { calls } = mockApi(boardApi([entry()]));

        renderApp('/brain-dump');
        await within(await region('Call')).findByText('Call the vet');

        const target = await region('Must Do');
        fireEvent(
            target,
            createEvent.drop(target, {
                dataTransfer: { types: ['application/x-planner-dump'], getData: () => '1' },
            }),
        );

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
                bucket: 'must_do',
            }),
        );
        expect(await within(target).findByText('Call the vet')).toBeInTheDocument();
        expect(within(await region('Call')).queryByText('Call the vet')).not.toBeInTheDocument();
    });

    it('renames, moves and deletes from the edit sheet', async () => {
        const { calls } = mockApi(boardApi([entry()]));

        renderApp('/brain-dump');
        await userEvent.click(await screen.findByRole('button', { name: 'Edit Call the vet' }));

        let dialog = within(screen.getByRole('dialog', { name: 'Edit item' }));
        await userEvent.type(dialog.getByLabelText('What is it?'), ' today');
        await userEvent.selectOptions(dialog.getByLabelText('Box'), 'must_do');
        await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
                title: 'Call the vet today',
                bucket: 'must_do',
            }),
        );

        await userEvent.click(
            await screen.findByRole('button', { name: 'Edit Call the vet today' }),
        );
        dialog = within(screen.getByRole('dialog', { name: 'Edit item' }));
        await userEvent.click(dialog.getByRole('button', { name: 'Delete this item' }));

        await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
        await waitFor(() =>
            expect(screen.queryByText('Call the vet today')).not.toBeInTheDocument(),
        );
    });

    it('cheers on items added to the plan this week', async () => {
        mockApi(boardApi([], 3));

        renderApp('/brain-dump');

        expect(await screen.findByText('3 items added to the plan this week')).toBeInTheDocument();
    });
});

describe('add to plan', () => {
    it('takes two taps for today, with the box’s usual category', async () => {
        const { calls } = mockApi(
            boardApi([entry({ id: 7, bucket: 'health_habits', title: 'Book a physical' })]),
        );

        renderApp('/brain-dump');
        await userEvent.click(
            await screen.findByRole('button', { name: 'Add Book a physical to plan' }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Today' }));

        await waitFor(() =>
            expect(calls.find((call) => call.path === '/api/brain-dump/7/assign')?.body).toEqual({
                period_key: today.key,
                category_id: 1, // Health Habits go to Health
                starred: false,
                due_time: null,
                recurrence_rule: null,
            }),
        );
        // It leaves the board and counts toward the week.
        await waitFor(() => expect(screen.queryByText('Book a physical')).not.toBeInTheDocument());
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(await screen.findByText('1 item added to the plan this week')).toBeInTheDocument();
    });

    it('offers tomorrow and this week', async () => {
        const { calls } = mockApi(
            boardApi([entry({ id: 7 }), entry({ id: 8, title: 'Order filters', bucket: 'buy' })]),
        );

        renderApp('/brain-dump');
        await userEvent.click(
            await screen.findByRole('button', { name: 'Add Call the vet to plan' }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));
        await waitFor(() =>
            expect(
                calls.find((call) => call.path === '/api/brain-dump/7/assign')?.body,
            ).toMatchObject({
                period_key: nextPeriod(today).key,
                category_id: 3, // Call goes to Other
            }),
        );

        await userEvent.click(
            await screen.findByRole('button', { name: 'Add Order filters to plan' }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'This week' }));
        await waitFor(() =>
            expect(
                calls.find((call) => call.path === '/api/brain-dump/8/assign')?.body,
            ).toMatchObject({
                period_key: todayPeriod('week', 'America/New_York').key,
            }),
        );
    });

    it('takes a chosen date, category, time, star and repeat', async () => {
        const { calls } = mockApi(boardApi([entry({ id: 7 })]));

        renderApp('/brain-dump');
        await userEvent.click(
            await screen.findByRole('button', { name: 'Add Call the vet to plan' }),
        );

        const dialog = within(screen.getByRole('dialog', { name: 'Add to plan' }));
        expect(dialog.getByRole('button', { name: 'Add on that day' })).toBeDisabled();

        fireEvent.change(dialog.getByLabelText('Or pick a date'), {
            target: { value: '2027-01-04' },
        });
        await userEvent.click(dialog.getByText('More options'));
        await userEvent.click(dialog.getByRole('radio', { name: 'Health' }));
        fireEvent.change(dialog.getByLabelText('Time (optional)'), { target: { value: '15:30' } });
        await userEvent.click(dialog.getByRole('button', { name: 'Star it' }));
        // Presets are worded for the chosen day: January 4, 2027 is a Monday.
        await userEvent.selectOptions(dialog.getByLabelText('Repeat'), 'FREQ=WEEKLY;BYDAY=MO');
        await userEvent.click(dialog.getByRole('button', { name: 'Add on that day' }));

        await waitFor(() =>
            expect(calls.find((call) => call.path === '/api/brain-dump/7/assign')?.body).toEqual({
                period_key: '2027-01-04',
                category_id: 1,
                starred: true,
                due_time: '15:30',
                recurrence_rule: 'FREQ=WEEKLY;BYDAY=MO',
            }),
        );
    });

    it('leaves time and repeat off a goal for the week', async () => {
        const { calls } = mockApi(boardApi([entry({ id: 7 })]));

        renderApp('/brain-dump');
        await userEvent.click(
            await screen.findByRole('button', { name: 'Add Call the vet to plan' }),
        );

        const dialog = within(screen.getByRole('dialog', { name: 'Add to plan' }));
        await userEvent.click(dialog.getByText('More options'));
        fireEvent.change(dialog.getByLabelText('Time (optional)'), { target: { value: '09:00' } });
        await userEvent.selectOptions(dialog.getByLabelText('Repeat'), 'FREQ=DAILY');
        await userEvent.click(dialog.getByRole('button', { name: 'This week' }));

        await waitFor(() =>
            expect(
                calls.find((call) => call.path === '/api/brain-dump/7/assign')?.body,
            ).toMatchObject({
                due_time: null,
                recurrence_rule: null,
            }),
        );
    });

    it('explains when the item was already planned elsewhere', async () => {
        mockApi({
            ...boardApi([entry({ id: 7 })]),
            'POST /api/brain-dump/7/assign': {
                status: 409,
                body: { message: 'This item is already in the plan.' },
            },
        });

        renderApp('/brain-dump');
        await userEvent.click(
            await screen.findByRole('button', { name: 'Add Call the vet to plan' }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Today' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('That’s already in the plan.');
        expect(screen.getByRole('dialog', { name: 'Add to plan' })).toBeInTheDocument();
    });
});
