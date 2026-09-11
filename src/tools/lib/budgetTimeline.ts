/**
 * Budget timeline — how spending accumulates against the plan over time.
 *
 * Three views of the same question, "am I ahead of or behind my budget?":
 *
 *   daily    every day of the selected month
 *   weekly   four weeks of the selected month (the last absorbs the remainder,
 *            so a 31-day month reads as Week 1–4 rather than a 3-day stub week)
 *   monthly  the trailing 12 months ending at the selected month
 *
 * Every granularity shares the same semantics, so switching between them never
 * changes what a line means:
 *
 *   cumulative     spend from the start of the timeline to the end of the period
 *   budgetLine     the straight-line pace — what cumulative spend *would* be if
 *                  the budget were consumed evenly across the timeline's days
 *   projected      cumulative spend at the current run-rate, carried forward
 *                  through the periods that have not happened yet
 *   cumulativePct  cumulative ÷ the timeline's whole budget, as a percentage
 *                  (so the last period of an exactly-on-budget month reads 100%)
 *
 * Pure and side-effect free: `now` is passed in, never read from the clock, so
 * the same inputs always produce the same timeline.
 *
 * No financial formula is changed here. Spend totals are the same sums
 * `computeDashboard` already performs; this module only groups them by period.
 */

import { isSpendingCategory, migrateCategory, splitOutflow, type ExpenseItem } from './expense';
import type { CatMeta, MonthForecast } from './expenseAnalytics';
import { classifySpendTiming, type CategoryTiming } from './spendShape';
import { ymdLocal, ymLocal } from '../../lib/date';
import { monthLabel } from './month';

export type Granularity = 'daily' | 'weekly' | 'monthly';
export const GRANULARITIES: readonly Granularity[] = ['daily', 'weekly', 'monthly'];

export interface TimelinePoint {
  /** Stable identity for React keys and chart lookups. */
  key: string;
  /** Compact axis label ("12", "Week 2", "Mar"). */
  label: string;
  /** Full label for tooltips and the text alternative ("12 March 2026"). */
  fullLabel: string;
  /** First day of the period, YYYY-MM-DD. */
  start: string;
  /** Last day of the period, YYYY-MM-DD, inclusive. */
  end: string;
  /** Spend inside this period alone. */
  spent: number;
  /** Spend from the start of the timeline through the end of this period. */
  cumulative: number;
  /** `cumulative` as a share of the timeline's whole budget; null with no budget. */
  cumulativePct: number | null;
  /** Even-pace budget consumed by the end of this period; null with no budget. */
  budgetLine: number | null;
  /** Cumulative spend projected at the current run-rate; null when nothing to project. */
  projected: number | null;
  txCount: number;
  /** True once the period begins after `now` — nothing has been spent here yet. */
  isFuture: boolean;
  /** True when this period's own spend is unusually high for this timeline. */
  isAnomaly: boolean;
}

export interface Timeline {
  granularity: Granularity;
  /** The month the timeline is anchored to (its last month, for `monthly`). */
  month: string;
  /** Budget for the whole timeline — one month, or twelve months summed. */
  totalBudget: number;
  points: TimelinePoint[];
  totalSpent: number;
  /** Projected end-of-timeline spend at the current run-rate; null when complete. */
  projectedTotal: number | null;
  /** Spend above which a period counts as unusually high; null when undetectable. */
  anomalyThreshold: number | null;
  /** True when `now` falls inside the timeline, so pacing and projection apply. */
  inProgress: boolean;
  /** Savings left out, and bills paced on their due day. See `TimelineShape`. */
  spendingOnly: boolean;
}

/** Total monthly budget for a given YYYY-MM. Supplied by the caller. */
export type BudgetLookup = (month: string) => number;

const DAY_MS = 86_400_000;

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

function dayKey(month: string, day: number): string {
  return `${month}-${String(day).padStart(2, '0')}`;
}

function addMonths(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return ymLocal(d);
}

/** Whole days from `from` to `to`, inclusive of both ends. */
function inclusiveDays(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00').getTime();
  const b = new Date(to + 'T00:00:00').getTime();
  return Math.max(0, Math.round((b - a) / DAY_MS) + 1);
}

/** Period boundaries before any spend is attached. */
interface Bucket {
  key: string;
  label: string;
  fullLabel: string;
  start: string;
  end: string;
}

function dailyBuckets(month: string): Bucket[] {
  const total = daysInMonth(month);
  const label = monthLabel(month);
  const out: Bucket[] = [];
  for (let d = 1; d <= total; d++) {
    const date = dayKey(month, d);
    out.push({ key: date, label: String(d), fullLabel: `${d} ${label}`, start: date, end: date });
  }
  return out;
}

/**
 * Four weeks per month. Weeks 1–3 are exactly seven days; week 4 runs from day
 * 22 to the end of the month, which is how people actually talk about "the last
 * week of the month". The budget line is computed from real elapsed days, so the
 * longer final week is paced correctly rather than being treated as seven days.
 */
function weeklyBuckets(month: string): Bucket[] {
  const total = daysInMonth(month);
  const label = monthLabel(month);
  const out: Bucket[] = [];
  for (let w = 0; w < 4; w++) {
    const first = w * 7 + 1;
    if (first > total) break;
    const last = w === 3 ? total : Math.min(total, first + 6);
    out.push({
      key: `${month}-w${w + 1}`,
      label: `Week ${w + 1}`,
      fullLabel: `Week ${w + 1} of ${label} (${first}–${last})`,
      start: dayKey(month, first),
      end: dayKey(month, last),
    });
  }
  return out;
}

function monthlyBuckets(endMonth: string, count = 12): Bucket[] {
  const out: Bucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const m = addMonths(endMonth, -i);
    const full = monthLabel(m);
    out.push({
      key: m,
      label: full.split(' ')[0].slice(0, 3),
      fullLabel: full,
      start: `${m}-01`,
      end: dayKey(m, daysInMonth(m)),
    });
  }
  return out;
}

/**
 * Flag periods whose own spend sits more than 1.5 standard deviations above the
 * mean of the periods that have actually happened. Needs at least three such
 * periods — below that, "unusual" has no meaning and every spike would be one.
 */
function anomalyThresholdOf(spends: number[]): number | null {
  const active = spends.filter((v) => v > 0);
  if (active.length < 3) return null;
  const mean = active.reduce((s, v) => s + v, 0) / active.length;
  const variance = active.reduce((s, v) => s + (v - mean) ** 2, 0) / active.length;
  const sd = Math.sqrt(variance);
  if (sd <= 0) return null;
  return mean + 1.5 * sd;
}

/**
 * What turns the timeline from "all outflow against the whole budget" into
 * "spending against the spending plan", the way every other figure on the same
 * screen already reads.
 *
 * WHY IT EXISTS. Without it, the timeline divided everything spent by the days
 * elapsed and multiplied back by the month — rent and the SIP included. On the
 * 4th, with rent and a SIP paid on time, it said "At this rate you'd finish
 * about ₹1.6 lakh over budget" directly beneath a forecast card that correctly
 * said "comfortably on track": two month-end figures, one screen, one of them
 * built from the user doing the right thing on time. The same even-pace line
 * called the rent payment "ahead of pace", and flagged rent day as "unusually
 * high spending".
 *
 * With a shape:
 *   - savings, investments and transfers are left out of both sides, exactly as
 *     the forecast and the daily allowance leave them out;
 *   - the plan line steps up on the day each scheduled bill falls due, and
 *     accrues the rest of the plan evenly (`classifySpendTiming`);
 *   - the projection is the month-end forecast's own — same rate for the days
 *     ahead, same bills still to come — so the chart's last point IS the card's
 *     headline figure;
 *   - "unusually high" is judged on day-to-day spending, so a bill landing on
 *     its due date is not an anomaly.
 *
 * Optional, so a caller without category metadata keeps the plain behaviour.
 */
export interface TimelineShape {
  catMeta: ReadonlyMap<string, CatMeta>;
  /** Each month's plan, per category key. */
  budgetValsOf: (month: string) => Readonly<Record<string, number>>;
  /** The month-end forecast for the timeline's month, when that month is running. */
  forecast: MonthForecast | null;
}

/**
 * Build the timeline. `budgetOf` supplies the total monthly budget for any
 * month, so the twelve-month view paces against each month's real plan rather
 * than repeating the current one. `shape` is described above.
 */
export function computeTimeline(
  items: ExpenseItem[],
  month: string,
  granularity: Granularity,
  budgetOf: BudgetLookup,
  now: Date,
  shape?: TimelineShape,
): Timeline {
  const buckets =
    granularity === 'daily' ? dailyBuckets(month)
      : granularity === 'weekly' ? weeklyBuckets(month)
        : monthlyBuckets(month);

  const validKeys = shape ? new Set(shape.catMeta.keys()) : null;
  const ledger = shape && validKeys
    ? splitOutflow(items, validKeys, shape.catMeta).consumed
    : items;
  const budgetFor: BudgetLookup = shape && validKeys
    ? (m) => spendableBudgetOf(shape.budgetValsOf(m), shape.catMeta)
    : budgetOf;

  const months = granularity === 'monthly'
    ? buckets.map((b) => b.key)
    : [month];
  const totalBudget = months.reduce((s, m) => s + Math.max(0, budgetFor(m) || 0), 0);

  const first = buckets[0]?.start ?? `${month}-01`;
  const last = buckets[buckets.length - 1]?.end ?? `${month}-01`;
  const totalDays = inclusiveDays(first, last);

  // Inside one month, scheduled bills have a day. Across twelve they are just
  // part of each month's total, and the plain arithmetic is already right.
  const inMonth = shape && granularity !== 'monthly';
  const timing = inMonth
    ? classifySpendTiming(items, [...shape.catMeta.values()].map((c) => ({ k: c.k, section: c.section })), month)
    : null;
  const isFixed = (e: ExpenseItem) =>
    timing != null && validKeys != null && timing.get(migrateCategory(e.category, validKeys))?.shape === 'fixed';

  const keyFor = (date: string) => (granularity === 'monthly'
    ? date.slice(0, 7)
    : granularity === 'daily'
      ? date
      : `${month}-w${Math.min(4, Math.floor((Number(date.slice(8, 10)) - 1) / 7) + 1)}`);

  // Sum spend into its period. One pass over the transactions, one lookup each.
  const spent = new Map<string, number>();
  const dayToDay = new Map<string, number>();
  const txCount = new Map<string, number>();
  for (const e of ledger) {
    const date = e.date || '';
    if (date < first || date > last) continue;
    const key = keyFor(date);
    spent.set(key, (spent.get(key) ?? 0) + e.amount);
    if (!isFixed(e)) dayToDay.set(key, (dayToDay.get(key) ?? 0) + e.amount);
    txCount.set(key, (txCount.get(key) ?? 0) + 1);
  }

  const today = ymdLocal(now);
  const inProgress = today >= first && today <= last;
  // Elapsed days drive the run-rate. A finished timeline has run its full course.
  const elapsedDays = inProgress ? inclusiveDays(first, today) : today > last ? totalDays : 0;
  const totalSpent = buckets.reduce((s, b) => s + (spent.get(b.key) ?? 0), 0);
  const runRate = elapsedDays > 0 ? totalSpent / elapsedDays : 0;

  // Only periods that have begun can be "unusual"; a future period is empty by
  // definition and would drag the mean down. With a shape, only day-to-day
  // spending is judged: rent landing on its due date is not a spike.
  const judged = inMonth ? dayToDay : spent;
  const startedSpends = buckets.filter((b) => b.start <= today).map((b) => judged.get(b.key) ?? 0);
  const anomalyThreshold = anomalyThresholdOf(startedSpends);

  const planned = inMonth && timing
    ? plannedByDay(month, timing, shape.budgetValsOf(month), shape.catMeta)
    : null;
  const forecast = shape?.forecast && shape.forecast.isCurrentMonth && inProgress ? shape.forecast : null;
  const ahead = inMonth && forecast ? projectedByDay(forecast, now.getDate(), daysInMonth(month)) : null;

  let cumulative = 0;
  const points: TimelinePoint[] = buckets.map((b) => {
    const periodSpent = spent.get(b.key) ?? 0;
    cumulative += periodSpent;
    const isFuture = b.start > today;
    const elapsedAtEnd = Math.min(totalDays, inclusiveDays(first, b.end));

    // The projection only continues the line past today; up to today the
    // projection IS the actual, so the two series join without a step.
    const projected = !inProgress ? null
      : !isFuture ? cumulative
        : ahead ? totalSpent + ahead(Number(b.end.slice(8, 10)))
          : totalSpent + runRate * (elapsedAtEnd - elapsedDays);

    return {
      key: b.key,
      label: b.label,
      fullLabel: b.fullLabel,
      start: b.start,
      end: b.end,
      spent: periodSpent,
      cumulative,
      cumulativePct: totalBudget > 0 ? (cumulative / totalBudget) * 100 : null,
      budgetLine: totalBudget <= 0 || totalDays <= 0 ? null
        : planned ? planned(Number(b.end.slice(8, 10)))
          : (totalBudget * elapsedAtEnd) / totalDays,
      projected,
      txCount: txCount.get(b.key) ?? 0,
      isFuture,
      isAnomaly: anomalyThreshold != null && !isFuture && (judged.get(b.key) ?? 0) > anomalyThreshold,
    };
  });

  // The month-end figure. With a forecast it is the forecast's own headline;
  // across twelve months it is the months already closed plus that headline.
  const closedBefore = granularity === 'monthly'
    ? points.slice(0, -1).reduce((s, p) => s + p.spent, 0)
    : 0;
  const projectedTotal = !inProgress || elapsedDays <= 0 ? null
    : forecast ? closedBefore + forecast.projected
      : runRate * totalDays;

  return {
    granularity,
    month,
    totalBudget,
    points,
    totalSpent,
    projectedTotal,
    anomalyThreshold,
    inProgress,
    spendingOnly: Boolean(shape),
  };
}

/** The spending part of a month's plan: every category except money set aside. */
function spendableBudgetOf(
  vals: Readonly<Record<string, number>>,
  catMeta: ReadonlyMap<string, CatMeta>,
): number {
  let total = 0;
  for (const [k, c] of catMeta) {
    if (isSpendingCategory({ k, section: c.section })) total += Math.max(0, Number(vals[k]) || 0);
  }
  return total;
}

/**
 * The plan, as it should stand at the end of each day of `month`.
 *
 * Day-to-day categories accrue evenly. A scheduled bill counts in full from the
 * day it falls due — the day it landed this month, or its usual day — so paying
 * rent on the 1st is on plan rather than "ahead of pace". A bill with no known
 * day keeps the even reading, which is the conservative answer.
 */
function plannedByDay(
  month: string,
  timing: ReadonlyMap<string, CategoryTiming>,
  vals: Readonly<Record<string, number>>,
  catMeta: ReadonlyMap<string, CatMeta>,
): (day: number) => number {
  const days = daysInMonth(month);
  let even = 0;
  const stepped: Array<{ day: number; amount: number }> = [];
  for (const [k, c] of catMeta) {
    if (!isSpendingCategory({ k, section: c.section })) continue;
    const amount = Math.max(0, Number(vals[k]) || 0);
    if (amount <= 0) continue;
    const t = timing.get(k);
    if (t?.shape === 'fixed' && t.dueDay != null) stepped.push({ day: t.dueDay, amount });
    else even += amount;
  }
  return (day) => (even * day) / days
    + stepped.reduce((s, b) => s + (day >= b.day ? b.amount : 0), 0);
}

/**
 * Spending expected between today and the end of `day`, from the month-end
 * forecast: the days ahead at its rate, and each bill still to come on its day.
 *
 * A bill whose usual day has already passed is placed tomorrow — it is late,
 * not cancelled — and one with no known day is spread over the days left. At
 * the month's last day this is exactly `forecast.projected − spentSoFar`.
 */
function projectedByDay(forecast: MonthForecast, todayDay: number, days: number): (day: number) => number {
  const daysLeft = Math.max(0, days - todayDay);
  return (day) => {
    const ahead = Math.max(0, Math.min(day, days) - todayDay);
    let bills = 0;
    for (const b of forecast.stillDue) {
      if (b.dueDay == null) bills += daysLeft > 0 ? (b.amount * ahead) / daysLeft : 0;
      else if (day >= Math.max(b.dueDay, todayDay + 1)) bills += b.amount;
    }
    return forecast.remainingDailyRate * ahead + bills;
  };
}
