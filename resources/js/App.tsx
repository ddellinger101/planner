import { useQuery } from '@tanstack/react-query';
import { CalendarCheck, CircleAlert, CircleCheck, LoaderCircle } from 'lucide-react';
import { fetchHealth } from './api/health';

export default function App() {
    const health = useQuery({ queryKey: ['health'], queryFn: fetchHealth, retry: false });

    return (
        <main className="container-fluid py-5">
            <div className="row justify-content-center">
                <div className="col-12 col-md-8 col-lg-5">
                    <div className="card shadow-sm border-0">
                        <div className="card-body p-4">
                            <h1 className="h3 d-flex align-items-center gap-2 mb-1">
                                <CalendarCheck aria-hidden="true" className="text-primary" />
                                My Planner
                            </h1>
                            <p className="text-secondary mb-4">
                                Phase 0: the foundation is in place.
                            </p>
                            <HealthStatus
                                isPending={health.isPending}
                                isError={health.isError}
                                database={health.data?.database}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </main>
    );
}

type HealthStatusProps = {
    isPending: boolean;
    isError: boolean;
    database?: string;
};

function HealthStatus({ isPending, isError, database }: HealthStatusProps) {
    if (isPending) {
        return (
            <p className="d-flex align-items-center gap-2 mb-0">
                <LoaderCircle aria-hidden="true" size={18} /> Checking the server…
            </p>
        );
    }

    if (isError || database !== 'ok') {
        return (
            <p className="d-flex align-items-center gap-2 mb-0 text-danger" role="alert">
                <CircleAlert aria-hidden="true" size={18} />
                {isError ? 'The server did not respond.' : 'The database is not reachable.'}
            </p>
        );
    }

    return (
        <p className="d-flex align-items-center gap-2 mb-0 text-success">
            <CircleCheck aria-hidden="true" size={18} /> Server and database are healthy.
        </p>
    );
}
