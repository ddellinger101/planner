export type Health = {
    status: 'ok' | 'degraded';
    database: 'ok' | 'error';
    time: string;
};

export async function fetchHealth(): Promise<Health> {
    const response = await fetch('/health', { headers: { Accept: 'application/json' } });

    // A degraded server answers 503 with the same JSON body.
    if (!response.ok && response.status !== 503) {
        throw new Error(`Health check failed with status ${response.status}`);
    }

    return response.json();
}
