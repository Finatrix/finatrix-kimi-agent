import { store } from './storage';

/**
 * "New since you last looked" for each group (step 3.9), the notification
 * that works with no push service: the Groups list counts changes other
 * members made after you last opened the group. Per device and account
 * (in ACCOUNT_LOCAL_KEYS), so signing out clears it.
 */
export const GROUP_SEEN_KEY = 'fx_group_seen';

interface Seen { uid: string; at: Record<string, string> }

function load(uid: string): Seen {
  try {
    const parsed = JSON.parse(store.get(GROUP_SEEN_KEY, 'null')) as Seen | null;
    if (parsed && parsed.uid === uid && parsed.at && typeof parsed.at === 'object') return parsed;
  } catch { /* start again */ }
  return { uid, at: {} };
}

/** When you last opened the group on this device, or null if never. */
export function groupSeenAt(uid: string, groupId: string): string | null {
  return load(uid).at[groupId] ?? null;
}

export function markGroupSeen(uid: string, groupId: string, now: Date = new Date()): void {
  const seen = load(uid);
  seen.at[groupId] = now.toISOString();
  store.set(GROUP_SEEN_KEY, JSON.stringify(seen));
}

/** Words for a badge: "3 new", "20+ new", or null for nothing new. */
export function newBadge(count: number | undefined): string | null {
  if (!count || count <= 0) return null;
  return count > 20 ? '20+ new' : `${count} new`;
}
