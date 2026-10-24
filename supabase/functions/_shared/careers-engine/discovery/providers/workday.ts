/**
 * Workday CXS provider (myworkdayjobs.com / myworkdaysite.com).
 *
 * Derived from career-ops providers/workday.mjs (MIT, see NOTICE). Workday is the
 * ATS behind many large banks, insurers, retailers and universities in every market. Behaviour
 * kept from upstream:
 *  - CXS POST pagination (20/page), offset ceiling 2000 detection via facet coverage
 *  - facet splitting to recover postings beyond the ceiling (depth 2, 100 slices, page budget)
 *  - requisition-token dedup key with repost-suffix stripping
 *  - multi-location placeholder resolution via the detail document
 *  - early stop on `sinceMs`
 * Differences: truncation is returned as data (FetchResult.truncation) instead of an
 * expando property, and the detail-request budget counts calls rather than attempts.
 */
import type { EmployerEntry, FetchContext, FetchResult, Job, LocationHints, Provider, Truncation } from '../../types.ts';
import { DEFAULT_USER_AGENT } from '../../util/http.ts';
import { parseLocation } from '../../markets/index.ts';
import type { CareersMarket } from '../../markets/types.ts';
import { arr, obj, str } from './_util.ts';

type StopReason = 'complete' | 'early-stop' | 'no-date-skip' | 'fetch-error' | 'cap';

const PAGE_SIZE = 20;
const DEFAULT_MAX_PAGES = 100;
const MAX_PAGES_CAP = 1500;
const RETRIES = { retries: 3 };
const INTER_PAGE_DELAY_MS = 250;
export const WORKDAY_OFFSET_CEILING = 2000;
const MAX_SPLIT_DEPTH = 2;
const MAX_SPLIT_SLICES = 100;
const SPLIT_PAGE_BUDGET_FACTOR = 5;
const EARLY_STOP_MARGIN_MS = 2 * 86_400_000;
const MAX_DETAIL_REQUESTS = 200;

const CAREERS_RE = /^https:\/\/([\w-]+)\.(wd[\w-]*)\.myworkdayjobs\.com\/(?:[a-z]{2}-[A-Z]{2}\/)?([^/?#]+)/;
const CXS_RE = /^https:\/\/([\w-]+)\.(wd[\w-]*)\.myworkdayjobs\.com\/wday\/cxs\/([\w-]+)\/([^/?#]+)(?:\/jobs)?(?:[/?#]|$)/;
const SITE_RE = /^https:\/\/([\w-]+)\.myworkdaysite\.com\/recruiting\/([\w-]+)\/([^/?#]+)/;

interface Endpoint { api: string; jobBase: string; cxsBase: string; origin: string }

function makeEndpoint(origin: string, tenant: string, site: string): Endpoint {
  return { api: `${origin}/wday/cxs/${tenant}/${site}/jobs`, jobBase: `${origin}/${site}`, cxsBase: `${origin}/wday/cxs/${tenant}/${site}`, origin };
}

function makeSiteEndpoint(host: string, tenant: string, site: string): Endpoint {
  const origin = `https://${host}`;
  return {
    api: `${origin}/wday/cxs/${tenant}/${site}/jobs`,
    jobBase: `${origin}/recruiting/${tenant}/${site}`,
    cxsBase: `${origin}/wday/cxs/${tenant}/${site}`,
    origin,
  };
}

export function resolveEndpoint(entry: Pick<EmployerEntry, 'api' | 'careers_url'>): Endpoint | null {
  for (const url of [entry.api, entry.careers_url]) {
    if (typeof url !== 'string' || !url) continue;
    const cxs = url.match(CXS_RE);
    if (cxs) return makeEndpoint(`https://${cxs[1]}.${cxs[2]}.myworkdayjobs.com`, cxs[3]!, cxs[4]!);
    const site = url.match(SITE_RE);
    if (site) return makeSiteEndpoint(`${site[1]}.myworkdaysite.com`, site[2]!, site[3]!);
    const m = url.match(CAREERS_RE);
    if (m) return makeEndpoint(`https://${m[1]}.${m[2]}.myworkdayjobs.com`, m[1]!, m[3]!);
  }
  return null;
}

// ── requisition tokens & dedup keys ─────────────────────────────────────────────

const REQ_TOKEN_CHARS_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

function stripRepostSuffixKeepCase(token: string): string {
  const m = token.match(/^(.*?)-(\d{1,2})$/);
  if (!m) return token;
  const base = m[1]!;
  const isDisambiguator = base.includes('-')
    ? /^[a-z-]*\d[a-z0-9_-]*\d{2,}$/i.test(base) && /^[1-9]$/.test(m[2]!)
    : /^[a-z]*\d[a-z0-9_]*\d{2,}$/i.test(base);
  return isDisambiguator ? base : token;
}

/** Lowercase requisition token without a Workday repost suffix ("JR-1234-2" → "jr-1234"). */
export function stripWorkdayRepostSuffix(raw: unknown): string {
  return stripRepostSuffixKeepCase(raw == null ? '' : String(raw).toLowerCase());
}

function validReqToken(segment: string): string {
  const underscore = segment.indexOf('_');
  if (underscore === -1) return '';
  const token = stripRepostSuffixKeepCase(segment.slice(underscore + 1));
  if (token.length < 3 || !REQ_TOKEN_CHARS_RE.test(token)) return '';
  return /\d/.test(token) ? token : '';
}

function reqTokenFromPath(externalPath: unknown): string | undefined {
  if (typeof externalPath !== 'string') return undefined;
  return validReqToken(externalPath.split('/').filter(Boolean).pop() ?? '') || undefined;
}

export function isWorkdayJobUrl(url: string): boolean | null {
  try {
    return /\.myworkday(jobs|site)\.com$/.test(new URL(url).hostname.toLowerCase());
  } catch {
    return null;
  }
}

/** Stable per-requisition key so reposts under new URLs collapse: `workday:{host}:{req}`. */
export function workdayDedupKey(job: Pick<Job, 'url'>): string | null {
  if (!isWorkdayJobUrl(job?.url)) return null;
  const parsed = new URL(job.url);
  const segments = parsed.pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  if (!last) return null;
  const reqId = validReqToken(last).toLowerCase();
  if (!reqId) return null;
  let scope = parsed.hostname.toLowerCase();
  if (scope.endsWith('.myworkdaysite.com')) {
    const tenant = parsed.pathname.match(/^\/recruiting\/([\w-]+)\//)?.[1];
    if (!tenant) return null;
    scope += `/recruiting/${tenant.toLowerCase()}`;
  }
  return `workday:${scope}:${reqId}`;
}

// ── parsing ────────────────────────────────────────────────────────────────────

export function parsePostedOn(label: unknown, now = Date.now()): number | undefined {
  if (typeof label !== 'string' || !label) return undefined;
  if (/posted\s+today/i.test(label)) return now;
  if (/posted\s+yesterday/i.test(label)) return now - 86_400_000;
  const m = label.match(/posted\s+(\d+)(\+?)\s*day/i);
  if (!m || m[2] === '+') return undefined;
  return now - Number(m[1]) * 86_400_000;
}

function locationFromPath(externalPath: unknown): string {
  const m = String(externalPath ?? '').match(/\/job\/([^/]+)\//);
  if (!m) return '';
  let segment: string;
  try { segment = decodeURIComponent(m[1]!); } catch { segment = m[1]!; }
  return segment.replace(/-/g, ' ');
}

const MULTI_LOCATION_PLACEHOLDER_RE = /^\s*\d+\s+locations?\s*$/i;
export function isMultiLocationPlaceholder(location: unknown): boolean {
  return typeof location === 'string' && MULTI_LOCATION_PLACEHOLDER_RE.test(location);
}

export function parseWorkdayResponse(json: unknown, entry: EmployerEntry, now = Date.now()): Job[] {
  const ep = resolveEndpoint(entry);
  const jobBase = ep?.jobBase ?? '';
  const jobs: Job[] = [];
  for (const raw of arr(obj(json).jobPostings)) {
    const j = obj(raw);
    if (!j.externalPath || !str(j.title)) continue;
    const job: Job = {
      title: String(j.title),
      url: jobBase + String(j.externalPath),
      company: entry.name,
      location: str(j.locationsText) || locationFromPath(j.externalPath),
    };
    const req = reqTokenFromPath(j.externalPath);
    if (req) job.requisitionId = req;
    const postedAt = parsePostedOn(j.postedOn, now);
    if (postedAt !== undefined) job.postedAt = postedAt;
    jobs.push(job);
  }
  return jobs;
}

export function locationsFromDetail(detail: unknown): string {
  const info = obj(obj(detail).jobPostingInfo);
  const places = [info.location, ...arr(info.additionalLocations)]
    .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    .map((p) => p.trim());
  return [...new Set(places)].join(' · ');
}

export function postedAtFromDetail(detail: unknown): number | undefined {
  const raw = obj(obj(detail).jobPostingInfo).startDate;
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  const shape = /^(\d{4})-(\d{2})-(\d{2})(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2}))?$/.exec(trimmed);
  if (!shape) return undefined;
  const [y, m, d] = [Number(shape[1]), Number(shape[2]), Number(shape[3])];
  const check = new Date(Date.UTC(y, m - 1, d));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return undefined;
  const ms = Date.parse(trimmed);
  return Number.isFinite(ms) ? ms : undefined;
}

// ── facets ─────────────────────────────────────────────────────────────────────

interface FacetValue { id?: unknown; descriptor?: unknown; count?: unknown }
interface Facet { facetParameter?: unknown; descriptor?: unknown; values?: unknown }

/**
 * Some tenants nest their facets: `locationMainGroup` holds `locationHierarchy1` ("Locations", by country) and
 * `locations` ("Sites") as values. Lift those groups so every leaf facet is addressable by its own facetParameter,
 * which is the key `appliedFacets` expects.
 */
export function flattenFacets(facets: unknown): Facet[] {
  const out: Facet[] = [];
  const visit = (list: unknown, depth: number): void => {
    for (const item of Array.isArray(list) ? list : []) {
      if (!item || typeof item !== 'object') continue;
      const facet = item as Facet;
      const groups = (Array.isArray(facet.values) ? (facet.values as unknown[]) : []).filter(
        (v) => v && typeof v === 'object' && typeof (v as Facet).facetParameter === 'string' && Array.isArray((v as Facet).values),
      );
      if (groups.length > 0 && depth < 3) visit(groups, depth + 1);
      else out.push(facet);
    }
  };
  visit(facets, 0);
  return out;
}

/** Does a location facet value describe somewhere in `market`? Overseas namesakes ("Melbourne, Florida" for AU) do not count. */
export function isMarketFacetValue(descriptor: unknown, market: CareersMarket): boolean {
  return typeof descriptor === 'string' && parseLocation(descriptor, market).inMarket;
}

export type MarketFacetPlan =
  | { kind: 'slices'; facetParameter: string; values: Array<{ id: string; count: number; descriptor?: string }> }
  | { kind: 'no-match' }
  | { kind: 'no-location-facet' };

/**
 * Decide how to restrict a Workday board to one market from its facets. Prefers the location facet that needs the
 * fewest slices (a country-level facet beats per-site facets), then the one covering the most postings.
 */
export function planMarketFacet(facets: unknown, market: CareersMarket): MarketFacetPlan {
  let sawLocationFacet = false;
  let best: { facetParameter: string; values: Array<{ id: string; count: number; descriptor?: string }>; coverage: number } | null = null;
  for (const facet of flattenFacets(facets)) {
    if (typeof facet.facetParameter !== 'string' || !facet.facetParameter || !facetLooksLikeLocation(facet)) continue;
    const values = (Array.isArray(facet.values) ? (facet.values as FacetValue[]) : []).filter(
      (v) => typeof v?.id === 'string' && v.id && Number.isInteger(v?.count) && (v.count as number) >= 0,
    ) as Array<{ id: string; count: number; descriptor?: string }>;
    if (values.length === 0) continue;
    sawLocationFacet = true;
    const inMarket = values.filter((v) => isMarketFacetValue(v.descriptor, market) && v.count > 0);
    if (inMarket.length === 0) continue;
    const coverage = inMarket.reduce((sum, v) => sum + v.count, 0);
    if (!best || inMarket.length < best.values.length || (inMarket.length === best.values.length && coverage > best.coverage)) {
      best = { facetParameter: facet.facetParameter, values: inMarket, coverage };
    }
  }
  if (best) return { kind: 'slices', facetParameter: best.facetParameter, values: best.values };
  return sawLocationFacet ? { kind: 'no-match' } : { kind: 'no-location-facet' };
}

function facetCoverage(facet: Facet | undefined): number | null {
  const values = Array.isArray(facet?.values) ? (facet!.values as FacetValue[]) : [];
  let sum = 0;
  let counted = 0;
  for (const v of values) {
    if (!Number.isInteger(v?.count) || (v.count as number) < 0) continue;
    sum += v.count as number;
    counted++;
  }
  return counted > 0 ? sum : null;
}

/**
 * The true posting total is the largest facet coverage (the `total` field is clamped at 2000).
 * `exclude` lists facets already applied to the query: Workday reports such a group's counts unfiltered, so they
 * describe the whole board, not this result set (e.g. 2,806 on a 12-posting slice).
 */
export function trueTotalFromFacets(facets: unknown, exclude: readonly string[] = []): number | null {
  let best: number | null = null;
  for (const facet of flattenFacets(facets)) {
    if (typeof facet.facetParameter === 'string' && exclude.includes(facet.facetParameter)) continue;
    const coverage = facetCoverage(facet);
    if (coverage === null) continue;
    if (best === null || coverage > best) best = coverage;
  }
  return best;
}

function hintValues(values: unknown): string[] {
  return (Array.isArray(values) ? values : [])
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .map((v) => v.trim().toLowerCase());
}

function facetLooksLikeLocation(facet: Facet): boolean {
  const identity = `${String(facet.facetParameter ?? '')} ${String(facet.descriptor ?? '')}`.toLowerCase();
  return /location|country|region|state|province|city|remote|geography|geo/.test(identity);
}

function locationValueScore(value: FacetValue, hints: LocationHints): number {
  const text = String(value.descriptor ?? '').trim().toLowerCase();
  if (!text) return -1;
  const alwaysAllow = hintValues(hints.always_allow);
  const allow = hintValues([...(hints.allow ?? []), ...(hints.positive ?? [])]);
  const block = hintValues([...(hints.block ?? []), ...(hints.block_hard ?? [])]);
  if (block.some((t) => text.includes(t)) && !alwaysAllow.some((t) => text.includes(t))) return -1;
  if (alwaysAllow.some((t) => text.includes(t))) return 3;
  if (allow.some((t) => text.includes(t))) return 2;
  return 0;
}

export interface SplitFacet { facetParameter: string; values: Array<{ id: string; count: number; descriptor?: string }> }

/**
 * Pick the facet whose values partition the result set most evenly (smallest largest-slice),
 * or, when location hints are given, the location facet with the most hinted values.
 */
export function chooseSplitFacet(
  facets: unknown,
  opts: { exclude?: string[]; locationHints?: LocationHints } = {},
): SplitFacet | null {
  const skip = new Set(opts.exclude ?? []);
  const candidates: Array<{ facet: Facet; values: SplitFacet['values'] }> = [];
  let best: { facetParameter: string; values: SplitFacet['values']; largest: number } | null = null;
  for (const facet of flattenFacets(facets)) {
    const facetParameter = facet?.facetParameter;
    if (typeof facetParameter !== 'string' || !facetParameter || skip.has(facetParameter)) continue;
    const values = (Array.isArray(facet.values) ? (facet.values as FacetValue[]) : []).filter(
      (v) => typeof v?.id === 'string' && v.id && Number.isInteger(v?.count) && (v.count as number) >= 0,
    ) as SplitFacet['values'];
    if (values.length < 2) continue;
    candidates.push({ facet, values });
    const largest = Math.max(...values.map((v) => v.count));
    if (best === null || largest < best.largest || (largest === best.largest && values.length > best.values.length)) {
      best = { facetParameter, values, largest };
    }
  }
  if (opts.locationHints) {
    const hints = opts.locationHints;
    const locationCandidates = candidates
      .filter(({ facet }) => facetLooksLikeLocation(facet))
      .map(({ facet, values }) => ({
        facetParameter: facet.facetParameter as string,
        values: values
          .map((value) => ({ value, score: locationValueScore(value, hints) }))
          .filter(({ score }) => score > 0)
          .sort((a, b) => b.score - a.score || b.value.count - a.value.count)
          .map(({ value }) => value),
      }))
      .filter(({ values }) => values.length > 0);
    if (locationCandidates.length > 0) {
      locationCandidates.sort((a, b) => b.values.length - a.values.length);
      return locationCandidates[0]!;
    }
  }
  return best ? { facetParameter: best.facetParameter, values: best.values } : null;
}

export function pageIsPastWindow(pageJobs: Job[], sinceMs: number | undefined | null): boolean {
  if (typeof sinceMs !== 'number') return false;
  const dated = pageJobs.map((j) => j.postedAt).filter((v): v is number => typeof v === 'number');
  if (dated.length === 0) return false;
  return Math.min(...dated) < sinceMs - EARLY_STOP_MARGIN_MS;
}

// ── fetch ──────────────────────────────────────────────────────────────────────

interface QueryResult { jobs: Job[]; total: number | null; facets: unknown[]; stopReason: StopReason; clamped: boolean }

export const workdayProvider: Provider = {
  id: 'workday',
  dedupKey: workdayDedupKey,
  detect(entry) {
    const ep = resolveEndpoint(entry);
    return ep ? { url: ep.api } : null;
  },
  async fetch(entry: EmployerEntry, ctx: FetchContext): Promise<FetchResult> {
    const ep = resolveEndpoint(entry);
    if (!ep) throw new Error(`workday: cannot derive CXS endpoint for ${entry.name}`);
    const postOpts = {
      method: 'POST',
      redirect: 'error' as const,
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        'user-agent': DEFAULT_USER_AGENT,
        'accept-language': 'en',
        origin: ep.origin,
        referer: `${ep.jobBase}/`,
      },
    };
    const options = entry.workday ?? {};
    const searchText = typeof options.searchText === 'string' ? options.searchText.trim().slice(0, 200) : '';
    const baseFacets: Record<string, string[]> = {};
    for (const [key, ids] of Object.entries(options.appliedFacets ?? {})) {
      const clean = (Array.isArray(ids) ? ids : []).filter((id): id is string => typeof id === 'string' && id !== '');
      if (clean.length > 0) baseFacets[key] = clean;
    }
    const makeBody = (offset: number, appliedFacets: Record<string, string[]>, limit = PAGE_SIZE) =>
      JSON.stringify({ limit, offset, searchText, appliedFacets: { ...baseFacets, ...appliedFacets } });

    const sinceMs = typeof ctx.sinceMs === 'number' ? ctx.sinceMs : null;
    const maxPages = Number.isInteger(entry.max_pages) && (entry.max_pages as number) > 0
      ? Math.min(entry.max_pages as number, MAX_PAGES_CAP)
      : DEFAULT_MAX_PAGES;
    const ctxCap = Number.isInteger(ctx.maxPages) && (ctx.maxPages as number) > 0 ? (ctx.maxPages as number) : Infinity;
    const pageBudget = maxPages * SPLIT_PAGE_BUDGET_FACTOR;
    let pagesSpent = 0;
    let budgetExhausted = false;

    const isClamped = (total: number | null, facets: unknown, applied: readonly string[]): boolean => {
      if (ctxCap !== Infinity) return false;
      if (total === null || total > WORKDAY_OFFSET_CEILING) return false;
      const trueTotal = trueTotalFromFacets(facets, applied);
      return trueTotal !== null && trueTotal > WORKDAY_OFFSET_CEILING;
    };

    const runQuery = async (appliedFacets: Record<string, string[]>): Promise<QueryResult> => {
      pagesSpent++;
      const first = obj(await ctx.fetchJson(ep.api, { ...postOpts, body: makeBody(0, appliedFacets) }, RETRIES));
      const jobs = parseWorkdayResponse(first, entry);
      const total = typeof first.total === 'number' ? first.total : null;
      const facets = Array.isArray(first.facets) ? first.facets : [];
      const firstPostings = arr(first.jobPostings);
      let pagesToFetch = total !== null
        ? Math.min(Math.ceil(total / PAGE_SIZE), maxPages)
        : firstPostings.length >= PAGE_SIZE ? maxPages : 1;
      pagesToFetch = Math.min(pagesToFetch, ctxCap);

      let stopReason: StopReason = 'complete';
      if (pageIsPastWindow(jobs, sinceMs)) stopReason = 'early-stop';
      const sawDated = jobs.some((j) => typeof j.postedAt === 'number');
      if (stopReason === 'complete' && sinceMs !== null && ctx.includeUndated !== true && !sawDated && jobs.length > 0) {
        stopReason = 'no-date-skip';
      }
      const clamped = stopReason === 'complete' && isClamped(total, facets, Object.keys({ ...baseFacets, ...appliedFacets }));

      let page = 1;
      if (stopReason === 'complete') {
        for (; page < pagesToFetch; page++) {
          if (pagesSpent >= pageBudget) { budgetExhausted = true; break; }
          await ctx.sleep(INTER_PAGE_DELAY_MS);
          pagesSpent++;
          let json: Record<string, unknown>;
          try {
            json = obj(await ctx.fetchJson(ep.api, { ...postOpts, body: makeBody(page * PAGE_SIZE, appliedFacets) }, RETRIES));
          } catch (err) {
            ctx.log.warn(
              `workday: ${entry.name} truncated at ${page + 1} of ${pagesToFetch} pages (${jobs.length}${total !== null ? ` of ${total}` : ''} jobs): ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            stopReason = 'fetch-error';
            break;
          }
          const pageJobs = parseWorkdayResponse(json, entry);
          jobs.push(...pageJobs);
          if (total === null && arr(json.jobPostings).length < PAGE_SIZE) break;
          if (pageIsPastWindow(pageJobs, sinceMs)) { stopReason = 'early-stop'; break; }
        }
        if (stopReason === 'complete' && page === pagesToFetch && pagesToFetch === maxPages) stopReason = 'cap';
      }
      return { jobs, total, facets, stopReason, clamped };
    };

    // Market-only: ask the tenant which of its location values fall in the market and crawl just those.
    let marketRoot: QueryResult | null = null;
    if (options.marketOnly) {
      pagesSpent++;
      const probe = obj(await ctx.fetchJson(ep.api, { ...postOpts, body: makeBody(0, {}, 1) }, RETRIES));
      const plan = planMarketFacet(probe.facets, options.marketOnly);
      if (plan.kind === 'no-match') {
        ctx.log.info(`workday: ${entry.name} reports no postings in ${options.marketOnly}`);
        return { jobs: [] };
      }
      if (plan.kind === 'no-location-facet') {
        ctx.log.warn(`workday: ${entry.name} exposes no location facet; crawling the whole board`);
      } else {
        const merged = new Map<string, Job>();
        let total = 0;
        let stop: StopReason = 'complete';
        let incomplete = false;
        for (const value of plan.values) {
          if (pagesSpent >= pageBudget) { budgetExhausted = true; break; }
          if (merged.size > 0 || total > 0) await ctx.sleep(INTER_PAGE_DELAY_MS);
          let slice: QueryResult;
          try {
            slice = await runQuery({ [plan.facetParameter]: [value.id] });
          } catch (err) {
            ctx.log.warn(`workday: ${entry.name} ${plan.facetParameter}=${value.descriptor ?? value.id} failed: ${err instanceof Error ? err.message : String(err)}`);
            incomplete = true;
            continue;
          }
          total += slice.total ?? slice.jobs.length;
          for (const job of slice.jobs) if (!merged.has(job.url)) merged.set(job.url, job);
          if (slice.clamped) incomplete = true;
          if (slice.stopReason === 'fetch-error') stop = 'fetch-error';
          else if (slice.stopReason === 'cap' && stop !== 'fetch-error') stop = 'cap';
        }
        if (incomplete && stop === 'complete') stop = 'fetch-error';
        marketRoot = { jobs: [...merged.values()], total, facets: [], stopReason: stop, clamped: false };
      }
    }

    let root: QueryResult;
    if (marketRoot) {
      root = marketRoot;
    } else {
      try {
        root = await runQuery({});
      } catch (err) {
        // 4xx on the CXS endpoint is ambiguous (WAF vs retired tenant); surface it untouched.
        throw err;
      }
    }

    let jobs = root.jobs;
    let splitIncomplete = false;
    let splitStructural = false;
    let slicesSpent = 0;

    if (root.clamped) {
      const seen = new Set<string>();
      const out: Job[] = [];
      const absorb = (list: Job[]) => {
        for (const job of list) {
          if (seen.has(job.url)) continue;
          seen.add(job.url);
          out.push(job);
        }
      };
      const split = async (result: QueryResult, applied: Record<string, string[]>, depth: number, excluded: string[]): Promise<void> => {
        absorb(result.jobs);
        if (result.stopReason === 'fetch-error') splitIncomplete = true;
        else if (result.stopReason === 'cap' && !result.clamped) { splitIncomplete = true; splitStructural = true; }
        if (!result.clamped) return;
        if (depth >= MAX_SPLIT_DEPTH) { splitIncomplete = true; splitStructural = true; return; }
        const facet = chooseSplitFacet(result.facets, { exclude: excluded, locationHints: ctx.locationHints });
        if (!facet) { splitIncomplete = true; splitStructural = true; return; }
        const chosenCoverage = facet.values.reduce((sum, v) => sum + v.count, 0);
        const trueTotal = trueTotalFromFacets(result.facets, Object.keys({ ...baseFacets, ...applied }));
        if (trueTotal !== null) {
          const others: number[] = [];
          for (const f of flattenFacets(result.facets)) {
            if (f?.facetParameter === facet.facetParameter || Object.keys({ ...baseFacets, ...applied }).includes(String(f?.facetParameter))) continue;
            const c = facetCoverage(f);
            if (c !== null) others.push(c);
          }
          const spread = others.length > 0 ? Math.max(...others) - Math.min(...others) : 0;
          if (trueTotal - chosenCoverage > spread) { splitIncomplete = true; splitStructural = true; }
        }
        for (const value of facet.values) {
          if (slicesSpent >= MAX_SPLIT_SLICES || pagesSpent >= pageBudget) { splitIncomplete = true; splitStructural = true; break; }
          slicesSpent++;
          await ctx.sleep(INTER_PAGE_DELAY_MS);
          const nextApplied = { ...applied, [facet.facetParameter]: [value.id] };
          let slice: QueryResult;
          try {
            slice = await runQuery(nextApplied);
          } catch (err) {
            ctx.log.warn(`workday: ${entry.name} slice ${facet.facetParameter}=${value.id} failed: ${err instanceof Error ? err.message : String(err)}`);
            splitIncomplete = true;
            continue;
          }
          await split(slice, nextApplied, depth + 1, [...excluded, facet.facetParameter]);
        }
      };
      await split(root, {}, 0, []);
      jobs = out;
      ctx.log.warn(
        `workday: ${entry.name} offset-clamped at ${WORKDAY_OFFSET_CEILING}; recovered ${jobs.length} jobs via ${slicesSpent} facet slices${
          splitIncomplete || budgetExhausted ? ' (still incomplete)' : ''
        }`,
      );
    }

    // Resolve "N Locations" placeholders from the detail document (not in probe mode).
    if (ctxCap === Infinity) {
      const detailOpts = {
        redirect: 'error' as const,
        headers: { accept: 'application/json', 'user-agent': DEFAULT_USER_AGENT, 'accept-language': 'en', referer: `${ep.jobBase}/` },
      };
      const wanted = ctx.titleWanted;
      const placeholders = jobs.filter((j) => isMultiLocationPlaceholder(j.location)).filter((j) => (wanted ? wanted(j.title) : true));
      const pending = placeholders.filter((j) => j.url.startsWith(`${ep.jobBase}/`));
      let requests = 0;
      for (const job of pending) {
        if (requests >= MAX_DETAIL_REQUESTS) break;
        if (requests > 0) await ctx.sleep(INTER_PAGE_DELAY_MS);
        requests++;
        let detail: unknown;
        try {
          detail = await ctx.fetchJson(`${ep.cxsBase}${job.url.slice(ep.jobBase.length)}`, detailOpts, { retries: 1 });
        } catch {
          continue;
        }
        const places = locationsFromDetail(detail);
        if (!places) continue;
        job.location = places;
        const started = postedAtFromDetail(detail);
        if (started !== undefined) job.postedAt = started;
      }
    }

    let truncation: Truncation | undefined;
    if (splitIncomplete || budgetExhausted) {
      truncation = {
        reason: budgetExhausted ? 'budget' : 'split-incomplete',
        transient: !(splitStructural || budgetExhausted),
        detail: `${jobs.length} jobs recovered`,
      };
    } else if (root.stopReason === 'fetch-error') {
      truncation = { reason: 'fetch-error', transient: true };
    } else if (root.stopReason === 'cap' && !root.clamped) {
      truncation = { reason: 'cap', transient: false, detail: `max_pages=${maxPages}${root.total !== null ? `, ${jobs.length} of ${root.total}` : ''}` };
    } else if (root.stopReason === 'no-date-skip') {
      truncation = { reason: 'no-date-skip', transient: false, detail: 'no posting carried a date; skipped by sinceMs' };
    }
    return truncation ? { jobs, truncation } : { jobs };
  },
};
