import type { BudgetStore } from './budget';

/** Budget Builder's unchanged starter value; it is not proof of recorded income. */
export const DEFAULT_BUDGET_INCOME = '50000';

/** Match the dashboard's existing distinction between a starter plan and recorded inputs. */
export function hasBudgetEvidence(income: unknown, allocatedTotal: number): boolean {
  const amount = typeof income === 'number' ? income : parseFloat(String(income ?? '').replace(/[^0-9.-]/g, ''));
  return allocatedTotal > 0 || (Number.isFinite(amount) && amount > 0 && amount !== Number(DEFAULT_BUDGET_INCOME));
}

/**
 * That month's Budget Builder plan — per-category allocations and total income —
 * exactly as the Expense Tracker reads it. Shared so every surface that shows
 * the tracker's figures (the page itself, the home-screen widget) feeds
 * `computeDashboard` the same inputs.
 */
export function readBudgetMonth(store: BudgetStore, m: string): { vals: Record<string, number>; income: number } {
  const d = store[m];
  const vals = d?.vals ?? {};
  const allocated = Object.values(vals).reduce((sum, value) => sum + (Number(value) || 0), 0);
  const income = hasBudgetEvidence(d?.income, allocated) ? Math.max(0, Number(d?.income) || 0) : 0;
  return { vals, income };
}
