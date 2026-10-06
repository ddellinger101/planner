export class ApiError extends Error {
    constructor(
        public status: number,
        public body: unknown,
    ) {
        super(`Request failed with status ${status}`);
    }
}

function xsrfToken(): string | undefined {
    const match = document.cookie.match(/(?:^|; )XSRF-TOKEN=([^;]+)/);

    return match ? decodeURIComponent(match[1]) : undefined;
}

type Options = {
    method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    body?: unknown;
};

/**
 * Call the app's own backend. Authentication is the session cookie; Laravel
 * also wants its XSRF token echoed back on anything that isn't a read.
 */
export async function api<T>(path: string, { method = 'GET', body }: Options = {}): Promise<T> {
    const headers: Record<string, string> = { Accept: 'application/json' };
    const token = xsrfToken();

    if (method !== 'GET' && token) {
        headers['X-XSRF-TOKEN'] = token;
    }

    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
    }

    const response = await fetch(path, {
        method,
        headers,
        credentials: 'same-origin',
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    const payload = response.status === 204 ? null : await response.json().catch(() => null);

    if (!response.ok) {
        throw new ApiError(response.status, payload);
    }

    return payload as T;
}
