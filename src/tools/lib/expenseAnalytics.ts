/**
 * Expense Analytics — pure, derived insights from transaction history.
 *
 * This module NEVER modifies the calculation engine. It takes the same
 * ExpenseItem[] that expense.ts operates on and derives read-only analytics:
 * spending trends, recurring detection, daily heatmap, category comparisons,
 * payment method breakdown, spending streaks, and actionable insights.
 *
 * Every function is pure and unit-testable.
 */
import type { ExpenseItem, SectionSplit } from './expense';
import { migrateCategory, splitBySection, splitOutflow } from './expense';
import { ymdLocal, ymLocal } from '../../lib/date';
import type { CatKey } from './budget';
import type { IconName } from '../ui/Icon';
import { monthLabel } from './month';

/**
 * The category key a transaction belongs to, resolved the way the rest of the
 * app resolves it.
 *
 * Every function here already receives `catMeta`, whose KEYS are the user's live
 * categories — which makes it the migration table too. Grouping on the raw
 * stored key instead (which is what this module used to do) splits one category
 * into two buckets for anyone with pre-V4.1 data: a legacy `food` row and a
 * current `eating_out` row are the same category to `computeDashboard`, but were
 * two separate rows here, each with a smaller total, and the legacy one labelled
 * with its raw storage key because `catMeta.get('food')` finds nothing.
 *
 * That is not cosmetic in this file. These are the figures behind "your biggest
 * category", the month-over-month comparison and the generated insights — a
 * split bucket understates a category and can flip a comparison's direction.
 *
 * Takes the live key SET rather than the map, so callers build it once instead
 * of once per transaction. The previous signature took the map and rebuilt
 * `new Set(catMeta.keys())` on every single call — inside `computeMonthlyTrend`
 * that is one set of every category allocated per transaction per month, twelve
 * times over, on a page that re-renders while the user types.
 */
function catKeyOf(category: string, validKeys: ReadonlySet<string>): string {
  return migrateCategory(category, validKeys);
}

/** The user's live category keys — the migration table `catKeyOf` resolves against. */
function catKeys(catMeta: Map<string, CatMeta>): ReadonlySet<string> {
  return new Set(catMeta.keys());
}

/* ══════════════════════════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════════════════════════ */

export interface MonthlyTrend {
  month: string;      // YYYY-MM
  label: string;      // "Jan", "Feb"…
  fullLabel: string;  // "January 2026"
  spent: number;
  txCount: number;
  dailyAvg: number;
  topCategory: string | null;
  topCategorySpent: number;
  /** Same `spent`, broken into Needs / Wants / Savings for the stacked chart. */
  split: SectionSplit;
}

export interface CategoryComparison {
  category: string;
  label: string;
  icon: IconName;
  section: CatKey | null;
  currentMonth: number;
  previousMonth: number;
  change: number;       // absolute
  changePct: number;    // percentage change (0 when prev is 0)
  direction: 'up' | 'down' | 'flat' | 'new';
}

export interface PaymentBreakdown {
  method: string;
  total: number;
  pct: number;
  txCount: number;
}

export interface DailyHeatmapDay {
  date: string;   // YYYY-MM-DD
  dow: number;    // 0=Mon…6=Sun
  week: number;   // week index within the range
  amount: number;
  txCount: number;
}

export interface RecurringPattern {
  category: string;
  label: string;
  icon: IconName;
  merchant: string | null;
  avgAmount: number;
  /**
   * Only ever `'monthly'`. The union used to also offer `'weekly'`, which
   * `detectRecurring` has no branch that can produce — so every consumer's
   * "is this monthly?" guard was a test that could not fail, and the type
   * described a capability the code does not have.
   */
  frequency: 'monthly';
  monthsDetected: number;
  lastDate: string;
  estimatedMonthly: number;
}

/**
 * A run of consecutive days that reaches the present.
 *
 * There is deliberately no `longest`. The field existed and was a fiction in
 * both directions: the logging scan stopped at the first boundary it hit, so
 * "longest" could only ever equal `current`, and the no-spend value was
 * assigned `current` outright under a comment admitting it. Nothing rendered
 * either. A number nobody entered is a number nobody should be shown — and an
 * unrendered wrong one is worse, because it is waiting to be believed.
 */
export interface SpendingStreak {
  type: 'no_spend' | 'under_budget' | 'logging';
  /** Consecutive days, ending today or (for logging) yesterday. */
  current: number;
  label: string;
}

export interface SpendingInsight {
  id: string;
  tone: 'ok' | 'info' | 'warn' | 'tip';
  title: string;
  body: string;
  /**
   * The one-line takeaway — what this observation means the user should do, or
   * keep doing, said in a single sentence.
   *
   * It exists because an observation without a takeaway is half an insight, and
   * the other half used to be behind a button. "45% of your spending happens at
   * weekends" is a fact; whether that is a problem and what to do about it was
   * only ever available by asking the assistant, which meant most people never
   * got it. The deterministic line is now always on screen and the assistant is
   * for going deeper, not for finishing the sentence.
   *
   * Derived from the same figures as `body`, never fetched, never generated —
   * so it is instant, offline, identical every time, and free.
   */
  action: string;
  icon: IconName;
}

export interface CatMeta {
  k: string;
  l: string;
  ic: IconName;
  section: CatKey;
}

/* ══════════════════════════════════════════════════════════════════════════
   Frequent categories — powers the "Recent" quick-pick shortcut in the add
   forms. Ranks the user's own categories by how often they've been used, with
   the most-recently-used breaking ties, so the common case is one tap. Pure.
   ══════════════════════════════════════════════════════════════════════════ */

export function frequentCategoryKeys(
  items: ExpenseItem[],
  valid: ReadonlySet<string>,
  limit = 5,
): string[] {
  const count = new Map<string, number>();
  const lastSeen = new Map<string, string>(); // category → max date string
  for (const e of items) {
    // Resolve first, THEN check: the raw check dropped every legacy-keyed row,
    // so a category the user actually uses most could never reach the quick-pick.
    const k = migrateCategory(e.category, valid);
    if (!valid.has(k)) continue; // genuinely stale key, with nowhere to migrate to
    count.set(k, (count.get(k) ?? 0) + 1);
    const d = e.date || '';
    if (d > (lastSeen.get(k) ?? '')) lastSeen.set(k, d);
  }
  return [...count.keys()]
    .sort((a, b) =>
      (count.get(b)! - count.get(a)!) ||
      (lastSeen.get(b)! > lastSeen.get(a)! ? 1 : lastSeen.get(b)! < lastSeen.get(a)! ? -1 : 0) ||
      a.localeCompare(b))
    .slice(0, limit);
}

/* ══════════════════════════════════════════════════════════════════════════
   Monthly trend (up to 12 months)
   ══════════════════════════════════════════════════════════════════════════ */

export function computeMonthlyTrend(
  items: ExpenseItem[],
  endMonth: string,
  months: number,
  catMeta: Map<string, CatMeta>,
): MonthlyTrend[] {
  const [ey, em] = endMonth.split('-').map(Number);
  const trend: MonthlyTrend[] = [];
  // Hoisted once for the whole 12-month sweep: both `catKeyOf` and
  // `splitBySection` resolve against it, and rebuilding it per transaction is
  // the allocation this function used to make thousands of times.
  const validKeys = catKeys(catMeta);

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(ey, em - 1 - i, 1);
    const mk = ymLocal(d);
    const monthItems = items.filter((e) => (e.date || '').startsWith(mk));
    const spent = monthItems.reduce((s, e) => s + e.amount, 0);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

    // Top category
    const byCat: Record<string, number> = {};
    monthItems.forEach((e) => {
      const k = catKeyOf(e.category, validKeys);
      byCat[k] = (byCat[k] || 0) + e.amount;
    });
    const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
    const topCat = sorted[0] ?? null;

    trend.push({
      month: mk,
      label: monthLabel(mk).split(' ')[0].slice(0, 3),
      fullLabel: monthLabel(mk),
      spent,
      txCount: monthItems.length,
      dailyAvg: daysInMonth > 0 ? spent / daysInMonth : 0,
      topCategory: topCat ? (catMeta.get(topCat[0])?.l ?? topCat[0]) : null,
      topCategorySpent: topCat ? topCat[1] : 0,
      split: splitBySection(monthItems, validKeys, catMeta),
    });
  }
  return trend;
}

/* ══════════════════════════════════════════════════════════════════════════
   Category comparison (current vs previous month)
   ══════════════════════════════════════════════════════════════════════════ */

export function computeCategoryComparison(
  items: ExpenseItem[],
  currentMonth: string,
  catMeta: Map<string, CatMeta>,
): CategoryComparison[] {
  const [y, m] = currentMonth.split('-').map(Number);
  const prevDate = new Date(y, m - 2, 1);
  const prevMonth = ymLocal(prevDate);

  const curItems = items.filter((e) => (e.date || '').startsWith(currentMonth));
  const prevItems = items.filter((e) => (e.date || '').startsWith(prevMonth));

  const validKeys = catKeys(catMeta);
  const curByCat: Record<string, number> = {};
  const prevByCat: Record<string, number> = {};
  curItems.forEach((e) => {
    const k = catKeyOf(e.category, validKeys);
    curByCat[k] = (curByCat[k] || 0) + e.amount;
  });
  prevItems.forEach((e) => {
    const k = catKeyOf(e.category, validKeys);
    prevByCat[k] = (prevByCat[k] || 0) + e.amount;
  });

  const allCats = new Set([...Object.keys(curByCat), ...Object.keys(prevByCat)]);
  const result: CategoryComparison[] = [];

  for (const cat of allCats) {
    const cur = curByCat[cat] || 0;
    const prev = prevByCat[cat] || 0;
    if (cur === 0 && prev === 0) continue;
    const meta = catMeta.get(cat);
    const change = cur - prev;
    const changePct = prev > 0 ? ((cur - prev) / prev) * 100 : 0;
    const direction: CategoryComparison['direction'] =
      prev === 0 ? 'new' : Math.abs(change) < 1 ? 'flat' : change > 0 ? 'up' : 'down';

    result.push({
      category: cat,
      label: meta?.l ?? cat,
      icon: meta?.ic ?? 'other',
      section: meta?.section ?? null,
      currentMonth: cur,
      previousMonth: prev,
      change,
      changePct,
      direction,
    });
  }

  return result.sort((a, b) => b.currentMonth - a.currentMonth);
}

/* ══════════════════════════════════════════════════════════════════════════
   Payment method breakdown
   ══════════════════════════════════════════════════════════════════════════ */

export function computePaymentBreakdown(items: ExpenseItem[]): PaymentBreakdown[] {
  const byMethod: Record<string, { total: number; count: number }> = {};
  const total = items.reduce((s, e) => s + e.amount, 0);

  items.forEach((e) => {
    const method = e.paymentMethod || 'Not specified';
    if (!byMethod[method]) byMethod[method] = { total: 0, count: 0 };
    byMethod[method].total += e.amount;
    byMethod[method].count++;
  });

  return Object.entries(byMethod)
    .map(([method, d]) => ({
      method,
      total: d.total,
      pct: total > 0 ? (d.total / total) * 100 : 0,
      txCount: d.count,
    }))
    .sort((a, b) => b.total - a.total);
}

/* ══════════════════════════════════════════════════════════════════════════
   Daily heatmap (calendar-style spending intensity for a month)
   ══════════════════════════════════════════════════════════════════════════ */

export function computeDailyHeatmap(items: ExpenseItem[], month: string): DailyHeatmapDay[] {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const firstDow = (new Date(y, m - 1, 1).getDay() + 6) % 7; // 0=Mon

  const byDate: Record<string, { amount: number; count: number }> = {};
  items.forEach((e) => {
    if ((e.date || '').startsWith(month)) {
      if (!byDate[e.date]) byDate[e.date] = { amount: 0, count: 0 };
      byDate[e.date].amount += e.amount;
      byDate[e.date].count++;
    }
  });

  const days: DailyHeatmapDay[] = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2, '0')}`;
    const dow = (firstDow + d - 1) % 7;
    const week = Math.floor((firstDow + d - 1) / 7);
    const data = byDate[date] || { amount: 0, count: 0 };
    days.push({ date, dow, week, amount: data.amount, txCount: data.count });
  }
  return days;
}

/* ══════════════════════════════════════════════════════════════════════════
   Recurring expense detection
   ══════════════════════════════════════════════════════════════════════════ */

export function detectRecurring(
  items: ExpenseItem[],
  catMeta: Map<string, CatMeta>,
): RecurringPattern[] {
  // Group by (category, merchant|null) and look for monthly patterns.
  //
  // The group's identity is carried as FIELDS, not re-parsed out of the key.
  // `key.split('::')` took the first two segments, so a merchant that contains
  // "::" — pasted from a statement, or typed — silently lost everything after
  // it and was matched against a truncated name for the rest of its life.
  interface Group { cat: string; merchant: string; txs: ExpenseItem[] }
  const groups = new Map<string, Group>();
  const validKeys = catKeys(catMeta);

  items.forEach((e) => {
    // Only consider items explicitly marked recurring OR with merchant+category pattern
    // Resolved, so a subscription logged before the merge and after it is ONE
    // recurring pattern rather than two half-confident ones.
    const cat = catKeyOf(e.category, validKeys);
    const merchant = e.merchant?.toLowerCase() || '';
    const key = `${cat}::${merchant}`;
    const group = groups.get(key) ?? { cat, merchant, txs: [] };
    group.txs.push(e);
    groups.set(key, group);
  });

  const patterns: RecurringPattern[] = [];

  for (const { cat, merchant, txs } of groups.values()) {
    if (txs.length < 2) continue;

    // Check if explicitly recurring
    const hasRecurringFlag = txs.some((t) => t.recurring);

    // Check monthly pattern: transactions in 2+ distinct months
    const months = new Set(txs.map((t) => (t.date || '').slice(0, 7)));
    if (months.size < 2 && !hasRecurringFlag) continue;

    // Compute average amount
    const avgAmount = txs.reduce((s, t) => s + t.amount, 0) / txs.length;

    // A pattern that averages zero or less is not a bill. It is a category
    // whose refunds cancel its charges (or exceed them), and treating it as one
    // would put a ₹0 line in "already spoken for" — or, with a negative
    // average, ADD to the money reported as free to spend.
    if (avgAmount <= 0) continue;

    // Check amount consistency (coefficient of variation < 0.3 for monthly)
    if (txs.length >= 3 && !hasRecurringFlag) {
      const mean = avgAmount;
      const variance = txs.reduce((s, t) => s + (t.amount - mean) ** 2, 0) / txs.length;
      const cv = Math.sqrt(variance) / mean;
      if (cv > 0.5) continue; // Too variable to be recurring
    }

    const meta = catMeta.get(cat);
    const sortedDates = txs.map((t) => t.date).sort();
    const lastDate = sortedDates[sortedDates.length - 1];

    patterns.push({
      category: cat,
      label: meta?.l ?? cat,
      icon: meta?.ic ?? 'other',
      merchant: merchant || null,
      avgAmount: Math.round(avgAmount * 100) / 100,
      frequency: 'monthly',
      monthsDetected: months.size,
      lastDate,
      estimatedMonthly: Math.round(avgAmount * 100) / 100,
    });
  }

  return patterns.sort((a, b) => b.estimatedMonthly - a.estimatedMonthly);
}

/* ══════════════════════════════════════════════════════════════════════════
   Spending streaks
   ══════════════════════════════════════════════════════════════════════════ */

/** How far back a streak is looked for. Beyond this it is history, not a run. */
const STREAK_WINDOW_DAYS = 365;
/** A no-spend run is a shorter-horizon claim; past this it is just dormancy. */
const NO_SPEND_WINDOW_DAYS = 90;

/**
 * The streaks shown on the Overview tab.
 *
 * A "current" streak must REACH the present, and that is the whole subtlety.
 * The previous implementation walked backwards and reported the first run it
 * found anywhere in the window, so a ledger last touched two hundred days ago
 * for five days running was presented as "5 days logging" — a badge for a habit
 * the user had already lost. Today or yesterday is the boundary: yesterday
 * counts because someone who logs each evening has not broken anything by
 * having logged nothing yet this morning.
 */
export function computeStreaks(items: ExpenseItem[], now: Date): SpendingStreak[] {
  const txDates = new Set(items.map((e) => e.date));
  const streaks: SpendingStreak[] = [];

  /** Days with at least one transaction, counted back from `from`. */
  const runEndingAt = (from: Date, limit: number): number => {
    const d = new Date(from);
    let run = 0;
    while (run < limit && txDates.has(ymdLocal(d))) {
      run += 1;
      d.setDate(d.getDate() - 1);
    }
    return run;
  };

  // Anchored at today, or at yesterday when today is simply not logged yet.
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const loggingCurrent = txDates.has(ymdLocal(now))
    ? runEndingAt(now, STREAK_WINDOW_DAYS)
    : runEndingAt(yesterday, STREAK_WINDOW_DAYS);

  streaks.push({
    type: 'logging',
    current: loggingCurrent,
    label: loggingCurrent > 0
      ? `${loggingCurrent} day${loggingCurrent > 1 ? 's' : ''} logging`
      : 'Start logging daily',
  });

  // No-spend streak: consecutive days, ending today, with nothing logged.
  let noSpendCurrent = 0;
  const d2 = new Date(now);
  while (noSpendCurrent < NO_SPEND_WINDOW_DAYS && !txDates.has(ymdLocal(d2))) {
    noSpendCurrent++;
    d2.setDate(d2.getDate() - 1);
  }
  if (noSpendCurrent > 0) {
    streaks.push({
      type: 'no_spend',
      current: noSpendCurrent,
      label: `${noSpendCurrent} no-spend day${noSpendCurrent > 1 ? 's' : ''}`,
    });
  }

  return streaks;
}

/* ══════════════════════════════════════════════════════════════════════════
   Spending insights (derived, never fabricated)
   ══════════════════════════════════════════════════════════════════════════ */

export function generateInsights(
  items: ExpenseItem[],
  currentMonth: string,
  /**
   * The budget that is meant to be SPENT — `DashResult.spendableBudget`, not
   * `monthlyBudget`. Passing the whole budget is the bug this parameter is
   * named to prevent: it includes the savings allocation on the limit side
   * while the ledger includes the SIP on the used side, so a month spent
   * entirely on saving reported "96% of your budget used" and told the user to
   * slow down.
   */
  spendableBudget: number,
  catMeta: Map<string, CatMeta>,
  now: Date,
): SpendingInsight[] {
  const insights: SpendingInsight[] = [];
  const curItems = items.filter((e) => (e.date || '').startsWith(currentMonth));
  if (curItems.length === 0) return insights;

  const validKeys = catKeys(catMeta);

  /**
   * Consumption and savings, separated before anything is judged.
   *
   * Every insight below that uses the word "spending" means `consumedTotal`.
   * Money set aside is reported on its own terms, and never as a warning: a
   * bigger SIP is the outcome this product exists to produce, and warning
   * about it is worse than saying nothing.
   */
  const { consumed, consumedTotal, setAsideTotal } =
    splitOutflow(curItems, validKeys, catMeta);

  /**
   * Is `currentMonth` the month that is actually running?
   *
   * The caller passes the month the user is LOOKING at, which is routinely a
   * past one. Only the pacing insight below cares, and it cared silently: it
   * compared a finished month's total against `now.getDate() / daysInMonth`,
   * so opening June in August told the user they were "spending ahead of pace"
   * with "only 61% of the month" gone — of a month that ended weeks ago.
   */
  const isRunningMonth = currentMonth === ymLocal(now);

  /* ── The previous month, split the same way ─────────────────────────────── */
  const [cy, cm] = currentMonth.split('-').map(Number);
  const prevMonthKey = ymLocal(new Date(cy, cm - 2, 1));
  const prevItems = items.filter((e) => (e.date || '').startsWith(prevMonthKey));
  const prev = splitOutflow(prevItems, validKeys, catMeta);
  const prevLabel = monthLabel(prevMonthKey);

  /* ═══ Money set aside — reported first, and only ever as good news ═══════ */

  if (prev.setAsideTotal > 0 && setAsideTotal > 0) {
    const savedChangePct = ((setAsideTotal - prev.setAsideTotal) / prev.setAsideTotal) * 100;
    const consumedFlat =
      prev.consumedTotal <= 0
      || Math.abs((consumedTotal - prev.consumedTotal) / prev.consumedTotal) * 100 <= 10;

    if (savedChangePct >= 15) {
      insights.push({
        id: 'savings_up',
        tone: 'ok',
        title: 'Saving more than last month',
        // Named "set aside", not "spent". The whole point of this insight is
        // that the figure which grew is not money gone.
        body: consumedFlat
          ? `You set aside ${Math.round(savedChangePct)}% more than ${prevLabel} while your spending held steady. That is exactly the shape you want.`
          : `You set aside ${Math.round(savedChangePct)}% more than ${prevLabel}. That is money working for you, not money gone.`,
        action: 'Hold this level next month and it stops being a good month and starts being your rate.',
        icon: 'check',
      });
    } else if (savedChangePct <= -25) {
      // Deliberately `info`, never `warn`. A smaller month of saving has a
      // hundred innocent explanations, and the product has no way to tell an
      // emergency from a deliberate pause.
      insights.push({
        id: 'savings_down',
        tone: 'info',
        title: 'Saving less than last month',
        body: `You set aside ${Math.round(Math.abs(savedChangePct))}% less than ${prevLabel}. Worth a look if that was not deliberate.`,
        action: 'If it was not deliberate, a standing transfer on payday is what stops it happening again.',
        icon: 'trending',
      });
    }
  }

  /* ═══ Consumption — this, and only this, is judged as spending ═══════════ */

  // 1. Budget pace. Only for the month that is running, and only against the
  // budget that is meant to be spent.
  if (spendableBudget > 0 && isRunningMonth) {
    const [, mo] = currentMonth.split('-').map(Number);
    const daysInMonth = new Date(cy, mo, 0).getDate();
    const dayOfMonth = now.getDate();
    const expectedPct = (dayOfMonth / daysInMonth) * 100;
    const actualPct = (consumedTotal / spendableBudget) * 100;

    if (actualPct > expectedPct + 15 && dayOfMonth > 5) {
      insights.push({
        id: 'pace_fast',
        tone: 'warn',
        title: 'Spending ahead of pace',
        body: `You've used ${Math.round(actualPct)}% of your spending budget but only ${Math.round(expectedPct)}% of the month has passed. Savings are excluded — this is day-to-day money.`,
        action: 'Check the daily safe spend above before the next discretionary purchase — it already accounts for the days left.',
        icon: 'warn',
      });
    } else if (actualPct < expectedPct - 20 && dayOfMonth > 10) {
      insights.push({
        id: 'pace_good',
        tone: 'ok',
        title: 'Under budget pace',
        body: `You've used only ${Math.round(actualPct)}% of your spending budget with ${Math.round(100 - expectedPct)}% of the month left. Great discipline.`,
        action: 'Move the surplus into savings before month end rather than letting it get absorbed.',
        icon: 'check',
      });
    }
  }

  // 2. Month-over-month CONSUMPTION. A month where more money left the account
  // because more of it went into savings is not a month of higher spending.
  if (prev.consumedTotal > 0 && consumedTotal > 0) {
    const changePct = ((consumedTotal - prev.consumedTotal) / prev.consumedTotal) * 100;
    if (changePct > 25) {
      insights.push({
        id: 'mom_up',
        tone: 'warn',
        title: 'Spending up from last month',
        body: `You're spending ${Math.round(changePct)}% more than ${prevLabel}, savings aside. Check if there's a one-off or a new pattern forming.`,
        action: 'Open the category comparison on the Analytics tab — it names which category moved.',
        icon: 'arrow-up',
      });
    } else if (changePct < -15) {
      insights.push({
        id: 'mom_down',
        tone: 'ok',
        title: 'Spending down',
        body: `You're spending ${Math.round(Math.abs(changePct))}% less than ${prevLabel}, savings aside. Keep it up.`,
        action: 'Redirect the difference to savings now, while it is still visible.',
        icon: 'trending',
      });
    }
  }

  // Nothing below this line is meaningful without consumption to describe.
  if (consumed.length === 0 || consumedTotal <= 0) return insights.slice(0, 4);

  // 3. Weekend vs weekday consumption.
  const weekendSpend = consumed
    .filter((e) => { const d = new Date(e.date + 'T00:00:00'); const dow = d.getDay(); return dow === 0 || dow === 6; })
    .reduce((s, e) => s + e.amount, 0);
  const weekendPct = (weekendSpend / consumedTotal) * 100;
  if (weekendPct > 40 && consumed.length >= 5) {
    insights.push({
      id: 'weekend_heavy',
      tone: 'info',
      title: 'Weekend spender',
      body: `${Math.round(weekendPct)}% of your spending happens on weekends. Planning weekend activities ahead of time can help.`,
      action: 'Decide the weekend budget on Friday. A number set in advance is the one that holds.',
      icon: 'clock',
    });
  }

  // 4. Largest single purchase. A SIP is not a "big ticket item" to reconsider,
  // so this ranks consumption only.
  const maxTx = consumed.reduce((max, e) => (e.amount > max.amount ? e : max), consumed[0]);
  if (maxTx && (maxTx.amount / consumedTotal) > 0.25) {
    const label = maxTx.merchant || maxTx.note
      || catMeta.get(catKeyOf(maxTx.category, validKeys))?.l || 'Unknown';
    insights.push({
      id: 'large_tx',
      tone: 'info',
      title: 'Big ticket item',
      body: `Your largest purchase (${label}) accounts for ${Math.round((maxTx.amount / consumedTotal) * 100)}% of this month's spending.`,
      action: 'If it was a one-off, read the rest of the month without it — the pattern underneath is the real one.',
      icon: 'trending',
    });
  }

  // 5. Category concentration, across spending categories only.
  const byCat: Record<string, number> = {};
  consumed.forEach((e) => {
    const k = catKeyOf(e.category, validKeys);
    byCat[k] = (byCat[k] || 0) + e.amount;
  });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (catEntries.length >= 3) {
    const topPct = (catEntries[0][1] / consumedTotal) * 100;
    if (topPct > 50) {
      insights.push({
        id: 'concentrated',
        tone: 'info',
        title: 'Spending concentrated',
        body: `${catMeta.get(catEntries[0][0])?.l ?? catEntries[0][0]} makes up ${Math.round(topPct)}% of your monthly spend. Diversifying helps reduce vulnerability to single-category spikes.`,
        action: 'One category this dominant is also the fastest lever — a 10% cut there beats a 10% cut anywhere else.',
        icon: 'pie',
      });
    }
  }

  // 6. Fixed costs as a share of consumption. A recurring SIP is a commitment,
  // not a fixed COST, so `setAside` is excluded from both sides.
  const recurringTotal = consumed.filter((e) => e.recurring).reduce((s, e) => s + e.amount, 0);
  if (recurringTotal > 0 && (recurringTotal / consumedTotal) * 100 > 60) {
    insights.push({
      id: 'recurring_heavy',
      tone: 'info',
      title: 'Fixed costs dominant',
      body: `${Math.round((recurringTotal / consumedTotal) * 100)}% of your spending is recurring. Review subscriptions and contracts annually to catch unused services.`,
      action: 'Open the Recurring tab and cancel anything you cannot name a use for in the last month.',
      icon: 'refresh',
    });
  }

  return insights.slice(0, 4);
}

/* ══════════════════════════════════════════════════════════════════════════
   Summary stats for the analytics header
   ══════════════════════════════════════════════════════════════════════════ */

export interface AnalyticsSummary {
  totalAllTime: number;
  txCountAllTime: number;
  avgPerTransaction: number;
  monthsTracked: number;
  avgPerMonth: number;
  topMerchant: { name: string; total: number; count: number } | null;
  topCategory: { key: string; label: string; total: number } | null;
  recurringMonthly: number;
}

export function computeAnalyticsSummary(
  items: ExpenseItem[],
  catMeta: Map<string, CatMeta>,
): AnalyticsSummary {
  const totalAllTime = items.reduce((s, e) => s + e.amount, 0);
  const txCountAllTime = items.length;
  const avgPerTransaction = txCountAllTime > 0 ? totalAllTime / txCountAllTime : 0;

  const months = new Set(items.map((e) => (e.date || '').slice(0, 7)));
  const monthsTracked = months.size || 1;
  const avgPerMonth = totalAllTime / monthsTracked;

  // Top merchant
  const byMerchant: Record<string, { total: number; count: number }> = {};
  items.forEach((e) => {
    if (e.merchant) {
      if (!byMerchant[e.merchant]) byMerchant[e.merchant] = { total: 0, count: 0 };
      byMerchant[e.merchant].total += e.amount;
      byMerchant[e.merchant].count++;
    }
  });
  const topMerchantEntry = Object.entries(byMerchant).sort((a, b) => b[1].total - a[1].total)[0];
  const topMerchant = topMerchantEntry
    ? { name: topMerchantEntry[0], total: topMerchantEntry[1].total, count: topMerchantEntry[1].count }
    : null;

  // Top category
  const validKeys = catKeys(catMeta);
  const byCat: Record<string, number> = {};
  items.forEach((e) => {
    const k = catKeyOf(e.category, validKeys);
    byCat[k] = (byCat[k] || 0) + e.amount;
  });
  const topCatEntry = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const topCategory = topCatEntry
    ? { key: topCatEntry[0], label: catMeta.get(topCatEntry[0])?.l ?? topCatEntry[0], total: topCatEntry[1] }
    : null;

  // Recurring monthly estimate: everything flagged recurring, averaged over the
  // months the ledger actually covers. `monthsTracked` is already floored at 1
  // above, so there is nothing further to guard against here.
  const recurringMonthly =
    items.filter((e) => e.recurring).reduce((s, e) => s + e.amount, 0) / monthsTracked;

  return {
    totalAllTime,
    txCountAllTime,
    avgPerTransaction,
    monthsTracked,
    avgPerMonth,
    topMerchant,
    topCategory,
    recurringMonthly,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Month-end forecast — a forward-looking projection from the run-rate so far.
   Purely derived from the current month's own transactions; only meaningful for
   the in-progress month (past months are already complete).
   ══════════════════════════════════════════════════════════════════════════ */

export interface MonthForecast {
  isCurrentMonth: boolean;
  daysElapsed: number;
  daysInMonth: number;
  spentSoFar: number;
  dailyRunRate: number;
  /** Projected month-end total at the current run-rate. */
  projected: number;
  /** projected ÷ budget as a %, or null when no budget is set. */
  vsBudgetPct: number | null;
  /** True when the projection would exceed the monthly budget. */
  overBudget: boolean;
}

export function computeMonthForecast(
  items: ExpenseItem[],
  month: string,
  now: Date,
  /** `DashResult.spendableBudget` — the budget meant to be spent. See below. */
  spendableBudget = 0,
  catMeta: Map<string, CatMeta> = new Map(),
): MonthForecast {
  const nowMonth = ymLocal(now);
  const isCurrentMonth = month === nowMonth;
  const [y, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const daysElapsed = isCurrentMonth ? Math.max(1, now.getDate()) : daysInMonth;

  const monthItems = items.filter((e) => (e.date || '').slice(0, 7) === month);
  /**
   * Consumption only, on both sides.
   *
   * A run-rate projection assumes the days so far are representative of the
   * days to come, and a savings transfer is the one outflow for which that is
   * flatly untrue: a monthly SIP paid on the 2nd extrapolates to fifteen SIPs
   * by month end. Against a budget that also included savings, that produced
   * "On track to exceed your budget by A$50,000. Easing the daily pace keeps
   * you within plan." — a red bar and an instruction to stop, generated
   * entirely by the user doing the right thing on time.
   *
   * So the projection describes day-to-day spending, which really does accrue
   * daily, and compares it to the budget for day-to-day spending.
   */
  const { consumedTotal } = splitOutflow(monthItems, new Set(catMeta.keys()), catMeta);
  const spentSoFar = consumedTotal;
  const dailyRunRate = spentSoFar / daysElapsed;
  const projected = isCurrentMonth ? Math.round(dailyRunRate * daysInMonth) : Math.round(spentSoFar);
  const vsBudgetPct = spendableBudget > 0 ? Math.round((projected / spendableBudget) * 100) : null;

  return {
    isCurrentMonth,
    daysElapsed,
    daysInMonth,
    spentSoFar,
    dailyRunRate,
    projected,
    vsBudgetPct,
    overBudget: spendableBudget > 0 && projected > spendableBudget,
  };
}
