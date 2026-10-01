import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import TransactionModal, { type FlatCat } from '../tools/ui/TransactionModal';
import { learnCategoryWords, parseQuickAdd, suggestExpenseCategory } from '../tools/lib/quickAdd';
import { QuickAddBar } from '../tools/ui/QuickAddBar';
import { buildCommands, searchCommands, spendCommandFor } from '../tools/lib/commands';

const cats: FlatCat[] = [
  { k: 'groceries', l: 'Groceries', ic: 'grocery', section: 'needs' },
  { k: 'eating_out', l: 'Eating out', ic: 'food', section: 'wants' },
  { k: 'transport', l: 'Transport', ic: 'transport', section: 'needs' },
  { k: 'subscriptions', l: 'Subscriptions', ic: 'subs', section: 'wants' },
  { k: 'shopping', l: 'Shopping', ic: 'shopping', section: 'wants' },
];
const vocabulary = { categories: cats };
afterEach(cleanup);

describe('category recognition', () => {
  it.each([
    ['Uber Eats', 'eating_out'], ['Uber', 'transport'], ['Amazon Prime', 'subscriptions'],
    ['Coles', 'groceries'], ['Woolworths', 'groceries'], ['Tesco', 'groceries'],
    ["Sainsbury's", 'groceries'], ['FairPrice', 'groceries'], ['Spotify', 'subscriptions'],
  ])('recognises %s without needing an amount', (name, category) => {
    expect(suggestExpenseCategory(name, vocabulary)?.category).toBe(category);
    expect(parseQuickAdd(`25 ${name}`, new Date(2026, 8, 17), vocabulary).category).toBe(category);
  });
  it('abstains for unknown names, substrings, and equally strong conflicting names', () => {
    for (const name of ['someone', 'uberish', 'coffee taxi']) {
      expect(suggestExpenseCategory(name, vocabulary)).toBeNull();
    }
  });
  it('counts a merchant repeated in its description only once per transaction', () => {
    const learned = learnCategoryWords([
      { merchant: 'Acme', note: 'Acme', category: 'shopping' },
      { merchant: 'Acme', category: 'groceries' },
    ], new Set(cats.map((c) => c.k)));
    expect(learned.has('acme')).toBe(false);
  });
  it('uses history and respects the active category list', () => {
    const learned = new Map([['acme', 'subscriptions']]);
    expect(suggestExpenseCategory('Acme', { categories: cats, learned })).toEqual({ category: 'subscriptions', source: 'history' });
    expect(suggestExpenseCategory('Acme', { categories: cats.slice(0, 2), learned })).toBeNull();
  });
  it('does not roll an impossible explicit date into another month', () => {
    const result = parseQuickAdd('20 coffee 2026-02-30', new Date(2026, 8, 17), vocabulary);
    expect(result.date).toBe('2026-09-17');
    expect(result.note).toContain('2026-02-30');
  });
});

function open(editing: Parameters<typeof TransactionModal>[0]['editing'] = null) {
  const onSave = vi.fn();
  render(<TransactionModal editing={editing} cats={cats} sym="$" defaultCat="groceries"
    onSave={onSave} onClose={() => {}} />);
  return onSave;
}

describe('smart full expense form', () => {
  it('auto-selects while typing, explains the choice, and saves only after confirmation', () => {
    const save = open();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Spotify' } });
    expect(screen.getByRole('button', { name: /^Subscriptions/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Auto-selected Subscriptions');
    expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Amount/), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add transaction' }));
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ category: 'subscriptions', amount: 20, note: 'Spotify' }));
  });
  it('keeps manual choices and can explicitly resume automation', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /^Shopping/ }));
    fireEvent.change(screen.getByLabelText('Merchant'), { target: { value: 'Coles' } });
    expect(screen.getByRole('button', { name: /^Shopping/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Use automatic category' }));
    expect(screen.getByRole('button', { name: /^Groceries/ })).toHaveAttribute('aria-pressed', 'true');
  });
  it('clears a stale automatic guess when the name becomes unknown', () => {
    open();
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Spotify' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Unknown' } });
    expect(screen.getByRole('button', { name: /^Groceries/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('status')).not.toHaveTextContent('Auto-selected');
  });
  it('preserves the category of an existing transaction when its description changes', () => {
    open({ id: 'existing', amount: 20, date: '2026-09-17', category: 'shopping' });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Spotify' } });
    expect(screen.getByRole('button', { name: /^Shopping/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

it('finds tools from requests with filler words and multiple keywords', () => {
  const commands = buildCommands({ signedIn: false, currency: 'AUD', theme: 'dark', surface: 'money' });
  expect(searchCommands('help me plan my salary', commands)[0].id).toBe('tool:budget');
  expect(searchCommands('show my spending tracker', commands)[0].id).toBe('tool:expenses');
  expect(searchCommands('please export my report', commands)[0].id).toBe('workspace:reports');
});

it('previews a category from a name alone in quick entry without allowing an incomplete save', () => {
  const onAdd = vi.fn();
  render(<QuickAddBar cats={cats} now={new Date(2026, 8, 17)} cfmt={String}
    onAdd={onAdd} fallbackCategory="groceries" />);
  fireEvent.change(screen.getByLabelText('Quick add'), { target: { value: 'Spotify' } });
  expect(screen.getByText(/Subscriptions selected/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  expect(onAdd).not.toHaveBeenCalled();
});

it('hands refunds to the existing review flow from command search', () => {
  expect(spendCommandFor('-25 coffee refund', new Date())?.title).toBe('Log refund: -25 coffee refund');
});
