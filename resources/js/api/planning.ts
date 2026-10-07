import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Item } from './items';

// Day tasks across a range of dates (the week strip, the month calendar) ------

export function useItemsBetween(from: string, to: string, person: number | null) {
    return useQuery({
        // Under "items" so optimistic item updates reach this list too.
        queryKey: ['items', 'range', from, to, person],
        queryFn: () =>
            api<Item[]>(
                `/api/items?from=${from}&to=${to}${person === null ? '' : `&person=${person}`}`,
            ),
    });
}

// Goal completion per period ---------------------------------------------------

type SummaryRow = { period_key: string; category_id: number | null; total: number; done: number };

export type Completion = { total: number; done: number };

/** How many goals each of the given periods has, and how many are done. */
export function useGoalSummary(periodKeys: string[], person: number | null) {
    return useQuery({
        // Not under "items": the cached value isn't a list of items.
        queryKey: ['item-summary', periodKeys, person],
        queryFn: async () => {
            const query = new URLSearchParams();
            periodKeys.forEach((key) => query.append('period_keys[]', key));

            if (person !== null) {
                query.set('person', String(person));
            }

            const rows = await api<SummaryRow[]>(`/api/items/summary?${query}`);
            const byPeriod: Record<string, Completion> = {};

            for (const row of rows) {
                const entry = (byPeriod[row.period_key] ??= { total: 0, done: 0 });
                entry.total += row.total;
                entry.done += row.done;
            }

            return byPeriod;
        },
    });
}

// Important dates ---------------------------------------------------------------

export type ImportantDate = {
    id: number;
    title: string;
    /** The date it was set for. */
    date: string;
    repeats_yearly: boolean;
    category_id: number | null;
    /** "app" for dates typed in; "google_contacts" for a synced birthday. */
    source: 'app' | 'google_contacts';
    /** Whether it is also kept as an event in Google Calendar. */
    add_to_calendar: boolean;
    /** When it falls within the range that was asked for. */
    occurs_on: string;
};

export type ImportantDateInput = Pick<ImportantDate, 'title' | 'date' | 'repeats_yearly'> &
    Partial<Pick<ImportantDate, 'add_to_calendar'>>;

export function useImportantDates(from: string, to: string) {
    return useQuery({
        queryKey: ['important-dates', from, to],
        queryFn: () => api<ImportantDate[]>(`/api/important-dates?from=${from}&to=${to}`),
    });
}

export function useSaveImportantDate() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, ...input }: ImportantDateInput & { id?: number }) =>
            id === undefined
                ? api('/api/important-dates', { method: 'POST', body: input })
                : api(`/api/important-dates/${id}`, { method: 'PATCH', body: input }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['important-dates'] }),
    });
}

export function useDeleteImportantDate() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => api(`/api/important-dates/${id}`, { method: 'DELETE' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['important-dates'] }),
    });
}

// Weight goals (personal, like weight entries) -----------------------------------

type WeightGoal = { period_key: string; target_weight: number };

export function useWeightGoal(periodKey: string) {
    return useQuery({
        queryKey: ['weight-goal', periodKey],
        queryFn: async () =>
            (await api<WeightGoal[]>(`/api/weight/goals?period_keys[]=${periodKey}`))[0] ?? null,
    });
}

export function useSaveWeightGoal(periodKey: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (target: number | null) =>
            api(`/api/weight/goals/${periodKey}`, {
                method: 'PUT',
                body: { target_weight: target },
            }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weight-goal'] }),
    });
}
