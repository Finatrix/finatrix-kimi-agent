/**
 * Monthly money story — the facts behind the five recap cards.
 *
 * Pure and free of storage and React. It owns the ONE piece of new maths the
 * story adds (comparing a month with the month before it); everything else is
 * the existing engine, called unchanged:
 *  - `splitOutflow` separates money consumed (needs, wants) from money set aside
 *    (savings, investments, transfers) — the same basis the dashboard's trend
 *    insight uses, so the story never calls a bigger SIP "higher spending".
 *  - `computeCategoryComparison` gives every category's amount this month and
 *    last month.
 *
 * Rules agreed with the owner (24 Nov 2026):
 *  - Only a COMPLETED month is ever recapped, and it is compared with the
 *    calendar month before it. A month still running would show false drops
 *    ("spending down 60%" on the 10th).
 *  - Top category is a whole-percent share of consumed spending; savings are
 *    never counted as spending.
 *  - Biggest change = the largest absolute change across spending categories,
 *    ignoring changes under 2% of the previous month's consumed total. A
 *    category with nothing the month before is "new", with no percentage.
 *  - Overall change is left out when the previous month has no spending.
 *  - "Saved" is the set-aside total; its up/down % shows only when the previous
 *    month's set-aside was above zero. There is no savings RATE: income is one
 *    budget number, not stored per month.
 */
import { ymLocal } from '../../lib/date';
import type { IconName } from '../ui/Icon';
import { computeCategoryComparison, type CatMeta } from './expenseAnalytics';
import { isSpendingCategory, splitOutflow, type ExpenseItem } from './expense';
import { monthLabel, prevMonth } from './month';

/** A change smaller than this share of last month's spending is noise. */
export const NOISE_SHARE = 0.02;

export interface StoryCategory {
  key: string;
  label: string;
  icon: IconName;
  amount: number;
  /** Whole percent of this month's consumed spending. */
  sharePct: number;
}

export interface StoryChange {
  key: string;
  label: string;
  icon: IconName;
  current: number;
  previous: number;
  /** Signed, this month minus last month. */
  change: number;
  direction: 'up' | 'down' | 'new';
  /** Whole percent, always positive; null for a "new" category (nothing to compare with). */
  pct: number | null;
}

export interface MoneyStory {
  month: string;
  monthName: string;
  prevMonth: string;
  prevMonthName: string;
  /** Needs + wants this month. */
  consumedTotal: number;
  /** Whole percent vs last month's consumed total, signed; null without a comparison. */
  overallPct: number | null;
  topCategory: StoryCategory | null;
  biggestChange: StoryChange | null;
  /** True when last month had spending to compare with. */
  hasComparison: boolean;
  saved: {
    amount: number;
    previous: number;
    /** Whole percent, signed; null unless last month's set-aside was above zero. */
    pct: number | null;
  };
}

/** Whole-percent rounding used by every figure in the story. */
function pct(part: number, whole: number): number {
  return Math.round((part / whole) * 100);
}

/**
 * The most recent month that has finished and has at least one transaction, or
 * null. "Finished" means strictly before the month `now` falls in.
 */
export function latestCompletedMonth(items: readonly ExpenseItem[], now: Date): string | null {
  const thisMonth = ymLocal(now);
  let best: string | null = null;
  for (const e of items) {
    const ym = (e.date || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(ym) || ym >= thisMonth) continue;
    if (best === null || ym > best) best = ym;
  }
  return best;
}

/**
 * The story for `month`, compared with the calendar month before it. `catMeta`
 * should be the category set in force for `month` (`loadCatViewFor(month)`).
 * Callers pass a completed month from `latestCompletedMonth`.
 */
export function buildMoneyStory(
  items: readonly ExpenseItem[],
  month: string,
  catMeta: Map<string, CatMeta>,
): MoneyStory {
  const prev = prevMonth(month);
  const validKeys = new Set(catMeta.keys());
  const inMonth = (ym: string) => items.filter((e) => (e.date || '').startsWith(ym));

  const cur = splitOutflow(inMonth(month), validKeys, catMeta);
  const before = splitOutflow(inMonth(prev), validKeys, catMeta);

  const hasComparison = before.consumedTotal > 0;
  const overallPct = hasComparison
    ? pct(cur.consumedTotal - before.consumedTotal, before.consumedTotal)
    : null;

  // Spending categories only, resolved by the comparison engine through the
  // same migrateCategory as everything else.
  const spending = computeCategoryComparison([...items], month, catMeta)
    .filter((c) => isSpendingCategory({ k: c.category, section: c.section }));

  const byAmount = (a: { amount: number; label: string }, b: { amount: number; label: string }) =>
    b.amount - a.amount || a.label.localeCompare(b.label);

  const topRow = spending
    .filter((c) => c.currentMonth > 0)
    .map((c) => ({ c, amount: c.currentMonth, label: c.label }))
    .sort(byAmount)[0];
  const topCategory: StoryCategory | null = topRow && cur.consumedTotal > 0
    ? {
        key: topRow.c.category,
        label: topRow.c.label,
        icon: topRow.c.icon,
        amount: topRow.amount,
        sharePct: pct(topRow.amount, cur.consumedTotal),
      }
    : null;

  let biggestChange: StoryChange | null = null;
  if (hasComparison) {
    const floor = before.consumedTotal * NOISE_SHARE;
    const changed = spending
      .filter((c) => Math.abs(c.change) >= floor && c.change !== 0)
      .sort((a, b) => Math.abs(b.change) - Math.abs(a.change)
        || b.currentMonth - a.currentMonth
        || a.label.localeCompare(b.label))[0];
    if (changed) {
      const isNew = changed.previousMonth === 0;
      biggestChange = {
        key: changed.category,
        label: changed.label,
        icon: changed.icon,
        current: changed.currentMonth,
        previous: changed.previousMonth,
        change: changed.change,
        direction: isNew ? 'new' : changed.change > 0 ? 'up' : 'down',
        pct: isNew ? null : Math.abs(pct(changed.change, changed.previousMonth)),
      };
    }
  }

  return {
    month,
    monthName: monthLabel(month),
    prevMonth: prev,
    prevMonthName: monthLabel(prev),
    consumedTotal: cur.consumedTotal,
    overallPct,
    topCategory,
    biggestChange,
    hasComparison,
    saved: {
      amount: cur.setAsideTotal,
      previous: before.setAsideTotal,
      pct: before.setAsideTotal > 0 ? pct(cur.setAsideTotal - before.setAsideTotal, before.setAsideTotal) : null,
    },
  };
}

/* ── Card copy ───────────────────────────────────────────────────────────── */

export type CardTone = 'neutral' | 'good' | 'calm';

export interface StoryCard {
  id: 'overview' | 'top' | 'change' | 'saved' | 'close';
  kicker: string;
  headline: string;
  detail: string;
  tone: CardTone;
  icon: IconName | null;
}

/**
 * The five cards in plain words. `money` formats an amount; pass null to hide
 * every amount — the default for the shared image, so a screenshot posted
 * online never carries the user's figures.
 */
export function buildStoryCards(
  s: MoneyStory,
  money: ((n: number) => string) | null,
): StoryCard[] {
  const amt = (n: number) => (money ? money(n) : null);
  const withAmt = (text: string, extra: string | null) => (extra ? `${text} ${extra}` : text);
  const cards: StoryCard[] = [];

  // 1 — overview
  const trend = s.overallPct == null
    ? `Here is how ${s.monthName} went.`
    : s.overallPct === 0
      ? `About the same as ${s.prevMonthName}.`
      : `${Math.abs(s.overallPct)}% ${s.overallPct < 0 ? 'less' : 'more'} than ${s.prevMonthName}.`;
  cards.push({
    id: 'overview',
    kicker: s.monthName,
    headline: s.consumedTotal <= 0
      ? 'A quiet month for spending'
      : money ? `You spent ${money(s.consumedTotal)}` : 'Your month at a glance',
    detail: s.consumedTotal <= 0 ? 'No needs or wants logged.' : trend,
    tone: s.overallPct != null && s.overallPct < 0 ? 'good' : 'neutral',
    icon: null,
  });

  // 2 — top category
  cards.push(s.topCategory
    ? {
        id: 'top',
        kicker: 'Top category',
        headline: s.topCategory.label,
        detail: withAmt(`${s.topCategory.sharePct}% of what you spent.`, amt(s.topCategory.amount) && `That is ${amt(s.topCategory.amount)}.`),
        tone: 'neutral',
        icon: s.topCategory.icon,
      }
    : {
        id: 'top',
        kicker: 'Top category',
        headline: 'No spending to rank',
        detail: `Log a few expenses and ${s.monthName}'s biggest category shows up here.`,
        tone: 'calm',
        icon: null,
      });

  // 3 — biggest change, or an invitation to come back
  const c = s.biggestChange;
  if (c) {
    const verb = c.direction === 'up' ? 'rose' : 'fell';
    cards.push(c.direction === 'new'
      ? {
          id: 'change',
          kicker: 'Biggest change',
          headline: `${c.label} is new`,
          detail: withAmt(`Nothing in ${s.prevMonthName}.`, amt(c.current) && `${amt(c.current)} this month.`),
          tone: 'neutral',
          icon: c.icon,
        }
      : {
          id: 'change',
          kicker: 'Biggest change',
          headline: `${c.label} ${verb} ${c.pct}%`,
          detail: money
            ? `From ${money(c.previous)} to ${money(c.current)}.`
            : `Compared with ${s.prevMonthName}.`,
          tone: c.direction === 'down' ? 'good' : 'neutral',
          icon: c.icon,
        });
  } else {
    cards.push({
      id: 'change',
      kicker: 'Biggest change',
      headline: s.hasComparison ? 'Steady month' : 'Come back next month',
      detail: s.hasComparison
        ? `No category moved much from ${s.prevMonthName}.`
        : 'With two full months logged, we can show what changed.',
      tone: 'calm',
      icon: null,
    });
  }

  // 4 — saved
  if (s.saved.amount > 0) {
    const up = s.saved.pct == null ? null : s.saved.pct;
    const compare = up == null
      ? 'Money set aside counts as saved.'
      : up === 0
        ? `The same as ${s.prevMonthName}.`
        : `${Math.abs(up)}% ${up > 0 ? 'more' : 'less'} than ${s.prevMonthName}.`;
    cards.push({
      id: 'saved',
      kicker: 'Saved',
      headline: money ? `You set aside ${money(s.saved.amount)}` : 'You put money aside',
      detail: compare,
      tone: 'good',
      icon: null,
    });
  } else {
    cards.push({
      id: 'saved',
      kicker: 'Saved',
      headline: 'No savings logged',
      detail: 'Log savings and investments to see them here.',
      tone: 'calm',
      icon: null,
    });
  }

  // 5 — close
  cards.push({
    id: 'close',
    kicker: 'That is a wrap',
    headline: `${s.monthName}, done`,
    detail: 'A new month, a fresh start.',
    tone: 'calm',
    icon: null,
  });
  return cards;
}
