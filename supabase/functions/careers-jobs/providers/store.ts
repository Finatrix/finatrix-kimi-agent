// Durable, Supabase-backed implementations of the injected store interfaces.
//
// This is the ONE provider-side module that talks to the database. It takes a
// Supabase client (injected by index.ts) rather than importing one, so it stays
// free of jsr/Deno specifics and every method DEGRADES GRACEFULLY: any DB error
// is swallowed and a safe default returned, so a missing table or a transient
// outage never breaks job search — it just loses caching/metrics for that call.
//
// The backing tables + the atomic quota RPC are created by the migration
// supabase/migrations/*_provider_infrastructure.sql.

import type {
  CacheStore, CacheEntry, HealthStore, HealthEvent, HealthSnapshot,
  MetricsStore, MetricEvent, QuotaStore,
} from './types.ts';
import { snapshotFor } from './ProviderHealth.ts';

/** The subset of the Supabase client this module uses. */
export interface DbClient {
  from(table: string): {
    select: (cols?: string, opts?: unknown) => any;
    insert: (rows: unknown) => any;
    upsert: (rows: unknown, opts?: unknown) => any;
    delete: () => any;
  };
  rpc(fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }>;
}

export class SupabaseCacheStore implements CacheStore {
  constructor(private readonly db: DbClient) {}
  async get(key: string): Promise<CacheEntry | null> {
    try {
      const { data, error } = await this.db.from('provider_cache')
        .select('value, expires_at').eq('key', key).maybeSingle();
      if (error || !data) return null;
      const row = data as { value: unknown; expires_at: string };
      const expiresAt = new Date(row.expires_at).getTime();
      if (Date.now() > expiresAt) return null;
      return { value: row.value, expiresAt };
    } catch { return null; }
  }
  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.db.from('provider_cache').upsert(
        { key, value, expires_at: new Date(Date.now() + ttlSeconds * 1000).toISOString() },
        { onConflict: 'key' },
      );
    } catch { /* degrade: cache write is best-effort */ }
  }
  async invalidate(prefix: string): Promise<void> {
    try { await this.db.from('provider_cache').delete().like('key', `${prefix}%`); }
    catch { /* degrade */ }
  }
}

export class SupabaseHealthStore implements HealthStore {
  constructor(private readonly db: DbClient, private readonly window = 40) {}
  async load(): Promise<HealthSnapshot[]> {
    try {
      const { data, error } = await this.db.from('provider_health_events')
        .select('provider, ok, ms, error_kind, quota_remaining, jobs_remaining, at')
        .order('at', { ascending: false }).limit(400);
      if (error || !Array.isArray(data)) return [];
      const events: HealthEvent[] = (data as any[]).map((r) => ({
        provider: String(r.provider), ok: !!r.ok, ms: Number(r.ms) || 0,
        errorKind: r.error_kind ?? null, quotaRemaining: r.quota_remaining ?? null,
        jobsRemaining: r.jobs_remaining ?? null,
        at: new Date(r.at).getTime(),
      }));
      const providers = [...new Set(events.map((e) => e.provider))];
      return providers.map((p) => snapshotFor(p, events));
    } catch { return []; }
  }
  async record(events: HealthEvent[]): Promise<void> {
    if (!events.length) return;
    try {
      await this.db.from('provider_health_events').insert(events.map((e) => ({
        provider: e.provider, ok: e.ok, ms: e.ms, error_kind: e.errorKind,
        quota_remaining: e.quotaRemaining, jobs_remaining: e.jobsRemaining ?? null,
        at: new Date(e.at).toISOString(),
      })));
    } catch { /* degrade */ }
  }
}

export class SupabaseMetricsStore implements MetricsStore {
  constructor(private readonly db: DbClient) {}
  async record(events: MetricEvent[]): Promise<void> {
    if (!events.length) return;
    try {
      await this.db.from('provider_metric_events').insert(events.map((e) => ({
        provider: e.provider, kind: e.kind, ok: e.ok, ms: e.ms, jobs: e.jobs,
        cost_micro_usd: e.costMicroUsd, at: new Date(e.at).toISOString(),
      })));
    } catch { /* degrade */ }
  }
}

export class SupabaseQuotaStore implements QuotaStore {
  constructor(private readonly db: DbClient) {}
  /** Atomic fixed-window counter via the increment_provider_quota RPC. */
  async hit(scope: string, key: string, limit: number, windowSeconds: number): Promise<number> {
    try {
      const { data, error } = await this.db.rpc('increment_provider_quota', {
        p_scope: scope, p_key: key, p_limit: limit, p_window_seconds: windowSeconds,
      });
      if (error) return 0;            // degrade OPEN: a quota outage must not lock users out
      return Number(data);
    } catch { return 0; }
  }
}
