import { getJSON } from './storage';
import { type BudgetStore, allCategories } from './budget';
import { loadExpenses, migrateCategory } from './expense';
import { loadCatViewFor } from './budgetCatsMonth';
import { buildBudgetExport, buildExpenseExport, type ExportFormat, type ReportId, type ReportMeta } from './reports';
import { currentMonth, monthLabel } from './month';
import { validRecordDate } from './recordReview';
import {
  exportBudgetCsv, exportBudgetPdf, exportBudgetXlsx,
  exportExpenseCsv, exportExpensePdf, exportExpenseXlsx,
} from './exporters';

const isMonth = (month: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month);

export function reportPeriods() {
  const budget = getJSON<BudgetStore>('fx_bb_data', {});
  const expenseMonths = new Set(loadExpenses().map((item) => item.date.slice(0, 7)).filter(isMonth));
  const budgetMonths = Object.keys(budget).filter(isMonth);
  const months = [...new Set([...budgetMonths, ...expenseMonths, currentMonth()])].sort().reverse();
  return { months, latestComplete: months.find((month) => month <= currentMonth() && !!budget[month] && expenseMonths.has(month)) ?? null };
}

export function readReportReview(month: string) {
  const data = getJSON<BudgetStore>('fx_bb_data', {})[month];
  // The legacy report builder falls back to a different month. The hub requires
  // the chosen period to exist before invoking it, for preview and export alike.
  const budget = data ? buildBudgetExport(month) : null;
  const expense = buildExpenseExport(month);
  const items = loadExpenses().filter((item) => item.date.slice(0, 7) === month);
  const rawItems = getJSON<Array<{ amount?: unknown; date?: unknown }>>('fx_expenses', []);
  const invalidRawAmount = Array.isArray(rawItems) && rawItems.some((item) => item && typeof item.date === 'string'
    && item.date.slice(0, 7) === month && (item.amount == null || item.amount === '' || !Number.isFinite(Number(item.amount))));
  const rawNumbers = data ? [data.income, data.n, data.w, data.s, ...Object.values(data.vals ?? {})] : [];
  const badBudget = rawNumbers.some((value) => !Number.isFinite(Number(value)) || Number(value) < 0);
  const badExpenses = invalidRawAmount || items.some((item) => !Number.isFinite(item.amount) || !validRecordDate(item.date));
  const validKeys = new Set(allCategories(loadCatViewFor(month).active).map((cat) => cat.k));
  const unmatched = items.filter((item) => !validKeys.has(migrateCategory(item.category, validKeys))).length;
  const checks: Array<{ message: string; href: string }> = [];
  if (badBudget) checks.push({ message: 'Budget has an invalid or negative saved amount. Review it before export.', href: '/tools/budget' });
  if (badExpenses) checks.push({ message: 'Transactions include an invalid amount or date. Review them before export.', href: '/tools/expenses' });
  if (unmatched) checks.push({ message: `${unmatched} transactions use categories outside this month’s active budget. They remain included in the expense total.`, href: '/tools/expenses' });
  if (budget && budget.needs.pct + budget.wants.pct + budget.save.pct !== 100) checks.push({ message: 'The budget split does not add up to 100%. Its saved allocations are preserved in the report.', href: '/tools/budget' });
  if (budget && budget.free < 0) checks.push({ message: 'Planned allocations exceed saved income. Review the shortfall before sharing.', href: '/tools/budget' });
  const reports: ReportMeta[] = [
    { id: 'budget', title: 'Budget report', desc: 'Your saved plan, category allocations and recommendations.',
      available: !!budget && !badBudget, href: '/tools/budget', accent: 'var(--blue)',
      detail: badBudget ? 'Review invalid budget amounts first.' : budget ? `${budget.monthLabel} · ${budget.currency} ${budget.income.toLocaleString()} income` : `No budget saved for ${monthLabel(month)}.` },
    { id: 'expenses', title: 'Expense report', desc: 'Every transaction for the month with category breakdown and totals.',
      available: !!expense && !badExpenses, href: '/tools/expenses', accent: 'var(--green)',
      detail: badExpenses ? 'Review invalid transactions first.' : expense ? `${expense.monthLabel} · ${expense.txCount} transactions · ${expense.currency} ${expense.totalSpent.toLocaleString()}` : `No transactions saved for ${monthLabel(month)}.` },
  ];
  return { budget, expense, reports, checks, transactionCount: items.length,
    firstDate: items.map((item) => item.date).sort()[0] ?? null,
    lastDate: items.map((item) => item.date).sort().at(-1) ?? null };
}

/** Freeze the reviewed payloads before loading export libraries asynchronously. */
export async function exportReviewedReports(review: ReturnType<typeof readReportReview>, ids: ReportId[], format: ExportFormat) {
  let count = 0;
  for (const id of [...new Set(ids)]) {
    if (!review.reports.some((report) => report.id === id && report.available)) continue;
    if (id === 'budget' && review.budget) {
      const saved = await (format === 'csv' ? exportBudgetCsv(review.budget)
        : format === 'xlsx' ? exportBudgetXlsx(review.budget) : exportBudgetPdf(review.budget));
      if (saved !== false) count += 1;
    } else if (id === 'expenses' && review.expense) {
      const saved = await (format === 'csv' ? exportExpenseCsv(review.expense)
        : format === 'xlsx' ? exportExpenseXlsx(review.expense) : exportExpensePdf(review.expense));
      if (saved !== false) count += 1;
    }
  }
  return count;
}
