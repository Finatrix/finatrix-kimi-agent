/**
 * Best-effort per-isolate sliding-window rate limiter for edge functions.
 *
 * Scope and honesty: state lives in isolate memory, so the limit applies per
 * running isolate, not globally — a burst that fans out across isolates can
 * exceed it. That is acceptable here because this is a second line of defence
 * on top of the authoritative controls (JWT auth + the atomic daily quota in
 * Postgres for careers-ai). It exists to stop rapid-fire abuse from a single
 * client cheaply, without adding a KV/Redis dependency.
 */

const buckets = new Map<string, number[]>();

/** Returns true when `key` has exceeded `max` calls in the past `windowMs`. */
export function rateLimited(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) {
    buckets.set(key, hits);
    return true;
  }
  hits.push(now);
  buckets.set(key, hits);
  // Opportunistic cleanup so the map can't grow unbounded in a hot isolate.
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) {
      if (v.every((t) => now - t >= windowMs)) buckets.delete(k);
    }
  }
  return false;
}
