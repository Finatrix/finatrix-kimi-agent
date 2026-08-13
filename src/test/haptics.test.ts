import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { haptic } from '../lib/haptics';

/** jsdom has neither `vibrate` nor `matchMedia` by default — both are set up here. */
function setup({ vibrate, reduced }: { vibrate?: unknown; reduced?: boolean } = {}) {
  Object.defineProperty(navigator, 'vibrate', {
    value: vibrate, configurable: true, writable: true,
  });
  Object.defineProperty(window, 'matchMedia', {
    value: (q: string) => ({ matches: !!reduced && q.includes('reduced-motion'), media: q }),
    configurable: true, writable: true,
  });
}

describe('haptics', () => {
  beforeEach(() => setup());
  afterEach(() => vi.restoreAllMocks());

  it('is a silent no-op where the platform has no vibration', () => {
    setup({ vibrate: undefined });
    expect(haptic('success')).toBe(false);
  });

  it('fires a pattern when the platform supports it', () => {
    const spy = vi.fn(() => true);
    setup({ vibrate: spy });
    expect(haptic('success')).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });

  /**
   * The whole point of the preference: a device buzzing in someone's hand is
   * exactly the feedback `prefers-reduced-motion` asks to stop.
   */
  it('respects prefers-reduced-motion', () => {
    const spy = vi.fn(() => true);
    setup({ vibrate: spy, reduced: true });
    expect(haptic('success')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('never throws when vibrate itself throws', () => {
    setup({ vibrate: () => { throw new Error('blocked by policy'); } });
    expect(() => haptic('remove')).not.toThrow();
    expect(haptic('remove')).toBe(false);
  });

  it('uses a distinct pattern per event, so they are distinguishable', () => {
    const calls: unknown[] = [];
    setup({ vibrate: (p: unknown) => { calls.push(p); return true; } });
    haptic('success'); haptic('remove'); haptic('warn'); haptic('select');
    expect(new Set(calls.map((c) => JSON.stringify(c))).size).toBe(4);
  });
});
