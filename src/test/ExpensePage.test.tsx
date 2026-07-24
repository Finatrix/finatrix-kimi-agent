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

  /**
   * Audit regression guard (P2): submitting the add form with no amount used
   * to return silently — nothing shown, nothing announced, focus unmoved — so
   * the page looked broken. A rejected submission must always say why.
   */
  it('rejects an empty amount out loud instead of doing nothing', () => {
    renderPage();
    const before = localStorage.getItem('fx_expenses');

    fireEvent.click(screen.getByText('Add expense'));

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent(/amount greater than 0/i);

    // The field is marked invalid, points at the message, and takes focus back.
    const amount = screen.getByLabelText(/^Amount/);
    expect(amount).toHaveAttribute('aria-invalid', 'true');
    expect(amount).toHaveAccessibleDescription(/amount greater than 0/i);
    expect(amount).toHaveFocus();

    // …and nothing was written.
    expect(localStorage.getItem('fx_expenses')).toBe(before);
  });

  it('clears the rejection as soon as the amount is corrected, then saves', () => {
    renderPage();
    fireEvent.click(screen.getByText('Add expense'));
    expect(screen.getByRole('alert')).toBeInTheDocument();

    const amount = screen.getByLabelText(/^Amount/);
    fireEvent.change(amount, { target: { value: '250' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(amount).toHaveAttribute('aria-invalid', 'false');

    fireEvent.click(screen.getByText('Add expense'));
    const txList = screen.getByText('Transactions').closest('.card') as HTMLElement;
    expect(within(txList).getAllByText('₹250').length).toBeGreaterThan(0);
  });

  it('rejects a zero or negative amount for the same reason', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '0' } });
    fireEvent.click(screen.getByText('Add expense'));
    expect(screen.getByRole('alert')).toHaveTextContent(/amount greater than 0/i);

    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '-5' } });
    fireEvent.click(screen.getByText('Add expense'));
    expect(screen.getByRole('alert')).toHaveTextContent(/amount greater than 0/i);
    expect(localStorage.getItem('fx_expenses')).toBeNull();
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

  /* ── Regression: “Transactions → Add” modal submission ──────────────────
     The add-transaction dialog must always expose a working, visible submit
     path: open via “+ Add”, validate inline, save on form submission (button
     click or Enter’s implicit submit), persist, and update the list. */

  it('adds a transaction through the “+ Add” modal and persists it', () => {
    seedTwo();
    renderPage();
    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;

    fireEvent.click(within(txCard).getByText('+ Add'));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Add a transaction')).toBeInTheDocument();

    // A visible, correctly-labelled primary submit control exists.
    const submit = within(dialog).getByRole('button', { name: 'Add transaction' });
    expect(submit).toHaveAttribute('type', 'submit');

    fireEvent.change(within(dialog).getByLabelText(/^Amount \(₹\)$/), { target: { value: '249.99' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Groceries (Needs)' }));
    fireEvent.click(submit);

    // Modal closes; the new transaction is in the list and persisted.
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(txCard).getByText(/3 in /)).toBeInTheDocument();
    const stored = JSON.parse(localStorage.getItem('fx_expenses') || '[]');
    expect(stored).toHaveLength(3);
    expect(stored[0].amount).toBe(249.99);
    expect(stored[0].category).toBe('groceries');
  });

  it('submits the modal form on Enter (implicit form submission)', () => {
    renderPage();
    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;
    fireEvent.click(within(txCard).getByRole('button', { name: /Add your first transaction/ }));
    const dialog = screen.getByRole('dialog');

    const amount = within(dialog).getByLabelText(/^Amount \(₹\)$/);
    fireEvent.change(amount, { target: { value: '75.5' } });
    // Enter in a single-line input triggers the form’s submit event natively;
    // jsdom doesn’t implement implicit submission, so fire it on the form.
    fireEvent.submit(amount.closest('form') as HTMLFormElement);

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.parse(localStorage.getItem('fx_expenses') || '[]')[0].amount).toBe(75.5);
  });

  it('blocks an invalid modal submit with an inline error and saves nothing', () => {
    renderPage();
    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;
    fireEvent.click(within(txCard).getByRole('button', { name: /Add your first transaction/ }));
    const dialog = screen.getByRole('dialog');

    fireEvent.click(within(dialog).getByRole('button', { name: 'Add transaction' }));

    // Modal stays open, the error is announced, nothing was written.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Enter an amount greater than 0.');
    expect(within(dialog).getByLabelText(/^Amount \(₹\)$/)).toHaveAttribute('aria-invalid', 'true');
    expect(localStorage.getItem('fx_expenses')).toBeNull();
  });

  it('confirms deletion from the edit modal, deletes, and restores via undo', () => {
    renderPage();
    fireEvent.change(screen.getByLabelText(/^Amount \(₹\)$/), { target: { value: '500' } });
    fireEvent.click(screen.getByText('Add expense'));

    const txCard = screen.getByText('Transactions').closest('.card') as HTMLElement;
    fireEvent.click(within(txCard).getByLabelText('Edit Rent'));
    const dialog = screen.getByRole('dialog');

    // Footer Delete opens the confirmation layer (viewport-fixed since QA
    // pass 2 — it must exist and be reachable regardless of card scroll).
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    const confirm = screen.getByRole('alertdialog');
    expect(within(confirm).getByText('Delete this transaction?')).toBeInTheDocument();

    // Cancel keeps the transaction.
    fireEvent.click(within(confirm).getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(JSON.parse(localStorage.getItem('fx_expenses') || '[]')).toHaveLength(1);

    // Confirmed delete removes it and closes the modal…
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(JSON.parse(localStorage.getItem('fx_expenses') || '[]')).toHaveLength(0);

    // …and Undo restores it, persisted.
    fireEvent.click(screen.getByText('Undo'));
    expect(JSON.parse(localStorage.getItem('fx_expenses') || '[]')).toHaveLength(1);
    expect(within(txCard).getByLabelText('Edit Rent')).toBeInTheDocument();
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
