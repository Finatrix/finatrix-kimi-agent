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

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PROVIDER_TIMEOUT_MS = 12_000;
const MAX_RESULTS_PER_PROVIDER = 40;

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

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

async function fetchJson(url: string, init: RequestInit = {}): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
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

// ─────────────────────────── dedupe ───────────────────────────

function dedupeKey(j: NormalizedJob): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${norm(j.company)}::${norm(j.title)}::${norm(j.location).slice(0, 24)}`;
}

// ─────────────────────────── handler ───────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  // Authenticate the caller.
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
  );
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) return json(401, { error: 'Sign in to search jobs.' });

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

  const env: Record<string, string> = {};
  for (const key of ['ADZUNA_APP_ID', 'ADZUNA_APP_KEY', 'RAPIDAPI_KEY', 'JOOBLE_KEY']) {
    const v = Deno.env.get(key);
    if (v) env[key] = v;
  }

  const requested = Array.isArray(body.providers) && body.providers.length
    ? PROVIDERS.filter((p) => body.providers!.includes(p.id))
    : PROVIDERS;
  const active = requested.filter((p) => p.secrets.every((s) => s in env) && (p.supports?.(params) ?? true));
  const skipped = requested.filter((p) => (p.supports?.(params) ?? true) === false).map((p) => p.id);
  const inactive = requested
    .filter((p) => !p.secrets.every((s) => s in env) && !skipped.includes(p.id))
    .map((p) => p.id);

  const settled = await Promise.allSettled(active.map((p) => p.search(params, env)));
  const status: Record<string, string> = {};
  const seen = new Set<string>();
  const jobs: NormalizedJob[] = [];
  settled.forEach((result, i) => {
    const id = active[i].id;
    if (result.status === 'rejected') {
      status[id] = 'error';
      console.error(`careers-jobs: ${id} failed`, String(result.reason).slice(0, 200));
      return;
    }
    status[id] = 'ok';
    for (const job of result.value) {
      if (!job.title || !job.apply_url) continue;
      const key = dedupeKey(job);
      if (seen.has(key)) continue;
      seen.add(key);
      jobs.push(job);
    }
  });
  for (const id of inactive) status[id] = 'not-configured';
  for (const id of skipped) status[id] = 'skipped';

  return json(200, { jobs, status, page: params.page });
});
