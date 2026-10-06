import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { useSession } from './SessionContext';

const STORAGE_KEY = 'planner.person';

type PersonFilter = {
    /** A household member's id, or null for both people. */
    person: number | null;
    setPerson: (person: number | null) => void;
};

const PersonFilterContext = createContext<PersonFilter | null>(null);

function readStored(): number | null {
    try {
        const stored = Number(window.localStorage.getItem(STORAGE_KEY));

        return Number.isInteger(stored) && stored > 0 ? stored : null;
    } catch {
        return null;
    }
}

/** Whose items to show. The choice is remembered on this device. */
export function PersonFilterProvider({ children }: { children: ReactNode }) {
    const { household } = useSession();
    const [stored, setStored] = useState(readStored);

    // Ignore a remembered person who is no longer in the household.
    const person = household.members.some((member) => member.id === stored) ? stored : null;

    const setPerson = useCallback((next: number | null) => {
        setStored(next);

        try {
            if (next === null) {
                window.localStorage.removeItem(STORAGE_KEY);
            } else {
                window.localStorage.setItem(STORAGE_KEY, String(next));
            }
        } catch {
            // Private browsing: the filter still works for this visit.
        }
    }, []);

    const value = useMemo(() => ({ person, setPerson }), [person, setPerson]);

    return <PersonFilterContext.Provider value={value}>{children}</PersonFilterContext.Provider>;
}

export function usePersonFilter(): PersonFilter {
    const filter = useContext(PersonFilterContext);

    if (!filter) {
        throw new Error('usePersonFilter must be used inside PersonFilterProvider');
    }

    return filter;
}
