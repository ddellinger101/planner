import { createContext, useContext } from 'react';
import type { Session } from '@/api/session';

const SessionContext = createContext<Session | null>(null);

export const SessionProvider = SessionContext.Provider;

/** The signed-in user and their household. Only valid inside the app shell. */
export function useSession(): Session {
    const session = useContext(SessionContext);

    if (!session) {
        throw new Error('useSession must be used while signed in');
    }

    return session;
}
