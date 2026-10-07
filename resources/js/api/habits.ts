import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Habit } from './day';
import type { Item, Routine } from './items';

export type HabitStats = {
    /** Daily habits streak in days; ones with a weekly target, in weeks. */
    streak_unit: 'days' | 'weeks';
    current_streak: number;
    best_streak: number;
    /** Percent of what was expected over the last 30 days. */
    completion: number;
    done_total: number;
};

export type HabitInput = Pick<Habit, 'title' | 'routine' | 'category_id' | 'target_per_week'> & {
    user_id?: number;
};

/** Every habit, in order, without its check history: for the routine editors. */
export function useAllHabits(person: number | null) {
    return useQuery({
        queryKey: ['habits', 'all', person],
        queryFn: async () =>
            (
                await api<Omit<Habit, 'checks'>[]>(
                    `/api/habits${person === null ? '' : `?person=${person}`}`,
                )
            ).map((habit): Habit => ({ ...habit, checks: [] })),
    });
}

/** Streaks and completion, keyed by habit id. */
export function useHabitStats(person: number | null) {
    return useQuery({
        // Under "habits" so checking one off refreshes its streak.
        queryKey: ['habits', 'stats', person],
        queryFn: () =>
            api<Record<number, HabitStats>>(
                `/api/habits/stats${person === null ? '' : `?person=${person}`}`,
            ),
    });
}

export function useSaveHabit() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, ...input }: HabitInput & { id?: number }) =>
            id === undefined
                ? api<Habit>('/api/habits', { method: 'POST', body: input })
                : api<Habit>(`/api/habits/${id}`, { method: 'PATCH', body: input }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['habits'] }),
    });
}

export function useDeleteHabit() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => api(`/api/habits/${id}`, { method: 'DELETE' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['habits'] }),
    });
}

/** Save a new order; `ids` lists every habit in the order wanted. */
export function useReorderHabits() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (ids: number[]) =>
            api('/api/habits/reorder', { method: 'POST', body: { ids } }),
        onMutate: async (ids) => {
            await queryClient.cancelQueries({ queryKey: ['habits'] });

            // Lists of habits are arrays; the stats entry under the same key is not.
            queryClient.setQueriesData<Habit[]>({ queryKey: ['habits'] }, (habits) =>
                Array.isArray(habits)
                    ? [...habits].sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id))
                    : habits,
            );
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['habits'] }),
    });
}

/** The repeating tasks that belong to a routine, one per series. */
export function useRoutineSeries(routine: Routine, person: number | null) {
    return useQuery({
        queryKey: ['items', 'series', routine, person],
        queryFn: () =>
            api<Item[]>(
                `/api/items?series=1&routine=${routine}${person === null ? '' : `&person=${person}`}`,
            ),
    });
}
