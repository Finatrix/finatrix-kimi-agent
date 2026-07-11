import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import ExpensePage from '../tools/pages/ExpensePage';

function renderPage() {
  return render(
    <CurrencyProvider>
      <ExpensePage />
    </CurrencyProvider>
  );
}

describe('ExpensePage (React) — dashboard wiring', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('renders the dashboard header, KPIs and an export control', () => {
    renderPage();
    expect(screen.getByText('Your money, tracked and understood.')).toBeInTheDocument();
    expect(screen.getByText(/Export ▾/)).toBeInTheDocument();
    expect(screen.getByText('Monthly budget')).toBeInTheDocument();
    expect(screen.getByText('Monthly spent')).toBeInTheDocument();
    expect(screen.getByText('Remaining')).toBeInTheDocument();
    // Needs / Wants / Savings summary block from Budget Builder sections.
    expect(screen.getByText('Needs · Wants · Savings')).toBeInTheDocument();
  });

  it('logs an expense that flows into Monthly spent and Top categories', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Add expense'));

    // Default category is the first budget category (Rent). Spent rolls up.
    const top = screen.getByText('Top categories').closest('.card') as HTMLElement;
    expect(within(top).getByText('Rent')).toBeInTheDocument();
    // The transactions list shows it too.
    const txList = screen.getByText('Transactions').closest('.card') as HTMLElement;
    expect(within(txList).getAllByText('₹500').length).toBeGreaterThan(0);
  });

  it("reflects a Budget Builder allocation as this category's budget", () => {
    const now = new Date();
    const m = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    localStorage.setItem('fx_bb_data', JSON.stringify({ [m]: { vals: { rent: 20000 } } }));
    renderPage();
    const cat = screen.getByText('Category budgets').closest('.card') as HTMLElement;
    expect(within(cat).getByText('Rent')).toBeInTheDocument();
    expect(within(cat).getByText(/budget ₹20,000/)).toBeInTheDocument();
  });

  it('edits a transaction in place without creating a duplicate', () => {
    renderPage();
    // Quick-add a Rent expense of 500 (Rent is the default first category).
    fireEvent.change(screen.getByLabelText(/^Amount \(₹\)$/), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Add expense'));

    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;
    expect(within(txCard).getByText('1 in ' + new Date().toLocaleString('en', { month: 'long', year: 'numeric' }))).toBeTruthy();

    // Open the edit modal via the row action.
    fireEvent.click(within(txCard).getByLabelText('Edit Rent'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Edit transaction')).toBeInTheDocument();

    // Change the amount and save.
    fireEvent.change(within(dialog).getByLabelText(/^Amount \(₹\)$/), { target: { value: '750' } });
    fireEvent.click(within(dialog).getByText('Save changes'));

    // Still exactly one transaction; monthly spent reflects the edit.
    expect(within(txCard).getByText(/^1 in /)).toBeTruthy();
    const spentCell = screen.getByText('Monthly spent').closest('.stat-cell') as HTMLElement;
    expect(within(spentCell).getByText('₹750')).toBeInTheDocument();
  });

  it('deletes a transaction and can undo it', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/^Amount \(₹\)$/), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Add expense'));

    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;
    fireEvent.click(within(txCard).getByLabelText('Delete Rent'));

    // Row is gone, undo affordance appears.
    expect(within(txCard).queryByLabelText('Delete Rent')).toBeNull();
    const undo = screen.getByText('Undo');
    fireEvent.click(undo);

    // Transaction is restored.
    expect(within(txCard).getByLabelText('Delete Rent')).toBeInTheDocument();
  });

  function seedTwo() {
    const now = new Date();
    const m = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: 't1', amount: 300, category: 'eating_out', date: `${m}-05`, merchant: 'Blue Bottle', note: 'coffee' },
      { id: 't2', amount: 1200, category: 'groceries', date: `${m}-06`, merchant: 'BigBasket', tags: ['weekly'] },
    ]));
  }

  it('searches transactions instantly by merchant', () => {
    seedTwo();
    renderPage();
    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;
    expect(within(txCard).getByText('Blue Bottle')).toBeInTheDocument();
    expect(within(txCard).getByText('BigBasket')).toBeInTheDocument();

    fireEvent.change(within(txCard).getByLabelText('Search transactions'), { target: { value: 'bigbasket' } });
    expect(within(txCard).queryByText('Blue Bottle')).toBeNull();
    expect(within(txCard).getByText('BigBasket')).toBeInTheDocument();
  });

  it('multi-selects and bulk-deletes with undo', () => {
    seedTwo();
    renderPage();
    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;

    fireEvent.click(within(txCard).getByText('Select'));
    fireEvent.click(within(txCard).getByLabelText('Select all shown'));
    fireEvent.click(within(txCard).getByText('Delete'));

    // Both gone; undo restores them.
    expect(within(txCard).queryByText('Blue Bottle')).toBeNull();
    fireEvent.click(screen.getByText('Undo'));
    expect(within(txCard).getByText('Blue Bottle')).toBeInTheDocument();
    expect(within(txCard).getByText('BigBasket')).toBeInTheDocument();
  });

  it('groups transactions into a timeline', () => {
    seedTwo();
    renderPage();
    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;
    // Seeded dates are the 5th/6th, i.e. earlier in the current month.
    expect(within(txCard).getByText('Earlier this month')).toBeInTheDocument();
  });

  it('shows a first-run empty state with a CTA', () => {
    renderPage();
    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;
    expect(within(txCard).getByText('Start tracking your spending')).toBeInTheDocument();
    expect(within(txCard).getByRole('button', { name: /Add your first transaction/ })).toBeInTheDocument();
  });

  it('closes the edit modal on Escape', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/^Amount \(₹\)$/), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Add expense'));
    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;
    fireEvent.click(within(txCard).getByLabelText('Edit Rent'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
