import { describe, it, expect } from 'vitest';
import {
  budgetTone, budgetPct, budgetFillPct, isWarningTone, TONE_COLOR, TONE_LABEL,
} from '../tools/lib/budgetStatus';

/**
 * The progress scale is a product contract, not an implementation detail: the
 * same thresholds drive the bar colour, the pill, the dashboard warnings and
 * the Status column of every exported report.
 */
describe('budgetTone thresholds', () => {
  it('reads "no budget" as grey rather than as zero spend', () => {
    expect(budgetTone(0, 0)).toBe('none');
    expect(budgetTone(0, 5000)).toBe('none');
    expect(budgetTone(-1, 100)).toBe('none');
  });

  it('is green from 0 to 79%', () => {
    expect(budgetTone(1000, 0)).toBe('safe');
    expect(budgetTone(1000, 500)).toBe('safe');
    expect(budgetTone(1000, 789)).toBe('safe');
    expect(budgetTone(1000, 799)).toBe('safe'); // 79.9%
  });

  it('turns orange at 80% and stays orange to 99%', () => {
    expect(budgetTone(1000, 800)).toBe('warn');
    expect(budgetTone(1000, 920)).toBe('warn');
    expect(budgetTone(1000, 999)).toBe('warn');
  });

  it('marks exactly 100% as a distinct success, not a failure', () => {
    expect(budgetTone(1000, 1000)).toBe('complete');
    expect(TONE_COLOR.complete).toBe('var(--blue)');
  });

  it('turns red only once spending passes the budget', () => {
    expect(budgetTone(1000, 1000.01)).toBe('over');
    expect(budgetTone(1000, 4000)).toBe('over');
  });

  it('never uses black for any state', () => {
    Object.values(TONE_COLOR).forEach((c) => {
      expect(c).not.toMatch(/#000|black|rgb\(0,\s*0,\s*0\)/i);
    });
  });

  it('labels every tone', () => {
    (['none', 'safe', 'warn', 'complete', 'over'] as const).forEach((t) => {
      expect(TONE_LABEL[t]).toBeTruthy();
    });
  });
});

describe('budget percentages', () => {
  it('reports the true percentage but clamps the bar width', () => {
    expect(budgetPct(1000, 1500)).toBe(150);
    expect(budgetFillPct(1000, 1500)).toBe(100);
    expect(budgetFillPct(1000, 250)).toBe(25);
    expect(budgetFillPct(0, 250)).toBe(0);
  });

  it('flags exactly the tones that deserve a dashboard warning', () => {
    expect(isWarningTone('warn')).toBe(true);
    expect(isWarningTone('over')).toBe(true);
    expect(isWarningTone('safe')).toBe(false);
    expect(isWarningTone('complete')).toBe(false);
    expect(isWarningTone('none')).toBe(false);
  });
});
