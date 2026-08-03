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
    expect(budgetTone(1000, 1001)).toBe('over');
    expect(budgetTone(1000, 4000)).toBe('over');
  });

  /**
   * Every amount is displayed rounded to whole units, so the tone is decided on
   * those same figures. Before this, a section limit of `income × pct ÷ 100`
   * — fractional almost always — could not be matched: typing the limit the UI
   * showed you read as `over` and reported "Over by 0", and `complete` needed
   * an exact float nobody can type. See budgetStatus.ts for the full rationale.
   */
  describe('classifies at the precision it displays', () => {
    it('treats the displayed limit as reachable', () => {
      // 30% of 4,039.99 — displays as "1,212", so typing 1212 is "Fully used".
      expect(budgetTone(1211.997, 1212)).toBe('complete');
      expect(budgetTone(1211.9, 1212)).toBe('complete');
      expect(budgetTone(1212, 1211.9)).toBe('complete');
    });

    it('never reports an overspend that rounds away to nothing', () => {
      expect(budgetTone(1000, 1000.01)).not.toBe('over');
      expect(budgetTone(1000, 1000.49)).toBe('complete');
    });

    it('still turns red on a real overspend', () => {
      expect(budgetTone(1211.997, 1213)).toBe('over');
      expect(budgetTone(1000, 1000.51)).toBe('over');
    });

    it('survives floating-point noise in an allocation sum', () => {
      expect(budgetTone(1212, 0.1 + 0.2 + 1211.7)).toBe('complete');
    });

    it('handles a budget that rounds away to zero', () => {
      expect(budgetTone(0.4, 0)).toBe('safe');
      expect(budgetTone(0.4, 10)).toBe('over');
    });
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
