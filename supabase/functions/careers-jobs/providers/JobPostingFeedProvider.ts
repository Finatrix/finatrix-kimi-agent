// Job Posting Feed — priority 6. Broad Fantastic-Jobs feed; lowest priority of
// the premium set, so it fills coverage gaps but yields conflicts to the others.

import { BaseProvider, type SearchRequest } from './BaseProvider.ts';
import type { RawJob } from './ProviderNormalizer.ts';
import type { SearchInput } from './types.ts';
import { buildFantasticRequest, parseFantasticJobs } from './fantasticJobs.ts';

const HOST = 'job-posting-feed-api.p.rapidapi.com';
/** Verified from the live playground snippet (this feed exposes /active-ats). */
const PATH = '/active-ats';

export class JobPostingFeedProvider extends BaseProvider {
  readonly id = 'jobpostingfeed';
  readonly priority = 50;
  readonly secrets = ['JOB_POSTING_FEED_KEY'];
  readonly costPerSearchMicroUsd = 1500;

  buildSearchRequest(input: SearchInput): SearchRequest | null {
    const key = this.key();
    if (!key) return null;
    return buildFantasticRequest(HOST, PATH, key, input, this.cfg.maxResultsPerProvider);
  }
  parseSearch(json: unknown): RawJob[] {
    return parseFantasticJobs(json, 'Job Board');
  }
}
