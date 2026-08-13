/**
 * Expense audit trail — an append-only record of every change made to the
 * transaction ledger.
 *
 * WHY THIS EXISTS
 * ---------------
 * `ExpenseItem` already carries `createdAt`, `updatedAt` and `editCount`, which
 * answer "when was this row last touched?" for a row that still exists. They
 * cannot answer the two questions users actually ask of their own ledger:
 *
 *   - "What did I delete?" — the row, and its `updatedAt`, are gone with it.
 *   - "What did this used to say?" — `updatedAt` records that an edit happened,
 *     never what changed.
 *
 * A month's total that no longer matches the user's memory is a trust problem,
 * and the tracker is the one tool where a silent, unexplained change is
 * expensive. So changes are recorded as events beside the ledger rather than as
 * state on it.
 *
 * WHAT IT IS NOT
 * --------------
 * This is a history, not a versioning system: entries are descriptive and are
 * never read back into a calculation. No total, budget or projection anywhere in
 * FinatriX reads this file. Deleting the log changes nothing but the log.
 *
 * The record is also local and honest about it — it describes what happened in
 * this browser's copy of the data. It is not a tamper-proof ledger and must not
 * be presented as one.
 */
import { ymdLocal } from '../../lib/date';
import { getJSON, setJSON, store } from './storage';
import type { ExpenseItem } from './expense';

/** Storage key. Synced with the rest of the user's data (see cloudSync.ts). */
export const AUDIT_KEY = 'fx_expense_audit';

/**
 * How many changes are kept.
 *
 * A count cap rather than an age cap: someone who logs a handful of spends a
 * month should still be able to see back a year, and someone who imports
 * hundreds of rows should not be able to push localStorage toward its quota. At
 * roughly 200 bytes an entry this ceiling costs about 100 KB — a fraction of the
 * ~5 MB budget, and small enough to ride along in the cloud-sync payload.
 *
 * Eviction is oldest-first and is surfaced in the UI rather than hidden: a
 * history that silently stops is worse than one that says where it stops.
 */
export const MAX_AUDIT_ENTRIES = 500;

export type AuditAction = 'add' | 'edit' | 'delete' | 'restore' | 'duplicate';

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  add: 'Added',
  edit: 'Edited',
  delete: 'Deleted',
  restore: 'Restored',
  duplicate: 'Duplicated',
};

/**
 * The fields a change is reported against.
 *
 * Deliberately excludes `createdAt`, `updatedAt` and `editCount`: those are set
 * by the act of saving, so including them would report "updatedAt changed" on
 * every single edit and bury the one field the user actually touched.
 */
export const AUDIT_FIELDS = [
  'amount', 'category', 'date', 'note', 'merchant',
  'paymentMethod', 'tags', 'recurring', 'notes',
] as const;
export type AuditField = (typeof AUDIT_FIELDS)[number];

export const AUDIT_FIELD_LABEL: Record<AuditField, string> = {
  amount: 'Amount',
  category: 'Category',
  date: 'Date',
  note: 'Note',
  merchant: 'Merchant',
  paymentMethod: 'Payment method',
  tags: 'Tags',
  recurring: 'Recurring',
  notes: 'Details',
};

/** A recorded field value. `null` means the field was empty. */
export type AuditValue = string | number | boolean | null;

export interface AuditFieldChange {
  field: AuditField;
  before: AuditValue;
  after: AuditValue;
}

export interface AuditEntry {
  /** Identity of the log row itself — React key and de-duplication. */
  id: string;
  /** When the change was made (epoch ms), not when the spend happened. */
  ts: number;
  action: AuditAction;
  /** The transaction this concerns, by its stable id. */
  txId: string;
  /* ── Snapshot of the transaction, so a deleted row is still describable ── */
  amount: number;
  /** Raw category key. Resolve for display via `migrateCategory`. */
  category: string;
  /** The transaction's own calendar day (`YYYY-MM-DD`). */
  date: string;
  /** Merchant or note at the time — what the row was called. */
  label: string;
  /** Field-level diff. Present on edits only, and never empty. */
  changes?: AuditFieldChange[];
  /**
   * Shared by every entry written by one multi-row action, so "deleted 12
   * transactions" reads as one event while each row stays individually
   * recorded — a bulk delete the user cannot itemise is not an audit trail.
   */
  batch?: string;
}

/* ══════════════════════════════════════════════════════════════════════════
   Building entries
   ══════════════════════════════════════════════════════════════════════════ */

function genId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return prefix + crypto.randomUUID();
    }
  } catch {
    /* fall through */
  }
  return prefix + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

/** A fresh batch id, shared by every entry of one multi-row action. */
export function newBatchId(): string {
  return genId('b_');
}

/** What the row is called — the same precedence the transaction list uses. */
function labelOf(item: ExpenseItem): string {
  return item.merchant || item.note || item.notes || '';
}

/** Read one tracked field, normalised so absent and empty compare equal. */
function valueOf(item: ExpenseItem, field: AuditField): AuditValue {
  switch (field) {
    case 'amount': return item.amount;
    case 'recurring': return !!item.recurring;
    case 'tags': {
      const t = item.tags ?? [];
      return t.length ? t.join(', ') : null;
    }
    default: {
      const v = item[field];
      return v == null || v === '' ? null : String(v);
    }
  }
}

/**
 * What changed between two versions of a transaction.
 *
 * Tags are compared as their joined text, which makes reordering a no-change —
 * correct, because tag order carries no meaning anywhere in the app.
 */
export function diffTransaction(before: ExpenseItem, after: ExpenseItem): AuditFieldChange[] {
  const changes: AuditFieldChange[] = [];
  for (const field of AUDIT_FIELDS) {
    const b = valueOf(before, field);
    const a = valueOf(after, field);
    if (b !== a) changes.push({ field, before: b, after: a });
  }
  return changes;
}

interface EventOpts {
  /** Epoch ms. Defaults to now; passed explicitly by tests and batch callers. */
  ts?: number;
  batch?: string;
}

/**
 * Record a whole-row event. The snapshot describes the row as it stood *after*
 * the action — or, for a delete, as it stood the moment before it went.
 */
export function auditEvent(
  action: Exclude<AuditAction, 'edit'>,
  item: ExpenseItem,
  opts: EventOpts = {},
): AuditEntry {
  return {
    id: genId('au_'),
    ts: opts.ts ?? Date.now(),
    action,
    txId: item.id,
    amount: item.amount,
    category: item.category,
    date: item.date,
    label: labelOf(item),
    ...(opts.batch ? { batch: opts.batch } : {}),
  };
}

/**
 * Record an edit, or nothing at all.
 *
 * Returns `null` when no tracked field moved — opening a transaction and
 * pressing Save is not a change, and a history padded with non-events is a
 * history nobody scrolls. The snapshot is the *new* state, so the log lines up
 * with what the ledger now says.
 */
export function auditEdit(
  before: ExpenseItem,
  after: ExpenseItem,
  opts: EventOpts = {},
): AuditEntry | null {
  const changes = diffTransaction(before, after);
  if (changes.length === 0) return null;
  return {
    id: genId('au_'),
    ts: opts.ts ?? Date.now(),
    action: 'edit',
    txId: after.id,
    amount: after.amount,
    category: after.category,
    date: after.date,
    label: labelOf(after),
    changes,
    ...(opts.batch ? { batch: opts.batch } : {}),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Persistence
   ══════════════════════════════════════════════════════════════════════════ */

function isAuditAction(v: unknown): v is AuditAction {
  return typeof v === 'string' && v in AUDIT_ACTION_LABEL;
}

/**
 * Coerce a stored record into a well-formed entry, or `null` if it is beyond
 * saving. Storage is shared with cloud sync and older builds, so the log is
 * validated on read the way `normalizeExpense` validates the ledger.
 */
export function normalizeAuditEntry(raw: unknown): AuditEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<AuditEntry>;
  if (!isAuditAction(r.action)) return null;
  if (typeof r.ts !== 'number' || !isFinite(r.ts)) return null;
  const changes = Array.isArray(r.changes)
    ? r.changes.filter((c): c is AuditFieldChange =>
        !!c && typeof c === 'object' && AUDIT_FIELDS.includes(c.field as AuditField))
    : undefined;
  return {
    id: r.id ? String(r.id) : genId('au_'),
    ts: r.ts,
    action: r.action,
    txId: String(r.txId ?? ''),
    amount: Number(r.amount) || 0,
    category: String(r.category ?? ''),
    date: String(r.date ?? ''),
    label: String(r.label ?? ''),
    ...(changes && changes.length ? { changes } : {}),
    ...(r.batch ? { batch: String(r.batch) } : {}),
  };
}

/** The log, newest first. */
export function loadAuditLog(): AuditEntry[] {
  const raw = getJSON<unknown[]>(AUDIT_KEY, []);
  if (!Array.isArray(raw)) return [];
  return raw
    .map(normalizeAuditEntry)
    .filter((e): e is AuditEntry => e !== null)
    .sort((a, b) => b.ts - a.ts);
}

export function saveAuditLog(entries: AuditEntry[]): void {
  setJSON(AUDIT_KEY, entries);
}

/**
 * Prepend new entries and apply the cap. Pure, so the ordering and eviction
 * rules can be tested without touching storage.
 *
 * Entries arrive in the order they were produced (first victim first) and are
 * prepended as a block, keeping a batch's own order intact under a
 * newest-first log.
 */
export function appendEntries(log: AuditEntry[], entries: AuditEntry[]): AuditEntry[] {
  if (entries.length === 0) return log;
  return [...entries, ...log].slice(0, MAX_AUDIT_ENTRIES);
}

/**
 * Append to the stored log and hand back the new one, so a caller holding the
 * log in React state never has to re-read and re-parse it.
 */
export function recordAudit(entries: AuditEntry[]): AuditEntry[] {
  const next = appendEntries(loadAuditLog(), entries);
  if (entries.length > 0) saveAuditLog(next);
  return next;
}

/**
 * Erase the history. Removes the key outright rather than storing `[]`, so a
 * cleared log leaves no residue in the backup or the cloud row.
 */
export function clearAuditLog(): void {
  store.remove(AUDIT_KEY);
}

/* ══════════════════════════════════════════════════════════════════════════
   Reading the log
   ══════════════════════════════════════════════════════════════════════════ */

export interface AuditFilter {
  /** Actions to include. Empty means "all" — an empty result would be a trap. */
  actions: ReadonlySet<AuditAction>;
  /** Free text, matched against the label and the resolved category name. */
  query: string;
}

export function emptyAuditFilter(): AuditFilter {
  return { actions: new Set(), query: '' };
}

/**
 * Filter the log. `catLabel` resolves a stored category key to its display
 * name so a search for "Groceries" finds entries whose key is `grocery` — the
 * same resolution the rows themselves render with.
 */
export function filterAudit(
  entries: AuditEntry[],
  filter: AuditFilter,
  catLabel: (key: string) => string,
): AuditEntry[] {
  const q = filter.query.trim().toLowerCase();
  return entries.filter((e) => {
    if (filter.actions.size > 0 && !filter.actions.has(e.action)) return false;
    if (!q) return true;
    return e.label.toLowerCase().includes(q)
      || catLabel(e.category).toLowerCase().includes(q);
  });
}

/** Entries that happened on one calendar day, newest first. */
export interface AuditDay {
  /** Local `YYYY-MM-DD` of the change. */
  key: string;
  label: string;
  entries: AuditEntry[];
}

/**
 * Group by the day the change was made — local, never UTC, so a late-evening
 * edit in IST lands under today rather than tomorrow.
 *
 * `now` is a parameter rather than a read of the clock so the "Today" /
 * "Yesterday" banding is deterministic under test, matching `groupByTimeline`.
 */
export function groupAuditByDay(entries: AuditEntry[], now: Date): AuditDay[] {
  const today = ymdLocal(now);
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  const yesterday = ymdLocal(y);
  const thisYear = now.getFullYear();

  const days: AuditDay[] = [];
  const index = new Map<string, AuditDay>();

  for (const e of entries) {
    const d = new Date(e.ts);
    const key = ymdLocal(d);
    let group = index.get(key);
    if (!group) {
      const label = key === today ? 'Today'
        : key === yesterday ? 'Yesterday'
        : d.toLocaleDateString(undefined, {
            day: 'numeric',
            month: 'short',
            ...(d.getFullYear() === thisYear ? {} : { year: 'numeric' }),
          });
      group = { key, label, entries: [] };
      index.set(key, group);
      days.push(group);
    }
    group.entries.push(e);
  }
  return days;
}

/**
 * A run of entries shown as one row.
 *
 * Bulk actions write one entry per transaction — the user must be able to see
 * exactly which rows a "delete 12" removed — but rendering twelve near-identical
 * lines would drown the events around them. Consecutive entries sharing a batch
 * collapse into a single expandable group; everything else is a group of one.
 */
export interface AuditGroup {
  key: string;
  action: AuditAction;
  ts: number;
  entries: AuditEntry[];
  /** Signed sum of the amounts involved. */
  total: number;
}

export function groupAuditBatches(entries: AuditEntry[]): AuditGroup[] {
  const groups: AuditGroup[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && e.batch && last.entries[0].batch === e.batch && last.action === e.action) {
      last.entries.push(e);
      last.total += e.amount;
      continue;
    }
    groups.push({ key: e.id, action: e.action, ts: e.ts, entries: [e], total: e.amount });
  }
  return groups;
}
