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

// Brain dump: just enough for the planning flow's "capture" step. ---------------

export type BrainDumpBucket =
    | 'must_do'
    | 'should_do'
    | 'could_do'
    | 'call'
    | 'email'
    | 'buy'
    | 'other'
    | 'health_habits'
    | 'kids_stuff'
    | 'only_4_you';

export type BrainDumpItem = {
    id: number;
    bucket: BrainDumpBucket;
    title: string;
    notes: string | null;
};

export const BUCKET_NAMES: Record<BrainDumpBucket, string> = {
    must_do: 'Must Do',
    should_do: 'Should Do',
    could_do: 'Could Do',
    call: 'Call',
    email: 'Email',
    buy: 'Buy',
    other: 'Other',
    health_habits: 'Health Habits',
    kids_stuff: 'Kids Stuff',
    only_4_you: 'Only 4 You',
};

export function useBrainDump() {
    return useQuery({
        queryKey: ['brain-dump'],
        queryFn: () =>
            api<{ items: BrainDumpItem[]; assigned_this_week: number }>('/api/brain-dump'),
    });
}

export function useAddBrainDump() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (item: Pick<BrainDumpItem, 'bucket' | 'title'>) =>
            api<BrainDumpItem>('/api/brain-dump', { method: 'POST', body: item }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brain-dump'] }),
    });
}

export function useDeleteBrainDump() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => api(`/api/brain-dump/${id}`, { method: 'DELETE' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['brain-dump'] }),
    });
}
