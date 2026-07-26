// Shared client for the "Fantastic Jobs" family of RapidAPI endpoints
// (Active Jobs DB, LinkedIn Job Search, Job Posting Feed). These three are the
// same vendor and return the SAME record schema, so they share one parser and
// one query builder — this is honest DRY, not a shortcut.
//
// ── CONTRACT PROVENANCE (verified 2026-07-25) ───────────────────────────────
// Request shape verified verbatim from the live RapidAPI playground snippets:
//   Active Jobs DB      GET active-jobs-db.p.rapidapi.com/active-ats
//     ?time_frame=24h&limit=10&offset=0&description_format=text&title=…&location=…
//   Job Posting Feed    GET job-posting-feed-api.p.rapidapi.com/active-ats
//     ?description_format=text&include_basic_organization_details=true
//   LinkedIn Job Search GET linkedin-job-search-api.p.rapidapi.com/active-jb
//     ?time_frame=24h&title=…&location=…&limit=&offset=&description_format=text
// Response fields verified from the vendor docs at
//   https://developer.fantastic.jobs/api/new-jobs  (ATS + job-board schemas).
//
// The parser stays defensive: unknown shapes yield an empty list rather than a
// crash, so a schema drift fails CLOSED (provider returns nothing and is marked
// unhealthy) and never breaks the search. Where the vendor docs and older
// payloads disagree on a field name, BOTH spellings are accepted — that is
// deliberate robustness, not uncertainty about the documented name (listed
// first in each fallback chain).

import type { SearchInput } from './types.ts';
import type { RawJob, } from './ProviderNormalizer.ts';
import type { SearchRequest } from './BaseProvider.ts';
import { asArray } from './BaseProvider.ts';
import { str } from './sanitize.ts';

/** Indexing window. '7d' keeps results fresh without starving thin queries. */
const TIME_FRAME = '7d';
/** Vendor cap on `limit` is 1000; we stay small because each returned job burns a job credit. */
const MAX_LIMIT = 100;

const COUNTRY_LABEL: Record<string, string> = {
  in: 'India', us: 'United States', gb: 'United Kingdom', au: 'Australia',
  ca: 'Canada', sg: 'Singapore', ae: 'United Arab Emirates', de: 'Germany',
};

/**
 * Build the shared search request for this family.
 *
 * `limit` is passed explicitly (rather than left to the vendor default of 100)
 * because this API bills a *job credit* per returned record in addition to a
 * request credit — fetching 100 rows to keep 40 would waste 60% of the job quota.
 */
export function buildFantasticRequest(
  host: string,
  path: string,
  key: string,
  input: SearchInput,
  limit: number,
): SearchRequest {
  const title = (input.terms.length ? input.terms.slice(0, 4).join(' ') : input.query).slice(0, 120);
  const location = input.location || (COUNTRY_LABEL[input.country.toLowerCase()] ?? '');
  const size = Math.min(Math.max(limit, 1), MAX_LIMIT);

  const q = new URLSearchParams({
    time_frame: TIME_FRAME,
    title,
    description_format: 'text',
    limit: String(size),
  });
  if (location) q.set('location', location);
  // Offset pagination, in units of the page size we actually requested.
  if (input.page > 0) q.set('offset', String(input.page * size));
  // NB: there is no documented boolean `remote` filter on this API. Remote-only
  // is applied downstream (src/careers/search/filter.ts) from the derived
  // workMode, so no result is lost by omitting an unsupported query param.
  return {
    url: `https://${host}${path}?${q.toString()}`,
    init: { headers: { 'X-RapidAPI-Key': key, 'X-RapidAPI-Host': host } },
  };
}

/**
 * Salary. The documented structured source is the flat `ai_salary_*` set;
 * older/raw payloads instead nest a schema.org MonetaryAmount under
 * `salary_raw`/`salary`. Both are read, documented shape first.
 */
function parseSalary(row: Record<string, unknown>): {
  min: number | null; max: number | null; currency: string; period: string;
} {
  const out = { min: null as number | null, max: null as number | null, currency: '', period: '' };

  const aiMin = Number(row.ai_salary_min_value);
  const aiMax = Number(row.ai_salary_max_value);
  if (Number.isFinite(aiMin) && aiMin > 0) out.min = Math.round(aiMin);
  if (Number.isFinite(aiMax) && aiMax > 0) out.max = Math.round(aiMax);
  if (out.min != null || out.max != null) {
    out.currency = str(row.ai_salary_currency ?? '', 8);
    out.period = normUnit(str(row.ai_salary_unit_text ?? '', 12));
    return out;
  }

  const raw = row.salary_raw ?? row.salary;
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  // schema.org MonetaryAmount nests the numbers under `value`.
  const v = (r.value && typeof r.value === 'object' ? r.value : r) as Record<string, unknown>;
  const min = Number(v.minValue ?? v.min ?? v.minimum);
  const max = Number(v.maxValue ?? v.max ?? v.maximum);
  out.min = Number.isFinite(min) && min > 0 ? Math.round(min) : null;
  out.max = Number.isFinite(max) && max > 0 ? Math.round(max) : null;
  out.currency = str(r.currency ?? v.currency ?? '', 8);
  out.period = normUnit(str(v.unitText ?? r.unitText ?? '', 12));
  return out;
}

function normUnit(u: string): string {
  const s = u.toLowerCase();
  if (s.includes('year') || s === 'yr') return 'year';
  if (s.includes('month') || s === 'mo') return 'month';
  if (s.includes('hour') || s === 'hr') return 'hour';
  return '';
}

/** Work mode from the AI arrangement field, the schema.org type, or the legacy flag. */
function parseWorkMode(row: Record<string, unknown>): string {
  const arrangement = str(row.ai_work_arrangement ?? '', 40).toLowerCase();
  if (arrangement.includes('hybrid')) return 'hybrid';
  if (arrangement.includes('remote')) return 'remote';
  if (arrangement.includes('site') || arrangement.includes('office')) return 'onsite';
  if (str(row.location_type ?? '', 40).toUpperCase().includes('TELECOMMUTE')) return 'remote';
  if (row.remote_derived === true) return 'remote';
  return '';
}

/** Map one Fantastic-Jobs record to a RawJob. `via` names the original source. */
export function parseFantasticJobs(json: unknown, defaultVia: string): RawJob[] {
  const rows = asArray(json, 'jobs', 'data', 'results');
  const out: RawJob[] = [];
  for (const j of rows) {
    const locations = j.locations_derived;
    const location = Array.isArray(locations) ? str(locations[0], 200)
      : str(j.location ?? j.locations_raw ?? '', 200);
    const empTypeRaw = j.employment_type;
    const employmentType = Array.isArray(empTypeRaw) ? str(empTypeRaw[0], 40) : str(empTypeRaw ?? '', 40);
    const salary = parseSalary(j);
    const countries = j.countries_derived;
    const country = Array.isArray(countries) ? str(countries[0], 8) : str(j.country ?? '', 8);

    out.push({
      externalId: str(j.id ?? j.job_id ?? j.url, 200),
      title: str(j.title, 300),
      company: str(j.organization ?? j.company ?? j.employer, 200),
      description: str(j.description_text ?? j.description ?? '', 20_000),
      salaryMin: salary.min,
      salaryMax: salary.max,
      currency: salary.currency,
      salaryPeriod: salary.period,
      location,
      country,
      workMode: parseWorkMode(j),
      employmentType,
      applyUrl: str(j.url ?? j.apply_url ?? j.application_url, 600),
      companyLogo: str(j.organization_logo ?? j.org_logo_permalink ?? j.logo ?? '', 600) || null,
      postedDate: str(j.date_posted ?? j.date_created ?? j.datePosted ?? j.posted_at, 40) || null,
      closesAt: str(j.date_valid_through ?? j.date_validthrough ?? j.valid_through ?? '', 40) || null,
      industry: str(j.org_linkedin_industry ?? j.linkedin_org_industry ?? j.industry ?? '', 120),
      via: str(j.source ?? '', 80) || defaultVia,
      metadata: {
        seniority: j.seniority,
        orgUrl: j.organization_url,
        experienceLevel: j.ai_experience_level,
        keySkills: j.ai_key_skills,
        workArrangement: j.ai_work_arrangement,
      },
    });
  }
  return out;
}
