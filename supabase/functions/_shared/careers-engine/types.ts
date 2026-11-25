/**
 * Shared types for the FinatriX Careers engine.
 *
 * Portions of the engine are derived from career-ops (MIT). See NOTICE.
 */

import type { CareersMarket } from './markets/types.ts';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export const silentLogger: Logger = { info() {}, warn() {} };

/** Provider-stable identity of a posting: the strongest possible dedup key. */
export interface ListingIdentity {
  ats_provider: string;
  board_slug: string;
  posting_id: string;
}

/** Normalised job posting emitted by every discovery provider. */
export interface Job {
  title: string;
  url: string;
  company: string;
  location: string;
  description?: string;
  /** Epoch milliseconds. */
  postedAt?: number;
  salaryText?: string;
  externalId?: string;
  requisitionId?: string;
  language?: string;
  listingIdentity?: ListingIdentity;
  /** Provider id that produced the job (filled in by the scan runner). */
  source?: string;
}

/**
 * One employer / board to scan. This is the shape the FinatriX registry
 * (`companies` rows) maps onto: the registry is read-only input here.
 */
export interface EmployerEntry {
  name: string;
  /** Explicit provider id. Wins over auto-detection. */
  provider?: string;
  careers_url?: string;
  api?: string;
  max_pages?: number;
  /** Registry company id, carried through untouched. No FK is created. */
  registryId?: string;
  /** True when the entry is a multi-employer board / agency (skipped for repost detection). */
  aggregator?: boolean;

  // Oracle Recruiting Cloud
  siteNumber?: string;
  locationId?: string | number;
  // SmartRecruiters
  smartrecruiters?: { fetchDetails?: boolean; detailLimit?: number };
  // Ashby
  ashby?: { board?: string };
  // Workday
  workday?: {
    /** Server-side keyword search sent with every request (e.g. "compliance"). */
    searchText?: string;
    /** Facets applied to every request, keyed by Workday facetParameter. */
    appliedFacets?: Record<string, string[]>;
    /**
     * Only crawl postings Workday itself places in this market. Reads the tenant's location facet, slices on the
     * values inside the market and skips the rest of a multinational board (minutes become seconds). A tenant with no
     * postings in the market returns nothing; a tenant with no location facet falls back to a full crawl with a warning.
     * Several markets crawl the union of their slices.
     */
    marketOnly?: CareersMarket | readonly CareersMarket[];
  };
}

export type TruncationReason =
  | 'cap'
  | 'fetch-error'
  | 'unrecognised-page'
  | 'budget'
  | 'split-incomplete'
  | 'no-date-skip'
  /** Set by a resuming caller: the scan stopped part-way on purpose and its next call carries on (FetchResult.cursor). */
  | 'paused';

/** A scan that did not see every posting says so, in data, not just in logs. */
export interface Truncation {
  reason: TruncationReason;
  /** True when a retry is likely to reach further; false for structural limits. */
  transient: boolean;
  detail?: string;
}

export interface FetchResult {
  jobs: Job[];
  truncation?: Truncation;
  /**
   * Only for a call made with FetchContext.resume: the crawl paused before the end of the board, and passing this
   * back carries on from there. Absent, the call read the rest of the board.
   */
  cursor?: unknown;
}

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: string | null;
  redirect?: 'error' | 'follow' | 'manual';
  timeoutMs?: number;
}

export interface RetryPolicy {
  retries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  jitterMs: number;
}

export interface LocationHints {
  always_allow?: string[];
  allow?: string[];
  positive?: string[];
  block?: string[];
  block_hard?: string[];
}

export interface FetchContext {
  fetchJson<T = unknown>(url: string, init?: RequestOptions, policy?: Partial<RetryPolicy>): Promise<T>;
  fetchText(url: string, init?: RequestOptions, policy?: Partial<RetryPolicy>): Promise<string>;
  sleep(ms: number): Promise<void>;
  log: Logger;
  /** Probe mode: hard page ceiling and no retries/enrichment. */
  maxPages?: number;
  /** Only keep postings newer than this (epoch ms); used for early-stop. */
  sinceMs?: number;
  includeUndated?: boolean;
  locationHints?: LocationHints;
  /** Cheap title predicate so providers can skip detail fetches for unwanted titles. */
  titleWanted?: (title: string) => boolean;
  /**
   * Epoch ms after which a paging provider starts no further request and returns what it has, truncated with
   * reason 'budget'. The first request is always made, so every call makes progress.
   */
  deadline?: number;
  /**
   * Set by a caller that can carry one board's scan across calls. `cursor` is what the last call returned (null starts
   * a new pass). A provider that can resume pauses at the deadline, or (once it has read something new) before a
   * request that could take it past `maxJobs` jobs, and returns FetchResult.cursor instead of a 'budget' truncation.
   * Providers that cannot resume ignore it.
   */
  resume?: { cursor: unknown; maxJobs?: number };
}

export interface Provider {
  id: string;
  /** Opt-in providers are never auto-registered. */
  optIn?: boolean;
  detect(entry: EmployerEntry): { url: string } | null;
  fetch(entry: EmployerEntry, ctx: FetchContext): Promise<FetchResult>;
  /** Cheap title+url listing without descriptions, when the API offers one. */
  fetchListing?(
    entry: EmployerEntry,
    ctx: FetchContext,
  ): Promise<Array<Pick<Job, 'title' | 'url' | 'postedAt'>>>;
  /** Provider-specific dedup key (e.g. Workday requisition token). */
  dedupKey?(job: Pick<Job, 'url'>): string | null;
}
