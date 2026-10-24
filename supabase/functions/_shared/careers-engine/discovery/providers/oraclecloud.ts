/**
 * Oracle Recruiting Cloud (HCM Candidate Experience) provider.
 * Derived from career-ops providers/oraclecloud.mjs (MIT, see NOTICE).
 * Used by several large AU employers; enterprise tenants live on *.fa.<region>.oraclecloud.com.
 */
import type { EmployerEntry, FetchContext, FetchResult, Job, Provider } from '../../types.ts';
import { DEFAULT_USER_AGENT } from '../../util/http.ts';
import { decodeEntities } from '../../util/html.ts';
import { assertHostAllowed } from '../../util/safeUrl.ts';
import { arr, obj, pastDeadline, str, toEpochMs } from './_util.ts';

export const ORACLE_HOST_RE = /^[a-z0-9-]+\.fa\.(?:[a-z0-9-]+\.)?(?:ocs\.)?oraclecloud(?:[1-9][0-9]?)?\.com$/i;
const PAGE_SIZE = 200;
const MAX_PAGES = 25;
const INTER_PAGE_DELAY_MS = 250;
const FACETS_LIST =
  'LOCATIONS%3BWORK_LOCATIONS%3BWORKPLACE_TYPES%3BTITLES%3BCATEGORIES%3BORGANIZATIONS%3BPOSTING_DATES%3BFLEX_FIELDS';

export interface OracleSite {
  host: string;
  lang: string;
  siteNumber: string;
  locationId: string | null;
}

export function resolveSite(entry: EmployerEntry): OracleSite | null {
  for (const raw of [entry.api, entry.careers_url]) {
    if (typeof raw !== 'string' || !raw) continue;
    let parsed: URL;
    try {
      parsed = new URL(raw);
    } catch {
      continue;
    }
    if (parsed.protocol !== 'https:' || !ORACLE_HOST_RE.test(parsed.hostname)) continue;
    const segs = parsed.pathname.split('/').filter(Boolean);
    const ceIdx = segs.indexOf('CandidateExperience');
    const lang = ceIdx !== -1 && segs[ceIdx + 1] ? segs[ceIdx + 1]! : 'en';
    const sitesIdx = segs.indexOf('sites');
    const siteFromUrl = sitesIdx !== -1 && segs[sitesIdx + 1] ? segs[sitesIdx + 1]! : null;
    const siteNumber = (typeof entry.siteNumber === 'string' && entry.siteNumber) || siteFromUrl || 'CX_1';
    const locationId = entry.locationId != null && `${entry.locationId}` !== '' ? `${entry.locationId}` : null;
    return { host: parsed.hostname, lang, siteNumber, locationId };
  }
  return null;
}

export function buildApiUrl(site: OracleSite, offset = 0, limit = PAGE_SIZE): string {
  const finderParams = [
    `siteNumber=${site.siteNumber}`,
    `facetsList=${FACETS_LIST}`,
    `limit=${limit}`,
    'sortBy=POSTING_DATES_DESC',
    `offset=${offset}`,
  ];
  if (site.locationId) finderParams.push(`locationId=${site.locationId}`);
  const expand = 'requisitionList.workLocation,requisitionList.secondaryLocations';
  return (
    `https://${site.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions` +
    `?onlyData=true&expand=${encodeURIComponent(expand)}` +
    `&finder=findReqs;${finderParams.join(',')}&limit=${limit}&offset=${offset}`
  );
}

export function buildJobUrl(site: OracleSite, id: string): string {
  return `https://${site.host}/hcmUI/CandidateExperience/${site.lang}/sites/${site.siteNumber}/job/${id}`;
}

function assembleLocation(req: Record<string, unknown>): string {
  let base = str(req.PrimaryLocation);
  if (!base) {
    const wl = obj(arr(req.workLocation)[0]);
    base = [wl.TownOrCity, wl.Region, wl.Country].filter((v) => typeof v === 'string' && v.trim()).join(', ');
  }
  const wt = req.WorkplaceTypeCode;
  const hint = wt === 'ORA_REMOTE' ? 'Remote' : wt === 'ORA_HYBRID' ? 'Hybrid' : '';
  return [base, hint].filter(Boolean).join(' · ');
}

export function parseOracleResponse(json: unknown, site: OracleSite, companyName: string): Job[] {
  const item = obj(arr(obj(json).items)[0]);
  const list = Array.isArray(item.requisitionList) ? item.requisitionList : null;
  if (!list) return [];
  const out: Job[] = [];
  for (const raw of list) {
    const req = obj(raw);
    const id = req.Id != null ? String(req.Id) : req.RequisitionNumber != null ? String(req.RequisitionNumber) : '';
    const externalUrl = str(req.ExternalURL);
    const url = externalUrl || (id ? buildJobUrl(site, id) : '');
    if (!url) continue;
    const job: Job = { title: typeof req.Title === 'string' ? req.Title : '', url, company: companyName, location: assembleLocation(req) };
    if (id) job.externalId = id;
    const short = str(req.ShortDescriptionStr);
    if (short) job.description = decodeEntities(short);
    const postedAt = toEpochMs(req.PostedDate);
    if (postedAt !== undefined) job.postedAt = postedAt;
    out.push(job);
  }
  return out;
}

export const oracleCloudProvider: Provider = {
  id: 'oraclecloud',
  detect(entry) {
    const site = resolveSite(entry);
    return site ? { url: buildApiUrl(site, 0, PAGE_SIZE) } : null;
  },
  async fetch(entry: EmployerEntry, ctx: FetchContext): Promise<FetchResult> {
    const site = resolveSite(entry);
    if (!site) throw new Error(`oraclecloud: cannot derive API URL for ${entry.name}`);
    const maxPages =
      Number.isInteger(entry.max_pages) && (entry.max_pages as number) > 0 ? Math.min(entry.max_pages as number, MAX_PAGES) : MAX_PAGES;
    const jobs: Job[] = [];
    let total: number | null = null;
    let finished = false;
    let timedOut = false;
    for (let page = 0; page < maxPages; page++) {
      if (page > 0 && pastDeadline(ctx)) { timedOut = true; break; }
      const offset = page * PAGE_SIZE;
      const apiUrl = buildApiUrl(site, offset, PAGE_SIZE);
      assertHostAllowed('oraclecloud', apiUrl, ORACLE_HOST_RE);
      if (page > 0) await ctx.sleep(INTER_PAGE_DELAY_MS);
      const json = await ctx.fetchJson(
        apiUrl,
        { redirect: 'error', headers: { 'user-agent': DEFAULT_USER_AGENT, accept: 'application/json' } },
        { retries: 3 },
      );
      jobs.push(...parseOracleResponse(json, site, entry.name));
      const item = obj(arr(obj(json).items)[0]);
      if (total === null && typeof item.TotalJobsCount === 'number') total = item.TotalJobsCount;
      const listLen = Array.isArray(item.requisitionList) ? item.requisitionList.length : 0;
      if (listLen === 0) { finished = true; break; }
      if (total !== null) {
        if (offset + PAGE_SIZE >= total) { finished = true; break; }
      } else if (listLen < PAGE_SIZE) { finished = true; break; }
    }
    const seen = `${jobs.length}${total !== null ? ` of ${total}` : ''}`;
    if (finished) return { jobs };
    return timedOut
      ? { jobs, truncation: { reason: 'budget', transient: false, detail: `time budget reached; ${seen} jobs` } }
      : { jobs, truncation: { reason: 'cap', transient: false, detail: `max_pages=${maxPages}${total !== null ? `, ${seen}` : ''}` } };
  },
};
