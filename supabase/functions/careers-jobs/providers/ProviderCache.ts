// Caching layer. "Redis-style" semantics (key/value + TTL + prefix invalidation)
// over the existing infrastructure: there is no Redis, so the durable backing
// store is Postgres (see store.ts), fronted by a tiny per-isolate LRU for hot
// reads. This module owns the pure key-building and TTL policy; the durable
// store is injected via the CacheStore interface so it is fully testable.

import type { CacheStore, CacheEntry, SearchInput } from './types.ts';

/** TTLs (seconds) per cached entity — stale data self-invalidates on expiry. */
export const TTL = {
  search: 15 * 60,     // job searches: 15 min (freshness matters)
  company: 24 * 3600,  // company facts change slowly
  salary: 12 * 3600,   // salary aggregates
  skills: 24 * 3600,   // extracted/enriched skills
  job: 30 * 60,        // single job detail
} as const;

/** Deterministic, order-independent cache key for a search. */
export function searchKey(input: SearchInput, providers: string[]): string {
  const norm = {
    q: input.query.toLowerCase().trim(),
    t: [...input.terms].map((s) => s.toLowerCase().trim()).sort(),
    loc: input.location.toLowerCase().trim(),
    c: input.country.toLowerCase(),
    r: input.remoteOnly,
    wm: input.workMode,
    et: input.employmentType,
    smin: input.salaryMin,
    smax: input.salaryMax,
    p: input.page,
    pr: [...providers].sort(),
  };
  return `search:${stableStringify(norm)}`;
}

export function companyKey(name: string): string {
  return `company:${name.toLowerCase().trim().replace(/\s+/g, ' ')}`;
}
export function jobKey(provider: string, externalId: string): string {
  return `job:${provider}:${externalId}`;
}

/** JSON with sorted keys so equivalent objects always produce the same string. */
export function stableStringify(v: unknown): string {
  return JSON.stringify(v, (_k, val) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.keys(val).sort().reduce((acc, k) => { (acc as Record<string, unknown>)[k] = (val as Record<string, unknown>)[k]; return acc; }, {} as Record<string, unknown>)
      : val,
  );
}

/** A minimal LRU used as an in-isolate hot cache in front of the durable store. */
export class LruCache {
  private map = new Map<string, CacheEntry>();
  constructor(private readonly max = 500) {}
  get(key: string): unknown | undefined {
    const e = this.map.get(key);
    if (!e) return undefined;
    if (Date.now() > e.expiresAt) { this.map.delete(key); return undefined; }
    this.map.delete(key); this.map.set(key, e);   // refresh recency
    return e.value;
  }
  set(key: string, value: unknown, ttlSeconds: number): void {
    if (this.map.size >= this.max) { const oldest = this.map.keys().next().value; if (oldest) this.map.delete(oldest); }
    this.map.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
  }
  clearPrefix(prefix: string): void {
    for (const k of this.map.keys()) if (k.startsWith(prefix)) this.map.delete(k);
  }
}

/** In-memory CacheStore — used as the fallback store and in tests. */
export class InMemoryCacheStore implements CacheStore {
  private lru = new LruCache(2000);
  get(key: string): Promise<CacheEntry | null> {
    const v = this.lru.get(key);
    return Promise.resolve(v === undefined ? null : { value: v, expiresAt: Date.now() + 1 });
  }
  set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.lru.set(key, value, ttlSeconds); return Promise.resolve();
  }
  invalidate(prefix: string): Promise<void> { this.lru.clearPrefix(prefix); return Promise.resolve(); }
}

/**
 * Two-tier read-through cache: isolate LRU → durable store. Writes populate both.
 * `invalidate('search:')` drops a whole entity class from both tiers.
 */
export class TieredCache {
  private lru = new LruCache(500);
  constructor(private readonly store: CacheStore) {}

  async get<T>(key: string): Promise<T | null> {
    const hot = this.lru.get(key);
    if (hot !== undefined) return hot as T;
    const cold = await this.store.get(key).catch(() => null);
    if (cold && Date.now() <= cold.expiresAt) {
      this.lru.set(key, cold.value, Math.max(1, Math.round((cold.expiresAt - Date.now()) / 1000)));
      return cold.value as T;
    }
    return null;
  }
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    this.lru.set(key, value, ttlSeconds);
    await this.store.set(key, value, ttlSeconds).catch(() => undefined);
  }
  async invalidate(prefix: string): Promise<void> {
    this.lru.clearPrefix(prefix);
    await this.store.invalidate(prefix).catch(() => undefined);
  }
}
