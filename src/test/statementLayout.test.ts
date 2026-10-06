import { describe, expect, it } from 'vitest';
import { parseLayout } from '../tools/ai/statementLayout';

describe('parseLayout', () => {
  it('accepts line numbers and nothing else', () => {
    const reply = JSON.stringify({ items: [
      { amount: 3, name: [3, 4, 'WOOLWORTHS', 99], date: 5, direction: 'debit', total: 6.19, payee: 'Injected Ltd' },
      { amount: '7', name: [6] },
      { amount: 99, name: [1] },
      { amount: 2.5, name: [] },
      { amount: 9, name: [9], date: 400, direction: 'sideways' },
    ] });
    expect(parseLayout(reply, 12)).toEqual([
      { amount: 3, name: [3, 4], date: 5, direction: 'debit' },
      { amount: 9, name: [9], date: null, direction: null },
    ]);
  });

  it('returns nothing for a reply that is not the expected JSON', () => {
    expect(parseLayout('I could not find any transactions.', 12)).toEqual([]);
  });
});
