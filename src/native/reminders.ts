import { LocalNotifications } from '@capacitor/local-notifications';
import { reminderIds, type PlannedReminder } from '../tools/lib/reminders';

/**
 * The apps' half of reminders: hands the plan from tools/lib/reminders.ts to
 * the operating system, which delivers it whether or not the app is running.
 * Loaded only inside the native shells, like bridge.ts.
 */

export type ReminderPermission = 'granted' | 'denied' | 'prompt';

function normalise(state: string): ReminderPermission {
  return state === 'granted' ? 'granted' : state === 'denied' ? 'denied' : 'prompt';
}

export async function reminderPermission(): Promise<ReminderPermission> {
  try {
    return normalise((await LocalNotifications.checkPermissions()).display);
  } catch {
    return 'denied';
  }
}

/** Shows the system prompt. Only ever called from a tap on "Turn on". */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  try {
    return normalise((await LocalNotifications.requestPermissions()).display);
  } catch {
    return 'denied';
  }
}

/** Replace whatever was scheduled with this plan. An empty plan clears it. */
export async function scheduleReminders(plan: readonly PlannedReminder[]): Promise<void> {
  try {
    await LocalNotifications.cancel({ notifications: reminderIds().map((id) => ({ id })) });
    if (plan.length === 0) return;
    await LocalNotifications.schedule({
      notifications: plan.map((p) => ({
        id: p.id,
        title: p.title,
        body: p.body,
        // Not exact: a reminder a few minutes late is fine, and exact alarms
        // need a permission this app has no reason to hold. It has to be said
        // explicitly — the plugin defaults to exact, and on Android 12+ that
        // opens the system "Alarms & reminders" screen and leaves this call
        // waiting on it, so nothing was ever scheduled.
        isExactNotification: false,
        schedule: { at: p.at, allowWhileIdle: true },
        extra: { href: p.href },
      })),
    });
  } catch {
    /* Permission withdrawn in system settings, or the scheduler refused: the
       in-app bell still carries the same information. */
  }
}

/** Open the screen a tapped reminder points at. Returns a disposer. */
export function listenForReminderTaps(navigate: (to: string) => void): () => void {
  const registration = LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
    const href: unknown = event.notification.extra?.href;
    // Only in-app tool paths the plan itself produces.
    if (typeof href === 'string' && /^\/tools\/[a-z]+$/.test(href)) navigate(href);
  }).catch(() => undefined);
  return () => void registration.then((handle) => handle?.remove()).catch(() => {});
}
