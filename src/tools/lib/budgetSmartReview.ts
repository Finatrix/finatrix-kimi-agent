import { allCategories, computeBudget, type BudgetInput, type BudgetVals, type SectionedCats } from './budget';
import { computeDashboard, type ExpenseItem } from './expense';

/** Observations only: use the tracker's own category migration and refund rules. */
export function reviewBudgetActuals(month: string, items: ExpenseItem[], cats: SectionedCats, vals: BudgetVals) {
  const dashboard = computeDashboard(month, items, cats, vals, new Date());
  const active = new Set(allCategories(cats).map((cat) => cat.k));
  const gaps = dashboard.categories
    .filter((cat) => active.has(cat.k) && cat.spent > cat.budget && Number.isFinite(cat.spent))
    .sort((a, b) => (b.spent - b.budget) - (a.spent - a.budget));
  const unmatched = dashboard.categories.filter((cat) => !active.has(cat.k) && cat.spent !== 0);
  const next = { ...vals };
  gaps.forEach((cat) => { next[cat.k] = cat.spent; });
  return { gaps, unmatched, next, transactionCount: dashboard.txCount };
}

/** An explicit user-selected destination; no default recommendation or model change. */
export function previewBudgetRemainder(input: BudgetInput, cats: SectionedCats, destination: string) {
  const before = computeBudget(input, cats);
  if (!cats.save.some((cat) => cat.k === destination) || !Number.isFinite(before.free) || before.free <= 0) return null;
  const vals = { ...input.vals, [destination]: (input.vals[destination] || 0) + before.free };
  return { vals, before, after: computeBudget({ ...input, vals }, cats) };
}

/** Undo only our writes and only if the user has not subsequently edited them. */
export function undoBudgetPatch(current: BudgetVals, before: BudgetVals, applied: BudgetVals): BudgetVals {
  const next = { ...current };
  Object.keys(applied).forEach((key) => {
    if (applied[key] === before[key] || current[key] !== applied[key]) return;
    if (Object.prototype.hasOwnProperty.call(before, key)) next[key] = before[key];
    else delete next[key];
  });
  return next;
}
