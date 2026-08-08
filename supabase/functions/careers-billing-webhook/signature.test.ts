/**
 * Stripe webhook signature verification.
 *
 * This is the only automated coverage the revenue path has ever had. The
 * webhook is the entire trust boundary for granting a paid subscription, and
 * both directions of failure are expensive:
 *
 *   accepts something it shouldn't → anyone can grant themselves a plan
 *   rejects something it should accept → the customer paid and got nothing
 *
 * The second is the one that actually shipped (see the rotation tests below),
 * and it is the harder one to notice, because it only fails while a secret is
 * being rotated and the only symptom is Stripe's retry queue draining into
 * nothing.
 */

import { describe, it, expect } from 'vitest';
import {
  parseSignatureHeader,
  timingSafeEqual,
  verifyStripeSignature,
  signPayload,
  periodEnd,
  TOLERANCE_SECONDS,
} from './signature.ts';

const SECRET = 'whsec_test_secret';
const OTHER_SECRET = 'whsec_rotated_secret';
const BODY = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_123' } } });

/** Fixed clock so the replay window is exercised deterministically. */
const NOW_MS = 1_754_000_000_000;
const NOW_S = Math.floor(NOW_MS / 1000);

describe('parseSignatureHeader', () => {
  it('reads the timestamp and a single signature', () => {
    expect(parseSignatureHeader('t=1700000000,v1=abc')).toEqual({ t: '1700000000', v1: ['abc'] });
  });

  it('keeps EVERY v1 signature, not just the last', () => {
    // Stripe sends one v1 per active secret during an endpoint-secret rotation.
    // The original implementation folded the header with Object.fromEntries,
    // which silently discarded all but the last.
    expect(parseSignatureHeader('t=1700000000,v1=first,v1=second,v1=third').v1)
      .toEqual(['first', 'second', 'third']);
  });

  it('ignores unknown schemes such as v0', () => {
    const parsed = parseSignatureHeader('t=1700000000,v0=noise,v1=real');
    expect(parsed.v1).toEqual(['real']);
    expect(parsed.t).toBe('1700000000');
  });

  it('tolerates whitespace around parts', () => {
    expect(parseSignatureHeader('t=1700000000, v1=abc, v1=def'))
      .toEqual({ t: '1700000000', v1: ['abc', 'def'] });
  });

  it('splits on the first = only, so values containing = survive', () => {
    expect(parseSignatureHeader('t=1700000000,v1=YWJj==').v1).toEqual(['YWJj==']);
  });

  it('returns empties for null, malformed or valueless headers', () => {
    expect(parseSignatureHeader(null)).toEqual({ t: '', v1: [] });
    expect(parseSignatureHeader('')).toEqual({ t: '', v1: [] });
    expect(parseSignatureHeader('garbage')).toEqual({ t: '', v1: [] });
    expect(parseSignatureHeader('t=,v1=')).toEqual({ t: '', v1: [] });
  });

  it('takes the first timestamp when several are present', () => {
    expect(parseSignatureHeader('t=111,t=222,v1=abc').t).toBe('111');
  });
});

describe('timingSafeEqual', () => {
  it('matches identical strings', () => {
    expect(timingSafeEqual('abc123', 'abc123')).toBe(true);
    expect(timingSafeEqual('', '')).toBe(true);
  });

  it('rejects differing content and differing lengths', () => {
    expect(timingSafeEqual('abc123', 'abc124')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('Xbc', 'abc')).toBe(false); // difference in the first byte
  });
});

describe('verifyStripeSignature', () => {
  async function headerFor(secret: string, body = BODY, ts = NOW_S): Promise<string> {
    return `t=${ts},v1=${await signPayload(String(ts), body, secret)}`;
  }

  it('accepts a correctly signed payload', async () => {
    const header = await headerFor(SECRET);
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW_MS)).toBe(true);
  });

  it('accepts when the matching signature is NOT the last in the header', async () => {
    // The rotation regression, stated exactly: the endpoint is still configured
    // with SECRET, and Stripe sends SECRET's signature first, followed by the
    // incoming one. Folding the header would keep only OTHER_SECRET's and
    // reject a legitimate, paid-for event.
    const mine = await signPayload(String(NOW_S), BODY, SECRET);
    const theirs = await signPayload(String(NOW_S), BODY, OTHER_SECRET);
    const header = `t=${NOW_S},v1=${mine},v1=${theirs}`;
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW_MS)).toBe(true);
  });

  it('accepts when the matching signature is last', async () => {
    const mine = await signPayload(String(NOW_S), BODY, SECRET);
    const theirs = await signPayload(String(NOW_S), BODY, OTHER_SECRET);
    const header = `t=${NOW_S},v1=${theirs},v1=${mine}`;
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW_MS)).toBe(true);
  });

  it('rejects a payload signed with a different secret', async () => {
    const header = await headerFor(OTHER_SECRET);
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW_MS)).toBe(false);
  });

  it('rejects a tampered body', async () => {
    const header = await headerFor(SECRET);
    const tampered = JSON.stringify({ type: 'checkout.session.completed', data: { object: { id: 'cs_EVIL' } } });
    expect(await verifyStripeSignature(tampered, header, SECRET, NOW_MS)).toBe(false);
  });

  it('rejects a signature whose timestamp is outside the replay window', async () => {
    const stale = NOW_S - TOLERANCE_SECONDS - 1;
    const header = await headerFor(SECRET, BODY, stale);
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW_MS)).toBe(false);
  });

  it('rejects a timestamp too far in the future', async () => {
    const ahead = NOW_S + TOLERANCE_SECONDS + 1;
    const header = await headerFor(SECRET, BODY, ahead);
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW_MS)).toBe(false);
  });

  it('accepts a signature at the edge of the replay window', async () => {
    const edge = NOW_S - TOLERANCE_SECONDS;
    const header = await headerFor(SECRET, BODY, edge);
    expect(await verifyStripeSignature(BODY, header, SECRET, NOW_MS)).toBe(true);
  });

  it('fails closed on a non-numeric timestamp', async () => {
    // Number('abc') is NaN, and every comparison against NaN is false — so a
    // bare `> TOLERANCE` check would wave a garbage timestamp straight through
    // the replay window.
    const sig = await signPayload('abc', BODY, SECRET);
    expect(await verifyStripeSignature(BODY, `t=abc,v1=${sig}`, SECRET, NOW_MS)).toBe(false);
  });

  it('rejects a missing, empty or signature-less header', async () => {
    expect(await verifyStripeSignature(BODY, null, SECRET, NOW_MS)).toBe(false);
    expect(await verifyStripeSignature(BODY, '', SECRET, NOW_MS)).toBe(false);
    expect(await verifyStripeSignature(BODY, `t=${NOW_S}`, SECRET, NOW_MS)).toBe(false);
    expect(await verifyStripeSignature(BODY, 'v1=abc', SECRET, NOW_MS)).toBe(false);
  });

  it('rejects a header carrying only wrong-secret signatures', async () => {
    const a = await signPayload(String(NOW_S), BODY, OTHER_SECRET);
    const b = await signPayload(String(NOW_S), BODY, 'whsec_third');
    expect(await verifyStripeSignature(BODY, `t=${NOW_S},v1=${a},v1=${b}`, SECRET, NOW_MS)).toBe(false);
  });

  it('is bound to the timestamp, not just the body', async () => {
    // Replaying a valid signature under a fresh timestamp must fail: the
    // timestamp is inside the signed string.
    const sig = await signPayload(String(NOW_S), BODY, SECRET);
    expect(await verifyStripeSignature(BODY, `t=${NOW_S + 10},v1=${sig}`, SECRET, NOW_MS)).toBe(false);
  });
});

describe('periodEnd', () => {
  it('advances a monthly period by one calendar month', () => {
    expect(periodEnd('monthly', new Date('2026-08-15T10:00:00Z')).slice(0, 10)).toBe('2026-09-15');
  });

  it('advances a yearly period by one calendar year', () => {
    expect(periodEnd('yearly', new Date('2026-08-15T10:00:00Z')).slice(0, 10)).toBe('2027-08-15');
  });

  it('treats any non-yearly period as monthly', () => {
    expect(periodEnd('', new Date('2026-08-15T10:00:00Z')).slice(0, 10)).toBe('2026-09-15');
  });

  it('preserves the time of day', () => {
    expect(periodEnd('monthly', new Date('2026-08-15T10:30:45Z'))).toBe('2026-09-15T10:30:45.000Z');
  });

  it.skip('KNOWN GAP (P1): month-end purchases overflow into the following month', () => {
    // Deliberately skipped rather than deleted, and deliberately NOT asserting
    // the current behaviour as correct. `setUTCMonth` overflows, so a purchase
    // on the 31st skips the short month entirely:
    //   2026-01-31 → 2026-03-03      2026-03-31 → 2026-05-01
    // The effect is a few days of over-granted access, not a user-visible
    // failure, which is why it is not in the same batch as the rotation fix.
    // Un-skip this when the clamping fix lands.
    expect(periodEnd('monthly', new Date('2026-01-31T10:00:00Z')).slice(0, 10)).toBe('2026-02-28');
  });
});
