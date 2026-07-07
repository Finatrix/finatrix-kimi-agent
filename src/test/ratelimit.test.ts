/**
 * Unit tests for the edge functions' shared burst rate limiter. The module is
 * plain TypeScript (no Deno APIs), so it is testable directly from Vitest.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { rateLimited } from '../../supabase/functions/_shared/ratelimit';

afterEach(() => {
  vi.useRealTimers();
});

describe('edge rate limiter', () => {
  it('allows up to max calls in the window and blocks the next one', () => {
    const key = `u-${Math.random()}`;
    for (let i = 0; i < 5; i++) expect(rateLimited(key, 5)).toBe(false);
    expect(rateLimited(key, 5)).toBe(true);
    expect(rateLimited(key, 5)).toBe(true);
  });

  it('frees capacity after the window slides past old hits', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T00:00:00Z'));
    const key = `u-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimited(key, 3, 60_000)).toBe(false);
    expect(rateLimited(key, 3, 60_000)).toBe(true);
    vi.setSystemTime(new Date('2026-07-07T00:01:01Z')); // window expired
    expect(rateLimited(key, 3, 60_000)).toBe(false);
  });

  it('tracks keys independently — one noisy user cannot exhaust another', () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    for (let i = 0; i < 4; i++) rateLimited(a, 4);
    expect(rateLimited(a, 4)).toBe(true);
    expect(rateLimited(b, 4)).toBe(false);
  });

  it('a blocked call does not consume capacity (denials never extend the block)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T00:00:00Z'));
    const key = `u-${Math.random()}`;
    rateLimited(key, 1, 60_000);              // uses the only slot at t=0
    vi.setSystemTime(new Date('2026-07-07T00:00:30Z'));
    expect(rateLimited(key, 1, 60_000)).toBe(true);   // blocked, must not re-arm
    vi.setSystemTime(new Date('2026-07-07T00:01:01Z'));
    expect(rateLimited(key, 1, 60_000)).toBe(false);  // original hit expired
  });
});
