import { useMutation, useQueryClient } from '@tanstack/react-query';
import { MapPinOff, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { updateProfile } from '@/api/session';
import AppearanceSettings from '@/components/AppearanceSettings';
import { MORE_ONLY_PAGES, MORE_SCOPES } from '@/components/AppShell';
import EmptyState from '@/components/EmptyState';
import GoogleSettings from '@/components/GoogleSettings';
import NotificationSettings from '@/components/NotificationSettings';
import PageHeader from '@/components/PageHeader';
import ProfileSettings from '@/components/ProfileSettings';
import { useSession } from '@/context/SessionContext';

type ComingSoonProps = {
    title: string;
    icon: LucideIcon;
    heading: string;
    children: ReactNode;
};

// A page that is only a message.
function ComingSoon({ title, icon, heading, children }: ComingSoonProps) {
    return (
        <>
            <PageHeader showPersonFilter={false}>{title}</PageHeader>
            <main className="container-fluid page-body">
                <EmptyState icon={icon} title={heading}>
                    {children}
                </EmptyState>
            </main>
        </>
    );
}

export const NotFoundPage = () => (
    <ComingSoon title="Not found" icon={MapPinOff} heading="There’s no page here">
        Use the navigation to get back to your planner.
    </ComingSoon>
);

/** The phone's "More" tab: everything that doesn't fit in the bottom bar. */
export function MorePage() {
    return (
        <>
            <PageHeader showPersonFilter={false}>More</PageHeader>
            <main className="container-fluid page-body">
                <ul className="planner-card more-list">
                    {[...MORE_SCOPES, ...MORE_ONLY_PAGES].map(({ path, label, icon: Icon }) => (
                        <li key={path}>
                            <Link to={path}>
                                <Icon aria-hidden="true" size={22} />
                                {label}
                            </Link>
                        </li>
                    ))}
                </ul>
            </main>
        </>
    );
}

export function SettingsPage() {
    return (
        <>
            <PageHeader showPersonFilter={false}>Settings</PageHeader>
            <main className="container-fluid page-body">
                <div className="row g-3">
                    <div className="col-12 col-lg-6">
                        <ProfileSettings />
                    </div>
                    <div className="col-12 col-lg-6 d-grid gap-3 align-content-start">
                        <AppearanceSettings />
                        <TimelineHours />
                        <NotificationSettings />
                    </div>
                    <div className="col-12">
                        <GoogleSettings />
                    </div>
                </div>
            </main>
        </>
    );
}

const hourName = (hour: number) =>
    hour === 24 ? 'Midnight' : `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;

/** Which hours the Day view's schedule shows. */
function TimelineHours() {
    const { user } = useSession();
    const queryClient = useQueryClient();
    const save = useMutation({
        mutationFn: updateProfile,
        onSuccess: (session) => queryClient.setQueryData(['session'], session),
    });

    return (
        <section className="planner-card p-3" aria-labelledby="settings-day">
            <h2 id="settings-day" className="font-display h3">
                Day schedule
            </h2>
            <p className="text-soft small">
                The hours shown on the Day view. Anything planned outside them still appears.
            </p>
            <div className="row g-3">
                <div className="col-6">
                    <label className="field-label" htmlFor="settings-day-start">
                        Starts at
                    </label>
                    <select
                        id="settings-day-start"
                        className="field-input"
                        value={user.day_start_hour}
                        disabled={save.isPending}
                        onChange={(event) =>
                            save.mutate({ day_start_hour: Number(event.target.value) })
                        }
                    >
                        {Array.from({ length: user.day_end_hour }, (_, hour) => (
                            <option key={hour} value={hour}>
                                {hourName(hour)}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="col-6">
                    <label className="field-label" htmlFor="settings-day-end">
                        Ends at
                    </label>
                    <select
                        id="settings-day-end"
                        className="field-input"
                        value={user.day_end_hour}
                        disabled={save.isPending}
                        onChange={(event) =>
                            save.mutate({ day_end_hour: Number(event.target.value) })
                        }
                    >
                        {Array.from({ length: 24 - user.day_start_hour }, (_, index) => {
                            const hour = user.day_start_hour + 1 + index;

                            return (
                                <option key={hour} value={hour}>
                                    {hourName(hour)}
                                </option>
                            );
                        })}
                    </select>
                </div>
            </div>
            {save.isError && (
                <p className="small mt-2 mb-0" role="alert" style={{ color: 'var(--danger)' }}>
                    That didn’t save. Please try again.
                </p>
            )}
        </section>
    );
}
