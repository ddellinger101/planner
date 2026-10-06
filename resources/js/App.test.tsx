import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const session = {
    user: {
        id: 1,
        name: 'Dustin',
        email: 'dustin@example.com',
        avatar_url: null,
        color: '#2f8f83',
        timezone: 'America/New_York',
    },
    household: {
        id: 1,
        name: 'Our Planner',
        members: [
            { id: 1, name: 'Dustin', avatar_url: null, color: '#2f8f83' },
            { id: 2, name: 'Elizabeth', avatar_url: null, color: '#e8677a' },
        ],
    },
};

const categories = [
    { id: 1, slug: 'health', name: 'Health', color: '#2f8f83', icon: 'heart-pulse' },
];

type Route = { status?: number; body?: unknown };

/** Stub fetch with one response per "METHOD path". */
function mockApi(routes: Record<string, Route>) {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const route = routes[`${init?.method ?? 'GET'} ${String(input)}`];

        if (!route) {
            throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${String(input)}`);
        }

        const status = route.status ?? 200;

        return new Response(status === 204 ? null : JSON.stringify(route.body ?? null), { status });
    });

    vi.stubGlobal('fetch', fetchMock);

    return fetchMock;
}

function renderApp() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    return render(
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>,
    );
}

describe('App', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        window.history.replaceState(null, '', '/');
        document.cookie = 'XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    });

    it('offers Google sign-in to a visitor', async () => {
        mockApi({ 'GET /api/me': { status: 401, body: { message: 'Unauthenticated.' } } });

        renderApp();

        expect(await screen.findByRole('link', { name: 'Sign in with Google' })).toHaveAttribute(
            'href',
            '/auth/google/redirect',
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('links a visitor to the privacy policy and terms', async () => {
        mockApi({ 'GET /api/me': { status: 401 } });

        renderApp();

        expect(await screen.findByRole('link', { name: 'Privacy Policy' })).toHaveAttribute(
            'href',
            '/privacy',
        );
        expect(screen.getByRole('link', { name: 'Terms of Service' })).toHaveAttribute(
            'href',
            '/terms',
        );
    });

    it('explains why an account was turned away', async () => {
        window.history.replaceState(null, '', '/?auth_error=not_allowed');
        mockApi({ 'GET /api/me': { status: 401 } });

        renderApp();

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'isn’t on this planner’s guest list',
        );
    });

    it('shows who is signed in, the household and the categories', async () => {
        mockApi({ 'GET /api/me': { body: session }, 'GET /api/categories': { body: categories } });

        renderApp();

        expect(await screen.findByText('Dustin', { selector: 'strong' })).toBeInTheDocument();
        expect(screen.getByText('Our Planner: Dustin and Elizabeth')).toBeInTheDocument();
        expect(await screen.findByText('Health')).toBeInTheDocument();
    });

    it('signs out with the XSRF token and returns to the sign-in screen', async () => {
        document.cookie = 'XSRF-TOKEN=abc%3D';
        const fetchMock = mockApi({
            'GET /api/me': { body: session },
            'GET /api/categories': { body: categories },
            'POST /auth/logout': { status: 204 },
        });

        renderApp();
        await userEvent.click(await screen.findByRole('button', { name: 'Sign out' }));

        expect(
            await screen.findByRole('link', { name: 'Sign in with Google' }),
        ).toBeInTheDocument();

        const logout = fetchMock.mock.calls.find(([url]) => url === '/auth/logout');
        expect(logout?.[1]?.headers).toMatchObject({ 'X-XSRF-TOKEN': 'abc=' });
    });

    it('reports a server that is down', async () => {
        mockApi({ 'GET /api/me': { status: 500 } });

        renderApp();

        expect(await screen.findByRole('alert')).toHaveTextContent('The server did not respond.');
    });
});
