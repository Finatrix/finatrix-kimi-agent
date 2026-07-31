/**
 * Month helpers shared by Budget Builder and Expense Tracker — ported verbatim
 * from the identical bb / et month functions in the original tools-app.html.
 * A "month" is a "YYYY-MM" string.
 */
import { ymLocal } from '../../lib/date';

export function currentMonth(): string {
  return ymLocal(new Date());
}

export function monthLabel(ym: string): string {
  const parts = ym.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return new Date(y, m - 1, 1).toLocaleString('default', { month: 'long', year: 'numeric' });
}

export function prevMonth(ym: string): string {
  const parts = ym.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return ymLocal(new Date(y, m - 2, 1));
}

/** Next month with no clamp — used by forward-looking views (Calendar). */
export function nextMonthUnclamped(ym: string): string {
  const parts = ym.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  return ymLocal(new Date(y, m, 1));
}

/** Next month, or null if it would go past the current month (read-only guard). */
export function nextMonth(ym: string): string | null {
  const next = nextMonthUnclamped(ym);
  if (next > currentMonth()) return null;
  return next;
}
