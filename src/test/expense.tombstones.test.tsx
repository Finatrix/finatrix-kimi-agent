import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CurrencyProvider } from '../tools/CurrencyContext';
import ExpensePage from '../tools/pages/ExpensePage';
import {
  TOMBSTONE_KEY,
  clearDeletions,
  isDeleted,
  loadTombstones,
  pruneTombstones,
  recordDeletions,
  TOMBSTONE_TTL_MS,
} from '../tools/lib/expenseTombstones';

/**
 * Deletion records — the half of the merge that stops "keep everything" from
 * meaning "hand back what the user deleted".
 *
 * The page tests matter more than the unit ones here: a delete path that forgot
 * to record would look completely fine on the device it happened on, and only
 * show up as a transaction rising from the dead on the user's other device.
 */

function renderPage() {
  return render(
    <MemoryRouter>
      <CurrencyProvider>
        <ExpensePage />
      </CurrencyProvider>
    </MemoryRouter>
  );
}

function txCard(): HTMLElement {
  return screen.getByText('Transactions').closest('.card') as HTMLElement;
}

function addSpend(amount: string) {
  fireEvent.click(screen.getByRole('button', { name: 'Add an expense' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText(/^Amount/), { target: { value: amount } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Add transaction' }));
}

const storedTombstones = (): Record<string, number> =>
  JSON.parse(localStorage.getItem(TOMBSTONE_KEY) || '{}');

describe('the deletion record', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('remembers what was deleted and forgets it again on restore', () => {
    recordDeletions(['t1', 't2'], 1_000);
    expect(loadTombstones()).toEqual({ t1: 1000, t2: 1000 });

    clearDeletions(['t1']);
    expect(loadTombstones()).toEqual({ t2: 1000 });
  });

  it('leaves no key behind when nothing has been deleted', () => {
    recordDeletions(['t1'], 1_000);
    clearDeletions(['t1']);
    expect(localStorage.getItem(TOMBSTONE_KEY)).toBeNull();
  });

  it('overrides a row unless the row was edited afterwards', () => {
    const map = { t1: Date.parse('2026-08-05T00:00:00.000Z') };
    expect(isDeleted(map, 't1', '2026-08-04T00:00:00.000Z')).toBe(true);
    expect(isDeleted(map, 't1', '2026-08-06T00:00:00.000Z')).toBe(false);
    expect(isDeleted(map, 't1', undefined)).toBe(true);
    expect(isDeleted(map, 'other', '2026-08-01T00:00:00.000Z')).toBe(false);
  });

  it('expires, so a record cannot outlive its usefulness', () => {
    const now = Date.now();
    const pruned = pruneTombstones({ old: now - TOMBSTONE_TTL_MS - 1, recent: now - 10 }, now);
    expect(pruned).toEqual({ recent: now - 10 });
  });
});

describe('the Expense Tracker records every deletion for sync', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  it('records a single delete', async () => {
    renderPage();
    addSpend('500');
    const id = JSON.parse(localStorage.getItem('fx_expenses')!)[0].id;

    fireEvent.click(within(txCard()).getByLabelText('Delete Rent'));
    await waitFor(() => expect(within(txCard()).queryByLabelText('Delete Rent')).toBeNull());

    expect(Object.keys(storedTombstones())).toEqual([id]);
  });

  it('lifts the record when the delete is undone', async () => {
    renderPage();
    addSpend('500');

    fireEvent.click(within(txCard()).getByLabelText('Delete Rent'));
    await waitFor(() => expect(within(txCard()).queryByLabelText('Delete Rent')).toBeNull());
    expect(Object.keys(storedTombstones())).toHaveLength(1);

    fireEvent.click(screen.getByText('Undo'));

    expect(storedTombstones()).toEqual({});
  });

  it('records every row of a bulk delete', async () => {
    renderPage();
    addSpend('100');
    addSpend('200');
    const ids = JSON.parse(localStorage.getItem('fx_expenses')!).map((t: { id: string }) => t.id);

    fireEvent.click(within(txCard()).getByText('Select'));
    fireEvent.click(within(txCard()).getByLabelText('Select all shown'));
    fireEvent.click(within(txCard()).getByText('Delete'));
    await waitFor(() => expect(Object.keys(storedTombstones()).sort()).toEqual([...ids].sort()));
  });
});
