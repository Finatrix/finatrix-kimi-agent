// Composition helpers. Build the six native providers from injected config, and
// build the durable stores from a Supabase client. index.ts wires these to the
// four legacy providers and constructs the ProviderManager. Keeping this pure
// (config injected, no Deno.env access) means the whole assembly is testable.

import type { JobProvider, ProviderRuntimeConfig, HealthStore, MetricsStore, QuotaStore } from './types.ts';
import { ActiveJobsProvider } from './ActiveJobsProvider.ts';
import { LinkedInProvider } from './LinkedInProvider.ts';
import { WorkdayProvider } from './WorkdayProvider.ts';
import { GoogleJobsProvider } from './GoogleJobsProvider.ts';
import { GlassdoorProvider } from './GlassdoorProvider.ts';
import { JobPostingFeedProvider } from './JobPostingFeedProvider.ts';
import { TieredCache } from './ProviderCache.ts';
import {
  SupabaseCacheStore, SupabaseHealthStore, SupabaseMetricsStore, SupabaseQuotaStore, type DbClient,
} from './store.ts';

/**
 * Glassdoor is intentionally disabled for launch (licensing/business decision,
 * not a technical issue) — kept in the codebase for future re-enablement.
 * Flip this back to `true` once the licensing question is resolved; nothing
 * else needs to change, the provider still builds fine, it's just excluded
 * from the active registry below.
 */
const GLASSDOOR_ENABLED = false;

/**
 * The native providers, in priority order (Active Jobs DB → … → Job Posting
 * Feed). A provider with no usable key is still constructed but its
 * buildSearchRequest returns null, so the manager records it as inactive rather
 * than calling it — exactly the "not-configured" behaviour the client expects.
 * Glassdoor is filtered out entirely (see GLASSDOOR_ENABLED) rather than left
 * to the missing-key path, so it's excluded even if GLASSDOOR_KEY is set.
 */
export function buildNativeProviders(cfg: ProviderRuntimeConfig): JobProvider[] {
  return [
    new ActiveJobsProvider(cfg),      // priority 100
    new LinkedInProvider(cfg),        // 90
    new WorkdayProvider(cfg),         // 80
    new GoogleJobsProvider(cfg),      // 70
    ...(GLASSDOOR_ENABLED ? [new GlassdoorProvider(cfg)] : []),  // 60 — disabled for launch
    new JobPostingFeedProvider(cfg),  // 50
  ];
}

export interface Stores {
  cache: TieredCache;
  health: HealthStore;
  metrics: MetricsStore;
  quota: QuotaStore;
}

export function buildStores(db: DbClient): Stores {
  return {
    cache: new TieredCache(new SupabaseCacheStore(db)),
    health: new SupabaseHealthStore(db),
    metrics: new SupabaseMetricsStore(db),
    quota: new SupabaseQuotaStore(db),
  };
}

/**
 * The exact secret names this system reads. Anything set under a different name
 * — a marketplace label like "Active Jobs DB", say — is invisible to the code,
 * which is silent and expensive to discover in production. `validateEnv` below
 * exists to surface precisely that.
 */
export const PROVIDER_SECRET_NAMES = [
  'RAPIDAPI_KEY', 'ACTIVE_JOBS_KEY', 'LINKEDIN_JOBS_KEY', 'JOB_POSTING_FEED_KEY',
  'GOOGLE_JOBS_KEY', 'GLASSDOOR_KEY', 'WORKDAY_KEY', 'WORKDAY_HOST',
] as const;

/** Read the provider secret set from a raw env map (composition root only). */
export function runtimeConfigFromEnv(
  env: Record<string, string | undefined>,
  timeoutMs = 12_000,
  maxResultsPerProvider = 40,
  retries = 1,
): ProviderRuntimeConfig {
  const secrets: Record<string, string> = {};
  for (const n of PROVIDER_SECRET_NAMES) { const v = env[n]; if (v) secrets[n] = v; }
  return { secrets, timeoutMs, maxResultsPerProvider, retries };
}

export interface EnvReport {
  /** Canonical secret names that are present. */
  present: string[];
  /** Canonical secret names that are absent. */
  missing: string[];
  /**
   * Env keys that look like a provider credential entered under a non-canonical
   * name (contains a space, or names a known vendor without matching a canonical
   * key). These are set but will NEVER be read — the single most likely
   * misconfiguration, and otherwise completely silent.
   */
  suspectedMisnamed: string[];
  /** Provider ids that will resolve a usable key, and those that will not. */
  configuredProviders: string[];
  unconfiguredProviders: string[];
}

const VENDOR_HINT = /(rapid ?api|active ?jobs|linkedin|job ?posting|google ?jobs|glassdoor|workday|adzuna|jooble|jsearch)/i;

/**
 * Validate the environment at startup and report what the system will actually
 * do with it. Pure — takes an env map, returns a report; the caller decides how
 * to log it. Never returns a secret VALUE, only names.
 */
export function validateEnv(
  env: Record<string, string | undefined>,
  providers: Pick<JobProvider, 'id' | 'isConfigured'>[] = [],
): EnvReport {
  const canonical = new Set<string>(PROVIDER_SECRET_NAMES);
  const present: string[] = [];
  const missing: string[] = [];
  for (const n of PROVIDER_SECRET_NAMES) (env[n] ? present : missing).push(n);

  const suspectedMisnamed: string[] = [];
  for (const key of Object.keys(env)) {
    if (canonical.has(key)) continue;
    if (/^(ADZUNA_APP_ID|ADZUNA_APP_KEY|JOOBLE_KEY)$/.test(key)) continue;  // incumbents, also canonical
    if (key.includes(' ') || (VENDOR_HINT.test(key) && !/^SUPABASE_/.test(key))) {
      suspectedMisnamed.push(key);
    }
  }

  const configuredProviders: string[] = [];
  const unconfiguredProviders: string[] = [];
  for (const p of providers) {
    (p.isConfigured?.() ?? true ? configuredProviders : unconfiguredProviders).push(p.id);
  }

  return { present, missing, suspectedMisnamed, configuredProviders, unconfiguredProviders };
}
