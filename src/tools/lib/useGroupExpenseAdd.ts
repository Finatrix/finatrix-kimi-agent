import { useCallback, useEffect, useState } from 'react';
import {
  groupAmount, groupCategoryValue, groupChoicesForExpense, groupNote, loadGroupsCache, loadOutbox, type GroupChoice,
} from './groups';
import type { FlushResult } from './groupsApi';
import type { GroupEntry } from '../ui/TransactionModal';

type Notify = (message: string, kind?: 'info' | 'error' | 'ok') => void;

/** Say once what the queue could never send (the person left the group, a limit). */
export function reportDropped(result: FlushResult, notify: Notify): void {
  if (result.dropped.length === 0) return;
  const n = result.dropped.length;
  notify(`${n === 1 ? 'A group change' : `${n} group changes`} couldn't be saved: the group refused ${n === 1 ? 'it' : 'them'}. Are you still a member?`, 'error');
}

/**
 * The Expense Tracker's side of groups: which groups the add form offers, and
 * adding a spend to one through the offline queue. The Supabase client loads
 * only for someone who has used groups on this device.
 */
export function useGroupExpenseAdd(notify: Notify): {
  choices: GroupChoice[];
  save: (groupId: string, entry: GroupEntry) => Promise<boolean>;
} {
  const [choices, setChoices] = useState<GroupChoice[]>(groupChoicesForExpense);

  useEffect(() => {
    if (!loadGroupsCache() && loadOutbox().length === 0) return;
    let live = true;
    const flush = () => void import('./groupsApi')
      .then((api) => api.flushGroupOutbox())
      .then((result) => { if (live) reportDropped(result, notify); })
      .catch(() => {});
    const catchUp = () => void import('./groupShareSync').then((m) => m.catchUpGroupShares()).catch(() => {});
    flush();
    void import('./groupsApi')
      .then((api) => api.fetchMyGroups())
      .then(() => { if (live) setChoices(groupChoicesForExpense()); catchUp(); })
      .catch(() => {});
    const onOnline = () => { flush(); catchUp(); };
    const onVisible = () => { if (document.visibilityState === 'visible') catchUp(); };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    return () => { live = false; window.removeEventListener('online', onOnline); document.removeEventListener('visibilitychange', onVisible); };
  }, [notify]);

  const save = useCallback(async (groupId: string, entry: GroupEntry) => {
    const group = groupChoicesForExpense().find((g) => g.id === groupId);
    const amount = groupAmount(entry.amount);
    if (!group || amount === null) {
      notify('That group expense could not be added. Please try again.', 'error');
      return false;
    }
    try {
      const api = await import('./groupsApi');
      // A Split costs group needs its split; Budget together alone sends none.
      if (group.splitCosts && !entry.split) throw new Error('missing split');
      await api.queueGroupExpense({
        group_id: group.id,
        amount,
        category: groupCategoryValue(entry.category, entry.categoryLabel),
        note: groupNote(entry.merchant, entry.note),
        spent_on: entry.date,
        paid_by: group.splitCosts ? entry.paidBy ?? group.memberId : group.memberId,
        ...(group.splitCosts && entry.split ? { split_rule: entry.split.rule, shares: entry.split.shares } : {}),
      });
      // Your share lands in the tracker once the group has it (right away when online).
      void api.flushGroupOutbox().then(() => import('./groupShareSync')).then((m) => m.catchUpGroupShares()).catch(() => {});
      const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
      notify(offline
        ? `Saved on this phone. It goes to ${group.name} when you're back online.`
        : `Added to ${group.emoji} ${group.name}.`, 'ok');
      return true;
    } catch {
      notify('That group expense could not be saved on this phone. Please try again.', 'error');
      return false;
    }
  }, [notify]);

  return { choices, save };
}
