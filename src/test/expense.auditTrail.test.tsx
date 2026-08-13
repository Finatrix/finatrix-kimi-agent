import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import { CurrencyProvider } from '../tools/CurrencyContext';
import ExpensePage from '../tools/pages/ExpensePage';
import { AUDIT_KEY } from '../tools/lib/expenseAudit';

/**
 * End-to-end wiring for the change history: every mutation path on the page
 * must land in the log, and the History tab must describe it in the user's
 * terms. The pure model is covered in expense.audit.test.ts — this file exists
 * because the risk that matters is a mutation path that forgets to record.
 */

function renderPage() {
  return render(
    <CurrencyProvider>
      <ExpensePage />
    </CurrencyProvider>
  );
}

/** The current month, the same way the page derives it (local, not UTC). */
function thisMonth(): string {
  const now = new Date();
  return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
}

function openHistory(): HTMLElement {
  fireEvent.click(screen.getByRole('tab', { name: /History/ }));
  return screen.getByText('Change history').closest('.card') as HTMLElement;
}

function txCard(): HTMLElement {
  return screen.getByText('Transactions').closest('.card') as HTMLElement;
}

function quickAdd(amount: string, note?: string) {
  fireEvent.change(screen.getByLabelText(/^Amount \(₹\)$/), { target: { value: amount } });
  if (note) fireEvent.change(screen.getByLabelText(/^Note/), { target: { value: note } });
  // Matched by role, not by its text: the button flashes "Added ✓" for a beat
  // after a save, so a second add in the same test would miss it by label.
  fireEvent.click(screen.getByRole('button', { name: /^Add(ed)?/ }));
}

function storedLog() {
  return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
}

describe('expense change history — every mutation is recorded', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('starts with an honest empty state rather than a fabricated history', () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /History/ }));
    expect(screen.getByText('No changes recorded yet')).toBeInTheDocument();
  });

  it('records an add, and describes it on the History tab', () => {
    renderPage();
    quickAdd('500', 'Flat rent');

    const history = openHistory();
    // The row's accessible name is the whole sentence: what happened, to what,
    // for how much, when — and that it leads back to the transaction.
    expect(
      within(history).getByRole('button', { name: /Added Flat rent, ₹500, at .+\. Open this transaction\./ })
    ).toBeInTheDocument();
    expect(within(history).getByText('Today')).toBeInTheDocument();
  });

  it('records an edit with the field-level diff, before → after', () => {
    renderPage();
    quickAdd('500');

    fireEvent.click(within(txCard()).getByLabelText('Edit Rent'));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/^Amount \(₹\)$/), { target: { value: '750' } });
    fireEvent.click(within(dialog).getByText('Save changes'));

    const history = openHistory();
    const row = within(history).getByRole('button', { name: /Edited Rent, ₹750/ });
    // The diff names the field and both sides of the change.
    expect(within(row).getByText('Amount')).toBeInTheDocument();
    expect(within(row).getByText('₹500')).toBeInTheDocument(); // struck through
    expect(within(row).getAllByText('₹750').length).toBeGreaterThan(0);
  });

  /**
   * The save metadata (`updatedAt`, `editCount`) moves on every save. If the
   * diff read those, opening a transaction and pressing Save would manufacture
   * a change the user never made — the exact noise that makes a history
   * worthless.
   */
  it('records nothing when a save moved no field', () => {
    renderPage();
    quickAdd('500');
    expect(storedLog()).toHaveLength(1);

    fireEvent.click(within(txCard()).getByLabelText('Edit Rent'));
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByText('Save changes'));

    expect(storedLog()).toHaveLength(1); // still just the add
  });

  it('records a delete, and still describes a transaction that no longer exists', async () => {
    renderPage();
    quickAdd('500', 'Flat rent');

    // The note becomes the row's name, so that is what the action is labelled by.
    fireEvent.click(within(txCard()).getByLabelText('Delete Flat rent'));
    await waitFor(() => expect(within(txCard()).queryByLabelText('Delete Flat rent')).toBeNull());

    const history = openHistory();
    expect(storedLog()[0].action).toBe('delete');
    // The snapshot outlives the row it described…
    const row = history.querySelector('.au-row') as HTMLElement;
    expect(row.textContent).toMatch(/Deleted\s*Flat rent/);
    expect(row.textContent).toMatch(/no longer in your transactions/);
    // …and it is NOT a button, because there is nothing left to open.
    expect(row.tagName).toBe('DIV');
    expect(within(history).queryByRole('button', { name: /Open this transaction/ })).toBeNull();
  });

  it('records an undo as a restore, so the round trip is visible', async () => {
    renderPage();
    quickAdd('500');

    fireEvent.click(within(txCard()).getByLabelText('Delete Rent'));
    await waitFor(() => expect(within(txCard()).queryByLabelText('Delete Rent')).toBeNull());
    fireEvent.click(screen.getByText('Undo'));

    const actions = storedLog().map((e: { action: string }) => e.action);
    expect(actions).toEqual(['restore', 'delete', 'add']); // newest first
  });

  it('records a duplicate as its own action, not as a bare add', () => {
    renderPage();
    quickAdd('500');
    fireEvent.click(within(txCard()).getByLabelText('Duplicate Rent'));

    expect(storedLog()[0].action).toBe('duplicate');
  });

  it('collapses a bulk delete into one row while keeping every transaction', async () => {
    const m = thisMonth();
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: 't1', amount: 300, category: 'eating_out', date: `${m}-05`, merchant: 'Blue Bottle' },
      { id: 't2', amount: 1200, category: 'groceries', date: `${m}-06`, merchant: 'BigBasket' },
    ]));
    renderPage();

    fireEvent.click(within(txCard()).getByText('Select'));
    fireEvent.click(within(txCard()).getByLabelText('Select all shown'));
    fireEvent.click(within(txCard()).getByText('Delete'));
    await waitFor(() => expect(within(txCard()).queryByText('Blue Bottle')).toBeNull());

    // Both rows are in the log, under one shared batch…
    const log = storedLog();
    expect(log).toHaveLength(2);
    expect(log[0].batch).toBe(log[1].batch);
    expect(log[0].batch).toBeTruthy();

    // …and the History tab shows one summary line, expandable to both.
    const history = openHistory();
    const summary = within(history).getByRole('button', { name: /Deleted 2 transactions/ });
    expect(summary).toHaveAttribute('aria-expanded', 'false');
    expect(within(history).queryByText('Blue Bottle')).toBeNull();

    fireEvent.click(summary);
    expect(summary).toHaveAttribute('aria-expanded', 'true');
    expect(within(history).getByText(/Blue Bottle/)).toBeInTheDocument();
    expect(within(history).getByText(/BigBasket/)).toBeInTheDocument();
  });

  it('records a bulk category change as an edit per transaction', () => {
    const m = thisMonth();
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: 't1', amount: 300, category: 'eating_out', date: `${m}-05`, merchant: 'Blue Bottle' },
      { id: 't2', amount: 1200, category: 'groceries', date: `${m}-06`, merchant: 'BigBasket' },
    ]));
    renderPage();

    fireEvent.click(within(txCard()).getByText('Select'));
    fireEvent.click(within(txCard()).getByLabelText('Select all shown'));
    fireEvent.click(within(txCard()).getByText('Category'));
    fireEvent.change(within(txCard()).getByLabelText('Move selected to category'), { target: { value: 'rent' } });
    fireEvent.click(within(txCard()).getByRole('button', { name: 'Apply' }));

    const log = storedLog();
    expect(log).toHaveLength(2);
    expect(log.every((e: { action: string }) => e.action === 'edit')).toBe(true);
    expect(log[0].changes[0]).toMatchObject({ field: 'category', after: 'rent' });
  });

  it('filters the history by action', async () => {
    renderPage();
    quickAdd('500', 'Flat rent');
    quickAdd('120', 'Coffee');
    fireEvent.click(within(txCard()).getByLabelText('Delete Coffee'));
    await waitFor(() => expect(within(txCard()).queryByLabelText('Delete Coffee')).toBeNull());

    const history = openHistory();
    fireEvent.click(within(history).getByRole('button', { name: 'Deleted' }));
    expect(within(history).getByText(/1 of 3 changes/)).toBeInTheDocument();
  });

  it('searches the history by the category name the user sees', () => {
    renderPage();
    quickAdd('500', 'Flat rent'); // default category is Rent

    const history = openHistory();
    fireEvent.change(within(history).getByLabelText('Search changes'), { target: { value: 'rent' } });
    expect(within(history).getByText(/1 change recorded/)).toBeInTheDocument();

    fireEvent.change(within(history).getByLabelText('Search changes'), { target: { value: 'zzz' } });
    expect(within(history).getByText('No changes match that filter.')).toBeInTheDocument();
  });

  it('clearing the history asks first, and never touches the transactions', () => {
    renderPage();
    quickAdd('500');
    const before = localStorage.getItem('fx_expenses');

    const history = openHistory();
    fireEvent.click(within(history).getByRole('button', { name: 'Clear' }));
    expect(within(history).getByText(/cannot be recovered/)).toBeInTheDocument();

    fireEvent.click(within(history).getByRole('button', { name: 'Clear history' }));

    expect(localStorage.getItem(AUDIT_KEY)).toBeNull();
    expect(localStorage.getItem('fx_expenses')).toBe(before); // ledger untouched
    expect(screen.getByText('No changes recorded yet')).toBeInTheDocument();
  });

  /**
   * The month picker and the month's Export belong to the spending views. On
   * History they would be two controls with no effect on what is shown — the
   * Export would quietly produce the month's expenses, not the history.
   */
  it('hides the month toolbar on History, which is not a per-month view', () => {
    renderPage();
    expect(screen.getByText(/Export ▾/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /History/ }));
    expect(screen.queryByText(/Export ▾/)).toBeNull();
    expect(screen.queryByLabelText('Go to previous month')).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /Overview/ }));
    expect(screen.getByText(/Export ▾/)).toBeInTheDocument();
  });
});
