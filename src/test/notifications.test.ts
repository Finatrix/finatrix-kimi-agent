import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildNotifications, getUnreadCount, markAllRead, dismiss, clearNotificationState,
} from '../tools/lib/notifications';
import { currentMonth } from '../tools/lib/month';

const CM = currentMonth();

/** Seed a budget where spending exceeds income → overspend notification. */
function seedOverspend() {
  localStorage.setItem('fx_bb_data', JSON.stringify({
    [CM]: { income: '30000', n: '50', w: '30', s: '20', vals: { rent: 25000, groceries: 10000 } },
  }));
  localStorage.setItem('fx_expenses', JSON.stringify([
    { id: '1', amount: 25000, category: 'rent', date: `${CM}-02` },
    { id: '2', amount: 10000, category: 'groceries', date: `${CM}-05` },
  ]));
}

describe('finance notifications', () => {
  beforeEach(() => { localStorage.clear(); clearNotificationState(); });

  it('produces no notifications when there is no data (never fabricates)', () => {
    expect(buildNotifications()).toHaveLength(0);
    expect(getUnreadCount()).toBe(0);
  });

  it('derives an overspend warning from real budget + expense data', () => {
    seedOverspend();
    const list = buildNotifications();
    expect(list.some((n) => n.tone === 'warn' && /overspent/i.test(n.title))).toBe(true);
    expect(getUnreadCount()).toBeGreaterThan(0);
  });

  it('markAllRead clears the unread count without removing the items', () => {
    seedOverspend();
    const before = buildNotifications().length;
    expect(before).toBeGreaterThan(0);
    markAllRead();
    expect(getUnreadCount()).toBe(0);
    expect(buildNotifications().length).toBe(before); // still visible, just read
  });

  it('dismiss removes a notification permanently', () => {
    seedOverspend();
    const first = buildNotifications()[0];
    dismiss(first.id);
    expect(buildNotifications().some((n) => n.id === first.id)).toBe(false);
  });

  it('stable ids mean read-state survives a rebuild', () => {
    seedOverspend();
    markAllRead();
    // Rebuilding yields the same ids → still read.
    expect(getUnreadCount()).toBe(0);
  });
});
