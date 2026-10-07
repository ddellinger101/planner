import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useSession } from './SessionContext';

const STORAGE_KEY = 'planner.person';

/**
 * Whose planner is on screen:
 * - "default": everything shared, but only your own Health, which is personal;
 * - "both": everything, the other person's Health included;
 * - a member's id: that person's items, and the ones that belong to both.
 */
export type PersonView = 'default' | 'both' | number;

type PersonFilter = {
    view: PersonView;
    setView: (view: PersonView) => void;
    /** A household member's id when the view is one person's, otherwise null. */
    person: number | null;
    /** True in the default view: leave out Health items that belong to someone else. */
    ownHealth: boolean;
};

const PersonFilterContext = createContext<PersonFilter | null>(null);

function readStored(): PersonView {
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        const id = Number(stored);

        return stored === 'both' ? 'both' : Number.isInteger(id) && id > 0 ? id : 'default';
    } catch {
        return 'default';
    }
}

/** Whose items to show. The choice is remembered on this device. */
export function PersonFilterProvider({ children }: { children: ReactNode }) {
    const { household } = useSession();
    const [stored, setStored] = useState(readStored);

    // Ignore a remembered person who is no longer in the household.
    const view =
        typeof stored === 'number' && !household.members.some((member) => member.id === stored)
            ? 'default'
            : stored;

    const setView = useCallback((next: PersonView) => {
        setStored(next);

        try {
            if (next === 'default') {
                window.localStorage.removeItem(STORAGE_KEY);
            } else {
                window.localStorage.setItem(STORAGE_KEY, String(next));
            }
        } catch {
            // Private browsing: the filter still works for this visit.
        }
    }, []);

    const value = useMemo(
        () => ({
            view,
            setView,
            person: typeof view === 'number' ? view : null,
            // With one person there is nobody else's Health to leave out.
            ownHealth: view === 'default' && household.members.length > 1,
        }),
        [view, setView, household.members.length],
    );

    return <PersonFilterContext.Provider value={value}>{children}</PersonFilterContext.Provider>;
}

export function usePersonFilter(): PersonFilter {
    const filter = useContext(PersonFilterContext);

    if (!filter) {
        throw new Error('usePersonFilter must be used inside PersonFilterProvider');
    }

    return filter;
}
