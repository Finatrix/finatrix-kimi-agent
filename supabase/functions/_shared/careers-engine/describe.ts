/**
 * What the market layer reads from one scanned job: which of the employer's markets it sits in, where,
 * how it is worked, what it pays and what work rights it asks for. Pure: no network, no clock.
 */
import {
  MARKETS,
  detectEmploymentType,
  detectWorkRights,
  parseLocation,
  parseSalary,
  type CareersMarket,
} from './markets/index.ts';
import type { Job } from './types.ts';
import { htmlToText } from './util/html.ts';
import type { PostingDetails } from './verification/ingest.ts';

const SUMMARY_CHARS = 1_500;
const SALARY_SCAN_CHARS = 4_000;

/**
 * The employer's markets a job sits in, in the employer's order. Only a single-market employer keeps an
 * ambiguous name ("Newcastle" for an Australian bank); a multinational's ambiguous posting is left out.
 */
export function marketsForJob(location: string, markets: readonly CareersMarket[]): CareersMarket[] {
  const hits = markets.filter((m) => parseLocation(location, m).inMarket);
  if (hits.length > 0 || markets.length !== 1) return hits;
  const only = markets[0]!;
  return parseLocation(location, only).ambiguous ? [only] : [];
}

/** Read a job through the market layer. Returns null when the job sits in none of the employer's markets. */
export function describePosting(job: Job, markets: readonly CareersMarket[]): PostingDetails | null {
  const inMarkets = marketsForJob(job.location, markets);
  if (inMarkets.length === 0) return null;
  const primary = inMarkets[0]!;
  const location = parseLocation(job.location, primary);
  const text = htmlToText(job.description ?? '');
  const salary = (job.salaryText ? parseSalary(job.salaryText, primary) : null) ?? parseSalary(text.slice(0, SALARY_SCAN_CHARS), primary);
  const rights = detectWorkRights(text, primary);
  const employment = detectEmploymentType(`${job.title}\n${text.slice(0, 2_000)}`);
  return {
    countries: inMarkets.map((m) => MARKETS[m].iso),
    region: location.regions[0] ?? null,
    city: location.cities[0] ?? null,
    // Onsite is never inferred: a posting that does not say how it is worked stays unknown.
    workplaceType: location.remote ? 'remote' : location.hybrid ? 'hybrid' : null,
    employmentType: employment === 'unknown' ? null : employment,
    salaryMin: salary?.min ?? null,
    salaryMax: salary?.max ?? null,
    salaryCurrency: salary?.currency ?? null,
    salaryPeriod: salary?.period ?? null,
    salaryContribution: salary?.contribution ? `${salary.contribution.kind}:${salary.contribution.treatment}` : null,
    workRights:
      rights.requirement === 'unspecified'
        ? null
        : { requirement: rights.requirement, all: rights.all, ...(rights.clearance ? { clearance: rights.clearance } : {}) },
    summary: text.slice(0, SUMMARY_CHARS),
  };
}
