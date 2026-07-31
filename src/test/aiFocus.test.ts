import { describe, it, expect } from 'vitest';
import { assessConfidence, confidenceInstruction } from '../tools/ai/confidence';
import { describeFocus, focusButtonLabel, focusKey, type AiFocus } from '../tools/ai/focus';
import { buildSnapshot } from '../tools/ai/context';
import { BUILTIN_CATS, type BudgetStore } from '../tools/lib/budget';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * Confidence is the claim FinatriX AI makes about its own footing, so it has to
 * be a measurement rather than a mood. These tests pin that it is derived from
 * how many months actually contain transactions — and never from the answer.
 */

const NOW = new Date(2026, 2, 15); // 15 March 2026
const budgetStore: BudgetStore = {
  '2026-03': { vals: { groceries: 600 }, income: '5000', n: '50', w: '30', s: '20' },
};

let seq = 0;
function tx(month: string, amount: number): ExpenseItem {
  return { id: `t${++seq}`, date: `${month}-05`, category: 'groceries', amount };
}

function snapshotFor(months: string[]) {
  return buildSnapshot({
    items: months.map((m) => tx(m, 100)),
    cats: BUILTIN_CATS, budgetStore, month: '2026-03', currency: 'INR', now: NOW,
  });
}

describe('assessConfidence', () => {
  it('is low with nothing logged at all, and says so', () => {
    const c = assessConfidence(snapshotFor([]));
    expect(c.level).toBe('low');
    expect(c.basis).toMatch(/No transactions have been logged/i);
  });

  it('is low when the month in view is empty, even with earlier history', () => {
    const c = assessConfidence(snapshotFor(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02']));
    expect(c.level).toBe('low');
    expect(c.basis).toMatch(/Nothing is logged for March 2026/);
  });

  it('is low on a single month — too little to call anything a trend', () => {
    const c = assessConfidence(snapshotFor(['2026-03']));
    expect(c.level).toBe('low');
    expect(c.basis).toMatch(/one month/i);
  });

  it('is medium once months can be compared', () => {
    const c = assessConfidence(snapshotFor(['2026-01', '2026-02', '2026-03']));
    expect(c.level).toBe('medium');
    expect(c.basis).toMatch(/3 months/);
  });

  it('is high once there is enough to see a pattern', () => {
    const c = assessConfidence(snapshotFor([
      '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
    ]));
    expect(c.level).toBe('high');
    expect(c.basis).toMatch(/6 months/);
  });

  it('counts months with transactions, not rows in the store', () => {
    // Twenty transactions, all in one month, is still one month of evidence.
    const many = Array.from({ length: 20 }, () => tx('2026-03', 50));
    const snapshot = buildSnapshot({
      items: many, cats: BUILTIN_CATS, budgetStore, month: '2026-03', currency: 'INR', now: NOW,
    });
    expect(assessConfidence(snapshot).level).toBe('low');
  });

  it('always carries a label the UI can show without inventing wording', () => {
    for (const months of [[], ['2026-03'], ['2026-02', '2026-03']]) {
      const c = assessConfidence(snapshotFor(months));
      expect(c.label).toMatch(/confidence/i);
      expect(c.basis.length).toBeGreaterThan(0);
    }
  });
});

describe('confidenceInstruction', () => {
  it('tells the model to hedge exactly as much as the evidence warrants', () => {
    const low = confidenceInstruction(assessConfidence(snapshotFor([])));
    const high = confidenceInstruction(assessConfidence(snapshotFor([
      '2025-10', '2025-11', '2025-12', '2026-01', '2026-02', '2026-03',
    ])));

    expect(low).toMatch(/Do not present a trend, a comparison or a forecast as established fact/);
    expect(high).toMatch(/enough to describe trends/);
    // Both still insist a forecast is labelled as one.
    expect(low).toMatch(/estimate/i);
    expect(high).toMatch(/estimate/i);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   Focus — what the user was looking at
   ══════════════════════════════════════════════════════════════════════════ */

const ALL_FOCUSES: AiFocus[] = [
  { kind: 'overview' },
  { kind: 'budget' },
  { kind: 'category', key: 'groceries', label: 'Groceries' },
  { kind: 'transaction', id: 'tx_1', label: 'Corner Store' },
  { kind: 'heatmap' },
  { kind: 'timeline', granularity: 'weekly' },
  { kind: 'insight', id: 'pace_fast', title: 'Spending ahead of pace', body: 'x' },
];

describe('describeFocus', () => {
  it('gives every subject a title, an orientation line and questions', () => {
    for (const focus of ALL_FOCUSES) {
      const d = describeFocus(focus);
      expect(d.title.length, `${focus.kind} title`).toBeGreaterThan(0);
      expect(d.subtitle.length, `${focus.kind} subtitle`).toBeGreaterThan(0);
      expect(d.prompts.length, `${focus.kind} prompts`).toBeGreaterThan(0);
    }
  });

  it('names the actual category rather than a placeholder', () => {
    const d = describeFocus({ kind: 'category', key: 'groceries', label: 'Groceries' });
    expect(d.title).toBe('Groceries');
    expect(d.prompts.join(' ')).toContain('Groceries');
  });
});

describe('focusButtonLabel', () => {
  it('labels every subject with what pressing it will actually do', () => {
    for (const focus of ALL_FOCUSES) {
      expect(focusButtonLabel(focus).length, focus.kind).toBeGreaterThan(0);
    }
    expect(focusButtonLabel({ kind: 'heatmap' })).toBe('Explain Pattern');
  });
});

describe('focusKey', () => {
  it('is stable for the same subject and distinct for different ones', () => {
    const a: AiFocus = { kind: 'category', key: 'groceries', label: 'Groceries' };
    const b: AiFocus = { kind: 'category', key: 'groceries', label: 'Groceries (renamed)' };
    const c: AiFocus = { kind: 'category', key: 'travel', label: 'Travel' };

    expect(focusKey(a)).toBe(focusKey(b)); // identity, not display text
    expect(focusKey(a)).not.toBe(focusKey(c));
    expect(focusKey(null)).toBe('');
  });

  it('separates the timeline’s granularities', () => {
    expect(focusKey({ kind: 'timeline', granularity: 'daily' }))
      .not.toBe(focusKey({ kind: 'timeline', granularity: 'weekly' }));
  });

  it('gives every kind a key', () => {
    const keys = ALL_FOCUSES.map(focusKey);
    expect(new Set(keys).size).toBe(ALL_FOCUSES.length);
    expect(keys.every((k) => k.length > 0)).toBe(true);
  });
});
