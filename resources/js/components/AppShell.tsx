import {
    Brain,
    CalendarCheck,
    CalendarDays,
    CalendarRange,
    CircleAlert,
    Columns3,
    Ellipsis,
    Gift,
    Plus,
    Scale,
    Settings,
    Sun,
    Sunrise,
    Target,
    X,
    type LucideIcon,
} from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import type { CalendarEvent } from '@/api/events';
import { useGoogle } from '@/api/google';
import type { Item } from '@/api/items';
import { usePendingReviews } from '@/api/review';
import { todayPeriod, type Scope } from '@/lib/period';
import { relatedPeriod, SCOPE_NAMES, SCOPES } from '@/lib/periodLabels';
import { useCurrentPeriod, useToday } from '@/lib/useCurrentPeriod';
import { EventEditorProvider, type EventDraft } from '@/context/EventEditorContext';
import { ItemEditorProvider } from '@/context/ItemEditorContext';
import { ParentPromptProvider, ReviewProvider } from '@/context/PlannerContexts';
import { useSession } from '@/context/SessionContext';
import { periodPath } from './PeriodNav';
import EventSheet, { type EventTarget } from './EventSheet';
import ItemSheet, { type SheetTarget } from './ItemSheet';
import ParentPrompt from './review/ParentPrompt';
import RewardToast from './rewards/RewardToast';
import ReviewSheet from './review/ReviewSheet';

const PROMPTED_KEY = 'planner.review.prompted';
const WELCOMED_KEY = 'planner.welcomed';

function readFlag(key: string): boolean {
    try {
        return window.localStorage.getItem(key) !== null;
    } catch {
        return false;
    }
}

const readPrompted = () => {
    try {
        return window.localStorage.getItem(PROMPTED_KEY) ?? '';
    } catch {
        return '';
    }
};

const SCOPE_ICONS: Record<Scope, LucideIcon> = {
    day: Sun,
    week: Columns3,
    month: CalendarDays,
    quarter: CalendarRange,
    year: Target,
};

export const MORE_PAGES: { path: string; label: string; icon: LucideIcon }[] = [
    { path: '/brain-dump', label: 'Brain Dump', icon: Brain },
    { path: '/routines', label: 'Routines & Habits', icon: Sunrise },
    { path: '/weight', label: 'Weight', icon: Scale },
    { path: '/rewards', label: 'Rewards', icon: Gift },
    { path: '/settings', label: 'Settings', icon: Settings },
];

type NavItemProps = {
    to: string;
    label: string;
    icon: LucideIcon;
    active: boolean;
};

// A plain Link, not NavLink: a period link points at a specific key, so the
// router can't tell that "/day/2027-01-04" is the current page for "Day".
function NavItem({ to, label, icon: Icon, active }: NavItemProps) {
    return (
        <Link
            to={to}
            className={`nav-item-link${active ? ' active' : ''}`}
            aria-current={active ? 'page' : undefined}
        >
            <span className="nav-item-icon">
                <Icon aria-hidden="true" size={20} />
            </span>
            {label}
        </Link>
    );
}

/** The frame around every signed-in page: navigation and the quick-add button. */
export default function AppShell() {
    const { user } = useSession();
    const { pathname } = useLocation();
    const current = useCurrentPeriod();
    const today = useToday();
    const [sheet, setSheet] = useState<SheetTarget | null>(null);
    const closeSheet = useCallback(() => setSheet(null), []);
    const [eventSheet, setEventSheet] = useState<EventTarget | null>(null);
    const closeEventSheet = useCallback(() => setEventSheet(null), []);
    const eventEditor = useMemo(
        () => ({
            openEvent: (event: CalendarEvent) => setEventSheet({ kind: 'edit', event }),
            newEvent: (draft: EventDraft) => setEventSheet({ kind: 'create', draft }),
        }),
        [],
    );
    const editor = useMemo(
        () => ({ editItem: (item: Item) => setSheet({ kind: 'edit', item }) }),
        [],
    );

    // The rollover review opens by itself the first time a set of periods
    // needs it on this device; after that it waits behind each view's banner.
    const google = useGoogle();
    const pending = usePendingReviews();
    const pendingKey = (pending.data ?? []).map((entry) => entry.period_key).join(',');
    const [review, setReview] = useState<{ startAt?: string } | null>(null);
    const [prompted, setPrompted] = useState(readPrompted);
    const reviewOpen = review !== null || (pendingKey !== '' && prompted !== pendingKey);
    const reviewControls = useMemo(
        () => ({ openReview: (startAt?: string) => setReview({ startAt }) }),
        [],
    );
    const closeReview = useCallback(() => {
        setReview(null);
        setPrompted(pendingKey);

        try {
            window.localStorage.setItem(PROMPTED_KEY, pendingKey);
        } catch {
            // Private browsing: it may simply offer the review again next visit.
        }
    }, [pendingKey]);

    // Someone who has signed in but never connected Google is pointed to Settings, once per device.
    const [welcomed, setWelcomed] = useState(() => readFlag(WELCOMED_KEY));
    const showWelcome =
        !welcomed &&
        pathname !== '/settings' &&
        google.data !== undefined &&
        !google.data.needs_reconnect &&
        !google.data.tasks_connected &&
        !google.data.calendar_connected &&
        !google.data.contacts_connected;
    const dismissWelcome = () => {
        setWelcomed(true);

        try {
            window.localStorage.setItem(WELCOMED_KEY, '1');
        } catch {
            // Private browsing: it may simply greet them again next visit.
        }
    };

    const [finished, setFinished] = useState<Item | null>(null);
    const parentPrompt = useMemo(() => ({ offerParent: setFinished }), []);
    const closeParentPrompt = useCallback(() => setFinished(null), []);

    // Switching between Day, Week, Month… keeps you near what you were looking at.
    const scopeLinks = SCOPES.map((scope) => ({
        to: current ? periodPath(relatedPeriod(current, scope, today)) : `/${scope}`,
        label: SCOPE_NAMES[scope],
        icon: SCOPE_ICONS[scope],
        // Planning a week is part of the Week view.
        active:
            pathname.split('/')[1] === scope || (scope === 'week' && pathname.startsWith('/plan/')),
    }));

    const onMorePage = pathname === '/more' || MORE_PAGES.some((page) => page.path === pathname);

    return (
        <ParentPromptProvider value={parentPrompt}>
            <ReviewProvider value={reviewControls}>
                <div className="shell">
                    <nav className="rail" aria-label="Main">
                        <span className="rail-brand">
                            <CalendarCheck aria-hidden="true" size={26} />
                        </span>
                        {scopeLinks.map((link) => (
                            <NavItem key={link.label} {...link} />
                        ))}
                        <hr />
                        {MORE_PAGES.map((page) => (
                            <NavItem
                                key={page.path}
                                to={page.path}
                                label={page.label}
                                icon={page.icon}
                                active={pathname === page.path}
                            />
                        ))}
                    </nav>

                    {google.data?.needs_reconnect && pathname !== '/settings' && (
                        <div className="reconnect-banner" role="alert">
                            <CircleAlert aria-hidden="true" size={16} />
                            Google needs reconnecting before the planner can sync.
                            <Link to="/settings">Open Settings</Link>
                        </div>
                    )}

                    {showWelcome && (
                        <aside className="welcome-banner" aria-label="Welcome">
                            <span>
                                <strong>Welcome, {user.name.split(' ')[0]}.</strong> Connect your
                                Google account to bring in your tasks, calendar and birthdays.
                            </span>
                            <Link className="button-ink is-small" to="/settings">
                                Set it up
                            </Link>
                            <button
                                type="button"
                                className="icon-button is-small"
                                aria-label="Not now"
                                onClick={dismissWelcome}
                            >
                                <X aria-hidden="true" size={16} />
                            </button>
                        </aside>
                    )}

                    <EventEditorProvider value={eventEditor}>
                        <ItemEditorProvider value={editor}>
                            <Outlet />
                        </ItemEditorProvider>
                    </EventEditorProvider>

                    <button
                        type="button"
                        className="fab"
                        aria-label="Quick add"
                        onClick={() =>
                            setSheet({
                                kind: 'create',
                                defaultPeriod: current ?? todayPeriod('day', user.timezone),
                            })
                        }
                    >
                        <Plus aria-hidden="true" size={26} />
                    </button>

                    {reviewOpen && (
                        <ReviewSheet
                            reviews={pending.data ?? []}
                            startAt={review?.startAt}
                            // Keep it open even if the last open item is dealt with.
                            onShown={() => setReview((current) => current ?? {})}
                            onClose={closeReview}
                        />
                    )}

                    {finished && (
                        <ParentPrompt
                            key={finished.id}
                            child={finished}
                            onClose={closeParentPrompt}
                        />
                    )}

                    <RewardToast />

                    {sheet && (
                        <ItemSheet
                            // A fresh form for each thing opened.
                            key={sheet.kind === 'edit' ? sheet.item.id : 'create'}
                            target={sheet}
                            onClose={closeSheet}
                            onMakeEvent={(draft) => {
                                closeSheet();
                                setEventSheet({ kind: 'create', draft });
                            }}
                        />
                    )}

                    {eventSheet && (
                        <EventSheet
                            key={eventSheet.kind === 'edit' ? eventSheet.event.id : 'create'}
                            target={eventSheet}
                            onClose={closeEventSheet}
                        />
                    )}

                    <nav className="bottom-nav" aria-label="Main">
                        {scopeLinks.map((link) => (
                            <NavItem key={link.label} {...link} />
                        ))}
                        <NavItem to="/more" label="More" icon={Ellipsis} active={onMorePage} />
                    </nav>
                </div>
            </ReviewProvider>
        </ParentPromptProvider>
    );
}
