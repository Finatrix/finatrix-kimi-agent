import { allCategories, BUILTIN_CATS } from './budget';
import type { IconName } from '../ui/Icon';
import { store } from './storage';

/**
 * Groups (NEW_FEATURES item 12, build step 2.3): the app side of the shared
 * tables in `supabase/migrations/20261124000100_groups.sql`, whose contract is
 * `docs/GROUPS.md`.
 *
 * This file holds everything that does NOT talk to the server: the row types,
 * the per-device cache and offline queue, and the pure helpers the screens use.
 * The Supabase calls are in `groupsApi.ts`, so the Expense Tracker can read the
 * list of groups without loading the Supabase client.
 *
 * Money: Budget together only ADDS UP amounts members logged, per category and
 * per member, and compares the sum with the budget a member typed. Sums are
 * taken in whole paise so a long list of rupee-and-paise amounts adds up
 * exactly. There is no other maths here: splitting and balances are step 2.4.
 */

export type GroupType = 'family' | 'couple' | 'home' | 'trip' | 'friends';

export interface GroupRow {
  id: string;
  name: string;
  emoji: string;
  type: GroupType;
  currency: string;
  budget_together: boolean;
  split_costs: boolean;
  created_at?: string;
}

/** `user_id` is never readable by members (docs/GROUPS.md). */
export interface GroupMemberRow {
  id: string;
  group_id: string;
  role: 'admin' | 'member';
  display_name: string | null;
  joined_at: string;
  left_at: string | null;
}

export interface GroupExpenseRow {
  id: string;
  group_id: string;
  amount: number;
  category: string;
  note: string | null;
  spent_on: string;
  paid_by: string;
  split_rule: string | null;
  shares: unknown;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
  deleted_at: string | null;
}

export interface GroupBudgetRow {
  id: string;
  group_id: string;
  month: string;
  category: string;
  amount: number;
  created_by: string | null;
  created_at: string;
  updated_by: string | null;
  updated_at: string;
}

export const GROUP_TYPES: ReadonlyArray<{
  id: GroupType; label: string; detail: string; emoji: string; budgetTogether: boolean;
}> = [
  { id: 'family', label: 'Family', detail: 'One household budget, everyone adds what they spend.', emoji: '🏠', budgetTogether: true },
  { id: 'couple', label: 'Couple', detail: 'A shared budget for the two of you.', emoji: '💑', budgetTogether: true },
  { id: 'home', label: 'Home', detail: 'Flatmates sharing rent, bills and groceries.', emoji: '🛋️', budgetTogether: false },
  { id: 'trip', label: 'Trip', detail: 'Friends travelling together.', emoji: '✈️', budgetTogether: false },
  { id: 'friends', label: 'Friends', detail: 'Dinners, gifts and outings with friends.', emoji: '🎉', budgetTogether: false },
];

export const GROUP_EMOJIS = ['🏠', '👨‍👩‍👧', '💑', '🛋️', '✈️', '🎉', '🍲', '🛒', '🏖️', '🎓', '🐾', '⭐'] as const;

/** Server limits (docs/GROUPS.md "Limits"). */
export const GROUP_NAME_MAX = 60;
export const MEMBER_NAME_MAX = 40;
export const GROUP_NOTE_MAX = 200;
export const GROUP_MEMBER_LIMIT = 20;

export function groupTypeLabel(type: string): string {
  return GROUP_TYPES.find((t) => t.id === type)?.label ?? 'Group';
}

/* ------------------------------------------------------------------------ */
/* Who is who                                                                */
/* ------------------------------------------------------------------------ */

/** A member row that has left (or deleted the account) is shown as "Former member". */
export function isFormer(member: Pick<GroupMemberRow, 'left_at'>): boolean {
  return member.left_at != null;
}

export function memberName(member: GroupMemberRow | undefined): string {
  if (!member) return 'A member';
  if (isFormer(member)) return 'Former member';
  return member.display_name?.trim() || 'A member';
}

/** "you" for your own row, as in "Edited by you"; the name otherwise. */
export function whoName(memberId: string | null, members: ReadonlyMap<string, GroupMemberRow>, meId: string | null): string {
  if (memberId && memberId === meId) return 'you';
  return memberName(memberId ? members.get(memberId) : undefined);
}

export function currentMembers(members: readonly GroupMemberRow[]): GroupMemberRow[] {
  return members.filter((m) => !isFormer(m)).sort((a, b) => a.joined_at.localeCompare(b.joined_at));
}

/* ------------------------------------------------------------------------ */
/* Categories                                                                */
/* ------------------------------------------------------------------------ */

const BUILTIN = new Map(allCategories(BUILTIN_CATS).map((c) => [c.k, c]));

/**
 * What a group stores as the category. Everyone's built-in categories share
 * keys (`groceries`, `eating_out`), so those are stored as keys and each phone
 * shows its own label. A category someone made up exists only on their phone,
 * so its NAME is stored: the others can't resolve a custom key.
 */
export function groupCategoryValue(key: string, label: string | undefined): string {
  if (BUILTIN.has(key)) return key;
  const text = (label ?? key).trim().slice(0, 60);
  return text || 'Other';
}

export function groupCategoryLabel(value: string): string {
  return BUILTIN.get(value)?.l ?? value;
}

export function groupCategoryIcon(value: string): IconName {
  return BUILTIN.get(value)?.ic ?? 'other';
}

/** The built-in categories offered when setting a budget, in Budget Builder's order. */
export const GROUP_BUDGET_CATEGORIES = allCategories(BUILTIN_CATS)
  .filter((c) => c.section !== 'save')
  .map((c) => ({ value: c.k, label: c.l }));

/* ------------------------------------------------------------------------ */
/* Budget together                                                           */
/* ------------------------------------------------------------------------ */

/** Whole paise, so a sum of amounts like 199.99 adds up exactly. */
const paise = (amount: number) => Math.round(Number(amount) * 100);

/**
 * The month's budget rows: its own when it has any, otherwise the latest
 * earlier month's, carried forward exactly as personal categories are
 * (docs/GROUPS.md). `from` says which month they came from.
 */
export function budgetsForMonth(rows: readonly GroupBudgetRow[], month: string): { from: string | null; rows: GroupBudgetRow[] } {
  let from: string | null = null;
  for (const row of rows) {
    if (row.month <= month && (from === null || row.month > from)) from = row.month;
  }
  return { from, rows: from === null ? [] : rows.filter((r) => r.month === from) };
}

export interface BudgetLine {
  category: string;
  label: string;
  budget: number | null;
  spent: number;
}

export interface MemberLine {
  memberId: string;
  name: string;
  added: number;
  count: number;
}

export interface BudgetTogether {
  lines: BudgetLine[];
  members: MemberLine[];
  spent: number;
  budget: number;
  /** Set when the budgets shown were carried forward from an earlier month. */
  carriedFrom: string | null;
}

export function inMonth(ymd: string, month: string): boolean {
  return ymd.slice(0, 7) === month;
}

/**
 * This month's household spending by category against the shared budget,
 * and how much each member added. Deleted expenses don't count.
 */
export function computeBudgetTogether(
  expenses: readonly GroupExpenseRow[],
  budgets: readonly GroupBudgetRow[],
  members: readonly GroupMemberRow[],
  month: string,
  meId: string | null,
): BudgetTogether {
  const live = expenses.filter((e) => !e.deleted_at && inMonth(e.spent_on, month));
  const { from, rows } = budgetsForMonth(budgets, month);
  const spentBy = new Map<string, number>();
  const addedBy = new Map<string, { sum: number; count: number }>();
  for (const e of live) {
    spentBy.set(e.category, (spentBy.get(e.category) ?? 0) + paise(e.amount));
    const who = addedBy.get(e.paid_by) ?? { sum: 0, count: 0 };
    who.sum += paise(e.amount);
    who.count += 1;
    addedBy.set(e.paid_by, who);
  }
  const budgetBy = new Map(rows.filter((r) => Number(r.amount) > 0).map((r) => [r.category, paise(r.amount)]));
  const categories = new Set([...budgetBy.keys(), ...spentBy.keys()]);
  const lines: BudgetLine[] = [...categories].map((category) => ({
    category,
    label: groupCategoryLabel(category),
    budget: budgetBy.has(category) ? budgetBy.get(category)! / 100 : null,
    spent: (spentBy.get(category) ?? 0) / 100,
  })).sort((a, b) => b.spent - a.spent || (b.budget ?? 0) - (a.budget ?? 0) || a.label.localeCompare(b.label));

  const byId = new Map(members.map((m) => [m.id, m]));
  // Every current member is listed, at zero if they added nothing; a former
  // member appears only if something they added is still in the month.
  const memberIds = new Set([...currentMembers(members).map((m) => m.id), ...addedBy.keys()]);
  const memberLines: MemberLine[] = [...memberIds].map((memberId) => ({
    memberId,
    name: memberId === meId ? 'You' : memberName(byId.get(memberId)),
    added: (addedBy.get(memberId)?.sum ?? 0) / 100,
    count: addedBy.get(memberId)?.count ?? 0,
  })).sort((a, b) => b.added - a.added || a.name.localeCompare(b.name));

  let spent = 0;
  for (const v of spentBy.values()) spent += v;
  let budget = 0;
  for (const v of budgetBy.values()) budget += v;
  return { lines, members: memberLines, spent: spent / 100, budget: budget / 100, carriedFrom: from !== null && from !== month ? from : null };
}

/* ------------------------------------------------------------------------ */
/* Activity feed                                                             */
/* ------------------------------------------------------------------------ */

export type FeedItem =
  | { kind: 'expense'; key: string; at: string; action: 'added' | 'edited' | 'deleted'; who: string; addedBy: string; row: GroupExpenseRow; pending: boolean }
  | { kind: 'budget'; key: string; at: string; who: string; row: GroupBudgetRow; pending: boolean }
  | { kind: 'member'; key: string; at: string; action: 'joined' | 'left'; who: string };

const later = (a: string, b: string) => new Date(a).getTime() - new Date(b).getTime() > 1000;

/**
 * The newest first. Each change says who made it, "Edited by Priya", from the
 * member ids the database stamps on every row (they can't be forged).
 */
export function buildFeed(
  expenses: readonly GroupExpenseRow[],
  budgets: readonly GroupBudgetRow[],
  members: readonly GroupMemberRow[],
  meId: string | null,
  pendingIds: ReadonlySet<string> = new Set(),
  limit = 40,
): FeedItem[] {
  const byId = new Map(members.map((m) => [m.id, m]));
  const items: FeedItem[] = [];
  for (const row of expenses) {
    const action = row.deleted_at ? 'deleted' : later(row.updated_at, row.created_at) ? 'edited' : 'added';
    const by = action === 'added' ? row.created_by : row.updated_by;
    items.push({
      kind: 'expense', key: `e:${row.id}`, at: row.deleted_at ?? row.updated_at, action,
      who: whoName(by ?? row.created_by, byId, meId), addedBy: whoName(row.created_by, byId, meId),
      row, pending: pendingIds.has(row.id),
    });
  }
  for (const row of budgets) {
    items.push({ kind: 'budget', key: `b:${row.id}`, at: row.updated_at, who: whoName(row.updated_by, byId, meId), row, pending: pendingIds.has(row.id) });
  }
  for (const m of members) {
    items.push({ kind: 'member', key: `j:${m.id}`, at: m.joined_at, action: 'joined', who: isFormer(m) ? 'A former member' : whoName(m.id, byId, meId) });
    if (m.left_at) items.push({ kind: 'member', key: `l:${m.id}`, at: m.left_at, action: 'left', who: 'A member' });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

/* ------------------------------------------------------------------------ */
/* Live updates                                                              */
/* ------------------------------------------------------------------------ */

/**
 * Apply one Realtime change to a list held by id. Deletes reach EVERY
 * subscriber of a table, with only the key (docs/GROUPS.md "Live updates"), so
 * a delete for an id this list doesn't hold is ignored, and inserts and
 * updates for another group are refused too.
 */
export function applyChange<T extends { id: string; group_id: string }>(
  list: readonly T[],
  groupId: string,
  change: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new?: Partial<T> | null; old?: Partial<T> | null },
  normalize: (raw: Partial<T>) => T | null,
): readonly T[] {
  if (change.eventType === 'DELETE') {
    const id = change.old?.id;
    if (!id || !list.some((r) => r.id === id)) return list;
    return list.filter((r) => r.id !== id);
  }
  const row = change.new ? normalize(change.new) : null;
  if (!row || row.group_id !== groupId) return list;
  const at = list.findIndex((r) => r.id === row.id);
  if (at === -1) return [...list, row];
  const next = list.slice();
  next[at] = row;
  return next;
}

const str = (v: unknown) => (typeof v === 'string' ? v : null);

export function normalizeExpense(raw: Partial<GroupExpenseRow>): GroupExpenseRow | null {
  if (!str(raw.id) || !str(raw.group_id) || !str(raw.spent_on) || !str(raw.paid_by)) return null;
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount)) return null;
  return {
    id: raw.id!, group_id: raw.group_id!, amount, category: str(raw.category) ?? 'Other', note: str(raw.note),
    spent_on: raw.spent_on!, paid_by: raw.paid_by!, split_rule: str(raw.split_rule), shares: raw.shares ?? null,
    created_by: str(raw.created_by), created_at: str(raw.created_at) ?? new Date().toISOString(),
    updated_by: str(raw.updated_by), updated_at: str(raw.updated_at) ?? str(raw.created_at) ?? new Date().toISOString(),
    deleted_at: str(raw.deleted_at),
  };
}

export function normalizeBudget(raw: Partial<GroupBudgetRow>): GroupBudgetRow | null {
  if (!str(raw.id) || !str(raw.group_id) || !str(raw.month) || !str(raw.category)) return null;
  const amount = Number(raw.amount);
  if (!Number.isFinite(amount)) return null;
  return {
    id: raw.id!, group_id: raw.group_id!, month: raw.month!, category: raw.category!, amount,
    created_by: str(raw.created_by), created_at: str(raw.created_at) ?? new Date().toISOString(),
    updated_by: str(raw.updated_by), updated_at: str(raw.updated_at) ?? new Date().toISOString(),
  };
}

export function normalizeMember(raw: Partial<GroupMemberRow>): GroupMemberRow | null {
  if (!str(raw.id) || !str(raw.group_id) || !str(raw.joined_at)) return null;
  return {
    id: raw.id!, group_id: raw.group_id!, role: raw.role === 'admin' ? 'admin' : 'member',
    display_name: str(raw.display_name), joined_at: raw.joined_at!, left_at: str(raw.left_at),
  };
}

/* ------------------------------------------------------------------------ */
/* This device: the list of groups, and the offline queue                    */
/* ------------------------------------------------------------------------ */

/** Both are per account: cleared with the account's other local data (cloudSync ACCOUNT_LOCAL_KEYS). */
export const GROUPS_CACHE_KEY = 'fx_groups';
export const GROUP_OUTBOX_KEY = 'fx_group_outbox';

export interface GroupChoice {
  id: string;
  name: string;
  emoji: string;
  type: GroupType;
  currency: string;
  budgetTogether: boolean;
  splitCosts: boolean;
  memberId: string;
  role: 'admin' | 'member';
  members: number;
}

interface GroupsCache { uid: string; groups: GroupChoice[] }

export function loadGroupsCache(): GroupsCache | null {
  try {
    const parsed = JSON.parse(store.get(GROUPS_CACHE_KEY, 'null')) as GroupsCache | null;
    return parsed && typeof parsed.uid === 'string' && Array.isArray(parsed.groups) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveGroupsCache(uid: string, groups: GroupChoice[]): void {
  store.set(GROUPS_CACHE_KEY, JSON.stringify({ uid, groups } satisfies GroupsCache));
}

/**
 * The groups the add-expense form offers. Only groups with Budget together on:
 * an expense in a Split costs group needs "Paid by" and a split, which arrive
 * with step 2.4.
 */
export function groupChoicesForExpense(): GroupChoice[] {
  return (loadGroupsCache()?.groups ?? []).filter((g) => g.budgetTogether);
}

/** The columns an app may insert (docs/GROUPS.md; the rest are stamped by the database). */
export interface NewGroupExpense {
  id: string;
  group_id: string;
  amount: number;
  category: string;
  note: string | null;
  spent_on: string;
  paid_by: string;
  split_rule: null;
  shares: null;
}

export type OutboxOp =
  | { op: 'expense.add'; key: string; uid: string; at: string; row: NewGroupExpense }
  | { op: 'expense.update'; key: string; uid: string; at: string; id: string; groupId: string; patch: Partial<Pick<GroupExpenseRow, 'amount' | 'category' | 'note' | 'spent_on' | 'deleted_at'>> }
  | { op: 'budget.set'; key: string; uid: string; at: string; groupId: string; rows: Array<{ group_id: string; month: string; category: string; amount: number }> };

export function loadOutbox(): OutboxOp[] {
  try {
    const parsed = JSON.parse(store.get(GROUP_OUTBOX_KEY, '[]'));
    return Array.isArray(parsed) ? parsed.filter((op) => op && typeof op.key === 'string' && typeof op.uid === 'string') : [];
  } catch {
    return [];
  }
}

export function saveOutbox(ops: readonly OutboxOp[]): boolean {
  try {
    if (ops.length === 0) store.remove(GROUP_OUTBOX_KEY);
    else store.set(GROUP_OUTBOX_KEY, JSON.stringify(ops));
    return true;
  } catch {
    return false;
  }
}

/** A random id made on the phone, so a resent insert can't make a duplicate. */
export function newRowId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * The amount as the database will hold it: numeric(14,2), above 0. A formula
 * like 100/3 is rounded to the paisa here, as Postgres would round it, so the
 * phone and the server show the same figure.
 */
export function groupAmount(value: number): number | null {
  if (!Number.isFinite(value) || value <= 0) return null;
  const rounded = Math.round(value * 100) / 100;
  return rounded > 0 && rounded < 1e12 ? rounded : null;
}

/** Merchant and description, as the one note a group expense has. */
export function groupNote(merchant: string, note: string): string | null {
  const text = [merchant.trim(), note.trim()].filter(Boolean).join(' · ').slice(0, GROUP_NOTE_MAX).trim();
  return text || null;
}

/** An optimistic row for an expense still in the queue, so the feed shows it at once. */
export function pendingExpenseRow(op: Extract<OutboxOp, { op: 'expense.add' }>, meId: string | null): GroupExpenseRow {
  return { ...op.row, created_by: meId, created_at: op.at, updated_by: meId, updated_at: op.at, deleted_at: null };
}

/* ------------------------------------------------------------------------ */
/* Words for what went wrong                                                 */
/* ------------------------------------------------------------------------ */

const MESSAGES: Record<string, string> = {
  adult_confirmation_required: 'Please confirm you are 18 or over.',
  too_many_groups: 'You are in 50 groups already, the most anyone can be in. Leave one first.',
  group_full: 'This group has 20 members already, the most a group can have.',
  not_found: 'No group has that code. Check it with the person who shared it.',
  expired: 'That code has expired. Codes last 7 days: ask for a new one.',
  invalid_code: 'That isn’t a room code. Codes look like FX-7K2P9Q.',
  invalid_name: 'Use a name of 1 to 40 characters.',
  signed_out: 'Sign in to use groups.',
  rate_limited: 'Too many codes tried. Please wait a while and try again.',
  unavailable: 'Joining is unavailable just now. Please try again later.',
  not_group_admin: 'Only the group’s admin can do that.',
  not_group_member: 'You are no longer in this group.',
  use_leave_group: 'To take yourself out, use Leave group.',
};

export function groupErrorMessage(code: string | undefined): string {
  if (code && MESSAGES[code]) return MESSAGES[code];
  if (code && /fetch|network|load failed/i.test(code)) return 'You seem to be offline. Please try again when you’re connected.';
  return 'Something went wrong. Please try again.';
}

/** "just now", "5 min ago", "3 h ago", then the date. */
export function timeAgo(iso: string, now: Date = new Date()): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function capitalize(text: string): string {
  return text ? text[0].toUpperCase() + text.slice(1) : text;
}
