import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onLocalWrite } from './storage';
import {
  applyChange, GROUP_OUTBOX_KEY, loadOutbox, normalizeBudget, normalizeExpense, normalizeMember, normalizeSettlement,
  pendingExpenseRow, pendingSettlementRow,
  type GroupBudgetRow, type GroupExpenseRow, type GroupMemberRow, type GroupRow, type GroupSettlementRow,
} from './groups';
import { fetchGroup, flushGroupOutbox, GroupsError, subscribeGroup, type FlushResult, type LiveChange } from './groupsApi';

interface Held {
  group: GroupRow | null;
  members: readonly GroupMemberRow[];
  expenses: readonly GroupExpenseRow[];
  budgets: readonly GroupBudgetRow[];
  settlements: readonly GroupSettlementRow[];
  invite: { code: string; expires_at: string } | null;
}

const EMPTY: Held = { group: null, members: [], expenses: [], budgets: [], settlements: [], invite: null };

/**
 * One group, live: loaded for a month, kept current by Realtime, with this
 * phone's queued changes shown on top until they upload.
 */
export function useGroupLive(groupId: string, month: string, meId: string | null, onFlush?: (r: FlushResult) => void) {
  const [held, setHeld] = useState<Held>(EMPTY);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'gone'>('loading');
  const [live, setLive] = useState(false);
  const [outboxRev, setOutboxRev] = useState(0);
  // A ref, so a new callback each render doesn't resubscribe the channel.
  const onFlushRef = useRef(onFlush);
  useEffect(() => { onFlushRef.current = onFlush; });

  const load = useCallback(() => fetchGroup(groupId, month).then((bundle) => {
    // Rows already held (heard live, or another month's) stay; the server's copy wins.
    setHeld((prev) => {
      const keep = <T extends { id: string }>(old: readonly T[], fresh: readonly T[]) => {
        const ids = new Set(fresh.map((r) => r.id));
        return [...fresh, ...old.filter((r) => !ids.has(r.id))];
      };
      return {
        group: bundle.group, members: bundle.members, invite: bundle.invite,
        expenses: prev.group?.id === groupId ? keep(prev.expenses, bundle.expenses) : bundle.expenses,
        budgets: prev.group?.id === groupId ? keep(prev.budgets, bundle.budgets) : bundle.budgets,
        settlements: prev.group?.id === groupId ? keep(prev.settlements, bundle.settlements) : bundle.settlements,
      };
    });
    setStatus('ready');
  }, (e: unknown) => {
    setStatus(e instanceof GroupsError && e.code === 'not_group_member' ? 'gone' : 'error');
  }), [groupId, month]);

  useEffect(() => { void load(); }, [load]);

  const flush = useCallback(() => {
    void flushGroupOutbox().then((r) => {
      onFlushRef.current?.(r);
      if (r.sent > 0) void load();
    }).catch(() => {});
  }, [load]);

  useEffect(() => {
    const onChange = (c: LiveChange) => setHeld((prev) => {
      if (c.table === 'group_expenses') return { ...prev, expenses: applyChange(prev.expenses, groupId, c as never, normalizeExpense) };
      if (c.table === 'group_settlements') return { ...prev, settlements: applyChange(prev.settlements, groupId, c as never, normalizeSettlement) };
      if (c.table === 'group_budgets') return { ...prev, budgets: applyChange(prev.budgets, groupId, c as never, normalizeBudget) };
      return { ...prev, members: applyChange(prev.members, groupId, c as never, normalizeMember) };
    });
    const stop = subscribeGroup(groupId, onChange, (on) => {
      setLive(on);
      // Back after a drop: catch up on anything missed, and send the queue.
      if (on) { void load(); flush(); }
    });
    const online = () => flush();
    window.addEventListener('online', online);
    const offline = () => setLive(false);
    window.addEventListener('offline', offline);
    const offWrite = onLocalWrite((key) => { if (key === GROUP_OUTBOX_KEY) setOutboxRev((n) => n + 1); });
    flush();
    return () => {
      stop();
      offWrite();
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
    };
  }, [groupId, load, flush]);

  // This phone's changes still in the queue, shown as if sent.
  const view = useMemo(() => {
    void outboxRev;
    const ops = loadOutbox().filter((op) => (op.op === 'expense.add' || op.op === 'settlement.add' ? op.row.group_id : op.groupId) === groupId);
    const settlements = new Map(held.settlements.map((x) => [x.id, x]));
    const pendingIds = new Set<string>();
    const expenses = new Map(held.expenses.map((e) => [e.id, e]));
    let budgets = held.budgets.slice();
    for (const op of ops) {
      if (op.op === 'expense.add') {
        if (!expenses.has(op.row.id)) expenses.set(op.row.id, pendingExpenseRow(op, meId));
        pendingIds.add(op.row.id);
      } else if (op.op === 'settlement.add') {
        if (!settlements.has(op.row.id)) settlements.set(op.row.id, pendingSettlementRow(op, meId));
        pendingIds.add(op.row.id);
      } else if (op.op === 'settlement.update') {
        const row = settlements.get(op.id);
        if (row) settlements.set(op.id, { ...row, ...op.patch, updated_by: meId, updated_at: op.at });
        pendingIds.add(op.id);
      } else if (op.op === 'expense.update') {
        const row = expenses.get(op.id);
        if (row) expenses.set(op.id, { ...row, ...op.patch, updated_by: meId, updated_at: op.at });
        pendingIds.add(op.id);
      } else {
        for (const b of op.rows) {
          const id = `pending:${op.key}:${b.category}`;
          budgets = budgets.filter((x) => !(x.month === b.month && x.category === b.category));
          budgets.push({ ...b, id, created_by: meId, created_at: op.at, updated_by: meId, updated_at: op.at });
          pendingIds.add(id);
        }
      }
    }
    return { expenses: [...expenses.values()], settlements: [...settlements.values()], budgets, pendingIds };
  }, [held.expenses, held.budgets, held.settlements, groupId, meId, outboxRev]);

  return {
    group: held.group, members: held.members, invite: held.invite,
    setInvite: (invite: Held['invite']) => setHeld((prev) => ({ ...prev, invite })),
    setGroup: (group: GroupRow) => setHeld((prev) => ({ ...prev, group })),
    confirmedExpenses: held.expenses, expenses: view.expenses, settlements: view.settlements, budgets: view.budgets, pendingIds: view.pendingIds,
    status, live, reload: load, flush,
  };
}
