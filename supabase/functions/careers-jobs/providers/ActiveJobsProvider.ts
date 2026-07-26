// Active Jobs DB — priority 1 (highest). Aggregates ATS-sourced postings and is
// the freshest, most structured feed, so it wins de-duplication conflicts.

import { BaseProvider, type SearchRequest } from './BaseProvider.ts';
import type { RawJob } from './ProviderNormalizer.ts';
import type { SearchInput } from './types.ts';
import { buildFantasticRequest, parseFantasticJobs } from './fantasticJobs.ts';

const HOST = 'active-jobs-db.p.rapidapi.com';
/** ATS-sourced feed. Verified from the live v4 playground snippet. */
const PATH = '/active-ats';

export class ActiveJobsProvider extends BaseProvider {
  readonly id = 'activejobs';
  readonly priority = 100;
  readonly secrets = ['ACTIVE_JOBS_KEY'];        // falls back to RAPIDAPI_KEY (see BaseProvider.key)
  readonly costPerSearchMicroUsd = 2500;

  buildSearchRequest(input: SearchInput): SearchRequest | null {
    const key = this.key();
    if (!key) return null;
    return buildFantasticRequest(HOST, PATH, key, input, this.cfg.maxResultsPerProvider);
  }
  parseSearch(json: unknown): RawJob[] {
    return parseFantasticJobs(json, 'Company Site');
  }
}
