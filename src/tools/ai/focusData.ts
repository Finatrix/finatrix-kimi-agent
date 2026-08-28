/**
 * The figures behind a focus.
 *
 * `focus.ts` says *what* the user is looking at; this module resolves *what is
 * true about it*, at the moment the question is asked. It carries the same three
 * rules as `context.ts`, for the same reasons:
 *
 *  1. Everything is read from the signed-in user's own local store.
 *  2. **The model never does the arithmetic.** Every figure here comes from the
 *     same pure functions the screens render — `computeDailyHeatmap`,
 *     `computeTimeline` — or from a plain sum over the user's own transactions.
 *     Nothing is a second implementation of a financial formula.
 *  3. Free text the user typed is sanitized before it leaves the device.
 *
 * A focus detail is *additive*: the global snapshot is always sent, and this is
 * the extra depth that a question about one category or one day needs. Keeping
 * it separate is what stops the snapshot from growing a per-category history for
 * forty categories that no single question will ever read.
 *
 * Imported only by the lazy assistant chunk. Pure; `now` is passed in.
 */

import { sanitizeField, sanitizeProse } from '../../lib/sanitize';
import { allCategories } from '../lib/budget';
import { computeDailyHeatmap, type CatMeta } from '../lib/expenseAnalytics';
import { computeTimeline } from '../lib/budgetTimeline';
import { computeDashboard, isSpendingCategory, migrateCategory, type ExpenseItem } from '../lib/expense';
import { monthLabel, prevMonth } from '../lib/month';
import { money, type SnapshotInput } from './context';
import type { AiFocus } from './focus';

/* ── Bounds. Generous enough to answer, small enough that the focus never
      crowds out the snapshot it sits beside. ── */
const HISTORY_MONTHS = 12;
const MAX_FOCUS_TX = 10;
const MAX_BUSIEST_DAYS = 6;
const MAX_TIMELINE_POINTS = 31;
const MAX_TEXT = 60;

/** 0 = Monday, matching `DailyHeatmapDay.dow`. */
const WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;

export type FocusDetail = Record<string, unknown> & { kind: AiFocus['kind'] };

/**
 * Resolve the figures for a focus, or null when the focus needs no detail
 * beyond the snapshot (the overview and the budget plan are already in it).
 */
export function buildFocusDetail(focus: AiFocus, input: SnapshotInput): FocusDetail | null {
  switch (focus.kind) {
    case 'overview':
    case 'budget':
      return null;
    case 'category': return categoryDetail(focus.key, input);
    case 'transaction': return transactionDetail(focus.id, input);
    case 'heatmap': return heatmapDetail(input);
    case 'timeline': return timelineDetail(focus.granularity, input);
    case 'insight':
      return {
        kind: 'insight',
        // Already deterministic text FinatriX generated from the user's own
        // figures and showed on screen. Sanitized anyway: it embeds a merchant
        // name the user typed, which is the usual injection vector.
        observation: sanitizeField(focus.title, MAX_TEXT),
        detail: sanitizeProse(focus.body, 400),
        note: 'This observation was computed by FinatriX from the data below, not by you. Explain the figures that produced it.',
      };
    case 'score':
      return {
        kind: 'score',
        scope: focus.scope,
        // The score itself is computed by FinatriX from the data in the
        // snapshot, exactly like every other figure. It is passed through so
        // the assistant explains the number the user is looking at rather than
        // arriving at its own — the model never scores anything.
        score: focus.score,
        grade: sanitizeField(focus.grade, 40),
        summary: sanitizeProse(focus.summary, 400),
        note: focus.scope === 'plan'
          ? 'FinatriX scored this BUDGET on four components: savings commitment (30%), realism against the user\u2019s own spending history (25%), coverage and coherence (25%) and discretionary share (20%). Every input is a ratio, never an amount, so the scale is the same at any income. Explain it from the figures below; never recompute it or offer a different number.'
          : 'FinatriX scored this MONTH on four components: budget fidelity (35%), savings rate (25%), discretionary restraint measured on wants only (20%) and momentum against the previous month (20%). Every input is a ratio, never an amount. Explain it from the figures below; never recompute it or offer a different number.',
      };
    case 'wallet':
      return {
        kind: 'wallet',
        note: 'The wallet is the running total of (budget \u2212 spent) for every category across the financial year so far, with savings measured the other way up. A positive balance is budget the user set aside and did not need; a negative one is an overspend still to make up. Only months that carry a budget are counted. Answer from the monthly figures in the data below.',
      };
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   Category — one category's month, its history, and what is in it.
   ══════════════════════════════════════════════════════════════════════════ */

function categoryDetail(key: string, input: SnapshotInput): FocusDetail {
  const { items, cats, budgetStore, month, now } = input;
  const flat = allCategories(cats);
  const meta = new Map<string, CatMeta>(flat.map((c) => [c.k, c]));
  const validKeys = new Set(flat.map((c) => c.k));
  const label = sanitizeField(meta.get(key)?.l ?? key, MAX_TEXT);

  const monthData = budgetStore[month];
  const income = Math.max(0, Number(monthData?.income) || 0);
  const dash = computeDashboard(month, items, cats, monthData?.vals ?? {}, now, income);
  const row = dash.categories.find((c) => c.k === key) ?? null;

  // One pass, bucketed by month key — the same "sum this category's amounts in
  // this month" the category rows themselves display.
  //
  // Membership is decided by `migrateCategory`, the same rule `computeDashboard`
  // used to build `row` above. Comparing the RAW stored key here meant a
  // category holding legacy-keyed transactions sent the model a block that
  // contradicted itself — `spent: 0` beside a `remaining` computed from a real
  // five-figure spend — and the model can only report what the block says.
  const byMonth = new Map<string, { spent: number; txCount: number }>();
  const catItems: ExpenseItem[] = [];
  for (const e of items) {
    if (migrateCategory(e.category, validKeys) !== key) continue;
    catItems.push(e);
    const mk = (e.date || '').slice(0, 7);
    const bucket = byMonth.get(mk) ?? { spent: 0, txCount: 0 };
    bucket.spent += e.amount;
    bucket.txCount += 1;
    byMonth.set(mk, bucket);
  }

  const history = monthKeysEndingAt(month, HISTORY_MONTHS).map((mk) => {
    const b = byMonth.get(mk) ?? { spent: 0, txCount: 0 };
    return { month: mk, label: monthLabel(mk), spent: money(b.spent), txCount: b.txCount };
  });

  const monthsWithData = history.filter((h) => h.txCount > 0);
  const averageMonthlySpend = monthsWithData.length > 0
    ? money(monthsWithData.reduce((s, h) => s + h.spent, 0) / monthsWithData.length)
    : null;

  const prev = prevMonth(month);
  const prevBucket = byMonth.get(prev);
  const thisSpent = byMonth.get(month)?.spent ?? 0;

  const monthItems = catItems.filter((e) => (e.date || '').slice(0, 7) === month);
  const transactions = [...monthItems]
    .sort((a, b) => b.amount - a.amount)
    .slice(0, MAX_FOCUS_TX)
    .map((e) => ({
      date: e.date,
      amount: money(e.amount),
      description: sanitizeField(e.merchant || e.note || e.notes || '', MAX_TEXT),
    }));

  return {
    kind: 'category',
    name: label,
    budget: row ? money(row.budget) : 0,
    spent: money(thisSpent),
    remaining: row ? money(row.remaining) : null,
    percentOfBudget: row && row.budget > 0 ? Math.round(row.pct) : null,
    // Savings, investments and transfers are money moved, not consumed. The
    // system prompt already forbids calling these "spending"; saying so here
    // too means the model does not have to infer it from the category name.
    isSpending: row ? isSpendingCategory(row) : true,
    shareOfMonthSpendPct: dash.monthlySpent > 0
      ? Math.round((thisSpent / dash.monthlySpent) * 100)
      : null,
    transactionCount: monthItems.length,
    averageMonthlySpend,
    monthsOfHistory: monthsWithData.length,
    previousMonth: prevBucket
      ? {
          label: monthLabel(prev),
          spent: money(prevBucket.spent),
          changePct: prevBucket.spent > 0
            ? Math.round(((thisSpent - prevBucket.spent) / prevBucket.spent) * 100)
            : null,
        }
      : null,
    history,
    largestTransactions: transactions,
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Transaction — one purchase, and the context that makes it judgeable.
   ══════════════════════════════════════════════════════════════════════════ */

function transactionDetail(id: string, input: SnapshotInput): FocusDetail {
  const { items, cats, month } = input;
  const tx = items.find((e) => e.id === id);

  // The panel can outlive the row that opened it — the user may delete the
  // transaction while the conversation is open. Saying so plainly is the whole
  // point of the fail-safe rule; guessing at a deleted purchase is not.
  if (!tx) {
    return {
      kind: 'transaction',
      found: false,
      note: 'This transaction is no longer in the data — it was probably deleted. Say so and do not describe it.',
    };
  }

  const flat = allCategories(cats);
  const meta = new Map<string, CatMeta>(flat.map((c) => [c.k, c]));
  const validKeys = new Set(flat.map((c) => c.k));
  const txKey = migrateCategory(tx.category, validKeys);
  const label = sanitizeField(meta.get(txKey)?.l ?? tx.category, MAX_TEXT);

  // Peers are resolved the same way, so "is this unusually expensive for this
  // category" compares against every row the dashboard files under it.
  const sameCategory = items.filter((e) => migrateCategory(e.category, validKeys) === txKey);
  const categoryAverage = sameCategory.length > 0
    ? sameCategory.reduce((s, e) => s + e.amount, 0) / sameCategory.length
    : 0;

  const monthItems = items.filter((e) => (e.date || '').slice(0, 7) === month);
  const monthTotal = monthItems.reduce((s, e) => s + e.amount, 0);
  // 1 = the largest transaction of the month.
  const rankInMonth = monthItems.filter((e) => e.amount > tx.amount).length + 1;

  return {
    kind: 'transaction',
    found: true,
    date: tx.date,
    amount: money(tx.amount),
    category: label,
    description: sanitizeField(tx.merchant || tx.note || tx.notes || '', MAX_TEXT),
    paymentMethod: sanitizeField(tx.paymentMethod ?? '', 40) || null,
    markedRecurring: tx.recurring === true,
    shareOfMonthSpendPct: monthTotal > 0 ? Math.round((tx.amount / monthTotal) * 100) : null,
    rankInMonth,
    transactionsThisMonth: monthItems.length,
    categoryComparison: {
      averageTransaction: money(categoryAverage),
      transactionsInCategory: sameCategory.length,
      // How far above or below this category's own average this one sits — the
      // only honest basis for "was this unusually expensive".
      differenceFromAveragePct: categoryAverage > 0
        ? Math.round(((tx.amount - categoryAverage) / categoryAverage) * 100)
        : null,
    },
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Heatmap — which days money left the account.
   ══════════════════════════════════════════════════════════════════════════ */

function heatmapDetail(input: SnapshotInput): FocusDetail {
  const { items, month } = input;
  const days = computeDailyHeatmap(items, month);
  const withSpend = days.filter((d) => d.amount > 0);

  const byWeekday = WEEKDAY.map((name, dow) => {
    const rows = days.filter((d) => d.dow === dow);
    return {
      weekday: name,
      total: money(rows.reduce((s, d) => s + d.amount, 0)),
      daysCounted: rows.length,
    };
  });

  const weekendTotal = days
    .filter((d) => d.dow >= 5)
    .reduce((s, d) => s + d.amount, 0);
  const total = days.reduce((s, d) => s + d.amount, 0);

  return {
    kind: 'heatmap',
    month,
    monthName: monthLabel(month),
    daysWithSpending: withSpend.length,
    daysWithoutSpending: days.length - withSpend.length,
    busiestDays: [...withSpend]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, MAX_BUSIEST_DAYS)
      .map((d) => ({
        date: d.date,
        weekday: WEEKDAY[d.dow],
        amount: money(d.amount),
        txCount: d.txCount,
      })),
    byWeekday,
    weekendTotal: money(weekendTotal),
    weekdayTotal: money(total - weekendTotal),
    weekendSharePct: total > 0 ? Math.round((weekendTotal / total) * 100) : null,
    // Every day with any spend, so "which week was highest" is answerable
    // without the model inventing days it cannot see.
    dailySpend: withSpend.map((d) => ({
      date: d.date,
      weekday: WEEKDAY[d.dow],
      weekOfMonth: d.week + 1,
      amount: money(d.amount),
      txCount: d.txCount,
    })),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Timeline — spend accumulating against the plan.
   ══════════════════════════════════════════════════════════════════════════ */

function timelineDetail(
  granularity: 'daily' | 'weekly' | 'monthly',
  input: SnapshotInput,
): FocusDetail {
  const { items, budgetStore, month, now } = input;

  // The same budget lookup the chart itself paces against, so a twelve-month
  // timeline uses each month's real plan rather than repeating this one.
  const budgetOf = (m: string) => {
    const vals = budgetStore[m]?.vals ?? {};
    return Object.values(vals).reduce((s, v) => s + (Number(v) || 0), 0);
  };

  const t = computeTimeline(items, month, granularity, budgetOf, now);

  return {
    kind: 'timeline',
    granularity: t.granularity,
    month: t.month,
    monthName: monthLabel(t.month),
    totalBudget: money(t.totalBudget),
    totalSpent: money(t.totalSpent),
    projectedTotal: t.projectedTotal == null ? null : money(t.projectedTotal),
    inProgress: t.inProgress,
    // Above this, a period counts as unusually high. Given so the model can say
    // "unusual" only where the data already says it.
    anomalyThreshold: t.anomalyThreshold == null ? null : money(t.anomalyThreshold),
    points: t.points.slice(0, MAX_TIMELINE_POINTS).map((p) => ({
      label: p.fullLabel,
      spent: money(p.spent),
      cumulative: money(p.cumulative),
      cumulativePct: p.cumulativePct == null ? null : Math.round(p.cumulativePct),
      evenPaceBudget: p.budgetLine == null ? null : money(p.budgetLine),
      txCount: p.txCount,
      isUnusuallyHigh: p.isAnomaly,
      isFuture: p.isFuture,
    })),
  };
}

/* ── Shared ── */

/** `count` month keys ending at `endMonth`, oldest first. */
function monthKeysEndingAt(endMonth: string, count: number): string[] {
  const keys: string[] = [];
  let m = endMonth;
  for (let i = 0; i < count; i++) {
    keys.unshift(m);
    m = prevMonth(m);
  }
  return keys;
}
