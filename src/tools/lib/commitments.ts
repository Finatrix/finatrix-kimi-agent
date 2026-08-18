/**
 * What is still to come this month — and what that leaves free to spend.
 *
 * WHY
 * ---
 * "Daily safe spend" divides the remaining spendable budget by the days left,
 * which silently assumes nothing is already spoken for. It never is: rent, the
 * EMI, the broadband bill and four subscriptions are still to land, and a
 * figure that ignores them tells someone they can spend money that is already
 * gone. This module names those commitments and reports what is genuinely free.
 *
 * It does NOT change the pacing figure. Both are shown, because the difference
 * between them is the insight — the point is to make "already spoken for"
 * visible, not to quietly fold it into a number read at a glance.
 *
 * WHAT COUNTS AS COMMITTED
 * ------------------------
 * A bill counts only when both are true:
 *   • the pattern's usual day of the month is still ahead of today, and
 *   • nothing matching it has been logged in this month yet.
 *
 * A bill whose day has passed without being logged is deliberately NOT counted.
 * It is genuinely ambiguous — paid and unlogged, or missed — and guessing in
 * either direction would put a number on the screen that nobody entered.
 *
 * A recurring SIP or standing transfer is not a bill here. It is money moving,
 * not money spent, and its budget already sits outside the spendable figure
 * this module subtracts from — counting it would take it away twice.
 *
 * Pure and read-only. The detection itself is `detectRecurring`, the Expense
 * Tracker's own model; nothing is re-derived here.
 */
import type { IconName } from '../ui/Icon';
import { isSpendingCategory, type ExpenseItem } from './expense';
import { detectRecurring, type CatMeta } from './expenseAnalytics';

export interface UpcomingBill {
  /** Stable within a render — category plus merchant, which is the pattern's identity. */
  key: string;
  label: string;
  merchant: string | null;
  icon: IconName;
  /** The pattern's estimated monthly amount. */
  amount: number;
  /** Day of the month it usually lands on. */
  day: number;
  /** Projected date, `YYYY-MM-DD`. */
  date: string;
}

export interface CommittedOutlook {
  /** Only a running month has an "outlook"; a past month is settled. */
  applicable: boolean;
  bills: UpcomingBill[];
  /** Sum of `bills`. Zero when none are due. */
  committed: number;
  /** Spendable budget minus commitments. Null when no spending budget is set. */
  free: number | null;
  /** `free` spread over the days left, today included. Null when no budget. */
  freePerDay: number | null;
  /** Days left in the month, today included. */
  daysLeft: number;
}

const EMPTY: CommittedOutlook = {
  applicable: false, bills: [], committed: 0, free: null, freePerDay: null, daysLeft: 0,
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Bills still to come in `month`, and what they leave free.
 *
 * `remainingBudget` is the tracker's own spendable figure (spendable budget −
 * spend against it), passed in rather than recomputed so the two can never
 * disagree.
 */
export function computeCommitments(
  items: readonly ExpenseItem[],
  catMeta: Map<string, CatMeta>,
  month: string,
  now: Date,
  remainingBudget: number | null,
): CommittedOutlook {
  const curMonth = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  if (month !== curMonth) return EMPTY;

  const [y, mo] = month.split('-').map(Number);
  const daysInMonth = new Date(y, mo, 0).getDate();
  const today = now.getDate();
  const daysLeft = Math.max(1, daysInMonth - today + 1);

  const monthItems = items.filter((e) => (e.date || '').slice(0, 7) === month);
  const loggedThisMonth = new Set(
    monthItems.map((e) => `${e.category}|${(e.merchant || '').trim().toLowerCase()}`),
  );
  const loggedCategories = new Set(monthItems.map((e) => e.category));

  const bills: UpcomingBill[] = [];
  for (const pattern of detectRecurring([...items], catMeta)) {
    if (pattern.frequency !== 'monthly') continue;
    // Savings and transfers are already outside `remainingBudget` — see above.
    const section = catMeta.get(pattern.category)?.section ?? null;
    if (!isSpendingCategory({ k: pattern.category, section })) continue;

    const merchantKey = (pattern.merchant || '').trim().toLowerCase();
    const identity = `${pattern.category}|${merchantKey}`;
    // Already paid this month: a merchant-specific pattern needs its own
    // merchant to have been logged; a category-only pattern is satisfied by
    // anything in that category, which is the same rule that formed it.
    if (merchantKey ? loggedThisMonth.has(identity) : loggedCategories.has(pattern.category)) continue;

    const lastDay = Number((pattern.lastDate || '').slice(8, 10));
    if (!Number.isFinite(lastDay) || lastDay < 1) continue;
    const day = Math.min(lastDay, daysInMonth);
    if (day < today) continue; // its day has passed — see the note above

    bills.push({
      key: identity,
      label: pattern.label,
      merchant: pattern.merchant,
      icon: pattern.icon,
      amount: pattern.estimatedMonthly,
      day,
      date: `${month}-${pad(day)}`,
    });
  }

  bills.sort((a, b) => a.day - b.day || b.amount - a.amount);
  const committed = bills.reduce((sum, b) => sum + b.amount, 0);
  const free = remainingBudget === null ? null : remainingBudget - committed;

  return {
    applicable: true,
    bills,
    committed,
    free,
    freePerDay: free === null ? null : free / daysLeft,
    daysLeft,
  };
}
