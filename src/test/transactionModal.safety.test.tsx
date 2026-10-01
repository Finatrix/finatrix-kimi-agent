import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import TransactionModal, { type FlatCat } from '../tools/ui/TransactionModal';
import type { ExpenseItem } from '../tools/lib/expense';

const cats: FlatCat[] = [{ k: 'groceries', l: 'Groceries', ic: 'grocery', section: 'needs' }];
const item: ExpenseItem = { id: 'saved', amount: 20, date: '2026-09-15', category: 'groceries' };

beforeEach(cleanup);

function renderModal(editing: ExpenseItem | null = null) {
  const onSave = vi.fn();
  const onDelete = vi.fn();
  const onClose = vi.fn();
  render(<TransactionModal editing={editing} cats={cats} sym="$" defaultCat="groceries"
    todayKey="2026-09-30" scheduleLimit="2026-10-31" onSave={onSave} onDelete={onDelete} onClose={onClose} />);
  return { onSave, onDelete, onClose };
}

describe('transaction date validation', () => {
  it('rejects a date after the planning horizon even when native validation is disabled', () => {
    const { onSave } = renderModal();
    fireEvent.change(screen.getByLabelText(/^Amount/), { target: { value: '20' } });
    const date = screen.getByLabelText('Date');
    fireEvent.change(date, { target: { value: '2026-11-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Choose a date on or before 2026-10-31.');
    expect(date).toHaveFocus();

    fireEvent.change(date, { target: { value: '2026-10-31' } });
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ amount: 20, date: '2026-10-31' }));
  });

  it('rejects an invalid existing calendar date instead of persisting it again', () => {
    const { onSave } = renderModal({ ...item, date: '2026-02-30' });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a valid calendar date.');
  });
});

describe('transaction deletion confirmation', () => {
  it('keeps Tab within the confirmation and restores focus when canceled', () => {
    renderModal(item);
    const trigger = screen.getByRole('button', { name: 'Delete' });
    act(() => trigger.focus());
    fireEvent.click(trigger);
    const confirmation = screen.getByRole('alertdialog');
    const cancel = within(confirmation).getByRole('button', { name: 'Cancel' });
    const remove = within(confirmation).getByRole('button', { name: 'Delete' });
    expect(cancel).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(remove).toHaveFocus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(cancel).toHaveFocus();
    fireEvent.click(cancel);
    expect(trigger).toHaveFocus();
  });

  it('does not save the underlying form from the keyboard while deletion is pending', () => {
    const { onSave, onDelete, onClose } = renderModal(item);
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    fireEvent.keyDown(window, { key: 'Enter', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'Enter', metaKey: true });
    expect(onSave).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });
});
