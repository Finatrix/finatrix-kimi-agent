/**
 * Stripe webhook signature verification — extracted from `index.ts` so it can
 * be tested without standing up the function.
 *
 * This is the *entire* trust boundary for the revenue path: Stripe calls the
 * webhook with no session, no Origin and no CORS, so a bug here is either
 * "anyone can grant themselves a subscription" or "nobody's payment is ever
 * fulfilled". It had no test of any kind until this module existed.
 *
 * Implements Stripe's documented `Stripe-Signature` scheme with Web Crypto
 * rather than pulling in the Stripe SDK for one HMAC.
 */

/** Reject signatures older than this — replay protection. */
export const TOLERANCE_SECONDS = 300;

export interface ParsedSignature {
  /** The signed timestamp, as sent. Empty when absent or malformed. */
  t: string;
  /** EVERY v1 signature in the header, in order. */
  v1: string[];
}

/**
 * Parse a `Stripe-Signature` header.
 *
 * Two things this deliberately does not do, both of which were bugs:
 *
 * 1. It does not fold the header into an object. `Object.fromEntries` keeps
 *    only the LAST value for a repeated key — and Stripe sends **multiple `v1`
 *    signatures while an endpoint secret is being rotated**, one per active
 *    secret. Keeping only the last means that for the whole rotation window,
 *    every event whose matching signature came earlier in the header fails
 *    verification: Stripe retries, then gives up, and the customer has paid
 *    for access they never receive. All candidates are returned instead.
 *
 * 2. It splits each part on the FIRST `=` only, so a value containing `=`
 *    (base64 padding, if Stripe ever adds such a scheme) survives intact.
 */
export function parseSignatureHeader(header: string | null): ParsedSignature {
  const out: ParsedSignature = { t: '', v1: [] };
  if (!header) return out;
  for (const part of header.split(',')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!value) continue;
    if (key === 't') {
      if (!out.t) out.t = value; // first timestamp wins; all v1s are signed against it
    } else if (key === 'v1') {
      out.v1.push(value);
    }
  }
  return out;
}

/**
 * Length-independent, content-constant-time string comparison.
 *
 * The lengths of both sides are fixed (64 hex chars for HMAC-SHA256), so
 * returning early on a length mismatch leaks nothing an attacker doesn't
 * already know. The character loop is what matters: `===` on a hex digest can
 * in principle be walked one byte at a time.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The expected `v1` value for a payload — exported so tests can sign fixtures the way Stripe does. */
export async function signPayload(timestamp: string, rawBody: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${rawBody}`));
  return toHex(sig);
}

/**
 * Verify a `Stripe-Signature` header against the endpoint secret.
 *
 * `nowMs` is injectable purely so the replay window can be tested without
 * freezing the global clock.
 */
export async function verifyStripeSignature(
  rawBody: string,
  header: string | null,
  secret: string,
  nowMs: number = Date.now(),
): Promise<boolean> {
  const { t, v1 } = parseSignatureHeader(header);
  if (!t || v1.length === 0) return false;

  // A non-numeric `t` must fail closed. `Number('abc')` is NaN and every
  // comparison against NaN is false, so a bare `> TOLERANCE` check would let a
  // garbage timestamp through the replay window untested.
  const seconds = Number(t);
  if (!Number.isFinite(seconds)) return false;
  if (Math.abs(nowMs / 1000 - seconds) > TOLERANCE_SECONDS) return false;

  const expected = await signPayload(t, rawBody, secret);
  // Compare against every candidate without breaking early, so the work done
  // is the same whichever signature matches.
  let matched = false;
  for (const candidate of v1) {
    if (timingSafeEqual(expected, candidate)) matched = true;
  }
  return matched;
}

/** monthly → +1 calendar month, yearly → +1 calendar year, from `from`. */
export function periodEnd(period: string, from: Date): string {
  const d = new Date(from);
  if (period === 'yearly') d.setUTCFullYear(d.getUTCFullYear() + 1);
  else d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
}
