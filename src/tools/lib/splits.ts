import { getJSON, setJSON } from './storage';
import { SPLIT_ENTRIES_KEY, SPLIT_PEOPLE_KEY } from './syncMerge';
import {
  computeBalances, parseShares, splitExpense, toPaise, isSplitRule,
  type ShareEntry, type SplitExpense, type SplitRule, type SplitSettlement,
} from './groupSplit';

/**
 * Splits with people not on FinatriX (NEW_FEATURES item 9, build step 2.5).
 *
 * A list of people that lives in your own data (synced between your devices
 * like any other tool data, never shared with them), and what passed between
 * you and each of them: bills you split, money lent or borrowed, and
 * settlements. Friends who use FinatriX go through Groups instead.
 *
 * The maths is 2.4's, called as it is (lib/groupSplit.ts): a bill is split by
 * `checkSplit`/`splitExpense`, and balances come from `computeBalances` over
 * two-party rows. What is new is only that every entry is between YOU and one
 * other person, so nothing here ever says "Asha pays Ben". The rules, with a
 * worked example, are in docs/SPLITS.md.
 */

/** Synced keys (cloudSync SYNC_KEYS), merged by id with the later edit winning (`mergeTrips`). */
export { SPLIT_PEOPLE_KEY, SPLIT_ENTRIES_KEY };

/** You, in every split. Sorts before every `p_…` id, so a tied leftover paisa is yours. */
export const ME = 'me';
/** A bill holds up to 20 people (2.4's `parseShares` limit): you and 19 others. */
export const MAX_IN_BILL = 20;
export const PERSON_NAME_MAX = 40;
export const SPLIT_NOTE_MAX = 200;
/** The largest amount the forms accept, in rupees (as for group amounts). */
export const SPLIT_AMOUNT_MAX = 1e10;

interface Stamped {
  id: string;
  createdAt: string;
  updatedAt: string;
  /** Deleted: the record stays, marked, so the deletion reaches your other devices. */
  deletedAt?: string;
}

export interface SplitPersonRecord extends Stamped {
  name: string;
}

export interface BillEntry extends Stamped {
  kind: 'bill';
  /** Rupees, two decimals. */
  amount: number;
  date: string;
  note: string;
  /** A personal category key, for your share in the Expense Tracker. */
  category: string;
  /** `me` or a person id. */
  paidBy: string;
  rule: SplitRule;
  /** As 2.4 stores them: `member` is `me` or a person id. */
  shares: ShareEntry[];
}

export interface MoneyEntry extends Stamped {
  /**
   * `lent`: you gave them money. `borrowed`: they gave you money.
   * `settled_in`: they paid you back. `settled_out`: you paid them back.
   */
  kind: 'lent' | 'borrowed' | 'settled_in' | 'settled_out';
  personId: string;
  amount: number;
  date: string;
  note: string;
}

export type SplitEntry = BillEntry | MoneyEntry;

const MONEY_KINDS = new Set(['lent', 'borrowed', 'settled_in', 'settled_out']);

const str = (v: unknown, max = 500): string => (typeof v === 'string' ? v.slice(0, max) : '');
const isDay = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const goodAmount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= SPLIT_AMOUNT_MAX;

function stamped(raw: Record<string, unknown>): Stamped | null {
  const id = str(raw.id, 80);
  if (!id) return null;
  const createdAt = str(raw.createdAt, 40) || str(raw.updatedAt, 40);
  const updatedAt = str(raw.updatedAt, 40) || createdAt;
  const deletedAt = str(raw.deletedAt, 40);
  return { id, createdAt, updatedAt, ...(deletedAt ? { deletedAt } : {}) };
}

/** A stored person, checked. Null when unusable (another device's bad write never breaks the screen). */
export function normalizePerson(raw: unknown): SplitPersonRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const base = stamped(raw as Record<string, unknown>);
  const name = str((raw as { name?: unknown }).name, PERSON_NAME_MAX).trim();
  return base && name ? { ...base, name } : null;
}

/** A stored entry, checked. Null when unusable. */
export function normalizeEntry(raw: unknown): SplitEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const base = stamped(r);
  if (!base || !goodAmount(r.amount) || !isDay(r.date)) return null;
  const note = str(r.note, SPLIT_NOTE_MAX);
  if (r.kind === 'bill') {
    const shares = parseShares(r.shares);
    const paidBy = str(r.paidBy, 80);
    if (!shares || !paidBy || !isSplitRule(r.rule)) return null;
    return { ...base, kind: 'bill', amount: r.amount, date: r.date, note, category: str(r.category, 80) || 'other', paidBy, rule: r.rule, shares };
  }
  if (typeof r.kind === 'string' && MONEY_KINDS.has(r.kind)) {
    const personId = str(r.personId, 80);
    if (!personId) return null;
    return { ...base, kind: r.kind as MoneyEntry['kind'], personId, amount: r.amount, date: r.date, note };
  }
  return null;
}

export function loadSplitPeople(): SplitPersonRecord[] {
  const raw = getJSON<unknown>(SPLIT_PEOPLE_KEY, []);
  return Array.isArray(raw) ? raw.map(normalizePerson).filter((p): p is SplitPersonRecord => p !== null) : [];
}

export function loadSplitEntries(): SplitEntry[] {
  const raw = getJSON<unknown>(SPLIT_ENTRIES_KEY, []);
  return Array.isArray(raw) ? raw.map(normalizeEntry).filter((e): e is SplitEntry => e !== null) : [];
}

export const saveSplitPeople = (list: readonly SplitPersonRecord[]): boolean => setJSON(SPLIT_PEOPLE_KEY, list);
export const saveSplitEntries = (list: readonly SplitEntry[]): boolean => setJSON(SPLIT_ENTRIES_KEY, list);

/** Put `row` in place of the record with its id, or first when new. */
export function upsertById<T extends { id: string }>(list: readonly T[], row: T): T[] {
  return list.some((x) => x.id === row.id) ? list.map((x) => (x.id === row.id ? row : x)) : [row, ...list];
}

export const live = <T extends { deletedAt?: string }>(list: readonly T[]): T[] => list.filter((x) => !x.deletedAt);

function newId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return `${prefix}${crypto.randomUUID()}`;
  } catch { /* fall through */ }
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}
export const newPersonId = (): string => newId('p_');
export const newEntryId = (): string => newId('s_');

/* ------------------------------------------------------------------------ */
/* Who owes whom                                                             */
/* ------------------------------------------------------------------------ */

/**
 * One entry as rows `computeBalances` (2.4) reads, each between you and one
 * other person:
 * - a bill you paid: each other person in it owes you their share;
 * - a bill someone else paid: you owe them your share (the others' shares are
 *   between them and the payer, so they are not yours to track);
 * - lent or borrowed: the whole amount, one way;
 * - a settlement: a 2.4 settlement row, so it nets the same way.
 */
export function entryRows(entry: SplitEntry): { expenses: SplitExpense[]; settlements: SplitSettlement[] } {
  if (entry.deletedAt) return { expenses: [], settlements: [] };
  const one = (paidBy: string, owes: string, paise: number): SplitExpense =>
    ({ amount: paise / 100, paid_by: paidBy, split_rule: 'exact', shares: [{ member: owes, value: paise / 100 }] });
  switch (entry.kind) {
    case 'bill': {
      const split = splitExpense(toPaise(entry.amount), entry.rule, entry.shares);
      if (!split) return { expenses: [], settlements: [] };
      if (entry.paidBy === ME) {
        const rows = [...split.shares].filter(([id, paise]) => id !== ME && paise > 0).map(([id, paise]) => one(ME, id, paise));
        return { expenses: rows, settlements: [] };
      }
      const mine = split.shares.get(ME) ?? 0;
      return { expenses: mine > 0 ? [one(entry.paidBy, ME, mine)] : [], settlements: [] };
    }
    case 'lent': return { expenses: [one(ME, entry.personId, toPaise(entry.amount))], settlements: [] };
    case 'borrowed': return { expenses: [one(entry.personId, ME, toPaise(entry.amount))], settlements: [] };
    case 'settled_in': return { expenses: [], settlements: [{ from_member: entry.personId, to_member: ME, amount: entry.amount }] };
    case 'settled_out': return { expenses: [], settlements: [{ from_member: ME, to_member: entry.personId, amount: entry.amount }] };
  }
}

/**
 * Each person's balance WITH YOU, in paise: positive, they owe you; negative,
 * you owe them. Computed by 2.4's `computeBalances`, whose sign is the group's
 * ("positive: the group owes them"), so it is flipped here.
 */
export function balancesWithPeople(entries: readonly SplitEntry[]): Map<string, number> {
  const expenses: SplitExpense[] = [];
  const settlements: SplitSettlement[] = [];
  for (const e of entries) {
    const rows = entryRows(e);
    expenses.push(...rows.expenses);
    settlements.push(...rows.settlements);
  }
  const out = new Map<string, number>();
  for (const [id, paise] of computeBalances(expenses, settlements)) {
    if (id !== ME) out.set(id, paise === 0 ? 0 : -paise);
  }
  return out;
}

/** Your own share of a bill, in paise (0 when you are not in it). Only this is spending. */
export function myShareOf(entry: BillEntry): number {
  if (entry.deletedAt) return 0;
  return splitExpense(toPaise(entry.amount), entry.rule, entry.shares)?.shares.get(ME) ?? 0;
}

/** The people an entry involves, other than you. */
export function peopleIn(entry: SplitEntry): string[] {
  if (entry.kind !== 'bill') return [entry.personId];
  const ids = new Set([entry.paidBy, ...entry.shares.map((s) => s.member)]);
  ids.delete(ME);
  return [...ids];
}

/**
 * Whether a bill can be saved as typed (the split itself is checked by 2.4's
 * `checkSplit`). The sentence is what the form shows.
 */
export function checkBillPeople(paidBy: string, members: readonly string[]): string | null {
  if (!members.some((m) => m !== ME)) return 'Choose at least one person to split with.';
  if (members.length > MAX_IN_BILL) return `A bill can be split between up to ${MAX_IN_BILL} people.`;
  if (paidBy !== ME && !members.includes(ME)) return 'You’re not in this split, so there’s nothing between you to track. Tick “You”, or choose who paid.';
  return null;
}

/* ------------------------------------------------------------------------ */
/* Reminder through WhatsApp                                                 */
/* ------------------------------------------------------------------------ */

/**
 * A reminder the user sends THEMSELVES, through 2.4's `whatsappLink`. The text
 * holds a first name, an amount and, when there is one, what it was for.
 */
export function personReminderText(opts: { toName: string; amount: string; forWhat?: string }): string {
  const first = opts.toName.trim().split(/\s+/)[0] || opts.toName;
  const what = opts.forWhat?.trim();
  return `Hi ${first}, a quick reminder: you owe me ${opts.amount}${what ? ` for ${what}` : ''}. Thank you!`;
}
