import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useParentPrompt } from '@/context/PlannerContexts';
import type { Scope } from '@/lib/period';
import { api } from './client';

export type ItemStatus = 'open' | 'done' | 'dropped';
export type Routine = 'morning' | 'evening';

/** How far a change to a repeating task reaches. */
export type ApplyTo = 'one' | 'following' | 'all';

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
    duration_minutes: number | null;
    starred: boolean;
    status: ItemStatus;
    routine: Routine | null;
    /** An iCalendar RRULE. Set on every occurrence of a repeating task. */
    recurrence_rule: string | null;
    /** The first occurrence of the series; null on that first occurrence itself. */
    recurrence_parent_id: number | null;
    /** The larger goal this was pulled from, if any. */
    parent_item_id: number | null;
    /** The item this one was carried forward from at a period rollover. */
    carried_from_item_id: number | null;
    sort: number;
    created_by: number;
    /** null means the item belongs to both people. */
    assignee_user_id: number | null;
};

type Editable = Pick<
    Item,
    | 'title'
    | 'notes'
    | 'category_id'
    | 'period_key'
    | 'due_time'
    | 'duration_minutes'
    | 'starred'
    | 'status'
    | 'routine'
    | 'recurrence_rule'
    | 'assignee_user_id'
    | 'sort'
>;

export type NewItem = Pick<Item, 'title' | 'category_id' | 'scope' | 'period_key'> &
    Partial<Omit<Editable, 'status' | 'sort'>> &
    Partial<Pick<Item, 'parent_item_id'>>;

export type ItemChanges = Partial<Editable>;

type Filters = { periodKey: string; person: number | null };

/** The server's order: starred first, then manual order, then oldest first. */
export const byListOrder = (a: Item, b: Item) =>
    Number(b.starred) - Number(a.starred) || a.sort - b.sort || a.id - b.id;

export const isRepeating = (item: Item) =>
    item.recurrence_rule !== null || item.recurrence_parent_id !== null;

const withPerson = (query: URLSearchParams, person: number | null) => {
    if (person !== null) {
        query.set('person', String(person));
    }

    return query;
};

export function useItems({ periodKey, person }: Filters) {
    return useQuery({
        queryKey: ['items', 'period', periodKey, person],
        queryFn: () =>
            api<Item[]>(
                `/api/items?${withPerson(new URLSearchParams({ period_key: periodKey }), person)}`,
            ),
    });
}

/** Open tasks from days before `before`. Pass null to skip the request. */
export function useOverdueItems(before: string | null, person: number | null) {
    return useQuery({
        queryKey: ['items', 'overdue', before, person],
        queryFn: () =>
            api<Item[]>(
                `/api/items/overdue?${withPerson(new URLSearchParams({ before: before! }), person)}`,
            ),
        enabled: before !== null,
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
function useOptimisticItems<TVariables, TResult = unknown>(
    mutationFn: (variables: TVariables) => Promise<TResult>,
    change: (items: Item[], variables: TVariables) => Item[],
    onSuccess?: (result: TResult, variables: TVariables) => void,
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
        onSuccess,
        onSettled: () => refreshItems(queryClient),
    });
}

/** Refetch every list of items, and the goal counts worked out from them. */
function refreshItems(queryClient: QueryClient) {
    queryClient.invalidateQueries({ queryKey: ['item-summary'] });

    return queryClient.invalidateQueries({ queryKey: ['items'] });
}

const applyToQuery = (applyTo?: ApplyTo) =>
    applyTo && applyTo !== 'one' ? `?apply_to=${applyTo}` : '';

export function useUpdateItem() {
    const { offerParent } = useParentPrompt();

    return useOptimisticItems(
        ({ id, changes, applyTo }: { id: number; changes: ItemChanges; applyTo?: ApplyTo }) =>
            api<Item>(`/api/items/${id}${applyToQuery(applyTo)}`, {
                method: 'PATCH',
                body: changes,
            }),
        // The item updates in place straight away; if the change moves it to
        // another list, the refetch that follows sorts that out.
        (items, { id, changes }) =>
            items
                .map((item) => {
                    if (item.id !== id) {
                        return item;
                    }

                    const next = { ...item, ...changes };

                    // A day task is always due on its own day.
                    return next.scope === 'day' ? { ...next, due_date: next.period_key } : next;
                })
                .sort(byListOrder),
        // Finishing something pulled from a larger goal may finish that goal too.
        (item, { changes }) => {
            if (changes.status === 'done' && item.parent_item_id !== null) {
                offerParent(item);
            }
        },
    );
}

export function useDeleteItem() {
    return useOptimisticItems(
        ({ id, applyTo }: { id: number; applyTo?: ApplyTo }) =>
            api<null>(`/api/items/${id}${applyToQuery(applyTo)}`, { method: 'DELETE' }),
        (items, { id }) => items.filter((item) => item.id !== id),
    );
}

export function useCreateItem() {
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (item: NewItem) => api<Item>('/api/items', { method: 'POST', body: item }),
        onSettled: () => refreshItems(queryClient),
    });
}
