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
import type { ExpenseItem } from './expense';
import { ymdLocal } from './expense';
import type { CatKey } from './budget';
import type { IconName } from '../ui/Icon';
import { monthLabel } from './month';

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
  frequency: 'monthly' | 'weekly';
  monthsDetected: number;
  lastDate: string;
  estimatedMonthly: number;
}

export interface SpendingStreak {
  type: 'no_spend' | 'under_budget' | 'logging';
  current: number;     // consecutive days
  longest: number;
  label: string;
}

export interface SpendingInsight {
  id: string;
  tone: 'ok' | 'info' | 'warn' | 'tip';
  title: string;
  body: string;
  icon: IconName;
}

export interface CatMeta {
  k: string;
  l: string;
  ic: IconName;
  section: CatKey;
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

  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(ey, em - 1 - i, 1);
    const mk = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
    const monthItems = items.filter((e) => (e.date || '').startsWith(mk));
    const spent = monthItems.reduce((s, e) => s + e.amount, 0);
    const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

    // Top category
    const byCat: Record<string, number> = {};
    monthItems.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
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
  const prevMonth = prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0');

  const curItems = items.filter((e) => (e.date || '').startsWith(currentMonth));
  const prevItems = items.filter((e) => (e.date || '').startsWith(prevMonth));

  const curByCat: Record<string, number> = {};
  const prevByCat: Record<string, number> = {};
  curItems.forEach((e) => { curByCat[e.category] = (curByCat[e.category] || 0) + e.amount; });
  prevItems.forEach((e) => { prevByCat[e.category] = (prevByCat[e.category] || 0) + e.amount; });

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
  // Group by (category, merchant|null) and look for monthly patterns
  const groups = new Map<string, ExpenseItem[]>();

  items.forEach((e) => {
    // Only consider items explicitly marked recurring OR with merchant+category pattern
    const key = `${e.category}::${e.merchant?.toLowerCase() || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  });

  const patterns: RecurringPattern[] = [];

  for (const [key, txs] of groups) {
    if (txs.length < 2) continue;

    // Check if explicitly recurring
    const hasRecurringFlag = txs.some((t) => t.recurring);

    // Check monthly pattern: transactions in 2+ distinct months
    const months = new Set(txs.map((t) => (t.date || '').slice(0, 7)));
    if (months.size < 2 && !hasRecurringFlag) continue;

    // Compute average amount
    const avgAmount = txs.reduce((s, t) => s + t.amount, 0) / txs.length;

    // Check amount consistency (coefficient of variation < 0.3 for monthly)
    if (txs.length >= 3 && !hasRecurringFlag) {
      const mean = avgAmount;
      const variance = txs.reduce((s, t) => s + (t.amount - mean) ** 2, 0) / txs.length;
      const cv = Math.sqrt(variance) / mean;
      if (cv > 0.5) continue; // Too variable to be recurring
    }

    const [cat, merchant] = key.split('::');
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

export function computeStreaks(items: ExpenseItem[], now: Date): SpendingStreak[] {
  const today = ymdLocal(now);
  const txDates = new Set(items.map((e) => e.date));
  const streaks: SpendingStreak[] = [];

  // Logging streak: consecutive days with at least one transaction (ending today or yesterday)
  let loggingCurrent = 0;
  let loggingLongest = 0;
  let consecutive = 0;
  const d = new Date(now);
  for (let i = 0; i < 365; i++) {
    const dateStr = ymdLocal(d);
    if (txDates.has(dateStr)) {
      consecutive++;
      if (i === 0 || (i === 1 && !txDates.has(today))) {
        // Still in current streak
      }
    } else {
      if (i === 0) {
        // Today has no transactions — check if yesterday started
        // Continue loop
      } else {
        if (loggingCurrent === 0 && consecutive > 0) loggingCurrent = consecutive;
        loggingLongest = Math.max(loggingLongest, consecutive);
        consecutive = 0;
        if (loggingCurrent > 0) break; // Found the current streak boundary
      }
    }
    d.setDate(d.getDate() - 1);
  }
  loggingLongest = Math.max(loggingLongest, consecutive);
  if (loggingCurrent === 0) loggingCurrent = consecutive;

  streaks.push({
    type: 'logging',
    current: loggingCurrent,
    longest: loggingLongest,
    label: loggingCurrent > 0
      ? `${loggingCurrent} day${loggingCurrent > 1 ? 's' : ''} logging`
      : 'Start logging daily',
  });

  // No-spend streak: consecutive days without spending
  let noSpendCurrent = 0;
  const d2 = new Date(now);
  for (let i = 0; i < 90; i++) {
    if (txDates.has(ymdLocal(d2))) break;
    noSpendCurrent++;
    d2.setDate(d2.getDate() - 1);
  }
  if (noSpendCurrent > 0) {
    streaks.push({
      type: 'no_spend',
      current: noSpendCurrent,
      longest: noSpendCurrent, // Would need full history for true longest
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
  monthlyBudget: number,
  catMeta: Map<string, CatMeta>,
  now: Date,
): SpendingInsight[] {
  const insights: SpendingInsight[] = [];
  const curItems = items.filter((e) => (e.date || '').startsWith(currentMonth));
  const totalSpent = curItems.reduce((s, e) => s + e.amount, 0);

  if (curItems.length === 0) return insights;

  // 1. Weekend vs weekday spending
  const weekendSpend = curItems
    .filter((e) => { const d = new Date(e.date + 'T00:00:00'); const dow = d.getDay(); return dow === 0 || dow === 6; })
    .reduce((s, e) => s + e.amount, 0);
  const weekendPct = totalSpent > 0 ? (weekendSpend / totalSpent) * 100 : 0;
  if (weekendPct > 40 && curItems.length >= 5) {
    insights.push({
      id: 'weekend_heavy',
      tone: 'info',
      title: 'Weekend spender',
      body: `${Math.round(weekendPct)}% of your spending happens on weekends. Planning weekend activities ahead of time can help.`,
      icon: 'clock',
    });
  }

  // 2. Largest single transaction
  const maxTx = curItems.reduce((max, e) => e.amount > max.amount ? e : max, curItems[0]);
  if (maxTx && totalSpent > 0 && (maxTx.amount / totalSpent) > 0.25) {
    insights.push({
      id: 'large_tx',
      tone: 'info',
      title: 'Big ticket item',
      body: `Your largest transaction (${maxTx.merchant || maxTx.note || catMeta.get(maxTx.category)?.l || 'Unknown'}) accounts for ${Math.round((maxTx.amount / totalSpent) * 100)}% of this month's spending.`,
      icon: 'trending',
    });
  }

  // 3. Category concentration
  const byCat: Record<string, number> = {};
  curItems.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const catEntries = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  if (catEntries.length >= 3 && totalSpent > 0) {
    const topPct = (catEntries[0][1] / totalSpent) * 100;
    if (topPct > 50) {
      const catLabel = catMeta.get(catEntries[0][0])?.l ?? catEntries[0][0];
      insights.push({
        id: 'concentrated',
        tone: 'info',
        title: 'Spending concentrated',
        body: `${catLabel} makes up ${Math.round(topPct)}% of your monthly spend. Diversifying helps reduce vulnerability to single-category spikes.`,
        icon: 'pie',
      });
    }
  }

  // 4. Budget pace
  if (monthlyBudget > 0) {
    const [, mo] = currentMonth.split('-').map(Number);
    const daysInMonth = new Date(Number(currentMonth.split('-')[0]), mo, 0).getDate();
    const dayOfMonth = now.getDate();
    const expectedPct = (dayOfMonth / daysInMonth) * 100;
    const actualPct = (totalSpent / monthlyBudget) * 100;

    if (actualPct > expectedPct + 15 && dayOfMonth > 5) {
      insights.push({
        id: 'pace_fast',
        tone: 'warn',
        title: 'Spending ahead of pace',
        body: `You've used ${Math.round(actualPct)}% of your budget but only ${Math.round(expectedPct)}% of the month has passed. Consider slowing down.`,
        icon: 'warn',
      });
    } else if (actualPct < expectedPct - 20 && dayOfMonth > 10) {
      insights.push({
        id: 'pace_good',
        tone: 'ok',
        title: 'Under budget pace',
        body: `You've used only ${Math.round(actualPct)}% of your budget with ${Math.round(100 - expectedPct)}% of the month left. Great discipline.`,
        icon: 'check',
      });
    }
  }

  // 5. Recurring expenses summary
  const recurringItems = curItems.filter((e) => e.recurring);
  if (recurringItems.length > 0) {
    const recurringTotal = recurringItems.reduce((s, e) => s + e.amount, 0);
    const recurringPct = totalSpent > 0 ? (recurringTotal / totalSpent) * 100 : 0;
    if (recurringPct > 60) {
      insights.push({
        id: 'recurring_heavy',
        tone: 'info',
        title: 'Fixed costs dominant',
        body: `${Math.round(recurringPct)}% of spending is recurring. Review subscriptions and contracts annually to catch unused services.`,
        icon: 'refresh',
      });
    }
  }

  // 6. Month-over-month comparison
  const [cy, cm] = currentMonth.split('-').map(Number);
  const prevDate = new Date(cy, cm - 2, 1);
  const prevMonthKey = prevDate.getFullYear() + '-' + String(prevDate.getMonth() + 1).padStart(2, '0');
  const prevItems = items.filter((e) => (e.date || '').startsWith(prevMonthKey));
  const prevTotal = prevItems.reduce((s, e) => s + e.amount, 0);

  if (prevTotal > 0 && totalSpent > 0) {
    const changePct = ((totalSpent - prevTotal) / prevTotal) * 100;
    if (changePct > 25) {
      insights.push({
        id: 'mom_up',
        tone: 'warn',
        title: 'Spending up from last month',
        body: `You're spending ${Math.round(changePct)}% more than ${monthLabel(prevMonthKey)}. Check if there's a one-off or a new pattern forming.`,
        icon: 'arrow-up',
      });
    } else if (changePct < -15) {
      insights.push({
        id: 'mom_down',
        tone: 'ok',
        title: 'Spending down',
        body: `You're spending ${Math.round(Math.abs(changePct))}% less than ${monthLabel(prevMonthKey)}. Keep it up.`,
        icon: 'trending',
      });
    }
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
  const byCat: Record<string, number> = {};
  items.forEach((e) => { byCat[e.category] = (byCat[e.category] || 0) + e.amount; });
  const topCatEntry = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0];
  const topCategory = topCatEntry
    ? { key: topCatEntry[0], label: catMeta.get(topCatEntry[0])?.l ?? topCatEntry[0], total: topCatEntry[1] }
    : null;

  // Recurring monthly estimate
  const recurringMonthly = items
    .filter((e) => e.recurring)
    .reduce((s, e) => {
      // Estimate monthly: if there are multiple months, average; otherwise use amount
      return s + e.amount;
    }, 0) / Math.max(monthsTracked, 1);

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
  monthlyBudget = 0,
): MonthForecast {
  const nowMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const isCurrentMonth = month === nowMonth;
  const [y, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const daysElapsed = isCurrentMonth ? Math.max(1, now.getDate()) : daysInMonth;

  const monthItems = items.filter((e) => (e.date || '').slice(0, 7) === month);
  const spentSoFar = monthItems.reduce((s, e) => s + e.amount, 0);
  const dailyRunRate = spentSoFar / daysElapsed;
  const projected = isCurrentMonth ? Math.round(dailyRunRate * daysInMonth) : Math.round(spentSoFar);
  const vsBudgetPct = monthlyBudget > 0 ? Math.round((projected / monthlyBudget) * 100) : null;

  return {
    isCurrentMonth,
    daysElapsed,
    daysInMonth,
    spentSoFar,
    dailyRunRate,
    projected,
    vsBudgetPct,
    overBudget: monthlyBudget > 0 && projected > monthlyBudget,
  };
}
