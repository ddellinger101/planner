import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayPeriod } from './lib/period';
import { makeItem, mockApi, renderApp, signedIn } from './test/helpers';

afterEach(() => {
    vi.unstubAllGlobals();
    window.history.replaceState(null, '', '/');
    window.localStorage.clear();
    document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
});

describe('signed out', () => {
    it('offers Google sign-in and links to the legal pages', async () => {
        mockApi({ 'GET /api/me': { status: 401, body: { message: 'Unauthenticated.' } } });

        renderApp();

        expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toHaveAttribute(
            'href',
            '/auth/google/redirect',
        );
        expect(screen.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
            'href',
            '/privacy',
        );
        expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
            'href',
            '/terms',
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('explains why an account was turned away', async () => {
        window.history.replaceState(null, '', '/?auth_error=not_allowed');
        mockApi({ 'GET /api/me': { status: 401 } });

        renderApp();

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'isn’t on this planner’s guest list',
        );
    });

    it('reports a server that is down', async () => {
        mockApi({ 'GET /api/me': { status: 500 } });

        renderApp();

        expect(await screen.findByRole('alert')).toHaveTextContent('The server did not respond.');
    });
});

// On the Day view a task shows in its category box and again on the schedule,
// so these look inside the Health box.
const healthBox = () => within(screen.getByRole('region', { name: 'Health' }));
const inHealth = async (name: string) =>
    within(await screen.findByRole('region', { name: 'Health' })).findByRole('checkbox', { name });

describe('the app shell', () => {
    it('opens on today and asks the API for today’s items', async () => {
        const { calls } = mockApi(signedIn());

        renderApp('/');

        const today = todayPeriod('day', 'America/New_York');

        await screen.findByRole('heading', { level: 2, name: 'Health' });
        expect(calls.find((call) => call.path === '/api/items')?.query.get('period_key')).toBe(
            today.key,
        );

        const rail = screen.getAllByRole('navigation', { name: 'Main' })[0];
        expect(within(rail).getByRole('link', { name: 'Day' })).toHaveAttribute(
            'aria-current',
            'page',
        );
        // Already on today, so there is nothing to jump back to.
        expect(screen.queryByRole('button', { name: 'Today' })).not.toBeInTheDocument();
    });

    it('shows a box per category with that category’s items', async () => {
        mockApi(
            signedIn([
                makeItem({ id: 1, title: 'Morning run', status: 'done' }),
                makeItem({ id: 2, title: 'Stretch' }),
                makeItem({ id: 3, title: 'Mix the chorus', category_id: 2 }),
            ]),
        );

        renderApp('/day/2027-01-04');

        expect(
            await screen.findByRole('heading', { level: 1, name: 'Monday' }),
        ).toBeInTheDocument();
        expect(screen.getByText('January 4, 2027')).toBeInTheDocument();

        const health = await screen.findByRole('region', { name: 'Health' });
        expect(await within(health).findAllByRole('checkbox')).toHaveLength(2);
        expect(within(health).getByText('1 of 2 done')).toBeInTheDocument();

        const music = screen.getByRole('region', { name: 'Only 4 You' });
        expect(within(music).getByRole('checkbox', { name: 'Mix the chorus' })).toBeInTheDocument();
        expect(
            within(screen.getByRole('region', { name: 'Other' })).getByText('Nothing here yet.'),
        ).toBeInTheDocument();
    });

    it('checks a task off immediately and tells the server', async () => {
        // The stub remembers the change, as the real server would.
        let item = makeItem({ id: 7, title: 'Morning run' });
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/items': () => ({ body: [item] }),
            'PATCH /api/items/7': ({ body }) => {
                item = { ...item, ...(body as object) };
                return { body: item };
            },
        });

        renderApp('/day/2027-01-04');
        await userEvent.click(await inHealth('Morning run'));

        await waitFor(() =>
            expect(healthBox().getByRole('checkbox', { name: 'Morning run' })).toHaveAttribute(
                'aria-checked',
                'true',
            ),
        );
        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ status: 'done' }),
        );
        expect(await screen.findByText('1 of 1 done')).toBeInTheDocument();
    });

    it('puts a failed change back the way it was', async () => {
        mockApi({
            ...signedIn([makeItem({ id: 7, title: 'Morning run' })]),
            'PATCH /api/items/7': { status: 500 },
        });

        renderApp('/day/2027-01-04');
        await userEvent.click(await inHealth('Morning run'));

        await waitFor(() =>
            expect(healthBox().getByRole('checkbox', { name: 'Morning run' })).toHaveAttribute(
                'aria-checked',
                'false',
            ),
        );
    });

    it('adds a goal from a category box on the week page', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'POST /api/items': ({ body }) => ({ status: 201, body: makeItem(body as object) }),
        });

        renderApp('/week/2027-W01');
        const input = await screen.findByRole('textbox', { name: 'Add a Health goal' });
        await userEvent.type(input, 'Run three times{Enter}');

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                title: 'Run three times',
                category_id: 1,
                scope: 'week',
                period_key: '2027-W01',
            }),
        );
        expect(input).toHaveValue('');
    });

    it('moves between periods and jumps back to today', async () => {
        const { calls } = mockApi(signedIn());

        renderApp('/week/2026-W53');

        expect(
            await screen.findByRole('heading', { level: 1, name: 'Week 53' }),
        ).toBeInTheDocument();
        expect(screen.getByText('Dec 28, 2026 – Jan 3, 2027')).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Next week' }));
        expect(
            await screen.findByRole('heading', { level: 1, name: 'Week 1' }),
        ).toBeInTheDocument();
        await waitFor(() =>
            expect(calls.some((call) => call.query.get('period_key') === '2027-W01')).toBe(true),
        );

        await userEvent.click(screen.getByRole('button', { name: 'Previous week' }));
        expect(
            await screen.findByRole('heading', { level: 1, name: 'Week 53' }),
        ).toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: 'Today' }));
        const thisWeek = todayPeriod('week', 'America/New_York');
        expect(
            await screen.findByRole('heading', {
                level: 1,
                name: `Week ${Number(thisWeek.key.slice(-2))}`,
            }),
        ).toBeInTheDocument();
    });

    it('keeps your place when switching from a day to its week and month', async () => {
        mockApi(signedIn());

        renderApp('/day/2027-01-31');
        await screen.findByRole('heading', { level: 1, name: 'Sunday' });

        const rail = screen.getAllByRole('navigation', { name: 'Main' })[0];
        expect(within(rail).getByRole('link', { name: 'Week' })).toHaveAttribute(
            'href',
            '/week/2027-W04',
        );
        expect(within(rail).getByRole('link', { name: 'Month' })).toHaveAttribute(
            'href',
            '/month/2027-01',
        );
        expect(within(rail).getByRole('link', { name: 'Quarter' })).toHaveAttribute(
            'href',
            '/quarter/2027-Q1',
        );
        expect(within(rail).getByRole('link', { name: 'Year' })).toHaveAttribute(
            'href',
            '/year/2027',
        );
    });

    it('filters by person and remembers the choice on this device', async () => {
        const { calls } = mockApi(signedIn());

        renderApp('/day/2027-01-04');
        await userEvent.click(await screen.findByRole('button', { name: 'Elizabeth' }));

        await waitFor(() =>
            expect(calls.some((call) => call.query.get('person') === '2')).toBe(true),
        );
        expect(screen.getByRole('button', { name: 'Elizabeth' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        expect(window.localStorage.getItem('planner.person')).toBe('2');

        await userEvent.click(screen.getByRole('button', { name: 'Both' }));
        expect(window.localStorage.getItem('planner.person')).toBeNull();
    });

    it('starts with the remembered person', async () => {
        window.localStorage.setItem('planner.person', '2');
        const { calls } = mockApi(signedIn());

        renderApp('/day/2027-01-04');

        await screen.findByRole('heading', { level: 2, name: 'Health' });
        expect(calls.find((call) => call.path === '/api/items')?.query.get('person')).toBe('2');
    });

    it('rejects a period key that doesn’t exist', async () => {
        mockApi(signedIn());

        renderApp('/week/2025-W53');

        expect(
            await screen.findByRole('heading', { name: 'That date doesn’t exist' }),
        ).toBeInTheDocument();
    });

    it('has a page for every destination', async () => {
        mockApi(signedIn());

        renderApp('/more');

        await screen.findByRole('heading', { level: 1, name: 'More' });
        const list = within(screen.getByRole('main')).getByRole('list');
        const links = within(list)
            .getAllByRole('link')
            .map((link) => [link.textContent, link.getAttribute('href')]);

        expect(links).toEqual([
            ['Brain Dump', '/brain-dump'],
            ['Routines & Habits', '/routines'],
            ['Weight', '/weight'],
            ['Rewards', '/rewards'],
            ['Settings', '/settings'],
        ]);

        await userEvent.click(within(list).getByRole('link', { name: 'Brain Dump' }));
        expect(
            await screen.findByRole('heading', { level: 1, name: 'Brain Dump' }),
        ).toBeInTheDocument();
    });

    it('signs out from Settings with the XSRF token', async () => {
        document.cookie = 'XSRF-TOKEN=abc%3D';
        const { fetchMock } = mockApi({ ...signedIn(), 'POST /auth/logout': { status: 204 } });

        renderApp('/settings');
        expect(await screen.findByText('dustin@example.com')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));

        expect(
            await screen.findByRole('link', { name: 'Sign in with Google' }),
        ).toBeInTheDocument();

        const logout = fetchMock.mock.calls.find(([url]) => url === '/auth/logout');
        expect(logout?.[1]?.headers).toMatchObject({ 'X-XSRF-TOKEN': 'abc=' });
    });
});

describe('quick add', () => {
    it('adds a timed, starred task to the day on screen', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'POST /api/items': ({ body }) => ({ status: 201, body: makeItem(body as object) }),
        });

        renderApp('/day/2027-01-04');
        await userEvent.click(await screen.findByRole('button', { name: 'Quick add' }));

        const dialog = screen.getByRole('dialog', { name: 'Quick add' });
        expect(within(dialog).getByLabelText('What needs doing?')).toHaveFocus();
        expect(within(dialog).getByText('Monday, Jan 4')).toBeInTheDocument();

        await userEvent.type(within(dialog).getByLabelText('What needs doing?'), 'Dentist');
        await userEvent.click(within(dialog).getByRole('radio', { name: 'Health' }));
        await userEvent.type(within(dialog).getByLabelText('Time (optional)'), '15:30');
        await userEvent.click(within(dialog).getByRole('button', { name: 'Star this' }));
        await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                title: 'Dentist',
                category_id: 1,
                scope: 'day',
                period_key: '2027-01-04',
                due_time: '15:30',
                duration_minutes: null,
                starred: true,
                routine: null,
                recurrence_rule: null,
                notes: null,
                assignee_user_id: 1,
            }),
        );
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('adds a goal to the period on screen, or to a chosen day instead', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'POST /api/items': ({ body }) => ({ status: 201, body: makeItem(body as object) }),
        });

        renderApp('/month/2027-03');
        await userEvent.click(await screen.findByRole('button', { name: 'Quick add' }));

        const dialog = screen.getByRole('dialog', { name: 'Quick add' });
        expect(within(dialog).getByText('March 2027')).toBeInTheDocument();
        // A goal has no time of day.
        expect(within(dialog).getByLabelText('Time (optional)')).toBeDisabled();
        // With nothing typed, there is nothing to add.
        expect(within(dialog).getByRole('button', { name: 'Add' })).toBeDisabled();

        await userEvent.type(within(dialog).getByLabelText('What needs doing?'), 'File taxes');
        await userEvent.click(within(dialog).getByRole('button', { name: 'Add' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toMatchObject({
                title: 'File taxes',
                category_id: 3, // defaults to Other
                scope: 'month',
                period_key: '2027-03',
                due_time: null,
            }),
        );
    });

    it('closes on Escape without saving', async () => {
        const { calls } = mockApi(signedIn());

        renderApp('/day/2027-01-04');
        await userEvent.click(await screen.findByRole('button', { name: 'Quick add' }));
        await userEvent.keyboard('{Escape}');

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(calls.some((call) => call.method === 'POST')).toBe(false);
    });
});
