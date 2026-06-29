import { describe, it, expect } from 'vitest';
import { SYNC_KEYS } from '../tools/cloudSync';

describe('cloudSync SYNC_KEYS', () => {
  it('covers every key the tools persist to localStorage', () => {
    const expected = [
      'fx_expenses',
      'fx_budget',
      'fx_budgets',
      'fx_bb_data',
      'fx_currency',
      'fx_lifemap',
      'fx_investmatch',
      'fx_parksmart',
      'fx_peercompare',
      'fx_goals',
    ];
    for (const key of expected) {
      expect(SYNC_KEYS).toContain(key);
    }
  });

  it('has no duplicate keys', () => {
    expect(new Set(SYNC_KEYS).size).toBe(SYNC_KEYS.length);
  });
});
