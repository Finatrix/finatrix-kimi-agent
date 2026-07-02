/**
 * Month helpers shared by Budget Builder and Expense Tracker — ported verbatim
 * from the identical bb / et month functions in the original tools-app.html.
 * A "month" is a "YYYY-MM" string.
 */

export function currentMonth(): string {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
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
  const d = new Date(y, m - 2, 1);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/** Next month, or null if it would go past the current month (read-only guard). */
export function nextMonth(ym: string): string | null {
  const parts = ym.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  const d = new Date(y, m, 1);
  const next = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  if (next > currentMonth()) return null;
  return next;
}
