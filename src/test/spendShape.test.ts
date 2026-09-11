import { describe, it, expect } from 'vitest';
import { classifySpendTiming, expectedShareByNow } from '../tools/lib/spendShape';
import { allCategories, mergedCats } from '../tools/lib/budget';
import { computeExecutionScore } from '../tools/lib/score';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * How a category's cost lands in a month — and the two figures that were wrong
 * without it.
 *
 * The defect, in one line: rent is due in full on the 1st, and every figure in
 * the product assumed spending accrues evenly. On the 4th of a 30-day month an
 * on-time rent payment was compared against one-eighth of its budget and
 * reported 650% over plan.
 */

const CATS = mergedCats({ needs: [], wants: [], save: [] });
const FLAT = allCategories(CATS);

let seq = 0;
const tx = (date: string, category: string, amount: number): ExpenseItem =>
  ({ id: `t${++seq}`, date, category, amount });

describe('classifying how a category is paid', () => {
  it('calls a category with no history fixed only when it is a scheduled bill by nature', () => {
    const timing = classifySpendTiming([], FLAT, '2026-09');
    expect(timing.get('rent')?.shape).toBe('fixed');
    expect(timing.get('insurance')?.shape).toBe('fixed');
    expect(timing.get('groceries')?.shape).toBe('variable');
    expect(timing.get('eating_out')?.shape).toBe('variable');
    // And it says the classification is an assumption, not evidence.
    expect(timing.get('rent')?.basis).toBe('default');
  });

  it('learns a scheduled charge from the ledger, whatever the category is called', () => {
    // Shopping is variable by nature, but this user pays one instalment on the
    // 5th of every month. Their own ledger outranks the built-in opinion.
    const items = ['2026-06', '2026-07', '2026-08'].map((m) => tx(`${m}-05`, 'shopping', 4_000));
    const timing = classifySpendTiming(items, FLAT, '2026-09');
    expect(timing.get('shopping')).toMatchObject({ shape: 'fixed', dueDay: 5, basis: 'history' });
  });

  it('will not call a habit a schedule just because it is one payment a month', () => {
    // One shopping trip a month, but never on the same day. Giving this a due
    // date would put a date on screen the user never agreed to.
    const items = [
      tx('2026-06-03', 'shopping', 4_000),
      tx('2026-07-19', 'shopping', 4_000),
      tx('2026-08-27', 'shopping', 4_000),
    ];
    expect(classifySpendTiming(items, FLAT, '2026-09').get('shopping')?.shape).toBe('variable');
  });

  it('reads many small purchases as variable even when they are the same category', () => {
    const items: ExpenseItem[] = [];
    for (const m of ['2026-06', '2026-07', '2026-08']) {
      for (const d of ['04', '11', '18', '25']) items.push(tx(`${m}-${d}`, 'groceries', 3_000));
    }
    expect(classifySpendTiming(items, FLAT, '2026-09').get('groceries')?.shape).toBe('variable');
  });

  it('takes the day it landed on this month over any historical guess', () => {
    const timing = classifySpendTiming([tx('2026-09-01', 'rent', 725)], FLAT, '2026-09');
    expect(timing.get('rent')).toMatchObject({ shape: 'fixed', dueDay: 1, settled: true });
  });

  it('leaves savings out entirely — money moved is not money spent', () => {
    const timing = classifySpendTiming([], FLAT, '2026-09');
    expect(timing.has('stocks')).toBe(false);
    expect(timing.has('emergency')).toBe(false);
  });
});

describe('what a category should have cost by now', () => {
  const fixedUnpaid = { shape: 'fixed' as const, dueDay: 5, settled: false, basis: 'default' as const };

  it('paces a variable category by the calendar, as it always did', () => {
    const variable = { shape: 'variable' as const, dueDay: null, settled: false, basis: 'default' as const };
    expect(expectedShareByNow(variable, 0.5, 15)).toBe(0.5);
  });

  it('expects a scheduled charge in full once it has been paid', () => {
    expect(expectedShareByNow({ ...fixedUnpaid, settled: true }, 0.13, 4)).toBe(1);
  });

  it('expects it in full once its day has passed, paid or not', () => {
    expect(expectedShareByNow(fixedUnpaid, 0.33, 10)).toBe(1);
  });

  /**
   * The important one. A target of zero would hand out a perfect mark for a
   * bill that simply has not arrived; a target of the full budget would mark
   * someone down for not paying rent early. Neither is an answer, so there
   * isn't one — the caller drops the category and renormalises.
   */
  it('has no answer for a bill that is neither paid nor yet due', () => {
    expect(expectedShareByNow(fixedUnpaid, 0.1, 3)).toBeNull();
  });

  it('falls back to the calendar for a category it does not know', () => {
    expect(expectedShareByNow(undefined, 0.4, 12)).toBe(0.4);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   The score, as the user meets it
   ══════════════════════════════════════════════════════════════════════════ */

/** A month run exactly to plan: rent on the 1st, daily life spread evenly. */
function onPlanThrough(day: number) {
  const items: ExpenseItem[] = [
    tx('2026-09-01', 'rent', 725),
    tx('2026-09-01', 'insurance', 86),
    tx('2026-09-02', 'stocks', 450),
  ];
  for (let d = 1; d <= day; d += 1) {
    const dd = String(d).padStart(2, '0');
    items.push(tx(`2026-09-${dd}`, 'groceries', 10));
    items.push(tx(`2026-09-${dd}`, 'eating_out', 200 / 30));
  }
  return {
    month: '2026-09', now: new Date(2026, 8, day), cats: CATS, income: 3000,
    budgetVals: { rent: 725, insurance: 86, groceries: 300, eating_out: 200, stocks: 450 },
    items,
  };
}

describe('the month score no longer climbs just because the calendar moved', () => {
  /**
   * Measured before this change, on a month run perfectly to plan: 69 on the
   * 1st, 69 on the 8th, 77 on the 22nd, 89 on the 30th. The user's month had
   * not changed in any respect; only the date had. Rent, paid on time, was the
   * cause — its budget is a quarter of the plan and it was being compared to a
   * pro-rated target it could not help but exceed.
   */
  it('scores the same month the same on the 1st and the 30th', () => {
    const scores = [1, 4, 8, 15, 22, 30].map((d) => computeExecutionScore(onPlanThrough(d)).score);
    const spread = Math.max(...scores) - Math.min(...scores);
    expect(spread).toBeLessThanOrEqual(3);
    // And it is a good score, because it was a good month all the way through.
    expect(Math.min(...scores)).toBeGreaterThanOrEqual(82);
  });

  it('still marks down rent that is genuinely over its budget', () => {
    const base = onPlanThrough(4);
    const over = computeExecutionScore({
      ...base,
      items: [...base.items, tx('2026-09-01', 'rent', 400)],
    });
    expect(over.score).toBeLessThan(computeExecutionScore(base).score);
    expect(over.components.find((c) => c.key === 'fidelity')!.detail).toMatch(/Rent/);
  });

  it('says which bills it is not judging yet rather than scoring them', () => {
    // Day 2, and this user pays rent on the 25th: nothing about rent has
    // happened and nothing was expected, so it is left out of the pace.
    const history = ['2026-06', '2026-07', '2026-08'].map((m) => tx(`${m}-25`, 'rent', 725));
    const r = computeExecutionScore({
      month: '2026-09', now: new Date(2026, 8, 2), cats: CATS, income: 3000,
      budgetVals: { rent: 725, groceries: 300 },
      items: [...history, tx('2026-09-01', 'groceries', 10)],
    });
    // Rent's absence must not read as "300% under budget" and drag the month.
    expect(r.components.find((c) => c.key === 'fidelity')!.score).toBeGreaterThan(85);
  });
});

describe('the score is about this month, not the last one', () => {
  it('weights fidelity against this month’s own plan most heavily', () => {
    const r = computeExecutionScore(onPlanThrough(15));
    const fidelity = r.components.find((c) => c.key === 'fidelity')!;
    for (const other of r.components) {
      if (other.key !== 'fidelity') expect(fidelity.weight).toBeGreaterThan(other.weight);
    }
  });

  it('carries a small plan-realism component instead of a month-on-month comparison', () => {
    // Six months at 12,000 of groceries, budgeted this month at 5,000: the plan
    // is the thing that is wrong, and it says so before the month ends.
    const history = ['2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08']
      .flatMap((m) => [tx(`${m}-05`, 'groceries', 6_000), tx(`${m}-20`, 'groceries', 6_000)]);
    const r = computeExecutionScore({
      month: '2026-09', now: new Date(2026, 8, 30), cats: CATS, income: 100_000,
      budgetVals: { groceries: 5_000 },
      items: [...history, tx('2026-09-05', 'groceries', 6_000), tx('2026-09-20', 'groceries', 6_000)],
    });
    const realism = r.components.find((c) => c.key === 'realism')!;
    // Budgeted at 5,000 against a settled 12,000: barely above the floor.
    expect(realism.score).toBeLessThan(5);
    expect(realism.detail).toMatch(/budgeted below what it usually costs/);
    // Small, deliberately: it judges the plan, not the month.
    expect(realism.weight).toBeLessThan(0.2);
  });
});
