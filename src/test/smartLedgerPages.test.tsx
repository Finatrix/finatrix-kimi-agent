import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import type { ReactNode } from 'react';
import BudgetPage from '../tools/pages/BudgetPage';
import NetWorthPage from '../tools/pages/NetWorthPage';
import ReportsPage from '../tools/pages/ReportsPage';
import { CurrencyProvider } from '../tools/CurrencyContext';
import { MarketProvider } from '../tools/MarketContext';
import { ToastProvider } from '../tools/ui/Toast';
import { currentMonth, monthLabel, prevMonth } from '../tools/lib/month';
import { setJSON } from '../tools/lib/storage';
import type { BudgetStore } from '../tools/lib/budget';
import type { NetWorthAccount } from '../tools/lib/netWorth';
import * as exporters from '../tools/lib/exporters';

const month = currentMonth();
const prior = prevMonth(month);
const savedBudget = { income: '1000', n: '50', w: '30', s: '20', vals: { rent: 500 } };

function renderTool(children: ReactNode) {
  return render(<MemoryRouter><CurrencyProvider><MarketProvider><ToastProvider>{children}</ToastProvider></MarketProvider></CurrencyProvider></MemoryRouter>);
}
function seedBudget(period = month) {
  localStorage.setItem('fx_bb_data', JSON.stringify({ [period]: savedBudget }));
}
function seedExpenses(period = month) {
  localStorage.setItem('fx_expenses', JSON.stringify([{ id: 'rent', category: 'rent', amount: 600, date: `${period}-01` }]));
}
const storedBudget = (): BudgetStore => JSON.parse(localStorage.getItem('fx_bb_data') || '{}');
const storedAccounts = (): NetWorthAccount[] => JSON.parse(localStorage.getItem('fx_networth') || '[]');

beforeEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });

describe('Budget smart review integration', () => {
  it('previews observed spending before applying and can undo without touching transactions', () => {
    seedBudget(); seedExpenses();
    const transactionsBefore = localStorage.getItem('fx_expenses');
    renderTool(<BudgetPage />);
    const review = within(screen.getByRole('region', { name: 'Smart budget review' }));
    fireEvent.click(review.getByText('Review spending gaps (1)'));
    fireEvent.click(review.getByRole('button', { name: 'Preview matching logged amounts' }));
    expect(review.getByRole('region', { name: 'Budget change preview' })).toHaveTextContent('₹500 → ₹600');
    expect(storedBudget()[month].vals.rent).toBe(500);
    fireEvent.click(review.getByRole('button', { name: 'Apply reviewed allocations' }));
    expect(storedBudget()[month].vals.rent).toBe(600);
    expect(screen.getByLabelText('Rent amount (₹)')).toHaveValue('600');
    fireEvent.click(review.getByRole('button', { name: 'Undo last smart allocation' }));
    expect(storedBudget()[month].vals.rent).toBe(500);
    expect(localStorage.getItem('fx_expenses')).toBe(transactionsBefore);
  });

  it('requires a selected savings destination, previews the remainder, then updates the real budget', () => {
    seedBudget();
    renderTool(<BudgetPage />);
    const review = within(screen.getByRole('region', { name: 'Smart budget review' }));
    fireEvent.click(review.getByText('Give the remaining ₹500 a purpose'));
    expect(review.getByRole('button', { name: 'Preview allocation' })).toBeDisabled();
    fireEvent.change(review.getByLabelText('Choose where to allocate the remainder'), { target: { value: 'emergency' } });
    fireEvent.click(review.getByRole('button', { name: 'Preview allocation' }));
    expect(storedBudget()[month].vals.emergency).toBeUndefined();
    expect(review.getByRole('region', { name: 'Budget change preview' })).toHaveTextContent('Money left: ₹500 → ₹0');
    fireEvent.click(review.getByRole('button', { name: 'Apply reviewed allocations' }));
    expect(storedBudget()[month].vals).toEqual({ rent: 500, emergency: 500 });
  });
});

describe('Net Worth smart review integration', () => {
  const account: NetWorthAccount = { id: 'cash', name: 'Bank account', kind: 'asset', category: 'cash', balances: { [prior]: 1000 } };

  it('focuses the next stale balance and only records unchanged balances on explicit confirmation', () => {
    localStorage.setItem('fx_networth', JSON.stringify([account]));
    renderTool(<NetWorthPage />);
    const review = within(screen.getByRole('region', { name: 'Smart balance review' }));
    expect(storedAccounts()[0].balances[month]).toBeUndefined();
    fireEvent.click(review.getByRole('button', { name: 'Update next balance' }));
    expect(screen.getByLabelText(`Bank account balance for ${monthLabel(month)}`)).toHaveFocus();
    fireEvent.click(review.getByRole('button', { name: 'I checked — this balance is unchanged' }));
    expect(storedAccounts()[0].balances).toEqual({ [prior]: 1000, [month]: 1000 });
    expect(review.getByText(/1 of 1 balances recorded/)).toBeInTheDocument();
    fireEvent.click(review.getByRole('button', { name: 'Undo last confirmation' }));
    expect(storedAccounts()[0].balances).toEqual({ [prior]: 1000 });
  });

  it('keeps a later edited balance when undoing an older confirmation', () => {
    localStorage.setItem('fx_networth', JSON.stringify([account]));
    renderTool(<NetWorthPage />);
    const review = within(screen.getByRole('region', { name: 'Smart balance review' }));
    fireEvent.click(review.getByRole('button', { name: 'I checked — this balance is unchanged' }));
    fireEvent.change(screen.getByLabelText(`Bank account balance for ${monthLabel(month)}`), { target: { value: '1200' } });
    fireEvent.click(review.getByRole('button', { name: 'Undo last confirmation' }));
    expect(storedAccounts()[0].balances[month]).toBe(1200);
    expect(review.getByRole('status')).toHaveTextContent('A later balance edit was kept');
  });

  it('explains falling liabilities as a positive net-worth contribution and links to the source field', () => {
    localStorage.setItem('fx_networth', JSON.stringify([
      account,
      { id: 'loan', name: 'Mortgage', kind: 'liability', category: 'home_loan', balances: { [prior]: 900, [month]: 800 } },
    ]));
    renderTool(<NetWorthPage />);
    const review = within(screen.getByRole('region', { name: 'Smart balance review' }));
    fireEvent.click(review.getByText(`Explain the change since ${monthLabel(prior)}`));
    expect(review.getByText(/Mortgage: \+₹100/)).toBeInTheDocument();
    fireEvent.click(review.getByRole('button', { name: 'Review movement' }));
    expect(screen.getByLabelText(`Mortgage balance for ${monthLabel(month)}`)).toHaveFocus();
  });
});

describe('Reports smart preparation integration', () => {
  it('does not silently present another month and offers a sourced complete-period shortcut', () => {
    seedBudget(prior); seedExpenses(prior);
    renderTool(<ReportsPage />);
    const review = within(screen.getByRole('region', { name: 'Smart report preparation' }));
    expect(review.getByText(/0 of 2 reports ready/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Export selected/ })).not.toBeInTheDocument();
    fireEvent.click(review.getByRole('button', { name: `Use latest month with both sources: ${monthLabel(prior)}` }));
    expect(review.getByText(/2 of 2 reports ready/)).toHaveTextContent(monthLabel(prior));
    expect(screen.getByRole('button', { name: /Export selected \(2\)/ })).toBeInTheDocument();
  });

  it('refreshes saved data from this tab and other tabs without remounting', () => {
    renderTool(<ReportsPage />);
    const review = within(screen.getByRole('region', { name: 'Smart report preparation' }));
    act(() => setJSON('fx_bb_data', { [month]: savedBudget }));
    expect(review.getByText(/1 of 2 reports ready/)).toBeInTheDocument();
    act(() => {
      seedExpenses();
      window.dispatchEvent(new StorageEvent('storage', { key: 'fx_expenses' }));
    });
    expect(review.getByText(/2 of 2 reports ready/)).toBeInTheDocument();
    expect(review.getByText(/1 transactions dated/)).toHaveTextContent(`${month}-01`);
  });

  it('exports only checked reports with the exact selected month and source values', async () => {
    seedBudget(); seedExpenses();
    const budgetExport = vi.spyOn(exporters, 'exportBudgetCsv').mockImplementation(() => true);
    const expenseExport = vi.spyOn(exporters, 'exportExpenseCsv').mockImplementation(() => true);
    renderTool(<ReportsPage />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Include budget report' }));
    fireEvent.click(screen.getByRole('button', { name: /Export selected \(1\)/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download CSV' }));
    await waitFor(() => expect(expenseExport).toHaveBeenCalledTimes(1));
    expect(budgetExport).not.toHaveBeenCalled();
    expect(expenseExport.mock.calls[0][0]).toMatchObject({ monthLabel: monthLabel(month), totalSpent: 600, txCount: 1 });
    await waitFor(() => expect(screen.getByText('Exported 1 report (CSV)')).toBeInTheDocument());
  });

  it('blocks a corrupt transaction report and names the source to repair', () => {
    seedBudget();
    localStorage.setItem('fx_expenses', JSON.stringify([{ id: 'bad', category: 'rent', amount: 100, date: `${month}-99` }]));
    renderTool(<ReportsPage />);
    const review = within(screen.getByRole('region', { name: 'Smart report preparation' }));
    expect(review.getByText(/Transactions include an invalid amount or date/)).toBeInTheDocument();
    expect(review.getByRole('link', { name: 'Review source' })).toHaveAttribute('href', '/tools/expenses');
    expect(screen.queryByRole('checkbox', { name: 'Include expense report' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Export selected \(1\)/ })).toBeInTheDocument();
  });
});
