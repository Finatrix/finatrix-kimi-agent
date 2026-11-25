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
 * For a resuming caller (FetchContext.resume) a board too big for one call is read over several: the crawl pauses
 * at the deadline or its job allowance and returns a WorkdayCursor, and "N Locations" are resolved page by page so
 * a pause never leaves a page half-read.
 */
import type { EmployerEntry, FetchContext, FetchResult, Job, LocationHints, Provider, Truncation } from '../../types.ts';
import { DEFAULT_USER_AGENT } from '../../util/http.ts';
import { parseLocation } from '../../markets/index.ts';
import type { CareersMarket } from '../../markets/types.ts';
import { arr, obj, pastDeadline, positiveInt, str } from './_util.ts';

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
    const values = facetValues(facet);
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

export interface MarketSlice { facetParameter: string; id: string; count: number; descriptor?: string }

export type MarketSlicePlan = { kind: 'slices'; slices: MarketSlice[] } | { kind: 'no-match' } | { kind: 'no-location-facet' };

/** Each market's slices (planMarketFacet) together, without repeats. One market plans exactly as planMarketFacet does. */
export function planMarketSlices(facets: unknown, markets: readonly CareersMarket[]): MarketSlicePlan {
  const slices: MarketSlice[] = [];
  const taken = new Set<string>();
  for (const market of markets) {
    const plan = planMarketFacet(facets, market);
    // Whether a location facet exists depends on the facets alone, so every market gives the same answer.
    if (plan.kind === 'no-location-facet') return plan;
    if (plan.kind === 'no-match') continue;
    for (const value of plan.values) {
      const key = `${plan.facetParameter}\u0000${value.id}`;
      if (taken.has(key)) continue;
      taken.add(key);
      slices.push({ facetParameter: plan.facetParameter, ...value });
    }
  }
  return slices.length > 0 ? { kind: 'slices', slices } : { kind: 'no-match' };
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

/** A facet's values that can be applied as a filter: an id and a non-negative count. */
function facetValues(facet: Facet): SplitFacet['values'] {
  return (Array.isArray(facet.values) ? (facet.values as FacetValue[]) : []).filter(
    (v) => typeof v?.id === 'string' && v.id && Number.isInteger(v?.count) && (v.count as number) >= 0,
  ) as SplitFacet['values'];
}

/**
 * Pick the facet whose values partition the result set most evenly (smallest largest-slice),
 * or, when location hints are given, the location facet with the most hinted values.
 * `prefer` names a facet to keep using while it is still offered (a resumed crawl splits as it began).
 */
export function chooseSplitFacet(
  facets: unknown,
  opts: { exclude?: string[]; locationHints?: LocationHints; prefer?: string } = {},
): SplitFacet | null {
  const skip = new Set(opts.exclude ?? []);
  const candidates: Array<{ facet: Facet; values: SplitFacet['values'] }> = [];
  let best: { facetParameter: string; values: SplitFacet['values']; largest: number } | null = null;
  for (const facet of flattenFacets(facets)) {
    const facetParameter = facet?.facetParameter;
    if (typeof facetParameter !== 'string' || !facetParameter || skip.has(facetParameter)) continue;
    const values = facetValues(facet);
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
      const preferred = locationCandidates.find((c) => c.facetParameter === opts.prefer);
      if (preferred) return preferred;
      locationCandidates.sort((a, b) => b.values.length - a.values.length);
      return locationCandidates[0]!;
    }
  }
  const preferred = candidates.find(({ facet }) => facet.facetParameter === opts.prefer);
  if (preferred) return { facetParameter: opts.prefer!, values: preferred.values };
  return best ? { facetParameter: best.facetParameter, values: best.values } : null;
}

export function pageIsPastWindow(pageJobs: Job[], sinceMs: number | undefined | null): boolean {
  if (typeof sinceMs !== 'number') return false;
  const dated = pageJobs.map((j) => j.postedAt).filter((v): v is number => typeof v === 'number');
  if (dated.length === 0) return false;
  return Math.min(...dated) < sinceMs - EARLY_STOP_MARGIN_MS;
}


// ── resumable crawl ────────────────────────────────────────────────────────────

/**
 * Where a paused crawl of one board stands: the JSON a resuming caller keeps between calls (FetchContext.resume).
 * A query is named by its path of facet slices from the board ('' is the whole board, 'a=1/b=2' a slice of a slice),
 * so the next call finds it again whatever order Workday lists its facets in.
 */
export interface WorkdayCursor {
  v: 1;
  /** Next offset to read for each query part-way through its own pages; -1 once all of them are read. */
  next: Record<string, number>;
  /** Queries finished: their own pages and every slice they were split into. */
  done: string[];
  /** The facet each clamped query was split on, so the next call splits it the same way. */
  splitOn: Record<string, string>;
}

const OWN_PAGES_READ = -1;

function slicePath(parent: string, facetParameter: string, id: string): string {
  const step = `${encodeURIComponent(facetParameter)}=${encodeURIComponent(id)}`;
  return parent ? `${parent}/${step}` : step;
}

class CrawlProgress {
  readonly next = new Map<string, number>();
  readonly done = new Set<string>();
  readonly splitOn = new Map<string, string>();

  /** A cursor this provider wrote. Anything else, or a finished crawl, starts a new pass. */
  static from(raw: unknown): CrawlProgress {
    const progress = new CrawlProgress();
    const cursor = obj(raw);
    if (cursor.v !== 1 || arr(cursor.done).includes('')) return progress;
    for (const [path, offset] of Object.entries(obj(cursor.next))) {
      if (Number.isSafeInteger(offset) && ((offset as number) >= 0 || offset === OWN_PAGES_READ)) progress.next.set(path, offset as number);
    }
    for (const path of arr(cursor.done)) if (typeof path === 'string') progress.done.add(path);
    for (const [path, facet] of Object.entries(obj(cursor.splitOn))) if (typeof facet === 'string' && facet) progress.splitOn.set(path, facet);
    return progress;
  }

  /** Mark a query finished. Its slices are never visited again, so their entries go. */
  finish(path: string): void {
    const inside = (key: string) => path === '' || key === path || key.startsWith(`${path}/`);
    for (const key of [...this.next.keys()]) if (inside(key)) this.next.delete(key);
    for (const key of [...this.splitOn.keys()]) if (inside(key)) this.splitOn.delete(key);
    for (const key of [...this.done]) if (inside(key)) this.done.delete(key);
    this.done.add(path);
  }

  cursor(): WorkdayCursor {
    return { v: 1, next: Object.fromEntries(this.next), done: [...this.done], splitOn: Object.fromEntries(this.splitOn) };
  }
}

// ── fetch ──────────────────────────────────────────────────────────────────────

interface QueryResult { total: number | null; facets: unknown[]; stopReason: StopReason; clamped: boolean }

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
    // Past ctx.deadline: start no further page, slice or detail request, and report the board as cut short.
    let timedOut = false;
    // A resuming caller (ctx.resume) gets a pause instead: this call stops where it is and says where to carry on.
    const resumable = ctx.resume !== undefined;
    const progress = CrawlProgress.from(ctx.resume?.cursor);
    const maxJobs = resumable ? positiveInt(ctx.resume?.maxJobs, Infinity, Infinity) : Infinity;
    let paused = false;
    const pause = (): true => (paused = true);
    // Set once this call reads a page no earlier call of the pass had read, so every call gets further.
    let advanced = false;
    /** Postings read so far, by URL; the first copy read wins. */
    const collected = new Map<string, Job>();

    const outOfTime = (): boolean => {
      if (paused || timedOut) return true;
      if (!pastDeadline(ctx)) return false;
      if (resumable) return pause();
      return (timedOut = true);
    };
    /** A resumable call that has got further stops before a page that could take it past maxJobs. */
    const outOfRoom = (): boolean => paused || (advanced && collected.size + PAGE_SIZE > maxJobs && pause());
    /** Out of pages (or slices) for this call: a resumable call pauses; any other runs `cutShort` to record why it stopped. */
    const outOfPages = (cutShort: () => void, spent = pagesSpent >= pageBudget): boolean => {
      if (!spent) return false;
      if (resumable) return pause();
      cutShort();
      return true;
    };

    const isClamped = (total: number | null, facets: unknown, applied: readonly string[]): boolean => {
      if (ctxCap !== Infinity) return false;
      if (total === null || total > WORKDAY_OFFSET_CEILING) return false;
      const trueTotal = trueTotalFromFacets(facets, applied);
      return trueTotal !== null && trueTotal > WORKDAY_OFFSET_CEILING;
    };

    // "N Locations" placeholders are resolved from the detail document as their page is read (not in probe mode).
    const detailOpts = {
      redirect: 'error' as const,
      headers: { accept: 'application/json', 'user-agent': DEFAULT_USER_AGENT, 'accept-language': 'en', referer: `${ep.jobBase}/` },
    };
    const wanted = ctx.titleWanted;
    const needsDetail = (job: Job) =>
      ctxCap === Infinity && isMultiLocationPlaceholder(job.location) && (wanted ? wanted(job.title) : true) && job.url.startsWith(`${ep.jobBase}/`);
    let detailRequests = 0;
    /** False when the call stopped before every placeholder on the page was looked up. */
    const resolvePlaceholders = async (jobs: Job[]): Promise<boolean> => {
      for (const job of jobs) {
        if (!needsDetail(job)) continue;
        if (detailRequests >= MAX_DETAIL_REQUESTS) {
          if (resumable) return !pause();
          continue;
        }
        if (outOfTime()) return false;
        if (detailRequests > 0) await ctx.sleep(INTER_PAGE_DELAY_MS);
        detailRequests++;
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
      return true;
    };
    /** Keep one page of postings. A resumable call keeps none of a page it could not finish: it reads it again next time. */
    const takePage = async (jobs: Job[]): Promise<boolean> => {
      const fresh = new Map<string, Job>();
      for (const job of jobs) if (!collected.has(job.url) && !fresh.has(job.url)) fresh.set(job.url, job);
      const finished = await resolvePlaceholders([...fresh.values()]);
      if (finished || !resumable) for (const [url, job] of fresh) collected.set(url, job);
      return finished;
    };

    /** Read one query's pages, carrying on from where the cursor says an earlier call stopped. */
    const runQuery = async (path: string, appliedFacets: Record<string, string[]>): Promise<QueryResult> => {
      pagesSpent++;
      const first = obj(await ctx.fetchJson(ep.api, { ...postOpts, body: makeBody(0, appliedFacets) }, RETRIES));
      const firstJobs = parseWorkdayResponse(first, entry);
      const total = typeof first.total === 'number' ? first.total : null;
      const facets = Array.isArray(first.facets) ? first.facets : [];
      const firstPostings = arr(first.jobPostings);
      let pagesToFetch = total !== null
        ? Math.min(Math.ceil(total / PAGE_SIZE), maxPages)
        : firstPostings.length >= PAGE_SIZE ? maxPages : 1;
      pagesToFetch = Math.min(pagesToFetch, ctxCap);

      let stopReason: StopReason = 'complete';
      if (pageIsPastWindow(firstJobs, sinceMs)) stopReason = 'early-stop';
      const sawDated = firstJobs.some((j) => typeof j.postedAt === 'number');
      if (stopReason === 'complete' && sinceMs !== null && ctx.includeUndated !== true && !sawDated && firstJobs.length > 0) {
        stopReason = 'no-date-skip';
      }
      const clamped = stopReason === 'complete' && isClamped(total, facets, Object.keys({ ...baseFacets, ...appliedFacets }));
      if (!(await takePage(firstJobs))) return { total, facets, stopReason, clamped };
      const resumeAt = progress.next.get(path);
      if (resumeAt === undefined) {
        advanced = true;
        progress.next.set(path, PAGE_SIZE);
      }

      // The first page is read on every call: it carries the totals and facets. A resumed query then carries on one
      // page before where it stopped, so a posting that moved up a page in the meantime is still read.
      let page = resumeAt === OWN_PAGES_READ ? pagesToFetch : resumeAt ? Math.max(1, Math.floor(resumeAt / PAGE_SIZE) - 1) : 1;
      let reachedEnd = false;
      if (stopReason === 'complete') {
        for (; page < pagesToFetch; page++) {
          if (outOfRoom() || outOfTime() || outOfPages(() => (budgetExhausted = true))) break;
          await ctx.sleep(INTER_PAGE_DELAY_MS);
          pagesSpent++;
          let json: Record<string, unknown>;
          try {
            json = obj(await ctx.fetchJson(ep.api, { ...postOpts, body: makeBody(page * PAGE_SIZE, appliedFacets) }, RETRIES));
          } catch (err) {
            ctx.log.warn(
              `workday: ${entry.name} truncated at ${page + 1} of ${pagesToFetch} pages (${collected.size}${total !== null ? ` of ${total}` : ''} jobs): ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            stopReason = 'fetch-error';
            break;
          }
          const pageJobs = parseWorkdayResponse(json, entry);
          if (!(await takePage(pageJobs))) break;
          if ((page + 1) * PAGE_SIZE > (resumeAt ?? 0)) advanced = true;
          progress.next.set(path, (page + 1) * PAGE_SIZE);
          if (total === null && arr(json.jobPostings).length < PAGE_SIZE) { reachedEnd = true; break; }
          if (pageIsPastWindow(pageJobs, sinceMs)) { stopReason = 'early-stop'; break; }
        }
        if (page >= pagesToFetch) reachedEnd = true;
        if (stopReason === 'complete' && page === pagesToFetch && pagesToFetch === maxPages) stopReason = 'cap';
      }
      // Any stop but a pause ends this query's paging; a pause keeps the offset for the next call.
      if (reachedEnd || stopReason !== 'complete') progress.next.set(path, OWN_PAGES_READ);
      return { total, facets, stopReason, clamped };
    };

    let splitIncomplete = false;
    let splitStructural = false;
    let slicesSpent = 0;

    /** Read the slices of a query Workday clamped at the offset ceiling, splitting a clamped slice again. */
    const split = async (result: QueryResult, path: string, applied: Record<string, string[]>, depth: number, excluded: string[]): Promise<void> => {
      if (result.stopReason === 'fetch-error') splitIncomplete = true;
      else if (result.stopReason === 'cap' && !result.clamped) { splitIncomplete = true; splitStructural = true; }
      if (paused || timedOut) return;
      if (!result.clamped) {
        if (progress.next.get(path) === OWN_PAGES_READ) progress.finish(path);
        return;
      }
      if (depth >= MAX_SPLIT_DEPTH) { splitIncomplete = true; splitStructural = true; progress.finish(path); return; }
      const facet = chooseSplitFacet(result.facets, { exclude: excluded, locationHints: ctx.locationHints, prefer: progress.splitOn.get(path) });
      if (!facet) { splitIncomplete = true; splitStructural = true; progress.finish(path); return; }
      progress.splitOn.set(path, facet.facetParameter);
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
        const child = slicePath(path, facet.facetParameter, value.id);
        if (progress.done.has(child)) continue;
        if (outOfRoom() || outOfTime()) return;
        if (outOfPages(() => { splitIncomplete = true; splitStructural = true; }, slicesSpent >= MAX_SPLIT_SLICES || pagesSpent >= pageBudget)) return;
        slicesSpent++;
        await ctx.sleep(INTER_PAGE_DELAY_MS);
        const nextApplied = { ...applied, [facet.facetParameter]: [value.id] };
        let slice: QueryResult;
        try {
          slice = await runQuery(child, nextApplied);
        } catch (err) {
          ctx.log.warn(`workday: ${entry.name} slice ${facet.facetParameter}=${value.id} failed: ${err instanceof Error ? err.message : String(err)}`);
          splitIncomplete = true;
          progress.finish(child);
          continue;
        }
        await split(slice, child, nextApplied, depth + 1, [...excluded, facet.facetParameter]);
        if (paused) return;
      }
      progress.finish(path);
    };

    let rootStop: StopReason = 'complete';
    let rootTotal: number | null = null;
    let rootClamped = false;
    let crawled = false;

    // Market-only: ask the tenant which of its location values fall in the markets and crawl just those.
    const markets: readonly CareersMarket[] = typeof options.marketOnly === 'string' ? [options.marketOnly] : (options.marketOnly ?? []);
    if (markets.length > 0) {
      pagesSpent++;
      const probe = obj(await ctx.fetchJson(ep.api, { ...postOpts, body: makeBody(0, {}, 1) }, RETRIES));
      const plan = planMarketSlices(probe.facets, markets);
      if (plan.kind === 'no-match') {
        ctx.log.info(`workday: ${entry.name} reports no postings in ${markets.join(', ')}`);
        return { jobs: [] };
      }
      if (plan.kind === 'no-location-facet') {
        ctx.log.warn(`workday: ${entry.name} exposes no location facet; crawling the whole board`);
      } else {
        crawled = true;
        let total = 0;
        let incomplete = false;
        let started = 0;
        for (const slice of plan.slices) {
          const path = slicePath('', slice.facetParameter, slice.id);
          if (progress.done.has(path)) continue;
          if (outOfRoom() || outOfTime() || outOfPages(() => (budgetExhausted = true))) break;
          if (started++ > 0) await ctx.sleep(INTER_PAGE_DELAY_MS);
          const applied = { [slice.facetParameter]: [slice.id] };
          let result: QueryResult;
          try {
            result = await runQuery(path, applied);
          } catch (err) {
            ctx.log.warn(`workday: ${entry.name} ${slice.facetParameter}=${slice.descriptor ?? slice.id} failed: ${err instanceof Error ? err.message : String(err)}`);
            incomplete = true;
            progress.finish(path);
            continue;
          }
          total += result.total ?? 0;
          if (result.stopReason === 'fetch-error') rootStop = 'fetch-error';
          else if (result.stopReason === 'cap' && !result.clamped && rootStop !== 'fetch-error') rootStop = 'cap';
          // A market slice past the offset ceiling (a whole country of a large employer) is split like a board.
          if (result.clamped) await split(result, path, applied, 1, [slice.facetParameter]);
          else if (progress.next.get(path) === OWN_PAGES_READ) progress.finish(path);
          if (paused) break;
        }
        if (incomplete && rootStop === 'complete') rootStop = 'fetch-error';
        rootTotal = total;
      }
    }

    if (!crawled) {
      // 4xx on the CXS endpoint is ambiguous (WAF vs retired tenant); it propagates untouched.
      const root = await runQuery('', {});
      rootStop = root.stopReason;
      rootTotal = root.total;
      rootClamped = root.clamped;
      if (root.clamped) {
        await split(root, '', {}, 0, []);
        ctx.log.warn(
          `workday: ${entry.name} offset-clamped at ${WORKDAY_OFFSET_CEILING}; recovered ${collected.size} jobs via ${slicesSpent} facet slices${
            paused ? ' (paused)' : splitIncomplete || budgetExhausted ? ' (still incomplete)' : ''
          }`,
        );
      }
    }

    const jobs = [...collected.values()];
    let truncation: Truncation | undefined;
    if (splitIncomplete || budgetExhausted || timedOut) {
      truncation = {
        reason: budgetExhausted || timedOut ? 'budget' : 'split-incomplete',
        transient: !(splitStructural || budgetExhausted || timedOut),
        detail: `${timedOut ? 'time budget reached; ' : ''}${jobs.length} jobs recovered`,
      };
    } else if (rootStop === 'fetch-error') {
      truncation = { reason: 'fetch-error', transient: true };
    } else if (rootStop === 'cap' && !rootClamped) {
      truncation = { reason: 'cap', transient: false, detail: `max_pages=${maxPages}${rootTotal !== null ? `, ${jobs.length} of ${rootTotal}` : ''}` };
    } else if (rootStop === 'no-date-skip') {
      truncation = { reason: 'no-date-skip', transient: false, detail: 'no posting carried a date; skipped by sinceMs' };
    }
    const out: FetchResult = truncation ? { jobs, truncation } : { jobs };
    if (paused) out.cursor = progress.cursor();
    return out;
  },
};
