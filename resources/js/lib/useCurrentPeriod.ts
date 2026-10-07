import { useLocation } from 'react-router';
import { useSession } from '@/context/SessionContext';
import { parsePeriod, todayPeriod, type Period, type Scope } from './period';
import { SCOPES } from './periodLabels';

/**
 * The period a path such as /week/2027-W01 points at. A period path with no
 * key means "now". Returns null for other pages and for invalid keys.
 */
export function periodFromPath(pathname: string, timezone: string): Period | null {
    const [scope, key] = pathname.split('/').filter(Boolean);

    if (!SCOPES.includes(scope as Scope)) {
        return null;
    }

    if (!key) {
        return todayPeriod(scope as Scope, timezone);
    }

    const period = parsePeriod(key);

    return period?.scope === scope ? period : null;
}

/** The period on screen, if the current page is a period view. */
export function useCurrentPeriod(): Period | null {
    const { pathname } = useLocation();
    const { user } = useSession();

    return periodFromPath(pathname, user.timezone);
}

/** Today's date (YYYY-MM-DD) where the signed-in user lives. */
export function useToday(): string {
    const { user } = useSession();

    return todayPeriod('day', user.timezone).key;
}
