import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NotificationStatus } from '@/api/notifications';
import { mockApi, notificationsOff, renderApp, signedIn } from '@/test/helpers';

afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    Reflect.deleteProperty(navigator, 'serviceWorker');
});

const ready: NotificationStatus = {
    ...notificationsOff,
    configured: true,
    // Any URL-safe base64 will do: the browser's part is stubbed.
    vapid_public_key: 'BPubKey-_abc123',
};

const card = async () => within(await screen.findByRole('region', { name: 'Notifications' }));

/** A browser that supports push, with or without a subscription on this device. */
function stubPush({ subscribed = false, permission = 'granted' as NotificationPermission } = {}) {
    let subscription: object | null = subscribed ? makeSubscription() : null;

    function makeSubscription() {
        return {
            endpoint: 'https://push.example.com/this-device',
            toJSON: () => ({ keys: { p256dh: 'p256', auth: 'auth' } }),
            unsubscribe: vi.fn(async () => {
                subscription = null;

                return true;
            }),
        };
    }

    const pushManager = {
        getSubscription: vi.fn(async () => subscription),
        subscribe: vi.fn(async () => (subscription = makeSubscription())),
    };
    const registration = { pushManager };

    Object.defineProperty(navigator, 'serviceWorker', {
        configurable: true,
        value: {
            getRegistration: async () => registration,
            register: async () => registration,
            ready: Promise.resolve(registration),
            controller: null,
        },
    });
    vi.stubGlobal('PushManager', class {});
    vi.stubGlobal('Notification', { requestPermission: vi.fn(async () => permission) });

    return pushManager;
}

describe('notification settings', () => {
    it('says so when the server has no keys yet', async () => {
        stubPush();
        mockApi(signedIn());

        renderApp('/settings');

        expect(
            await (await card()).findByText(/aren’t set up on the server yet/),
        ).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Turn on/ })).not.toBeInTheDocument();
    });

    it('says so when the browser can’t do it', async () => {
        mockApi({ ...signedIn(), 'GET /api/notifications': { body: ready } });

        renderApp('/settings');

        expect(
            await (await card()).findByText('This browser can’t show notifications.'),
        ).toBeInTheDocument();
    });

    it('turns notifications on for this device', async () => {
        const pushManager = stubPush();
        let status = ready;
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/notifications': () => ({ body: status }),
            'POST /api/notifications/subscriptions': () => {
                status = { ...status, devices: 1 };

                return { body: status };
            },
        });

        renderApp('/settings');
        const notifications = await card();

        expect(
            await notifications.findByText(/Notifications are off everywhere/),
        ).toBeInTheDocument();

        await userEvent.click(
            await notifications.findByRole('button', { name: 'Turn on for this device' }),
        );

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
                endpoint: 'https://push.example.com/this-device',
                keys: { p256dh: 'p256', auth: 'auth' },
            }),
        );
        expect(pushManager.subscribe).toHaveBeenCalledWith(
            expect.objectContaining({ userVisibleOnly: true }),
        );
        expect(
            await notifications.findByText('On for 1 device, including this one.'),
        ).toBeInTheDocument();
        expect(notifications.getByRole('button', { name: 'Send a test' })).toBeInTheDocument();
    });

    it('explains what to do when the browser has notifications blocked', async () => {
        stubPush({ permission: 'denied' });
        const { calls } = mockApi({ ...signedIn(), 'GET /api/notifications': { body: ready } });

        renderApp('/settings');
        const notifications = await card();

        await userEvent.click(
            await notifications.findByRole('button', { name: 'Turn on for this device' }),
        );

        expect(
            await notifications.findByText(/Notifications are blocked for this site/),
        ).toBeInTheDocument();
        expect(calls.some((call) => call.method === 'POST')).toBe(false);
    });

    it('sends a test and turns this device off', async () => {
        stubPush({ subscribed: true });
        let status = { ...ready, devices: 2 };
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/notifications': () => ({ body: status }),
            'POST /api/notifications/test': { body: { sent: 2 } },
            'DELETE /api/notifications/subscriptions': () => {
                status = { ...status, devices: 1 };

                return { status: 204 };
            },
        });

        renderApp('/settings');
        const notifications = await card();

        expect(
            await notifications.findByText('On for 2 devices, including this one.'),
        ).toBeInTheDocument();

        await userEvent.click(notifications.getByRole('button', { name: 'Send a test' }));
        expect(await notifications.findByText(/Sent to 2 devices/)).toBeInTheDocument();

        await userEvent.click(
            notifications.getByRole('button', { name: 'Turn off on this device' }),
        );

        await waitFor(() =>
            expect(calls.find((call) => call.method === 'DELETE')?.body).toEqual({
                endpoint: 'https://push.example.com/this-device',
            }),
        );
        expect(
            await notifications.findByRole('button', { name: 'Turn on for this device' }),
        ).toBeInTheDocument();
    });

    it('chooses which reminders to get, and when', async () => {
        stubPush({ subscribed: true });
        let status = { ...ready, devices: 1 };
        const { calls } = mockApi({
            ...signedIn(),
            'GET /api/notifications': () => ({ body: status }),
            'PATCH /api/notifications': ({ body }) => {
                status = { ...status, preferences: { ...status.preferences, ...(body as object) } };

                return { body: status };
            },
        });
        const patches = () =>
            calls.filter((call) => call.method === 'PATCH').map((call) => call.body);

        renderApp('/settings');
        const notifications = await card();
        const morning = await notifications.findByRole('checkbox', { name: 'Morning routine' });

        expect(morning).toBeChecked();
        expect(notifications.getByLabelText('How long before a task')).toHaveValue('10');

        await userEvent.click(morning);
        await waitFor(() => expect(patches()).toContainEqual({ morning: false }));
        // Its time can't be set while it is off.
        await waitFor(() =>
            expect(notifications.getByLabelText('Morning routine reminder time')).toBeDisabled(),
        );

        await userEvent.selectOptions(
            notifications.getByLabelText('How long before a task'),
            '30 minutes before',
        );
        await waitFor(() => expect(patches()).toContainEqual({ task_lead_minutes: 30 }));

        const evening = notifications.getByLabelText('Evening routine reminder time');
        fireEvent.change(evening, { target: { value: '21:15' } });
        fireEvent.blur(evening);
        await waitFor(() => expect(patches()).toContainEqual({ evening_time: '21:15' }));
    });
});
