import { api, ApiError } from './client';

export type Member = {
    id: number;
    name: string;
    avatar_url: string | null;
    color: string;
};

export type Session = {
    user: Member & { email: string; timezone: string };
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

export const fetchCategories = () => api<Category[]>('/api/categories');

export const signOut = () => api<null>('/auth/logout', { method: 'POST' });
