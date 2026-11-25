import { describe, expect, it } from 'vitest';
import {
  canManageChild, childSpend, goalProgress, liveGoals, monthBounds,
  type DependentExpense, type GroupContributionRow, type GroupGoalRow,
} from '../tools/lib/groupGoals';

/** Step 3.9: group savings goals and children's spending, with the PR's worked example. */

const goal = (over: Partial<GroupGoalRow> = {}): GroupGoalRow => ({
  id: 'goa', group_id: 'g', name: 'Goa holiday', emoji: '🏖️', target: 60000, target_date: null,
  created_by: 'amma', updated_by: 'amma', created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z', deleted_at: null, ...over,
});
const con = (member: string, amount: number, over: Partial<GroupContributionRow> = {}): GroupContributionRow => ({
  id: `${member}-${amount}`, group_id: 'g', goal_id: 'goa', member_id: member, amount, added_on: '2026-11-25', note: null,
  created_by: member, created_at: '', updated_at: '', deleted_at: null, ...over,
});

describe('goalProgress', () => {
  it('worked example: ₹60,000 target, ₹15,000 + ₹7,500.50 saved is 37%, ₹37,499.50 to go', () => {
    const p = goalProgress(goal(), [con('amma', 15000), con('priya', 7500.5)]);
    expect(p).toEqual({
      savedPaise: 2_250_050, targetPaise: 6_000_000, leftPaise: 3_749_950, percent: 37,
      byMember: [{ memberId: 'amma', paise: 1_500_000 }, { memberId: 'priya', paise: 750_050 }],
    });
  });

  it('ignores deleted contributions and other goals; never shows more than 100% or less than nothing left', () => {
    const p = goalProgress(goal({ target: 100 }), [
      con('a', 150), con('b', 50, { deleted_at: '2026-11-25T00:00:00Z' }), con('c', 999, { goal_id: 'other' }),
    ]);
    expect(p.savedPaise).toBe(15000);
    expect(p.percent).toBe(100);
    expect(p.leftPaise).toBe(0);
  });

  it('adds in whole paise, so 0.1 + 0.2 is exactly 0.30', () => {
    expect(goalProgress(goal(), [con('a', 0.1), con('b', 0.2)]).savedPaise).toBe(30);
  });

  it('floors the percent rather than rounding up to a goal not yet reached', () => {
    expect(goalProgress(goal({ target: 100 }), [con('a', 99.99)]).percent).toBe(99);
  });
});

describe('liveGoals', () => {
  it('hides removed goals, newest first', () => {
    const list = liveGoals([
      goal({ id: 'old', created_at: '2026-01-01' }), goal({ id: 'new', created_at: '2026-11-01' }),
      goal({ id: 'gone', deleted_at: '2026-11-02' }),
    ]);
    expect(list.map((g) => g.id)).toEqual(['new', 'old']);
  });
});

describe('children', () => {
  const exp = (id: string, amount: number, forKid: string | null, over: Partial<DependentExpense> = {}): DependentExpense => ({
    id, amount, category: 'education', note: null, spent_on: '2026-11-10', for_dependent: forKid, deleted_at: null, ...over,
  });

  it('sums each child’s tagged expenses for the month only', () => {
    const spend = childSpend([
      exp('a', 4500, 'aarav'), exp('b', 500.5, 'aarav'), exp('c', 200, 'riya'), exp('d', 999, null),
      exp('e', 100, 'aarav', { spent_on: '2026-10-31' }), exp('f', 100, 'aarav', { deleted_at: 'x' }),
    ], '2026-11');
    expect(spend.get('aarav')).toBe(500_050);
    expect(spend.get('riya')).toBe(20_000);
  });

  it('only the parent who added a child, or an admin, manages them', () => {
    expect(canManageChild({ created_by: 'me' }, 'me', false)).toBe(true);
    expect(canManageChild({ created_by: 'other' }, 'me', false)).toBe(false);
    expect(canManageChild({ created_by: 'other' }, 'me', true)).toBe(true);
  });

  it('month bounds are real calendar days', () => {
    expect(monthBounds('2026-11')).toEqual(['2026-11-01', '2026-11-30']);
    expect(monthBounds('2028-02')).toEqual(['2028-02-01', '2028-02-29']);
  });
});

describe('new since you last looked (step 3.9)', async () => {
  const { groupSeenAt, markGroupSeen, newBadge } = await import('../tools/lib/groupSeen');
  it('remembers per account when each group was last opened', () => {
    localStorage.clear();
    expect(groupSeenAt('u1', 'g')).toBeNull();
    markGroupSeen('u1', 'g', new Date('2026-11-25T10:00:00Z'));
    expect(groupSeenAt('u1', 'g')).toBe('2026-11-25T10:00:00.000Z');
    expect(groupSeenAt('u2', 'g')).toBeNull();
  });
  it('badge words', () => {
    expect(newBadge(0)).toBeNull();
    expect(newBadge(undefined)).toBeNull();
    expect(newBadge(3)).toBe('3 new');
    expect(newBadge(25)).toBe('20+ new');
  });
});
