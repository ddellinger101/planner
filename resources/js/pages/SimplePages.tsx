import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, Gift, LogOut, MapPinOff, Scale, Sunrise, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { signOut, updateProfile } from '@/api/session';
import { MORE_PAGES } from '@/components/AppShell';
import EmptyState from '@/components/EmptyState';
import PageHeader from '@/components/PageHeader';
import { useSession } from '@/context/SessionContext';

type ComingSoonProps = {
    title: string;
    icon: LucideIcon;
    heading: string;
    children: ReactNode;
};

// Stand-ins for the pages that later phases build out.
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

export const BrainDumpPage = () => (
    <ComingSoon title="Brain Dump" icon={Brain} heading="Get it out of your head">
        A board for everything on your mind, sorted into Must Do, Should Do, Could Do, Call, Email,
        Buy and more. It’s on its way.
    </ComingSoon>
);

export const RoutinesPage = () => (
    <ComingSoon title="Routines & Habits" icon={Sunrise} heading="Mornings, evenings and streaks">
        Your morning and evening routines and a habit tracker will live here.
    </ComingSoon>
);

export const WeightPage = () => (
    <ComingSoon title="Weight" icon={Scale} heading="Track the trend">
        Log your weight and watch the line move toward your goals. Coming soon.
    </ComingSoon>
);

export const RewardsPage = () => (
    <ComingSoon title="Rewards" icon={Gift} heading="Something to look forward to">
        Pick a few tasks, name a reward and set a deadline. Coming soon.
    </ComingSoon>
);

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
                    {MORE_PAGES.map(({ path, label, icon: Icon }) => (
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
    const { user, household } = useSession();
    const queryClient = useQueryClient();
    const logout = useMutation({
        mutationFn: signOut,
        onSuccess: () => queryClient.setQueryData(['session'], null),
    });

    return (
        <>
            <PageHeader showPersonFilter={false}>Settings</PageHeader>
            <main className="container-fluid page-body">
                <div className="row g-3">
                    <div className="col-12 col-lg-6">
                        <section className="planner-card p-3" aria-labelledby="settings-profile">
                            <h2 id="settings-profile" className="font-display h3">
                                Profile
                            </h2>
                            <div className="d-flex align-items-center gap-3 mb-3">
                                {user.avatar_url && (
                                    <img
                                        className="avatar"
                                        src={user.avatar_url}
                                        alt=""
                                        referrerPolicy="no-referrer"
                                    />
                                )}
                                <div>
                                    <div className="fw-bold">{user.name}</div>
                                    <div className="text-soft small">{user.email}</div>
                                </div>
                            </div>
                            <dl className="row small mb-3">
                                <dt className="col-4 text-soft">Planner</dt>
                                <dd className="col-8">
                                    {household.name}, shared by{' '}
                                    {household.members.map((member) => member.name).join(' and ')}
                                </dd>
                                <dt className="col-4 text-soft">Time zone</dt>
                                <dd className="col-8 mb-0">{user.timezone}</dd>
                            </dl>
                            <button
                                type="button"
                                className="button-plain d-inline-flex align-items-center gap-2"
                                onClick={() => logout.mutate()}
                                disabled={logout.isPending}
                            >
                                <LogOut aria-hidden="true" size={18} /> Sign out
                            </button>
                        </section>
                    </div>
                    <div className="col-12 col-lg-6">
                        <TimelineHours />
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
