import { CircleAlert, LogIn } from 'lucide-react';
import type { ReactNode } from 'react';

const AUTH_ERRORS: Record<string, string> = {
    not_allowed: 'That Google account isn’t on this planner’s guest list.',
    failed: 'Google sign-in didn’t finish. Please try again.',
};

/** The centered card used before anyone is signed in. */
export function WelcomeCard({ children }: { children: ReactNode }) {
    return (
        <main className="container-fluid py-5">
            <div className="row justify-content-center">
                <div className="col-12 col-md-8 col-lg-5">
                    <div className="planner-card p-4">
                        <h1 className="page-title d-flex align-items-center gap-2 mb-3">
                            <img src="/icons/logo.svg" alt="" width={40} height={40} />
                            My Planner
                        </h1>
                        {children}
                    </div>
                    <p className="text-center small mt-3 mb-0">
                        <a href="/privacy">Privacy Policy</a> ·{' '}
                        <a href="/terms">Terms of Service</a>
                    </p>
                </div>
            </div>
        </main>
    );
}

export default function SignIn() {
    const error = AUTH_ERRORS[new URLSearchParams(window.location.search).get('auth_error') ?? ''];

    return (
        <WelcomeCard>
            {error && (
                <p
                    className="d-flex align-items-center gap-2"
                    role="alert"
                    style={{ color: 'var(--danger)' }}
                >
                    <CircleAlert aria-hidden="true" size={18} /> {error}
                </p>
            )}
            <p className="text-soft">
                A private planner for one household: daily tasks, weekly and monthly goals, routines
                and habits, kept in step with Google Tasks and Google Calendar.
            </p>
            <a
                className="button-ink d-inline-flex align-items-center gap-2"
                href="/auth/google/redirect"
            >
                <LogIn aria-hidden="true" size={18} /> Sign in with Google
            </a>
        </WelcomeCard>
    );
}
