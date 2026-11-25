import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '../../lib/supabase';
import { GroupsError } from './groupsApi';
import type { DependentExpense, GroupContributionRow, GroupDependentRow, GroupGoalRow } from './groupGoals';

/**
 * Server calls for group goals and children's names (step 3.9). Online only:
 * unlike expenses these are occasional, deliberate edits, so a failure says
 * so at once instead of waiting in the offline queue.
 */

const GOAL_COLUMNS = 'id, group_id, name, emoji, target, target_date, created_by, updated_by, created_at, updated_at, deleted_at';
const CONTRIBUTION_COLUMNS = 'id, group_id, goal_id, member_id, amount, added_on, note, created_by, created_at, updated_at, deleted_at';
const DEPENDENT_COLUMNS = 'id, group_id, display_name, created_by, created_at';
const TAGGABLE_COLUMNS = 'id, amount, category, note, spent_on, for_dependent, deleted_at';

function check<T>(res: { data: T | null; error: { message?: string; code?: string } | null }): T {
  if (res.error) throw new GroupsError(res.error.message || res.error.code || 'failed');
  return res.data as T;
}

export interface Stage3Bundle {
  goals: GroupGoalRow[];
  contributions: GroupContributionRow[];
  children: GroupDependentRow[];
}

export async function fetchStage3(groupId: string): Promise<Stage3Bundle> {
  const [goals, contributions, children] = await Promise.all([
    supabase.from('group_goals').select(GOAL_COLUMNS).eq('group_id', groupId).is('deleted_at', null).limit(100),
    supabase.from('group_goal_contributions').select(CONTRIBUTION_COLUMNS).eq('group_id', groupId).is('deleted_at', null)
      .order('added_on', { ascending: false }).limit(2000),
    supabase.from('group_dependents').select(DEPENDENT_COLUMNS).eq('group_id', groupId).order('created_at').limit(20),
  ]);
  return {
    goals: check(goals) as GroupGoalRow[],
    contributions: check(contributions) as GroupContributionRow[],
    children: check(children) as GroupDependentRow[],
  };
}

export async function addGoal(row: { group_id: string; name: string; emoji: string; target: number; target_date: string | null }): Promise<void> {
  check(await supabase.from('group_goals').insert({ id: crypto.randomUUID(), ...row }));
}

export async function removeGoal(goal: Pick<GroupGoalRow, 'id' | 'group_id'>, deleted: boolean): Promise<void> {
  check(await supabase.from('group_goals').update({ deleted_at: deleted ? new Date().toISOString() : null })
    .eq('id', goal.id).eq('group_id', goal.group_id));
}

export async function addContribution(row: { group_id: string; goal_id: string; member_id: string; amount: number; added_on: string; note: string | null }): Promise<void> {
  check(await supabase.from('group_goal_contributions').insert({ id: crypto.randomUUID(), ...row }));
}

export async function removeContribution(row: Pick<GroupContributionRow, 'id' | 'group_id'>): Promise<void> {
  check(await supabase.from('group_goal_contributions').update({ deleted_at: new Date().toISOString() })
    .eq('id', row.id).eq('group_id', row.group_id));
}

/** `guardian_confirmed` is the parent's confirmation; the server refuses a name without it. */
export async function addChild(groupId: string, name: string, guardianConfirmed: boolean): Promise<void> {
  check(await supabase.from('group_dependents').insert({
    id: crypto.randomUUID(), group_id: groupId, display_name: name, guardian_confirmed: guardianConfirmed,
  }));
}

export async function removeChild(child: Pick<GroupDependentRow, 'id' | 'group_id'>): Promise<void> {
  check(await supabase.from('group_dependents').delete().eq('id', child.id).eq('group_id', child.group_id));
}

/** The group's expenses from `first` to `last` (YYYY-MM-DD), for tagging them "for" a child. */
export async function fetchTaggable(groupId: string, first: string, last: string): Promise<DependentExpense[]> {
  return check(await supabase.from('group_expenses').select(TAGGABLE_COLUMNS).eq('group_id', groupId)
    .gte('spent_on', first).lte('spent_on', last).is('deleted_at', null).order('spent_on', { ascending: false }).limit(500)) as DependentExpense[];
}

export async function tagExpense(groupId: string, expenseId: string, dependentId: string | null): Promise<void> {
  check(await supabase.from('group_expenses').update({ for_dependent: dependentId }).eq('id', expenseId).eq('group_id', groupId));
}

/** Live changes to goals, contributions and children. Returns the unsubscribe. */
export function subscribeStage3(groupId: string, onChange: () => void): () => void {
  let channel: RealtimeChannel = supabase.channel(`group-stage3:${groupId}`);
  for (const table of ['group_goals', 'group_goal_contributions', 'group_dependents']) {
    channel = channel
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table, filter: `group_id=eq.${groupId}` }, onChange)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table, filter: `group_id=eq.${groupId}` }, onChange)
      // Deletes reach every subscriber with only the key (docs/GROUPS.md); a refetch reads just this group.
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table }, onChange);
  }
  channel.subscribe();
  return () => { void supabase.removeChannel(channel); };
}
