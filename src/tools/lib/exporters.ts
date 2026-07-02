/**
 * Branded exporters for Budget Builder and Expense Tracker — CSV, Excel (.xlsx)
 * and PDF. Heavy libraries (xlsx, jspdf) are dynamically imported so they never
 * enter the main bundle; they load only when the user actually exports.
 *
 * Every export carries FinatriX branding, the generation date (local time), the
 * active currency, totals and a summary; PDFs add a professional layout and a
 * visual split/breakdown bar.
 */
import { cfmt } from './format';

const GOLD = '#D4AF37';
const INK = '#1a1a1a';

function stamp(): string {
  return new Date().toLocaleString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Y position after the last autoTable (added on the doc by the plugin at runtime). */
function lastY(doc: unknown, fallback: number): number {
  const y = (doc as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY;
  return typeof y === 'number' ? y : fallback;
}

function csvCell(v: string | number): string {
  return `"${String(v).replace(/"/g, '""')}"`;
}
function toCsv(rows: (string | number)[][]): string {
  return rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

/* ────────────────────────── Budget ────────────────────────── */
export interface BudgetExportRow { group: string; label: string; amount: number }
export interface BudgetExport {
  monthLabel: string;
  currency: string;
  income: number;
  needs: { pct: number; limit: number; actual: number };
  wants: { pct: number; limit: number; actual: number };
  save: { pct: number; limit: number; actual: number };
  rows: BudgetExportRow[];
  spent: number;
  free: number;
  pos: boolean;
  savePct: number;
  allocatedPct: number;
  tips: string[];
}

function budgetMatrix(b: BudgetExport): (string | number)[][] {
  const money = (n: number) => cfmt(n, b.currency);
  const head: (string | number)[][] = [
    ['FinatriX — Budget Builder'],
    [`Month: ${b.monthLabel}`, `Currency: ${b.currency}`, `Generated: ${stamp()}`],
    [],
    ['Summary', 'Percent', 'Limit', 'Actual'],
    ['Income', '', '', money(b.income)],
    [`Needs`, `${b.needs.pct}%`, money(b.needs.limit), money(b.needs.actual)],
    [`Wants`, `${b.wants.pct}%`, money(b.wants.limit), money(b.wants.actual)],
    [`Savings`, `${b.save.pct}%`, money(b.save.limit), money(b.save.actual)],
    ['Allocated', `${b.allocatedPct}%`, '', money(b.spent)],
    [b.pos ? 'Unallocated' : 'Over budget by', '', '', money(Math.abs(b.free))],
    ['Actual savings rate', `${b.savePct}%`, '', ''],
    [],
    ['Group', 'Category', 'Amount'],
    ...b.rows.map((r) => [r.group, r.label, r.amount]),
  ];
  if (b.tips.length) {
    head.push([], ['Recommendations'], ...b.tips.map((t) => [t]));
  }
  return head;
}

export function exportBudgetCsv(b: BudgetExport) {
  downloadBlob(`finatrix-budget-${b.monthLabel.replace(/\s+/g, '-').toLowerCase()}.csv`,
    new Blob([toCsv(budgetMatrix(b))], { type: 'text/csv' }));
}

export async function exportBudgetXlsx(b: BudgetExport) {
  const XLSX = await import('xlsx');
  const money = (n: number) => cfmt(n, b.currency);
  const wb = XLSX.utils.book_new();
  const summary = XLSX.utils.aoa_to_sheet([
    ['FinatriX — Budget Builder'],
    [`Month: ${b.monthLabel}`],
    [`Currency: ${b.currency}`],
    [`Generated: ${stamp()}`],
    [],
    ['Item', 'Percent', 'Limit', 'Actual'],
    ['Income', '', '', money(b.income)],
    ['Needs', `${b.needs.pct}%`, money(b.needs.limit), money(b.needs.actual)],
    ['Wants', `${b.wants.pct}%`, money(b.wants.limit), money(b.wants.actual)],
    ['Savings', `${b.save.pct}%`, money(b.save.limit), money(b.save.actual)],
    ['Allocated', `${b.allocatedPct}%`, '', money(b.spent)],
    [b.pos ? 'Unallocated' : 'Over budget by', '', '', money(Math.abs(b.free))],
    ['Actual savings rate', `${b.savePct}%`, '', ''],
  ]);
  summary['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 16 }, { wch: 16 }];
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');

  const cats = XLSX.utils.aoa_to_sheet([['Group', 'Category', 'Amount'], ...b.rows.map((r) => [r.group, r.label, r.amount])]);
  cats['!cols'] = [{ wch: 12 }, { wch: 24 }, { wch: 14 }];
  XLSX.utils.book_append_sheet(wb, cats, 'Categories');

  if (b.tips.length) {
    const tips = XLSX.utils.aoa_to_sheet([['Recommendations'], ...b.tips.map((t) => [t])]);
    tips['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, tips, 'Recommendations');
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(`finatrix-budget-${b.monthLabel.replace(/\s+/g, '-').toLowerCase()}.xlsx`,
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

export async function exportBudgetPdf(b: BudgetExport) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const money = (n: number) => cfmt(n, b.currency);
  const W = doc.internal.pageSize.getWidth();
  brandHeader(doc, 'Budget Builder', b.monthLabel, b.currency, W);

  // 50/30/20 split bar
  const barY = 120, barX = 40, barW = W - 80, barH = 16;
  const total = b.needs.limit + b.wants.limit + b.save.limit || 1;
  const segs: [number, [number, number, number]][] = [
    [b.needs.limit, [77, 155, 255]], [b.wants.limit, [212, 175, 55]], [b.save.limit, [52, 210, 122]],
  ];
  let x = barX;
  segs.forEach(([val, rgb]) => {
    const w = (val / total) * barW;
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.rect(x, barY, w, barH, 'F');
    x += w;
  });
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text(`Needs ${b.needs.pct}%   Wants ${b.wants.pct}%   Savings ${b.save.pct}%`, barX, barY - 6);

  autoTable(doc, {
    startY: barY + barH + 18,
    head: [['Item', 'Percent', 'Limit', 'Actual']],
    body: [
      ['Income', '', '', money(b.income)],
      ['Needs', `${b.needs.pct}%`, money(b.needs.limit), money(b.needs.actual)],
      ['Wants', `${b.wants.pct}%`, money(b.wants.limit), money(b.wants.actual)],
      ['Savings', `${b.save.pct}%`, money(b.save.limit), money(b.save.actual)],
      ['Allocated', `${b.allocatedPct}%`, '', money(b.spent)],
      [b.pos ? 'Unallocated' : 'Over budget by', '', '', money(Math.abs(b.free))],
      ['Actual savings rate', `${b.savePct}%`, '', ''],
    ],
    theme: 'striped',
    headStyles: { fillColor: [26, 26, 26], textColor: 255 },
    styles: { fontSize: 9 },
  });

  const catBody = b.rows.map((r) => [r.group, r.label, money(r.amount)]);
  autoTable(doc, {
    startY: lastY(doc, 320) + 16,
    head: [['Group', 'Category', 'Amount']],
    body: catBody,
    theme: 'grid',
    headStyles: { fillColor: [26, 26, 26], textColor: 255 },
    styles: { fontSize: 9 },
  });

  if (b.tips.length) {
    autoTable(doc, {
      startY: lastY(doc, 500) + 16,
      head: [['Recommendations']],
      body: b.tips.map((t) => [t]),
      theme: 'plain',
      headStyles: { textColor: [176, 138, 54], fontStyle: 'bold' },
      styles: { fontSize: 9, textColor: 60 },
    });
  }
  footer(doc, W);
  doc.save(`finatrix-budget-${b.monthLabel.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}

/* ────────────────────────── Expense ────────────────────────── */
export interface ExpenseExport {
  monthLabel: string;
  currency: string;
  totalSpent: number;
  dailyAvg: number;
  txCount: number;
  budget: number;
  breakdown: { label: string; amount: number; pct: number }[];
  transactions: { date: string; category: string; amount: number; note: string }[];
}

function expenseMatrix(e: ExpenseExport): (string | number)[][] {
  const money = (n: number) => cfmt(n, e.currency);
  const rows: (string | number)[][] = [
    ['FinatriX — Expense Tracker'],
    [`Month: ${e.monthLabel}`, `Currency: ${e.currency}`, `Generated: ${stamp()}`],
    [],
    ['Summary'],
    ['Total spent', money(e.totalSpent)],
    ['Daily average', money(e.dailyAvg)],
    ['Transactions', e.txCount],
  ];
  if (e.budget > 0) {
    rows.push(['Budget', money(e.budget)], ['Remaining', money(e.budget - e.totalSpent)]);
  }
  rows.push([], ['Category', 'Amount', 'Share']);
  e.breakdown.forEach((b) => rows.push([b.label, b.amount, `${b.pct}%`]));
  rows.push([], ['Date', 'Category', 'Amount', 'Note']);
  e.transactions.forEach((t) => rows.push([t.date, t.category, t.amount, t.note]));
  return rows;
}

export function exportExpenseCsv(e: ExpenseExport) {
  downloadBlob(`finatrix-expenses-${e.monthLabel.replace(/\s+/g, '-').toLowerCase()}.csv`,
    new Blob([toCsv(expenseMatrix(e))], { type: 'text/csv' }));
}

export async function exportExpenseXlsx(e: ExpenseExport) {
  const XLSX = await import('xlsx');
  const money = (n: number) => cfmt(n, e.currency);
  const wb = XLSX.utils.book_new();
  const summaryRows: (string | number)[][] = [
    ['FinatriX — Expense Tracker'],
    [`Month: ${e.monthLabel}`], [`Currency: ${e.currency}`], [`Generated: ${stamp()}`],
    [],
    ['Total spent', money(e.totalSpent)],
    ['Daily average', money(e.dailyAvg)],
    ['Transactions', e.txCount],
  ];
  if (e.budget > 0) summaryRows.push(['Budget', money(e.budget)], ['Remaining', money(e.budget - e.totalSpent)]);
  summaryRows.push([], ['Category', 'Amount', 'Share'], ...e.breakdown.map((b) => [b.label, b.amount, `${b.pct}%`]));
  const summary = XLSX.utils.aoa_to_sheet(summaryRows);
  summary['!cols'] = [{ wch: 22 }, { wch: 16 }, { wch: 10 }];
  XLSX.utils.book_append_sheet(wb, summary, 'Summary');

  const tx = XLSX.utils.aoa_to_sheet([['Date', 'Category', 'Amount', 'Note'], ...e.transactions.map((t) => [t.date, t.category, t.amount, t.note])]);
  tx['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 40 }];
  XLSX.utils.book_append_sheet(wb, tx, 'Transactions');

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  downloadBlob(`finatrix-expenses-${e.monthLabel.replace(/\s+/g, '-').toLowerCase()}.xlsx`,
    new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
}

export async function exportExpensePdf(e: ExpenseExport) {
  const { jsPDF } = await import('jspdf');
  const autoTable = (await import('jspdf-autotable')).default;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const money = (n: number) => cfmt(n, e.currency);
  const W = doc.internal.pageSize.getWidth();
  brandHeader(doc, 'Expense Tracker', e.monthLabel, e.currency, W);

  const summaryBody = [
    ['Total spent', money(e.totalSpent)],
    ['Daily average', money(e.dailyAvg)],
    ['Transactions', String(e.txCount)],
  ];
  if (e.budget > 0) {
    summaryBody.push(['Budget', money(e.budget)], ['Remaining', money(e.budget - e.totalSpent)]);
  }
  autoTable(doc, {
    startY: 118, head: [['Summary', '']], body: summaryBody, theme: 'striped',
    headStyles: { fillColor: [26, 26, 26], textColor: 255 }, styles: { fontSize: 9 },
  });

  autoTable(doc, {
    startY: lastY(doc, 220) + 16,
    head: [['Category', 'Amount', 'Share']],
    body: e.breakdown.map((b) => [b.label, money(b.amount), `${b.pct}%`]),
    theme: 'grid', headStyles: { fillColor: [26, 26, 26], textColor: 255 }, styles: { fontSize: 9 },
  });

  autoTable(doc, {
    startY: lastY(doc, 320) + 16,
    head: [['Date', 'Category', 'Amount', 'Note']],
    body: e.transactions.map((t) => [t.date, t.category, money(t.amount), t.note]),
    theme: 'striped', headStyles: { fillColor: [26, 26, 26], textColor: 255 }, styles: { fontSize: 8.5 },
  });
  footer(doc, W);
  doc.save(`finatrix-expenses-${e.monthLabel.replace(/\s+/g, '-').toLowerCase()}.pdf`);
}

/* ────────────────────────── PDF chrome ────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function brandHeader(doc: any, tool: string, monthLabel: string, currency: string, W: number) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.setTextColor(GOLD);
  doc.text('FinatriX', 40, 46);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.setTextColor(INK);
  doc.text(tool, 40, 64);
  doc.setFontSize(8.5);
  doc.setTextColor(120);
  doc.text(`${monthLabel}  ·  Currency: ${currency}`, 40, 78);
  doc.text(`Generated ${stamp()}`, W - 40, 46, { align: 'right' });
  doc.setDrawColor(GOLD);
  doc.setLineWidth(1);
  doc.line(40, 88, W - 40, 88);
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function footer(doc: any, W: number) {
  const H = doc.internal.pageSize.getHeight();
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text('Educational tool — not financial advice · finatrix', 40, H - 24);
  doc.text('Made in India', W - 40, H - 24, { align: 'right' });
}
