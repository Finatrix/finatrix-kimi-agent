import { describe, it, expect } from 'vitest';
import { computeMonthForecast, type CatMeta } from '../tools/lib/expenseAnalytics';
import { splitOutflow, type ExpenseItem } from '../tools/lib/expense';
import { allCategories, mergedCats } from '../tools/lib/budget';

/**
 * The month-end forecast, graded against months whose ending is known.
 *
 * Every figure the forecast card shows is a claim about the future, and the only
 * honest way to know whether a forecasting method is any good is to stand on
 * day N of a month that has already ended, forecast it, and compare. This suite
 * does that across several kinds of spender, on seeded ledgers so the result is
 * reproducible, and holds the blended forecast to beating the plain run-rate it
 * replaced on every day tested.
 *
 * The plain run-rate is rebuilt here from the forecast's own components (bills
 * paid + day-to-day ÷ days elapsed × days in month + bills still due), so the
 * comparison isolates the one thing that changed: how the days still to come are
 * estimated.
 */

const CATS = allCategories(mergedCats({ needs: [], wants: [], save: [] }));
const CAT_META = new Map<string, CatMeta>(CATS.map((c) => [c.k, c as CatMeta]));
const VALID = new Set(CATS.map((c) => c.k));

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(r: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
}

interface Spender {
  name: string;
  /** Month-to-month variation in the level of day-to-day spending. */
  monthSpread: number;
  /** Chance of one large purchase in a month. */
  oneOffChance: number;
  weekendDining: number;
  /** Groceries as one big shop on a random early day, not daily top-ups. */
  bigShop?: boolean;
  /** A lasting change of habit from this month index. */
  shiftFrom?: number;
}

const SPENDERS: Spender[] = [
  { name: 'steady', monthSpread: 0.07, oneOffChance: 0.05, weekendDining: 1 },
  { name: 'erratic', monthSpread: 0.28, oneOffChance: 0.15, weekendDining: 1 },
  { name: 'weekend-heavy', monthSpread: 0.1, oneOffChance: 0.1, weekendDining: 1.9 },
  { name: 'one-off purchases', monthSpread: 0.1, oneOffChance: 0.5, weekendDining: 1 },
  { name: 'monthly big shop', monthSpread: 0.1, oneOffChance: 0.1, weekendDining: 1, bigShop: true },
  { name: 'change of habit', monthSpread: 0.1, oneOffChance: 0.1, weekendDining: 1, shiftFrom: 6 },
];

const DAY_TO_DAY = [
  { k: 'groceries', weekday: 0.35, weekend: 0.45, median: 900, spread: 0.5 },
  { k: 'eating_out', weekday: 0.2, weekend: 0.45, median: 600, spread: 0.6 },
  { k: 'transport', weekday: 0.6, weekend: 0.25, median: 150, spread: 0.5 },
  { k: 'shopping', weekday: 0.07, weekend: 0.12, median: 1800, spread: 0.9 },
  { k: 'entertainment', weekday: 0.05, weekend: 0.2, median: 800, spread: 0.6 },
  { k: 'medical', weekday: 0.03, weekend: 0.03, median: 1200, spread: 0.7 },
] as const;

function monthKey(i: number): string {
  const d = new Date(2025, i, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysIn(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function ledgerFor(s: Spender, seed: number, months: number): ExpenseItem[] {
  const r = rng(seed);
  const out: ExpenseItem[] = [];
  const add = (date: string, category: string, amount: number) =>
    out.push({ id: `t${out.length}`, date, category, amount: Math.round(amount) });

  for (let i = 0; i < months; i += 1) {
    const month = monthKey(i);
    const [y, m] = month.split('-').map(Number);
    const days = daysIn(month);
    const on = (d: number) => `${month}-${String(d).padStart(2, '0')}`;
    const level = Math.exp(s.monthSpread * gaussian(r)) * (s.shiftFrom != null && i >= s.shiftFrom ? 1.5 : 1);

    // Scheduled charges and money set aside: neither may be extrapolated.
    add(on(1 + Math.floor(r() * 3)), 'rent', 22000);
    add(on(8), 'phone', 599);
    add(on(12), 'internet', 999);
    add(on(15), 'subscriptions', 649);
    add(on(3), 'emergency', 5000);
    add(on(5), 'stocks', 10000);

    for (let d = 1; d <= days; d += 1) {
      const dow = new Date(y, m - 1, d).getDay();
      const weekend = dow === 0 || dow === 6;
      for (const c of DAY_TO_DAY) {
        if (s.bigShop && c.k === 'groceries') continue;
        const boost = weekend && c.k === 'eating_out' ? s.weekendDining : 1;
        if (r() < (weekend ? c.weekend : c.weekday) * boost) {
          add(on(d), c.k, c.median * Math.exp(c.spread * gaussian(r)) * level);
        }
      }
    }
    if (s.bigShop) {
      add(on(1 + Math.floor(r() * 12)), 'groceries', 8000 * level);
      for (let k = 0; k < 4; k += 1) add(on(1 + Math.floor(r() * days)), 'groceries', 500 * level);
    }
    if (r() < s.oneOffChance) {
      add(on(1 + Math.floor(r() * days)), r() < 0.5 ? 'shopping' : 'travel', 8000 + r() * 30000);
    }
  }
  return out;
}

function consumedIn(items: readonly ExpenseItem[], month: string): number {
  return splitOutflow(items.filter((e) => e.date.slice(0, 7) === month), VALID, CAT_META).consumedTotal;
}

/** The ledger as it stood at the end of `day`: nothing dated later exists yet. */
function asOf(items: readonly ExpenseItem[], month: string, day: number): ExpenseItem[] {
  const cutoff = `${month}-${String(day).padStart(2, '0')}`;
  return items.filter((e) => e.date <= cutoff);
}

interface Grade { blended: number[]; runRate: number[]; bias: number[]; inRange: number[] }

const DAYS = [1, 3, 7, 14, 25] as const;
const MONTHS = 12;
const GRADED_FROM = 6; // leave six months of history before the first graded month
const SEEDS = 5;

function grade(): Map<number, Grade> {
  const byDay = new Map<number, Grade>(DAYS.map((d) => [d, { blended: [], runRate: [], bias: [], inRange: [] }]));
  SPENDERS.forEach((s, si) => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const items = ledgerFor(s, seed * 7919 + si * 104729, MONTHS);
      for (let i = GRADED_FROM; i < MONTHS; i += 1) {
        const month = monthKey(i);
        const actual = consumedIn(items, month);
        for (const day of DAYS) {
          const [y, m] = month.split('-').map(Number);
          const f = computeMonthForecast({
            items: asOf(items, month, day), month, now: new Date(y, m - 1, day, 12), catMeta: CAT_META,
          });
          const runRate = f.fixedSoFar + (f.variableSoFar / f.daysElapsed) * f.daysInMonth + f.fixedStillDue;
          const g = byDay.get(day)!;
          g.blended.push(Math.abs(f.projected - actual) / actual);
          g.runRate.push(Math.abs(runRate - actual) / actual);
          g.bias.push((f.projected - actual) / actual);
          if (f.range) g.inRange.push(actual >= f.range.low && actual <= f.range.high ? 1 : 0);
        }
      }
    }
  });
  return byDay;
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

describe('month-end forecast, replayed on months whose ending is known', () => {
  // Measured when this suite was written (whole-month spending, mean absolute
  // error): day 1 16% vs 65% for the run-rate, day 3 16% vs 41%, day 7 15% vs
  // 28%, day 14 12% vs 17%, day 25 6% vs 7%; bias within ±1.5%; the range held
  // the outcome 67–74% of the time.
  const results = grade();

  it.each(DAYS)('is more accurate than the plain run-rate on day %i', (day) => {
    const g = results.get(day)!;
    expect(mean(g.blended)).toBeLessThan(mean(g.runRate));
  });

  it('cuts the early-month error at least in half', () => {
    // The whole point of the blend: day 1 and day 3 are where the run-rate is
    // mostly noise — one shop multiplied by thirty, or nothing multiplied by
    // thirty — and where a user most wants to know how the month will go.
    for (const day of [1, 3]) {
      const g = results.get(day)!;
      expect(mean(g.blended)).toBeLessThan(mean(g.runRate) * 0.5);
    }
  });

  it('is not biased in either direction', () => {
    for (const day of DAYS) expect(Math.abs(mean(results.get(day)!.bias))).toBeLessThan(0.08);
  });

  it('quotes a range that holds the outcome most of the time', () => {
    // The range is the best and worst miss over up to six replays, which should
    // hold the outcome roughly seven times in ten. Guarded loosely: the point is
    // that the range means what it says, not that it hits a precise figure.
    for (const day of DAYS) {
      const g = results.get(day)!;
      expect(g.inRange.length).toBeGreaterThan(50);
      expect(mean(g.inRange)).toBeGreaterThan(0.55);
    }
  });
});

describe('month-end forecast, behaviour by construction', () => {
  const tx = (date: string, category: string, amount: number): ExpenseItem => ({
    id: `${date}-${category}-${amount}`, date, category, amount,
  });

  /** Two tracked months at a steady 1,000/day of groceries (31 and 30 days). */
  const history = (): ExpenseItem[] => {
    const out: ExpenseItem[] = [];
    for (const [month, days] of [['2026-05', 31], ['2026-06', 30]] as const) {
      for (let d = 1; d <= days; d += 1) out.push(tx(`${month}-${String(d).padStart(2, '0')}`, 'groceries', 1000));
    }
    return out;
  };

  it('falls back to the plain run-rate when there is no history', () => {
    const f = computeMonthForecast({
      items: [tx('2026-07-02', 'groceries', 3000)], month: '2026-07', now: new Date(2026, 6, 2, 12), catMeta: CAT_META,
    });
    expect(f.basis.historyMonths).toBe(0);
    expect(f.basis.weightOnThisMonth).toBe(1);
    expect(f.projected).toBe(Math.round((3000 / 2) * 31));
    expect(f.range).toBeNull();
  });

  it('leans on the typical month early, when one shop is most of the evidence', () => {
    // Day 2, one 3,000 shop: the run-rate says 46,500. The typical month says
    // about 31,000. Two days of evidence against two months: history leads.
    const f = computeMonthForecast({
      items: [...history(), tx('2026-07-02', 'groceries', 3000)],
      month: '2026-07', now: new Date(2026, 6, 2, 12), catMeta: CAT_META,
    });
    expect(f.basis.historyMonths).toBe(2);
    expect(f.basis.weightOnThisMonth).toBeCloseTo(2 / 12, 5);
    expect(f.projected).toBeLessThan(40_000);
    expect(f.projected).toBeGreaterThan(31_000);
  });

  it('forecasts a typical month on day 1 even before anything is logged', () => {
    const f = computeMonthForecast({
      items: history(), month: '2026-07', now: new Date(2026, 6, 1, 9), catMeta: CAT_META,
    });
    // The run-rate would say zero. Thirty remaining days at the typical 1,000,
    // scaled by the 10/11 of weight history carries on day 1.
    expect(f.projected).toBeGreaterThan(25_000);
  });

  it('counts a large one-off purchase once instead of every day', () => {
    // A 12,000 laptop on the 5th is 39% of a typical 31,000 month.
    const f = computeMonthForecast({
      items: [
        ...history(),
        ...[1, 2, 3, 4, 5].map((d) => tx(`2026-07-0${d}`, 'groceries', 1000)),
        tx('2026-07-05', 'shopping', 12000),
      ],
      month: '2026-07', now: new Date(2026, 6, 5, 12), catMeta: CAT_META,
    });
    expect(f.oneOffSoFar).toBe(12000);
    expect(f.dailyRunRate).toBeCloseTo(1000, 5);
    // 5,000 so far + the laptop once + 26 days at ~1,000.
    expect(f.projected).toBeCloseTo(5000 + 12000 + 26 * 1000, -2);
  });

  it('counts an entry already dated later this month once', () => {
    const f = computeMonthForecast({
      items: [...history(), tx('2026-07-01', 'groceries', 1000), tx('2026-07-20', 'groceries', 4000)],
      month: '2026-07', now: new Date(2026, 6, 1, 12), catMeta: CAT_META,
    });
    expect(f.datedAhead).toBe(4000);
    expect(f.dailyRunRate).toBe(1000);
  });

  it('does not treat the month the ledger started in as a cheap month', () => {
    // Logging began on the 20th of May, so May holds eleven days of spending.
    // Counting it as a whole month would halve "typical"; it is skipped instead.
    const items = [
      ...Array.from({ length: 12 }, (_, i) => tx(`2026-05-${20 + i}`, 'groceries', 1000)),
      ...Array.from({ length: 30 }, (_, i) => tx(`2026-06-${String(i + 1).padStart(2, '0')}`, 'groceries', 1000)),
      tx('2026-07-02', 'groceries', 2000),
    ];
    const f = computeMonthForecast({ items, month: '2026-07', now: new Date(2026, 6, 2, 12), catMeta: CAT_META });
    expect(f.basis.historyMonths).toBe(0);
  });

  it('quotes a range only once it has three past months to replay, and brackets the forecast', () => {
    const items: ExpenseItem[] = [];
    const r = rng(42);
    for (const [month, days] of [['2026-03', 31], ['2026-04', 30], ['2026-05', 31], ['2026-06', 30]] as const) {
      for (let d = 1; d <= days; d += 1) {
        items.push(tx(`${month}-${String(d).padStart(2, '0')}`, 'groceries', Math.round(600 + r() * 800)));
      }
    }
    items.push(tx('2026-07-01', 'groceries', 900), tx('2026-07-02', 'groceries', 1100));
    const f = computeMonthForecast({ items, month: '2026-07', now: new Date(2026, 6, 10, 12), catMeta: CAT_META });
    expect(f.range).not.toBeNull();
    expect(f.range!.monthsTested).toBeGreaterThanOrEqual(3);
    expect(f.range!.low).toBeLessThanOrEqual(f.projected);
    expect(f.range!.high).toBeGreaterThanOrEqual(f.projected);
    // It can never promise less than has already been spent.
    expect(f.range!.low).toBeGreaterThanOrEqual(f.spentSoFar);
  });

  it('adds up: every part the card lists sums to the headline', () => {
    const items = [...history(), tx('2026-07-01', 'rent', 20000), tx('2026-07-03', 'groceries', 1500)];
    const f = computeMonthForecast({ items, month: '2026-07', now: new Date(2026, 6, 3, 12), catMeta: CAT_META });
    const parts = f.fixedSoFar + f.variableSoFar + f.variableStillExpected + f.fixedStillDue;
    expect(Math.abs(parts - f.projected)).toBeLessThanOrEqual(0.5);
  });

  it('leaves a month that has ended exactly as it was', () => {
    const f = computeMonthForecast({
      items: history(), month: '2026-06', now: new Date(2026, 7, 3, 12), catMeta: CAT_META,
    });
    expect(f.isCurrentMonth).toBe(false);
    expect(f.projected).toBe(30_000);
    expect(f.range).toBeNull();
  });
});
