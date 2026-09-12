import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSnapshot, type SnapshotInput } from '../tools/ai/context';
import { BUILTIN_CATS } from '../tools/lib/budget';
import { financialInsights, localFinancialAnswer, BRIEFING_QUESTION, FORECAST_QUESTION, COMPARISON_QUESTION } from '../tools/ai/briefing';
import { comparePeriods } from '../tools/ai/comparison';
import { chartIsGrounded, collectFigures, highlightIsGrounded } from '../tools/ai/grounding';
import { ask } from '../tools/ai/assistant';

const transport = vi.hoisted(() => vi.fn());
vi.mock('../lib/ai/transport', () => ({ requestCompletion: transport }));
const tx = (date: string, amount: number, category = 'groceries') => ({ id: `${date}-${category}-${amount}`, date, category, amount });
function input(overrides: Partial<SnapshotInput> = {}): SnapshotInput {
  return {
    month: '2026-03', now: new Date(2026, 2, 15), currency: 'INR', cats: BUILTIN_CATS,
    items: [tx('2026-03-02', 300), tx('2026-03-12', 500, 'emergency'), tx('2026-02-02', 200), tx('2026-02-20', 2000)],
    budgetStore: { '2026-03': { income: '5000', n: '50', w: '30', s: '20', vals: { groceries: 600, emergency: 500 } } },
    ...overrides,
  };
}

beforeEach(() => {
  transport.mockReset();
  transport.mockResolvedValue({ ok: true, content: JSON.stringify({ answer: 'An explanation.', mode: 'data' }), model: 'test' });
});

describe('same-period comparisons', () => {
  it('compares the same day window, excluding future entries and savings', () => {
    const c = comparePeriods(input({ items: [...input().items, tx('2026-03-20', 9000)] }))!;
    expect(c.throughDay).toBe(15);
    expect(c.current).toMatchObject({ spending: 300, setAside: 500 });
    expect(c.previous.spending).toBe(200);
    expect(c.spendingChangePct).toBe(50);
    // The old full-month totals remain available without changing their contract.
    const s = buildSnapshot(input());
    expect(s.previousMonth!.spentOnNeedsAndWants).toBe(2200);
    expect(s.comparablePeriod).toEqual(comparePeriods(input()));
  });

  it.each([[2026, 28], [2024, 29]])('aligns March 31 with February in %i', (year, day) => {
    const c = comparePeriods(input({
      month: `${year}-03`, now: new Date(year, 2, 31),
      items: [tx(`${year}-03-28`, 100), tx(`${year}-03-31`, 700), tx(`${year}-02-28`, 200)],
    }))!;
    expect(c.throughDay).toBe(day);
    expect(c.current.spending).toBe(100);
    expect(c.previous.spending).toBe(200);
  });

  it('handles January rollover and closed months', () => {
    const c = comparePeriods(input({ month: '2026-01', items: [tx('2026-01-31', 10), tx('2025-12-31', 20)] }))!;
    expect(c.basis).toBe('whole-months');
    expect(c.previous.month).toBe('2025-12');
    expect(c.spendingChangePct).toBe(-50);
  });

  it('never turns an empty window or zero baseline into a claimed decrease', () => {
    expect(comparePeriods(input({ items: [tx('2026-02-02', 200)] }))!.spendingChangePct).toBeNull();
    expect(comparePeriods(input({ items: [tx('2026-03-02', 200), tx('2026-02-02', 200, 'emergency')] }))!.spendingChangePct).toBeNull();
    expect(comparePeriods(input({ month: '2026-04' }))).toBeNull();
  });
});

describe('instant financial intelligence', () => {
  it('answers supported questions without an API call, even when the API is unavailable', async () => {
    transport.mockResolvedValue({ ok: false, kind: 'network' });
    for (const question of [BRIEFING_QUESTION, FORECAST_QUESTION, COMPARISON_QUESTION, 'Summarise my month']) {
      const result = await ask({ ...input(), question });
      expect(result).toMatchObject({ ok: true, origin: 'local' });
      if (result.ok) expect(result.answer.length).toBeGreaterThan(40);
    }
    expect(transport).not.toHaveBeenCalled();
  });

  it('rebuilds answers after records change', async () => {
    const first = await ask({ ...input(), question: BRIEFING_QUESTION });
    const second = await ask({ ...input({ items: [tx('2026-03-03', 1234)] }), question: BRIEFING_QUESTION });
    expect(first.ok && first.highlights[0].value).toBe(300);
    expect(second.ok && second.highlights[0].value).toBe(1234);
  });

  it('does not hijack compound questions, follow-ups or focused requests', async () => {
    for (const question of ['What needs my attention and why did rent change?', 'What about last year?']) {
      expect(localFinancialAnswer(question, buildSnapshot(input()))).toBeNull();
    }
    await ask({ ...input(), question: BRIEFING_QUESTION, focus: { kind: 'category', key: 'groceries', label: 'Groceries' } });
    expect(transport).toHaveBeenCalledOnce();
  });

  it('names missing evidence rather than interpreting no records as no spending', () => {
    const s = buildSnapshot(input({ items: [], budgetStore: {} }));
    const insights = financialInsights(s);
    expect(insights.map((i) => i.title)).toContain('Complete your records');
    expect(insights.some((i) => i.title.includes('exceeds'))).toBe(false);
    expect(localFinancialAnswer(COMPARISON_QUESTION, s)!.answer).toContain('need recorded transactions');
  });

  it('keeps savings separate even when they cause negative cash flow', () => {
    const s = buildSnapshot(input({ items: [tx('2026-03-02', 100), tx('2026-03-02', 8000, 'emergency')] }));
    const insights = financialInsights(s);
    expect(insights.some((i) => i.title === 'Recorded spending exceeds the plan')).toBe(false);
    expect(insights.find((i) => i.title === 'Recorded outflows exceed income')!.next).toContain('savings transfer alone is not overspending');
  });

  it('shows cross-tool priorities and every saved return assumption', () => {
    const s = buildSnapshot(input({ plan: {
      emergencyFund: { saved: 2000, target: 10000, gap: 8000, essentialCostsPerMonth: 2000, monthsOfCoverChosen: 5, monthsCoveredNow: 1, monthlyContribution: 500, monthsToTarget: 16 },
      goal: { name: 'Home', targetInTodaysMoney: 100000, targetAtDeadline: 100000, adjustedForInflation: false, years: 5, alreadySaved: 0, fundedPct: 0, monthlyByReturnPath: [
        { path: 'Cautious', assumedAnnualReturnPct: 4, monthly: 1500 },
        { path: 'Growth', assumedAnnualReturnPct: 8, monthly: 1300 },
      ] }, netWorth: null, investingPlan: null,
    } }));
    const insights = financialInsights(s);
    expect(insights[0].title).toContain('emergency-fund');
    const goal = insights.find((i) => i.title.includes('return assumption'))!;
    expect(goal.detail).toContain('1,500 monthly');
    expect(goal.detail).toContain('1,300 monthly');
    expect(goal.detail).toContain('not guaranteed');
  });

  it('does not turn a forecast range into a guarantee or invent ranges for sparse history', () => {
    const s = buildSnapshot(input());
    const answer = localFinancialAnswer(FORECAST_QUESTION, s)!;
    expect(answer.answer).toContain('not enough replay history');
    expect(answer.answer).toContain('Early-month estimates can change');
    expect(localFinancialAnswer(FORECAST_QUESTION, { ...s, projectedMonthEndRange: { low: 500, high: 1000, monthsTested: 3 } })!.answer).toContain('not a guaranteed limit or a probability interval');
  });

  it('every local visual has an exact typed source', () => {
    const s = buildSnapshot(input());
    const known = collectFigures(s);
    for (const question of [BRIEFING_QUESTION, FORECAST_QUESTION, COMPARISON_QUESTION]) {
      const answer = localFinancialAnswer(question, s)!;
      expect(answer.highlights.every((h) => highlightIsGrounded(h, known, true))).toBe(true);
      if (answer.chart) expect(chartIsGrounded(answer.chart, known, true)).toBe(true);
    }
  });

  it('withholds AI visuals without sources or with a wrong source even if the number exists elsewhere', async () => {
    transport.mockResolvedValue({ ok: true, model: 'test', content: JSON.stringify({
      answer: 'Your income is recorded.',
      highlights: [
        { label: 'Income', value: 5000, unit: 'currency', source: 'data.income' },
        { label: 'Spending', value: 5000, unit: 'currency', source: 'data.spentOnNeedsAndWants' },
        { label: 'Uncited', value: 300, unit: 'currency' },
      ],
    }) });
    const result = await ask({ ...input(), question: 'Explain my income' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.highlights.map((h) => h.label)).toEqual(['Income']);
      expect(result.grounding!.tilesWithheld).toBe(2);
    }
  });
});

describe('real-account empty-month regressions', () => {
  it('does not treat untouched starter income as spendable cash', () => {
    const s = buildSnapshot(input({ budgetStore: { '2026-03': { income: '50000', n: '50', w: '30', s: '20', vals: {} } }, items: [] }));
    expect(s.income).toBeNull();
    expect(s.netCashFlow).toBeNull();
    expect(s.savingsRatePct).toBeNull();
    expect(s.gaps.join(' ')).toContain('untouched starter budget');
    expect(localFinancialAnswer(BRIEFING_QUESTION, s)!.highlights.some((h) => h.label === 'Net cash flow')).toBe(false);
  });

  it('retains a 50,000 income once the budget has allocations', () => {
    const s = buildSnapshot(input({ budgetStore: { '2026-03': { income: '50000', n: '50', w: '30', s: '20', vals: { groceries: 1000 } } } }));
    expect(s.income).toBe(50000);
    expect(s.netCashFlow).toBe(49200);
  });

  it('does not forecast zero spending from an empty month', () => {
    const s = buildSnapshot(input({ items: [], budgetStore: {} }));
    expect(s.projectedMonthEnd).toBeNull();
    const answer = localFinancialAnswer(FORECAST_QUESTION, s)!;
    expect(answer.highlights).toEqual([]);
    expect(answer.answer).toContain('not enough recorded spending');
  });
});
