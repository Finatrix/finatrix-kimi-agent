/** Budget Builder's unchanged starter value; it is not proof of recorded income. */
export const DEFAULT_BUDGET_INCOME = '50000';

/** Match the dashboard's existing distinction between a starter plan and recorded inputs. */
export function hasBudgetEvidence(income: unknown, allocatedTotal: number): boolean {
  const amount = typeof income === 'number' ? income : parseFloat(String(income ?? '').replace(/[^0-9.-]/g, ''));
  return allocatedTotal > 0 || (Number.isFinite(amount) && amount > 0 && amount !== Number(DEFAULT_BUDGET_INCOME));
}
