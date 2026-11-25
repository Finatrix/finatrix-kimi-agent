import { toPaise } from './groupSplit';

/**
 * Group savings goals and children's names (NEW_FEATURES item 12, stage 3,
 * build step 3.9). Server contract: migration 20261125000200 and
 * docs/GROUPS.md. Pure: rows in, figures out.
 *
 * The maths, as agreed in the PR before it was built, in whole paise so every
 * phone shows the same figures:
 *   saved    = sum of the goal's contributions that aren't deleted
 *   left     = max(target − saved, 0)
 *   progress = floor(saved × 100 ÷ target), shown capped at 100
 * The AI never sets any of it.
 */

export interface GroupGoalRow {
  id: string;
  group_id: string;
  name: string;
  emoji: string;
  target: number;
  target_date: string | null;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface GroupContributionRow {
  id: string;
  group_id: string;
  goal_id: string;
  member_id: string;
  amount: number;
  added_on: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface GroupDependentRow {
  id: string;
  group_id: string;
  display_name: string;
  /** The parent who added and manages this name (a member id). */
  created_by: string | null;
  created_at: string;
}

/** A group expense, as far as children's spending needs it. */
export interface DependentExpense {
  id: string;
  amount: number;
  category: string;
  note: string | null;
  spent_on: string;
  for_dependent: string | null;
  deleted_at: string | null;
}

export const GOAL_NAME_MAX = 60;
export const CHILD_NAME_MAX = 40;
export const MAX_CHILDREN = 10;

export interface GoalProgress {
  savedPaise: number;
  targetPaise: number;
  leftPaise: number;
  /** floor(saved × 100 ÷ target), capped at 100. */
  percent: number;
  /** Each member's total, biggest first (ties by member id). */
  byMember: Array<{ memberId: string; paise: number }>;
}

export function goalProgress(goal: Pick<GroupGoalRow, 'id' | 'target'>, contributions: readonly GroupContributionRow[]): GoalProgress {
  const targetPaise = toPaise(goal.target);
  const per = new Map<string, number>();
  let savedPaise = 0;
  for (const c of contributions) {
    if (c.goal_id !== goal.id || c.deleted_at) continue;
    const p = toPaise(c.amount);
    savedPaise += p;
    per.set(c.member_id, (per.get(c.member_id) ?? 0) + p);
  }
  const percent = targetPaise > 0 ? Math.min(100, Math.floor((savedPaise * 100) / targetPaise)) : 0;
  const byMember = [...per].map(([memberId, paise]) => ({ memberId, paise }))
    .sort((a, b) => b.paise - a.paise || (a.memberId < b.memberId ? -1 : 1));
  return { savedPaise, targetPaise, leftPaise: Math.max(targetPaise - savedPaise, 0), percent, byMember };
}

/** Live goals, newest first. */
export function liveGoals(goals: readonly GroupGoalRow[]): GroupGoalRow[] {
  return goals.filter((g) => !g.deleted_at).sort((a, b) => (a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0));
}

/** First and last calendar day of a month (YYYY-MM), as YYYY-MM-DD. */
export function monthBounds(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`];
}

/** What each child's tagged expenses add up to in `month` (YYYY-MM), in paise. */
export function childSpend(expenses: readonly DependentExpense[], month: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of expenses) {
    if (!e.for_dependent || e.deleted_at || e.spent_on.slice(0, 7) !== month) continue;
    out.set(e.for_dependent, (out.get(e.for_dependent) ?? 0) + toPaise(e.amount));
  }
  return out;
}

/** Whether this member may rename or remove the child: the parent who added them, or an admin (the server enforces the same). */
export function canManageChild(child: Pick<GroupDependentRow, 'created_by'>, meId: string, isAdmin: boolean): boolean {
  return isAdmin || child.created_by === meId;
}

/** Error codes the new tables raise, in words. */
export function stage3ErrorMessage(code: string | undefined): string {
  if (code === 'too_many_goals') return 'A group can have up to 20 goals. Remove one first.';
  if (code === 'too_many_children') return 'A group can have up to 10 children’s names.';
  return 'That didn’t save. Check your connection and try again.';
}
