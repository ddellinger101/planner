/*
 * The planner's service worker. It does two jobs:
 *
 * 1. Keeps the app opening when the network is slow or gone: the page shell
 *    and its built assets are cached, and the last answers to read-only API
 *    calls are kept as a fallback, so today's page can still be read offline.
 *    The network is always tried first for pages and data, so nothing stale
 *    is shown while online.
 * 2. Shows push notifications, and opens the right page when one is tapped.
 *
 * Changing CACHE throws away everything cached by an earlier version.
 */
const CACHE = 'planner-v1';
const SHELL = '/';

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches
            .keys()
            .then((names) => Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name))))
            .then(() => self.clients.claim()),
    );
});

const keep = async (key, response) => {
    if (response.ok) {
        const cache = await caches.open(CACHE);
        await cache.put(key, response.clone());
    }

    return response;
};

/** Try the network; if it can't be reached, use what was kept last time. */
const networkFirst = async (request, key = request) => {
    try {
        return await keep(key, await fetch(request));
    } catch (error) {
        const kept = await caches.match(key);

        if (kept) {
            return kept;
        }

        throw error;
    }
};

/** Built assets have a hash in their name, so a kept copy never goes out of date. */
const cacheFirst = async (request) => (await caches.match(request)) ?? keep(request, await fetch(request));

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    if (request.method !== 'GET' || url.origin !== self.location.origin) {
        return;
    }

    // Signing in and out, and the public pages, always go to the server.
    if (/^\/(auth\/|health$|up$|privacy$|terms$|sw\.js$)/.test(url.pathname)) {
        return;
    }

    if (request.mode === 'navigate') {
        // Every page of the app is the same shell; one copy serves them all offline.
        event.respondWith(networkFirst(request, SHELL));
    } else if (url.pathname.startsWith('/build/') || url.pathname.startsWith('/icons/')) {
        event.respondWith(cacheFirst(request));
    } else if (url.pathname.startsWith('/api/')) {
        event.respondWith(networkFirst(request));
    }
});

// The page asks for this on sign-out, so one person's data isn't left for the next.
self.addEventListener('message', (event) => {
    if (event.data === 'clear-data') {
        event.waitUntil(
            caches.open(CACHE).then(async (cache) => {
                const requests = await cache.keys();

                await Promise.all(
                    requests
                        .filter((request) => new URL(request.url).pathname.startsWith('/api/'))
                        .map((request) => cache.delete(request)),
                );
            }),
        );
    }
});

self.addEventListener('push', (event) => {
    let data = {};

    try {
        data = event.data?.json() ?? {};
    } catch {
        data = { body: event.data?.text() };
    }

    event.waitUntil(
        self.registration.showNotification(data.title ?? 'My Planner', {
            body: data.body ?? '',
            icon: '/icons/icon-192.png',
            badge: '/icons/badge-96.png',
            // A second reminder about the same thing replaces the first.
            tag: data.tag ?? 'planner',
            data: { url: data.url ?? '/' },
        }),
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();

    const target = new URL(event.notification.data?.url ?? '/', self.location.origin).href;

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
            // Reuse a window that is already open, if there is one.
            const open = windows.find((client) => 'focus' in client);

            return open ? open.navigate(target).then((client) => (client ?? open).focus()) : self.clients.openWindow(target);
        }),
    );
});
