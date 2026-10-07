import { useQuery } from '@tanstack/react-query';
import { Cake, CircleAlert, CircleCheck, ListChecks, RefreshCw } from 'lucide-react';
import { useSearchParams } from 'react-router';
import { GOOGLE_CONNECT_URL, useGoogle, useGoogleAction, type GoogleStatus } from '@/api/google';
import { fetchCategories } from '@/api/session';
import { useSession } from '@/context/SessionContext';

const RESULT_MESSAGES: Record<string, { text: string; good: boolean }> = {
    connected: { text: 'Google is connected. Your first sync is under way.', good: true },
    declined: {
        text: 'Google didn’t grant access to Tasks or Contacts. Try again and tick both boxes.',
        good: false,
    },
    failed: { text: 'Connecting to Google didn’t finish. Please try again.', good: false },
};

const formatWhen = (timestamp: string | null, timeZone: string) =>
    timestamp
        ? new Intl.DateTimeFormat('en-US', {
              timeZone,
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
          }).format(new Date(timestamp))
        : 'not yet';

/** Settings for this person's Google connection: Tasks sync and contacts' birthdays. */
export default function GoogleSettings() {
    const google = useGoogle();
    const [params] = useSearchParams();
    const result = RESULT_MESSAGES[params.get('google') ?? ''];
    const status = google.data;

    return (
        <section className="planner-card p-3" aria-labelledby="settings-google">
            <h2 id="settings-google" className="font-display h3">
                Google
            </h2>

            {result && (
                <p
                    className="d-flex gap-2 align-items-start small"
                    role="status"
                    style={{ color: result.good ? 'var(--accent)' : 'var(--danger)' }}
                >
                    {result.good ? (
                        <CircleCheck aria-hidden="true" size={18} />
                    ) : (
                        <CircleAlert aria-hidden="true" size={18} />
                    )}
                    {result.text}
                </p>
            )}

            {google.isError && (
                <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
                    The Google settings didn’t load.
                </p>
            )}

            {status && !status.tasks_connected && !status.contacts_connected ? (
                <NotConnected status={status} />
            ) : (
                status && <Connected status={status} />
            )}
        </section>
    );
}

function NotConnected({ status }: { status: GoogleStatus }) {
    return (
        <>
            {status.needs_reconnect ? (
                <p
                    role="alert"
                    className="d-flex gap-2 align-items-start"
                    style={{ color: 'var(--danger)' }}
                >
                    <CircleAlert aria-hidden="true" size={18} />
                    Google stopped accepting the planner’s access. Reconnect to pick sync back up;
                    nothing is lost in the meantime.
                </p>
            ) : (
                <p className="text-soft small">
                    Connect to keep your day tasks in step with Google Tasks and to show your
                    contacts’ birthdays. You’ll be asked by Google to allow both.
                </p>
            )}
            <a className="button-ink" href={GOOGLE_CONNECT_URL}>
                {status.needs_reconnect ? 'Reconnect Google' : 'Connect Google'}
            </a>
        </>
    );
}

function Connected({ status }: { status: GoogleStatus }) {
    const { user } = useSession();
    const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories }).data ?? [];
    const action = useGoogleAction();
    const busy = action.isPending;
    const mapped = new Set(status.lists.map((list) => list.category_id));
    const missing = categories.filter((category) => !mapped.has(category.id));

    return (
        <>
            <p className="small mb-2">
                Connected as <strong>{status.email}</strong>
            </p>

            <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
                <button
                    type="button"
                    className="button-ink is-small d-inline-flex align-items-center gap-2"
                    disabled={busy}
                    onClick={() => action.mutate({ kind: 'sync' })}
                >
                    <RefreshCw aria-hidden="true" size={15} className={busy ? 'is-spinning' : ''} />
                    {busy ? 'Working…' : 'Sync now'}
                </button>
                <span className="text-soft small" aria-live="polite">
                    Last synced {formatWhen(status.tasks_last_synced_at, user.timezone)}
                    {status.pending > 0 && ` · ${status.pending} waiting to send`}
                </span>
            </div>

            {status.errors > 0 && (
                <p
                    className="small d-flex gap-2 align-items-start"
                    role="alert"
                    style={{ color: 'var(--danger)' }}
                >
                    <CircleAlert aria-hidden="true" size={16} />
                    Google refused {status.errors === 1 ? '1 task' : `${status.errors} tasks`}.
                    They’ll be tried again on the next sync.
                </p>
            )}
            {action.isError && (
                <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
                    That didn’t work. Please try again.
                </p>
            )}

            {status.tasks_connected ? (
                <>
                    <h3 className="field-label d-flex align-items-center gap-2 mt-3">
                        <ListChecks aria-hidden="true" size={15} /> Task lists
                    </h3>
                    <p className="text-soft small">
                        Each category uses one Google Tasks list. A list set to “Not synced” is left
                        alone.
                    </p>
                    <ul className="list-map">
                        {status.lists.map((list) => (
                            <li key={list.id}>
                                <label htmlFor={`google-list-${list.id}`}>{list.title}</label>
                                <select
                                    id={`google-list-${list.id}`}
                                    className="field-input"
                                    value={list.category_id ?? ''}
                                    disabled={busy}
                                    onChange={(event) =>
                                        action.mutate({
                                            kind: 'map-list',
                                            listId: list.id,
                                            categoryId: event.target.value
                                                ? Number(event.target.value)
                                                : null,
                                        })
                                    }
                                >
                                    <option value="">Not synced</option>
                                    {categories.map((category) => (
                                        <option key={category.id} value={category.id}>
                                            {category.name}
                                        </option>
                                    ))}
                                </select>
                            </li>
                        ))}
                    </ul>
                    <div className="d-flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="button-plain is-small"
                            disabled={busy}
                            onClick={() => action.mutate({ kind: 'refresh-lists' })}
                        >
                            Check Google for lists
                        </button>
                        {missing.length > 0 && (
                            <button
                                type="button"
                                className="button-plain is-small"
                                disabled={busy}
                                onClick={() => action.mutate({ kind: 'create-missing-lists' })}
                            >
                                Create {missing.length === 1 ? 'a list' : 'lists'} for{' '}
                                {missing.map((category) => category.name).join(', ')}
                            </button>
                        )}
                    </div>
                </>
            ) : (
                <p className="small">
                    Google Tasks access wasn’t granted.{' '}
                    <a href={GOOGLE_CONNECT_URL}>Connect again</a> and tick the Tasks box to sync
                    tasks.
                </p>
            )}

            <h3 className="field-label d-flex align-items-center gap-2 mt-4">
                <Cake aria-hidden="true" size={15} /> Birthdays
            </h3>
            {status.contacts_connected ? (
                <label className="date-form-yearly">
                    <input
                        type="checkbox"
                        checked={status.sync_birthdays}
                        disabled={busy}
                        onChange={(event) =>
                            action.mutate({ kind: 'birthdays', enabled: event.target.checked })
                        }
                    />
                    Show my contacts’ birthdays
                    {status.sync_birthdays && (
                        <span className="text-soft small">({status.birthday_count} found)</span>
                    )}
                </label>
            ) : (
                <p className="small mb-0">
                    Contacts access wasn’t granted. <a href={GOOGLE_CONNECT_URL}>Connect again</a>{' '}
                    and tick the Contacts box to show birthdays.
                </p>
            )}
        </>
    );
}
