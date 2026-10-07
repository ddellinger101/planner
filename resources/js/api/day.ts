import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';

// Journal --------------------------------------------------------------------

export type JournalType = 'gratitude' | 'affirmation' | 'best_part' | 'meditation';

export type JournalEntry = {
    type: JournalType;
    body: string | null;
    minutes: number | null;
    /** The period the entry was written for. */
    period_key: string;
    /** True for an affirmation shown from an earlier day. */
    carried: boolean;
};

export function useJournal(periodKey: string) {
    return useQuery({
        queryKey: ['journal', periodKey],
        queryFn: () => api<JournalEntry[]>(`/api/journal?period_key=${periodKey}`),
    });
}

export function useSaveJournal(periodKey: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            type,
            ...entry
        }: {
            type: JournalType;
            body?: string;
            minutes?: number | null;
        }) =>
            api<JournalEntry | null>(`/api/journal/${periodKey}/${type}`, {
                method: 'PUT',
                body: entry,
            }),
        // Later days may be showing this affirmation as a carried one.
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['journal'] }),
    });
}

// Weight ---------------------------------------------------------------------

export type WeightEntry = { id: number; date: string; weight: number; unit: string };

export function useWeightOn(date: string) {
    return useQuery({
        queryKey: ['weight', date],
        queryFn: async () =>
            (await api<WeightEntry[]>(`/api/weight?from=${date}&to=${date}`))[0] ?? null,
    });
}

export function useSaveWeight(date: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (weight: number | null) =>
            weight === null
                ? api<null>(
                      `/api/weight/${queryClient.getQueryData<WeightEntry | null>(['weight', date])?.id}`,
                      {
                          method: 'DELETE',
                      },
                  )
                : api<WeightEntry>('/api/weight', { method: 'POST', body: { date, weight } }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weight'] }),
    });
}

// Habits ---------------------------------------------------------------------

export type Habit = {
    id: number;
    user_id: number;
    title: string;
    category_id: number | null;
    icon: string | null;
    color: string | null;
    routine: 'morning' | 'evening' | 'anytime';
    checks: { date: string; done: boolean }[];
};

export function useHabitsOn(date: string, person: number | null) {
    return useQuery({
        queryKey: ['habits', date, person],
        queryFn: () =>
            api<Habit[]>(
                `/api/habits?from=${date}&to=${date}${person === null ? '' : `&person=${person}`}`,
            ),
    });
}

export function useCheckHabit(date: string) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, done }: { id: number; done: boolean }) =>
            api(`/api/habits/${id}/checks/${date}`, { method: 'PUT', body: { done } }),
        onMutate: async ({ id, done }) => {
            await queryClient.cancelQueries({ queryKey: ['habits', date] });

            queryClient.setQueriesData<Habit[]>({ queryKey: ['habits', date] }, (habits) =>
                habits?.map((habit) =>
                    habit.id === id
                        ? { ...habit, checks: done ? [{ date, done: true }] : [] }
                        : habit,
                ),
            );
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['habits'] }),
    });
}

// Meals (read-only: Chef plans them) ------------------------------------------

export type MealSlot = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'unknown';

export type Meal = {
    id: number;
    date: string;
    slot: MealSlot;
    title: string;
    description: string | null;
    chef_url: string | null;
};

export function useMeals(from: string, to: string) {
    return useQuery({
        queryKey: ['meals', from, to],
        queryFn: () => api<Meal[]>(`/api/meals?from=${from}&to=${to}`),
    });
}

export const CHEF_URL = 'https://chef.dustindellinger.com';
