import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { store } from '../tools/lib/storage';
import { DataReadiness } from '../tools/ui/DataReadiness';
import { ExpenseRecordReview } from '../tools/ui/ExpenseRecordReview';
import { downloadBlob } from '../tools/lib/exporters';
import type { ExpenseItem } from '../tools/lib/expense';

vi.mock('../tools/lib/exporters', () => ({ downloadBlob: vi.fn() }));
const FIRST_KEY = 'fx_goals';
const SECOND_KEY = 'fx_lifemap';

function quotaFailure() {
  return vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Storage quota reached', 'QuotaExceededError'); });
}

function blobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

describe('release regressions for finance assistance', () => {
  beforeEach(() => { localStorage.clear(); vi.clearAllMocks(); });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    store.remove(FIRST_KEY);
    store.remove(SECOND_KEY);
    localStorage.clear();
  });

  it('exposes failed writes without losing their session value or changing the older persistent value', () => {
    store.set(FIRST_KEY, 'old');
    expect(store.hasUnpersistedChanges).toBe(false);
    const failure = quotaFailure();
    store.set(FIRST_KEY, 'new');
    store.set(SECOND_KEY, 'second');
    expect(store.hasUnpersistedChanges).toBe(true);
    expect(store.raw(FIRST_KEY)).toBe('new');
    expect(localStorage.getItem(FIRST_KEY)).toBe('old');
    // The initialization capability flag keeps its original meaning.
    expect(store.persistent).toBe(true);
    failure.mockRestore();
    store.set(FIRST_KEY, 'new');
    expect(localStorage.getItem(FIRST_KEY)).toBe('new');
    expect(store.hasUnpersistedChanges).toBe(true);
    store.remove(SECOND_KEY);
    expect(store.hasUnpersistedChanges).toBe(false);
  });

  it('updates the live warning and downloaded check when a device write falls back to memory', async () => {
    render(<MemoryRouter><DataReadiness /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('Device storage is available.');
    const failure = quotaFailure();
    act(() => store.set(FIRST_KEY, JSON.stringify({ 'gp-target': '100000' })));
    expect(screen.getByRole('status')).toHaveTextContent('Some changes are stored only for this session');
    expect(screen.getByRole('status')).toHaveTextContent('Export a backup before closing.');
    fireEvent.click(screen.getByRole('button', { name: 'Download data check' }));
    const blob = vi.mocked(downloadBlob).mock.calls[0][1];
    const exported = JSON.parse(await blobText(blob));
    expect(exported.persistentStorage).toBe(false);
    expect(exported.hasUnpersistedChanges).toBe(true);
    failure.mockRestore();
    act(() => store.set(FIRST_KEY, JSON.stringify({ 'gp-target': '100000' })));
    expect(screen.getByRole('status')).toHaveTextContent('Device storage is available.');
  });

  it('reveals every review hint without requiring edits to legitimate matching records', () => {
    const items: ExpenseItem[] = Array.from({ length: 46 }, (_, index) => ({ id: `entry-${index}`, date: '2020-01-01', amount: 10, category: 'rent', merchant: 'Repeated purchase' }));
    const original = structuredClone(items);
    const onEdit = vi.fn();
    render(<ExpenseRecordReview items={items} validKeys={new Set(['rent'])} onEdit={onEdit} cfmt={(value) => String(value)} />);
    fireEvent.click(screen.getByText(/45 review hints across 46 records/));
    expect(screen.getAllByRole('button', { name: /^Review Repeated purchase:/ })).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: 'Show 20 more review hints' }));
    expect(screen.getAllByRole('button', { name: /^Review Repeated purchase:/ })).toHaveLength(40);
    fireEvent.click(screen.getByRole('button', { name: 'Show 5 more review hints' }));
    const reviewButtons = screen.getAllByRole('button', { name: /^Review Repeated purchase:/ });
    expect(reviewButtons).toHaveLength(45);
    expect(screen.queryByRole('button', { name: /^Show .* more review hints$/ })).not.toBeInTheDocument();
    expect(onEdit).not.toHaveBeenCalled();
    expect(items).toEqual(original);
    fireEvent.click(reviewButtons[44]);
    expect(onEdit).toHaveBeenCalledWith(items[45]);
    fireEvent.change(screen.getByLabelText('Review type'), { target: { value: 'date' } });
    expect(screen.queryByRole('button', { name: /^Show .* more review hints$/ })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Review type'), { target: { value: 'duplicate' } });
    expect(screen.getAllByRole('button', { name: /^Review Repeated purchase:/ })).toHaveLength(20);
  });
});
