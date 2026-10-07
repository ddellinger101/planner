import '@fontsource-variable/nunito';
import '@fontsource/patrick-hand';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import App from './App';
import { registerServiceWorker } from './lib/push';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Lists stay on screen while they refresh in the background.
            staleTime: 30_000,
        },
    },
});

// Not while developing: a service worker would keep serving yesterday's code.
if (import.meta.env.PROD) {
    void registerServiceWorker();
}

createRoot(document.getElementById('app')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </QueryClientProvider>
    </StrictMode>,
);
