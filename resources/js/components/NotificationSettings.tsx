import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, CircleAlert } from 'lucide-react';
import { useState } from 'react';
import {
    forgetSubscription,
    saveSubscription,
    sendTestNotification,
    useNotifications,
    useSavePreferences,
    type NotificationPreferences,
} from '@/api/notifications';
import { formatTime } from '@/lib/periodLabels';
import {
    currentSubscription,
    isAppleMobile,
    isInstalled,
    pushSupported,
    subscribeDevice,
    unsubscribeDevice,
} from '@/lib/push';

const LEAD_TIMES = [0, 5, 10, 15, 30, 60];

const leadName = (minutes: number) =>
    minutes === 0
        ? 'When it starts'
        : minutes === 60
          ? '1 hour before'
          : `${minutes} minutes before`;

/** Push notifications: turning them on for this device, and choosing which reminders to get. */
export default function NotificationSettings() {
    const queryClient = useQueryClient();
    const status = useNotifications();
    const save = useSavePreferences();
    const [message, setMessage] = useState<string | null>(null);
    // Whether this device, as opposed to another of the person's, is subscribed.
    const device = useQuery({
        queryKey: ['notifications', 'device'],
        queryFn: async () => (await currentSubscription()) !== null,
    });

    const refresh = () => queryClient.invalidateQueries({ queryKey: ['notifications'] });

    const turnOn = useMutation({
        mutationFn: async () =>
            saveSubscription(await subscribeDevice(status.data!.vapid_public_key!)),
        onSuccess: () => setMessage(null),
        onError: (error) =>
            setMessage(
                error instanceof Error && error.message === 'denied'
                    ? 'Notifications are blocked for this site. Allow them in your browser’s settings, then try again.'
                    : 'That didn’t work. Please try again.',
            ),
        onSettled: refresh,
    });

    const turnOff = useMutation({
        mutationFn: async () => {
            const endpoint = await unsubscribeDevice();

            if (endpoint) {
                await forgetSubscription(endpoint);
            }
        },
        onSettled: refresh,
    });

    const test = useMutation({
        mutationFn: sendTestNotification,
        onSuccess: ({ sent }) =>
            setMessage(
                sent === 0
                    ? 'None of your devices could be reached. Try turning notifications off and on again.'
                    : `Sent to ${sent === 1 ? '1 device' : `${sent} devices`}. It should arrive in a moment.`,
            ),
        onError: () => setMessage('The test didn’t send. Please try again.'),
        onSettled: refresh,
    });

    const data = status.data;
    const busy = turnOn.isPending || turnOff.isPending || test.isPending;
    const onThisDevice = device.data === true;
    // On an iPhone or iPad the browser tab can't subscribe; the Home Screen app can.
    const needsInstall = isAppleMobile() && !isInstalled();

    return (
        <section className="planner-card p-3" aria-labelledby="settings-notifications">
            <h2 id="settings-notifications" className="font-display h3">
                Notifications
            </h2>

            {status.isError && (
                <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
                    The notification settings didn’t load.
                </p>
            )}

            {data && !data.configured && (
                <p className="small d-flex gap-2 align-items-start">
                    <CircleAlert aria-hidden="true" size={16} className="flex-shrink-0 mt-1" />
                    Notifications aren’t set up on the server yet, so nothing can be sent.
                </p>
            )}

            {data && data.configured && (
                <>
                    {needsInstall ? (
                        <p className="small">
                            On an iPhone or iPad, add the planner to your Home Screen first: tap
                            Share, then <strong>Add to Home Screen</strong>. Open it from there and
                            come back to this page to turn notifications on. (Needs iOS 16.4 or
                            later.)
                        </p>
                    ) : !pushSupported() ? (
                        <p className="small">This browser can’t show notifications.</p>
                    ) : (
                        <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
                            {onThisDevice ? (
                                <>
                                    <button
                                        type="button"
                                        className="button-ink is-small d-inline-flex align-items-center gap-2"
                                        disabled={busy}
                                        onClick={() => test.mutate()}
                                    >
                                        <BellRing aria-hidden="true" size={15} /> Send a test
                                    </button>
                                    <button
                                        type="button"
                                        className="button-plain is-small"
                                        disabled={busy}
                                        onClick={() => turnOff.mutate()}
                                    >
                                        Turn off on this device
                                    </button>
                                </>
                            ) : (
                                <button
                                    type="button"
                                    className="button-ink is-small d-inline-flex align-items-center gap-2"
                                    disabled={busy || device.isPending}
                                    onClick={() => turnOn.mutate()}
                                >
                                    <BellRing aria-hidden="true" size={15} /> Turn on for this
                                    device
                                </button>
                            )}
                        </div>
                    )}

                    <p className="text-soft small" aria-live="polite">
                        {message ??
                            (data.devices === 0
                                ? 'Notifications are off everywhere. Each phone or computer is turned on separately.'
                                : `On for ${data.devices === 1 ? '1 device' : `${data.devices} devices`}${onThisDevice ? ', including this one' : ', but not this one'}.`)}
                    </p>

                    <Preferences
                        preferences={data.preferences}
                        disabled={save.isPending}
                        onChange={(changes) => save.mutate(changes)}
                    />
                    {save.isError && (
                        <p
                            className="small mt-2 mb-0"
                            role="alert"
                            style={{ color: 'var(--danger)' }}
                        >
                            That didn’t save. Please try again.
                        </p>
                    )}
                </>
            )}
        </section>
    );
}

type PreferencesProps = {
    preferences: NotificationPreferences;
    disabled: boolean;
    onChange: (changes: Partial<NotificationPreferences>) => void;
};

/** Which reminders to get. They apply to every device the person has turned on. */
function Preferences({ preferences, disabled, onChange }: PreferencesProps) {
    const toggle = (
        key: 'tasks' | 'morning' | 'evening' | 'weekly' | 'monthly' | 'rewards',
        label: string,
    ) => (
        <label className="date-form-yearly">
            <input
                type="checkbox"
                checked={preferences[key]}
                disabled={disabled}
                onChange={(event) => onChange({ [key]: event.target.checked })}
            />
            {label}
        </label>
    );

    const time = (
        key: 'morning_time' | 'evening_time' | 'weekly_time',
        label: string,
        enabled: boolean,
    ) => (
        <input
            type="time"
            className="field-input reminder-time"
            aria-label={label}
            // Read the value from the server again if the time is cleared.
            key={preferences[key]}
            defaultValue={preferences[key]}
            disabled={disabled || !enabled}
            onBlur={(event) =>
                event.target.value &&
                event.target.value !== preferences[key] &&
                onChange({ [key]: event.target.value })
            }
        />
    );

    return (
        <fieldset className="reminders">
            <legend className="field-label">Remind me</legend>

            <div className="reminder-row">
                {toggle('tasks', 'Before a task with a time')}
                <select
                    className="field-input reminder-time"
                    aria-label="How long before a task"
                    value={preferences.task_lead_minutes}
                    disabled={disabled || !preferences.tasks}
                    onChange={(event) =>
                        onChange({ task_lead_minutes: Number(event.target.value) })
                    }
                >
                    {LEAD_TIMES.map((minutes) => (
                        <option key={minutes} value={minutes}>
                            {leadName(minutes)}
                        </option>
                    ))}
                </select>
            </div>
            <div className="reminder-row">
                {toggle('morning', 'Morning routine')}
                {time('morning_time', 'Morning routine reminder time', preferences.morning)}
            </div>
            <div className="reminder-row">
                {toggle('evening', 'Evening routine')}
                {time('evening_time', 'Evening routine reminder time', preferences.evening)}
            </div>
            <div className="reminder-row">
                {toggle('weekly', 'Sunday: plan the week')}
                {time('weekly_time', 'Weekly planning reminder time', preferences.weekly)}
            </div>
            <div className="reminder-row">
                {toggle('monthly', 'The 1st: review the month')}
                <span className="text-soft small">{formatTime('08:00')}</span>
            </div>
            <div className="reminder-row">
                {toggle('rewards', 'Rewards: earned, or nearly out of time')}
            </div>
        </fieldset>
    );
}
