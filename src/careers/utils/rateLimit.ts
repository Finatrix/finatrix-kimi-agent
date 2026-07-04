/**
 * Client-side rate limiting (Phase 4, Module 13). A token-bucket limiter for
 * UI actions that shouldn't be spammable (e.g. "Generate email", "Analyse
 * offer") even before the request reaches the server. This is a UX/abuse
 * safety net, not the enforcement boundary — the real limits are server-side
 * (careers-ai's per-user daily quota, RLS on every table, Supabase's own
 * platform rate limits).
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Returns true if the action is allowed right now, and consumes one token.
 * `capacity` tokens refill fully every `refillMs`.
 */
export function allowAction(key: string, capacity = 5, refillMs = 60_000): boolean {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: capacity, lastRefill: now };
  if (now - bucket.lastRefill >= refillMs) {
    bucket.tokens = capacity;
    bucket.lastRefill = now;
  }
  if (bucket.tokens <= 0) {
    buckets.set(key, bucket);
    return false;
  }
  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return true;
}

/** Milliseconds until the bucket for `key` next has a token, or 0 if it has one now. */
export function retryAfterMs(key: string, refillMs = 60_000): number {
  const bucket = buckets.get(key);
  if (!bucket || bucket.tokens > 0) return 0;
  return Math.max(0, refillMs - (Date.now() - bucket.lastRefill));
}

export function resetRateLimit(key: string): void {
  buckets.delete(key);
}
