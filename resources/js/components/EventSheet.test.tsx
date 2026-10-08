import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    eventMinutes,
    eventsFor,
    eventsOn,
    eventTimeLabel,
    type CalendarEvent,
} from '@/api/events';
import type { GoogleStatus } from '@/api/google';
import { mockApi, notConnected, renderApp, signedIn } from '@/test/helpers';

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
});

const NEW_YORK = 'America/New_York';
const region = (name: string) => screen.findByRole('region', { name });

function makeEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
    return {
        id: 1,
        google_event_id: 'g1',
        title: 'Dentist',
        location: null,
        description: null,
        all_day: false,
        // 2:00 to 3:00 PM in New York.
        starts_at: '2027-01-04T19:00:00.000000Z',
        ends_at: '2027-01-04T20:00:00.000000Z',
        starts_on: null,
        ends_on: null,
        owner_user_id: 1,
        editable: true,
        repeats: false,
        color: '#4285f4',
        calendar_name: 'Dustin',
        html_link: 'https://calendar.google.com/event?eid=g1',
        ...overrides,
    };
}

const allDay = (overrides: Partial<CalendarEvent> = {}) =>
    makeEvent({
        id: 2,
        google_event_id: 'g2',
        title: 'Conference',
        all_day: true,
        starts_at: null,
        ends_at: null,
        starts_on: '2027-01-04',
        ends_on: '2027-01-05',
        ...overrides,
    });

const withCalendar: GoogleStatus = {
    ...notConnected,
    calendar_connected: true,
    calendars: [
        {
            id: 31,
            summary: 'Dustin',
            color: '#4285f4',
            is_primary: true,
            writable: true,
            mode: 'events',
        },
        {
            id: 32,
            summary: 'Family',
            color: '#e67c73',
            is_primary: false,
            writable: true,
            mode: 'hidden',
        },
    ],
};

describe('placing events on days', () => {
    it('uses the day in the person’s time zone', () => {
        // 10:30 PM on the 4th in New York is already the 5th in UTC.
        const late = makeEvent({
            starts_at: '2027-01-05T03:30:00.000000Z',
            ends_at: '2027-01-05T04:30:00.000000Z',
        });

        expect(eventsOn([late], '2027-01-04', NEW_YORK)).toHaveLength(1);
        expect(eventsOn([late], '2027-01-05', NEW_YORK)).toHaveLength(0);
        expect(eventTimeLabel(late, '2027-01-04', NEW_YORK)).toBe('10:30 PM – 11:30 PM');
    });

    it('shows an event on each day it touches, but not on the day it ends at midnight', () => {
        const overnight = makeEvent({
            starts_at: '2027-01-05T02:00:00.000000Z', // 9 PM on the 4th
            ends_at: '2027-01-05T07:00:00.000000Z', // 2 AM on the 5th
        });
        const untilMidnight = makeEvent({
            starts_at: '2027-01-05T02:00:00.000000Z',
            ends_at: '2027-01-05T05:00:00.000000Z',
        });

        expect(eventsOn([overnight], '2027-01-05', NEW_YORK)).toHaveLength(1);
        expect(eventMinutes(overnight, '2027-01-04', NEW_YORK)).toEqual({ start: 1260, end: 1440 });
        expect(eventMinutes(overnight, '2027-01-05', NEW_YORK)).toEqual({ start: 0, end: 120 });
        expect(eventTimeLabel(overnight, '2027-01-05', NEW_YORK)).toBe('Until 2:00 AM');
        expect(eventsOn([untilMidnight], '2027-01-05', NEW_YORK)).toHaveLength(0);

        expect(eventsOn([allDay()], '2027-01-05', NEW_YORK)).toHaveLength(1);
        expect(eventsOn([allDay()], '2027-01-06', NEW_YORK)).toHaveLength(0);
    });

    it('shows a calendar both people follow once, and filters by person', () => {
        const mine = makeEvent();
        const theirs = makeEvent({ id: 9, owner_user_id: 2 });
        const local = makeEvent({ id: 10, google_event_id: null, owner_user_id: 2 });

        expect(eventsFor([mine, theirs, local], null).map((event) => event.id)).toEqual([1, 10]);
        expect(eventsFor([mine, theirs, local], 2).map((event) => event.id)).toEqual([9, 10]);
    });
});

describe('the day’s events', () => {
    it('lists them and puts the timed ones on the schedule', async () => {
        mockApi({ ...signedIn(), 'GET /api/events': { body: [makeEvent(), allDay()] } });

        renderApp('/day/2027-01-04');
        const events = within(await region('Events'));

        expect(
            await events.findByRole('button', { name: 'Dentist, 2:00 PM – 3:00 PM' }),
        ).toBeInTheDocument();
        expect(events.getByRole('button', { name: 'Conference, All day' })).toBeInTheDocument();

        const schedule = within(screen.getByRole('list', { name: 'Timed tasks and events' }));
        expect(schedule.getByRole('button', { name: /Dentist/ })).toBeInTheDocument();
        expect(schedule.queryByRole('button', { name: /Conference/ })).not.toBeInTheDocument();
    });

    it('keeps events that last the whole day above the hours', async () => {
        const midnightToMidnight = makeEvent({
            id: 3,
            google_event_id: 'g3',
            title: 'Wyeth',
            starts_at: '2027-01-04T05:00:00.000000Z',
            ends_at: '2027-01-05T05:00:00.000000Z',
        });
        mockApi({
            ...signedIn(),
            'GET /api/events': { body: [makeEvent(), allDay(), midnightToMidnight] },
        });

        renderApp('/day/2027-01-04');
        const schedule = within(await region('Schedule'));
        const wholeDay = within(await schedule.findByRole('list', { name: 'All-day events' }));

        expect(wholeDay.getByRole('button', { name: 'Conference, All day' })).toBeInTheDocument();
        expect(wholeDay.getByRole('button', { name: 'Wyeth, All day' })).toBeInTheDocument();
        expect(wholeDay.queryByRole('button', { name: /Dentist/ })).not.toBeInTheDocument();

        // The day isn't stretched back to midnight to fit them.
        expect(schedule.queryByText('12 AM')).not.toBeInTheDocument();
        expect(
            within(schedule.getByRole('list', { name: 'Timed tasks and events' })).queryByRole(
                'button',
                { name: /Wyeth/ },
            ),
        ).not.toBeInTheDocument();
    });

    it('gives each event the full width, laying a later one over an earlier one', async () => {
        const at = (id: number, title: string, start: string, end: string) =>
            makeEvent({
                id,
                google_event_id: `g${id}`,
                title,
                starts_at: `2027-01-04T${start}:00.000000Z`,
                ends_at: `2027-01-04T${end}:00.000000Z`,
            });
        mockApi({
            ...signedIn(),
            'GET /api/events': {
                body: [
                    at(1, 'Basketball', '20:00', '22:00'), // 3:00 to 5:00 PM
                    at(2, 'Pickup', '20:45', '21:30'), // 3:45 to 4:30 PM
                    at(3, 'Lunch', '17:00', '18:00'), // noon
                    at(4, 'Call', '17:00', '17:30'), // noon as well
                ],
            },
        });

        renderApp('/day/2027-01-04');
        const schedule = within(await region('Schedule'));
        // How deep it is stacked, and its place among those that start with it.
        const placeOf = async (name: RegExp) => {
            const { style } = (await schedule.findByRole('button', { name })).closest('li')!;

            return ['--depth', '--column', '--columns'].map((name) => style.getPropertyValue(name));
        };

        expect(await placeOf(/Basketball/)).toEqual(['0', '0', '1']);
        // Stepped in, and otherwise as wide as the day.
        expect(await placeOf(/Pickup/)).toEqual(['1', '0', '1']);
        // Two that start together share the width, or one would hide the other.
        expect(await placeOf(/Lunch/)).toEqual(['0', '0', '2']);
        expect(await placeOf(/Call/)).toEqual(['0', '1', '2']);
    });

    it('opens an event to read it in full', async () => {
        mockApi({
            ...signedIn(),
            'GET /api/events': {
                body: [
                    makeEvent({
                        title: 'Dylan pickup and drop off at practice',
                        location: '12 Main St',
                        description:
                            'Bring <b>cleats</b> &amp; water.<br>Map: https://example.com/field',
                    }),
                ],
            },
        });

        renderApp('/day/2027-01-04');
        await userEvent.click(
            await within(await region('Schedule')).findByRole('button', { name: /Dylan pickup/ }),
        );

        const dialog = within(
            screen.getByRole('dialog', { name: 'Dylan pickup and drop off at practice' }),
        );
        expect(dialog.getByText(/2:00 PM – 3:00 PM/)).toBeInTheDocument();
        expect(dialog.getByRole('link', { name: '12 Main St' })).toHaveAttribute(
            'href',
            'https://www.google.com/maps/search/?api=1&query=12%20Main%20St',
        );
        expect(dialog.getByText(/Bring cleats & water./)).toBeInTheDocument();
        expect(dialog.getByRole('link', { name: 'https://example.com/field' })).toBeInTheDocument();
        expect(dialog.getByText(/On the “Dustin” calendar/)).toBeInTheDocument();
        expect(dialog.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });

    it('changes an event', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/events': { body: [makeEvent({ location: '12 Main St' })] },
            'PUT /api/events/1': { body: makeEvent() },
        });

        renderApp('/day/2027-01-04');
        await userEvent.click(
            await within(await region('Events')).findByRole('button', { name: /Dentist/ }),
        );

        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));

        const dialog = within(screen.getByRole('dialog', { name: 'Edit event' }));
        expect(dialog.getByLabelText('Starts')).toHaveValue('14:00');
        expect(dialog.getByLabelText('Ends (optional)')).toHaveValue('15:00');
        expect(dialog.getByLabelText('Where (optional)')).toHaveValue('12 Main St');

        await userEvent.clear(dialog.getByLabelText('What is it?'));
        await userEvent.type(dialog.getByLabelText('What is it?'), 'Dentist: cleaning');
        fireEvent.change(dialog.getByLabelText('Starts'), { target: { value: '14:30' } });
        await userEvent.click(dialog.getByRole('button', { name: 'Save' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({
                title: 'Dentist: cleaning',
                location: '12 Main St',
                all_day: false,
                date: '2027-01-04',
                start_time: '14:30',
                end_time: '15:00',
            }),
        );
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('deletes an event', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/events': { body: [makeEvent()] },
            'DELETE /api/events/1': { status: 204 },
        });

        renderApp('/day/2027-01-04');
        await userEvent.click(
            await within(await region('Events')).findByRole('button', { name: /Dentist/ }),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Edit' }));
        await userEvent.click(screen.getByRole('button', { name: 'Delete this event' }));

        await waitFor(() => expect(calls.some((call) => call.method === 'DELETE')).toBe(true));
    });

    it('only shows an event that Google Calendar has to change', async () => {
        mockApi({
            ...signedIn(),
            'GET /api/events': {
                body: [makeEvent({ title: 'Stand-up', editable: false, repeats: true })],
            },
        });

        renderApp('/day/2027-01-04');
        await userEvent.click(
            await within(await region('Events')).findByRole('button', { name: /Stand-up/ }),
        );

        const dialog = within(screen.getByRole('dialog', { name: 'Stand-up' }));
        expect(dialog.getByText(/Jan(uary)? 4/)).toBeInTheDocument();
        expect(dialog.getByText(/2:00 PM – 3:00 PM/)).toBeInTheDocument();
        expect(dialog.getByText(/changed in Google Calendar/)).toBeInTheDocument();
        expect(dialog.getByRole('link', { name: /Open in Google Calendar/ })).toHaveAttribute(
            'href',
            'https://calendar.google.com/event?eid=g1',
        );
        expect(dialog.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    });

    it('adds an all-day event from the day', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/google': { body: withCalendar },
            'POST /api/events': { status: 201, body: allDay() },
        });

        renderApp('/day/2027-01-04');
        await userEvent.click(
            await within(await region('Events')).findByRole('button', { name: 'Add an event' }),
        );

        const dialog = within(screen.getByRole('dialog', { name: 'New event' }));
        expect(await dialog.findByText(/added to your Google Calendar/)).toBeInTheDocument();
        expect(dialog.getByLabelText('All day')).toBeChecked();
        expect(dialog.getByLabelText('From')).toHaveValue('2027-01-04');

        await userEvent.type(dialog.getByLabelText('What is it?'), 'Conference');
        fireEvent.change(dialog.getByLabelText('To (optional)'), {
            target: { value: '2027-01-05' },
        });
        await userEvent.click(dialog.getByRole('button', { name: 'Add event' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                title: 'Conference',
                location: null,
                all_day: true,
                date: '2027-01-04',
                end_date: '2027-01-05',
            }),
        );
    });

    it('turns a quick add into a calendar event, keeping what was typed', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'POST /api/events': { status: 201, body: makeEvent() },
        });

        renderApp('/day/2027-01-04');
        await userEvent.click(await screen.findByRole('button', { name: 'Quick add' }));

        const quickAdd = within(screen.getByRole('dialog', { name: 'Quick add' }));
        await userEvent.type(quickAdd.getByLabelText('What needs doing?'), 'Dentist');
        await userEvent.click(quickAdd.getByRole('button', { name: 'Make it a calendar event' }));

        const dialog = within(screen.getByRole('dialog', { name: 'New event' }));
        expect(dialog.getByLabelText('What is it?')).toHaveValue('Dentist');
        expect(dialog.getByText(/stays in the planner until you connect/)).toBeInTheDocument();

        await userEvent.click(dialog.getByLabelText('All day'));
        expect(dialog.getByRole('button', { name: 'Add event' })).toBeDisabled();
        fireEvent.change(dialog.getByLabelText('Starts'), { target: { value: '14:00' } });
        await userEvent.click(dialog.getByRole('button', { name: 'Add event' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                title: 'Dentist',
                location: null,
                all_day: false,
                date: '2027-01-04',
                start_time: '14:00',
                end_time: null,
            }),
        );
    });

    it('shows only the chosen person’s events', async () => {
        window.localStorage.setItem('planner.person', '2');
        mockApi({
            ...signedIn(),
            'GET /api/events': {
                body: [
                    makeEvent(),
                    makeEvent({
                        id: 5,
                        google_event_id: 'g5',
                        title: 'Book club',
                        owner_user_id: 2,
                    }),
                ],
            },
        });

        renderApp('/day/2027-01-04');
        const events = within(await region('Events'));

        expect(await events.findByRole('button', { name: /Book club/ })).toBeInTheDocument();
        expect(events.queryByRole('button', { name: /Dentist/ })).not.toBeInTheDocument();
    });
});

describe('events on the week and month', () => {
    it('shows them on their day of the week', async () => {
        mockApi({ ...signedIn(), 'GET /api/events': { body: [makeEvent(), allDay()] } });

        renderApp('/week/2027-W01');

        const monday = within(await region('Monday'));
        expect(await monday.findByRole('button', { name: /Dentist/ })).toBeInTheDocument();
        expect(monday.getByRole('button', { name: /Conference/ })).toBeInTheDocument();

        const tuesday = within(await region('Tuesday'));
        expect(tuesday.getByRole('button', { name: /Conference/ })).toBeInTheDocument();
        expect(tuesday.queryByRole('button', { name: /Dentist/ })).not.toBeInTheDocument();
    });

    it('names them on the month calendar', async () => {
        mockApi({ ...signedIn(), 'GET /api/events': { body: [makeEvent()] } });

        renderApp('/month/2027-01');

        expect(
            await screen.findByRole('link', {
                name: 'Monday, January 4, 2027, no tasks, Dentist',
            }),
        ).toBeInTheDocument();
    });
});

describe('calendar settings', () => {
    it('chooses what each calendar is for', async () => {
        let status = withCalendar;
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/google': () => ({ body: status }),
            'PATCH /api/google/calendars/32': ({ body }) => {
                const { mode } = body as { mode: 'menu' };
                status = {
                    ...status,
                    calendars: status.calendars.map((calendar) =>
                        calendar.id === 32 ? { ...calendar, mode } : calendar,
                    ),
                };
                return { body: status };
            },
        });

        renderApp('/settings');
        const google = within(await region('Google'));

        expect(await google.findByLabelText(/Dustin/)).toHaveValue('events');
        expect(google.getByText(/No calendar is set to “Meals from Chef” yet/)).toBeInTheDocument();
        // Your own calendar can't be the one Chef writes meals to.
        expect(
            within(google.getByLabelText(/Dustin/)).queryByRole('option', {
                name: 'Meals from Chef',
            }),
        ).not.toBeInTheDocument();

        await userEvent.selectOptions(google.getByLabelText('Family'), 'Meals from Chef');

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({ mode: 'menu' }),
        );
        await waitFor(() => expect(google.getByLabelText('Family')).toHaveValue('menu'));
        expect(google.queryByText(/No calendar is set/)).not.toBeInTheDocument();
    });

    it('asks to connect again when calendar access is missing', async () => {
        mockApi({
            ...signedIn(),
            'GET /api/google': { body: { ...notConnected, tasks_connected: true } },
        });

        renderApp('/settings');

        expect(
            await within(await region('Google')).findByText(
                /Google Calendar access hasn’t been granted/,
            ),
        ).toBeInTheDocument();
    });
});

describe('important dates and meals', () => {
    it('offers to add an important date to Google Calendar once it is connected', async () => {
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/google': { body: withCalendar },
            'POST /api/important-dates': { status: 201, body: {} },
        });

        renderApp('/month/2027-01');
        const card = within(await region('Important dates'));

        await userEvent.type(card.getByLabelText('What is it?'), 'Recital');
        fireEvent.change(card.getByLabelText('Date'), { target: { value: '2027-01-20' } });
        await userEvent.click(await card.findByLabelText('Add to Google Calendar'));
        await userEvent.click(card.getByRole('button', { name: 'Add' }));

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                title: 'Recital',
                date: '2027-01-20',
                repeats_yearly: false,
                add_to_calendar: true,
            }),
        );
    });

    it('shows what is served with a meal', async () => {
        mockApi({
            ...signedIn(),
            'GET /api/meals': {
                body: [
                    {
                        id: 1,
                        date: '2027-01-04',
                        slot: 'dinner',
                        title: 'Chicken Tikka Masala',
                        description: 'Naan\nCucumber salad',
                        chef_url: 'https://chef.dustindellinger.com/tonight?date=2027-01-04',
                        source: 'chef',
                    },
                ],
            },
        });

        renderApp('/day/2027-01-04');
        const meals = within(await region('Meal plan'));

        expect(await meals.findByRole('link', { name: 'Chicken Tikka Masala' })).toHaveAttribute(
            'href',
            'https://chef.dustindellinger.com/tonight?date=2027-01-04',
        );
        expect(meals.getByText('with Naan, Cucumber salad')).toBeInTheDocument();
    });
});
