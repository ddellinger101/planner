import {
    Brain,
    CalendarCheck,
    CalendarDays,
    CalendarRange,
    Columns3,
    Ellipsis,
    Gift,
    Plus,
    Scale,
    Settings,
    Sun,
    Sunrise,
    Target,
    type LucideIcon,
} from 'lucide-react';
import { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { todayPeriod, type Scope } from '@/lib/period';
import { relatedPeriod, SCOPE_NAMES, SCOPES } from '@/lib/periodLabels';
import { useCurrentPeriod, useToday } from '@/lib/useCurrentPeriod';
import { useSession } from '@/context/SessionContext';
import { periodPath } from './PeriodNav';
import QuickAdd from './QuickAdd';

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
    const [adding, setAdding] = useState(false);

    // Switching between Day, Week, Month… keeps you near what you were looking at.
    const scopeLinks = SCOPES.map((scope) => ({
        to: current ? periodPath(relatedPeriod(current, scope, today)) : `/${scope}`,
        label: SCOPE_NAMES[scope],
        icon: SCOPE_ICONS[scope],
        active: pathname.split('/')[1] === scope,
    }));

    const onMorePage = pathname === '/more' || MORE_PAGES.some((page) => page.path === pathname);

    return (
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

            <Outlet />

            <button
                type="button"
                className="fab"
                aria-label="Quick add"
                onClick={() => setAdding(true)}
            >
                <Plus aria-hidden="true" size={26} />
            </button>

            {adding && (
                <QuickAdd
                    defaultPeriod={current ?? todayPeriod('day', user.timezone)}
                    onClose={() => setAdding(false)}
                />
            )}

            <nav className="bottom-nav" aria-label="Main">
                {scopeLinks.map((link) => (
                    <NavItem key={link.label} {...link} />
                ))}
                <NavItem to="/more" label="More" icon={Ellipsis} active={onMorePage} />
            </nav>
        </div>
    );
}
