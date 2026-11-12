/**
 * The Import button, from the page's side.
 *
 * The review sheet is stubbed so these tests are about what the Expense Tracker
 * does around it: opening it, surviving it failing to load, and what happens to
 * the ledger and the screen when it hands rows back. The sheet itself is
 * covered in importFlow.test.tsx, the parsers in importRepair.test.ts, and a
 * sheet that fails to load in ExpensePage.importChunk.test.tsx.
 */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { CurrencyProvider } from '../tools/CurrencyContext';
import { ToastProvider } from '../tools/ui/Toast';
import { currentMonth, monthLabel, prevMonth } from '../tools/lib/month';
import type { ExpenseItem } from '../tools/lib/expense';

const h = vi.hoisted(() => ({
  /** What the stub sheet hands to `onImport`. */
  items: [] as unknown[],
  /** What `onImport` answered. */
  result: undefined as boolean | void | undefined,
  reloadIfBuildIsStale: vi.fn(async () => false),
}));

vi.mock('../tools/ui/StatementImport', () => {
  return {
    default: ({ onImport, onClose }: { onImport: (items: unknown[]) => boolean | void; onClose: () => void }) => (
      <div role="dialog" aria-label="Import a statement">
        <button
          type="button"
          onClick={() => {
            h.result = onImport(h.items);
            if (h.result !== false) onClose();
          }}
        >
          Confirm stub import
        </button>
      </div>
    ),
  };
});

vi.mock('../lib/chunkRecovery', () => ({ reloadIfBuildIsStale: h.reloadIfBuildIsStale }));

import ExpensePage from '../tools/pages/ExpensePage';

function renderPage() {
  return render(
    <MemoryRouter>
      <CurrencyProvider>
        <ToastProvider>
          <ExpensePage />
        </ToastProvider>
      </CurrencyProvider>
    </MemoryRouter>,
  );
}

function tx(id: string, date: string, amount: number, note: string): ExpenseItem {
  const stamp = new Date().toISOString();
  return {
    id, amount, category: 'groceries', date, note, merchant: note,
    tags: ['imported'], createdAt: stamp, updatedAt: stamp, editCount: 0,
  } as ExpenseItem;
}

const stored = (): ExpenseItem[] => JSON.parse(localStorage.getItem('fx_expenses') ?? '[]');
const importButton = () => screen.getByRole('button', { name: 'Import' });
const toastText = () => screen.queryAllByRole('status').map((el) => el.textContent ?? '').join(' | ');

async function openSheet() {
  fireEvent.click(importButton());
  return screen.findByRole('dialog', { name: 'Import a statement' });
}

beforeEach(() => {
  localStorage.clear();
  h.items = [];
  h.result = undefined;
  h.reloadIfBuildIsStale.mockReset().mockResolvedValue(false);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('opening the importer', () => {
  it('opens the review sheet', async () => {
    renderPage();
    expect(await openSheet()).toBeInTheDocument();
  });
});

describe('what an import does to the page', () => {
  const thisMonth = currentMonth();
  const lastMonth = prevMonth(thisMonth);
  const monthBefore = prevMonth(lastMonth);

  it('goes to the month the rows landed in when none are in the month on screen', async () => {
    // The ordinary case: last month's statement, imported while this month is open.
    h.items = [
      tx('a', `${lastMonth}-03`, 450, 'Swiggy'),
      tx('b', `${lastMonth}-09`, 220.5, 'Uber'),
    ];
    renderPage();
    await openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm stub import' }));

    await waitFor(() => expect(stored()).toHaveLength(2));
    expect(h.result).toBe(true);
    await waitFor(() => expect(toastText()).toContain(`Imported 2 transactions. Showing ${monthLabel(lastMonth)}, where they landed.`));
    // The month on screen is now the one with the rows in it.
    expect(screen.getAllByText(new RegExp(monthLabel(lastMonth))).length).toBeGreaterThan(0);
    expect(screen.getByText('Viewing past month')).toBeInTheDocument();
  });

  it('goes to the latest month of a statement that covers several', async () => {
    h.items = [
      tx('a', `${monthBefore}-12`, 100, 'Chai Point'),
      tx('b', `${lastMonth}-04`, 300, 'Zomato'),
    ];
    renderPage();
    await openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm stub import' }));

    await waitFor(() => expect(toastText()).toContain(
      `Imported 2 transactions. Showing ${monthLabel(lastMonth)}, the latest of the 2 months they cover.`,
    ));
    expect(screen.getByText('Viewing past month')).toBeInTheDocument();
  });

  it('stays put when the month on screen received rows', async () => {
    h.items = [
      tx('a', `${thisMonth}-01`, 99, 'Netflix'),
      tx('b', `${lastMonth}-28`, 300, 'Zomato'),
    ];
    renderPage();
    await openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm stub import' }));

    await waitFor(() => expect(toastText()).toContain('Imported 2 transactions. They cover 2 months.'));
    expect(screen.queryByText('Viewing past month')).not.toBeInTheDocument();
  });

  it('keeps what was already in the ledger', async () => {
    localStorage.setItem('fx_expenses', JSON.stringify([tx('existing', `${thisMonth}-02`, 75, 'Bakery')]));
    h.items = [tx('a', `${thisMonth}-01`, 99, 'Netflix')];
    renderPage();
    await openSheet();
    fireEvent.click(screen.getByRole('button', { name: 'Confirm stub import' }));

    await waitFor(() => expect(stored()).toHaveLength(2));
    expect(stored().map((e) => e.id).sort()).toEqual(['a', 'existing']);
  });
});

describe('an import the device cannot save', () => {
  const thisMonth = currentMonth();

  /** Make storage refuse the ledger, as a full disk does. */
  function fillDisk() {
    const real = Storage.prototype.setItem;
    return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'fx_expenses' && JSON.parse(value).length > 1) {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      }
      return real.call(this, key, value);
    });
  }

  it('imports nothing, says so to the sheet, and leaves the ledger exactly as it was', async () => {
    const before = [tx('existing', `${thisMonth}-02`, 75, 'Bakery')];
    localStorage.setItem('fx_expenses', JSON.stringify(before));
    h.items = [tx('a', `${thisMonth}-01`, 99, 'Netflix'), tx('b', `${thisMonth}-03`, 450, 'Swiggy')];
    renderPage();
    await openSheet();
    fillDisk();

    fireEvent.click(screen.getByRole('button', { name: 'Confirm stub import' }));

    // The sheet is told, so it can stay open with the review intact.
    expect(h.result).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Import a statement' })).toBeInTheDocument();
    // No "Imported 2 transactions." over a ledger that would not survive a reload.
    expect(toastText()).not.toMatch(/Imported/);
    // On disk, and in what this session reads back: the one row that was there.
    expect(stored().map((e) => [e.id, e.amount, e.date])).toEqual(before.map((e) => [e.id, e.amount, e.date]));
    expect(JSON.parse(localStorage.getItem('fx_expense_audit') ?? '[]')).toEqual([]);
  });

  it('warns, once, when an ordinary change cannot be saved', async () => {
    renderPage();
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === 'fx_expenses') throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
      return real.call(this, key, value);
    });

    const add = () => {
      fireEvent.click(screen.getByRole('button', { name: 'Add an expense' }));
      const dialog = screen.getByRole('dialog');
      fireEvent.change(dialog.querySelector('input[inputmode="decimal"], input[name="amount"], input')!, { target: { value: '500' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    };
    add();
    await waitFor(() => expect(toastText()).toMatch(/storage is full, so that change could not be saved here/));

    add();
    const warnings = screen.queryAllByRole('status').filter((el) => /storage is full/.test(el.textContent ?? ''));
    expect(warnings.length).toBeLessThanOrEqual(1);
  });
});
