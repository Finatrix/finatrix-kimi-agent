/**
 * The statement review sheet, end to end: a real file in, real drafts on
 * screen, and what each way of leaving the sheet does to the user's work.
 *
 * The model pass is switched off (`aiEnabled={false}`), so nothing here can
 * reach a network and every category comes from the on-device rules.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import StatementImport from '../tools/ui/StatementImport';
import type { FlatCat } from '../tools/ui/TransactionModal';
import { useStatementImport } from '../tools/lib/import/useStatementImport';
import { STAGING_KEY } from '../tools/lib/import/draft';
import type { ExpenseItem } from '../tools/lib/expense';

const CATS: FlatCat[] = [
  { k: 'groceries', l: 'Groceries', ic: 'layers', section: 'needs' },
  { k: 'transport', l: 'Transport', ic: 'layers', section: 'needs' },
  { k: 'eating_out', l: 'Eating Out', ic: 'layers', section: 'wants' },
  { k: 'subscriptions', l: 'Subscriptions', ic: 'layers', section: 'wants' },
];

const CSV = [
  'Date,Description,Debit,Credit,Balance',
  '03/11/2026,SWIGGY BANGALORE,450.00,,9550.00',
  '05/11/2026,UBER TRIP,220.50,,9329.50',
  '07/11/2026,SALARY NOV,,50000.00,59329.50',
].join('\n');

/** jsdom's `File` has no `text()`; supply the one a browser provides. */
function csvFile(text = CSV, name = 'statement.csv'): File {
  const file = new File([text], name, { type: 'text/csv' });
  if (typeof file.text !== 'function') Object.defineProperty(file, 'text', { value: async () => text });
  return file;
}

const staged = () => JSON.parse(localStorage.getItem(STAGING_KEY) ?? 'null') as { fileName: string; drafts: unknown[] } | null;

function renderSheet(over: Partial<Parameters<typeof StatementImport>[0]> = {}) {
  const onImport = vi.fn<(items: ExpenseItem[]) => boolean | void>();
  const onClose = vi.fn();
  render(
    <StatementImport
      cats={CATS}
      existing={[]}
      cfmt={(n) => `₹${n}`}
      currencyCode="INR"
      onImport={onImport}
      onClose={onClose}
      aiEnabled={false}
      {...over}
    />,
  );
  const dialog = screen.getByRole('dialog', { name: 'Import a statement' });
  return { dialog, onImport, onClose };
}

async function chooseFile(dialog: HTMLElement, file = csvFile()) {
  const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
  fireEvent.change(input, { target: { files: [file] } });
  return within(dialog).findByRole('button', { name: /^Import \d+ transaction/ });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('opening the sheet', () => {
  it('puts focus on the control that starts an import', () => {
    const { dialog } = renderSheet();
    const choose = within(dialog).getByRole('button', { name: 'Choose a file' });
    // The page behind is inert, so focus left outside the dialog is focus on nothing.
    expect(document.activeElement).toBe(choose);
  });

  it('opens the file picker from a real button, keeping the raw input out of the tab order', () => {
    const { dialog } = renderSheet();
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});

    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose a file' }));

    expect(click).toHaveBeenCalledTimes(1);
    expect(input).toHaveAttribute('tabindex', '-1');
    expect(input.accept).toContain('.csv');
  });

  it('does nothing when the picker is cancelled', () => {
    const { dialog, onClose } = renderSheet();
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [] } });

    expect(within(dialog).getByRole('button', { name: 'Choose a file' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('a file through the sheet', () => {
  it('shows the rows for review and imports exactly the ticked ones', async () => {
    const { dialog, onImport, onClose } = renderSheet();
    const confirm = await chooseFile(dialog);

    // Two debits recognised by the on-device rules; the salary is money in and
    // arrives unticked.
    expect(confirm).toHaveTextContent('Import 2 transactions');
    fireEvent.click(confirm);

    expect(onImport).toHaveBeenCalledTimes(1);
    const items = onImport.mock.calls[0][0];
    expect(items.map((i) => [i.date, i.amount, i.category])).toEqual([
      ['2026-11-03', 450, 'eating_out'],
      ['2026-11-05', 220.5, 'transport'],
    ]);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(staged()).toBeNull();
  });

  it('says so, in place, for a file it cannot read', async () => {
    const { dialog, onClose } = renderSheet();
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [csvFile('Description,Notes\nSWIGGY,lunch', 'missing.csv')] } });

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/could not find a header row/);
    expect(onClose).not.toHaveBeenCalled();
    // And offers the way forward.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose another file' }));
    expect(within(dialog).getByRole('button', { name: 'Choose a file' })).toBeInTheDocument();
  });
});

describe('a file that does not say which way the money moved', () => {
  // Two positives and one negative, no balance, no Debit/Credit columns: the
  // positives are read as spending, and the file offers no proof either way.
  const SIGNED = [
    'Date,Description,Amount',
    '03/11/2026,SWIGGY BANGALORE,450.00',
    '05/11/2026,UBER TRIP,220.50',
    '07/11/2026,NETFLIX,-649.00',
  ].join('\n');

  it('says how it read the rows and swaps them all in one press', async () => {
    const { dialog } = renderSheet();
    const confirm = await chooseFile(dialog, csvFile(SIGNED, 'signed.csv'));
    expect(confirm).toHaveTextContent('Import 2 transactions');
    expect(within(dialog).getByText(/does not say which rows are money out/)).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Swap money in and out' }));

    // Now the one negative row is the spending, and the two others are money in.
    expect(within(dialog).getByRole('button', { name: 'Import 1 transaction' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Swap money in and out' }));
    expect(within(dialog).getByRole('button', { name: 'Import 2 transactions' })).toBeInTheDocument();
  });

  it('does not offer a swap when the bank said which was which', async () => {
    const { dialog } = renderSheet();
    await chooseFile(dialog);
    expect(within(dialog).queryByRole('button', { name: 'Swap money in and out' })).not.toBeInTheDocument();
  });

  it('says so when the columns were worked out rather than labelled', async () => {
    const { dialog } = renderSheet();
    await chooseFile(dialog, csvFile('03/11/2026,-450.00,SWIGGY BANGALORE\n05/11/2026,-220.50,UBER TRIP', 'no-header.csv'));
    expect(within(dialog).getByText(/has no header row/)).toBeInTheDocument();
  });
});

describe('leaving the sheet does not throw work away', () => {
  it('keeps the review when the sheet is closed with ✕, and offers it again', async () => {
    const first = renderSheet();
    await chooseFile(first.dialog);
    fireEvent.click(within(first.dialog).getByRole('button', { name: 'Close import' }));

    expect(first.onClose).toHaveBeenCalledTimes(1);
    // Written at once — not left to a debounce the closing sheet would cancel.
    expect(staged()?.fileName).toBe('statement.csv');
    expect(staged()?.drafts).toHaveLength(3);

    cleanup();
    const second = renderSheet();
    expect(within(second.dialog).getByText(/unfinished review of/)).toBeInTheDocument();
    fireEvent.click(within(second.dialog).getByRole('button', { name: 'Resume' }));
    expect(await within(second.dialog).findByRole('button', { name: 'Import 2 transactions' })).toBeInTheDocument();
  });

  it('keeps the review on Escape', async () => {
    const { dialog, onClose } = renderSheet();
    await chooseFile(dialog);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(staged()?.drafts).toHaveLength(3);
  });

  it('does not delete an earlier unfinished review just because the sheet was opened and closed', async () => {
    const first = renderSheet();
    await chooseFile(first.dialog);
    fireEvent.click(within(first.dialog).getByRole('button', { name: 'Close import' }));
    cleanup();

    // Open, look, leave — three ways.
    for (const leave of [
      () => fireEvent.keyDown(document, { key: 'Escape' }),
      (dialog: HTMLElement) => fireEvent.click(within(dialog).getByRole('button', { name: 'Close import' })),
      (dialog: HTMLElement) => fireEvent.mouseDown(dialog.parentElement!),
    ]) {
      const { dialog, onClose } = renderSheet();
      leave(dialog);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(staged()?.drafts).toHaveLength(3);
      cleanup();
    }
  });

  it('does not delete it when a different file fails to read', async () => {
    const first = renderSheet();
    await chooseFile(first.dialog);
    fireEvent.click(within(first.dialog).getByRole('button', { name: 'Close import' }));
    cleanup();

    const { dialog } = renderSheet();
    const input = dialog.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [csvFile('', 'empty.csv')] } });
    await within(dialog).findByRole('alert');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Choose another file' }));

    expect(staged()?.drafts).toHaveLength(3);
    expect(within(dialog).getByText(/unfinished review of/)).toBeInTheDocument();
  });

  it('does not close on a stray click beside the table mid-review', async () => {
    const { dialog, onClose } = renderSheet();
    await chooseFile(dialog);
    fireEvent.mouseDown(dialog.parentElement!);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('discards the review only when Cancel says so', async () => {
    const { dialog, onClose } = renderSheet();
    await chooseFile(dialog);
    // Let the staged copy land first, so there is something to discard.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(staged()).toBeNull();
  });
});

describe('an import the page could not save', () => {
  it('stays open, says nothing was imported, and keeps the review', async () => {
    const { dialog, onImport, onClose } = renderSheet();
    onImport.mockReturnValue(false);
    const confirm = await chooseFile(dialog);
    fireEvent.click(confirm);

    expect(onImport).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/Nothing was imported/);
    // The rows are still there to try again with.
    expect(within(dialog).getByRole('button', { name: 'Import 2 transactions' })).toBeEnabled();
    // Nothing was learned from rows that never reached the ledger.
    expect(localStorage.getItem('fx_import_merchants')).toBeNull();

    // And leaving now still keeps the work.
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close import' }));
    expect(staged()?.drafts).toHaveLength(3);
  });

  it('goes through on a second try once the page can save', async () => {
    const { dialog, onImport, onClose } = renderSheet();
    onImport.mockReturnValueOnce(false).mockReturnValueOnce(true);
    const confirm = await chooseFile(dialog);

    fireEvent.click(confirm);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Import 2 transactions' }));

    expect(onImport).toHaveBeenCalledTimes(2);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(staged()).toBeNull();
  });
});

describe('useStatementImport', () => {
  const options = {
    categories: CATS.map((c) => ({ key: c.k, label: c.l, section: c.section })),
    existing: [] as ExpenseItem[],
    aiEnabled: false,
  };

  async function reviewing() {
    const hook = renderHook(() => useStatementImport(options));
    act(() => hook.result.current.start(csvFile()));
    await waitFor(() => expect(hook.result.current.phase).toBe('review'));
    return hook;
  }

  it('writes the ledger before it learns or clears anything', async () => {
    const { result } = await reviewing();
    act(() => result.current.stash());
    const order: string[] = [];
    const save = vi.fn<(items: ExpenseItem[]) => boolean>(() => {
      // At the moment the ledger is written, the review is still staged.
      order.push(staged() ? 'staged-present' : 'staged-gone');
      return true;
    });

    let went = false;
    act(() => { went = result.current.confirm(save); });

    expect(went).toBe(true);
    expect(order).toEqual(['staged-present']);
    expect(save.mock.calls[0][0]).toHaveLength(2);
    expect(staged()).toBeNull();
    expect(result.current.saveError).toBe('');
  });

  it('reports a refused write and leaves everything in place', async () => {
    const { result } = await reviewing();
    act(() => result.current.stash());

    let went = true;
    act(() => { went = result.current.confirm(() => false); });

    expect(went).toBe(false);
    expect(result.current.saveError).toMatch(/Nothing was imported/);
    expect(result.current.phase).toBe('review');
    expect(result.current.summary.selected).toBe(2);
    expect(staged()?.drafts).toHaveLength(3);
  });

  it('does not call save at all when nothing is ticked', async () => {
    const { result } = await reviewing();
    act(() => result.current.setAllIncluded(false));
    const save = vi.fn<(items: ExpenseItem[]) => boolean>(() => true);

    let went = true;
    act(() => { went = result.current.confirm(save); });

    expect(went).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it('reset returns to the picker without touching the staged copy; discard deletes it', async () => {
    const { result } = await reviewing();
    act(() => result.current.stash());

    act(() => result.current.reset());
    expect(result.current.phase).toBe('idle');
    expect(staged()?.drafts).toHaveLength(3);
    // The resume banner is back, because the copy is still there.
    expect(result.current.resumable?.count).toBe(3);

    act(() => result.current.discard());
    expect(staged()).toBeNull();
    expect(result.current.resumable).toBeNull();
  });
});
