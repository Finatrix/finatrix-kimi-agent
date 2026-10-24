/**
 * Public ATS JSON providers: Greenhouse, Lever, SmartRecruiters, Ashby, Workable, Recruitee.
 * Greenhouse / Lever / SmartRecruiters are derived from career-ops (MIT, see NOTICE);
 * Ashby / Workable / Recruitee follow the same contract against each vendor's public
 * job-board endpoint.
 */
import type { EmployerEntry, FetchContext, FetchResult, Job, Provider, Truncation } from '../../types.ts';
import { DEFAULT_USER_AGENT } from '../../util/http.ts';
import { decodeEntities, htmlToText } from '../../util/html.ts';
import { assertHostAllowed, coerceId, safeEncodeURIComponent } from '../../util/safeUrl.ts';
import { arr, obj, probeCap, str, toEpochMs } from './_util.ts';

// ── Greenhouse ───────────────────────────────────────────────────────────────

const LEGACY_BOARD_HOSTS = new Set(['boards.greenhouse.io', 'boards.eu.greenhouse.io']);
const GREENHOUSE_HOSTS: ReadonlySet<string> = new Set([
  'boards-api.greenhouse.io', 'boards.greenhouse.io', 'job-boards.greenhouse.io', 'job-boards.eu.greenhouse.io',
]);

function greenhouseApiUrl(entry: EmployerEntry): string | null {
  if (entry.api) {
    assertHostAllowed('greenhouse', entry.api, GREENHOUSE_HOSTS);
    return entry.api;
  }
  const url = entry.careers_url ?? '';
  let slug: string | null = url.match(/job-boards(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/)?.[1] ?? null;
  if (!slug) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && LEGACY_BOARD_HOSTS.has(parsed.hostname)) slug = parsed.pathname.split('/').find(Boolean) ?? null;
    } catch { /* not a URL */ }
  }
  if (!slug || slug === 'embed') {
    try { slug = assertHostAllowed('greenhouse', url, GREENHOUSE_HOSTS).searchParams.get('for'); } catch { slug = null; }
  }
  if (!slug || slug === 'embed') return null;
  return `https://boards-api.greenhouse.io/v1/boards/${slug}/jobs`;
}

const WORK_MODEL = /^(?:hybrid|in[-\s]?office|on[-\s]?site|distributed|remote|flexible)$/i;
export function isWorkModelOnly(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  const parts = name.split(';').map((s) => s.trim()).filter(Boolean);
  return parts.length > 0 && parts.every((p) => WORK_MODEL.test(p));
}

export function buildOfficeMap(json: unknown): Map<unknown, Set<string>> {
  const map = new Map<unknown, Set<string>>();
  const walk = (offices: unknown): void => {
    for (const rawOffice of arr(offices)) {
      const office = obj(rawOffice);
      const name = str(office.name);
      if (name) {
        for (const dept of arr(office.departments)) {
          for (const rawJob of arr(obj(dept).jobs)) {
            const job = obj(rawJob);
            if (job.id == null) continue;
            if (!map.has(job.id)) map.set(job.id, new Set());
            map.get(job.id)!.add(name);
          }
        }
      }
      walk(office.children);
    }
  };
  walk(obj(json).offices);
  return map;
}

export const greenhouseProvider: Provider = {
  id: 'greenhouse',
  detect(entry) {
    try {
      const apiUrl = greenhouseApiUrl(entry);
      return apiUrl ? { url: apiUrl } : null;
    } catch {
      return null;
    }
  },
  async fetchListing(entry, ctx) {
    const apiUrl = greenhouseApiUrl(entry);
    if (!apiUrl) throw new Error(`greenhouse: cannot derive API URL for ${entry.name}`);
    const listUrl = new URL(apiUrl);
    listUrl.searchParams.delete('content');
    const json = obj(await ctx.fetchJson(assertHostAllowed('greenhouse', listUrl.href, GREENHOUSE_HOSTS).href, { redirect: 'error' }));
    return arr(json.jobs).map(obj).filter((j) => j.absolute_url).map((j) => ({ title: str(j.title), url: String(j.absolute_url), postedAt: toEpochMs(j.first_published) }));
  },
  async fetch(entry: EmployerEntry, ctx: FetchContext): Promise<FetchResult> {
    const apiUrl = greenhouseApiUrl(entry);
    if (!apiUrl) throw new Error(`greenhouse: cannot derive API URL for ${entry.name}`);
    assertHostAllowed('greenhouse', apiUrl, GREENHOUSE_HOSTS);
    const listUrl = new URL(apiUrl);
    listUrl.searchParams.set('content', 'true');
    const json = obj(await ctx.fetchJson(assertHostAllowed('greenhouse', listUrl.href, GREENHOUSE_HOSTS).href, { redirect: 'error' }));
    const usable = arr(json.jobs).map(obj).filter((j) => j.absolute_url);
    const boardSlug = new URL(apiUrl).pathname.match(/^\/v1\/boards\/([^/]+)\/jobs\/?$/)?.[1] ?? '';

    let officeMap: Map<unknown, Set<string>> | null = null;
    if (usable.some((j) => isWorkModelOnly(obj(j.location).name))) {
      const officesUrl = apiUrl.match(/^(https:\/\/[^/]+\/v1\/boards\/[^/]+)\/jobs(?:$|[?#])/)?.[1];
      if (officesUrl) {
        try {
          officeMap = buildOfficeMap(await ctx.fetchJson(assertHostAllowed('greenhouse', `${officesUrl}/offices`, GREENHOUSE_HOSTS).href, { redirect: 'error' }));
        } catch (err) {
          ctx.log.warn(`greenhouse: ${entry.name} /offices enrichment failed: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    const jobs: Job[] = usable.map((j) => {
      let location = str(obj(j.location).name);
      if (officeMap && isWorkModelOnly(location)) {
        const offices = officeMap.get(j.id);
        if (offices && offices.size > 0) location = [location, ...[...offices].sort()].join(' · ');
      }
      const job: Job = { title: str(j.title), url: String(j.absolute_url), company: entry.name, location, description: htmlToText(j.content) };
      if (boardSlug && (typeof j.id === 'string' || (typeof j.id === 'number' && Number.isSafeInteger(j.id)))) {
        job.listingIdentity = { ats_provider: 'greenhouse', board_slug: boardSlug, posting_id: String(j.id) };
      }
      const externalId = coerceId(j.id);
      if (externalId) job.externalId = externalId;
      const req = coerceId(j.requisition_id);
      if (req) job.requisitionId = req;
      const postedAt = toEpochMs(j.first_published);
      if (postedAt !== undefined) job.postedAt = postedAt;
      return job;
    });
    return { jobs };
  },
};

// ── Lever ────────────────────────────────────────────────────────────────────

const LEVER_HOSTS: ReadonlySet<string> = new Set(['api.lever.co', 'api.eu.lever.co']);

function leverApiUrl(entry: EmployerEntry): string | null {
  if (entry.api) {
    assertHostAllowed('lever', entry.api, LEVER_HOSTS);
    return entry.api;
  }
  let url: URL;
  try { url = new URL(entry.careers_url ?? ''); } catch { return null; }
  const host = url.hostname.match(/^jobs\.((?:eu\.)?lever\.co)$/);
  if (!host) return null;
  const slug = url.pathname.split('/').filter(Boolean)[0];
  return slug ? `https://api.${host[1]}/v0/postings/${slug}` : null;
}

function leverLocation(categories: unknown): string {
  const c = obj(categories);
  const merged: string[] = [];
  for (const l of [str(c.location), ...arr(c.allLocations).map(str)]) {
    if (l && !merged.some((m) => m.toLowerCase() === l.toLowerCase())) merged.push(l);
  }
  return merged.join('; ');
}

export function leverDescription(j: Record<string, unknown>): string {
  const intro = str(j.descriptionPlain) || htmlToText(j.description);
  const lists = arr(j.lists).map((l) => [str(obj(l).text), htmlToText(obj(l).content)].filter(Boolean).join('\n'));
  return [intro, ...lists, str(j.additionalPlain)].filter(Boolean).join('\n\n');
}

export const leverProvider: Provider = {
  id: 'lever',
  detect(entry) {
    try {
      const apiUrl = leverApiUrl(entry);
      return apiUrl ? { url: apiUrl } : null;
    } catch {
      return null;
    }
  },
  async fetch(entry, ctx): Promise<FetchResult> {
    const apiUrl = leverApiUrl(entry);
    if (!apiUrl) throw new Error(`lever: cannot derive API URL for ${entry.name}`);
    assertHostAllowed('lever', apiUrl, LEVER_HOSTS);
    const json = await ctx.fetchJson<unknown>(apiUrl, { redirect: 'error', timeoutMs: 30_000 });
    if (!Array.isArray(json)) return { jobs: [] };
    const boardSlug = new URL(apiUrl).pathname.match(/^\/v0\/postings\/([^/]+)\/?$/)?.[1] ?? '';
    const jobs: Job[] = json.map(obj).map((j) => {
      const job: Job = { title: str(j.text), url: str(j.hostedUrl), company: entry.name, location: leverLocation(j.categories), description: leverDescription(j) };
      if (boardSlug && typeof j.id === 'string' && j.id.trim()) job.listingIdentity = { ats_provider: 'lever', board_slug: boardSlug, posting_id: j.id };
      if (typeof j.createdAt === 'number') job.postedAt = j.createdAt;
      const id = coerceId(j.id);
      if (id) job.externalId = id;
      return job;
    });
    return { jobs };
  },
};

// ── SmartRecruiters ──────────────────────────────────────────────────────────

const SR_API_HOSTS: ReadonlySet<string> = new Set(['api.smartrecruiters.com']);
const SR_CAREERS_HOSTS = new Set(['careers.smartrecruiters.com', 'jobs.smartrecruiters.com']);
const SR_PAGE_SIZE = 100;
const SR_MAX_PAGES = 50;
const SR_DETAIL_BATCH = 5;

function srSlug(entry: EmployerEntry): string | null {
  for (const raw of [entry.api, entry.careers_url]) {
    if (typeof raw !== 'string' || !raw) continue;
    let parsed: URL;
    try { parsed = new URL(raw); } catch { continue; }
    if (parsed.protocol !== 'https:' || !SR_CAREERS_HOSTS.has(parsed.hostname)) continue;
    const slug = parsed.pathname.split('/').filter(Boolean)[0];
    if (slug) return slug;
  }
  return null;
}

const srPostingsUrl = (slug: string, offset = 0) =>
  `https://api.smartrecruiters.com/v1/companies/${slug}/postings?limit=${SR_PAGE_SIZE}&offset=${offset}&status=PUBLIC`;

export function extractSrDescription(detail: unknown): string {
  const sections = obj(obj(obj(detail).jobAd).sections);
  const parts: string[] = [];
  for (const key of ['companyDescription', 'jobDescription', 'qualifications', 'additionalInformation']) {
    const text = obj(sections[key]).text;
    if (typeof text === 'string' && text.trim()) parts.push(text);
  }
  return parts.length ? htmlToText(parts.join('\n')) : '';
}

export function parseSmartRecruitersResponse(json: unknown, companyName: string, companySlug: string): Array<Job & { id?: string }> {
  const out: Array<Job & { id?: string }> = [];
  for (const raw of arr(obj(json).content)) {
    const j = obj(raw);
    const loc = obj(j.location);
    const fullLocation = str(loc.fullLocation) || [loc.city, loc.region, loc.country].filter(Boolean).join(', ');
    const location = [fullLocation, loc.remote ? 'Remote' : ''].filter(Boolean).join(', ');
    const name = str(j.name);
    const slugified = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let url = '';
    if (typeof j.ref === 'string') {
      let ref: URL | null = null;
      try { ref = new URL(j.ref); } catch { ref = null; }
      if (ref && ref.protocol === 'https:' && ref.hostname === 'api.smartrecruiters.com' && ref.pathname.startsWith('/v1/companies/')) {
        const [refSlug, postings, refId] = ref.pathname.slice('/v1/companies/'.length).split('/').filter(Boolean);
        if (refSlug && postings === 'postings' && refId) url = `https://jobs.smartrecruiters.com/${refSlug}/${refId}${slugified ? `-${slugified}` : ''}`;
      }
    }
    if (!url && j.id) {
      const fallbackSlug = companySlug || companyName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      const encoded = safeEncodeURIComponent(j.id);
      if (encoded === null) continue;
      if (fallbackSlug) url = `https://jobs.smartrecruiters.com/${fallbackSlug}/${encoded}${slugified ? `-${slugified}` : ''}`;
    }
    const job: Job & { id?: string } = { title: name, url, location, company: companyName };
    if (typeof j.id === 'string' || typeof j.id === 'number') job.id = String(j.id);
    const req = coerceId(j.refNumber);
    if (req) job.requisitionId = req;
    const language = coerceId(obj(j.language).code);
    if (language) job.language = language;
    out.push(job);
  }
  return out;
}

export const smartRecruitersProvider: Provider = {
  id: 'smartrecruiters',
  detect(entry) {
    const slug = srSlug(entry);
    return slug ? { url: srPostingsUrl(slug) } : null;
  },
  async fetch(entry, ctx): Promise<FetchResult> {
    const slug = srSlug(entry);
    if (!slug) throw new Error(`smartrecruiters: cannot derive API URL for ${entry.name}`);
    const probe = probeCap(ctx);
    const pageLimit = Math.min(SR_MAX_PAGES, probe ?? Infinity);
    const all: Array<Job & { id?: string }> = [];
    let truncation: Truncation | undefined;
    for (let page = 0; page < pageLimit; page++) {
      const apiUrl = srPostingsUrl(slug, page * SR_PAGE_SIZE);
      assertHostAllowed('smartrecruiters', apiUrl, SR_API_HOSTS);
      const json = obj(await ctx.fetchJson(apiUrl, { redirect: 'error' }));
      all.push(...parseSmartRecruitersResponse(json, entry.name, slug));
      if (!Array.isArray(json.content) || json.content.length < SR_PAGE_SIZE) break;
      if (page === pageLimit - 1 && probe === null) truncation = { reason: 'cap', transient: false, detail: `${SR_MAX_PAGES} pages` };
    }
    const cfg = entry.smartrecruiters ?? {};
    if (cfg.fetchDetails === true && probe === null) {
      const limit = Math.max(1, Math.min(100, Number(cfg.detailLimit) || 25));
      const targets = all.filter((j) => j.id).slice(0, limit);
      for (let i = 0; i < targets.length; i += SR_DETAIL_BATCH) {
        await Promise.all(
          targets.slice(i, i + SR_DETAIL_BATCH).map(async (job) => {
            try {
              const url = `https://api.smartrecruiters.com/v1/companies/${slug}/postings/${encodeURIComponent(job.id!)}`;
              assertHostAllowed('smartrecruiters', url, SR_API_HOSTS);
              const description = extractSrDescription(await ctx.fetchJson(url, { redirect: 'error' }));
              if (description) job.description = description;
            } catch { /* description is optional */ }
          }),
        );
      }
    }
    const jobs = all.map(({ id, ...job }) => (id ? { ...job, externalId: id } : job));
    return truncation ? { jobs, truncation } : { jobs };
  },
};

// ── Ashby ────────────────────────────────────────────────────────────────────

const ASHBY_HOSTS: ReadonlySet<string> = new Set(['api.ashbyhq.com']);
const ASHBY_INTERVALS: Record<string, number> = {
  '1 HOUR': 2080, '1 DAY': 260, '1 WEEK': 52, '2 WEEK': 26, '0.5 MONTH': 24, '1 MONTH': 12, '2 MONTH': 6, '3 MONTH': 4, '6 MONTH': 2, '1 YEAR': 1,
};

/** Annualise Ashby's structured compensation. Returns null when the interval is unreadable. */
export function parseAshbyCompensation(job: Record<string, unknown>): { min: number; max: number; currency: string } | null {
  const comp = obj(job.compensation);
  if (!Object.keys(comp).length) return null;
  const num = (v: unknown): number | null => {
    if (v == null || (typeof v === 'string' && v.trim() === '')) return null;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : null;
  };
  const components = arr(comp.compensationTiers).flatMap((tier) => arr(obj(tier).components)).map(obj);
  let source: Record<string, unknown> = comp;
  if (components.length) {
    const salary = components.filter((c) => String(c.compensationType ?? '').toLowerCase() === 'salary' && (num(c.minValue) != null || num(c.maxValue) != null));
    const readable = salary.filter((c) => typeof c.interval === 'string' && Object.hasOwn(ASHBY_INTERVALS, c.interval));
    if (!readable.length) return null;
    const span = (c: Record<string, unknown>) => (num(c.maxValue) ?? num(c.minValue) ?? 0) - (num(c.minValue) ?? num(c.maxValue) ?? 0);
    source = readable.reduce((best, c) => (span(c) > span(best) ? c : best), readable[0]!);
  }
  const interval = typeof source.interval === 'string' ? source.interval : typeof comp.interval === 'string' ? comp.interval : '1 YEAR';
  const multiplier = ASHBY_INTERVALS[interval];
  if (!multiplier) return null;
  const minV = num(source.minValue ?? comp.minValue);
  const maxV = num(source.maxValue ?? comp.maxValue);
  if (minV == null && maxV == null) return null;
  const lo = (minV ?? maxV!) * multiplier;
  const hi = (maxV ?? minV!) * multiplier;
  const currency = str(source.currencyCode ?? source.currency ?? comp.currency).toUpperCase();
  return { min: Math.min(lo, hi), max: Math.max(lo, hi), currency };
}

function ashbyApiUrl(entry: EmployerEntry): string | null {
  if (entry.api) {
    assertHostAllowed('ashby', entry.api, ASHBY_HOSTS);
    return entry.api;
  }
  const slug = entry.ashby?.board || (entry.careers_url ?? '').match(/jobs\.ashbyhq\.com\/([^/?#]+)/)?.[1];
  return slug ? `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true` : null;
}

export const ashbyProvider: Provider = {
  id: 'ashby',
  detect(entry) {
    try {
      const url = ashbyApiUrl(entry);
      return url ? { url } : null;
    } catch {
      return null;
    }
  },
  async fetch(entry, ctx): Promise<FetchResult> {
    const apiUrl = ashbyApiUrl(entry);
    if (!apiUrl) throw new Error(`ashby: cannot derive API URL for ${entry.name}`);
    assertHostAllowed('ashby', apiUrl, ASHBY_HOSTS);
    const json = obj(await ctx.fetchJson(apiUrl, { redirect: 'error', timeoutMs: 30_000 }, { retries: 2, baseDelayMs: 1000 }));
    const boardSlug = new URL(apiUrl).pathname.split('/').filter(Boolean).pop() ?? '';
    const jobs: Job[] = [];
    for (const raw of arr(json.jobs)) {
      const j = obj(raw);
      if (j.isListed === false) continue;
      const url = str(j.jobUrl) || str(j.applyUrl);
      if (!url) continue;
      const job: Job = { title: str(j.title), url, company: entry.name, location: str(j.location) };
      const desc = str(j.descriptionPlain) || htmlToText(j.descriptionHtml);
      if (desc) job.description = desc;
      const postedAt = toEpochMs(j.publishedAt);
      if (postedAt !== undefined) job.postedAt = postedAt;
      const id = coerceId(j.id);
      if (id) {
        job.externalId = id;
        if (boardSlug) job.listingIdentity = { ats_provider: 'ashby', board_slug: boardSlug, posting_id: id };
      }
      const comp = parseAshbyCompensation(j);
      if (comp) job.salaryText = `${comp.currency || ''} ${Math.round(comp.min)}-${Math.round(comp.max)} per year`.trim();
      jobs.push(job);
    }
    return { jobs };
  },
};

// ── Workable ─────────────────────────────────────────────────────────────────

const WORKABLE_HOSTS: ReadonlySet<string> = new Set(['apply.workable.com']);

function workableSlug(entry: EmployerEntry): string | null {
  try {
    const parsed = new URL(entry.careers_url ?? '');
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'apply.workable.com') return null;
    const slug = parsed.pathname.split('/').filter(Boolean)[0];
    return slug && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(slug) ? slug : null;
  } catch {
    return null;
  }
}

export function parseWorkableWidget(payload: unknown, companyName: string): Job[] {
  const jobs: Job[] = [];
  for (const raw of arr(obj(payload).jobs)) {
    const j = obj(raw);
    const url = str(j.url) || str(j.application_url);
    let safe: string | null = null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && WORKABLE_HOSTS.has(parsed.hostname)) safe = parsed.href;
    } catch { safe = null; }
    if (!safe || !str(j.title)) continue;
    const place = [str(j.city), str(j.state), str(j.country)].filter(Boolean).join(', ');
    const job: Job = { title: str(j.title), url: safe, company: companyName, location: place || (j.telecommuting ? 'Remote' : '') };
    const desc = htmlToText(j.description);
    if (desc) job.description = desc;
    const postedAt = toEpochMs(j.published_on ?? j.created_at);
    if (postedAt !== undefined) job.postedAt = postedAt;
    const id = coerceId(j.shortcode);
    if (id) job.externalId = id;
    jobs.push(job);
  }
  return jobs;
}

export const workableProvider: Provider = {
  id: 'workable',
  detect(entry) {
    const slug = workableSlug(entry);
    return slug ? { url: `https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true` } : null;
  },
  async fetch(entry, ctx): Promise<FetchResult> {
    const slug = workableSlug(entry);
    if (!slug) throw new Error(`workable: cannot derive feed URL for ${entry.name}`);
    const apiUrl = `https://apply.workable.com/api/v1/widget/accounts/${slug}?details=true`;
    assertHostAllowed('workable', apiUrl, WORKABLE_HOSTS);
    const payload = await ctx.fetchJson(apiUrl, {
      redirect: 'error',
      headers: { 'user-agent': DEFAULT_USER_AGENT, 'accept-language': 'en', referer: `https://apply.workable.com/${slug}/` },
    }, { retries: 3 });
    return { jobs: parseWorkableWidget(payload, entry.name) };
  },
};

// ── Recruitee ────────────────────────────────────────────────────────────────

const RECRUITEE_HOST_RE = /^[a-z0-9][a-z0-9-]*\.recruitee\.com$/;

function recruiteeApiUrl(entry: EmployerEntry): string | null {
  try {
    const parsed = new URL(entry.careers_url ?? '');
    if (parsed.protocol !== 'https:' || !RECRUITEE_HOST_RE.test(parsed.hostname)) return null;
    return `https://${parsed.hostname}/api/offers/`;
  } catch {
    return null;
  }
}

export function parseRecruiteeResponse(json: unknown, companyName: string): Job[] {
  const jobs: Job[] = [];
  for (const raw of arr(obj(json).offers)) {
    const j = obj(raw);
    if (/\(sample\)/i.test(str(j.title))) continue;
    const status = str(j.status);
    if (status && status !== 'published') continue;
    const url = str(j.careers_url);
    if (!url || !str(j.title)) continue;
    const names = arr(j.locations).map((l) => str(obj(l).name)).filter(Boolean);
    const place = names.length ? [...new Set(names)].join(' · ') : [str(j.city), str(j.country)].filter(Boolean).join(', ');
    const job: Job = { title: str(j.title), url, company: companyName, location: place || (j.remote ? 'Remote' : '') };
    const desc = htmlToText([str(j.description), str(j.requirements)].filter(Boolean).join('\n'));
    if (desc) job.description = desc;
    const postedAt = toEpochMs(j.published_at ?? j.created_at);
    if (postedAt !== undefined) job.postedAt = postedAt;
    const id = coerceId(j.id);
    if (id) job.externalId = id;
    jobs.push(job);
  }
  return jobs;
}

export const recruiteeProvider: Provider = {
  id: 'recruitee',
  detect(entry) {
    const url = recruiteeApiUrl(entry);
    return url ? { url } : null;
  },
  async fetch(entry, ctx): Promise<FetchResult> {
    const apiUrl = recruiteeApiUrl(entry);
    if (!apiUrl) throw new Error(`recruitee: cannot derive API URL for ${entry.name}`);
    assertHostAllowed('recruitee', apiUrl, RECRUITEE_HOST_RE);
    return { jobs: parseRecruiteeResponse(await ctx.fetchJson(apiUrl, { redirect: 'error' }), entry.name) };
  },
};

// decodeEntities is re-exported for provider authors extending this file.
export { decodeEntities };
