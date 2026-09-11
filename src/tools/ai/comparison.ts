import { ymLocal } from '../../lib/date';
import { splitOutflow } from '../lib/expense';
import { allCategories } from '../lib/budget';
import { prevMonth } from '../lib/month';
import type { SnapshotInput } from './context';

export interface PeriodComparison {
  basis: 'same-days' | 'whole-months';
  throughDay: number | null;
  current: { month: string; spending: number; setAside: number; txCount: number };
  previous: { month: string; spending: number; setAside: number; txCount: number };
  spendingChangePct: number | null;
  caveat: string;
}

/** Compare recorded consumption over matching calendar windows; never infer missing entries. */
export function comparePeriods(input: SnapshotInput): PeriodComparison | null {
  const { month, now, items, cats } = input;
  const currentMonth = ymLocal(now);
  if (month > currentMonth) return null;
  const previous = prevMonth(month);
  const [year, monthNumber] = previous.split('-').map(Number);
  // On March 31, compare days 1–28 (or 29) in BOTH months, not 31 against 28.
  const throughDay = month === currentMonth
    ? Math.min(now.getDate(), new Date(year, monthNumber, 0).getDate())
    : null;
  const flat = allCategories(cats);
  const meta = new Map(flat.map((c) => [c.k, c]));
  const valid = new Set(meta.keys());
  const period = (key: string) => {
    const rows = items.filter((e) => e.date.slice(0, 7) === key
      && (throughDay === null || Number(e.date.slice(8, 10)) <= throughDay));
    const split = splitOutflow(rows, valid, meta);
    return {
      month: key,
      spending: Math.round(split.consumedTotal * 100) / 100,
      setAside: Math.round(split.setAsideTotal * 100) / 100,
      txCount: rows.length,
    };
  };
  const a = period(month);
  const b = period(previous);
  return {
    basis: throughDay === null ? 'whole-months' : 'same-days',
    throughDay,
    current: a,
    previous: b,
    spendingChangePct: a.txCount > 0 && b.txCount > 0 && b.spending > 0
      ? Math.round(((a.spending - b.spending) / b.spending) * 1000) / 10
      : null,
    caveat: 'Recorded transactions only. Missing entries and different bill dates can affect this comparison.',
  };
}
