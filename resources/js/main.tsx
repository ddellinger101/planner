import '@fontsource-variable/nunito';
import '@fontsource/patrick-hand';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router';
import App from './App';

const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            // Lists stay on screen while they refresh in the background.
            staleTime: 30_000,
        },
    },
});

createRoot(document.getElementById('app')!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <BrowserRouter>
                <App />
            </BrowserRouter>
        </QueryClientProvider>
    </StrictMode>,
);
