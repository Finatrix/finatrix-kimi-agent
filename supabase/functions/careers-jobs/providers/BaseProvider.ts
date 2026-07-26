// Shared provider behaviour: timeout, bounded retry, error classification, and
// the search→normalise pipeline. Concrete providers implement only two hooks —
// buildSearchRequest() and parseSearch() — so no provider-specific logic leaks
// anywhere else. Pure enough to test without network (the two hooks are public
// and covered directly by fixtures; only fetchJson touches the network).

import type {
  FinatriXJob, JobProvider, ProviderCompany, ProviderPing,
  ProviderRuntimeConfig, SearchInput, ErrorKind, QuotaObservation,
} from './types.ts';
import { normalize, type RawJob } from './ProviderNormalizer.ts';
import { classifyError } from './ProviderHealth.ts';

export const NO_QUOTA: QuotaObservation = { requestsRemaining: null, jobsRemaining: null };

/** Typed error so the manager can classify failures without string-sniffing. */
export class ProviderError extends Error {
  constructor(message: string, readonly status: number | null, readonly kind: ErrorKind) {
    super(message);
    this.name = 'ProviderError';
  }
}

export interface SearchRequest {
  url: string;
  init?: RequestInit;
}

export abstract class BaseProvider implements JobProvider {
  abstract readonly id: string;
  abstract readonly priority: number;
  abstract readonly secrets: string[];
  abstract readonly costPerSearchMicroUsd: number;

  constructor(protected readonly cfg: ProviderRuntimeConfig) {}

  /** Build the provider's native search request, or null if it can't serve. */
  abstract buildSearchRequest(input: SearchInput): SearchRequest | null;
  /** Map a raw provider payload to provider-agnostic RawJob records. */
  abstract parseSearch(json: unknown): RawJob[];

  /** Override to skip a provider that structurally can't serve a query. */
  supports(_input: SearchInput): boolean { return true; }

  /**
   * Configured ⇔ a probe request can be built (i.e. the required secrets exist).
   * Reuses each adapter's own buildSearchRequest, which returns null without a
   * key/host, so this stays correct for every provider incl. Workday's host req.
   */
  isConfigured(): boolean {
    return this.buildSearchRequest({
      query: 'x', terms: ['x'], location: '', country: 'in',
      remoteOnly: false, workMode: '', employmentType: '', salaryMin: null, salaryMax: null, page: 0,
    }) !== null;
  }

  /**
   * The real search. Returns the vendor quota alongside the jobs so the manager
   * can record it without any shared mutable state on the provider instance
   * (providers are built once per isolate and can serve concurrent searches).
   */
  async searchJobsDetailed(input: SearchInput): Promise<{ jobs: FinatriXJob[]; quota: QuotaObservation }> {
    const req = this.buildSearchRequest(input);
    if (!req) return { jobs: [], quota: NO_QUOTA };
    const { json, quota } = await this.fetchJson(req.url, req.init);
    const raws = this.parseSearch(json).slice(0, this.cfg.maxResultsPerProvider);
    const out: FinatriXJob[] = [];
    for (const r of raws) {
      const job = normalize(this.id, this.priority, r);
      if (job) out.push(job);
    }
    return { jobs: out, quota };
  }

  async searchJobs(input: SearchInput): Promise<FinatriXJob[]> {
    return (await this.searchJobsDetailed(input)).jobs;
  }

  /** Most job APIs have no clean by-id fetch; providers override when they do. */
  getJob(_externalId: string): Promise<FinatriXJob | null> { return Promise.resolve(null); }
  getCompany(_name: string): Promise<ProviderCompany | null> { return Promise.resolve(null); }

  /** A light real ping used by the admin "test provider" action. */
  async health(): Promise<ProviderPing> {
    const started = Date.now();
    const req = this.buildSearchRequest({
      query: 'engineer', terms: ['engineer'], location: '', country: 'in',
      remoteOnly: false, workMode: '', employmentType: '', salaryMin: null, salaryMax: null, page: 0,
    });
    if (!req) return { ok: false, ms: 0, quotaRemaining: null };
    try {
      const { quota } = await this.rawFetch(req.url, req.init);
      return { ok: true, ms: Date.now() - started, quotaRemaining: quota.requestsRemaining };
    } catch {
      return { ok: false, ms: Date.now() - started, quotaRemaining: null };
    }
  }

  /** Resolve this provider's API key: provider-specific secret, else shared RAPIDAPI_KEY. */
  protected key(): string {
    for (const name of this.secrets) {
      const v = this.cfg.secrets[name];
      if (v) return v;
    }
    return this.cfg.secrets.RAPIDAPI_KEY ?? '';
  }

  protected rapidHeaders(host: string): Record<string, string> {
    return { 'X-RapidAPI-Key': this.key(), 'X-RapidAPI-Host': host };
  }

  /**
   * Extra attempts on transient failures. Config-driven so
   * `CAREERS_PROVIDER_RETRIES` genuinely governs every provider — this used to
   * be hard-coded, which silently contradicted the documented behaviour of that
   * variable. Clamped to 0–2 by the composition root.
   */
  private get retries(): number {
    const n = this.cfg.retries;
    return Number.isFinite(n) && (n as number) >= 0 ? Math.min(2, Math.floor(n as number)) : 1;
  }

  /**
   * Fetch + parse JSON with a hard timeout and bounded retries on transient
   * failures (5xx / network / timeout — never on 429, which means "stop").
   * Throws a classified ProviderError; the manager owns fault isolation.
   */
  protected async fetchJson(
    url: string,
    init?: RequestInit,
  ): Promise<{ json: unknown; quota: QuotaObservation }> {
    let lastErr: ProviderError | null = null;
    const attempts = this.retries + 1;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        return await this.rawFetch(url, init);
      } catch (e) {
        const err = e instanceof ProviderError ? e : new ProviderError(String(e), null, 'unknown');
        lastErr = err;
        const retryable = err.kind === 'server_error' || err.kind === 'network' || err.kind === 'timeout';
        if (!retryable || attempt === attempts - 1) break;
        // Exponential backoff with jitter: a retry storm from many isolates
        // hitting a struggling upstream in lockstep is how a blip becomes an
        // outage. Base doubles per attempt, jitter de-synchronises callers.
        await sleep(200 * 2 ** attempt + Math.floor(Math.random() * 200));
      }
    }
    throw lastErr ?? new ProviderError('unknown provider error', null, 'unknown');
  }

  private async rawFetch(url: string, init?: RequestInit): Promise<{ json: unknown; quota: QuotaObservation }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.cfg.timeoutMs);
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal });
      const quota = readQuotaHeaders(res.headers);
      if (!res.ok) {
        throw new ProviderError(`HTTP ${res.status}`, res.status, classifyError(res.status, ''));
      }
      let json: unknown;
      try {
        json = await res.json();
      } catch (e) {
        throw new ProviderError(`bad JSON: ${String(e).slice(0, 80)}`, res.status, 'malformed');
      }
      return { json, quota };
    } catch (e) {
      if (e instanceof ProviderError) throw e;
      const msg = String(e);
      const kind: ErrorKind = /abort/i.test(msg) ? 'timeout' : 'network';
      throw new ProviderError(msg.slice(0, 120), null, kind);
    } finally {
      clearTimeout(timer);
    }
  }
}

function headerNumber(headers: Headers, ...names: string[]): number | null {
  for (const n of names) {
    const v = headers.get(n);
    if (v != null && v !== '' && Number.isFinite(Number(v))) return Number(v);
  }
  return null;
}

/**
 * Both quota dimensions RapidAPI vendors expose. `x-ratelimit-jobs-remaining` is
 * the binding one for the Fantastic-Jobs family (a job credit is spent per
 * returned record, against a smaller budget than requests), so a dashboard that
 * watched only requests would read healthy right up to exhaustion.
 */
export function readQuotaHeaders(headers: Headers): QuotaObservation {
  return {
    requestsRemaining: headerNumber(headers, 'x-ratelimit-requests-remaining', 'x-ratelimit-remaining'),
    jobsRemaining: headerNumber(headers, 'x-ratelimit-jobs-remaining'),
  };
}

function sleep(ms: number): Promise<void> { return new Promise((r) => setTimeout(r, ms)); }

/** Utility for adapters: coerce an array-or-wrapped-array payload to an array. */
export function asArray(json: unknown, ...keys: string[]): Record<string, unknown>[] {
  if (Array.isArray(json)) return json as Record<string, unknown>[];
  if (json && typeof json === 'object') {
    for (const k of keys) {
      const v = (json as Record<string, unknown>)[k];
      if (Array.isArray(v)) return v as Record<string, unknown>[];
    }
  }
  return [];
}
