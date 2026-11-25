/** Looks like an IPv4 or IPv6 literal (enough to reject junk header values). */
export function isIpLiteral(v: string): boolean {
  return /^[0-9]{1,3}(\.[0-9]{1,3}){3}$/.test(v) || /^[0-9a-f]{0,4}(:[0-9a-f]{0,4}){2,7}$/i.test(v);
}

/**
 * Best available client IP for rate-limiting purposes.
 *
 * This runs on Supabase Edge — NOT behind Cloudflare — so `CF-Connecting-IP` is
 * set by nobody but the caller: forgeable, rotatable, and therefore useless as a
 * limiter key. It is deliberately ignored.
 *
 * We take the LEFTMOST `X-Forwarded-For` entry, i.e. the original client.
 *
 * This was rightmost at first, on the usual reasoning that the nearest proxy
 * appends last and is the one entry a caller cannot forge. Measured against
 * production, that is wrong here: Supabase's edge appends ITS OWN hop, and it
 * load-balances across a pool of addresses. The rightmost entry was therefore
 * always platform infrastructure (13.248.102.x), and a single client's traffic
 * scattered across ~10 such keys — 75 consecutive requests from one caller
 * produced ten quota buckets of 1–13 each and never reached a limit of 60, so
 * the whole IP dimension was silently inert.
 *
 * Leftmost is caller-settable, which is the inherent trade-off of X-Forwarded-For
 * without a known trusted-proxy count. It is still strictly better than a key
 * that cannot distinguish callers at all: it bounds ordinary abuse, and the
 * authoritative per-USER quota (which requires a verified JWT) is what bounds a
 * determined attacker.
 *
 * Returns '' when no usable address is present. Callers must then SKIP the IP
 * dimension rather than substitute a placeholder: bucketing every unidentifiable
 * caller under one shared key would let any one of them exhaust the limit for
 * all the others.
 */
export function clientIp(headers: { get(name: string): string | null }): string {
  const xff = headers.get('x-forwarded-for') ?? '';
  for (const part of xff.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (isIpLiteral(part)) return part;
  }
  return '';
}
