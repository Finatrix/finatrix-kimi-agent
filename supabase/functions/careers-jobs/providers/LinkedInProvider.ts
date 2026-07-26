// LinkedIn Job Search — priority 2. Same Fantastic-Jobs schema; `via` names the
// original source (LinkedIn) for honest, licence-compliant attribution.

import { BaseProvider, type SearchRequest } from './BaseProvider.ts';
import type { RawJob } from './ProviderNormalizer.ts';
import type { SearchInput } from './types.ts';
import { buildFantasticRequest, parseFantasticJobs } from './fantasticJobs.ts';

const HOST = 'linkedin-job-search-api.p.rapidapi.com';
/** Job-board feed. Verified from the vendor docs + RapidAPI snippet. */
const PATH = '/active-jb';

export class LinkedInProvider extends BaseProvider {
  readonly id = 'linkedin';
  readonly priority = 90;
  readonly secrets = ['LINKEDIN_JOBS_KEY'];
  readonly costPerSearchMicroUsd = 3000;

  buildSearchRequest(input: SearchInput): SearchRequest | null {
    const key = this.key();
    if (!key) return null;
    return buildFantasticRequest(HOST, PATH, key, input, this.cfg.maxResultsPerProvider);
  }
  parseSearch(json: unknown): RawJob[] {
    return parseFantasticJobs(json, 'LinkedIn');
  }
}
