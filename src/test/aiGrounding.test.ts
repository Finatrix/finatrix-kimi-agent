import { describe, it, expect } from 'vitest';
import {
  amountsIn, checkAnswer, chartIsGrounded, collectFigures, highlightIsGrounded,
} from '../tools/ai/grounding';
import { buildSnapshot } from '../tools/ai/context';
import { mergedCats } from '../tools/lib/budget';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * The grounding check is only worth showing if "traces to your records" means
 * something: it has to pass the amounts a correct answer states, including the
 * ones it works out on the page, and it has to fail amounts that were invented.
 * Both directions are tested here, the second one statistically.
 */

describe('reading amounts out of an answer', () => {
  it.each([
    ['You spent ₹4,237 on groceries.', 4237],
    ['That is Rs. 500 a week.', 500],
    ['Rs 1,200 went on fuel.', 1200],
    ['A $1.2k difference.', 1200],
    ['Roughly ₹1.54 L this year.', 154000],
    ['About ₹2.5 lakh saved.', 250000],
    ['AED 900 on dining.', 900],
    ['1,200 INR on transport.', 1200],
    ['£3.4M is not a budget.', 3.4e6],
    ['₹1,54,000 in Indian grouping.', 154000],
  ])('reads %j as %d', (text, value) => {
    const found = amountsIn(text);
    expect(found).toHaveLength(1);
    expect(found[0].value).toBeCloseTo(value, 5);
  });

  it('does not read a following word as a scale', () => {
    // "m" of "more", "L" of "Lunch": a scale must end the word.
    expect(amountsIn('₹500 more than last month')[0].value).toBe(500);
    expect(amountsIn('₹300 Lunch')[0].value).toBe(300);
  });

  it('ignores numbers that are not money', () => {
    expect(amountsIn('On 12 September, 3 of 5 categories rose 12%.')).toEqual([]);
  });
});

describe('checking amounts against the data', () => {
  const known = collectFigures({
    income: 95000, totalSpent: 45236, spentOnNeedsAndWants: 30236, daysRemaining: 18,
    categories: [
      { name: 'Groceries', budget: 11000, spent: 4237, remaining: 6763, percentOfBudget: 39 },
      { name: 'Eating Out', budget: 6000, spent: 5200, remaining: 800, percentOfBudget: 87 },
    ],
    recurring: [{ estimatedMonthly: 649, monthsSeen: 6 }],
  });

  it('classifies money and counts by field name', () => {
    expect(known.money).toContain(649);       // estimatedMonthly is money…
    expect(known.counts).toContain(6);        // …monthsSeen is not
    expect(known.counts).toContain(18);       // daysRemaining
    expect(known.counts).toContain(39);       // percentOfBudget
  });

  it('passes amounts read straight from the data', () => {
    const r = checkAnswer('Groceries cost ₹4,237 against a ₹11,000 budget.', known);
    expect(r).toEqual({ checked: 2, workedOut: 0, unmatched: [] });
  });

  it('passes a rounded amount at the precision it was written to', () => {
    expect(checkAnswer('Spending is about ₹45,000 so far.', known).unmatched).toEqual([]);
    expect(checkAnswer('Groceries were ₹4.2k.', known).unmatched).toEqual([]);
  });

  it('does not pass a round number that is a different amount', () => {
    // 2,000 is not a rounding of 1,675 — that is 19% out.
    const k = collectFigures({ projectedMonthEnd: 1675 });
    expect(checkAnswer('You will spend ₹2,000.', k).unmatched).toEqual(['₹2,000']);
  });

  it('passes an amount worked out on the same line', () => {
    const lines = [
      'Dining and groceries together: ₹5,200 + ₹4,237 = ₹9,437.',
      'Eating Out is ₹5,200 of ₹6,000, leaving ₹800 — and ₹800 over 18 days is about ₹44 a day.',
      'Setting aside 10% of your ₹95,000 income is ₹9,500 a month.',
    ];
    for (const line of lines) {
      const r = checkAnswer(line, known);
      expect(r.unmatched, line).toEqual([]);
    }
    expect(checkAnswer(lines[0], known).workedOut).toBe(1);
  });

  it('reports a worked-out amount whose working is not shown', () => {
    const r = checkAnswer('Your two biggest categories came to ₹9,437.', known);
    expect(r.unmatched).toEqual(['₹9,437']);
  });

  it('does not let invented plain numbers ground a total', () => {
    // 3,000 and 4,100 are nowhere in the data, so their sum grounds nothing.
    // (The total is chosen to be near no real figure, so only the arithmetic
    // path could have passed it.)
    const r = checkAnswer('Shopping at 3,000 plus fuel at 4,100 is ₹7,100.', known);
    expect(r.unmatched).toEqual(['₹7,100']);
  });

  it('reports each unmatched amount once, as written', () => {
    const r = checkAnswer('Cap dining at ₹3,500.\nAgain: ₹3,500 is the cap.', known);
    expect(r.unmatched).toEqual(['₹3,500']);
    expect(r.checked).toBe(2);
  });
});

describe('figure tiles', () => {
  const known = collectFigures({ totalSpent: 0, income: 95000, percentOfBudgetUsed: 39, daysRemaining: 18 });

  it('grounds a zero, which is a real figure', () => {
    // A new month genuinely has nothing spent in it. Treating zero as absent
    // withheld the correct tile as if it had been invented — seen on a live
    // account whose September had no transactions.
    expect(highlightIsGrounded({ label: 'Spent', value: 0, unit: 'currency', tone: 'neutral' }, known)).toBe(true);
  });

  it('grounds money, percentages and counts against the right pool', () => {
    expect(highlightIsGrounded({ label: 'Income', value: 95000, unit: 'currency', tone: 'neutral' }, known)).toBe(true);
    expect(highlightIsGrounded({ label: 'Used', value: 39, unit: 'percent', tone: 'warn' }, known)).toBe(true);
    expect(highlightIsGrounded({ label: 'Days left', value: 18, unit: 'number', tone: 'neutral' }, known)).toBe(true);
  });

  it('withholds a tile the data does not contain', () => {
    expect(highlightIsGrounded({ label: 'Spent', value: 7300, unit: 'currency', tone: 'neutral' }, known)).toBe(false);
    expect(highlightIsGrounded({ label: 'Used', value: 71, unit: 'percent', tone: 'warn' }, known)).toBe(false);
  });
});

describe('charts', () => {
  const known = collectFigures({ categories: [{ spent: 4237, percentOfBudget: 39 }, { spent: 5200, percentOfBudget: 87 }] });

  it('passes a chart of values from the data', () => {
    expect(chartIsGrounded({
      title: 'Top', unit: 'currency', points: [{ label: 'A', value: 4237 }, { label: 'B', value: 5200 }],
    }, known)).toBe(true);
    expect(chartIsGrounded({
      title: 'Used', unit: 'percent', points: [{ label: 'A', value: 39 }, { label: 'B', value: 87 }],
    }, known)).toBe(true);
  });

  it('fails a chart with any value that is not', () => {
    expect(chartIsGrounded({
      title: 'Top', unit: 'currency', points: [{ label: 'A', value: 4237 }, { label: 'B', value: 5000 }],
    }, known)).toBe(false);
  });
});

describe('an invented amount rarely passes by coincidence', () => {
  it('rejects most random amounts against a realistic snapshot', () => {
    // A realistic month: seven months of ledger across eight categories, so the
    // snapshot carries a few hundred real figures for an invented one to
    // collide with.
    let seed = 99;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    const cats = ['groceries', 'eating_out', 'transport', 'shopping', 'entertainment', 'medical', 'personal_care'];
    const items: ExpenseItem[] = [];
    for (let m = 3; m <= 9; m += 1) {
      const month = `2026-${String(m).padStart(2, '0')}`;
      items.push({ id: `r${m}`, date: `${month}-01`, category: 'rent', amount: 22000 });
      for (let d = 1; d <= 28; d += 1) {
        for (const c of cats) {
          if (rand() < 0.25) {
            items.push({ id: `${month}${d}${c}`, date: `${month}-${String(d).padStart(2, '0')}`, category: c, amount: Math.round(200 + rand() * 2500) });
          }
        }
      }
    }
    const snapshot = buildSnapshot({
      items, cats: mergedCats({ needs: [], wants: [], save: [] }),
      budgetStore: { '2026-09': { income: '95000', n: '50', w: '30', s: '20', vals: { rent: 22000, groceries: 11000, eating_out: 6000 } } },
      month: '2026-09', currency: 'INR', now: new Date(2026, 8, 20, 12),
    });
    const known = collectFigures(snapshot);
    expect(known.money.length).toBeGreaterThan(40);

    // Invented amounts as a model would write them: exact, or rounded to tens
    // or hundreds, spread log-uniformly from 100 to 100,000.
    let passed = 0;
    const trials = 600;
    for (let i = 0; i < trials; i += 1) {
      const raw = 10 ** (2 + rand() * 3);
      const style = i % 3;
      const amount = style === 0 ? Math.round(raw) : style === 1 ? Math.round(raw / 10) * 10 : Math.round(raw / 100) * 100;
      const text = `You spent ₹${amount.toLocaleString('en-IN')} on it.`;
      if (checkAnswer(text, known).unmatched.length === 0) passed += 1;
    }
    // Measured at 6.8% when written; guarded at 15% so the check keeps meaning.
    expect(passed / trials).toBeLessThan(0.15);
  });
});
