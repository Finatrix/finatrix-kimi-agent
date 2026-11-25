import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import {
  loadOutbox, newRowId, normalizeBudget, normalizeExpense, normalizeMember, saveGroupsCache, saveOutbox,
  type GroupBudgetRow, type GroupChoice, type GroupExpenseRow, type GroupMemberRow, type GroupRow, type GroupType,
  type NewGroupExpense, type OutboxOp,
} from './groups';

/**
 * Every server call the Groups screens make (contract: docs/GROUPS.md).
 *
 * This imports the Supabase client, so the Expense Tracker loads it only when
 * someone actually adds to a group (see `queueGroupExpense`).
 */

const MEMBER_COLUMNS = 'id, group_id, role, display_name, joined_at, left_at';
const EXPENSE_COLUMNS = 'id, group_id, amount, category, note, spent_on, paid_by, split_rule, shares, created_by, created_at, updated_by, updated_at, deleted_at';
const BUDGET_COLUMNS = 'id, group_id, month, category, amount, created_by, created_at, updated_by, updated_at';

export class GroupsError extends Error {
  code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

async function currentUid(): Promise<string | null> {
  if (!isSupabaseConfigured) return null;
  // Read from the stored session: works offline, unlike getUser().
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}

function fail(error: { message?: string; code?: string } | null): never {
  throw new GroupsError(error?.message || error?.code || 'failed');
}

/* ------------------------------------------------------------------------ */
/* Your groups                                                               */
/* ------------------------------------------------------------------------ */

/** Your current groups, with your own member row in each ("you"). Refreshes the device's list. */
export async function fetchMyGroups(): Promise<GroupChoice[]> {
  const uid = await currentUid();
  if (!uid) throw new GroupsError('signed_out');
  const mine = await supabase.rpc('my_group_memberships');
  if (mine.error) fail(mine.error);
  const memberships = (mine.data ?? []) as Array<{ group_id: string; member_id: string; role: 'admin' | 'member' }>;
  const ids = memberships.map((m) => m.group_id);
  let groups: GroupRow[] = [];
  let members: GroupMemberRow[] = [];
  if (ids.length) {
    const [g, m] = await Promise.all([
      supabase.from('groups').select('id, name, emoji, type, currency, budget_together, split_costs, created_at').in('id', ids),
      supabase.from('group_members').select(MEMBER_COLUMNS).in('group_id', ids).is('left_at', null),
    ]);
    if (g.error) fail(g.error);
    if (m.error) fail(m.error);
    groups = (g.data ?? []) as GroupRow[];
    members = (m.data ?? []) as GroupMemberRow[];
  }
  const choices = memberships.flatMap((mm): GroupChoice[] => {
    const group = groups.find((x) => x.id === mm.group_id);
    if (!group) return [];
    return [{
      id: group.id, name: group.name, emoji: group.emoji, type: group.type, currency: group.currency,
      budgetTogether: group.budget_together, splitCosts: group.split_costs,
      memberId: mm.member_id, role: mm.role, members: members.filter((x) => x.group_id === group.id).length,
    }];
  }).sort((a, b) => a.name.localeCompare(b.name));
  saveGroupsCache(uid, choices);
  return choices;
}

/** Whether you have confirmed you're 18 or over (asked only the first time). */
export async function fetchAdultConfirmed(): Promise<boolean> {
  const { data, error } = await supabase.from('group_age_confirmations').select('confirmed_at').limit(1);
  if (error) return false;
  return (data ?? []).length > 0;
}

export async function createGroup(input: {
  name: string; emoji: string; type: GroupType; displayName: string; currency: string; confirmAdult: boolean;
}): Promise<{ groupId: string; code: string; expiresAt: string }> {
  const { data, error } = await supabase.rpc('create_group', {
    p_name: input.name, p_emoji: input.emoji, p_type: input.type, p_display_name: input.displayName,
    p_currency: input.currency, p_confirm_adult: input.confirmAdult,
  });
  if (error) fail(error);
  const row = (Array.isArray(data) ? data[0] : data) as { group_id: string; code: string; expires_at: string } | null;
  if (!row) throw new GroupsError('failed');
  return { groupId: row.group_id, code: row.code, expiresAt: row.expires_at };
}

/* ------------------------------------------------------------------------ */
/* Joining (the group-join edge function)                                    */
/* ------------------------------------------------------------------------ */

export type JoinStatus =
  | 'ok' | 'joined' | 'already_member' | 'adult_confirmation_required' | 'group_full' | 'too_many_groups'
  | 'not_found' | 'expired' | 'invalid_code' | 'invalid_name' | 'signed_out' | 'rate_limited' | 'unavailable' | 'failed';

export interface JoinPreview { id?: string; name: string; emoji: string; type: GroupType; members: number }

export async function joinByCode(
  code: string,
  action: 'preview' | 'join',
  extra: { displayName?: string; confirmAdult?: boolean } = {},
): Promise<{ status: JoinStatus; group: JoinPreview | null }> {
  const body = action === 'join' ? { code, action, ...extra } : { code, action };
  const { data, error } = await supabase.functions.invoke('group-join', { body });
  if (!error) {
    const res = (data ?? {}) as { status?: JoinStatus; group?: JoinPreview };
    return { status: res.status ?? 'failed', group: res.group ?? null };
  }
  const response = (error as { context?: Response }).context;
  const status = response instanceof Response ? response.status : 0;
  let reason = '';
  try { reason = String(((await response?.json()) as { error?: string })?.error ?? ''); } catch { /* no body */ }
  if (status === 400) return { status: reason === 'invalid_name' ? 'invalid_name' : 'invalid_code', group: null };
  if (status === 401) return { status: 'signed_out', group: null };
  if (status === 429) return { status: 'rate_limited', group: null };
  if (status === 503) return { status: 'unavailable', group: null };
  return { status: 'failed', group: null };
}

/* ------------------------------------------------------------------------ */
/* One group                                                                 */
/* ------------------------------------------------------------------------ */

export interface GroupBundle {
  group: GroupRow;
  members: GroupMemberRow[];
  expenses: GroupExpenseRow[];
  budgets: GroupBudgetRow[];
  invite: { code: string; expires_at: string } | null;
}

function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  return { first: `${month}-01`, last: `${month}-${String(days).padStart(2, '0')}` };
}

/** A group, its members, the month's expenses plus the latest changes for the feed, and its budgets. */
export async function fetchGroup(groupId: string, month: string): Promise<GroupBundle> {
  const { first, last } = monthBounds(month);
  const [g, m, monthRows, recent, b, inv] = await Promise.all([
    supabase.from('groups').select('id, name, emoji, type, currency, budget_together, split_costs, created_at').eq('id', groupId).maybeSingle(),
    supabase.from('group_members').select(MEMBER_COLUMNS).eq('group_id', groupId),
    supabase.from('group_expenses').select(EXPENSE_COLUMNS).eq('group_id', groupId).gte('spent_on', first).lte('spent_on', last).limit(2000),
    supabase.from('group_expenses').select(EXPENSE_COLUMNS).eq('group_id', groupId).order('updated_at', { ascending: false }).limit(40),
    // Every month up to this one, newest first: the latest is carried forward.
    supabase.from('group_budgets').select(BUDGET_COLUMNS).eq('group_id', groupId).lte('month', month).order('month', { ascending: false }).limit(500),
    supabase.from('group_invites').select('code, expires_at').eq('group_id', groupId).maybeSingle(),
  ]);
  for (const r of [g, m, monthRows, recent, b, inv]) if (r.error) fail(r.error);
  if (!g.data) throw new GroupsError('not_group_member');
  const expenses = new Map<string, GroupExpenseRow>();
  for (const raw of [...(monthRows.data ?? []), ...(recent.data ?? [])]) {
    const row = normalizeExpense(raw as Partial<GroupExpenseRow>);
    if (row) expenses.set(row.id, row);
  }
  return {
    group: g.data as GroupRow,
    members: ((m.data ?? []) as Partial<GroupMemberRow>[]).map(normalizeMember).filter((x): x is GroupMemberRow => !!x),
    expenses: [...expenses.values()],
    budgets: ((b.data ?? []) as Partial<GroupBudgetRow>[]).map(normalizeBudget).filter((x): x is GroupBudgetRow => !!x),
    invite: (inv.data as { code: string; expires_at: string } | null) ?? null,
  };
}

export async function resetGroupCode(groupId: string): Promise<{ code: string; expires_at: string }> {
  const { data, error } = await supabase.rpc('reset_group_code', { p_group_id: groupId });
  if (error) fail(error);
  return (Array.isArray(data) ? data[0] : data) as { code: string; expires_at: string };
}

export async function leaveGroup(groupId: string): Promise<void> {
  const { error } = await supabase.rpc('leave_group', { p_group_id: groupId });
  if (error) fail(error);
}

export async function removeGroupMember(memberId: string): Promise<{ code: string; expires_at: string } | null> {
  const { data, error } = await supabase.rpc('remove_group_member', { p_member_id: memberId });
  if (error) fail(error);
  const row = (Array.isArray(data) ? data[0] : data) as { code: string | null; expires_at: string | null } | null;
  return row?.code && row.expires_at ? { code: row.code, expires_at: row.expires_at } : null;
}

export async function renameMe(memberId: string, displayName: string): Promise<void> {
  const { error } = await supabase.from('group_members').update({ display_name: displayName }).eq('id', memberId);
  if (error) fail(error);
}

export async function setBudgetTogether(groupId: string, on: boolean): Promise<void> {
  const { error } = await supabase.from('groups').update({ budget_together: on }).eq('id', groupId);
  if (error) fail(error);
}

/* ------------------------------------------------------------------------ */
/* The offline queue                                                         */
/* ------------------------------------------------------------------------ */

/**
 * Writes go into the queue first and upload from there, so an expense added
 * on a train is kept and sent when the connection returns. Each op carries the
 * account it was made by, and only that account's session ever sends it.
 *
 * - A new expense carries an id made on the phone and is sent with
 *   `upsert(…, { onConflict: 'id', ignoreDuplicates: true })`: a resend after
 *   a lost reply inserts nothing the second time.
 * - Edits and deletes are plain updates of named columns, safe to resend.
 * - Budgets are an upsert on (group, month, category), safe to resend.
 *
 * A network failure leaves the op queued. A refusal from the database (the
 * person left the group, a limit) can never succeed, so the op is dropped and
 * reported.
 */
export type FlushResult = { sent: number; dropped: OutboxOp[]; waiting: number };

let inflight: Promise<FlushResult> | null = null;

const isNetworkError = (error: { code?: string; message?: string } | null) =>
  !!error && (!error.code || /fetch|network|load failed|timeout/i.test(error.message ?? ''));

async function sendOp(op: OutboxOp) {
  if (op.op === 'expense.add') {
    return supabase.from('group_expenses').upsert(op.row, { onConflict: 'id', ignoreDuplicates: true });
  }
  if (op.op === 'expense.update') {
    return supabase.from('group_expenses').update(op.patch).eq('id', op.id).eq('group_id', op.groupId);
  }
  return supabase.from('group_budgets').upsert(op.rows, { onConflict: 'group_id,month,category' });
}

export function flushGroupOutbox(): Promise<FlushResult> {
  if (inflight) return inflight;
  inflight = (async () => {
    const uid = await currentUid();
    let sent = 0;
    const dropped: OutboxOp[] = [];
    if (!uid || (typeof navigator !== 'undefined' && navigator.onLine === false)) {
      return { sent, dropped, waiting: loadOutbox().length };
    }
    for (const op of loadOutbox()) {
      if (op.uid !== uid) continue;
      let result: { error: { code?: string; message?: string } | null };
      try {
        result = await sendOp(op);
      } catch (e) {
        result = { error: { message: e instanceof Error ? e.message : 'network' } };
      }
      if (result.error && isNetworkError(result.error)) break;
      // Re-read: another tab or a new add may have changed the queue meanwhile.
      saveOutbox(loadOutbox().filter((x) => x.key !== op.key));
      if (result.error) dropped.push(op);
      else sent += 1;
    }
    return { sent, dropped, waiting: loadOutbox().filter((x) => x.uid === uid).length };
  })().finally(() => { inflight = null; });
  return inflight;
}

async function enqueue(make: (uid: string) => OutboxOp): Promise<OutboxOp> {
  const uid = await currentUid();
  if (!uid) throw new GroupsError('signed_out');
  const op = make(uid);
  if (!saveOutbox([...loadOutbox(), op])) throw new GroupsError('storage');
  void flushGroupOutbox();
  return op;
}

/**
 * Add an expense to a group. Returns as soon as it is safely queued on this
 * phone; it uploads now if online, or when the connection returns.
 */
export function queueGroupExpense(row: Omit<NewGroupExpense, 'id' | 'split_rule' | 'shares'>): Promise<OutboxOp> {
  const id = newRowId();
  return enqueue((uid) => ({
    op: 'expense.add', key: id, uid, at: new Date().toISOString(),
    row: { ...row, id, split_rule: null, shares: null },
  }));
}

export function queueExpenseUpdate(row: Pick<GroupExpenseRow, 'id' | 'group_id'>, patch: Extract<OutboxOp, { op: 'expense.update' }>['patch']): Promise<OutboxOp> {
  return enqueue((uid) => ({ op: 'expense.update', key: newRowId(), uid, at: new Date().toISOString(), id: row.id, groupId: row.group_id, patch }));
}

export function queueBudgets(groupId: string, rows: Extract<OutboxOp, { op: 'budget.set' }>['rows']): Promise<OutboxOp> {
  return enqueue((uid) => ({ op: 'budget.set', key: newRowId(), uid, at: new Date().toISOString(), groupId, rows }));
}

/* ------------------------------------------------------------------------ */
/* Live updates                                                              */
/* ------------------------------------------------------------------------ */

export type GroupTable = 'group_members' | 'group_expenses' | 'group_budgets';
export type LiveChange = { table: GroupTable; eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown> | null; old: Record<string, unknown> | null };

/**
 * Hear every change to one group as it happens. Inserts and updates are
 * filtered to the group on the server, and Realtime checks the SELECT policy
 * on each. Deletes can't be filtered or checked (the row is gone), so they
 * arrive for every group with only the key: the caller ignores ids it
 * doesn't hold (`applyChange`).
 */
export function subscribeGroup(groupId: string, onChange: (change: LiveChange) => void, onStatus?: (live: boolean) => void): () => void {
  const tables: GroupTable[] = ['group_members', 'group_expenses', 'group_budgets'];
  let channel: RealtimeChannel = supabase.channel(`group:${groupId}`);
  for (const table of tables) {
    const relay = (payload: { eventType: LiveChange['eventType']; new: Record<string, unknown>; old: Record<string, unknown> }) => {
      onChange({ table, eventType: payload.eventType, new: payload.new ?? null, old: payload.old ?? null });
    };
    channel = channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `group_id=eq.${groupId}` }, relay)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `group_id=eq.${groupId}` }, relay)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, relay);
  }
  channel.subscribe((status) => onStatus?.(status === 'SUBSCRIBED'));
  return () => { void supabase.removeChannel(channel); };
}
