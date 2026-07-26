// Google Jobs — priority 4. SerpApi-style payload: `jobs_results[]` with
// `detected_extensions` and `apply_options`. `via` carries the original board.
//
// ⚠️ FIELD MAPPING VERIFICATION — see the note in fantasticJobs.ts. This parser
// is defensive and fails closed; confirm against a live response before prod.

import { BaseProvider, asArray, type SearchRequest } from './BaseProvider.ts';
import type { RawJob } from './ProviderNormalizer.ts';
import type { SearchInput } from './types.ts';
import { str } from './sanitize.ts';

const HOST = 'google-jobs.p.rapidapi.com';

const COUNTRY_LABEL: Record<string, string> = {
  in: 'India', us: 'United States', gb: 'United Kingdom', au: 'Australia',
  ca: 'Canada', sg: 'Singapore', ae: 'United Arab Emirates', de: 'Germany',
};

export class GoogleJobsProvider extends BaseProvider {
  readonly id = 'googlejobs';
  readonly priority = 70;
  readonly secrets = ['GOOGLE_JOBS_KEY'];
  readonly costPerSearchMicroUsd = 2000;

  buildSearchRequest(input: SearchInput): SearchRequest | null {
    const key = this.key();
    if (!key) return null;
    const where = input.location || COUNTRY_LABEL[input.country.toLowerCase()] || '';
    const q = new URLSearchParams({
      query: `${input.query}${where ? ` in ${where}` : ''}`.slice(0, 200),
      page: String(input.page),
    });
    if (input.remoteOnly) q.set('remote', 'true');
    return {
      url: `https://${HOST}/search?${q.toString()}`,
      init: { headers: this.rapidHeaders(HOST) },
    };
  }

  parseSearch(json: unknown): RawJob[] {
    const rows = asArray(json, 'jobs_results', 'jobs', 'data');
    const out: RawJob[] = [];
    for (const j of rows) {
      const ext = (j.detected_extensions ?? {}) as Record<string, unknown>;
      const applyOptions = Array.isArray(j.apply_options) ? j.apply_options as Record<string, unknown>[] : [];
      const applyUrl = str(applyOptions[0]?.link ?? j.share_link ?? j.link ?? j.apply_link, 600);
      const salary = str(ext.salary ?? '', 60);
      const schedule = str(ext.schedule_type ?? '', 40);
      out.push({
        externalId: str(j.job_id ?? j.id ?? applyUrl, 200),
        title: str(j.title, 300),
        company: str(j.company_name ?? j.company, 200),
        description: str(j.description, 20_000),
        salaryMin: null,           // Google returns salary as free text; leave structured null
        salaryMax: null,
        currency: '',
        location: str(j.location, 200),
        country: str(j.country ?? '', 8),
        workMode: ext.work_from_home === true ? 'remote' : '',
        employmentType: schedule,
        applyUrl,
        companyLogo: str(j.thumbnail ?? j.logo ?? '', 600) || null,
        postedDate: str(ext.posted_at ?? j.posted_at ?? '', 60) || null,
        via: str(j.via ?? '', 80).replace(/^via\s+/i, '') || 'Google',
        industry: '',
        metadata: { salaryText: salary, extensions: j.extensions, applyOptions: applyOptions.length },
      });
    }
    return out;
  }
}
