// USAJOBS — priority 85. The US federal government's official job board
// (data.usajobs.gov), so for a federal posting it is the source of record and
// should win de-duplication over any aggregator carrying the same listing.
// Free, keyed per requester. US searches only.
//
// Request and response shape checked against developer.usajobs.gov
// (api-reference/get-api-search + guides/authentication), 2026-10-24.
// ⚠️ Not yet confirmed against a live key: the exact PositionLocation
// CountryCode format, the RateIntervalCode set beyond "PA", and
// UserArea.Details.RemoteIndicator (absent from the reference table). Each is
// read defensively and fails to '' / null rather than guessing.

import { BaseProvider, type SearchRequest } from './BaseProvider.ts';
import type { RawJob } from './ProviderNormalizer.ts';
import type { SearchInput } from './types.ts';
import { num, str } from './sanitize.ts';

const HOST = 'data.usajobs.gov';
/** Documented ceiling for ResultsPerPage. */
const MAX_PAGE_SIZE = 500;

/**
 * USAJOBS rate interval codes → FinatriX salary periods. Codes with no matching
 * period (bi-weekly, per day, fee basis, school year, …) keep their amounts
 * with an empty period, the same convention the other adapters follow; the raw
 * code is kept in metadata.
 */
const INTERVAL: Record<string, string> = { PA: 'year', PM: 'month', PH: 'hour' };

type Obj = Record<string, unknown>;

function obj(v: unknown): Obj {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {};
}

/** The reference table says object, the JSON example says array: accept both. */
function list(v: unknown): Obj[] {
  if (Array.isArray(v)) return v.map(obj);
  return v && typeof v === 'object' ? [obj(v)] : [];
}

function first(v: unknown, max: number): string {
  return Array.isArray(v) ? str(v[0], max) : str(v, max);
}

/**
 * USAJOBS dates carry no offset ("2026-10-20T00:00:00.0000"), so `new Date`
 * would read them in the server's local zone and shift the calendar day. They
 * are calendar dates, so pin them to UTC.
 */
function utcDate(v: unknown): string | null {
  const s = str(v, 40).trim();
  if (!s) return null;
  return /([zZ]|[+-]\d{2}:?\d{2})$/.test(s) || !s.includes('T') ? s : `${s}Z`;
}

function employmentType(d: Obj): string {
  const offering = list(d.PositionOfferingType).map((o) => str(o.Name, 60)).join(' ');
  if (/intern/i.test(offering)) return 'intern';
  const schedule = str(list(d.PositionSchedule)[0]?.Name, 60);
  if (/full/i.test(schedule)) return 'fulltime';
  if (/part/i.test(schedule)) return 'parttime';
  return '';
}

/** Overseas federal postings exist; only claim US when a location says so. */
function country(locations: Obj[]): string {
  if (locations.length === 0) return 'US';
  const us = locations.some((l) => /^(us|usa|united states)$/i.test(str(l.CountryCode, 40).trim()));
  return us ? 'US' : '';
}

export class USAJobsProvider extends BaseProvider {
  readonly id = 'usajobs';
  readonly priority = 85;
  /** Both are required: the API rejects a key sent without its registered email. */
  readonly secrets = ['USAJOBS_API_KEY', 'USAJOBS_EMAIL'];
  readonly costPerSearchMicroUsd = 0;

  override supports(input: SearchInput): boolean {
    return input.country.toLowerCase() === 'us';
  }

  /**
   * Null without both secrets, which is what makes isConfigured() false. It
   * deliberately does not gate on country (supports() does), because the base
   * class probes configuration with a non-US input. Never falls back to
   * RAPIDAPI_KEY the way the marketplace adapters do.
   */
  buildSearchRequest(input: SearchInput): SearchRequest | null {
    const key = this.cfg.secrets.USAJOBS_API_KEY ?? '';
    const email = this.cfg.secrets.USAJOBS_EMAIL ?? '';
    if (!key || !email) return null;
    const q = new URLSearchParams({
      Keyword: input.query.slice(0, 250),
      ResultsPerPage: String(Math.min(MAX_PAGE_SIZE, this.cfg.maxResultsPerProvider)),
      Page: String(input.page + 1),
    });
    if (input.location) q.set('LocationName', input.location.slice(0, 120));
    if (input.remoteOnly || input.workMode === 'remote') q.set('RemoteIndicator', 'True');
    return {
      url: `https://${HOST}/api/search?${q.toString()}`,
      init: { headers: { Host: HOST, 'User-Agent': email, 'Authorization-Key': key } },
    };
  }

  parseSearch(json: unknown): RawJob[] {
    const items = obj(obj(json).SearchResult).SearchResultItems;
    if (!Array.isArray(items)) return [];
    const out: RawJob[] = [];
    for (const item of items.map(obj)) {
      const d = obj(item.MatchedObjectDescriptor);
      const details = obj(obj(d.UserArea).Details);
      const locations = list(d.PositionLocation);
      const pay = list(d.PositionRemuneration)[0] ?? {};
      const salaryMin = num(pay.MinimumRange);
      const salaryMax = num(pay.MaximumRange);
      const hasSalary = salaryMin != null || salaryMax != null;
      const interval = str(pay.RateIntervalCode, 8).toUpperCase();
      out.push({
        externalId: str(item.MatchedObjectId ?? d.PositionID, 200),
        title: str(d.PositionTitle, 300),
        company: str(d.OrganizationName || d.DepartmentName, 200),
        description: str(details.JobSummary || d.QualificationSummary, 20_000),
        salaryMin,
        salaryMax,
        currency: hasSalary ? 'USD' : '',
        salaryPeriod: hasSalary ? INTERVAL[interval] ?? '' : '',
        location: str(d.PositionLocationDisplay, 200)
          || locations.map((l) => str(l.LocationName, 120)).filter(Boolean).slice(0, 3).join('; '),
        country: country(locations),
        workMode: details.RemoteIndicator === true ? 'remote' : '',
        employmentType: employmentType(d),
        applyUrl: first(d.ApplyURI, 600) || str(d.PositionURI, 600),
        companyLogo: null,
        postedDate: utcDate(d.PublicationStartDate),
        closesAt: utcDate(d.ApplicationCloseDate),
        via: 'USAJOBS',
        metadata: {
          department: str(d.DepartmentName, 200),
          positionId: str(d.PositionID, 80),
          salaryInterval: interval,
          whoMayApply: str(obj(details.WhoMayApply).Name, 200),
          grade: [str(details.LowGrade, 4), str(details.HighGrade, 4)].filter(Boolean).join('–'),
        },
      });
    }
    return out;
  }
}
