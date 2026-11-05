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

export { clientIp, isIpLiteral } from '../../_shared/clientIp.ts';

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
