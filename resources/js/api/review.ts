import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Scope } from '@/lib/period';
import { api } from './client';
import type { Item } from './items';

export type PendingReview = {
    /** The period that has just ended. */
    period_key: string;
    scope: Scope;
    open_count: number;
    /** Where "carry forward" sends an item: the period now under way. */
    next_period_key: string;
};

const refresh = (queryClient: QueryClient) =>
    Promise.all(
        ['items', 'item-summary', 'reviews'].map((key) =>
            queryClient.invalidateQueries({ queryKey: [key] }),
        ),
    );

/** The periods that just ended with open items and haven't been reviewed. */
export function usePendingReviews() {
    return useQuery({
        queryKey: ['reviews', 'pending'],
        queryFn: () => api<PendingReview[]>('/api/reviews/pending'),
    });
}

export function useCompleteReview() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (periodKey: string) =>
            api('/api/reviews', { method: 'POST', body: { period_key: periodKey } }),
        onSuccess: () => refresh(queryClient),
    });
}

/** Copy an open goal into a later period and close the original. */
export function useCarryItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, periodKey }: { id: number; periodKey: string }) =>
            api<Item>(`/api/items/${id}/carry`, {
                method: 'POST',
                body: { period_key: periodKey },
            }),
        onSuccess: () => refresh(queryClient),
    });
}
