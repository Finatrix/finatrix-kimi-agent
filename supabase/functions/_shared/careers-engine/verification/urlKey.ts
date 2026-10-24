/**
 * URL normalisation and posting identity. Derived from career-ops url-key.mjs (MIT, see NOTICE),
 * extended with Australian job boards.
 */

const TRACKING_PARAMS: RegExp[] = [
  /^utm_/i, /^gh_src$/i, /^fbclid$/i, /^gclid$/i, /^mc_cid$/i, /^mc_eid$/i, /^igshid$/i,
  /^_hsenc$/i, /^_hsmi$/i, /^trk$/i, /^trackingid$/i, /^refid$/i, /^trackingId$/i, /^ebp$/i,
];

/**
 * Multi-employer boards and aggregators. A posting on one of these is a *copy* of an employer's
 * ad, so the same role seen here and on the employer's own site must not count as two roles,
 * and the same text under a different company name is a cross-listing, not a repost.
 */
export const AGGREGATOR_DOMAINS: readonly string[] = [
  // Global
  'indeed.com', 'linkedin.com', 'glassdoor.com', 'ziprecruiter.com', 'jooble.org', 'talent.com', 'jobrapido.com',
  // Australia / NZ
  'seek.com.au', 'seek.co.nz', 'jora.com', 'glassdoor.com.au', 'careerone.com.au', 'adzuna.com.au', 'careerjet.com.au',
  'jobsearch.gov.au', 'workforceaustralia.gov.au', 'gumtree.com.au', 'gradconnection.com', 'prosple.com',
  'ethicaljobs.com.au', 'jobactive.gov.au',
];

function foldHostname(host: string): string {
  const h = String(host).toLowerCase();
  return h.length > 1 && h.endsWith('.') && !h.endsWith('..') ? h.slice(0, -1) : h;
}

function domainOf(host: string, extra: readonly string[] = []): string | null {
  for (const d of [...AGGREGATOR_DOMAINS, ...extra]) {
    if (host === d || host.endsWith(`.${d}`)) return d;
  }
  return null;
}

export function isAggregatorUrl(raw: string, extraDomains: readonly string[] = []): boolean {
  try {
    return domainOf(foldHostname(new URL(String(raw).trim()).hostname), extraDomains) !== null;
  } catch {
    return false;
  }
}

function linkedInJobId(u: URL): string | null {
  const m = /^\/(?:jobs\/view\/(?:.*-)?|comm\/jobs\/view\/)(\d+)\/?$/.exec(u.pathname);
  if (m) return m[1]!;
  const current = u.searchParams.get('currentJobId');
  return current && /^\d+$/.test(current) ? current : null;
}

const AGGREGATOR_POSTING_ID: Record<string, (u: URL) => string | null> = {
  'linkedin.com': linkedInJobId,
  'indeed.com': (u) => {
    const jk = u.searchParams.get('jk') ?? u.searchParams.get('vjk');
    return jk && /^[\w-]+$/.test(jk) ? jk : null;
  },
  'seek.com.au': (u) => /^\/job\/(\d{5,})\/?$/.exec(u.pathname)?.[1] ?? (u.searchParams.get('jobId') && /^\d+$/.test(u.searchParams.get('jobId')!) ? u.searchParams.get('jobId') : null),
  'seek.co.nz': (u) => /^\/job\/(\d{5,})\/?$/.exec(u.pathname)?.[1] ?? null,
};

/** Stable `domain:id` for boards that carry a real posting id in the URL. */
export function aggregatorPostingId(raw: string): { domain: string; id: string } | null {
  let u: URL;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  const domain = domainOf(foldHostname(u.hostname));
  if (!domain) return null;
  const id = AGGREGATOR_POSTING_ID[domain]?.(u) ?? null;
  return id ? { domain, id } : null;
}

/** Some SPAs put the job id in a hash route (`#/job/123`); keep that identity before the hash is dropped. */
function promoteFragmentIdentity(url: URL): void {
  const m = /^#\/jobs?\/([^/?#]+)(?:\?[^#]*)?$/i.exec(url.hash);
  if (!m) return;
  try {
    const jobId = decodeURIComponent(m[1]!);
    if (jobId) url.searchParams.append('_fragment_job_id', jobId);
  } catch {
    /* malformed escape: leave the URL alone */
  }
}

/**
 * Canonical URL: https, lowercase host, no tracking params, sorted query, no fragment, no trailing slash.
 * Returns '' for anything that is not a usable http(s) URL.
 */
export function normalizeUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const s = raw.trim();
  if (!s) return '';
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return '';
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
  u.protocol = 'https:';
  u.hostname = foldHostname(u.hostname);
  promoteFragmentIdentity(u);
  u.hash = '';
  const keep: Array<[string, string]> = [];
  for (const [k, v] of u.searchParams.entries()) {
    if (!TRACKING_PARAMS.some((re) => re.test(k))) keep.push([k, v]);
  }
  keep.sort((x, y) => (x[0] !== y[0] ? (x[0] < y[0] ? -1 : 1) : x[1] < y[1] ? -1 : x[1] > y[1] ? 1 : 0));
  u.search = '';
  for (const [k, v] of keep) u.searchParams.append(k, v);
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) u.pathname = u.pathname.slice(0, -1);
  return u.toString();
}

/** Dedup key for a URL: aggregator posting id when one exists, else the normalised URL. */
export function postingKey(raw: string): string {
  const agg = aggregatorPostingId(raw);
  return agg ? `${agg.domain}:${agg.id}` : normalizeUrl(raw);
}
