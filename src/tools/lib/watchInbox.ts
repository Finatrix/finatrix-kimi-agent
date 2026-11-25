/**
 * Expenses added on the watch, landing in the ledger (step 3.8).
 *
 * The watch makes the id and holds the entry until the phone has it, so the
 * same entry can arrive more than once (a retry after a lost acknowledgement,
 * or the watch and phone both re-sending after a reconnect). This is the one
 * place that makes that safe, and the only place that saves a watch expense:
 *
 *   - It uses the app's own save path: `saveExpenses` + `recordAudit`, exactly
 *     as `logSubscriptionPayment` and the voice actions do. No second ledger.
 *   - It is idempotent by id. An id already in the ledger, or one this phone
 *     has already taken in (`fx_watch_seen`, which outlives a delete), is
 *     acknowledged and not added again, so deleting a watch entry on the phone
 *     never brings it back.
 *   - It trusts nothing: the entry is validated field by field, and only
 *     `amount`, `category`, `date` and the timestamps are used.
 *   - No money maths: the amount is stored as typed (rounded to 2 places). The
 *     entry is in the home currency; travel-mode pricing is not applied (v1).
 *
 * The result lists ids to acknowledge. The native side then drops them from
 * its inbox and tells the watch, which drops them from its queue.
 */
import { ymLocal } from '../../lib/date';
import { loadCatViewFor } from './budgetCatsMonth';
import { allCategories } from './budget';
import { frequentCategoryKeys } from './expenseAnalytics';
import { auditEvent, recordAudit } from './expenseAudit';
import { isSpendingCategory, loadExpenses, migrateCategory, saveExpenses, type ExpenseItem } from './expense';
import { getJSON, runDeviceApply, setJSON } from './storage';

/** Device-only (not in SYNC_KEYS): ids this phone has already taken in. */
export const WATCH_SEEN_KEY = 'fx_watch_seen';
/** Enough for months of heavy use; older ids can no longer be in a watch queue. */
export const WATCH_SEEN_LIMIT = 500;
export const WATCH_MAX_AMOUNT = 1_000_000_000;

/** What the watch sends for one expense. */
export interface WatchExpense {
  /** `tx_` + a UUID made on the watch. */
  id: string;
  amount: number;
  /** A category key from the list the phone gave the watch. */
  category: string;
  /** Local calendar day on the watch, `YYYY-MM-DD`. */
  date: string;
  /** When the user added it, ISO 8601. */
  at: string;
}

export interface WatchIngestResult {
  /** Ids newly saved to the ledger. */
  added: string[];
  /** Ids to acknowledge: added, already known, or invalid (retrying cannot fix those). */
  ack: string[];
  /** Ids left unacknowledged on purpose, to try again (storage full, no category yet). */
  retry: string[];
}

const ID_RE = /^tx_[A-Za-z0-9_-]{8,64}$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function validDate(s: unknown, now: Date): s is string {
  if (typeof s !== 'string') return false;
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return false;
  // A day of slack for a watch in another time zone; nothing further ahead, nothing older than ~2 years.
  const latest = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const earliest = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
  return dt <= latest && dt >= earliest;
}

/** Pure: the entry if the raw value is a well-formed watch expense, else null. */
export function parseWatchExpense(raw: unknown, now: Date): WatchExpense | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !ID_RE.test(r.id)) return null;
  const amount = typeof r.amount === 'number' ? r.amount : NaN;
  if (!Number.isFinite(amount) || amount <= 0 || amount > WATCH_MAX_AMOUNT) return null;
  const rounded = Math.round(amount * 100) / 100;
  if (rounded <= 0) return null;
  if (typeof r.category !== 'string' || !r.category || r.category.length > 64) return null;
  if (!validDate(r.date, now)) return null;
  const at = typeof r.at === 'string' && Number.isFinite(Date.parse(r.at)) && Date.parse(r.at) <= now.getTime() + 864e5
    ? new Date(r.at).toISOString()
    : now.toISOString();
  return { id: r.id, amount: rounded, category: r.category, date: r.date, at };
}

interface SeenEntry { id: string; at: number }

function loadSeen(): SeenEntry[] {
  const raw = getJSON<unknown>(WATCH_SEEN_KEY, []);
  return Array.isArray(raw)
    ? raw.filter((e): e is SeenEntry => !!e && typeof e.id === 'string' && typeof e.at === 'number')
    : [];
}

/**
 * Take in a batch from the watch. `raw` is whatever the native inbox held, so
 * it is unknown on purpose.
 */
export function ingestWatchExpenses(raw: unknown[], now = new Date()): WatchIngestResult {
  const result: WatchIngestResult = { added: [], ack: [], retry: [] };
  const ledger = loadExpenses();
  const have = new Set(ledger.map((e) => e.id));
  const seen = loadSeen();
  const seenIds = new Set(seen.map((e) => e.id));

  const cats = allCategories(loadCatViewFor(ymLocal(now)).active)
    .filter((c) => isSpendingCategory({ k: c.k, section: c.section }));
  const valid = new Set(cats.map((c) => c.k));
  const fallback = frequentCategoryKeys(ledger, valid, 1)[0] ?? cats[0]?.k ?? '';

  const fresh: ExpenseItem[] = [];
  const batchIds = new Set<string>();
  for (const entry of raw) {
    const w = parseWatchExpense(entry, now);
    if (!w) {
      const id = (entry as { id?: unknown } | null)?.id;
      // An invalid entry can never become valid: acknowledge it so the watch stops resending.
      if (typeof id === 'string' && id) result.ack.push(id);
      continue;
    }
    if (have.has(w.id) || seenIds.has(w.id) || batchIds.has(w.id)) {
      result.ack.push(w.id);
      continue;
    }
    // Resolve the key like every other reader does (migrateCategory), so an
    // old key keeps its history. A key that no longer exists is filed under
    // the user's most-used category and says so, rather than being lost.
    const resolved = migrateCategory(w.category, valid);
    const known = valid.has(resolved);
    const category = known ? resolved : fallback;
    if (!category) {
      result.retry.push(w.id);
      continue;
    }
    batchIds.add(w.id);
    fresh.push({
      id: w.id,
      amount: w.amount,
      category,
      date: w.date,
      ...(known ? {} : { note: 'Added from your watch (its category was no longer in your budget)' }),
      createdAt: w.at,
      updatedAt: w.at,
    });
  }

  if (fresh.length === 0) return result;
  const saved = runDeviceApply(() => saveExpenses([...fresh, ...ledger]));
  if (!saved) {
    result.retry.push(...fresh.map((e) => e.id));
    return result;
  }
  recordAudit(fresh.map((e) => auditEvent('add', e)));
  const stamp = now.getTime();
  const nextSeen = [...fresh.map((e) => ({ id: e.id, at: stamp })), ...seen].slice(0, WATCH_SEEN_LIMIT);
  setJSON(WATCH_SEEN_KEY, nextSeen);
  result.added.push(...fresh.map((e) => e.id));
  result.ack.push(...fresh.map((e) => e.id));
  return result;
}
