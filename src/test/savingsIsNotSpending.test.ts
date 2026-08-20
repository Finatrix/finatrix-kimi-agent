import { describe, it, expect } from 'vitest';
import { generateInsights, computeMonthForecast, type CatMeta } from '../tools/lib/expenseAnalytics';
import { splitOutflow, computeDashboard, type ExpenseItem } from '../tools/lib/expense';
import { mergedCats } from '../tools/lib/budget';
import { buildSnapshot } from '../tools/ai/context';

/**
 * Saving is not spending.
 *
 * The ledger records outflows, and two completely different things look
 * identical in it: A$5,000 of dinners and a A$5,000 transfer to savings are
 * both "an amount, a category, a date". Only one of them is money gone.
 *
 * Every surface that judged the raw sum told a user who had put their whole
 * budget into savings that they had "used 96% of your budget but only 65% of
 * the month has passed. Consider slowing down." — advising someone doing the
 * single best thing this product exists to encourage to stop doing it. The
 * same figure produced a "Spending up 43% vs last month" card, a push
 * notification, and a red "on track to exceed your budget" forecast.
 *
 * These are that scenario, reproduced from the real shape of the data.
 */

const CATS = mergedCats({ needs: [], wants: [], save: [] });
const CAT_META = new Map<string, CatMeta>(
  [...CATS.needs.map((c) => ({ ...c, section: 'needs' as const })),
   ...CATS.wants.map((c) => ({ ...c, section: 'wants' as const })),
   ...CATS.save.map((c) => ({ ...c, section: 'save' as const }))]
    .map((c) => [c.k, c as CatMeta]),
);

/** 20 August — two thirds through a 31-day month, as in the reported screen. */
const NOW = new Date(2026, 7, 20, 10);

let seq = 0;
const tx = (date: string, category: string, amount: number): ExpenseItem =>
  ({ id: `t${++seq}`, date, category, amount });

/**
 * The reported month: rent and a little day-to-day spending, and everything
 * else moved into savings — with saving up sharply on July.
 */
const AUGUST_AS_REPORTED: ExpenseItem[] = [
  // July: A$971 of needs, A$200 wants, A$3,000 saved.
  tx('2026-07-03', 'rent', 971),
  tx('2026-07-11', 'eating_out', 200),
  tx('2026-07-05', 'stocks', 3000),
  // August: essentially the same spending, A$5,000 saved.
  tx('2026-08-03', 'rent', 1000),
  tx('2026-08-11', 'eating_out', 200),
  tx('2026-08-05', 'stocks', 5000),
];

/** A$2,000 to spend, A$5,000 earmarked for investing. */
const BUDGET = { rent: 1400, eating_out: 600, stocks: 5000 };

describe('splitOutflow', () => {
  it('separates money consumed from money set aside', () => {
    const august = AUGUST_AS_REPORTED.filter((e) => e.date.startsWith('2026-08'));
    const split = splitOutflow(august, new Set(CAT_META.keys()), CAT_META);

    expect(split.consumedTotal).toBe(1200);
    expect(split.setAsideTotal).toBe(5000);
    expect(split.consumed).toHaveLength(2);
    expect(split.setAside).toHaveLength(1);
  });

  it('counts an unrecognised category as consumption, not as savings', () => {
    // The safe direction: a typo must never exempt real spending from the
    // warnings the user relies on.
    const split = splitOutflow(
      [tx('2026-08-04', 'not-a-real-category', 400)], new Set(CAT_META.keys()), CAT_META,
    );
    expect(split.consumedTotal).toBe(400);
    expect(split.setAsideTotal).toBe(0);
  });
});

describe('insights — the reported screen', () => {
  const insights = () =>
    generateInsights(
      AUGUST_AS_REPORTED,
      '2026-08',
      computeDashboard('2026-08', AUGUST_AS_REPORTED, CATS, BUDGET, NOW).spendableBudget,
      CAT_META,
      NOW,
    );

  it('does not warn about pace when the outflow is savings', () => {
    // A$1,200 consumed of a A$2,000 spending budget on day 20 of 31 is 60% of
    // budget against 65% of the month — comfortably on track. Against the whole
    // A$7,000 budget with the SIP counted as spend it was 89%, and warned.
    expect(insights().map((i) => i.id)).not.toContain('pace_fast');
  });

  it('does not report spending as up when only saving went up', () => {
    const ids = insights().map((i) => i.id);
    expect(ids).not.toContain('mom_up');
  });

  it('recognises the extra saving as good news', () => {
    const savings = insights().find((i) => i.id === 'savings_up');
    expect(savings).toBeDefined();
    expect(savings!.tone).toBe('ok');
    // A$3,000 → A$5,000 is +67%.
    expect(savings!.body).toContain('67%');
    // And it says what actually happened, in the right words.
    expect(savings!.body).toContain('set aside');
    expect(savings!.body).not.toMatch(/\bspending (?:is )?up\b/i);
  });

  it('emits no warning at all for this month', () => {
    expect(insights().filter((i) => i.tone === 'warn')).toEqual([]);
  });
});

describe('insights — real overspending is still caught', () => {
  /** Same saving as July, but day-to-day spending has run away. */
  const OVERSPENT: ExpenseItem[] = [
    tx('2026-07-03', 'rent', 971),
    tx('2026-07-11', 'eating_out', 200),
    tx('2026-07-05', 'stocks', 3000),
    tx('2026-08-03', 'rent', 1000),
    tx('2026-08-06', 'eating_out', 480),
    tx('2026-08-12', 'shopping', 400),
    tx('2026-08-05', 'stocks', 3000),
  ];

  const insights = () =>
    generateInsights(
      OVERSPENT, '2026-08',
      computeDashboard('2026-08', OVERSPENT, CATS, BUDGET, NOW).spendableBudget,
      CAT_META, NOW,
    );

  it('warns on pace when the money really was consumed', () => {
    // A$1,880 of a A$2,000 spending budget by day 20 — genuinely ahead.
    expect(insights().map((i) => i.id)).toContain('pace_fast');
  });

  it('warns that spending is up, because it is', () => {
    // A$1,171 consumed in July → A$1,880 in August is +61%.
    const up = insights().find((i) => i.id === 'mom_up');
    expect(up).toBeDefined();
    expect(up!.tone).toBe('warn');
  });

  it('does not congratulate a flat month of saving', () => {
    expect(insights().map((i) => i.id)).not.toContain('savings_up');
  });
});

describe('month-end forecast', () => {
  it('does not extrapolate a monthly SIP into fifteen of them', () => {
    // The SIP lands on the 5th. A run-rate over the whole outflow projects it
    // as if it recurred daily: A$6,200 over 20 days → A$9,610 by month end,
    // "on track to exceed your budget", in red, because the user invested.
    const f = computeMonthForecast(
      AUGUST_AS_REPORTED, '2026-08', NOW,
      computeDashboard('2026-08', AUGUST_AS_REPORTED, CATS, BUDGET, NOW).spendableBudget,
      CAT_META,
    );
    expect(f.spentSoFar).toBe(1200);
    expect(f.projected).toBe(Math.round((1200 / 20) * 31));
    expect(f.overBudget).toBe(false);
  });

  it('still flags a genuine overspend trajectory', () => {
    const heavy = [
      tx('2026-08-02', 'eating_out', 700),
      tx('2026-08-10', 'shopping', 700),
      tx('2026-08-05', 'stocks', 5000),
    ];
    const f = computeMonthForecast(
      heavy, '2026-08', NOW,
      computeDashboard('2026-08', heavy, CATS, BUDGET, NOW).spendableBudget,
      CAT_META,
    );
    expect(f.overBudget).toBe(true);
  });
});

describe('the AI snapshot', () => {
  const snap = () => buildSnapshot({
    items: AUGUST_AS_REPORTED,
    cats: CATS,
    budgetStore: { '2026-08': { income: '0', n: '50', w: '30', s: '20', vals: BUDGET } },
    month: '2026-08',
    currency: 'AUD',
    now: NOW,
  });

  it('hands the model consumption and savings as separate figures', () => {
    const s = snap();
    expect(s.spentOnNeedsAndWants).toBe(1200);
    expect(s.setAsideThisMonth).toBe(5000);
    // The whole outflow is still available, and is still the larger number —
    // which is exactly why it must not be the one labelled "spending".
    expect(s.totalSpent).toBe(6200);
  });

  it('reports the month-over-month change in spending, not in outflow', () => {
    const s = snap();
    // Consumption went A$1,171 → A$1,200: +2%, not the +43% the raw sum gives.
    expect(s.changeVsPreviousMonthPct).toBe(2);
    expect(s.savingsChangeVsPreviousMonthPct).toBe(67);
  });

  it('splits the previous month the same way', () => {
    expect(snap().previousMonth).toEqual({
      month: '2026-07',
      label: 'July 2026',
      spent: 4171,
      spentOnNeedsAndWants: 1171,
      setAside: 3000,
    });
  });
});
