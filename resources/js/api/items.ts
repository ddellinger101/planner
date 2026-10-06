import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import type { Scope } from '@/lib/period';
import { api } from './client';

export type ItemStatus = 'open' | 'done' | 'dropped';

export type Item = {
    id: number;
    title: string;
    notes: string | null;
    category_id: number | null;
    scope: Scope;
    period_key: string;
    due_date: string | null;
    /** HH:MM, 24-hour. */
    due_time: string | null;
    starred: boolean;
    status: ItemStatus;
    routine: 'morning' | 'evening' | null;
    recurrence_rule: string | null;
    sort: number;
    created_by: number;
    /** null means the item belongs to both people. */
    assignee_user_id: number | null;
};

export type NewItem = Pick<Item, 'title' | 'category_id' | 'scope' | 'period_key'> &
    Partial<Pick<Item, 'due_time' | 'starred' | 'notes'>>;

export type ItemChanges = Partial<
    Pick<Item, 'title' | 'status' | 'starred' | 'due_time' | 'period_key' | 'category_id' | 'sort'>
>;

type Filters = { periodKey: string; person: number | null };

const itemsKey = ({ periodKey, person }: Filters) => ['items', periodKey, person] as const;

/** The server's order: starred first, then manual order, then oldest first. */
export const byListOrder = (a: Item, b: Item) =>
    Number(b.starred) - Number(a.starred) || a.sort - b.sort || a.id - b.id;

export function useItems(filters: Filters) {
    return useQuery({
        queryKey: itemsKey(filters),
        queryFn: () => {
            const query = new URLSearchParams({ period_key: filters.periodKey });

            if (filters.person !== null) {
                query.set('person', String(filters.person));
            }

            return api<Item[]>(`/api/items?${query}`);
        },
    });
}

/** Apply a change to every cached list of items, whatever its filters. */
function updateCachedLists(queryClient: QueryClient, change: (items: Item[]) => Item[]) {
    queryClient.setQueriesData<Item[]>({ queryKey: ['items'] }, (items) =>
        items ? change(items) : items,
    );
}

/**
 * Mutations update the cache first and talk to the server second, so a
 * checkbox never waits on the network. A failed request rolls the cache back.
 */
function useOptimisticItems<TVariables>(
    mutationFn: (variables: TVariables) => Promise<unknown>,
    change: (items: Item[], variables: TVariables) => Item[],
) {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn,
        onMutate: async (variables: TVariables) => {
            await queryClient.cancelQueries({ queryKey: ['items'] });
            const previous = queryClient.getQueriesData<Item[]>({ queryKey: ['items'] });

            updateCachedLists(queryClient, (items) => change(items, variables));

            return { previous };
        },
        onError: (_error, _variables, context) => {
            context?.previous.forEach(([key, items]) => queryClient.setQueryData(key, items));
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['items'] }),
    });
}

export function useUpdateItem() {
    return useOptimisticItems(
        ({ id, changes }: { id: number; changes: ItemChanges }) =>
            api<Item>(`/api/items/${id}`, { method: 'PATCH', body: changes }),
        (items, { id, changes }) =>
            items
                .map((item) => (item.id === id ? { ...item, ...changes } : item))
                .sort(byListOrder),
    );
}

export function useDeleteItem() {
    return useOptimisticItems(
        (id: number) => api<null>(`/api/items/${id}`, { method: 'DELETE' }),
        (items, id) => items.filter((item) => item.id !== id),
    );
}

export function useCreateItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (item: NewItem) => api<Item>('/api/items', { method: 'POST', body: item }),
        onSettled: () => queryClient.invalidateQueries({ queryKey: ['items'] }),
    });
}
