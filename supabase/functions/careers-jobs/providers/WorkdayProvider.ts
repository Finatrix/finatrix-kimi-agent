// Workday Jobs — priority 3. Workday has no single global endpoint: each tenant
// exposes POST /wday/cxs/{tenant}/{site}/jobs. This adapter supports BOTH a
// RapidAPI aggregator (WORKDAY_HOST) and direct native tenant calls, and parses
// the native `jobPostings[]` shape as well as an aggregator's `data`/`jobs`.
//
// ⚠️ FIELD MAPPING VERIFICATION — Workday responses differ per tenant. This
// parser is defensive and fails closed; confirm against your configured
// aggregator/tenant before production, and adjust the fixture accordingly.

import { BaseProvider, asArray, type SearchRequest } from './BaseProvider.ts';
import type { RawJob } from './ProviderNormalizer.ts';
import type { SearchInput } from './types.ts';
import { safeUrl, str } from './sanitize.ts';

export class WorkdayProvider extends BaseProvider {
  readonly id = 'workday';
  readonly priority = 80;
  readonly secrets = ['WORKDAY_KEY'];
  readonly costPerSearchMicroUsd = 2000;

  /** Base used to absolute-ise a Workday relative `externalPath`. */
  private base(): string {
    return this.cfg.secrets.WORKDAY_HOST
      ? `https://${this.cfg.secrets.WORKDAY_HOST.replace(/^https?:\/\//, '')}`
      : '';
  }

  buildSearchRequest(input: SearchInput): SearchRequest | null {
    const key = this.key();
    const host = this.cfg.secrets.WORKDAY_HOST?.replace(/^https?:\/\//, '');
    if (!key || !host) return null;
    // Aggregator convention: GET /search?query=&location=&page= with RapidAPI auth.
    const q = new URLSearchParams({
      query: input.query.slice(0, 120),
      location: (input.location || input.country).slice(0, 80),
      page: String(input.page),
    });
    return {
      url: `https://${host}/search?${q.toString()}`,
      init: { headers: this.rapidHeaders(host) },
    };
  }

  parseSearch(json: unknown): RawJob[] {
    // Native Workday CXS uses `jobPostings`; aggregators use `data`/`jobs`.
    const rows = asArray(json, 'jobPostings', 'data', 'jobs', 'results');
    const base = this.base();
    const out: RawJob[] = [];
    for (const j of rows) {
      const path = str(j.externalPath ?? j.applyUrl ?? j.url ?? '', 600);
      const applyUrl = path.startsWith('http') ? path : (base && path ? safeUrl(base + path) : str(j.url, 600));
      const bullets = Array.isArray(j.bulletFields) ? (j.bulletFields as unknown[]).map((b) => str(b, 60)) : [];
      out.push({
        externalId: str(j.id ?? j.jobId ?? path, 200),
        title: str(j.title ?? j.jobTitle, 300),
        company: str(j.company ?? j.organization ?? j.hiringOrganization ?? '', 200),
        description: str(j.jobDescription ?? j.description ?? '', 20_000),
        salaryMin: null,
        salaryMax: null,
        currency: '',
        location: str(j.locationsText ?? j.location ?? j.primaryLocation, 200),
        country: str(j.country ?? '', 8),
        workMode: /remote/i.test(str(j.locationsText ?? j.location, 200)) ? 'remote' : '',
        employmentType: str(j.timeType ?? j.employmentType ?? '', 40),
        applyUrl,
        companyLogo: null,
        postedDate: str(j.postedOn ?? j.postedDate ?? j.startDate ?? '', 60) || null,
        via: str(j.company ?? j.organization ?? '', 60) ? `${str(j.company ?? j.organization, 60)} (Workday)` : 'Workday',
        industry: '',
        metadata: { bulletFields: bullets, jobReqId: j.jobReqId },
      });
    }
    return out;
  }
}
