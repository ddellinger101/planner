import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from './App';

function renderApp() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    return render(
        <QueryClientProvider client={queryClient}>
            <App />
        </QueryClientProvider>,
    );
}

function mockHealth(body: object, status = 200) {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })),
    );
}

describe('App', () => {
    afterEach(() => vi.unstubAllGlobals());

    it('shows a healthy server', async () => {
        mockHealth({ status: 'ok', database: 'ok', time: '2026-10-06T12:00:00Z' });

        renderApp();

        expect(screen.getByRole('heading', { name: 'My Planner' })).toBeInTheDocument();
        expect(await screen.findByText('Server and database are healthy.')).toBeInTheDocument();
    });

    it('reports an unreachable database', async () => {
        mockHealth({ status: 'degraded', database: 'error', time: '2026-10-06T12:00:00Z' }, 503);

        renderApp();

        expect(await screen.findByRole('alert')).toHaveTextContent(
            'The database is not reachable.',
        );
    });
});
