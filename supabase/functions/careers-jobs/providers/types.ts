// FinatriX Careers — provider architecture: shared types.
//
// This module is pure TypeScript (no Deno / no npm / no jsr imports) so it can
// be imported by BOTH the Deno edge function AND the Node/vitest test runner.
// Anything that touches Deno.env, the Supabase client or the network lives in
// the composition root (index.ts) or in an injected store — never here.

/** The canonical, provider-agnostic job the whole platform speaks in. */
export interface FinatriXJob {
  /** Stable synthetic id: `${provider}:${externalId}`. */
  id: string;
  title: string;
  company: string;
  location: string;
  salary: {
    min: number | null;
    max: number | null;
    currency: string;
    /** 'year' | 'month' | 'hour' | '' */
    period: string;
    /** True when the range is an AI/heuristic estimate, not from the source. */
    estimated: boolean;
  };
  description: string;
  /** fulltime | parttime | contract | intern | '' */
  employmentType: string;
  /** '' | entry | mid | senior | lead | exec (best-effort). */
  experience: string;
  skills: string[];
  applyUrl: string;
  companyLogo: string | null;
  /** Internal provider id (never surfaced to the client as a vendor name). */
  provider: string;
  /** 0–100 source confidence (provider priority + completeness). */
  confidence: number;
  /** ISO 8601, or null when the source omitted it. */
  postedDate: string | null;
  freshness: Freshness;
  /**
   * Original posting source ("LinkedIn", "Indeed", "<Company> Careers"). This
   * is honest attribution of where the listing originates and is often required
   * by provider licence terms — it is NOT the API vendor name. Kept distinct
   * from `provider` on purpose.
   */
  via: string;
  country: string;
  /** remote | hybrid | onsite | '' */
  workMode: string;
  closesAt: string | null;
  industry: string;
  /** 0–100 deterministic quality score (completeness + salary + recency). */
  quality: number;
  /** 0–1 heuristic probability the role is remote-friendly. */
  remoteProbability: number;
  /** Truthful, earned badge keys (see badges.ts). Never asserts unverified trust. */
  badges: BadgeKey[];
  /** Provider-specific extras — never discarded during merge. */
  metadata: Record<string, unknown>;
}

export type Freshness = 'today' | 'this_week' | 'this_month' | 'older' | 'unknown';

/**
 * Truthful badge keys. Every one is derived from an observable fact about the
 * job (a real date, a real score, a computation that actually ran). We do NOT
 * emit a generic "verified" badge for jobs FinatriX has not actually verified.
 */
export type BadgeKey =
  | 'posted_today'
  | 'fresh_this_week'
  | 'updated_recently'
  | 'salary_listed'
  | 'remote_friendly'
  | 'high_confidence'
  | 'ai_summary'          // only set when an AI summary was actually generated
  | 'skills_matched';     // only set when the user's skills overlap the posting

/**
 * The wire shape returned to the client. It is a strict SUPERSET of the client's
 * existing `NormalizedJob` (src/careers/types/jobs.ts) so nothing downstream
 * breaks: the legacy snake_case fields are unchanged, and the richer data is
 * additive and optional. The client reads what it knows and ignores the rest.
 */
export interface WireJob {
  // ── legacy contract (unchanged) ──
  source: string;
  via: string;
  external_id: string;
  company: string;
  title: string;
  description: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  location: string;
  country: string;
  work_mode: string;
  employment_type: string;
  apply_url: string;
  posted_at: string | null;
  closes_at: string | null;
  industry: string;
  // ── additive, optional enrichment ──
  company_logo?: string | null;
  confidence?: number;
  freshness?: Freshness;
  skills?: string[];
  experience?: string;
  quality?: number;
  remote_probability?: number;
  badges?: BadgeKey[];
}

/** Normalised search input handed to every provider (already validated). */
export interface SearchInput {
  query: string;
  /** Intent-expanded synonyms, most specific first (includes the raw query). */
  terms: string[];
  location: string;
  country: string;        // ISO-ish, default 'in'
  remoteOnly: boolean;
  workMode: string;       // '' | remote | hybrid | onsite
  employmentType: string; // fulltime | parttime | contract | intern | ''
  salaryMin: number | null;
  salaryMax: number | null;
  page: number;
}

/** Result of one provider's search — never throws to the manager. */
export interface ProviderSearchResult {
  provider: string;
  jobs: FinatriXJob[];
  ms: number;
  /** null on success; a short, secret-free message on failure. */
  error: string | null;
  /** Classified failure kind for health/metrics. */
  errorKind: ErrorKind | null;
}

export type ErrorKind =
  | 'timeout'
  | 'rate_limited'      // 429
  | 'server_error'      // 5xx
  | 'client_error'      // 4xx (not 429)
  | 'malformed'         // bad/unstable JSON
  | 'network'
  | 'not_configured'    // missing secret
  | 'unknown';

/** A point-in-time health view of a provider. */
export interface HealthSnapshot {
  provider: string;
  available: boolean;
  latencyMs: number;        // rolling average
  errorRate: number;        // 0–1 over the recent window
  quotaRemaining: number | null;
  /** Vendor "job credit" budget, where the vendor bills per returned record. */
  jobsRemaining: number | null;
  lastSuccess: string | null;
  lastFailure: string | null;
  /** When a provider is auto-disabled, when it may be retried (ISO). */
  disabledUntil: string | null;
}

/** Injected persistence — implemented with Supabase in index.ts, faked in tests. */
export interface CacheStore {
  get(key: string): Promise<CacheEntry | null>;
  set(key: string, value: unknown, ttlSeconds: number): Promise<void>;
  invalidate(prefix: string): Promise<void>;
}
export interface CacheEntry {
  value: unknown;
  /** epoch ms when this entry expires. */
  expiresAt: number;
}

export interface HealthStore {
  load(): Promise<HealthSnapshot[]>;
  record(events: HealthEvent[]): Promise<void>;
}
export interface HealthEvent {
  provider: string;
  ok: boolean;
  ms: number;
  errorKind: ErrorKind | null;
  quotaRemaining: number | null;
  jobsRemaining?: number | null;
  at: number; // epoch ms
}

export interface MetricsStore {
  record(events: MetricEvent[]): Promise<void>;
}
export interface MetricEvent {
  provider: string;
  kind: 'search' | 'get' | 'company' | 'health';
  ok: boolean;
  ms: number;
  jobs: number;
  at: number;
  /** Rough cost estimate in micro-USD for this call (see ProviderMetrics). */
  costMicroUsd: number;
}

/** Multi-dimension quota check — Postgres-backed in prod, in-memory in tests. */
export interface QuotaStore {
  /** Atomically increments and returns the post-increment count, or -1 when over. */
  hit(scope: string, key: string, limit: number, windowSeconds: number): Promise<number>;
}

/**
 * Every provider implements exactly this. No provider-specific logic exists
 * anywhere else in the system — the manager only ever speaks this interface.
 */
export interface JobProvider {
  /** Stable internal id (e.g. 'activejobs'). Never shown to end users as a brand. */
  readonly id: string;
  /** Ranking priority (higher wins de-duplication conflicts). */
  readonly priority: number;
  /** Names of env secrets that must all be present for this provider to run. */
  readonly secrets: string[];
  /** Rough cost per search call, micro-USD, for the admin cost estimate. */
  readonly costPerSearchMicroUsd: number;
  /** Cheap pre-flight: skip a provider that cannot serve this query at all. */
  supports(input: SearchInput): boolean;
  /** False when the provider's secrets are absent → reported as 'not-configured'. */
  isConfigured?(): boolean;
  searchJobs(input: SearchInput): Promise<FinatriXJob[]>;
  /**
   * Optional richer search that also reports the vendor quota observed on the
   * call. Providers that can see quota headers implement this; the manager
   * falls back to `searchJobs` for those that cannot (e.g. the incumbents,
   * whose search function is injected and never sees a Response).
   */
  searchJobsDetailed?(input: SearchInput): Promise<{ jobs: FinatriXJob[]; quota: QuotaObservation }>;
  getJob(externalId: string): Promise<FinatriXJob | null>;
  getCompany(name: string): Promise<ProviderCompany | null>;
  health(): Promise<ProviderPing>;
}

export interface ProviderCompany {
  name: string;
  logo: string | null;
  website: string | null;
  industry: string;
  rating: number | null;
  metadata: Record<string, unknown>;
}

export interface ProviderPing {
  ok: boolean;
  ms: number;
  quotaRemaining: number | null;
}

/** Runtime config injected into providers — the ONLY carrier of secrets. */
export interface ProviderRuntimeConfig {
  /** Secret name → value, read from Deno.env at the composition root only. */
  secrets: Record<string, string>;
  /** Per-provider hard timeout. */
  timeoutMs: number;
  /** Max results kept per provider before dedupe. */
  maxResultsPerProvider: number;
  /**
   * Extra attempts on TRANSIENT failures only (network, timeout, upstream 5xx).
   * 0 disables retries. Defaults to 1 when omitted. Never applies to 4xx — a
   * 401/400 is deterministic for this call and retrying a 429 burns paid quota.
   */
  retries?: number;
}

/**
 * What a provider observed about its remaining vendor quota on the last call.
 * Both dimensions matter for the Fantastic-Jobs family, which bills a *job
 * credit per returned record* on top of a request credit — the job budget is the
 * smaller one, so tracking only requests hides the binding constraint.
 */
export interface QuotaObservation {
  requestsRemaining: number | null;
  jobsRemaining: number | null;
}
