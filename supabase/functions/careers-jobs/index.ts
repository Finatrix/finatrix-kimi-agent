// FinatriX Careers — job search edge function (Phase 2.1 provider adapters).
//
// A pluggable provider registry: each provider implements one interface
// (search → normalized jobs) and is enabled purely by the presence of its
// secret. Adding a provider = adding one object to PROVIDERS below; nothing
// is hardcoded elsewhere. Aggregators (JSearch, Adzuna, Jooble) surface
// listings that originate from LinkedIn, Indeed, Naukri, Glassdoor, Foundit,
// company career pages and government portals — each normalized job keeps
// its original source attribution in `via`.
//
// Phase 2.1: the client's Intent Engine sends `terms` (expanded synonyms for
// the user's query — "Risk" ⇒ risk analyst, operational risk, AML, …). Each
// adapter translates those terms into its provider's native query syntax
// (Adzuna what_or, JSearch/Jooble OR-syntax) so recall improves while the
// client's deterministic filter guarantees precision. Country strictly
// routes provider endpoints: an India search never calls a UK endpoint.
//
// Deploy:   supabase functions deploy careers-jobs
// Secrets (each one optional — providers without their secret simply stay off):
//   ADZUNA_APP_ID / ADZUNA_APP_KEY   → adzuna
//   RAPIDAPI_KEY                     → jsearch
//   JOOBLE_KEY                       → jooble
//   Remotive needs no key.

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { rateLimited } from '../_shared/ratelimit.ts';
import { corsHeaders } from '../_shared/origins.ts';
// ── Multi-provider architecture (providers/*). The manager owns the entire
//    search flow; nothing provider-specific lives in this composition root. ──
import { LegacyProvider } from './providers/LegacyProvider.ts';
import { ProviderManager } from './providers/ProviderManager.ts';
import { buildNativeProviders, buildStores, runtimeConfigFromEnv, validateEnv } from './providers/factory.ts';
import { TieredCache, InMemoryCacheStore } from './providers/ProviderCache.ts';
import { InMemoryQuotaStore, checkRequestQuota, clientIp } from './providers/RateLimiter.ts';
import type { DbClient } from './providers/store.ts';
import type { SearchInput, QuotaStore, HealthStore, MetricsStore } from './providers/types.ts';

const RATE_PER_MINUTE = Number(Deno.env.get('CAREERS_JOBS_RATE_PER_MINUTE') ?? '30');

// CORS: see ../_shared/origins.ts for why the allowlist is built from
// CANONICAL_HOST and CAREERS_ALLOWED_ORIGINS is additive. Bearer-JWT
// authenticated and cookieless, so reflecting any well-formed web origin is
// safe and removes brittle per-domain allowlists as a failure mode.
function corsFor(req: Request): Record<string, string> {
  return corsHeaders(req, {
    headers: 'authorization, x-client-info, apikey, content-type',
    methods: 'POST, OPTIONS',
    reflectAnyWebOrigin: true,
  });
}

const PROVIDER_TIMEOUT_MS = 12_000;
const MAX_RESULTS_PER_PROVIDER = 40;
// Extra attempts on TRANSIENT failures only (network drop, timeout, upstream
// 5xx). Config-tunable; 0 disables retries. Never retries 4xx — a 401/400/429
// is deterministic for this call, and retrying a 429 would burn paid quota.
const PROVIDER_RETRIES = Math.max(0, Math.min(2, Number(Deno.env.get('CAREERS_PROVIDER_RETRIES') ?? '1')));

// Ops kill-switch: force providers off (maintenance, cost control, a provider
// incident) without a code change or redeploy — just set the secret. Comma-
// separated provider ids. Complements the automatic secret-gating below.
const DISABLED_PROVIDERS = new Set(
  (Deno.env.get('CAREERS_DISABLED_PROVIDERS') ?? '')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
);

function jsonWith(cors: Record<string, string>) {
  return (status: number, body: unknown): Response =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
}

/**
 * Pre-auth burst gate. `supabase.auth.getUser()` is a network round-trip to the
 * auth service, and the per-user limiter below cannot run until it succeeds — so
 * without this an unauthenticated flood costs a GoTrue call and a billed
 * invocation per request, with nothing bounding it. Keyed on the IP, which is
 * all we know before authenticating.
 */
const UNAUTH_RATE_PER_MINUTE = Number(Deno.env.get('CAREERS_JOBS_UNAUTH_RATE_PER_MINUTE') ?? '60');

// ─────────────────────────── canonical shapes ───────────────────────────

interface SearchParams {
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

interface NormalizedJob {
  source: string;         // provider id
  via: string;            // original posting source when the aggregator reports it
  external_id: string;
  company: string;
  title: string;
  description: string;
  salary_min: number | null;
  salary_max: number | null;
  currency: string;
  location: string;
  country: string;
  work_mode: string;      // remote | hybrid | onsite | ''
  employment_type: string;
  apply_url: string;
  posted_at: string | null;
  closes_at: string | null;
  industry: string;
}

interface Provider {
  id: string;
  /** Secrets that must all be present for the provider to be active. */
  secrets: string[];
  /** Skip the provider entirely when it cannot serve this search. */
  supports?(params: SearchParams): boolean;
  search(params: SearchParams, env: Record<string, string>): Promise<NormalizedJob[]>;
}

// ─────────────────────────── helpers ───────────────────────────

/** Failures worth another attempt: aborts/timeouts, network errors, and 5xx
 *  upstreams. 4xx (auth, bad request, quota/429) are permanent for this call. */
function isTransient(err: unknown): boolean {
  const status = (err as { status?: number })?.status;
  if (typeof status === 'number') return status >= 500;
  return /abort|timeout|network|fetch failed|connection/i.test(String(err));
}

async function fetchOnce(url: string, init: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) {
      const e = new Error(`HTTP ${res.status}`) as Error & { status: number };
      e.status = res.status;   // lets isTransient() distinguish 5xx from 4xx
      throw e;
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch JSON with a per-attempt timeout and bounded retries on transient
 *  failures. Each attempt gets its own AbortController/timeout. */
async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  let attempt = 0;
  for (;;) {
    try {
      return await fetchOnce(url, init);
    } catch (e) {
      if (attempt >= PROVIDER_RETRIES || !isTransient(e)) throw e;
      attempt++;
      await new Promise((r) => setTimeout(r, 250 * attempt)); // brief linear backoff
    }
  }
}

function str(v: unknown, max = 500): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function iso(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const COUNTRY_LABELS: Record<string, string> = {
  in: 'India', gb: 'United Kingdom', us: 'United States', au: 'Australia',
  sg: 'Singapore', ae: 'United Arab Emirates', ca: 'Canada', de: 'Germany',
};

/** Top expansion terms for OR-style provider queries. */
function orTerms(p: SearchParams, max: number): string[] {
  const terms = p.terms.length ? p.terms : [p.query];
  return terms.slice(0, max);
}

// ─────────────────────────── providers ───────────────────────────

const remotive: Provider = {
  id: 'remotive',
  secrets: [],
  // Remote-only board: pointless when the user wants on-site work.
  supports: (p) => p.workMode !== 'onsite',
  async search(p) {
    const url = `https://remotive.com/api/remote-jobs?limit=${MAX_RESULTS_PER_PROVIDER}&search=${encodeURIComponent(p.query)}`;
    const data = (await fetchJson(url)) as { jobs?: Record<string, unknown>[] };
    return (data.jobs ?? []).map((j) => ({
      source: 'remotive',
      via: 'Remotive',
      external_id: String(j.id ?? ''),
      company: str(j.company_name, 200),
      title: str(j.title, 300),
      description: str(j.description, 20_000),
      salary_min: null,
      salary_max: null,
      currency: '',
      location: str(j.candidate_required_location, 200),
      country: '',
      work_mode: 'remote',
      employment_type: str(j.job_type, 60),
      apply_url: str(j.url, 600),
      posted_at: iso(j.publication_date),
      closes_at: null,
      industry: str(j.category, 120),
    }));
  },
};

const adzuna: Provider = {
  id: 'adzuna',
  secrets: ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY'],
  async search(p, env) {
    // Country routes the endpoint itself: /jobs/{country}/search.
    const country = (p.country || 'in').toLowerCase();
    const q = new URLSearchParams({
      app_id: env.ADZUNA_APP_ID,
      app_key: env.ADZUNA_APP_KEY,
      results_per_page: String(MAX_RESULTS_PER_PROVIDER),
      // what_or: any expanded term may match — recall; precision is client-side.
      what_or: orTerms(p, 10).join(' '),
      'content-type': 'application/json',
    });
    if (p.location) q.set('where', p.location);
    if (p.salaryMin) q.set('salary_min', String(p.salaryMin));
    if (p.salaryMax) q.set('salary_max', String(p.salaryMax));
    if (p.employmentType === 'fulltime') q.set('full_time', '1');
    if (p.employmentType === 'parttime') q.set('part_time', '1');
    if (p.employmentType === 'contract') q.set('contract', '1');
    const data = (await fetchJson(
      `https://api.adzuna.com/v1/api/jobs/${country}/search/${p.page + 1}?${q}`
    )) as { results?: Record<string, unknown>[] };
    return (data.results ?? []).map((j) => {
      const company = j.company as Record<string, unknown> | undefined;
      const loc = j.location as Record<string, unknown> | undefined;
      const cat = j.category as Record<string, unknown> | undefined;
      return {
        source: 'adzuna',
        via: 'Adzuna',
        external_id: String(j.id ?? ''),
        company: str(company?.display_name, 200),
        title: str(j.title, 300),
        description: str(j.description, 20_000),
        salary_min: num(j.salary_min),
        salary_max: num(j.salary_max),
        currency: country === 'in' ? 'INR' : '',
        location: str(loc?.display_name, 200),
        country: country.toUpperCase(),
        work_mode: '',
        employment_type: str(j.contract_time, 60),
        apply_url: str(j.redirect_url, 600),
        posted_at: iso(j.created),
        closes_at: null,
        industry: str(cat?.label, 120),
      };
    });
  },
};

const jsearch: Provider = {
  id: 'jsearch',
  secrets: ['RAPIDAPI_KEY'],
  async search(p, env) {
    // JSearch understands OR in the free-text query.
    const what = orTerms(p, 6).map((t) => (t.includes(' ') ? `"${t}"` : t)).join(' OR ');
    const where = p.location || COUNTRY_LABELS[(p.country || 'in').toLowerCase()] || '';
    const q = new URLSearchParams({
      query: where ? `${what} in ${where}` : what,
      page: String(p.page + 1),
      num_pages: '1',
      country: (p.country || 'in').toLowerCase(),
    });
    if (p.remoteOnly) q.set('work_from_home', 'true');
    if (p.employmentType) {
      const map: Record<string, string> = { fulltime: 'FULLTIME', parttime: 'PARTTIME', contract: 'CONTRACTOR', intern: 'INTERN' };
      const mapped = map[p.employmentType];
      if (mapped) q.set('employment_types', mapped);
    }
    const data = (await fetchJson(`https://jsearch.p.rapidapi.com/search?${q}`, {
      headers: {
        'X-RapidAPI-Key': env.RAPIDAPI_KEY,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      },
    })) as { data?: Record<string, unknown>[] };
    return (data.data ?? []).slice(0, MAX_RESULTS_PER_PROVIDER).map((j) => ({
      source: 'jsearch',
      via: str(j.job_publisher, 80) || 'Google for Jobs',
      external_id: str(j.job_id, 200),
      company: str(j.employer_name, 200),
      title: str(j.job_title, 300),
      description: str(j.job_description, 20_000),
      salary_min: num(j.job_min_salary),
      salary_max: num(j.job_max_salary),
      currency: str(j.job_salary_currency, 8),
      location: [str(j.job_city, 100), str(j.job_state, 100)].filter(Boolean).join(', '),
      country: str(j.job_country, 8),
      work_mode: j.job_is_remote === true ? 'remote' : '',
      employment_type: str(j.job_employment_type, 60).toLowerCase(),
      apply_url: str(j.job_apply_link, 600),
      posted_at: iso(j.job_posted_at_datetime_utc),
      closes_at: iso(j.job_offer_expiration_datetime_utc),
      industry: '',
    }));
  },
};

const jooble: Provider = {
  id: 'jooble',
  secrets: ['JOOBLE_KEY'],
  async search(p, env) {
    // Jooble keyword syntax supports OR via "|"; location falls back to the
    // country label so an India search never leaks into other regions.
    const data = (await fetchJson(`https://jooble.org/api/${env.JOOBLE_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        keywords: orTerms(p, 6).join(' | '),
        location: p.location || COUNTRY_LABELS[(p.country || 'in').toLowerCase()] || '',
        ...(p.salaryMin ? { salary: p.salaryMin } : {}),
        page: String(p.page + 1),
      }),
    })) as { jobs?: Record<string, unknown>[] };
    return (data.jobs ?? []).slice(0, MAX_RESULTS_PER_PROVIDER).map((j) => ({
      source: 'jooble',
      via: str(j.source, 80) || 'Jooble',
      external_id: String(j.id ?? ''),
      company: str(j.company, 200),
      title: str(j.title, 300),
      description: str(j.snippet, 20_000),
      salary_min: null,
      salary_max: null,
      currency: '',
      location: str(j.location, 200),
      country: '',
      work_mode: '',
      employment_type: str(j.type, 60).toLowerCase(),
      apply_url: str(j.link, 600),
      posted_at: iso(j.updated),
      closes_at: null,
      industry: '',
    }));
  },
};

const PROVIDERS: Provider[] = [remotive, adzuna, jsearch, jooble];

// ─────────────────────── unified provider manager ───────────────────────
//
// The six native providers (Active Jobs DB, LinkedIn, Workday, Google Jobs,
// Glassdoor, Job Posting Feed) plus the four incumbents (adzuna/jsearch/jooble/
// remotive), all behind the single JobProvider interface. Built once per isolate
// and reused. Incumbents rank below the premium set but are never removed, so
// functionality only grows. Degrades to in-memory stores if the service-role
// client is unavailable — search keeps working, just without durable cache/metrics.

/** Incumbent providers rank below the premium set (which occupies 100…50). */
const LEGACY_PRIORITY: Record<string, number> = { adzuna: 40, jsearch: 38, jooble: 30, remotive: 20 };

let _manager: ProviderManager | null = null;
let _quota: QuotaStore | null = null;
let _admin: ReturnType<typeof createClient> | null = null;

function getManager(): { manager: ProviderManager; quota: QuotaStore } {
  if (_manager && _quota) return { manager: _manager, quota: _quota };

  const env = Deno.env.toObject();
  const cfg = runtimeConfigFromEnv(env, PROVIDER_TIMEOUT_MS, MAX_RESULTS_PER_PROVIDER, PROVIDER_RETRIES);

  // Env for the incumbents (their own declared secrets only).
  const legacyEnv: Record<string, string> = {};
  for (const key of new Set(PROVIDERS.flatMap((p) => p.secrets))) {
    const v = Deno.env.get(key);
    if (v) legacyEnv[key] = v;
  }
  const legacy = PROVIDERS.map((p) => new LegacyProvider({
    id: p.id,
    priority: LEGACY_PRIORITY[p.id] ?? 10,
    secrets: p.secrets,
    costPerSearchMicroUsd: 0, // free/low-cost incumbents
    supports: (input) => p.supports?.(input as unknown as SearchParams) ?? true,
    isConfigured: () => p.secrets.every((s) => s in legacyEnv),
    search: (input) => p.search(input as unknown as SearchParams, legacyEnv),
  }));
  const native = buildNativeProviders(cfg);

  let cache: TieredCache, health: HealthStore, metrics: MetricsStore, quota: QuotaStore;
  try {
    _admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const stores = buildStores(_admin as unknown as DbClient);
    ({ cache, health, metrics, quota } = stores);
  } catch {
    _admin = null;
    cache = new TieredCache(new InMemoryCacheStore());
    health = { load: async () => [], record: async () => {} };
    metrics = { record: async () => {} };
    quota = new InMemoryQuotaStore();
  }

  _manager = new ProviderManager([...native, ...legacy], { cache, health, metrics });
  _quota = quota;

  // One-time environment report per isolate. Secret NAMES only — never values.
  // This is the check that makes a misconfiguration loud: a provider key set
  // under a marketplace label ("Active Jobs DB") instead of its canonical name
  // is otherwise invisible, and the provider simply returns nothing forever.
  const report = validateEnv(env, [...native, ...legacy]);
  const line: Record<string, unknown> = {
    fn: 'careers-jobs', event: 'startup',
    configured: report.configuredProviders,
    unconfigured: report.unconfiguredProviders,
    missingSecrets: report.missing,
    durableStores: _admin != null,
  };
  if (report.suspectedMisnamed.length) {
    line.WARNING = 'secrets set under names this function never reads — rename to the canonical form';
    line.suspectedMisnamed = report.suspectedMisnamed;
    console.warn(JSON.stringify(line));
  } else {
    console.info(JSON.stringify(line));
  }

  return { manager: _manager, quota };
}

/** Best-effort: the signed-in user's skills, for the truthful skills-match badge. */
async function fetchUserSkills(
  db: ReturnType<typeof createClient>,
  userId: string,
): Promise<string[]> {
  try {
    const { data } = await db.from('resume_skills').select('name').eq('user_id', userId).limit(100);
    if (!Array.isArray(data)) return [];
    return [...new Set((data as { name?: string }[]).map((r) => String(r.name ?? '').toLowerCase()).filter(Boolean))];
  } catch { return []; }
}

/** Best-effort: log the search for admin analytics (volume, top terms). */
function recordSearchHistory(userId: string, input: SearchInput, results: number): void {
  if (!_admin) return;
  try {
    void _admin.from('job_search_history').insert({
      user_id: userId, query: input.query.slice(0, 200), country: input.country,
      results, at: new Date().toISOString(),
    });
  } catch { /* degrade */ }
}

// ─────────────────────────── dedupe ───────────────────────────

function dedupeKey(j: NormalizedJob): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${norm(j.company)}::${norm(j.title)}::${norm(j.location).slice(0, 24)}`;
}

/**
 * Canonical apply URL scoped to company+title for cross-provider dedupe.
 * Aggregators reuse one generic apply portal (company.com/careers) across many
 * distinct roles, so a bare URL match must never collapse different jobs; the
 * client pipeline handles fuzzier near-duplicate detection.
 */
function urlKey(j: NormalizedJob): string {
  const raw = j.apply_url;
  if (!raw) return '';
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  let url: string;
  try {
    const u = new URL(raw);
    url = `${u.host}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    url = raw.trim().toLowerCase().split(/[?#]/)[0].replace(/\/+$/, '');
  }
  return `${url}::${norm(j.company)}::${norm(j.title)}`;
}

// ─────────────────────────── handler ───────────────────────────

Deno.serve(async (req) => {
  const CORS = corsFor(req);
  const json = jsonWith(CORS);
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  try {
    return await handle(req, json);
  } catch (e) {
    // Always answer with CORS + JSON so the client can distinguish a backend
    // crash from a network/CORS failure and show an accurate message.
    console.error('careers-jobs: unhandled error', String(e).slice(0, 300));
    return json(500, { error: 'The job search backend hit an unexpected error.' });
  }
});

async function handle(
  req: Request,
  json: (status: number, body: unknown) => Response
): Promise<Response> {
  // Pre-auth gate: bound the work an UNAUTHENTICATED caller can make us do.
  // Everything below this line costs a network round-trip to the auth service
  // plus a billed invocation, and the per-user limiter cannot run until we have
  // a user — so an anonymous flood would otherwise be unbounded.
  //
  // TWO layers, because the cheap one alone is provably not enough: the
  // in-isolate counter only sees traffic that lands on ITS isolate, and Supabase
  // Edge spreads even strictly sequential requests across fresh isolates —
  // measured against production, 140 consecutive anonymous requests never
  // tripped it. The authoritative gate is therefore the same atomic Postgres
  // counter the per-user quota uses, which every isolate shares.
  //
  // Order matters: the in-memory check runs first so a warm isolate rejects a
  // repeat offender without touching the database, and the DB call is reached
  // only by traffic that looks new to this isolate.
  const ip = clientIp(req.headers);
  if (ip && rateLimited(`ip:${ip}`, UNAUTH_RATE_PER_MINUTE)) {
    return json(429, { error: 'Too many requests. Wait a minute and try again.' });
  }
  const { manager, quota } = getManager();
  if (ip) {
    // Degrades OPEN (hit() returns 0 on any store error) so a database hiccup
    // can never lock legitimate traffic out of search.
    const preauth = await quota.hit('ip:preauth', ip, UNAUTH_RATE_PER_MINUTE, 60);
    if (preauth === -1) {
      return json(429, { error: 'Too many requests. Wait a minute and try again.' });
    }
  }

  // Authenticate the caller.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Sign in to search jobs.' });

  // Burst protection (per-isolate, second line of defence behind JWT auth).
  if (rateLimited(userData.user.id, RATE_PER_MINUTE)) {
    return json(429, { error: 'Too many searches. Wait a minute and try again.' });
  }

  let body: Partial<SearchParams> & { providers?: string[] };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON body.' });
  }
  const params: SearchParams = {
    query: String(body.query ?? '').slice(0, 200).trim(),
    terms: Array.isArray(body.terms)
      ? body.terms.filter((t): t is string => typeof t === 'string').map((t) => t.slice(0, 80).trim()).filter(Boolean).slice(0, 18)
      : [],
    location: String(body.location ?? '').slice(0, 120).trim(),
    country: String(body.country ?? 'in').slice(0, 8).trim() || 'in',
    remoteOnly: body.remoteOnly === true,
    workMode: String(body.workMode ?? '').slice(0, 20),
    employmentType: String(body.employmentType ?? '').slice(0, 30),
    salaryMin: Number(body.salaryMin) > 0 ? Number(body.salaryMin) : null,
    salaryMax: Number(body.salaryMax) > 0 ? Number(body.salaryMax) : null,
    page: Math.max(0, Math.min(9, Number(body.page) || 0)),
  };
  if (!params.query) return json(400, { error: 'Enter a job title or keyword to search.' });

  // Authoritative multi-dimension quota (per-user + per-IP), layered on top of
  // the per-isolate burst checks above. Degrades OPEN on a quota-store outage so
  // a backend hiccup never locks legitimate users out of search.
  const verdict = await checkRequestQuota(quota, userData.user.id, ip);
  if (!verdict.allowed) {
    return json(429, { error: 'You have reached the search limit for now. Please try again shortly.' });
  }

  // SearchParams and SearchInput are field-identical; the input is already
  // validated + clamped above.
  const input: SearchInput = { ...params };

  // Provider selection: the client's explicit subset (if any) or every provider,
  // minus the ops kill-switch. Empty subset ⇒ all providers (the default), so the
  // premium providers participate automatically with no client change.
  const allIds = manager.providerIds();
  const base = Array.isArray(body.providers) && body.providers.length ? body.providers : allIds;
  const requestedProviders = base.filter((id) => !DISABLED_PROVIDERS.has(id));

  const userSkills = await fetchUserSkills(supabase, userData.user.id);

  const started = Date.now();
  const res = await manager.search(input, { requestedProviders, userSkills });

  // Reflect the ops kill-switch in the status map (the manager is unaware of it).
  for (const id of DISABLED_PROVIDERS) if (allIds.includes(id)) res.status[id] = 'disabled';

  recordSearchHistory(userData.user.id, input, res.jobs.length);

  // Structured, secret-free observability log (no PII, no provider payloads).
  console.info(JSON.stringify({
    fn: 'careers-jobs', country: params.country, ran: res.ran,
    returned: res.jobs.length, cached: res.cached, totalMs: Date.now() - started,
  }));

  return json(200, {
    jobs: res.jobs, status: res.status, counts: res.counts, latency: res.latency,
    errors: res.errors, page: res.page, providersUp: res.providersUp, ran: res.ran,
  });
}
