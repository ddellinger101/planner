import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Scope } from '@/lib/period';
import { api } from './client';
import type { WeightEntry } from './day';

export type { WeightEntry };

export type WeightGoal = {
    scope: Exclude<Scope, 'day'>;
    period_key: string;
    target_weight: number;
};

/** Your own weight entries, oldest first. Leave out `from` for everything. */
export function useWeightEntries(from: string | null, to: string) {
    return useQuery({
        queryKey: ['weight', 'range', from, to],
        queryFn: () => api<WeightEntry[]>(`/api/weight?${from ? `from=${from}&` : ''}to=${to}`),
        // Keep the old line on screen while a new range loads.
        placeholderData: (previous) => previous,
    });
}

/** Every weight goal you have set, for any period. */
export function useWeightGoals() {
    return useQuery({
        queryKey: ['weight-goal', 'all'],
        queryFn: () => api<WeightGoal[]>('/api/weight/goals'),
    });
}

/** Log a weight for a day; logging the same day again replaces it. */
export function useLogWeight() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (entry: { date: string; weight: number }) =>
            api<WeightEntry>('/api/weight', { method: 'POST', body: entry }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weight'] }),
    });
}

export function useDeleteWeight() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => api(`/api/weight/${id}`, { method: 'DELETE' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['weight'] }),
    });
}
