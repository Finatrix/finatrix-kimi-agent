// Reed — priority 65. The official Reed.co.uk jobseeker API: one of the UK's
// largest boards, free, keyed per developer. UK searches only. Ranked below the
// ATS-direct feeds because much of Reed is recruitment-agency reposts, and
// below Google Jobs because its search results carry no salary period.
//
// Endpoint, parameters and auth checked against reed.co.uk/developers/jobseeker
// (2026-10-24): Basic auth with the API key as username and an empty password;
// resultsToTake is capped at 100.
// ⚠️ Reed's docs list the result fields only by display label, not as JSON.
// The camelCase keys and the dd/MM/yyyy date format below follow the widely
// used public shape and are NOT yet confirmed against a live key. Replace the
// fixture in officialProviders.test.ts with a real (redacted) payload once one
// is available.

import { BaseProvider, asArray, type SearchRequest } from './BaseProvider.ts';
import type { RawJob } from './ProviderNormalizer.ts';
import type { SearchInput } from './types.ts';
import { num, str } from './sanitize.ts';

const BASE = 'https://www.reed.co.uk/api/1.0/search';
/** Documented ceiling for resultsToTake. */
const MAX_PAGE_SIZE = 100;

/**
 * Search results omit the salary type (it is on the per-job details endpoint),
 * so an amount may be hourly, daily or annual. Read it when present; otherwise
 * the period stays '' rather than guessed from the amount's size.
 */
function period(v: unknown): string {
  const s = str(v, 30).toLowerCase();
  if (/annum|year/.test(s)) return 'year';
  if (/month/.test(s)) return 'month';
  if (/hour/.test(s)) return 'hour';
  return '';
}

/**
 * Reed writes dates as dd/MM/yyyy. `new Date('05/12/2026')` would read that as
 * 12 May, so convert explicitly. Anything else passes through for the
 * normaliser to parse, and an impossible date becomes null.
 */
export function reedDate(v: unknown): string | null {
  const s = str(v, 40).trim();
  if (!s) return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (!m) return s;
  const [day, month, year] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCMonth() === month - 1 && d.getUTCDate() === day ? d.toISOString() : null;
}

const EMPLOYMENT_FLAG: Record<string, string> = {
  fulltime: 'fullTime', parttime: 'partTime', contract: 'contract',
};

export class ReedProvider extends BaseProvider {
  readonly id = 'reed';
  readonly priority = 65;
  readonly secrets = ['REED_API_KEY'];
  readonly costPerSearchMicroUsd = 0;

  override supports(input: SearchInput): boolean {
    return input.country.toLowerCase() === 'gb';
  }

  /**
   * Null without REED_API_KEY, which is what makes isConfigured() false. No
   * country gate here (supports() owns that) and no RAPIDAPI_KEY fallback.
   */
  buildSearchRequest(input: SearchInput): SearchRequest | null {
    const key = this.cfg.secrets.REED_API_KEY ?? '';
    if (!key) return null;
    const take = Math.min(MAX_PAGE_SIZE, this.cfg.maxResultsPerProvider);
    const q = new URLSearchParams({
      keywords: input.query.slice(0, 250),
      resultsToTake: String(take),
      resultsToSkip: String(input.page * take),
    });
    if (input.location) q.set('locationName', input.location.slice(0, 120));
    const flag = EMPLOYMENT_FLAG[input.employmentType];
    if (flag) q.set(flag, 'true');
    return {
      url: `${BASE}?${q.toString()}`,
      init: { headers: { Authorization: `Basic ${btoa(`${key}:`)}` } },
    };
  }

  parseSearch(json: unknown): RawJob[] {
    const out: RawJob[] = [];
    for (const j of asArray(json, 'results')) {
      const salaryMin = num(j.minimumSalary);
      const salaryMax = num(j.maximumSalary);
      const hasSalary = salaryMin != null || salaryMax != null;
      out.push({
        externalId: str(j.jobId, 200),
        title: str(j.jobTitle, 300),
        company: str(j.employerName, 200),
        description: str(j.jobDescription, 20_000),
        salaryMin,
        salaryMax,
        currency: hasSalary ? str(j.currency, 8) : '',
        salaryPeriod: hasSalary ? period(j.salaryType) : '',
        location: str(j.locationName, 200),
        country: 'GB',
        workMode: '',
        employmentType: '',
        applyUrl: str(j.jobUrl, 600),
        companyLogo: null,
        postedDate: reedDate(j.date),
        closesAt: reedDate(j.expirationDate),
        via: 'Reed',
        metadata: {
          employerId: j.employerId ?? null,
          applications: typeof j.applications === 'number' ? j.applications : null,
        },
      });
    }
    return out;
  }
}
