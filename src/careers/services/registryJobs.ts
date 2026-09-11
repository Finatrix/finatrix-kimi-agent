/**
 * FinatriX Company Registry — jobs read straight off each employer's own ATS.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * WHY THIS PROVIDER MATTERS MORE THAN THE OTHERS
 * ────────────────────────────────────────────────────────────────────────────
 * Every aggregator provider hands back a link to ITSELF. Adzuna returns a
 * `redirect_url` tracking bounce, Jooble a `jooble.org` redirect, Remotive its
 * own listing page. Measured on a live "risk analyst" search: 13 results, none
 * of which was an application form. The honest labelling in `search/applyUrl`
 * stops the product lying about that, but it cannot conjure links that the
 * providers never sent.
 *
 * The registry is the supply-side fix. Its sync engine pulls postings directly
 * from verified employers' Workday / Lever / Ashby / Greenhouse /
 * SmartRecruiters boards, so `source_url` IS the canonical posting — clicking
 * Apply lands on the company's own application form. `search/dedupe` already
 * prefers direct-employer URLs, so when the same role also arrives via an
 * aggregator, the registry copy is the one that survives.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * INTEGRATION SHAPE
 * ────────────────────────────────────────────────────────────────────────────
 * The registry's own `docs/search-integration.md` ships a `ProviderJob` type
 * and a `mergeAndRank()` helper. We deliberately do NOT adopt those: this app
 * already has a deterministic pipeline (dedupe → quick match → rank) that every
 * other provider flows through, and running a second ranking model beside it
 * would mean two places to reason about ordering and two definitions of a
 * duplicate. Instead registry rows are mapped into the app's own
 * `NormalizedJob` and merged at the provider-fetch boundary, so they are
 * scored, filtered and de-duplicated by exactly the same code as everything
 * else — and inherit the trust preference for free.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DEGRADATION
 * ────────────────────────────────────────────────────────────────────────────
 * Fails closed, always. Until migrations 0007–0009 are applied to the Supabase
 * project the `search_registry_jobs` RPC does not exist, and PostgREST answers
 * 404 — which must look like "this provider returned nothing", never like a
 * broken search. The status is reported as `not-configured` so the search
 * quality strip counts it honestly rather than claiming a source that isn't
 * there.
 */

import { supabase } from '../../lib/supabase';
import type { JobSearchParams, NormalizedJob } from '../types/jobs';
import type { SearchOutcome } from './jobsService';

export const REGISTRY_SOURCE = 'finatrix-registry';

/** Shape returned by the `search_registry_jobs` RPC (migration 0008). */
interface RegistryRow {
  job_id: string;
  title: string;
  company_id: string;
  company_name: string;
  company_website: string | null;
  industry: string | null;
  location_raw: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  workplace_type: string | null;
  employment_type: string | null;
  salary_min: string | number | null;
  salary_max: string | number | null;
  salary_currency: string | null;
  source: string;
  source_url: string;
  posted_at: string | null;
  first_seen: string;
  relevance: number;
}

/** The registry currently covers these markets; anything else is skipped. */
const SUPPORTED_COUNTRIES = new Set(['AU', 'IN']);

const num = (v: string | number | null): number | null => {
  if (v == null) return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

/**
 * Map one registry row into the app's provider contract.
 *
 * `description` is intentionally synthesised rather than left blank: the
 * registry stores structured fields, not posting bodies, and the whole
 * downstream pipeline (classification, keyword extraction, quick match) reads
 * `title + description`. An empty description would make every registry job
 * unclassifiable — which, under the recalibrated scorer, correctly scores 0
 * and would hide exactly the jobs we most want surfaced. The line below is
 * assembled only from fields the registry actually verified; nothing is
 * invented.
 */
function toNormalizedJob(r: RegistryRow): NormalizedJob {
  const locationBits = [r.location_raw, r.city, r.state].filter(Boolean);
  const location = r.location_raw || [r.city, r.state].filter(Boolean).join(', ');
  const facts = [
    r.title,
    r.company_name,
    r.industry ? `${r.industry} sector` : '',
    locationBits.length ? locationBits.join(' · ') : '',
    r.workplace_type ? `${r.workplace_type} role` : '',
    r.employment_type ? `${r.employment_type} position` : '',
  ].filter(Boolean);

  return {
    source: REGISTRY_SOURCE,
    // Shown to the user as the sourcing chip. The employer's own name is the
    // truthful answer to "where did this come from" — the posting was read off
    // that company's careers system, not off a job board.
    via: r.company_name,
    external_id: r.job_id,
    company: r.company_name,
    title: r.title,
    description: facts.join('\n'),
    salary_min: num(r.salary_min),
    salary_max: num(r.salary_max),
    currency: r.salary_currency ?? '',
    location,
    country: r.country ?? '',
    // The registry's vocabulary already matches the app's ('remote' | 'hybrid'
    // | 'onsite'); null means the employer did not state it, which must stay
    // unknown rather than being guessed as onsite.
    work_mode: r.workplace_type ?? '',
    employment_type: r.employment_type ?? '',
    // The whole point: the employer's own canonical posting.
    apply_url: r.source_url,
    posted_at: r.posted_at,
    closes_at: null,
    industry: r.industry ?? '',
  };
}

/**
 * Query the registry. Returns `null` when the RPC is unavailable (migrations
 * not yet applied), which the caller reports as `not-configured` rather than
 * as an error — a distinction the search-quality strip surfaces to the user.
 */
export async function searchRegistryJobs(
  params: JobSearchParams,
  limit = 25
): Promise<NormalizedJob[] | null> {
  const country = (params.country || '').toUpperCase();

  // Resolved here rather than only at the call site: a transport-level failure
  // (offline, DNS, CORS) rejects instead of returning an `error`, and every
  // caller of this function wants the same answer for both — "the registry had
  // nothing for us" — not an exception to handle individually.
  let data: unknown;
  let error: { code?: string; message: string } | null;
  try {
    ({ data, error } = await supabase.rpc('search_registry_jobs', {
      p_query: params.query?.trim() || null,
      p_country: SUPPORTED_COUNTRIES.has(country) ? country : null,
      p_city: params.location?.trim() || null,
      // Only ever narrows: `false` would exclude remote roles, which is not what
      // "no work-mode filter" means.
      p_remote: params.workMode === 'remote' || params.remoteOnly ? true : null,
      p_industry: params.industry?.trim() || null,
      p_limit: Math.min(limit, 100),
      p_offset: Math.max(0, params.page) * limit,
    }));
  } catch (e) {
    console.error('[finatrix-registry] search unreachable:', String(e).slice(0, 200));
    return null;
  }

  if (error) {
    // 404 / PGRST202 = the function does not exist yet. Expected before the
    // migrations land, and not worth a console error on every search.
    const missing = error.code === 'PGRST202' || /could not find the function/i.test(error.message);
    if (!missing) {
      console.error('[finatrix-registry] search failed:', error.message);
    }
    return null;
  }

  return ((data ?? []) as RegistryRow[])
    .filter((r) => r.source_url && r.title)
    .map(toNormalizedJob);
}

/**
 * Wrap a provider fetcher so registry results are merged into the same
 * outcome the aggregators produce.
 *
 * Registry jobs are placed FIRST. De-duplication keeps the first occurrence of
 * a role, and although `dedupeJobs` independently prefers direct-employer URLs,
 * ordering them first means the preference holds even for a registry row whose
 * ATS host is not yet in the known list.
 */
export function withRegistryJobs(
  fetcher: (p: JobSearchParams, terms: string[]) => Promise<SearchOutcome>
): (p: JobSearchParams, terms: string[]) => Promise<SearchOutcome> {
  return async (params, terms) => {
    const [outcome, registry] = await Promise.all([
      fetcher(params, terms),
      // A registry outage must never take down unified search.
      searchRegistryJobs(params).catch(() => null),
    ]);

    if (registry == null) {
      return {
        ...outcome,
        status: { ...outcome.status, [REGISTRY_SOURCE]: 'not-configured' },
      };
    }

    return {
      ...outcome,
      jobs: [...registry, ...outcome.jobs],
      status: { ...outcome.status, [REGISTRY_SOURCE]: 'ok' },
      counts: { ...(outcome.counts ?? {}), [REGISTRY_SOURCE]: registry.length },
      ran: (outcome.ran ?? 0) + 1,
      providersUp: outcome.providersUp || registry.length > 0,
    };
  };
}
