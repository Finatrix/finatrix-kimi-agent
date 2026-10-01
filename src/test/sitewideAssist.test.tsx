import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { reviewExpenseRecords, validRecordDate } from '../tools/lib/recordReview';
import { workspaceReview } from '../tools/lib/workspaceReview';
import { ExpenseRecordReview } from '../tools/ui/ExpenseRecordReview';
import { WorkspaceNavigator } from '../tools/ui/WorkspaceNavigator';
import { DataReadiness } from '../tools/ui/DataReadiness';
import ReferencePage from '../tools/pages/ReferencePage';
import { evaluateFreshness } from '../reference';
import type { ExpenseItem } from '../tools/lib/expense';

const expense: ExpenseItem = { id: '1', amount: 25, category: 'rent', date: '2026-09-02', merchant: 'Shop', paymentMethod: 'Cash' };
const keys = new Set(['rent']);
const now = new Date(2026, 8, 18);
beforeEach(() => { cleanup(); localStorage.clear(); });

describe('explainable expense review', () => {
  it('rejects impossible dates including non-leap February, and accepts leap days', () => {
    expect(validRecordDate('2026-02-30')).toBe(false);
    expect(validRecordDate('2026-02-29')).toBe(false);
    expect(validRecordDate('2024-02-29')).toBe(true);
    expect(validRecordDate('2026-13-01')).toBe(false);
  });
  it('only suggests a match when descriptive evidence and payment method agree', () => {
    const items = [expense, { ...expense, id: '2', merchant: ' SHOP ' }, { ...expense, id: '3', paymentMethod: 'Credit card' }];
    expect(reviewExpenseRecords(items, keys, now).map(f => [f.kind, f.item.id])).toEqual([['duplicate', '2']]);
    expect(reviewExpenseRecords([{ ...expense, merchant: '' }, { ...expense, id: '2', merchant: '' }], keys, now)).toEqual([]);
    expect(items).toHaveLength(3);
  });
  it('detects invalid amounts, future dates and unknown categories independently', () => {
    const findings = reviewExpenseRecords([{ ...expense, amount: Infinity, date: '2026-12-10', category: 'missing' }], keys, now);
    expect(findings.map(f => f.kind)).toEqual(['date', 'amount', 'category']);
  });
  it('accepts a negative refund while identifying a zero-value expense', () => {
    expect(reviewExpenseRecords([{ ...expense, amount: -25 }], keys, now)).toEqual([]);
    expect(reviewExpenseRecords([{ ...expense, amount: 0 }], keys, now).map(f => f.kind)).toEqual(['amount']);
  });
  it('filters review hints and opens the exact original entry without changing it', () => {
    const duplicate = { ...expense, id: 'second' };
    const onEdit = vi.fn();
    render(<ExpenseRecordReview items={[expense, duplicate]} validKeys={keys} onEdit={onEdit} cfmt={String} />);
    fireEvent.click(screen.getByText(/review hints across/));
    fireEvent.change(screen.getByLabelText('Review type'), { target: { value: 'duplicate' } });
    fireEvent.click(screen.getByRole('button', { name: /Review Shop: Possible duplicates/ }));
    expect(onEdit).toHaveBeenCalledWith(duplicate);
    expect(localStorage.getItem('fx_expenses')).toBeNull();
  });
});

describe('workspace readiness', () => {
  it('distinguishes no records from corrupt and unexpected shapes', () => {
    const source: Record<string, string> = { fx_expenses: '{', fx_goals: '[]' };
    const rows = workspaceReview(key => source[key] ?? null, '2026-09');
    expect(rows.find(r => r.id === 'expenses')?.status).toBe('review');
    expect(rows.find(r => r.id === 'goals')?.status).toBe('review');
    expect(rows.find(r => r.id === 'budget')?.status).toBe('empty');
  });
  it('never substitutes previous-month records or treats zero balances as missing', () => {
    const source: Record<string, string> = {
      fx_bb_data: JSON.stringify({ '2026-08': { income: '5000' } }),
      fx_expenses: JSON.stringify([expense]),
      fx_networth: JSON.stringify([{ balances: { '2026-09': 0 } }]),
    };
    const rows = workspaceReview(key => source[key] ?? null, '2026-09');
    expect(rows.find(r => r.id === 'budget')?.status).toBe('review');
    expect(rows.find(r => r.id === 'expenses')?.status).toBe('saved');
    expect(rows.find(r => r.id === 'networth')?.status).toBe('saved');
  });
  it('opens and filters the data-gap queue with the shortcut', () => {
    localStorage.setItem('fx_goals', '[]');
    render(<MemoryRouter><WorkspaceNavigator /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Review 1 data gaps' }));
    expect(screen.getByRole('link', { name: 'Open Reverse Goal Planner' })).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Open Budget Builder' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Search your tools'), { target: { value: 'nonexistent' } });
    expect(screen.getByRole('status')).toHaveTextContent('0 tools match');
  });
  it('data check diagnoses shapes without modifying or exposing amounts', () => {
    localStorage.setItem('fx_expenses', '{broken');
    render(<MemoryRouter><DataReadiness /></MemoryRouter>);
    expect(screen.getByRole('status')).toHaveTextContent('1 tools need a data review');
    expect(screen.getByRole('link', { name: 'Review Expense Tracker' })).toHaveAttribute('href', '/tools/expenses');
    expect(localStorage.getItem('fx_expenses')).toBe('{broken');
  });
});

describe('reference assistance', () => {
  it('filters topics and source evidence without changing the saved market', () => {
    localStorage.setItem('fx_market', 'IN');
    render(<MemoryRouter><ReferencePage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Market'), { target: { value: 'AU' } });
    fireEvent.change(screen.getByLabelText('Focus on a topic'), { target: { value: 'deposit' } });
    expect(screen.getByRole('heading', { name: 'Deposit protection' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Income tax' })).toBeNull();
    fireEvent.click(screen.getByText('Search official sources and review dates'));
    fireEvent.change(screen.getByLabelText('Find an authority, topic or rule'), { target: { value: 'APRA' } });
    const region = screen.getByRole('region', { name: 'Find and check a source' });
    expect(within(region).getAllByRole('link').length).toBeGreaterThan(0);
    expect(within(region).getAllByRole('link').every(link => link.textContent?.includes('APRA'))).toBe(true);
    expect(localStorage.getItem('fx_market')).toBe('IN');
  });
});


describe('reference date accuracy', () => {
  it('does not roll an impossible review date into a valid month', () => {
    const verdict = evaluateFreshness({ quality: 'VERIFIED_CURRENT', reviewDue: '2026-02-30', lastVerified: '2026-02-01' }, new Date(2026, 1, 15));
    expect(verdict.state).toBe('REVIEW_DUE');
    expect(verdict.notice).toContain('no usable review date');
  });
  it('counts calendar days across a daylight-saving boundary', () => {
    const verdict = evaluateFreshness({ quality: 'VERIFIED_CURRENT', reviewDue: '2026-10-03', lastVerified: '2026-10-01' }, new Date(2026, 9, 5));
    expect(verdict.daysOverdue).toBe(2);
  });
});
