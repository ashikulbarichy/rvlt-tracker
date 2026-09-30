/**
 * Browser side of push notifications: feature detection and the PushManager calls.
 * Saving the subscription is usePushNotifications' job.
 */

/** The VAPID public key, from the environment. Push is off in builds without one. */
export const VAPID_PUBLIC_KEY = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined) || '';

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(navigator.userAgent) ||
  // iPadOS reports itself as a Mac; touch gives it away.
  (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);

/** Running as the installed app rather than a browser tab. */
export const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

export type PushSupport =
  | 'supported'
  | 'unconfigured'       // this build has no VAPID key
  | 'ios-needs-install'  // iPhone/iPad: push only works from the Home Screen app
  | 'unsupported';

export function pushSupport(): PushSupport {
  if (!VAPID_PUBLIC_KEY) return 'unconfigured';
  const apis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIOS() && !isStandalone()) return 'ios-needs-install';
  return apis ? 'supported' : 'unsupported';
}

function keyBytes(base64url: string): Uint8Array {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}

/** The service worker, registering it if the page has not yet (e.g. a dev build). */
async function worker(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration();
  if (existing) return existing;
  await navigator.serviceWorker.register('/sw.js');
  return navigator.serviceWorker.ready;
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (pushSupport() !== 'supported') return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

/**
 * Asks for permission (must run from a tap: iOS refuses otherwise) and subscribes.
 * Throws with a readable message when the person declines.
 */
export async function subscribeToPush(): Promise<PushSubscription> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      permission === 'denied'
        ? 'Notifications are blocked for this site. Allow them in your browser or phone settings, then try again.'
        : 'Notifications were not allowed.',
    );
  }
  const reg = await worker();
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
}

export interface SubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export function subscriptionKeys(sub: PushSubscription): SubscriptionKeys {
  const json = sub.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('The browser returned an incomplete push subscription.');
  }
  return { endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth };
}
