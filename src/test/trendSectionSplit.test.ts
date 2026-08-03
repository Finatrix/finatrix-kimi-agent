/**
 * The stacked trend charts render each month as Needs / Wants / Savings
 * segments. Two things have to hold for that to be honest:
 *
 *   1. the segments sum to the month's `spent` — a stack that renders less than
 *      the total it is labelled with is a chart that quietly lies;
 *   2. the split agrees with the Needs · Wants · Savings card sitting directly
 *      above it on the same screen, for the same month.
 *
 * Both are easy to break: category keys migrate (a pre-V4.1 `food` row is Eating
 * Out today), and a key can resolve to nothing at all once a custom category is
 * deleted — spend that belongs to no section but is still spend.
 */
import { describe, it, expect } from 'vitest';
import { computeDashboard, splitBySection, type ExpenseItem } from '../tools/lib/expense';
import { computeMonthlyTrend, type CatMeta } from '../tools/lib/expenseAnalytics';
import { allCategories, mergedCats } from '../tools/lib/budget';

const cats = mergedCats({ needs: [], wants: [], save: [] });
const flat = allCategories(cats);
const catMeta = new Map<string, CatMeta>(flat.map((c) => [c.k, c]));
const validKeys = new Set(catMeta.keys());
const NOW = new Date(2026, 6, 20); // 20 July 2026, local

const items: ExpenseItem[] = [
  { id: 'a', amount: 20000, category: 'rent', date: '2026-07-01' },      // needs
  { id: 'b', amount: 4000, category: 'groceries', date: '2026-07-04' },  // needs
  { id: 'c', amount: 3000, category: 'eating_out', date: '2026-07-06' }, // wants
  { id: 'd', amount: 2500, category: 'food', date: '2026-07-08' },       // wants, legacy key
  { id: 'e', amount: 9000, category: 'emergency', date: '2026-07-10' },  // save
  { id: 'f', amount: 750, category: 'ghost_category', date: '2026-07-12' }, // resolves nowhere
];

describe('splitBySection', () => {
  it('files each transaction under its section', () => {
    const split = splitBySection(items, validKeys, catMeta);
    expect(split.needs).toBe(24000);
    expect(split.save).toBe(9000);
  });

  it('resolves a legacy key rather than dropping it', () => {
    const split = splitBySection(items, validKeys, catMeta);
    // 3000 eating_out + 2500 legacy `food` — one section, not one section and a
    // silent hole. Grouped on the raw key, the 2500 would land in `unassigned`.
    expect(split.wants).toBe(5500);
  });

  it('keeps spend that belongs to no section rather than losing it', () => {
    const split = splitBySection(items, validKeys, catMeta);
    expect(split.unassigned).toBe(750);
  });

  it('always sums to the total', () => {
    const split = splitBySection(items, validKeys, catMeta);
    const total = items.reduce((s, e) => s + e.amount, 0);
    expect(split.needs + split.wants + split.save + split.unassigned).toBe(total);
  });

  it('is all zeroes for a month with nothing in it', () => {
    expect(splitBySection([], validKeys, catMeta)).toEqual({
      needs: 0, wants: 0, save: 0, unassigned: 0,
    });
  });
});

describe('the stacked chart agrees with the card above it', () => {
  it('matches computeDashboard sections for the same month', () => {
    const dash = computeDashboard('2026-07', items, cats, {}, NOW);
    const july = dash.trend[dash.trend.length - 1];

    for (const s of dash.sections) {
      expect(july.split[s.section]).toBe(s.spent);
    }
    // The card's three sections exclude the unresolved row; the chart shows it,
    // which is why the stack still reconciles to the month total.
    const cardTotal = dash.sections.reduce((s, x) => s + x.spent, 0);
    expect(cardTotal + july.split.unassigned).toBe(dash.monthlySpent);
  });

  it('sums to `spent` on every point of the 6-month dashboard trend', () => {
    const dash = computeDashboard('2026-07', items, cats, {}, NOW);
    for (const p of dash.trend) {
      const { needs, wants, save, unassigned } = p.split;
      expect(needs + wants + save + unassigned).toBe(p.spent);
    }
  });

  it('sums to `spent` on every point of the 12-month analytics trend', () => {
    const trend = computeMonthlyTrend(items, '2026-07', 12, catMeta);
    expect(trend).toHaveLength(12);
    for (const p of trend) {
      const { needs, wants, save, unassigned } = p.split;
      expect(needs + wants + save + unassigned).toBe(p.spent);
    }
    const july = trend[trend.length - 1];
    expect(july.split.needs).toBe(24000);
    expect(july.split.wants).toBe(5500);
    expect(july.split.save).toBe(9000);
  });
});
