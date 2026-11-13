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
import { amendAmount, readAmountEdit, STAGING_KEY } from '../tools/lib/import/draft';
import type { DraftRow } from '../tools/lib/import/types';
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
      sym="₹"
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

describe('correcting an amount during the review', () => {
  const amountOf = (dialog: HTMLElement, name: string | RegExp) => within(dialog).getByRole('textbox', { name });
  const rowOf = (field: HTMLElement) => field.closest('tr')!;

  /** Type into an amount field and leave it, as a person would. */
  function retype(field: HTMLElement, value: string) {
    fireEvent.focus(field);
    fireEvent.change(field, { target: { value } });
    fireEvent.blur(field);
  }

  /** What is already in the ledger: the Swiggy order, logged by hand at a rounder figure. */
  const LEDGER: ExpenseItem[] = [
    { id: 'e1', amount: 500, category: 'eating_out', date: '2026-11-03', note: 'Dinner', merchant: 'Swiggy' },
  ];

  it('gives every row a named amount field that takes decimals and shows the currency', async () => {
    const { dialog } = renderSheet();
    await chooseFile(dialog);

    const swiggy = amountOf(dialog, 'Amount for Swiggy');
    expect(swiggy).toHaveValue('450');
    // Text with a decimal keypad: a number field cannot hold a half-typed "12.".
    expect(swiggy).toHaveAttribute('type', 'text');
    expect(swiggy).toHaveAttribute('inputmode', 'decimal');
    expect(rowOf(swiggy).querySelector('.fx-imp-amtsym')).toHaveTextContent('₹');

    // Cents are shown to the cent, and money in says so outside the figure.
    expect(amountOf(dialog, 'Amount for Uber')).toHaveValue('220.50');
    const salary = amountOf(dialog, /^Amount for .+, money in$/);
    expect(salary).toHaveValue('50000');
    expect(rowOf(salary).querySelector('.fx-imp-amtsym')).toHaveTextContent('−₹');
  });

  it('imports the corrected amount and changes nothing else about the row', async () => {
    const { dialog, onImport } = renderSheet();
    const confirm = await chooseFile(dialog);
    expect(within(dialog).getByText('₹670.5')).toBeInTheDocument();

    retype(amountOf(dialog, 'Amount for Swiggy'), '475.25');

    // The total above moves with it, and the count does not.
    expect(within(dialog).getByText('₹695.75')).toBeInTheDocument();
    expect(confirm).toHaveTextContent('Import 2 transactions');
    // What the statement printed stays on show beside the correction.
    expect(rowOf(amountOf(dialog, 'Amount for Swiggy'))).toHaveTextContent('statement ₹450');

    fireEvent.click(confirm);
    expect(onImport.mock.calls[0][0].map((i) => [i.date, i.amount, i.category, i.merchant, i.note])).toEqual([
      ['2026-11-03', 475.25, 'eating_out', 'Swiggy', 'SWIGGY BANGALORE'],
      ['2026-11-05', 220.5, 'transport', 'Uber', 'UBER TRIP'],
    ]);
    // An amount teaches the importer nothing about a merchant.
    expect(JSON.parse(localStorage.getItem('fx_import_merchants') ?? '{}')).toEqual({});
  });

  it('takes arithmetic, on Enter, and keeps the result to the cent', async () => {
    const { dialog, onImport } = renderSheet();
    const confirm = await chooseFile(dialog);
    const uber = amountOf(dialog, 'Amount for Uber');

    fireEvent.focus(uber);
    fireEvent.change(uber, { target: { value: '1000/3' } });
    fireEvent.keyDown(uber, { key: 'Enter' });

    expect(uber).toHaveValue('333.33');
    fireEvent.click(confirm);
    expect(onImport.mock.calls[0][0][1].amount).toBe(333.33);
  });

  it.each([
    ['', 'Enter an amount above zero.'],
    ['0', 'Enter an amount above zero.'],
    ['-450', 'Enter an amount above zero.'],
    ['45o', 'Use only numbers and + − × ÷ ( ).'],
    ['450/0', 'Cannot divide by zero.'],
  ])('turns away %j, keeps the amount the row had and says why', async (typed, reason) => {
    const { dialog, onImport } = renderSheet();
    const confirm = await chooseFile(dialog);
    const swiggy = amountOf(dialog, 'Amount for Swiggy');

    retype(swiggy, typed);

    // The field shows what will be imported, never what was refused.
    expect(swiggy).toHaveValue('450');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(`Amount for Swiggy. ${reason} Kept ₹450.`);
    expect(within(dialog).getByText('₹670.5')).toBeInTheDocument();

    fireEvent.click(confirm);
    expect(onImport.mock.calls[0][0][0].amount).toBe(450);
  });

  it('drops the reason as soon as the next attempt starts', async () => {
    const { dialog } = renderSheet();
    await chooseFile(dialog);
    const swiggy = amountOf(dialog, 'Amount for Swiggy');
    retype(swiggy, '0');
    expect(within(dialog).getByRole('alert')).toBeInTheDocument();

    fireEvent.change(swiggy, { target: { value: '4' } });

    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
  });

  // A tap on Import does not always take focus from a field first: a phone, or
  // a screen reader's activate gesture. What is on show still has to be what
  // goes in.
  it('imports what the field shows even when focus never left it', async () => {
    const { dialog, onImport } = renderSheet();
    const confirm = await chooseFile(dialog);
    const swiggy = amountOf(dialog, 'Amount for Swiggy');

    fireEvent.focus(swiggy);
    fireEvent.change(swiggy, { target: { value: '475.25' } });
    fireEvent.click(confirm);

    expect(onImport.mock.calls[0][0][0].amount).toBe(475.25);
  });

  it('imports nothing while what the field shows cannot be taken', async () => {
    const { dialog, onImport, onClose } = renderSheet();
    const confirm = await chooseFile(dialog);
    const swiggy = amountOf(dialog, 'Amount for Swiggy');

    fireEvent.focus(swiggy);
    fireEvent.change(swiggy, { target: { value: '0' } });
    fireEvent.click(confirm);

    expect(onImport).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(swiggy).toHaveValue('450');
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Amount for Swiggy. Enter an amount above zero. Kept ₹450.');

    // The field now shows what the row has, so the next press imports it.
    fireEvent.click(confirm);
    expect(onImport.mock.calls[0][0][0].amount).toBe(450);
  });

  it('forgets a half-typed amount when its row leaves the list', async () => {
    const { dialog, onImport } = renderSheet();
    const confirm = await chooseFile(dialog);
    const swiggy = amountOf(dialog, 'Amount for Swiggy');

    // "47", on the way to "475.25", when a filter takes the row off the screen.
    fireEvent.focus(swiggy);
    fireEvent.change(swiggy, { target: { value: '47' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /^Money in/ }));
    expect(within(dialog).queryByRole('textbox', { name: 'Amount for Swiggy' })).not.toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: /^All/ }));
    expect(amountOf(dialog, 'Amount for Swiggy')).toHaveValue('450');
    fireEvent.click(confirm);
    expect(onImport.mock.calls[0][0][0].amount).toBe(450);
  });

  it('keeps an amount that was still being typed when the sheet is put away', async () => {
    const { dialog } = renderSheet();
    await chooseFile(dialog);
    const swiggy = amountOf(dialog, 'Amount for Swiggy');

    fireEvent.focus(swiggy);
    fireEvent.change(swiggy, { target: { value: '475.25' } });
    fireEvent.keyDown(document, { key: 'Escape' });

    expect((staged()?.drafts[0] as DraftRow).amount).toBe(475.25);
  });

  it('holds a row back when its new amount matches the ledger, and lets it go when it no longer does', async () => {
    const { dialog } = renderSheet({ existing: LEDGER });
    await chooseFile(dialog);
    const swiggy = () => amountOf(dialog, 'Amount for Swiggy');
    expect(within(rowOf(swiggy())).queryByText('Already in your ledger')).not.toBeInTheDocument();

    retype(swiggy(), '500');
    expect(within(rowOf(swiggy())).getByText('Already in your ledger')).toBeInTheDocument();
    expect(within(rowOf(swiggy())).getByRole('checkbox')).not.toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Import 1 transaction' })).toBeInTheDocument();

    // Only the match was holding it back, so it is ticked again as it started.
    retype(swiggy(), '450');
    expect(within(rowOf(swiggy())).queryByText('Already in your ledger')).not.toBeInTheDocument();
    expect(within(rowOf(swiggy())).getByRole('checkbox')).toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Import 2 transactions' })).toBeInTheDocument();
  });

  it('flags a later row that now repeats the corrected one', async () => {
    const twice = [
      'Date,Description,Debit,Credit,Balance',
      '03/11/2026,SWIGGY BANGALORE,450.00,,9550.00',
      '03/11/2026,SWIGGY BANGALORE,460.00,,9090.00',
    ].join('\n');
    const { dialog } = renderSheet();
    const confirm = await chooseFile(dialog, csvFile(twice, 'twice.csv'));
    expect(confirm).toHaveTextContent('Import 2 transactions');

    const [first, second] = within(dialog).getAllByRole('textbox', { name: 'Amount for Swiggy' });
    retype(first, '460');

    expect(within(rowOf(second)).getByText('Repeated in this file')).toBeInTheDocument();
    expect(within(rowOf(second)).getByRole('checkbox')).not.toBeChecked();
    expect(within(rowOf(first)).getByRole('checkbox')).toBeChecked();
    expect(within(dialog).getByRole('button', { name: 'Import 1 transaction' })).toBeInTheDocument();
  });

  it('keeps the correction when the sheet is closed and the review resumed', async () => {
    const first = renderSheet();
    await chooseFile(first.dialog);
    retype(amountOf(first.dialog, 'Amount for Swiggy'), '475.25');
    fireEvent.click(within(first.dialog).getByRole('button', { name: 'Close import' }));
    cleanup();

    const second = renderSheet();
    fireEvent.click(within(second.dialog).getByRole('button', { name: 'Resume' }));
    const confirm = await within(second.dialog).findByRole('button', { name: 'Import 2 transactions' });

    const swiggy = amountOf(second.dialog, 'Amount for Swiggy');
    expect(swiggy).toHaveValue('475.25');
    expect(rowOf(swiggy)).toHaveTextContent('statement ₹450');
    fireEvent.click(confirm);
    expect(second.onImport.mock.calls[0][0][0].amount).toBe(475.25);
  });

  it('still imports nothing, and keeps the correction, when the page cannot save', async () => {
    const { dialog, onImport, onClose } = renderSheet();
    onImport.mockReturnValue(false);
    const confirm = await chooseFile(dialog);
    retype(amountOf(dialog, 'Amount for Swiggy'), '475.25');

    fireEvent.click(confirm);

    expect(onClose).not.toHaveBeenCalled();
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/Nothing was imported/);
    expect(amountOf(dialog, 'Amount for Swiggy')).toHaveValue('475.25');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close import' }));
    expect((staged()?.drafts[0] as DraftRow).amount).toBe(475.25);
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

  it('corrects an amount without touching what the statement said or where the category came from', async () => {
    const { result } = await reviewing();
    const before = result.current.drafts[0];

    act(() => result.current.editAmount(before.id, '475.254'));
    // Nothing is applied while it is still being typed.
    expect(result.current.amountEdit).toEqual({ id: before.id, text: '475.254' });
    expect(result.current.drafts[0]).toBe(before);

    act(() => result.current.settleAmount());

    const after = result.current.drafts[0];
    expect(result.current.amountEdit).toBeNull();
    expect(after.amount).toBe(475.25);
    expect(after.source).toEqual(before.source);
    expect([after.origin, after.confidence, after.category, after.include])
      .toEqual([before.origin, before.confidence, before.category, before.include]);
    expect(result.current.summary.total).toBe(695.75);
  });

  it('keeps money in as money in at its new size, and still unticked', async () => {
    const { result } = await reviewing();
    const salary = result.current.drafts[2];

    act(() => result.current.editAmount(salary.id, '51000'));
    act(() => result.current.settleAmount());

    expect(result.current.drafts[2]).toMatchObject({ amount: -51000, include: false });
    expect(result.current.drafts[2].issues).toContain('credit');
  });

  it('turns away anything that is not an amount above zero, and leaves the rows as they were', async () => {
    const { result } = await reviewing();
    const before = result.current.drafts;

    for (const text of ['', '0', '-5', '0.004', 'abc']) {
      act(() => result.current.editAmount(before[0].id, text));
      act(() => result.current.settleAmount());
      expect(result.current.amountRefusal).toMatchObject({ id: before[0].id });
      expect(result.current.amountEdit).toBeNull();
    }

    expect(result.current.drafts).toBe(before);
  });

  it('settling with nothing typed changes nothing', async () => {
    const { result } = await reviewing();
    const before = result.current.drafts;

    act(() => result.current.settleAmount());

    expect(result.current.drafts).toBe(before);
    expect(result.current.amountRefusal).toBeNull();
  });

  it('imports the amount still being typed', async () => {
    const { result } = await reviewing();
    act(() => result.current.editAmount(result.current.drafts[0].id, '475.25'));
    const save = vi.fn<(items: ExpenseItem[]) => boolean>(() => true);

    let went = false;
    act(() => { went = result.current.confirm(save); });

    expect(went).toBe(true);
    expect(save.mock.calls[0][0].map((item) => item.amount)).toEqual([475.25, 220.5]);
  });

  it('imports nothing while the amount being typed cannot be taken, then imports what the row has', async () => {
    const { result } = await reviewing();
    const id = result.current.drafts[0].id;
    act(() => result.current.editAmount(id, '0'));
    const save = vi.fn<(items: ExpenseItem[]) => boolean>(() => true);

    let went = true;
    act(() => { went = result.current.confirm(save); });

    expect(went).toBe(false);
    expect(save).not.toHaveBeenCalled();
    expect(result.current.amountEdit).toBeNull();
    expect(result.current.amountRefusal).toEqual({ id, reason: 'Enter an amount above zero.' });

    act(() => { went = result.current.confirm(save); });
    expect(went).toBe(true);
    expect(save.mock.calls[0][0][0].amount).toBe(450);
  });

  it('keeps the correction on screen when the amount being typed was taken but the page could not save', async () => {
    const { result } = await reviewing();
    act(() => result.current.editAmount(result.current.drafts[0].id, '475.25'));

    let went = true;
    act(() => { went = result.current.confirm(() => false); });

    expect(went).toBe(false);
    expect(result.current.saveError).toMatch(/Nothing was imported/);
    expect(result.current.drafts[0].amount).toBe(475.25);
  });

  it('stashes an amount still being typed only when the row can take it', async () => {
    const { result } = await reviewing();
    const id = result.current.drafts[0].id;

    act(() => result.current.editAmount(id, '475.25'));
    act(() => result.current.stash());
    expect((staged()?.drafts[0] as DraftRow).amount).toBe(475.25);

    act(() => result.current.editAmount(id, 'abc'));
    act(() => result.current.stash());
    expect((staged()?.drafts[0] as DraftRow).amount).toBe(450);
  });

  it('drops what was being typed only for the row it was typed into', async () => {
    const { result } = await reviewing();
    const [first, second] = result.current.drafts;
    act(() => result.current.editAmount(first.id, '47'));

    act(() => result.current.dropAmountEdit(second.id));
    expect(result.current.amountEdit).toEqual({ id: first.id, text: '47' });

    act(() => result.current.dropAmountEdit(first.id));
    expect(result.current.amountEdit).toBeNull();
    expect(result.current.drafts[0]).toBe(first);
  });

  it('forgets what was being typed when the review starts over', async () => {
    const { result } = await reviewing();
    act(() => result.current.editAmount(result.current.drafts[0].id, '0'));
    act(() => result.current.settleAmount());
    act(() => result.current.editAmount(result.current.drafts[1].id, '300'));

    act(() => result.current.reset());

    expect(result.current.amountEdit).toBeNull();
    expect(result.current.amountRefusal).toBeNull();
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

describe('readAmountEdit', () => {
  it.each([
    ['450', 450],
    ['  450.5 ', 450.5],
    ['12.349', 12.35],
    ['1200/2', 600],
    ['=10+5', 15],
  ])('reads %j as %d', (typed, value) => {
    expect(readAmountEdit(typed)).toMatchObject({ ok: true, value });
  });

  it.each(['', '   ', '0', '0.004', '-1', '5-10', 'abc', '12+', '1e3'])('refuses %j with a reason', (typed) => {
    const reading = readAmountEdit(typed);
    expect(reading.ok).toBe(false);
    expect(!reading.ok && reading.error).toMatch(/\.$/);
  });
});

describe('amendAmount', () => {
  /** A row as the sheet holds it: read cleanly, categorised by a rule, and ticked. */
  const draft = (id: string, over: Partial<DraftRow> = {}): DraftRow => ({
    id,
    source: {
      line: 2, date: '2026-11-03', postedDate: null, description: 'SWIGGY BANGALORE',
      amount: 450, direction: 'debit', balance: null, reference: null, currency: null,
    },
    include: true,
    date: '2026-11-03',
    amount: 450,
    merchant: 'Swiggy',
    note: 'SWIGGY BANGALORE',
    category: 'eating_out',
    origin: 'rule',
    confidence: 88,
    issues: [],
    duplicateOf: null,
    duplicateInBatch: null,
    ...over,
  });

  /** The same order, already logged by hand. */
  const LOGGED: ExpenseItem[] = [
    { id: 'e1', amount: 450, category: 'eating_out', date: '2026-11-03', merchant: 'Swiggy' },
  ];

  /** A row whose amount the statement left out: blocked, so unticked. */
  const blank = () => draft('a', {
    amount: 0, include: false, issues: ['no-amount'], source: { ...draft('a').source, amount: null },
  });

  it('ticks a row once the amount the statement left out has been typed in', () => {
    const [after] = amendAmount([blank()], 'a', 450, []);

    expect(after).toMatchObject({ amount: 450, include: true, issues: [] });
    // That the statement gave no amount is still on record.
    expect(after.source.amount).toBeNull();
  });

  it('does not tick it when the amount typed in makes it a duplicate', () => {
    const [after] = amendAmount([blank()], 'a', 450, LOGGED);

    expect(after).toMatchObject({ amount: 450, include: false, duplicateOf: 'e1' });
  });

  it('leaves a row the user unticked unticked', () => {
    const [after] = amendAmount([draft('a', { include: false })], 'a', 475, []);

    expect(after).toMatchObject({ amount: 475, include: false });
  });

  it('leaves a flagged row the user ticked back on alone when a different row is corrected', () => {
    const tickedBackOn = draft('a', { duplicateOf: 'e1' });
    const uber = draft('b', {
      date: '2026-11-05', amount: 220.5, merchant: 'Uber', note: 'UBER TRIP', category: 'transport',
      source: { ...draft('b').source, date: '2026-11-05', description: 'UBER TRIP', amount: 220.5 },
    });

    const after = amendAmount([tickedBackOn, uber], 'b', 300, LOGGED);

    expect(after[0]).toMatchObject({ duplicateOf: 'e1', include: true });
    expect(after[1]).toMatchObject({ amount: 300, include: true });
  });

  it('unticks that row after all when the correction is what it now repeats', () => {
    const earlier = draft('a', { amount: 300, source: { ...draft('a').source, amount: 300 } });
    const tickedBackOn = draft('b', { duplicateOf: 'e1' });

    const after = amendAmount([earlier, tickedBackOn], 'a', 450, LOGGED);

    expect(after[0]).toMatchObject({ amount: 450, duplicateOf: 'e1', include: false });
    expect(after[1]).toMatchObject({ duplicateOf: 'e1', duplicateInBatch: 'a', include: false });
  });

  it('ticks a held-back row again once the correction means it repeats nothing', () => {
    const first = draft('a');
    const repeat = draft('b', { include: false, duplicateInBatch: 'a' });

    const after = amendAmount([first, repeat], 'a', 540, []);

    expect(after[0]).toMatchObject({ amount: 540, include: true });
    expect(after[1]).toMatchObject({ duplicateInBatch: null, include: true });
  });

  it('leaves a released row unticked when it was read from a picture, or is money in', () => {
    const fromPhoto = draft('a', { include: false, duplicateOf: 'e1', issues: ['recognised-text'] });
    const moneyIn = draft('b', {
      include: false, duplicateOf: 'e2', amount: -900, issues: ['credit'],
      source: { ...draft('b').source, amount: 900, direction: 'credit' },
    });
    const ledger: ExpenseItem[] = [...LOGGED, { id: 'e2', amount: -900, category: 'eating_out', date: '2026-11-03', merchant: 'Swiggy' }];

    const photo = amendAmount([fromPhoto, moneyIn], 'a', 480, ledger);
    expect(photo[0]).toMatchObject({ amount: 480, duplicateOf: null, include: false });

    const credit = amendAmount([fromPhoto, moneyIn], 'b', 950, ledger);
    expect(credit[1]).toMatchObject({ amount: -950, duplicateOf: null, include: false });
  });

  it('returns the same rows when nothing would change', () => {
    const rows = [draft('a')];

    expect(amendAmount(rows, 'a', 450, [])).toBe(rows);
    expect(amendAmount(rows, 'missing', 500, [])).toBe(rows);
    expect(amendAmount(rows, 'a', 0, [])).toBe(rows);
    expect(amendAmount(rows, 'a', Number.NaN, [])).toBe(rows);
  });
});
