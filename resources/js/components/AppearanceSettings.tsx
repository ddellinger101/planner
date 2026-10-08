import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateProfile } from '@/api/session';
import { useSession } from '@/context/SessionContext';
import { applyTheme, isTheme, THEMES } from '@/lib/theme';

/** Which look the planner is drawn in. Each person chooses their own. */
export default function AppearanceSettings() {
    const { user } = useSession();
    const queryClient = useQueryClient();
    const save = useMutation({
        mutationFn: updateProfile,
        onSuccess: (session) => queryClient.setQueryData(['session'], session),
        // Back to the look that is actually saved.
        onError: () => applyTheme(user.theme),
    });
    // What is on screen: the choice just made, until the server has answered.
    const current =
        save.isPending && isTheme(save.variables?.theme) ? save.variables.theme : user.theme;

    return (
        <section className="planner-card p-3" aria-labelledby="settings-appearance">
            <h2 id="settings-appearance" className="font-display h3">
                Appearance
            </h2>
            <label className="field-label" htmlFor="settings-theme">
                Theme
            </label>
            <select
                id="settings-theme"
                className="field-input mb-2"
                value={current}
                disabled={save.isPending}
                onChange={(event) => {
                    if (isTheme(event.target.value)) {
                        // Show it at once; saving follows.
                        applyTheme(event.target.value);
                        save.mutate({ theme: event.target.value });
                    }
                }}
            >
                {THEMES.map((theme) => (
                    <option key={theme.id} value={theme.id}>
                        {theme.name}
                    </option>
                ))}
            </select>
            <p className="text-soft small mb-0">
                {THEMES.find((theme) => theme.id === current)?.description} Light or dark follows
                your device. Your choice is yours alone, on every device you sign in on.
            </p>
            {save.isError && (
                <p className="small mt-2 mb-0" role="alert" style={{ color: 'var(--danger)' }}>
                    That didn’t save. Please try again.
                </p>
            )}
        </section>
    );
}
