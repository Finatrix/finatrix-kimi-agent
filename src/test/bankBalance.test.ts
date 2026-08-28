import { describe, it, expect, beforeEach } from 'vitest';
import {
  inheritedOpening, isSignificantDiscrepancy, loadBankStore, reconcileBank,
  saveBankStore, setBankField, type BankStore,
} from '../tools/lib/bankBalance';
import type { ExpenseItem } from '../tools/lib/expense';

/**
 * The reconciliation exists to answer one question the ledger cannot: is that
 * all of it. Everything below is about that number being right, and about the
 * carry-forward chain that means the user types one figure a month rather than
 * two.
 */

const KEYS = new Set(['groceries', 'eating_out', 'emergency']);

let seq = 0;
const tx = (date: string, category: string, amount: number): ExpenseItem =>
  ({ id: `t${++seq}`, date, category, amount });

describe('carry-forward', () => {
  it('opens a month at the previous month’s closing balance', () => {
    const store: BankStore = { '2026-04': { closing: 12000 } };
    const rec = reconcileBank({ store, month: '2026-05', items: [], income: 0, validKeys: KEYS });
    expect(rec.opening).toBe(12000);
    expect(rec.openingSource).toBe('carried');
    expect(rec.carriedFrom).toBe('2026-04');
  });

  it('lets an explicitly recorded opening beat the carried one', () => {
    // How somebody corrects a chain that has drifted, rather than fighting it.
    const store: BankStore = { '2026-04': { closing: 12000 }, '2026-05': { opening: 11850 } };
    const rec = reconcileBank({ store, month: '2026-05', items: [], income: 0, validKeys: KEYS });
    expect(rec.opening).toBe(11850);
    expect(rec.openingSource).toBe('recorded');
  });

  it('reaches back past months that recorded nothing', () => {
    const store: BankStore = { '2026-01': { closing: 9000 } };
    expect(inheritedOpening(store, '2026-04')).toEqual({ value: 9000, from: '2026-01' });
  });

  it('gives up rather than looping forever when the chain is empty', () => {
    expect(inheritedOpening({}, '2026-04')).toBeNull();
  });

  it('reports itself inapplicable with no opening balance anywhere', () => {
    const rec = reconcileBank({ store: {}, month: '2026-05', items: [], income: 0, validKeys: KEYS });
    expect(rec.applicable).toBe(false);
    expect(rec.openingSource).toBe('none');
    expect(rec.expectedClosing).toBeNull();
  });
});

describe('the reconciliation', () => {
  const items = [
    tx('2026-05-02', 'groceries', 4000),
    tx('2026-05-09', 'eating_out', 1500),
    tx('2026-05-15', 'emergency', 10000), // a savings transfer
    tx('2026-04-30', 'groceries', 999),   // a different month
  ];

  it('expects opening + income − everything logged', () => {
    const store: BankStore = { '2026-05': { opening: 20000 } };
    const rec = reconcileBank({ store, month: '2026-05', items, income: 50000, validKeys: KEYS });
    expect(rec.outflow).toBe(15500);
    expect(rec.expectedClosing).toBe(20000 + 50000 - 15500);
  });

  it('counts savings transfers in the outflow', () => {
    // Unlike almost every other figure in the product, which carefully separates
    // consumption from money set aside. A SIP debit leaves the bank account
    // exactly as a restaurant bill does, and excluding it would report every
    // disciplined saver as having thousands of unexplained spending each month.
    const store: BankStore = { '2026-05': { opening: 20000 } };
    const rec = reconcileBank({ store, month: '2026-05', items, income: 0, validKeys: KEYS });
    expect(rec.outflow).toBe(15500);
  });

  it('names an unexplained shortfall as spending that was not logged', () => {
    const store: BankStore = { '2026-05': { opening: 20000, closing: 54100 } };
    const rec = reconcileBank({ store, month: '2026-05', items, income: 50000, validKeys: KEYS });
    // Expected 54,500; the bank says 54,100 — 400 left that nobody recorded.
    expect(rec.unrecorded).toBe(-400);
    expect(isSignificantDiscrepancy(rec.unrecorded, rec.outflow, rec.income)).toBe(true);
  });

  it('names an unexplained surplus as money that arrived unlogged', () => {
    const store: BankStore = { '2026-05': { opening: 20000, closing: 55000 } };
    const rec = reconcileBank({ store, month: '2026-05', items, income: 50000, validKeys: KEYS });
    expect(rec.unrecorded).toBe(500);
  });

  it('holds its tongue about rounding, card holds and bank fees', () => {
    const store: BankStore = { '2026-05': { opening: 20000, closing: 54499 } };
    const rec = reconcileBank({ store, month: '2026-05', items, income: 50000, validKeys: KEYS });
    expect(rec.unrecorded).toBe(-1);
    expect(isSignificantDiscrepancy(rec.unrecorded, rec.outflow, rec.income)).toBe(false);
  });

  it('scales the threshold with what actually moved', () => {
    // The same rule has to mean something to a household moving 500 a month and
    // to one moving five million, so it is proportional with an absolute floor.
    expect(isSignificantDiscrepancy(-3, 400, 0)).toBe(true);     // 3 of 400
    expect(isSignificantDiscrepancy(-3, 4_000_000, 0)).toBe(false); // 3 of 4m
    expect(isSignificantDiscrepancy(-30_000, 4_000_000, 0)).toBe(true);
  });

  it('says nothing at all until the closing balance is recorded', () => {
    const store: BankStore = { '2026-05': { opening: 20000 } };
    const rec = reconcileBank({ store, month: '2026-05', items, income: 50000, validKeys: KEYS });
    expect(rec.closing).toBeNull();
    expect(rec.unrecorded).toBeNull();
    expect(rec.netChange).toBeNull();
  });
});

describe('storage', () => {
  beforeEach(() => localStorage.clear());

  it('round-trips what was written', () => {
    saveBankStore({ '2026-05': { opening: 100, closing: 200 } });
    expect(loadBankStore()).toEqual({ '2026-05': { opening: 100, closing: 200 } });
  });

  it('drops junk keys and junk values rather than trusting them', () => {
    localStorage.setItem('fx_exp_bank', JSON.stringify({
      'not-a-month': { opening: 1 },
      '2026-13': { opening: 1 },
      '2026-05': { opening: 'abc', closing: 200 },
    }));
    expect(loadBankStore()).toEqual({ '2026-05': { closing: 200 } });
  });

  it('removes a month entirely when its last field is cleared', () => {
    // An empty `{}` in the store is a month that looks recorded and is not.
    let store: BankStore = { '2026-05': { opening: 100 } };
    store = setBankField(store, '2026-05', 'opening', null);
    expect(store['2026-05']).toBeUndefined();
  });

  it('keeps the other field when one is cleared', () => {
    let store: BankStore = { '2026-05': { opening: 100, closing: 200 } };
    store = setBankField(store, '2026-05', 'opening', null);
    expect(store['2026-05']).toEqual({ closing: 200 });
  });
});
