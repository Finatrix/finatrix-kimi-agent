/**
 * Browser Push (Phase 4, Module 8). Uses the standard Notification API for
 * real, working foreground/background alerts while the app (or its service
 * worker) is registered — no external push service required for this tier.
 * True offline Web Push (delivered when no tab is open) needs a VAPID key
 * pair and a push subscription endpoint stored server-side; that's the
 * documented follow-up, not implemented here.
 */

export type PushPermission = 'granted' | 'denied' | 'unsupported' | 'default';

export function pushSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getPushPermission(): PushPermission {
  if (!pushSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestPushPermission(): Promise<PushPermission> {
  if (!pushSupported()) return 'unsupported';
  const result = await Notification.requestPermission();
  return result;
}

/** Shows a browser notification immediately, if permission is granted. */
export function showPushNotification(title: string, body: string, url = '/careers/dashboard'): void {
  if (!pushSupported() || Notification.permission !== 'granted') return;
  const n = new Notification(title, { body, icon: '/favicon.svg' });
  n.onclick = () => {
    window.focus();
    window.location.href = url;
  };
}
