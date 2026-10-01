import { describe, expect, it } from 'vitest';
import { confirmUnchangedBalance, reviewNetWorth } from '../tools/lib/netWorthSmartReview';
import type { NetWorthAccount } from '../tools/lib/netWorth';

const options = { displayCurrency: 'INR', convert: (value: number, code: string) => code === 'USD' ? value * 80 : value };
const accounts: NetWorthAccount[] = [
  { id: 'cash', name: 'Cash', kind: 'asset', category: 'cash', balances: { '2026-08': 100, '2026-09': 150 } },
  { id: 'loan', name: 'Loan', kind: 'liability', category: 'home_loan', balances: { '2026-08': 200, '2026-09': 100 } },
  { id: 'usd', name: 'US cash', kind: 'asset', category: 'cash', currency: 'USD', balances: { '2026-07': 10 } },
  { id: 'future', name: 'Future', kind: 'asset', category: 'cash', balances: { '2026-10': 900 } },
];

describe('smart balance review', () => {
  it('ranks carried balances, excludes future accounts and reconciles signed movements', () => {
    const review = reviewNetWorth(accounts, '2026-09', options);
    expect(review.reviewQueue.map((row) => row.account.id)).toEqual(['usd']);
    expect(review.confirmed).toBe(2);
    expect(review.recorded).toBe(3);
    expect(review.movements.map((row) => [row.id, row.change])).toEqual([['loan', 100], ['cash', 50]]);
    expect(review.movements.reduce((sum, row) => sum + row.change, 0)).toBe(review.netChange);
  });
  it('confirms native balance, preserves history, and refuses to overwrite current/future-only accounts', () => {
    const confirmed = confirmUnchangedBalance(accounts, 'usd', '2026-09');
    expect(confirmed[2].balances).toEqual({ '2026-07': 10, '2026-09': 10 });
    expect(accounts[2].balances['2026-09']).toBeUndefined();
    expect(confirmUnchangedBalance(accounts, 'cash', '2026-09')[0]).toBe(accounts[0]);
    expect(confirmUnchangedBalance(accounts, 'future', '2026-09')[3]).toBe(accounts[3]);
  });
  it('detects matching accounts but distinguishes currency and account side', () => {
    const duplicates = reviewNetWorth([
      accounts[0], { ...accounts[0], id: 'copy', name: ' cash ' },
      { ...accounts[0], id: 'dollars', currency: 'USD' },
      { ...accounts[0], id: 'debt', kind: 'liability' },
    ], '2026-09', options).duplicates;
    expect(duplicates.map((row) => row.id)).toEqual(['copy']);
  });
  it('recognises new balances separately from an investment return', () => {
    const review = reviewNetWorth([...accounts, { id: 'new', name: 'New', kind: 'asset', category: 'cash', balances: { '2026-09': 25 } }], '2026-09', options);
    expect(review.movements.find((row) => row.id === 'new')).toMatchObject({ change: 25, firstRecord: true });
  });
});
