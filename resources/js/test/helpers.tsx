import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { vi } from 'vitest';
import App from '@/App';
import type { Item } from '@/api/items';
import type { Category, Session } from '@/api/session';

export const dustin = { id: 1, name: 'Dustin', avatar_url: null, color: '#3b7dd8' };
export const elizabeth = { id: 2, name: 'Elizabeth', avatar_url: null, color: '#e8677a' };

export const session: Session = {
    user: {
        ...dustin,
        email: 'dustin@example.com',
        timezone: 'America/New_York',
        day_start_hour: 6,
        day_end_hour: 23,
    },
    household: { id: 1, name: 'Our Planner', members: [dustin, elizabeth] },
};

export const categories: Category[] = [
    { id: 1, slug: 'health', name: 'Health', color: '#2f8f83', icon: 'heart-pulse' },
    { id: 2, slug: 'only-4-you', name: 'Only 4 You', color: '#8257d6', icon: 'custom:only4you' },
    { id: 3, slug: 'other', name: 'Other', color: '#64748b', icon: 'list-todo' },
];

export function makeItem(overrides: Partial<Item> = {}): Item {
    return {
        id: 1,
        title: 'Morning run',
        notes: null,
        category_id: 1,
        scope: 'day',
        period_key: '2027-01-04',
        due_date: '2027-01-04',
        due_time: null,
        duration_minutes: null,
        starred: false,
        status: 'open',
        routine: null,
        recurrence_rule: null,
        recurrence_parent_id: null,
        parent_item_id: null,
        carried_from_item_id: null,
        sort: 0,
        created_by: 1,
        assignee_user_id: 1,
        ...overrides,
    };
}

type Reply = { status?: number; body?: unknown };
type Handler = Reply | ((request: { url: URL; body: unknown }) => Reply);

/**
 * Stub fetch. Routes are keyed by "METHOD /path" (query string ignored);
 * a handler can be a fixed reply or a function of the request.
 */
export function mockApi(routes: Record<string, Handler>) {
    const calls: { method: string; path: string; query: URLSearchParams; body: unknown }[] = [];

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input), 'http://localhost');
        const method = init?.method ?? 'GET';
        const body = init?.body ? JSON.parse(String(init.body)) : undefined;
        const handler = routes[`${method} ${url.pathname}`];

        if (!handler) {
            throw new Error(`Unexpected request: ${method} ${url.pathname}`);
        }

        calls.push({ method, path: url.pathname, query: url.searchParams, body });

        const reply = typeof handler === 'function' ? handler({ url, body }) : handler;
        const status = reply.status ?? 200;

        return new Response(status === 204 ? null : JSON.stringify(reply.body ?? null), { status });
    });

    vi.stubGlobal('fetch', fetchMock);

    return { fetchMock, calls };
}

/** The routes every signed-in page needs, with an empty day by default. */
export const signedIn = (items: Item[] = []): Record<string, Handler> => ({
    'GET /api/me': { body: session },
    'GET /api/categories': { body: categories },
    'GET /api/items': { body: items },
    'GET /api/items/overdue': { body: [] },
    'GET /api/journal': { body: [] },
    'GET /api/weight': { body: [] },
    'GET /api/habits': { body: [] },
    'GET /api/meals': { body: [] },
    'GET /api/important-dates': { body: [] },
    'GET /api/items/summary': { body: [] },
    'GET /api/weight/goals': { body: [] },
    'GET /api/reviews/pending': { body: [] },
    'GET /api/brain-dump': { body: { items: [], assigned_this_week: 0 } },
});

export function renderApp(path = '/') {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    return render(
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={[path]}>
                <App />
            </MemoryRouter>
        </QueryClientProvider>,
    );
}
