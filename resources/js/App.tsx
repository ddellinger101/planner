import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { CircleAlert, LoaderCircle } from 'lucide-react';
import { Navigate, Route, Routes } from 'react-router';
import { fetchSession } from './api/session';
import { applyTheme } from './lib/theme';
import AppShell from './components/AppShell';
import { PersonFilterProvider } from './context/PersonFilterContext';
import { SessionProvider } from './context/SessionContext';
import { SCOPES } from './lib/periodLabels';
import BrainDumpPage from './pages/BrainDumpPage';
import PeriodPage from './pages/PeriodPage';
import PlanWeekPage from './pages/PlanWeekPage';
import RewardsPage from './pages/RewardsPage';
import RoutinesPage from './pages/RoutinesPage';
import SignIn, { WelcomeCard } from './pages/SignIn';
import WeightPage from './pages/WeightPage';
import { MorePage, NotFoundPage, SettingsPage } from './pages/SimplePages';

export default function App() {
    const session = useQuery({ queryKey: ['session'], queryFn: fetchSession, retry: false });
    const theme = session.data?.user.theme;

    // Draw the planner in the look this person chose, on whatever device they sign in on.
    useEffect(() => {
        if (theme) {
            applyTheme(theme);
        }
    }, [theme]);

    if (session.isPending) {
        return (
            <WelcomeCard>
                <p className="d-flex align-items-center gap-2 mb-0">
                    <LoaderCircle aria-hidden="true" size={18} /> Loading…
                </p>
            </WelcomeCard>
        );
    }

    if (session.isError) {
        return (
            <WelcomeCard>
                <p
                    className="d-flex align-items-center gap-2 mb-0"
                    role="alert"
                    style={{ color: 'var(--danger)' }}
                >
                    <CircleAlert aria-hidden="true" size={18} /> The server did not respond.
                </p>
            </WelcomeCard>
        );
    }

    if (!session.data) {
        return <SignIn />;
    }

    return (
        <SessionProvider value={session.data}>
            <PersonFilterProvider>
                <Routes>
                    <Route element={<AppShell />}>
                        {/* The planner opens on today. */}
                        <Route index element={<Navigate to="/day" replace />} />
                        {SCOPES.map((scope) => (
                            <Route key={scope} path={`/${scope}/:key?`} element={<PeriodPage />} />
                        ))}
                        <Route path="/plan/:key" element={<PlanWeekPage />} />
                        <Route path="/brain-dump" element={<BrainDumpPage />} />
                        <Route path="/routines" element={<RoutinesPage />} />
                        <Route path="/weight" element={<WeightPage />} />
                        <Route path="/rewards" element={<RewardsPage />} />
                        <Route path="/settings" element={<SettingsPage />} />
                        <Route path="/more" element={<MorePage />} />
                        <Route path="*" element={<NotFoundPage />} />
                    </Route>
                </Routes>
            </PersonFilterProvider>
        </SessionProvider>
    );
}
