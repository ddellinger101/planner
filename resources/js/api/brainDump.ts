import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './client';
import type { Item } from './items';

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

type Board = { items: BrainDumpItem[]; assigned_this_week: number };

/** The board's boxes, in the order they are laid out. */
export const BUCKETS: { bucket: BrainDumpBucket; name: string; categorySlug: string }[] = [
    { bucket: 'must_do', name: 'Must Do', categorySlug: 'other' },
    { bucket: 'should_do', name: 'Should Do', categorySlug: 'other' },
    { bucket: 'could_do', name: 'Could Do', categorySlug: 'other' },
    { bucket: 'call', name: 'Call', categorySlug: 'other' },
    { bucket: 'email', name: 'Email', categorySlug: 'other' },
    { bucket: 'buy', name: 'Buy', categorySlug: 'home' },
    { bucket: 'other', name: 'Other', categorySlug: 'other' },
    { bucket: 'health_habits', name: 'Health Habits', categorySlug: 'health' },
    { bucket: 'kids_stuff', name: 'Kids Stuff', categorySlug: 'family' },
    { bucket: 'only_4_you', name: 'Only 4 You', categorySlug: 'only-4-you' },
];

export const BUCKET_NAMES = Object.fromEntries(
    BUCKETS.map(({ bucket, name }) => [bucket, name]),
) as Record<BrainDumpBucket, string>;

const KEY = ['brain-dump'];

/** Everything still on the board, and how many items left it for the plan this week. */
export function useBrainDump() {
    return useQuery({ queryKey: KEY, queryFn: () => api<Board>('/api/brain-dump') });
}

export function useAddBrainDump() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (item: Pick<BrainDumpItem, 'bucket' | 'title'>) =>
            api<BrainDumpItem>('/api/brain-dump', { method: 'POST', body: item }),
        // Show it straight away, so typing the next one isn't held up.
        onSuccess: (created) =>
            queryClient.setQueryData<Board>(KEY, (board) =>
                board ? { ...board, items: [...board.items, created] } : board,
            ),
        onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
    });
}

export function useUpdateBrainDump() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({
            id,
            ...changes
        }: { id: number } & Partial<Pick<BrainDumpItem, 'bucket' | 'title'>>) =>
            api<BrainDumpItem>(`/api/brain-dump/${id}`, { method: 'PATCH', body: changes }),
        onMutate: async ({ id, ...changes }) => {
            await queryClient.cancelQueries({ queryKey: KEY });
            const previous = queryClient.getQueryData<Board>(KEY);

            queryClient.setQueryData<Board>(KEY, (board) =>
                board
                    ? {
                          ...board,
                          items: board.items.map((item) =>
                              item.id === id ? { ...item, ...changes } : item,
                          ),
                      }
                    : board,
            );

            return { previous };
        },
        onError: (_error, _variables, context) => queryClient.setQueryData(KEY, context?.previous),
        onSettled: () => queryClient.invalidateQueries({ queryKey: KEY }),
    });
}

export function useDeleteBrainDump() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (id: number) => api(`/api/brain-dump/${id}`, { method: 'DELETE' }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: KEY }),
    });
}

export type PlanOptions = {
    /** Any period: a day for a task, or a week (or longer) for a goal. */
    period_key: string;
    category_id?: number;
    due_time?: string | null;
    starred?: boolean;
    recurrence_rule?: string | null;
};

/** "Add to Plan": the item becomes a planner item and leaves the board. */
export function useAssignBrainDump() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: ({ id, ...options }: PlanOptions & { id: number }) =>
            api<Item>(`/api/brain-dump/${id}/assign`, { method: 'POST', body: options }),
        onSuccess: () =>
            Promise.all(
                [KEY, ['items'], ['item-summary']].map((queryKey) =>
                    queryClient.invalidateQueries({ queryKey }),
                ),
            ),
    });
}
