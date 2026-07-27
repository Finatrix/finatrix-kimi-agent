import { describe, it, expect, beforeEach } from 'vitest';
import { TieredCache, InMemoryCacheStore, searchKey, stableStringify, TTL } from './ProviderCache.ts';
import { snapshotFor, isDisabled, classifyError, DEFAULT_HEALTH_POLICY } from './ProviderHealth.ts';
import {
  burstLimited, _resetBurst, checkRequestQuota, filterProvidersByQuota, InMemoryQuotaStore,
  clientIp, isIpLiteral,
} from './RateLimiter.ts';
import { validateEnv, runtimeConfigFromEnv } from './factory.ts';
import type { HealthEvent, SearchInput } from './types.ts';

const input: SearchInput = {
  query: 'Risk', terms: ['risk', 'aml'], location: 'Mumbai', country: 'in',
  remoteOnly: false, workMode: '', employmentType: '', salaryMin: null, salaryMax: null, page: 0,
};

describe('cache', () => {
  it('search key is order-independent for terms and providers', () => {
    const a = searchKey(input, ['linkedin', 'activejobs']);
    const b = searchKey({ ...input, terms: ['aml', 'risk'] }, ['activejobs', 'linkedin']);
    expect(a).toBe(b);
  });
  it('stableStringify sorts keys', () => {
    expect(stableStringify({ b: 1, a: 2 })).toBe(stableStringify({ a: 2, b: 1 }));
  });
  it('tiered cache reads through and expires', async () => {
    const c = new TieredCache(new InMemoryCacheStore());
    await c.set('search:x', { jobs: [1] }, TTL.search);
    expect(await c.get('search:x')).toEqual({ jobs: [1] });
    await c.invalidate('search:');
    expect(await c.get('search:x')).toBeNull();
  });
});

describe('health', () => {
  const evs = (spec: Array<[boolean, number]>): HealthEvent[] =>
    spec.map(([ok, ms], i) => ({ provider: 'p', ok, ms, errorKind: ok ? null : 'server_error', quotaRemaining: null, at: 1000 + i }));

  it('is available with no events', () => {
    expect(snapshotFor('p', []).available).toBe(true);
  });
  it('auto-disables after the error rate trips and newest failed', () => {
    const snap = snapshotFor('p', evs([[false, 10], [false, 10], [false, 10], [true, 20], [false, 10]]));
    expect(snap.errorRate).toBeGreaterThanOrEqual(0.5);
    expect(snap.available).toBe(false);
    expect(isDisabled(snap)).toBe(true);
  });
  it('does not disable a recovering provider whose newest event succeeded', () => {
    const snap = snapshotFor('p', evs([[false, 10], [false, 10], [false, 10], [true, 20]]));
    expect(snap.available).toBe(true);
  });
  it('trips on consecutive failures regardless of rate', () => {
    const many: HealthEvent[] = [];
    for (let i = 0; i < 15; i++) many.push({ provider: 'p', ok: true, ms: 10, errorKind: null, quotaRemaining: null, at: i });
    for (let i = 0; i < 5; i++) many.push({ provider: 'p', ok: false, ms: 10, errorKind: 'timeout', quotaRemaining: null, at: 100 + i });
    const snap = snapshotFor('p', many, DEFAULT_HEALTH_POLICY);
    expect(snap.available).toBe(false);
  });
  it('classifyError maps statuses', () => {
    expect(classifyError(429, '')).toBe('rate_limited');
    expect(classifyError(503, '')).toBe('server_error');
    expect(classifyError(403, '')).toBe('client_error');
    expect(classifyError(null, 'The operation was aborted due to timeout')).toBe('timeout');
    expect(classifyError(null, 'Unexpected token < in JSON')).toBe('malformed');
  });

  // Quota is a gauge, not a rate. A failed call reports null for both budgets;
  // letting that null erase the last good reading would blank the dashboard at
  // exactly the moment an operator needs it.
  it('carries the newest OBSERVED quota, not the newest event', () => {
    const events: HealthEvent[] = [
      { provider: 'p', ok: true, ms: 10, errorKind: null, quotaRemaining: 900, jobsRemaining: 5000, at: 1 },
      { provider: 'p', ok: true, ms: 10, errorKind: null, quotaRemaining: 880, jobsRemaining: 4200, at: 2 },
      { provider: 'p', ok: false, ms: 10, errorKind: 'timeout', quotaRemaining: null, jobsRemaining: null, at: 3 },
    ];
    const snap = snapshotFor('p', events);
    expect(snap.quotaRemaining).toBe(880);
    expect(snap.jobsRemaining).toBe(4200);
  });

  it('reports null quota when nothing was ever observed', () => {
    const snap = snapshotFor('p', [
      { provider: 'p', ok: true, ms: 10, errorKind: null, quotaRemaining: null, at: 1 },
    ]);
    expect(snap.quotaRemaining).toBeNull();
    expect(snap.jobsRemaining).toBeNull();
  });
});

describe('rate limiting', () => {
  beforeEach(() => _resetBurst());
  it('burst limiter trips at the max', () => {
    for (let i = 0; i < 3; i++) expect(burstLimited('u1', 3)).toBe(false);
    expect(burstLimited('u1', 3)).toBe(true);
  });
  it('per-request quota blocks and names the dimension', async () => {
    const store = new InMemoryQuotaStore();
    const limits = { userPerMinute: 2, userPerHour: 99, userPerDay: 99, providerPerHour: 99, providerPerDay: 99, ipPerMinute: 99 };
    expect((await checkRequestQuota(store, 'u', 'ip', limits)).allowed).toBe(true);
    expect((await checkRequestQuota(store, 'u', 'ip', limits)).allowed).toBe(true);
    const v = await checkRequestQuota(store, 'u', 'ip', limits);
    expect(v.allowed).toBe(false);
    expect(v.blockedBy).toBe('user:min');
  });
  it('provider quota filtering drops exhausted providers', async () => {
    const store = new InMemoryQuotaStore();
    const limits = { userPerMinute: 99, userPerHour: 99, userPerDay: 99, providerPerHour: 1, providerPerDay: 99, ipPerMinute: 99 };
    expect(await filterProvidersByQuota(store, ['a', 'b'], limits)).toEqual(['a', 'b']);
    expect(await filterProvidersByQuota(store, ['a', 'b'], limits)).toEqual([]); // hour limit=1 exhausted
  });

  // An empty IP means "we could not identify this caller". Counting those under
  // one shared key would let a single anonymous caller exhaust the IP limit for
  // every other unidentifiable caller.
  it('skips the IP dimension entirely when no trustworthy IP is available', async () => {
    const store = new InMemoryQuotaStore();
    const limits = { userPerMinute: 99, userPerHour: 99, userPerDay: 99, providerPerHour: 99, providerPerDay: 99, ipPerMinute: 1 };
    expect((await checkRequestQuota(store, 'u1', '', limits)).allowed).toBe(true);
    expect((await checkRequestQuota(store, 'u2', '', limits)).allowed).toBe(true);
    expect((await checkRequestQuota(store, 'u3', '', limits)).allowed).toBe(true);
    // …but a real IP is still limited.
    expect((await checkRequestQuota(store, 'u4', '9.9.9.9', limits)).allowed).toBe(true);
    expect((await checkRequestQuota(store, 'u5', '9.9.9.9', limits)).allowed).toBe(false);
  });
});

describe('clientIp', () => {
  const h = (map: Record<string, string>) => ({ get: (n: string) => map[n.toLowerCase()] ?? null });

  // This runs on Supabase Edge, not behind Cloudflare, so CF-Connecting-IP is
  // pure caller input. Trusting it made the per-IP quota trivially bypassable.
  it('ignores CF-Connecting-IP entirely', () => {
    expect(clientIp(h({ 'cf-connecting-ip': '1.2.3.4' }))).toBe('');
    expect(clientIp(h({ 'cf-connecting-ip': '1.2.3.4', 'x-forwarded-for': '5.6.7.8' }))).toBe('5.6.7.8');
  });

  // Measured on production: Supabase Edge APPENDS its own hop and rotates
  // through a pool of proxy addresses, so the rightmost entry is always
  // infrastructure (13.248.102.x). Keying on it scattered one caller across ~10
  // buckets and the limit never triggered. Leftmost is the actual client.
  it('takes the leftmost entry — the original client, not the platform proxy', () => {
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.9, 13.248.102.50' }))).toBe('203.0.113.9');
    expect(clientIp(h({ 'x-forwarded-for': '203.0.113.9, 13.248.102.50, 13.248.102.74' }))).toBe('203.0.113.9');
  });

  it('skips junk to find the first usable literal', () => {
    expect(clientIp(h({ 'x-forwarded-for': 'unknown, 203.0.113.9, 13.248.102.50' }))).toBe('203.0.113.9');
  });

  it('returns empty rather than a placeholder when nothing is trustworthy', () => {
    expect(clientIp(h({}))).toBe('');
    expect(clientIp(h({ 'x-forwarded-for': '' }))).toBe('');
    expect(clientIp(h({ 'x-forwarded-for': 'not-an-ip, also-not' }))).toBe('');
  });

  it('accepts IPv6 and rejects junk', () => {
    expect(isIpLiteral('2001:db8::1')).toBe(true);
    expect(isIpLiteral('203.0.113.9')).toBe(true);
    expect(isIpLiteral('hello')).toBe(false);
    expect(isIpLiteral('')).toBe(false);
  });
});

describe('environment validation', () => {
  // The real 2026-07-25 misconfiguration: keys entered under marketplace labels
  // that the code never reads, so five providers silently did nothing.
  it('flags provider secrets set under non-canonical names', () => {
    const r = validateEnv({
      RAPIDAPI_KEY: 'k',
      'Active Jobs DB': 'k',
      'Linkedin Job search': 'k',
      SUPABASE_URL: 'https://x.supabase.co',
    });
    expect(r.present).toContain('RAPIDAPI_KEY');
    expect(r.missing).toContain('WORKDAY_HOST');
    expect(r.suspectedMisnamed).toEqual(expect.arrayContaining(['Active Jobs DB', 'Linkedin Job search']));
    expect(r.suspectedMisnamed).not.toContain('SUPABASE_URL');
  });

  it('is quiet when everything is named canonically', () => {
    const r = validateEnv({
      RAPIDAPI_KEY: 'k', ACTIVE_JOBS_KEY: 'k', LINKEDIN_JOBS_KEY: 'k',
      JOB_POSTING_FEED_KEY: 'k', GOOGLE_JOBS_KEY: 'k', GLASSDOOR_KEY: 'k',
      WORKDAY_KEY: 'k', WORKDAY_HOST: 'wd.example.com',
      ADZUNA_APP_ID: 'a', ADZUNA_APP_KEY: 'b', JOOBLE_KEY: 'c',
    });
    expect(r.suspectedMisnamed).toEqual([]);
    expect(r.missing).toEqual([]);
  });

  it('reports which providers will actually resolve a key', () => {
    const r = validateEnv({}, [
      { id: 'activejobs', isConfigured: () => true },
      { id: 'workday', isConfigured: () => false },
    ]);
    expect(r.configuredProviders).toEqual(['activejobs']);
    expect(r.unconfiguredProviders).toEqual(['workday']);
  });

  it('carries the retry setting into the runtime config', () => {
    expect(runtimeConfigFromEnv({}, 1000, 10, 0).retries).toBe(0);
    expect(runtimeConfigFromEnv({}, 1000, 10, 2).retries).toBe(2);
  });
});
