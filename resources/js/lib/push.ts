/** Whether this browser can receive push notifications at all. */
export const pushSupported = () =>
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** An iPhone or iPad, where push only works once the app is on the Home Screen. */
export const isAppleMobile = () =>
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports itself as a Mac, but a Mac has no touch screen.
    (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

/** Opened from the Home Screen (or installed), not in a browser tab. */
export const isInstalled = () =>
    window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** Register the service worker. Does nothing where there isn't one to register with. */
export async function registerServiceWorker(): Promise<void> {
    if ('serviceWorker' in navigator) {
        try {
            await navigator.serviceWorker.register('/sw.js');
        } catch {
            // The app works without it; only offline use and notifications are lost.
        }
    }
}

/** Drop the data kept for offline reading, so it isn't left for whoever signs in next. */
export function clearOfflineData(): void {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.controller?.postMessage('clear-data');
    }
}

/** The key arrives as URL-safe base64; the browser wants the raw bytes. */
function keyBytes(base64Url: string): Uint8Array<ArrayBuffer> {
    const padded = base64Url.padEnd(base64Url.length + ((4 - (base64Url.length % 4)) % 4), '=');
    const raw = atob(padded.replaceAll('-', '+').replaceAll('_', '/'));

    return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

/** This device's push subscription, if it has one. */
export async function currentSubscription(): Promise<PushSubscription | null> {
    if (!pushSupported()) {
        return null;
    }

    const registration = await navigator.serviceWorker.getRegistration();

    return (await registration?.pushManager.getSubscription()) ?? null;
}

export type SubscriptionKeys = { endpoint: string; keys: { p256dh: string; auth: string } };

/**
 * Ask for permission and subscribe this device. Throws "denied" when the
 * person (or an earlier choice of theirs) says no.
 */
export async function subscribeDevice(vapidPublicKey: string): Promise<SubscriptionKeys> {
    if ((await Notification.requestPermission()) !== 'granted') {
        throw new Error('denied');
    }

    const registration =
        (await navigator.serviceWorker.getRegistration()) ??
        (await navigator.serviceWorker.register('/sw.js'));
    await navigator.serviceWorker.ready;

    const subscription =
        (await registration.pushManager.getSubscription()) ??
        (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: keyBytes(vapidPublicKey),
        }));
    const json = subscription.toJSON();

    return {
        endpoint: subscription.endpoint,
        keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' },
    };
}

/** Unsubscribe this device and return the endpoint it had, so the server can forget it. */
export async function unsubscribeDevice(): Promise<string | null> {
    const subscription = await currentSubscription();

    if (!subscription) {
        return null;
    }

    await subscription.unsubscribe();

    return subscription.endpoint;
}
