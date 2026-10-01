/**
 * Financial calendar data layer. Turns the user's own saved state into
 * time-anchored events — WITHOUT inventing anything:
 *   • Recurring bills come from detectRecurring() over real logged expenses
 *     (the day-of-month is taken from the last real occurrence).
 *   • The investing SIP and goal maturity come straight from readDashboard(),
 *     which itself calls the tools' own compute functions.
 * If a signal isn't backed by real data, it simply doesn't appear. Pure/read-only.
 */
import type { IconName } from '../ui/Icon';
import { loadExpenses } from './expense';
import { allCategories } from './budget';
import { loadCatViewFor } from './budgetCatsMonth';
import { detectRecurring, type CatMeta } from './expenseAnalytics';
import { readDashboard } from './dashboard';
import { getJSON } from './storage';
import { calendarWithContributionDay } from './planningAutomation';
import { validRecordDate } from './recordReview';

export type FinEventType = 'bill' | 'invest' | 'goal';

export interface FinEvent {
  id: string;
  date: string;            // YYYY-MM-DD
  type: FinEventType;
  title: string;
  amount: number | null;
  detail: string;
  icon: IconName;
  accent: string;
  href: string;
}

const TYPE_META: Record<FinEventType, { accent: string; href: string }> = {
  bill: { accent: 'var(--orange)', href: '/tools/expenses' },
  invest: { accent: 'var(--blue)', href: '/tools/investmatch' },
  goal: { accent: 'var(--green)', href: '/tools/goals' },
};

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Days in a given month (month is 1–12). */
function daysInMonth(year: number, month1to12: number): number {
  return new Date(year, month1to12, 0).getDate();
}

function buildCatMeta(month: string): Map<string, CatMeta> {
  // The arrangement that month was planned with — see budgetCatsMonth.ts.
  const cats = loadCatViewFor(month).active;
  const m = new Map<string, CatMeta>();
  allCategories(cats).forEach((c) => m.set(c.k, { k: c.k, l: c.l, ic: c.ic, section: c.section }));
  return m;
}

/**
 * All financial events that fall within the given YYYY-MM month, sorted by date.
 * Recurring bills are projected onto the month using their real day-of-month.
 */
export function getMonthEvents(month: string): FinEvent[] {
  const [y, mo] = month.split('-').map(Number);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !y || mo < 1 || mo > 12) return [];
  const dim = daysInMonth(y, mo);
  const events: FinEvent[] = [];

  // ── Recurring bills (from real logged expenses) ──────────────────────────
  try {
    const items = loadExpenses();
    if (items.length > 0) {
      const patterns = detectRecurring(items, buildCatMeta(month));
      patterns.forEach((p) => {
        const day = Math.min(Number((p.lastDate || '').slice(8, 10)) || 1, dim);
        events.push({
          // An export must keep the same UID when another bill changes rank.
          id: `bill-${encodeURIComponent(JSON.stringify([p.category, p.merchant]))}-${month}`,
          date: `${month}-${pad(day)}`,
          type: 'bill',
          title: p.merchant || p.label,
          amount: Math.round(p.estimatedMonthly),
          detail: `Recurring ${p.label.toLowerCase()} · seen ${p.monthsDetected} months`,
          icon: p.icon,
          accent: TYPE_META.bill.accent,
          href: TYPE_META.bill.href,
        });
      });
    }
  } catch { /* no bills */ }

  const snap = readDashboard();

  // ── Investing contribution (planning day, not a verified debit date) ─────
  if (snap.invest && snap.invest.monthly > 0) {
    events.push({
      id: `invest-${month}`,
      date: `${month}-01`,
      type: 'invest',
      title: 'Investing SIP',
      amount: Math.round(snap.invest.monthly),
      detail: `${snap.invest.profile} portfolio contribution${snap.invest.provenance === 'legacy' ? ' · older saved plan: confirm its currency and market in InvestMatch' : ''}`,
      icon: 'invest',
      accent: TYPE_META.invest.accent,
      href: TYPE_META.invest.href,
    });
  }

  // ── Goal maturity (only in the month it actually matures) ────────────────
  const goalStore = getJSON<Record<string, unknown>>('fx_goals', {});
  const anchor = goalStore['gp-planned-on'];
  if (snap.goal && snap.goal.years > 0 && typeof anchor === 'string' && validRecordDate(anchor)) {
    const [year, anchorMonth, day] = anchor.split('-').map(Number);
    const deadlineYear = year + Math.round(snap.goal.years);
    const md = new Date(deadlineYear, anchorMonth - 1, Math.min(day, daysInMonth(deadlineYear, anchorMonth)));
    const mk = `${md.getFullYear()}-${pad(md.getMonth() + 1)}`;
    if (mk === month) {
      events.push({
        id: `goal-${month}`,
        date: `${month}-${pad(Math.min(md.getDate(), dim))}`,
        type: 'goal',
        title: `${snap.goal.name} target`,
        amount: Math.round(snap.goal.target),
        detail: `Planned goal maturity · plan dated ${anchor}`,
        icon: 'goal',
        accent: TYPE_META.goal.accent,
        href: TYPE_META.goal.href,
      });
    }
  }

  const preference = getJSON<{ calendarDay?: number }>('fx_investmatch', {}).calendarDay;
  const hasDay = Number.isInteger(preference) && Number(preference) >= 1 && Number(preference) <= 31;
  return calendarWithContributionDay(events, hasDay ? Number(preference) : 1).map((event) => event.type === 'invest' && !hasDay
    ? { ...event, detail: `${event.detail} (default; choose your date in Calendar)` } : event);
}

/** Upcoming events within `days` of `from` (spans this month + next). */
export function getUpcomingEvents(from: Date, days = 30): FinEvent[] {
  if (!Number.isFinite(from.getTime()) || !Number.isInteger(days) || days < 0 || days > 366) return [];

  const end = new Date(from);
  end.setDate(end.getDate() + days);
  const fromStr = `${from.getFullYear()}-${pad(from.getMonth() + 1)}-${pad(from.getDate())}`;
  const endStr = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;

  const events: FinEvent[] = [];
  for (const cursor = new Date(from.getFullYear(), from.getMonth(), 1); cursor <= end; cursor.setMonth(cursor.getMonth() + 1)) {
    events.push(...getMonthEvents(`${cursor.getFullYear()}-${pad(cursor.getMonth() + 1)}`));
  }
  return events
    .filter((e) => e.date >= fromStr && e.date <= endStr)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** True when there is at least one derivable event in the given month. */
export function hasCalendarData(month: string): boolean {
  return getMonthEvents(month).length > 0;
}
