import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

export type GoogleStatus = {
    /** The Google account's address, or null if this person has never signed in with one. */
    email: string | null;
    tasks_connected: boolean;
    contacts_connected: boolean;
    /** Google stopped accepting the saved access: it has to be granted again. */
    needs_reconnect: boolean;
    sync_birthdays: boolean;
    tasks_last_synced_at: string | null;
    birthdays_synced_at: string | null;
    birthday_count: number;
    /** Changes made here that haven't reached Google yet. */
    pending: number;
    /** Tasks Google refused; they are retried on each sync. */
    errors: number;
    lists: { id: number; title: string; category_id: number | null }[];
};

const KEY = ['google'];

/** Where the browser goes to grant access to Google Tasks and Contacts. */
export const GOOGLE_CONNECT_URL = '/auth/google/connect';

export function useGoogle() {
    return useQuery({ queryKey: KEY, queryFn: () => api<GoogleStatus>('/api/google') });
}

type Action =
    | { kind: 'sync' }
    | { kind: 'refresh-lists' }
    | { kind: 'create-missing-lists' }
    | { kind: 'map-list'; listId: number; categoryId: number | null }
    | { kind: 'birthdays'; enabled: boolean };

const send = (action: Action) => {
    switch (action.kind) {
        case 'sync':
            return api<GoogleStatus>('/api/google/sync', { method: 'POST' });
        case 'refresh-lists':
            return api<GoogleStatus>('/api/google/lists/refresh', { method: 'POST' });
        case 'create-missing-lists':
            return api<GoogleStatus>('/api/google/lists/create-missing', { method: 'POST' });
        case 'map-list':
            return api<GoogleStatus>(`/api/google/lists/${action.listId}`, {
                method: 'PATCH',
                body: { category_id: action.categoryId },
            });
        case 'birthdays':
            return api<GoogleStatus>('/api/google', {
                method: 'PATCH',
                body: { sync_birthdays: action.enabled },
            });
    }
};

/** Every change to the connection answers with its new status. */
export function useGoogleAction() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: send,
        onSuccess: (status, action) => {
            queryClient.setQueryData(KEY, status);

            // A sync can bring in tasks, Brain Dump items and birthdays.
            if (action.kind === 'sync' || action.kind === 'birthdays') {
                ['items', 'item-summary', 'brain-dump', 'important-dates', 'rewards'].forEach(
                    (key) => queryClient.invalidateQueries({ queryKey: [key] }),
                );
            }
        },
    });
}
