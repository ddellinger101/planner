import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarCheck, CircleAlert, LoaderCircle, LogIn, LogOut } from 'lucide-react';
import type { ReactNode } from 'react';
import { fetchCategories, fetchSession, signOut, type Session } from './api/session';

const AUTH_ERRORS: Record<string, string> = {
    not_allowed: 'That Google account isn’t on this planner’s guest list.',
    failed: 'Google sign-in didn’t finish. Please try again.',
};

export default function App() {
    const session = useQuery({ queryKey: ['session'], queryFn: fetchSession, retry: false });

    if (session.isPending) {
        return (
            <Card>
                <p className="d-flex align-items-center gap-2 mb-0">
                    <LoaderCircle aria-hidden="true" size={18} /> Loading…
                </p>
            </Card>
        );
    }

    if (session.isError) {
        return (
            <Card>
                <p className="d-flex align-items-center gap-2 mb-0 text-danger" role="alert">
                    <CircleAlert aria-hidden="true" size={18} /> The server did not respond.
                </p>
            </Card>
        );
    }

    return session.data ? <Home session={session.data} /> : <SignIn />;
}

function Card({ children }: { children: ReactNode }) {
    return (
        <main className="container-fluid py-5">
            <div className="row justify-content-center">
                <div className="col-12 col-md-8 col-lg-5">
                    <div className="card shadow-sm border-0">
                        <div className="card-body p-4">
                            <h1 className="h3 d-flex align-items-center gap-2 mb-4">
                                <CalendarCheck aria-hidden="true" className="text-primary" />
                                My Planner
                            </h1>
                            {children}
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}

function SignIn() {
    const error = AUTH_ERRORS[new URLSearchParams(window.location.search).get('auth_error') ?? ''];

    return (
        <Card>
            {error && (
                <p className="d-flex align-items-center gap-2 text-danger" role="alert">
                    <CircleAlert aria-hidden="true" size={18} /> {error}
                </p>
            )}
            <a
                className="btn btn-primary d-inline-flex align-items-center gap-2"
                href="/auth/google/redirect"
            >
                <LogIn aria-hidden="true" size={18} /> Sign in with Google
            </a>
        </Card>
    );
}

// A placeholder until the app shell arrives in Phase 2: it proves sign-in
// and the API work end to end.
function Home({ session }: { session: Session }) {
    const queryClient = useQueryClient();
    const categories = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
    const logout = useMutation({
        mutationFn: signOut,
        onSuccess: () => queryClient.setQueryData(['session'], null),
    });

    return (
        <Card>
            <p className="mb-1">
                Signed in as <strong>{session.user.name}</strong>
            </p>
            <p className="text-secondary">
                {session.household.name}:{' '}
                {session.household.members.map((member) => member.name).join(' and ')}
            </p>
            <ul className="list-unstyled d-flex flex-wrap gap-2 mb-4" aria-label="Categories">
                {categories.data?.map((category) => (
                    <li
                        key={category.id}
                        className="badge rounded-pill fw-normal fs-6"
                        style={{ backgroundColor: category.color }}
                    >
                        {category.name}
                    </li>
                ))}
            </ul>
            <button
                type="button"
                className="btn btn-outline-secondary d-inline-flex align-items-center gap-2"
                onClick={() => logout.mutate()}
                disabled={logout.isPending}
            >
                <LogOut aria-hidden="true" size={18} /> Sign out
            </button>
        </Card>
    );
}
