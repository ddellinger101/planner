import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, LogOut } from 'lucide-react';
import { PERSON_COLORS, signOut, updateProfile } from '@/api/session';
import { useSession } from '@/context/SessionContext';
import { clearOfflineData } from '@/lib/push';
import { useDraft } from '@/lib/useDraft';

const COLOR_NAMES: Record<string, string> = {
    '#2f8f83': 'Teal',
    '#e8677a': 'Coral',
    '#3b7dd8': 'Blue',
    '#8257d6': 'Purple',
    '#d9822b': 'Orange',
    '#64748b': 'Slate',
};

/** Every time zone the browser knows, or just the current one on an old browser. */
function timeZones(current: string): string[] {
    const known =
        typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];

    return known.includes(current) ? known : [current, ...known];
}

/** Who you are in the planner: the name and color your things are marked with. */
export default function ProfileSettings() {
    const { user, household } = useSession();
    const queryClient = useQueryClient();
    const save = useMutation({
        mutationFn: updateProfile,
        onSuccess: (session) => queryClient.setQueryData(['session'], session),
    });
    const logout = useMutation({
        mutationFn: signOut,
        onSuccess: () => {
            // Don't leave this person's planner readable offline on a shared device.
            clearOfflineData();
            queryClient.setQueryData(['session'], null);
            queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'session' });
        },
    });
    const name = useDraft(user.name);
    const takenBy = (color: string) =>
        household.members.find((member) => member.id !== user.id && member.color === color);

    const commitName = () => {
        const next = name.value.trim();

        if (next === '' || next === user.name) {
            name.reset();

            return;
        }

        save.mutate({ name: next }, { onSuccess: name.settle, onError: name.reset });
    };

    return (
        <section className="planner-card p-3" aria-labelledby="settings-profile">
            <h2 id="settings-profile" className="font-display h3">
                Profile
            </h2>
            <div className="d-flex align-items-center gap-3 mb-3">
                {user.avatar_url ? (
                    <img
                        className="avatar"
                        src={user.avatar_url}
                        alt=""
                        referrerPolicy="no-referrer"
                    />
                ) : (
                    <span className="person-dot is-large" style={{ background: user.color }}>
                        {user.name.charAt(0)}
                    </span>
                )}
                <div className="min-w-0">
                    <div className="text-soft small">{user.email}</div>
                    <div className="small">
                        {household.name}, shared by{' '}
                        {household.members.map((member) => member.name).join(' and ')}
                    </div>
                </div>
            </div>

            <label className="field-label" htmlFor="settings-name">
                Name
            </label>
            <input
                id="settings-name"
                className="field-input mb-3"
                type="text"
                value={name.value}
                maxLength={60}
                autoComplete="off"
                onChange={(event) => name.set(event.target.value)}
                onBlur={commitName}
                onKeyDown={(event) => event.key === 'Enter' && event.currentTarget.blur()}
            />

            <span className="field-label" id="settings-color">
                Your color
            </span>
            <div className="color-swatches mb-1" role="radiogroup" aria-labelledby="settings-color">
                {PERSON_COLORS.map((color) => {
                    const other = takenBy(color);

                    return (
                        <button
                            key={color}
                            type="button"
                            role="radio"
                            className="color-swatch"
                            style={{ background: color }}
                            aria-checked={user.color === color}
                            aria-label={
                                other
                                    ? `${COLOR_NAMES[color]}, ${other.name}’s color`
                                    : COLOR_NAMES[color]
                            }
                            // Two people in one color couldn't be told apart.
                            disabled={Boolean(other) || save.isPending}
                            onClick={() => user.color !== color && save.mutate({ color })}
                        >
                            {user.color === color && <Check aria-hidden="true" size={18} />}
                            {other && <span aria-hidden="true">{other.name.charAt(0)}</span>}
                        </button>
                    );
                })}
            </div>
            <p className="text-soft small">
                Marks your tasks, events and habits wherever both of you are shown.
            </p>

            <label className="field-label" htmlFor="settings-timezone">
                Time zone
            </label>
            <select
                id="settings-timezone"
                className="field-input mb-3"
                value={user.timezone}
                disabled={save.isPending}
                onChange={(event) => save.mutate({ timezone: event.target.value })}
            >
                {timeZones(user.timezone).map((zone) => (
                    <option key={zone} value={zone}>
                        {zone.replaceAll('_', ' ')}
                    </option>
                ))}
            </select>

            {save.isError && (
                <p className="small" role="alert" style={{ color: 'var(--danger)' }}>
                    That didn’t save. Please try again.
                </p>
            )}

            <button
                type="button"
                className="button-plain d-inline-flex align-items-center gap-2"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
            >
                <LogOut aria-hidden="true" size={18} /> Sign out
            </button>
        </section>
    );
}
