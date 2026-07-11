/**
 * Reports data layer — assembles branded export payloads from the user's own
 * persisted state. It NEVER re-implements a formula: it calls the exact same
 * compute functions the tools use (computeBudget, computeDashboard) and reuses
 * the existing branded exporters (exporters.ts). This is the single place that
 * turns saved tool state into a shareable report, so the Reports hub, a tool's
 * own Export button and any future scheduled/emailed report all produce the
 * identical document. Pure/read-only; no writes.
 */
import { store, getJSON } from './storage';
import { currentMonth, monthLabel } from './month';
import { computeBudget, mergedCats, loadCustomCats, allCategories, type BudgetStore } from './budget';
import { loadExpenses, computeDashboard } from './expense';
import {
  exportBudgetCsv, exportBudgetXlsx, exportBudgetPdf, type BudgetExport,
  exportExpenseCsv, exportExpenseXlsx, exportExpensePdf, type ExpenseExport,
} from './exporters';

export type ReportId = 'budget' | 'expenses';
export type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export interface ReportMeta {
  id: ReportId;
  title: string;
  desc: string;
  /** True when there is real saved data to export. */
  available: boolean;
  /** One-line status: the period + headline figure, or why it's empty. */
  detail: string;
  /** Deep link to the source tool. */
  href: string;
  accent: string;
}

function readCurrency(): string {
  return store.get('fx_currency', 'INR') || 'INR';
}

/** The month key a budget report would use (selected month, else latest saved). */
function budgetMonthKey(month: string): string | null {
  const bstore = getJSON<BudgetStore>('fx_bb_data', {});
  if (bstore[month]) return month;
  const months = Object.keys(bstore).sort();
  return months.length ? months[months.length - 1] : null;
}

/** Build the Budget export payload from saved state (or null if none). */
export function buildBudgetExport(month = currentMonth()): BudgetExport | null {
  const bstore = getJSON<BudgetStore>('fx_bb_data', {});
  const key = budgetMonthKey(month);
  const bdata = key ? bstore[key] : undefined;
  if (!key || !bdata) return null;

  const cats = mergedCats(loadCustomCats());
  const r = computeBudget(
    { incomeRaw: bdata.income, needsRaw: bdata.n, wantsRaw: bdata.w, saveRaw: bdata.s, vals: bdata.vals },
    cats,
  );
  const vals = bdata.vals || {};
  return {
    monthLabel: monthLabel(key),
    currency: readCurrency(),
    income: r.income,
    needs: { pct: r.nPct, limit: r.nL, actual: r.nT },
    wants: { pct: r.wPct, limit: r.wL, actual: r.wT },
    save: { pct: r.sPct, limit: r.sL, actual: r.sT },
    rows: [
      ...cats.needs.map((c) => ({ group: 'Needs', label: c.l, amount: vals[c.k] || 0 })),
      ...cats.wants.map((c) => ({ group: 'Wants', label: c.l, amount: vals[c.k] || 0 })),
      ...cats.save.map((c) => ({ group: 'Savings', label: c.l, amount: vals[c.k] || 0 })),
    ],
    spent: r.spent, free: r.free, pos: r.pos, savePct: r.savePct, allocatedPct: r.allocatedPct,
    tips: r.tips.map((t) => `${t[1]}: ${t[2]}`),
  };
}

/** Build the Expense export payload — the COMPLETE month, not just recents. */
export function buildExpenseExport(month = currentMonth()): ExpenseExport | null {
  const items = loadExpenses();
  if (items.length === 0) return null;

  const cats = mergedCats(loadCustomCats());
  const flat = allCategories(cats);
  const budgetVals = getJSON<BudgetStore>('fx_bb_data', {})[month]?.vals || {};
  const r = computeDashboard(month, items, cats, budgetVals, new Date());
  if (r.txCount === 0) return null;

  const monthItems = items
    .filter((e) => (e.date || '').slice(0, 7) === month)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const label = (k: string) => flat.find((c) => c.k === k)?.l ?? k;

  return {
    monthLabel: monthLabel(month),
    currency: readCurrency(),
    totalSpent: r.monthlySpent,
    dailyAvg: r.dailyAvg,
    txCount: r.txCount,
    budget: r.monthlyBudget,
    breakdown: r.categories
      .filter((c) => c.spent > 0)
      .sort((a, b) => b.spent - a.spent)
      .map((c) => ({ label: c.l, amount: c.spent, pct: r.monthlySpent > 0 ? Math.round((c.spent / r.monthlySpent) * 100) : 0 })),
    transactions: monthItems.map((t) => ({
      date: t.date,
      category: label(t.category),
      amount: t.amount,
      note: [t.merchant, t.note].filter(Boolean).join(' — ') || '',
    })),
  };
}

/** Describe every report and whether it currently has data — drives the hub UI. */
export function listReports(month = currentMonth()): ReportMeta[] {
  const currency = readCurrency();
  const money = (n: number) => `${currency} ${Math.round(n).toLocaleString()}`;

  const budget = buildBudgetExport(month);
  const expense = buildExpenseExport(month);

  return [
    {
      id: 'budget',
      title: 'Budget report',
      desc: 'Your 50/30/20 plan — allocations, actuals and recommendations.',
      available: !!budget,
      detail: budget ? `${budget.monthLabel} · income ${money(budget.income)}` : 'Set up a budget to generate this report.',
      href: '/tools/budget',
      accent: 'var(--blue)',
    },
    {
      id: 'expenses',
      title: 'Expense report',
      desc: 'Every transaction for the month with category breakdown and totals.',
      available: !!expense,
      detail: expense ? `${expense.monthLabel} · ${expense.txCount} transactions · ${money(expense.totalSpent)}` : 'Log expenses to generate this report.',
      href: '/tools/expenses',
      accent: 'var(--green)',
    },
  ];
}

/** True when at least one report has data — lets callers show an empty state. */
export function hasAnyReport(month = currentMonth()): boolean {
  return listReports(month).some((r) => r.available);
}

/** Export a single report in the chosen format. Returns false if no data. */
export async function exportReport(id: ReportId, format: ExportFormat, month = currentMonth()): Promise<boolean> {
  if (id === 'budget') {
    const b = buildBudgetExport(month);
    if (!b) return false;
    if (format === 'csv') exportBudgetCsv(b);
    else if (format === 'xlsx') await exportBudgetXlsx(b);
    else await exportBudgetPdf(b);
    return true;
  }
  const e = buildExpenseExport(month);
  if (!e) return false;
  if (format === 'csv') exportExpenseCsv(e);
  else if (format === 'xlsx') await exportExpenseXlsx(e);
  else await exportExpensePdf(e);
  return true;
}

/** Export every available report in one format (used by "Export all"). */
export async function exportAllReports(format: ExportFormat, month = currentMonth()): Promise<number> {
  let n = 0;
  for (const r of listReports(month)) {
    if (r.available && (await exportReport(r.id, format, month))) n += 1;
  }
  return n;
}
