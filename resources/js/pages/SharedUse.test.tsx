import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Reward } from '@/api/rewards';
import { makeItem, mockApi, notConnected, renderApp, session, signedIn } from '@/test/helpers';

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

const region = (name: string) => screen.findByRole('region', { name });

describe('profile', () => {
    it('renames the person and follows the change', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'PATCH /api/me': ({ body }) => ({
                body: { ...session, user: { ...session.user, ...(body as object) } },
            }),
        });

        renderApp('/settings');
        const profile = within(await region('Profile'));
        const name = profile.getByLabelText('Name');

        expect(name).toHaveValue('Dustin');

        await userEvent.clear(name);
        await userEvent.type(name, 'Dusty{Enter}');

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ name: 'Dusty' }),
        );
        await waitFor(() => expect(name).toHaveValue('Dusty'));
    });

    it('doesn’t save an empty name', async () => {
        const { calls } = mockApi(signedIn());

        renderApp('/settings');
        const name = within(await region('Profile')).getByLabelText('Name');

        await userEvent.clear(name);
        await userEvent.tab();

        expect(name).toHaveValue('Dustin');
        expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
    });

    it('picks a color, but not the one the other person has', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'PATCH /api/me': ({ body }) => ({
                body: { ...session, user: { ...session.user, ...(body as object) } },
            }),
        });

        renderApp('/settings');
        const colors = within(
            within(await region('Profile')).getByRole('radiogroup', { name: 'Your color' }),
        );

        expect(colors.getByRole('radio', { name: 'Blue' })).toBeChecked();
        expect(colors.getByRole('radio', { name: 'Coral, Elizabeth’s color' })).toBeDisabled();

        await userEvent.click(colors.getByRole('radio', { name: 'Purple' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
                color: '#8257d6',
            }),
        );
        await waitFor(() => expect(colors.getByRole('radio', { name: 'Purple' })).toBeChecked());
    });

    it('changes the time zone', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'PATCH /api/me': ({ body }) => ({
                body: { ...session, user: { ...session.user, ...(body as object) } },
            }),
        });

        renderApp('/settings');
        const zone = within(await region('Profile')).getByLabelText('Time zone');

        expect(zone).toHaveValue('America/New_York');

        await userEvent.selectOptions(zone, 'America/Chicago');

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
                timezone: 'America/Chicago',
            }),
        );
    });
});

describe('the person filter', () => {
    it('gives a new day task to the person whose planner is on screen', async () => {
        window.localStorage.setItem('planner.person', '2');
        const { calls } = mockApi({
            ...signedIn(),
            'POST /api/items': ({ body }) => ({ status: 201, body: makeItem(body as object) }),
        });

        renderApp('/day/2027-01-04');
        await userEvent.type(
            await screen.findByRole('textbox', { name: 'Add a Health task' }),
            'Yoga{Enter}',
        );

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                title: 'Yoga',
                category_id: 1,
                scope: 'day',
                period_key: '2027-01-04',
                assignee_user_id: 2,
            }),
        );
    });

    it('starts Quick Add on that person too', async () => {
        window.localStorage.setItem('planner.person', '2');
        mockApi(signedIn());

        renderApp('/day/2027-01-04');
        await userEvent.click(await screen.findByRole('button', { name: 'Quick add' }));

        const who = within(
            within(screen.getByRole('dialog', { name: 'Quick add' })).getByRole('radiogroup', {
                name: 'Who',
            }),
        );

        expect(who.getByRole('radio', { name: /Elizabeth/ })).toBeChecked();
    });

    it('leaves a goal for both people whoever is on screen', async () => {
        window.localStorage.setItem('planner.person', '2');
        const { calls } = mockApi({
            ...signedIn(),
            'POST /api/items': ({ body }) => ({ status: 201, body: makeItem(body as object) }),
        });

        renderApp('/month/2027-01');
        await userEvent.type(
            await screen.findByRole('textbox', { name: 'Add a Other goal' }),
            'Plan the reunion{Enter}',
        );

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).not.toHaveProperty(
                'assignee_user_id',
            ),
        );
    });

    it('gives a Health goal to that person, since health is personal', async () => {
        window.localStorage.setItem('planner.person', '2');
        const { calls } = mockApi({
            ...signedIn(),
            'POST /api/items': ({ body }) => ({ status: 201, body: makeItem(body as object) }),
        });

        renderApp('/month/2027-01');
        await userEvent.type(
            await screen.findByRole('textbox', { name: 'Add a Health goal' }),
            'Run a 5k{Enter}',
        );

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
                title: 'Run a 5k',
                assignee_user_id: 2,
            }),
        );
    });

    it('marks tasks and events with whose they are in the Both view only', async () => {
        mockApi({
            ...signedIn([makeItem({ id: 7, title: 'Morning run', assignee_user_id: 1 })]),
            'GET /api/events': {
                body: [
                    {
                        id: 3,
                        google_event_id: 'g3',
                        title: 'Dentist',
                        location: null,
                        all_day: true,
                        starts_at: null,
                        ends_at: null,
                        starts_on: '2027-01-04',
                        ends_on: '2027-01-04',
                        owner_user_id: 2,
                        editable: true,
                        repeats: false,
                        color: null,
                        calendar_name: null,
                        html_link: null,
                    },
                ],
            },
        });

        renderApp('/day/2027-01-04');
        const health = within(await region('Health'));
        const events = within(await region('Events'));

        // Default: no initials.
        await health.findByRole('checkbox', { name: 'Morning run' });
        expect(health.queryByText('Assigned to Dustin')).not.toBeInTheDocument();
        expect(await events.findByRole('button', { name: 'Dentist, All day' })).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Both' }));

        expect(await health.findByText('Assigned to Dustin')).toBeInTheDocument();
        expect(
            await events.findByRole('button', { name: 'Dentist, All day, Elizabeth' }),
        ).toBeInTheDocument();

        // One person's view: it is all theirs, so no initials again.
        await userEvent.click(screen.getByRole('button', { name: 'Dustin' }));

        await waitFor(() =>
            expect(health.queryByText('Assigned to Dustin')).not.toBeInTheDocument(),
        );
    });

    it('narrows the rewards to one person’s and the ones for both', async () => {
        const reward = (id: number, title: string, beneficiary: number | null): Reward => ({
            id,
            title,
            description: null,
            deadline: new Date(Date.now() + 3 * 86_400_000).toISOString(),
            status: 'active',
            earned_at: null,
            claimed_at: null,
            beneficiary_user_id: beneficiary,
            items: [makeItem({ id: id * 10 })],
        });
        mockApi({
            ...signedIn(),
            'GET /api/rewards': {
                body: [
                    reward(1, 'Movie night', null),
                    reward(2, 'New guitar strings', 1),
                    reward(3, 'Spa afternoon', 2),
                ],
            },
        });

        renderApp('/rewards');

        expect(await region('Spa afternoon')).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'New guitar strings' })).toBeInTheDocument();

        await userEvent.click(
            within(screen.getByRole('group', { name: 'Whose items to show' })).getByRole('button', {
                name: /Elizabeth/,
            }),
        );

        expect(screen.getByRole('region', { name: 'Spa afternoon' })).toBeInTheDocument();
        expect(screen.getByRole('region', { name: 'Movie night' })).toBeInTheDocument();
        expect(
            screen.queryByRole('region', { name: 'New guitar strings' }),
        ).not.toBeInTheDocument();
    });
});

describe('the other person’s calendars', () => {
    it('lets you keep one of them out of your own planner', async () => {
        let status = {
            ...notConnected,
            shared_calendars: [
                { id: 41, summary: 'Elizabeth', color: '#e67c73', owner_user_id: 2, visible: true },
                { id: 42, summary: 'Work', color: '#4285f4', owner_user_id: 2, visible: true },
            ],
        };
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/google': () => ({ body: status }),
            'PATCH /api/google/shared-calendars/42': ({ body }) => {
                const { visible } = body as { visible: boolean };
                status = {
                    ...status,
                    shared_calendars: status.shared_calendars.map((calendar) =>
                        calendar.id === 42 ? { ...calendar, visible } : calendar,
                    ),
                };

                return { body: status };
            },
        });

        renderApp('/settings');
        // Offered even to someone who hasn't connected Google themselves.
        const theirs = within(await screen.findByRole('group', { name: 'Elizabeth’s calendars' }));
        const work = theirs.getByRole('checkbox', { name: 'Work' });

        expect(work).toBeChecked();

        await userEvent.click(work);

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ visible: false }),
        );
        await waitFor(() => expect(work).not.toBeChecked());
        expect(theirs.getByRole('checkbox', { name: 'Elizabeth' })).toBeChecked();
    });
});

describe('welcome', () => {
    it('points someone who hasn’t connected Google to Settings, until dismissed', async () => {
        mockApi(signedIn());

        const first = renderApp('/day/2027-01-04');
        const banner = within(await screen.findByRole('complementary', { name: 'Welcome' }));

        expect(banner.getByText('Welcome, Dustin.')).toBeInTheDocument();
        expect(banner.getByRole('link', { name: 'Set it up' })).toHaveAttribute(
            'href',
            '/settings',
        );

        await userEvent.click(banner.getByRole('button', { name: 'Not now' }));
        expect(screen.queryByRole('complementary', { name: 'Welcome' })).not.toBeInTheDocument();

        // It stays away on the next visit from this device.
        first.unmount();
        renderApp('/week/2027-W01');
        await region('Monday');

        expect(screen.queryByRole('complementary', { name: 'Welcome' })).not.toBeInTheDocument();
    });

    it('says nothing once Google is connected', async () => {
        mockApi({
            ...signedIn(),
            'GET /api/google': { body: { ...notConnected, tasks_connected: true } },
        });

        renderApp('/week/2027-W01');
        await region('Monday');
        await waitFor(() =>
            expect(
                screen.queryByRole('complementary', { name: 'Welcome' }),
            ).not.toBeInTheDocument(),
        );
    });
});
