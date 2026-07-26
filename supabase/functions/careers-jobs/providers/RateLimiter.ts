// Multi-dimension rate limiting.
//
// Two layers, matching the pattern already used by careers-ai:
//  1. A per-isolate sliding-window burst limiter (cheap, best-effort, in-memory)
//     — stops rapid-fire abuse from one caller within a single isolate.
//  2. An authoritative Postgres-backed quota (per-user / per-provider, hourly &
//     daily) via the injected QuotaStore — survives across isolates and is the
//     real limit. The manager degrades gracefully when a dimension is exceeded
//     (it drops that provider / returns cached results) rather than failing hard.

import type { QuotaStore } from './types.ts';

// ─────────────── layer 1: per-isolate sliding window ───────────────

const windows = new Map<string, number[]>();

/** true when `key` exceeded `max` hits in the past `windowMs`. */
export function burstLimited(key: string, max: number, windowMs = 60_000, now = Date.now()): boolean {
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= max) { windows.set(key, hits); return true; }
  hits.push(now);
  windows.set(key, hits);
  if (windows.size > 10_000) {
    for (const [k, v] of windows) if (v.every((t) => now - t >= windowMs)) windows.delete(k);
  }
  return false;
}

/** Reset — test hygiene only. */
export function _resetBurst(): void { windows.clear(); }

// ─────────────── client identity ───────────────

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

// ─────────────── layer 2: authoritative quotas ───────────────

export interface QuotaLimits {
  userPerMinute: number;
  userPerHour: number;
  userPerDay: number;
  providerPerHour: number;
  providerPerDay: number;
  ipPerMinute: number;
}

export const DEFAULT_QUOTAS: QuotaLimits = {
  userPerMinute: 20,
  userPerHour: 120,
  userPerDay: 300,
  providerPerHour: 1000,
  providerPerDay: 8000,
  ipPerMinute: 40,
};

export interface QuotaVerdict {
  allowed: boolean;
  /** Which dimension blocked (for a precise, honest 429 message). */
  blockedBy: string | null;
}

/**
 * Check the per-user and per-IP dimensions for a whole search request. Provider
 * dimensions are checked separately by the manager, per active provider, so one
 * exhausted provider degrades to the others instead of failing the search.
 *
 * An empty `ip` means the caller could not establish a trustworthy client
 * address. The IP dimension is then SKIPPED rather than counted under a shared
 * placeholder key — bucketing every unidentifiable caller together would let one
 * of them exhaust the limit for all the others.
 */
export async function checkRequestQuota(
  store: QuotaStore,
  userId: string,
  ip: string,
  limits: QuotaLimits = DEFAULT_QUOTAS,
): Promise<QuotaVerdict> {
  const checks: Array<[string, string, number, number]> = [
    ['user:min', `${userId}`, limits.userPerMinute, 60],
    ['user:hour', `${userId}`, limits.userPerHour, 3600],
    ['user:day', `${userId}`, limits.userPerDay, 86_400],
    ...(ip ? [['ip:min', ip, limits.ipPerMinute, 60] as [string, string, number, number]] : []),
  ];
  for (const [scope, key, limit, win] of checks) {
    const n = await store.hit(scope, key, limit, win).catch(() => 0);
    if (n === -1) return { allowed: false, blockedBy: scope };
  }
  return { allowed: true, blockedBy: null };
}

/** Per-provider hourly/daily check — returns providers still within quota. */
export async function filterProvidersByQuota(
  store: QuotaStore,
  providerIds: string[],
  limits: QuotaLimits = DEFAULT_QUOTAS,
): Promise<string[]> {
  const allowed: string[] = [];
  for (const id of providerIds) {
    const hour = await store.hit('provider:hour', id, limits.providerPerHour, 3600).catch(() => 0);
    if (hour === -1) continue;
    const day = await store.hit('provider:day', id, limits.providerPerDay, 86_400).catch(() => 0);
    if (day === -1) continue;
    allowed.push(id);
  }
  return allowed;
}

/** In-memory QuotaStore for tests and as a degraded fallback. */
export class InMemoryQuotaStore implements QuotaStore {
  private buckets = new Map<string, number[]>();
  hit(scope: string, key: string, limit: number, windowSeconds: number): Promise<number> {
    const k = `${scope}:${key}`;
    const now = Date.now();
    const hits = (this.buckets.get(k) ?? []).filter((t) => now - t < windowSeconds * 1000);
    if (hits.length >= limit) { this.buckets.set(k, hits); return Promise.resolve(-1); }
    hits.push(now); this.buckets.set(k, hits);
    return Promise.resolve(hits.length);
  }
}
