import { validRecordDate } from './recordReview';
import { getJSON, setJSON } from './storage';
import { daysBetween } from './subscriptions';
import { ymdLocal } from '../../lib/date';

/**
 * Warranty and bill locker: what is kept about each bill, and when its
 * warranty runs out. The photos themselves live in lib/billPhotos.ts.
 *
 * Device-only on purpose (decided 24 Nov 2026): photos are large and syncing
 * them needs file storage, so for now neither the records nor the photos leave
 * the phone. The key is in `ACCOUNT_LOCAL_KEYS`, so it is cleared on an
 * account switch like the subscription radar's.
 *
 * The only date arithmetic is `warrantyEndFor` (see its comment) and `daysLeft`.
 * Neither touches an amount, and nothing here feeds a budget, a total or a tool.
 */

export const LOCKER_KEY = 'fx_locker';

/** Days before the end of a warranty that the evening reminder names it. */
export const WARRANTY_LEAD_DAYS = [30, 7] as const;

/** A warranty this close to its end is flagged "ending soon". */
export const ENDING_SOON_DAYS = 30;

export const MAX_ITEMS = 300;
export const MAX_PHOTOS_PER_ITEM = 4;
const MAX_TEXT = 80;
const MAX_NOTE = 400;
/** Longest warranty a person can enter by length, in months (a lifetime warranty is entered as a date). */
export const MAX_WARRANTY_MONTHS = 120;

export interface LockerItem {
  id: string;
  /** What was bought: "Samsung TV". */
  product: string;
  /** Where: "Croma". Empty when not given. */
  shop: string;
  /** Purchase day, `YYYY-MM-DD`. */
  purchased: string;
  /** Last day the warranty covers, `YYYY-MM-DD`; null when the bill has no warranty. */
  warrantyEnd: string | null;
  /** Price paid in the person's home currency, or null. Never used in any total. */
  price: number | null;
  note: string;
  /** Ids in the photo store. */
  photoIds: string[];
  /** Whether the evening reminder may name this warranty. */
  remind: boolean;
  /** `Date.now()` when added. */
  addedAt: number;
}

/* ── Date maths ──────────────────────────────────────────────────────────── */

function daysInMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/**
 * The last day a "N months from purchase" warranty covers.
 *
 *   end = (purchase day, N calendar months later; clamped to that month's last
 *          day when it has no such day) − 1 day
 *
 * A 12-month warranty from 15 Mar 2026 covers up to 14 Mar 2027, not 15 Mar:
 * counting the purchase day itself as day one is the cautious reading, and an
 * early reminder costs nothing where a late one costs the claim. Returns null
 * for an invalid date or a length outside 1…MAX_WARRANTY_MONTHS.
 */
export function warrantyEndFor(purchased: string, months: number): string | null {
  if (!validRecordDate(purchased) || !Number.isInteger(months) || months < 1 || months > MAX_WARRANTY_MONTHS) return null;
  const [y, m, d] = purchased.split('-').map(Number);
  const target = m - 1 + months;
  const year = y + Math.floor(target / 12);
  const month0 = target % 12;
  const anniversary = new Date(year, month0, Math.min(d, daysInMonth(year, month0)));
  anniversary.setDate(anniversary.getDate() - 1);
  return ymdLocal(anniversary);
}

/** Whole calendar days from `today` to the last covered day. 0 = ends today, negative = ended. */
export function daysLeft(warrantyEnd: string, today: string): number {
  return daysBetween(today, warrantyEnd);
}

export type WarrantyState = 'none' | 'active' | 'soon' | 'ended';

export function warrantyState(item: Pick<LockerItem, 'warrantyEnd'>, today: string): WarrantyState {
  if (!item.warrantyEnd) return 'none';
  const left = daysLeft(item.warrantyEnd, today);
  return left < 0 ? 'ended' : left <= ENDING_SOON_DAYS ? 'soon' : 'active';
}

/** "Ends in 30 days", "Ends tomorrow", "Ended 3 days ago". */
export function warrantyLabel(left: number): string {
  if (left < -1) return `Ended ${-left} days ago`;
  if (left === -1) return 'Ended yesterday';
  if (left === 0) return 'Ends today';
  if (left === 1) return 'Ends tomorrow';
  return `Ends in ${left} days`;
}

/* ── Records ─────────────────────────────────────────────────────────────── */

function cleanText(value: unknown, max: number): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
}

function cleanItem(raw: unknown): LockerItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const product = cleanText(r.product, MAX_TEXT);
  if (typeof r.id !== 'string' || !r.id || !product) return null;
  const purchased = typeof r.purchased === 'string' && validRecordDate(r.purchased) ? r.purchased : null;
  if (!purchased) return null;
  const warrantyEnd = typeof r.warrantyEnd === 'string' && validRecordDate(r.warrantyEnd) ? r.warrantyEnd : null;
  const price = typeof r.price === 'number' && Number.isFinite(r.price) && r.price >= 0 ? r.price : null;
  const photoIds = Array.isArray(r.photoIds)
    ? r.photoIds.filter((p): p is string => typeof p === 'string' && p.length > 0).slice(0, MAX_PHOTOS_PER_ITEM)
    : [];
  return {
    id: r.id,
    product,
    shop: cleanText(r.shop, MAX_TEXT),
    purchased,
    warrantyEnd,
    price,
    note: cleanText(r.note, MAX_NOTE),
    photoIds,
    remind: r.remind !== false,
    addedAt: typeof r.addedAt === 'number' && Number.isFinite(r.addedAt) ? r.addedAt : 0,
  };
}

export function loadLocker(): LockerItem[] {
  const saved = getJSON<unknown>(LOCKER_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved.map(cleanItem).filter((i): i is LockerItem => i !== null).slice(0, MAX_ITEMS);
}

/** Whether the list reached persistent storage. */
export function saveLocker(items: readonly LockerItem[]): boolean {
  return setJSON(LOCKER_KEY, items);
}

export function newItemId(): string {
  return `bl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export interface ItemDraft {
  product: string;
  shop: string;
  purchased: string;
  /** Warranty by length. Ignored when `warrantyEnd` is given. */
  months: number | null;
  /** Warranty by date. */
  warrantyEnd: string | null;
  price: number | null;
  note: string;
  photoIds: string[];
  remind: boolean;
}

export type DraftError = 'product' | 'purchased' | 'warranty' | 'price' | 'full';

/**
 * Turn what the form holds into a record, or say which field to fix.
 * A warranty date before the purchase day is refused: it cannot be right.
 */
export function buildItem(
  draft: ItemDraft, existing: readonly LockerItem[], id: string = newItemId(), now: number = Date.now(),
): { item: LockerItem } | { error: DraftError } {
  const product = cleanText(draft.product, MAX_TEXT);
  if (!product) return { error: 'product' };
  if (!validRecordDate(draft.purchased)) return { error: 'purchased' };
  let warrantyEnd: string | null = null;
  if (draft.warrantyEnd) {
    if (!validRecordDate(draft.warrantyEnd) || draft.warrantyEnd < draft.purchased) return { error: 'warranty' };
    warrantyEnd = draft.warrantyEnd;
  } else if (draft.months != null) {
    warrantyEnd = warrantyEndFor(draft.purchased, draft.months);
    if (!warrantyEnd) return { error: 'warranty' };
  }
  if (draft.price != null && !(Number.isFinite(draft.price) && draft.price >= 0)) return { error: 'price' };
  if (existing.length >= MAX_ITEMS && !existing.some((i) => i.id === id)) return { error: 'full' };
  return {
    item: {
      id, product, shop: cleanText(draft.shop, MAX_TEXT), purchased: draft.purchased, warrantyEnd,
      price: draft.price, note: cleanText(draft.note, MAX_NOTE),
      photoIds: draft.photoIds.slice(0, MAX_PHOTOS_PER_ITEM), remind: draft.remind, addedAt: now,
    },
  };
}

/** Replace the record with the same id, or add it first. Keeps the original `addedAt` on an edit. */
export function upsertItem(items: readonly LockerItem[], item: LockerItem): LockerItem[] {
  const at = items.findIndex((i) => i.id === item.id);
  if (at < 0) return [item, ...items];
  const next = [...items];
  next[at] = { ...item, addedAt: items[at].addedAt };
  return next;
}

export function removeItem(items: readonly LockerItem[], id: string): LockerItem[] {
  return items.filter((i) => i.id !== id);
}

/* ── Search and order ────────────────────────────────────────────────────── */

/** Case-insensitive match on product, shop and note. Every word must be found. */
export function searchLocker(items: readonly LockerItem[], query: string): LockerItem[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...items];
  return items.filter((i) => {
    const hay = `${i.product} ${i.shop} ${i.note}`.toLocaleLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/**
 * The order of the list: warranties still running, soonest end first; then
 * bills with no warranty, newest purchase first; then ended ones, most
 * recently ended first.
 */
export function sortLocker(items: readonly LockerItem[], today: string): LockerItem[] {
  const rank = (i: LockerItem) => (i.warrantyEnd === null ? 1 : daysLeft(i.warrantyEnd, today) >= 0 ? 0 : 2);
  return [...items].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) return (a.warrantyEnd as string).localeCompare(b.warrantyEnd as string);
    if (ra === 2) return (b.warrantyEnd as string).localeCompare(a.warrantyEnd as string);
    return b.purchased.localeCompare(a.purchased);
  });
}

/* ── Reminders ───────────────────────────────────────────────────────────── */

export interface WarrantyEvent {
  id: string;
  product: string;
  /** Last covered day. */
  end: string;
}

/** Warranties that may be named in a reminder: still running, reminders on. */
export function warrantyEvents(items: readonly LockerItem[], today: string): WarrantyEvent[] {
  return items
    .filter((i): i is LockerItem & { warrantyEnd: string } => i.remind && i.warrantyEnd !== null && daysLeft(i.warrantyEnd, today) >= 0)
    .map((i) => ({ id: i.id, product: i.product, end: i.warrantyEnd }));
}

/** The warranties in the "ending soon" window, soonest first, for the bell. */
export function endingSoon(items: readonly LockerItem[], today: string): Array<LockerItem & { left: number }> {
  return items
    .filter((i) => i.warrantyEnd !== null)
    .map((i) => ({ ...i, left: daysLeft(i.warrantyEnd as string, today) }))
    .filter((i) => i.left >= 0 && i.left <= ENDING_SOON_DAYS)
    .sort((a, b) => a.left - b.left);
}
