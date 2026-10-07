import { api, ApiError } from './client';

export type Member = {
    id: number;
    name: string;
    avatar_url: string | null;
    color: string;
};

export type Session = {
    user: Member & {
        email: string;
        timezone: string;
        /** The hours the Day view's timeline covers; 24 means midnight. */
        day_start_hour: number;
        day_end_hour: number;
    };
    household: { id: number; name: string; members: Member[] };
};

export type Category = {
    id: number;
    slug: string;
    name: string;
    color: string;
    icon: string;
};

/** The signed-in user, or null when nobody is signed in. */
export async function fetchSession(): Promise<Session | null> {
    try {
        return await api<Session>('/api/me');
    } catch (error) {
        if (error instanceof ApiError && error.status === 401) {
            return null;
        }

        throw error;
    }
}

export const updateProfile = (
    changes: Partial<
        Pick<Session['user'], 'name' | 'color' | 'timezone' | 'day_start_hour' | 'day_end_hour'>
    >,
) => api<Session>('/api/me', { method: 'PATCH', body: changes });

/** The colors a person can pick; the same list as `User::PERSON_COLORS` on the server. */
export const PERSON_COLORS = ['#2f8f83', '#e8677a', '#3b7dd8', '#8257d6', '#d9822b', '#64748b'];

export const fetchCategories = () => api<Category[]>('/api/categories');

export const signOut = () => api<null>('/auth/logout', { method: 'POST' });
