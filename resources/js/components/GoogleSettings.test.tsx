import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GoogleStatus } from '@/api/google';
import { nextPeriod, todayPeriod } from '@/lib/period';
import { mockApi, notConnected, renderApp, signedIn } from '@/test/helpers';

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

const connected: GoogleStatus = {
    ...notConnected,
    tasks_connected: true,
    contacts_connected: true,
    tasks_last_synced_at: '2027-01-04T14:05:00Z',
    birthdays_synced_at: '2027-01-04T09:30:00Z',
    birthday_count: 42,
    lists: [
        { id: 11, title: 'Health', category_id: 1 },
        { id: 12, title: 'Get It Done', category_id: 3 },
        { id: 13, title: 'Groceries', category_id: null },
    ],
};

const card = async () => within(await screen.findByRole('region', { name: 'Google' }));

describe('Google settings', () => {
    it('offers to connect when nothing has been granted', async () => {
        mockApi(signedIn());

        renderApp('/settings');

        expect(await (await card()).findByRole('link', { name: 'Connect Google' })).toHaveAttribute(
            'href',
            '/auth/google/connect',
        );
    });

    it('says how connecting went', async () => {
        mockApi(signedIn());

        renderApp('/settings?google=declined');

        expect(await (await card()).findByRole('status')).toHaveTextContent(
            'Google didn’t grant access to Tasks, Calendar or Contacts.',
        );
    });

    it('shows the connection and syncs on request', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/google': { body: { ...connected, pending: 2, errors: 1 } },
            'POST /api/google/sync': { body: connected },
        });

        renderApp('/settings');
        const google = await card();

        expect(await google.findByText('dustin@example.com')).toBeInTheDocument();
        // 14:05 UTC, shown in the person's own time zone.
        expect(
            google.getByText(/Last synced Jan 4, 9:05 AM · 2 waiting to send/),
        ).toBeInTheDocument();
        expect(google.getByRole('alert')).toHaveTextContent('Google refused 1 task.');

        await userEvent.click(google.getByRole('button', { name: 'Sync now' }));

        await waitFor(() =>
            expect(calls.some((call) => call.path === '/api/google/sync')).toBe(true),
        );
        await waitFor(() => expect(google.queryByRole('alert')).not.toBeInTheDocument());
    });

    it('maps a list to a category and creates the missing ones', async () => {
        let status = connected;
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/google': () => ({ body: status }),
            'PATCH /api/google/lists/13': ({ body }) => {
                const { category_id } = body as { category_id: number | null };
                status = {
                    ...status,
                    lists: status.lists.map((list) =>
                        list.id === 13 ? { ...list, category_id } : list,
                    ),
                };
                return { body: status };
            },
            'POST /api/google/lists/create-missing': { body: connected },
        });

        renderApp('/settings');
        const google = await card();

        // The options arrive with the categories.
        await waitFor(() => expect(google.getByLabelText('Health')).toHaveValue('1'));
        expect(google.getByLabelText('Groceries')).toHaveValue('');

        // Only 4 You has no list yet.
        await userEvent.click(google.getByRole('button', { name: 'Create a list for Only 4 You' }));
        await waitFor(() =>
            expect(calls.some((call) => call.path === '/api/google/lists/create-missing')).toBe(
                true,
            ),
        );

        await userEvent.selectOptions(google.getByLabelText('Groceries'), 'Only 4 You');
        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ category_id: 2 }),
        );
        await waitFor(() => expect(google.getByLabelText('Groceries')).toHaveValue('2'));
        expect(google.queryByRole('button', { name: /Create a list/ })).not.toBeInTheDocument();
    });

    it('turns contacts’ birthdays off', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/google': { body: connected },
            'PATCH /api/google': {
                body: { ...connected, sync_birthdays: false, birthday_count: 0 },
            },
        });

        renderApp('/settings');
        const google = await card();
        const toggle = await google.findByRole('checkbox', {
            name: /Show my contacts’ birthdays/,
        });

        expect(toggle).toBeChecked();
        expect(google.getByText('(42 found)')).toBeInTheDocument();

        await userEvent.click(toggle);

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
                sync_birthdays: false,
            }),
        );
        await waitFor(() => expect(toggle).not.toBeChecked());
    });

    it('says which access is missing when only one was granted', async () => {
        mockApi({
            ...signedIn(),
            'GET /api/google': { body: { ...connected, contacts_connected: false } },
        });

        renderApp('/settings');
        const google = await card();

        expect(await google.findByText(/Contacts access wasn’t granted/)).toBeInTheDocument();
        expect(google.queryByRole('checkbox')).not.toBeInTheDocument();
    });
});

describe('when Google needs reconnecting', () => {
    const lapsed = { ...notConnected, needs_reconnect: true };

    it('says so on every page and points to Settings', async () => {
        mockApi({ ...signedIn(), 'GET /api/google': { body: lapsed } });

        renderApp('/brain-dump');

        const banner = await screen.findByText(/Google needs reconnecting/);
        expect(within(banner).getByRole('link', { name: 'Open Settings' })).toHaveAttribute(
            'href',
            '/settings',
        );
    });

    it('offers to reconnect in Settings', async () => {
        mockApi({ ...signedIn(), 'GET /api/google': { body: lapsed } });

        renderApp('/settings');

        expect(
            await (await card()).findByRole('link', { name: 'Reconnect Google' }),
        ).toHaveAttribute('href', '/auth/google/connect');
        expect(screen.queryByText(/Google needs reconnecting/)).not.toBeInTheDocument();
    });
});

describe('what arrives from Google', () => {
    it('tags a Google task in the Brain Dump and keeps its list’s category', async () => {
        const today = todayPeriod('day', 'America/New_York');
        const fromGoogle = {
            id: 7,
            bucket: 'other',
            title: 'Renew passport',
            notes: null,
            from_google: true,
            suggested_category_id: 1,
        };
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/brain-dump': { body: { items: [fromGoogle], assigned_this_week: 0 } },
            'POST /api/brain-dump/7/assign': { status: 201, body: {} },
        });

        renderApp('/brain-dump');

        expect(await screen.findByTitle('From Google Tasks')).toHaveTextContent('Google');

        await userEvent.click(screen.getByRole('button', { name: 'Add Renew passport to plan' }));
        await userEvent.click(screen.getByRole('button', { name: 'Tomorrow' }));

        // "Other" would normally go to the Other category; this one stays in Health.
        await waitFor(() =>
            expect(
                calls.find((call) => call.path === '/api/brain-dump/7/assign')?.body,
            ).toMatchObject({ period_key: nextPeriod(today).key, category_id: 1 }),
        );
    });

    it('lists a contact’s birthday without edit or delete', async () => {
        mockApi({
            ...signedIn(),
            'GET /api/important-dates': {
                body: [
                    {
                        id: 5,
                        title: 'Sam’s birthday',
                        date: '1904-01-09',
                        repeats_yearly: true,
                        category_id: null,
                        source: 'google_contacts',
                        occurs_on: '2027-01-09',
                    },
                ],
            },
        });

        renderApp('/month/2027-01');
        const dates = within(await screen.findByRole('region', { name: 'Important dates' }));

        expect(await dates.findByText('Sam’s birthday')).toBeInTheDocument();
        expect(dates.getByText('Contacts')).toBeInTheDocument();
        expect(dates.queryByRole('button', { name: /Edit Sam/ })).not.toBeInTheDocument();
        expect(dates.queryByRole('button', { name: /Delete Sam/ })).not.toBeInTheDocument();
    });
});
