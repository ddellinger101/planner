import { createEvent, fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { todayPeriod } from '@/lib/period';
import { makeItem, mockApi, renderApp, signedIn } from '@/test/helpers';

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

const region = (name: string | RegExp) => screen.findByRole('region', { name });
const today = () => todayPeriod('day', 'America/New_York').key;

describe('journal', () => {
    it('opens gratitude in full to write it, and shows it on one line afterwards', async () => {
        let entries: object[] = [];
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/journal': () => ({ body: entries }),
            'PUT /api/journal/2027-01-04/gratitude': ({ body }) => {
                entries = [
                    {
                        type: 'gratitude',
                        minutes: null,
                        period_key: '2027-01-04',
                        carried: false,
                        ...(body as object),
                    },
                ];

                return { body: entries[0] };
            },
        });
        const long =
            'A slow morning with good coffee, the kids laughing at breakfast, and a walk before the rain came in';

        renderApp('/day/2027-01-04');
        const line = await screen.findByRole('button', { name: /I’m grateful for/ });
        await waitFor(() => expect(line).toBeEnabled());
        expect(line).toHaveTextContent('Write…');

        await userEvent.click(line);
        const dialog = within(screen.getByRole('dialog', { name: 'I’m grateful for' }));
        const text = dialog.getByRole('textbox', { name: 'I’m grateful for' });

        expect(text).toHaveFocus();
        await userEvent.type(text, long);
        await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ body: long }),
        );
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        // The line shows it straight away, and holds the whole text for the popup.
        expect(line).toHaveTextContent(long);

        await userEvent.click(line);
        expect(screen.getByRole('textbox', { name: 'I’m grateful for' })).toHaveValue(long);
    });

    it('leaves an entry alone when the popup is closed or nothing changed', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/journal': {
                body: [
                    {
                        type: 'gratitude',
                        body: 'Coffee',
                        minutes: null,
                        period_key: '2027-01-04',
                        carried: false,
                    },
                ],
            },
        });

        renderApp('/day/2027-01-04');
        const line = await screen.findByRole('button', { name: /I’m grateful for/ });
        await waitFor(() => expect(line).toHaveTextContent('Coffee'));

        await userEvent.click(line);
        await userEvent.type(screen.getByRole('textbox', { name: 'I’m grateful for' }), ' and tea');
        await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

        await userEvent.click(line);
        expect(screen.getByRole('textbox', { name: 'I’m grateful for' })).toHaveValue('Coffee');
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));

        expect(calls.some((call) => call.method === 'PUT')).toBe(false);
        expect(line).toHaveTextContent('Coffee');
    });

    it('shows a carried affirmation, says where it came from, and keeps it once saved', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/journal': {
                body: [
                    {
                        type: 'affirmation',
                        body: 'I finish what I start',
                        minutes: null,
                        period_key: '2027-01-04',
                        carried: true,
                    },
                ],
            },
            'PUT /api/journal/2027-01-06/affirmation': ({ body }) => ({ body }),
        });

        renderApp('/day/2027-01-06');
        const line = await screen.findByRole('button', { name: /Affirmation/ });

        await waitFor(() => expect(line).toHaveTextContent('I finish what I start'));
        expect(screen.getByText('Carried from Mon, Jan 4')).toBeInTheDocument();

        // Just looking at it saves nothing.
        await userEvent.click(line);
        await userEvent.click(screen.getByRole('button', { name: 'Close' }));
        expect(calls.some((call) => call.method === 'PUT')).toBe(false);

        // Saving it unchanged makes it this day's own.
        await userEvent.click(line);
        await userEvent.click(screen.getByRole('button', { name: 'Save' }));
        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
                body: 'I finish what I start',
            }),
        );
    });

    it('records meditation minutes', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'PUT /api/journal/2027-01-04/meditation': ({ body }) => ({ body }),
        });

        renderApp('/day/2027-01-04');
        const field = await screen.findByLabelText('Meditation');
        await waitFor(() => expect(field).toBeEnabled());
        await userEvent.type(field, '10{Enter}');

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ minutes: 10 }),
        );
    });
});

describe('weight', () => {
    it('logs today’s weight from the Health box', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'POST /api/weight': ({ body }) => ({
                body: { id: 1, unit: 'lb', ...(body as object) },
            }),
        });

        renderApp('/day/2027-01-04');
        const field = within(await region('Health')).getByLabelText('Weight');
        await waitFor(() => expect(field).toBeEnabled());
        await userEvent.type(field, '182.4{Enter}');

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                date: '2027-01-04',
                weight: 182.4,
            }),
        );
    });

    it('shows the saved weight and ignores nonsense', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/weight': { body: [{ id: 5, date: '2027-01-04', weight: 181.9, unit: 'lb' }] },
        });

        renderApp('/day/2027-01-04');
        const field = within(await region('Health')).getByLabelText('Weight');

        await waitFor(() => expect(field).toHaveValue(181.9));
        await userEvent.clear(field);
        await userEvent.type(field, '5000{Enter}');

        expect(field).toHaveValue(181.9);
        expect(calls.some((call) => call.method === 'POST')).toBe(false);
    });
});

describe('schedule', () => {
    it('lists untimed tasks under Anytime and timed tasks on the hours', async () => {
        mockApi(
            signedIn([
                makeItem({ id: 1, title: 'Stretch' }),
                makeItem({ id: 2, title: 'Dentist', due_time: '15:30', duration_minutes: 60 }),
            ]),
        );

        renderApp('/day/2027-01-04');
        const schedule = within(await region('Schedule'));

        expect(await schedule.findByRole('checkbox', { name: 'Stretch' })).toBeInTheDocument();
        const timed = within(schedule.getByRole('list', { name: 'Timed tasks and events' }));
        expect(timed.getByRole('checkbox', { name: 'Dentist' })).toBeInTheDocument();
        expect(timed.getByText('3:30 PM')).toBeInTheDocument();
        expect(timed.queryByRole('checkbox', { name: 'Stretch' })).not.toBeInTheDocument();
        // 6 AM to 11 PM by default.
        expect(schedule.getByText('6 AM')).toBeInTheDocument();
        expect(schedule.getByText('10 PM')).toBeInTheDocument();
        expect(schedule.queryByText('5 AM')).not.toBeInTheDocument();
    });

    it('widens the day for a task outside the usual hours', async () => {
        mockApi(signedIn([makeItem({ id: 2, title: 'Early flight', due_time: '04:15' })]));

        renderApp('/day/2027-01-04');

        expect(await within(await region('Schedule')).findByText('4 AM')).toBeInTheDocument();
    });

    it('gives a task a time when it is dropped on an hour, and clears it on Anytime', async () => {
        let item = makeItem({ id: 9, title: 'Stretch' });
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/items': () => ({ body: [item] }),
            'PATCH /api/items/9': ({ body }) => {
                item = { ...item, ...(body as object) };
                return { body: item };
            },
        });

        renderApp('/day/2027-01-04');
        const schedule = await region('Schedule');
        await within(schedule).findByRole('checkbox', { name: 'Stretch' });

        const hours = schedule.querySelector('.timeline-hours')!;
        const dataTransfer = {
            types: ['application/x-planner-item'],
            getData: () => '9',
            dropEffect: 'none',
        };

        // jsdom has no layout, so the hours start at y=0: 104px is two hours past 6 AM.
        const drop = createEvent.drop(hours, { dataTransfer });
        Object.defineProperty(drop, 'clientY', { value: 104 });
        fireEvent(hours, drop);
        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
                due_time: '08:00',
            }),
        );

        await waitFor(() =>
            expect(
                within(
                    within(schedule).getByRole('list', { name: 'Timed tasks and events' }),
                ).getByText('8:00 AM'),
            ).toBeInTheDocument(),
        );

        fireEvent.drop(schedule.querySelector('.timeline-anytime')!, { dataTransfer });
        await waitFor(() =>
            expect(calls.filter((call) => call.method === 'PATCH').at(-1)?.body).toEqual({
                due_time: null,
                duration_minutes: null,
            }),
        );
    });
});

describe('routines', () => {
    it('shows routine tasks in their checklist, not in the category box', async () => {
        mockApi(signedIn([makeItem({ id: 3, title: 'Make the bed', routine: 'morning' })]));

        renderApp('/day/2027-01-04');

        expect(
            await within(await region('Morning routine')).findByRole('checkbox', {
                name: 'Make the bed',
            }),
        ).toBeInTheDocument();
        expect(
            within(await region('Health')).queryByRole('checkbox', { name: 'Make the bed' }),
        ).not.toBeInTheDocument();
        expect(
            within(await region('Evening routine')).getByText('Nothing in this routine yet.'),
        ).toBeInTheDocument();
    });

    it('adds a task to a routine', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'POST /api/items': ({ body }) => ({ status: 201, body: makeItem(body as object) }),
        });

        renderApp('/day/2027-01-04');
        await userEvent.type(
            await screen.findByRole('textbox', { name: 'Add to the evening routine' }),
            'Lay out clothes{Enter}',
        );

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                title: 'Lay out clothes',
                category_id: 1,
                scope: 'day',
                period_key: '2027-01-04',
                routine: 'evening',
                // A routine is always your own.
                assignee_user_id: 1,
            }),
        );
    });

    it('checks a habit off for the day', async () => {
        const { calls } = mockApi({
            ...signedIn(),
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
                        checks: [],
                    },
                ],
            },
            'PUT /api/habits/4/checks/2027-01-04': ({ body }) => ({ body }),
        });

        renderApp('/day/2027-01-04');
        const habit = await within(await region('Evening routine')).findByRole('checkbox', {
            name: 'Floss',
        });
        await userEvent.click(habit);

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ done: true }),
        );
    });
});

describe('meals and events', () => {
    it('shows the day’s meals from Chef, with recipe links', async () => {
        mockApi({
            ...signedIn(),
            'GET /api/meals': {
                body: [
                    {
                        id: 1,
                        date: '2027-01-04',
                        slot: 'dinner',
                        title: 'Tacos',
                        description: null,
                        chef_url: 'https://chef.dustindellinger.com/recipes/9',
                        source: 'chef',
                    },
                    {
                        id: 2,
                        date: '2027-01-04',
                        slot: 'unknown',
                        title: 'Salad',
                        description: null,
                        chef_url: null,
                        source: 'chef',
                    },
                    {
                        id: 3,
                        date: '2027-01-04',
                        slot: 'breakfast',
                        title: 'Oatmeal',
                        description: null,
                        chef_url: null,
                        source: 'chef',
                    },
                ],
            },
        });

        renderApp('/day/2027-01-04');
        const meals = within(await region('Meal plan'));

        expect(await meals.findByRole('link', { name: 'Tacos' })).toHaveAttribute(
            'href',
            'https://chef.dustindellinger.com/recipes/9',
        );
        // An unlabelled meal is listed with dinner.
        expect(meals.getByText('Salad').closest('div')).toHaveTextContent('Dinner');
        expect(meals.getByText('Oatmeal').closest('div')).toHaveTextContent('Breakfast');
        expect(meals.getByRole('link', { name: /Open in Chef/ })).toHaveAttribute(
            'href',
            'https://chef.dustindellinger.com',
        );
    });

    it('takes a note for a meal Chef hasn’t planned, but not for one it has', async () => {
        let meals = [
            {
                id: 1,
                date: '2027-01-04',
                slot: 'dinner',
                title: 'Tacos',
                description: null,
                chef_url: null,
                source: 'chef',
            },
            {
                id: 2,
                date: '2027-01-04',
                slot: 'lunch',
                title: 'Leftovers',
                description: null,
                chef_url: null,
                source: 'note',
            },
        ];
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/meals': () => ({ body: meals }),
            'PUT /api/meals': ({ body }) => {
                const note = body as { date: string; slot: string; title: string };
                meals = meals.filter((meal) => meal.slot !== note.slot);

                if (note.title === '') {
                    return { status: 204 };
                }

                const saved = { id: 9, description: null, chef_url: null, source: 'note', ...note };
                meals = [...meals, saved];

                return { body: saved };
            },
        });

        renderApp('/day/2027-01-04');
        const card = within(await region('Meal plan'));

        // Chef's dinner is text; the note and the empty slots are lines to write on.
        expect(await card.findByText('Tacos')).toBeInTheDocument();
        expect(card.queryByRole('textbox', { name: 'Dinner' })).not.toBeInTheDocument();
        expect(card.getByRole('textbox', { name: 'Lunch' })).toHaveValue('Leftovers');

        await userEvent.type(card.getByRole('textbox', { name: 'Breakfast' }), 'Pancakes{Enter}');
        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
                date: '2027-01-04',
                slot: 'breakfast',
                title: 'Pancakes',
            }),
        );
        await waitFor(() =>
            expect(card.getByRole('textbox', { name: 'Breakfast' })).toHaveValue('Pancakes'),
        );

        // Emptying a note clears it.
        await userEvent.clear(card.getByRole('textbox', { name: 'Lunch' }));
        await userEvent.tab();
        await waitFor(() =>
            expect(calls.filter((call) => call.method === 'PUT').at(-1)?.body).toEqual({
                date: '2027-01-04',
                slot: 'lunch',
                title: '',
            }),
        );
    });

    it('points to Settings for the calendar when it isn’t connected', async () => {
        mockApi(signedIn());

        renderApp('/day/2027-01-04');

        expect(
            await within(await region('Events')).findByText(/Connect Google Calendar/),
        ).toBeInTheDocument();
    });
});

describe('from earlier', () => {
    const overdue = [
        makeItem({
            id: 21,
            title: 'Renew passport',
            period_key: '2027-01-02',
            due_date: '2027-01-02',
        }),
        makeItem({
            id: 22,
            title: 'Call the bank',
            period_key: '2027-01-03',
            due_date: '2027-01-03',
        }),
    ];

    it('offers to move, finish or drop tasks left over from earlier days', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/items/overdue': { body: overdue },
            'PATCH /api/items/21': ({ body }) => ({
                body: makeItem({ id: 21, ...(body as object) }),
            }),
            'PATCH /api/items/22': ({ body }) => ({
                body: makeItem({ id: 22, ...(body as object) }),
            }),
        });

        renderApp('/day');
        const strip = within(await region(/From earlier/));

        expect(calls.find((call) => call.path === '/api/items/overdue')?.query.get('before')).toBe(
            today(),
        );
        expect(await strip.findByText('Saturday, Jan 2')).toBeInTheDocument();

        await userEvent.click(
            within(strip.getByRole('group', { name: 'Renew passport' })).getByRole('button', {
                name: 'Move to today',
            }),
        );
        await waitFor(() =>
            expect(calls.find((call) => call.path === '/api/items/21')?.body).toEqual({
                period_key: today(),
            }),
        );

        await userEvent.click(
            within(strip.getByRole('group', { name: 'Call the bank' })).getByRole('button', {
                name: 'Drop',
            }),
        );
        await waitFor(() =>
            expect(calls.find((call) => call.path === '/api/items/22')?.body).toEqual({
                status: 'dropped',
            }),
        );
    });

    it('collapses, and only appears on today', async () => {
        const { calls } = mockApi({ ...signedIn(), 'GET /api/items/overdue': { body: overdue } });

        const { unmount } = renderApp('/day');
        const toggle = await screen.findByRole('button', { name: /From earlier/ });

        expect(toggle).toHaveAttribute('aria-expanded', 'true');
        await userEvent.click(toggle);
        expect(toggle).toHaveAttribute('aria-expanded', 'false');
        expect(screen.queryByText('Renew passport')).not.toBeInTheDocument();
        unmount();

        calls.length = 0;
        renderApp('/day/2027-01-04');
        await region('Schedule');

        expect(screen.queryByRole('region', { name: /From earlier/ })).not.toBeInTheDocument();
        expect(calls.some((call) => call.path === '/api/items/overdue')).toBe(false);
    });
});

describe('progress', () => {
    it('counts routine tasks too, and leaves out dropped ones', async () => {
        mockApi(
            signedIn([
                makeItem({ id: 1, status: 'done' }),
                makeItem({ id: 2, title: 'Stretch' }),
                makeItem({ id: 3, title: 'Make the bed', routine: 'morning', status: 'done' }),
                makeItem({ id: 4, title: 'Skipped', status: 'dropped' }),
            ]),
        );

        renderApp('/day/2027-01-04');

        expect(await screen.findByRole('img', { name: '2 of 3 tasks done' })).toBeInTheDocument();
    });
});

describe('editing', () => {
    const repeating = makeItem({
        id: 30,
        title: 'Take vitamins',
        recurrence_rule: 'FREQ=DAILY',
        recurrence_parent_id: 29,
    });

    const openEditor = async (title: string) => {
        await userEvent.click(
            await within(await region('Health')).findByRole('button', { name: `Edit ${title}` }),
        );

        return within(screen.getByRole('dialog', { name: 'Edit task' }));
    };

    it('edits a task and sends only what changed', async () => {
        const { calls } = mockApi({
            ...signedIn([makeItem({ id: 7, title: 'Morning run' })]),
            'PATCH /api/items/7': ({ body }) => ({
                body: makeItem({ id: 7, ...(body as object) }),
            }),
        });

        renderApp('/day/2027-01-04');
        const dialog = await openEditor('Morning run');

        expect(dialog.getByLabelText('What needs doing?')).toHaveValue('Morning run');
        expect(dialog.getByRole('radio', { name: 'Health' })).toBeChecked();

        await userEvent.type(dialog.getByLabelText('Time (optional)'), '06:30');
        await userEvent.selectOptions(dialog.getByLabelText('Length'), '45');
        await userEvent.selectOptions(dialog.getByLabelText('Routine'), 'morning');
        await userEvent.type(dialog.getByLabelText('Notes'), 'Around the lake');
        await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
                due_time: '06:30',
                duration_minutes: 45,
                routine: 'morning',
                notes: 'Around the lake',
            }),
        );
        expect(calls.find((call) => call.method === 'PATCH')?.query.has('apply_to')).toBe(false);
    });

    it('closes without a request when nothing changed', async () => {
        const { calls } = mockApi(signedIn([makeItem({ id: 7, title: 'Morning run' })]));

        renderApp('/day/2027-01-04');
        const dialog = await openEditor('Morning run');
        await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
        expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
    });

    it('makes a task repeat, with presets built from its date', async () => {
        const { calls } = mockApi({
            ...signedIn([makeItem({ id: 7, title: 'Morning run' })]),
            'PATCH /api/items/7': ({ body }) => ({
                body: makeItem({ id: 7, ...(body as object) }),
            }),
        });

        renderApp('/day/2027-01-04');
        const dialog = await openEditor('Morning run');
        const repeat = dialog.getByLabelText('Repeat');

        expect(
            within(repeat).getByRole('option', { name: 'Every month on the first Monday' }),
        ).toBeInTheDocument();

        // Chosen days: starts on the task's own weekday, then add Wednesday, every 2 weeks.
        await userEvent.selectOptions(repeat, 'days');
        expect(dialog.getByRole('button', { name: 'Monday' })).toHaveAttribute(
            'aria-pressed',
            'true',
        );
        await userEvent.click(dialog.getByRole('button', { name: 'Wednesday' }));
        fireEvent.change(dialog.getByLabelText('Every how many weeks'), { target: { value: '2' } });
        await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

        // The task didn't repeat before, so there is nothing to ask.
        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
                recurrence_rule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE',
            }),
        );
    });

    it('asks which occurrences a change to a repeating task is for', async () => {
        const { calls } = mockApi({
            ...signedIn([repeating]),
            'PATCH /api/items/30': ({ body }) => ({ body: { ...repeating, ...(body as object) } }),
        });

        renderApp('/day/2027-01-04');
        const dialog = await openEditor('Take vitamins');

        await userEvent.clear(dialog.getByLabelText('What needs doing?'));
        await userEvent.type(dialog.getByLabelText('What needs doing?'), 'Supplements');
        await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

        const choice = within(dialog.getByRole('group', { name: 'Change which tasks?' }));
        expect(choice.getByRole('button', { name: 'Only this one' })).toBeInTheDocument();
        await userEvent.click(choice.getByRole('button', { name: 'This and following' }));

        await waitFor(() => {
            const patch = calls.find((call) => call.method === 'PATCH');

            expect(patch?.body).toEqual({ title: 'Supplements' });
            expect(patch?.query.get('apply_to')).toBe('following');
        });
    });

    it('does not offer "only this one" for a change of rule', async () => {
        mockApi(signedIn([repeating]));

        renderApp('/day/2027-01-04');
        const dialog = await openEditor('Take vitamins');

        await userEvent.selectOptions(dialog.getByLabelText('Repeat'), 'FREQ=WEEKLY;BYDAY=MO');
        await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

        const choice = within(dialog.getByRole('group', { name: 'Change which tasks?' }));
        expect(choice.queryByRole('button', { name: 'Only this one' })).not.toBeInTheDocument();
        expect(choice.getByRole('button', { name: 'All of them' })).toBeInTheDocument();

        await userEvent.click(choice.getByRole('button', { name: 'Back' }));
        expect(dialog.getByLabelText('Repeat')).toHaveValue('FREQ=WEEKLY;BYDAY=MO');
    });

    it('moves one occurrence to another day without asking', async () => {
        const { calls } = mockApi({
            ...signedIn([repeating]),
            'PATCH /api/items/30': ({ body }) => ({ body: { ...repeating, ...(body as object) } }),
        });

        renderApp('/day/2027-01-04');
        const dialog = await openEditor('Take vitamins');

        fireEvent.change(dialog.getByLabelText('Day'), { target: { value: '2027-01-05' } });
        await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
                period_key: '2027-01-05',
            }),
        );
    });

    it('deletes every occurrence of a repeating task on request', async () => {
        const { calls } = mockApi({
            ...signedIn([repeating]),
            'DELETE /api/items/30': { status: 204 },
        });

        renderApp('/day/2027-01-04');
        const dialog = await openEditor('Take vitamins');

        await userEvent.click(dialog.getByRole('button', { name: 'Delete this task' }));
        await userEvent.click(
            within(dialog.getByRole('group', { name: 'Delete which tasks?' })).getByRole('button', {
                name: 'All of them',
            }),
        );

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'DELETE')?.query.get('apply_to')).toBe(
                'all',
            ),
        );
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('explains an invalid custom rule', async () => {
        mockApi({
            ...signedIn([makeItem({ id: 7, title: 'Morning run' })]),
            'PATCH /api/items/7': {
                status: 422,
                body: {
                    errors: {
                        recurrence_rule: ['The recurrence rule is not a valid recurrence rule.'],
                    },
                },
            },
        });

        renderApp('/day/2027-01-04');
        const dialog = await openEditor('Morning run');

        await userEvent.selectOptions(dialog.getByLabelText('Repeat'), 'custom');
        fireEvent.change(dialog.getByLabelText('Recurrence rule'), {
            target: { value: 'freq=sometimes' },
        });
        expect(dialog.getByLabelText('Recurrence rule')).toHaveValue('FREQ=SOMETIMES');
        await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

        expect(await dialog.findByRole('alert')).toHaveTextContent('That repeat rule isn’t valid');
    });
});

describe('settings', () => {
    it('changes the hours the schedule shows', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'PATCH /api/me': ({ body }) => ({
                body: {
                    user: {
                        id: 1,
                        name: 'Dustin',
                        email: 'dustin@example.com',
                        avatar_url: null,
                        color: '#3b7dd8',
                        timezone: 'America/New_York',
                        day_start_hour: 6,
                        day_end_hour: 23,
                        ...(body as object),
                    },
                    household: { id: 1, name: 'Our Planner', members: [] },
                },
            }),
        });

        renderApp('/settings');
        const start = await screen.findByLabelText('Starts at');

        expect(start).toHaveValue('6');
        expect(screen.getByLabelText('Ends at')).toHaveValue('23');
        await userEvent.selectOptions(start, '5');

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
                day_start_hour: 5,
            }),
        );
        await waitFor(() => expect(screen.getByLabelText('Starts at')).toHaveValue('5'));
    });
});
