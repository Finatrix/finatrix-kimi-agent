import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportReviewedReports, readReportReview, reportPeriods } from '../tools/lib/reportsSmartReview';
import { currentMonth, prevMonth } from '../tools/lib/month';
import * as exporters from '../tools/lib/exporters';

const month = currentMonth();
const budget = { income: '1000', n: '50', w: '30', s: '20', vals: { rent: 300 } };
beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('smart report review', () => {
  it('never substitutes the latest budget when the selected month is missing', async () => {
    localStorage.setItem('fx_bb_data', JSON.stringify({ [prevMonth(month)]: budget }));
    const review = readReportReview(month);
    expect(review.budget).toBeNull();
    expect(review.reports[0].available).toBe(false);
    await expect(exportReviewedReports(review, ['budget'], 'csv')).resolves.toBe(0);
  });
  it('blocks impossible dates and corrupted amounts without throwing', () => {
    localStorage.setItem('fx_expenses', JSON.stringify([{ id: 'bad', category: 'rent', amount: 'oops', date: `${month}-99` }]));
    const review = readReportReview(month);
    expect(review.reports[1].available).toBe(false);
    expect(review.checks.some((check) => check.message.includes('invalid amount or date'))).toBe(true);
  });
  it('preserves refunds and all transactions, flags uncategorised activity', () => {
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: '1', category: 'rent', amount: 300, date: `${month}-01` },
      { id: '2', category: 'rent', amount: -50, date: `${month}-02` },
      { id: '3', category: 'deleted', amount: 25, date: `${month}-03` },
    ]));
    const review = readReportReview(month);
    expect(review.reports[1].available).toBe(true);
    expect(review.expense?.totalSpent).toBe(275);
    expect(review.expense?.transactions).toHaveLength(3);
    expect(review.checks.some((check) => check.message.includes('outside this month'))).toBe(true);
  });
  it('finds the newest month that has both sources, not a future budget alone', () => {
    localStorage.setItem('fx_bb_data', JSON.stringify({ [month]: budget, [prevMonth(month)]: budget, '2099-01': budget }));
    localStorage.setItem('fx_expenses', JSON.stringify([{ id: '1', category: 'rent', amount: 20, date: `${prevMonth(month)}-01` }]));
    expect(reportPeriods().latestComplete).toBe(prevMonth(month));
  });
  it('exports only selected ready reports from an immutable reviewed snapshot', async () => {
    localStorage.setItem('fx_bb_data', JSON.stringify({ [month]: budget }));
    const review = readReportReview(month);
    localStorage.setItem('fx_bb_data', JSON.stringify({ [month]: { ...budget, income: '9000' } }));
    const csv = vi.spyOn(exporters, 'exportBudgetCsv').mockImplementation(() => true);
    await expect(exportReviewedReports(review, ['budget', 'budget', 'expenses'], 'csv')).resolves.toBe(1);
    expect(csv).toHaveBeenCalledTimes(1);
    expect(csv.mock.calls[0][0].income).toBe(1000);
  });
});
