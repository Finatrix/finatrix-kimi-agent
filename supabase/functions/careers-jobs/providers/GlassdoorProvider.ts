// Glassdoor Real-Time — priority 5. Adds employer-rating context. Real-time
// Glassdoor APIs vary between vendors, so this parser accepts several shapes
// (`jobs` / `data` / `hits` / bare array) and maps defensively.
//
// ⚠️ FIELD MAPPING VERIFICATION — this is the LEAST schema-certain adapter of
// the six. It fails closed. Confirm the payload with a live key and adjust the
// mapping + the fixture in providers.adapters.test.ts before production.

import { BaseProvider, asArray, type SearchRequest } from './BaseProvider.ts';
import type { RawJob } from './ProviderNormalizer.ts';
import type { SearchInput } from './types.ts';
import { num, str } from './sanitize.ts';

/** A positive float (ratings), unlike num() which rounds to an integer. */
function rating(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : null;
}

const HOST = 'glassdoor-real-time.p.rapidapi.com';

export class GlassdoorProvider extends BaseProvider {
  readonly id = 'glassdoor';
  readonly priority = 60;
  readonly secrets = ['GLASSDOOR_KEY'];
  readonly costPerSearchMicroUsd = 2500;

  buildSearchRequest(input: SearchInput): SearchRequest | null {
    const key = this.key();
    if (!key) return null;
    const q = new URLSearchParams({
      query: input.query.slice(0, 120),
      location: (input.location || input.country).slice(0, 80),
      page: String(input.page + 1),
    });
    return {
      url: `https://${HOST}/jobs/search?${q.toString()}`,
      init: { headers: this.rapidHeaders(HOST) },
    };
  }

  parseSearch(json: unknown): RawJob[] {
    const rows = asArray(json, 'jobs', 'data', 'hits', 'results', 'jobListings');
    const out: RawJob[] = [];
    for (const j of rows) {
      const header = (j.jobview ?? j.header ?? j) as Record<string, unknown>;
      const employerRating = rating(j.rating ?? j.employerRating ?? header.rating);
      const salaryMin = num(j.salaryMin ?? j.payMin ?? header.payMin);
      const salaryMax = num(j.salaryMax ?? j.payMax ?? header.payMax);
      out.push({
        externalId: str(j.jobId ?? j.id ?? j.jobLink ?? j.jobViewUrl, 200),
        title: str(j.jobTitle ?? j.title ?? header.jobTitleText, 300),
        company: str(j.employer ?? j.employerName ?? j.company ?? header.employerNameFromSearch, 200),
        description: str(j.jobDescription ?? j.description ?? j.descriptionFragment, 20_000),
        salaryMin,
        salaryMax,
        currency: str(j.currency ?? j.payCurrency ?? '', 8),
        location: str(j.location ?? j.locationName ?? header.locationName, 200),
        country: str(j.country ?? '', 8),
        workMode: '',
        employmentType: str(j.jobType ?? j.employmentType ?? '', 40),
        applyUrl: str(j.jobLink ?? j.applyUrl ?? j.jobViewUrl ?? j.url, 600),
        companyLogo: str(j.squareLogoUrl ?? j.employerLogo ?? j.logo ?? '', 600) || null,
        postedDate: str(j.jobPostingDate ?? j.postedDate ?? j.datePosted ?? '', 60) || null,
        via: 'Glassdoor',
        industry: str(j.industry ?? '', 120),
        metadata: { employerRating, reviewCount: j.reviewCount },
      });
    }
    return out;
  }

  async getCompany(name: string) {
    // Glassdoor is the natural source for employer ratings; a full company
    // endpoint integration is a follow-up. Return null for now (never throws).
    void name;
    return null;
  }
}
