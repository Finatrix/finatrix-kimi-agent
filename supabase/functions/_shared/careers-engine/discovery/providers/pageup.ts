/**
 * PageUp listing scraper. PageUp is heavily used by AU universities, government and large employers.
 * Derived from career-ops providers/pageup.mjs (MIT, see NOTICE).
 *
 * Two URL shapes are supported:
 *  - vendor host:  https://careers.pageuppeople.com/<tenant>/<site>/<lang>/listing/   (auto-detected)
 *  - branded host: https://jobs.example.edu.au/<site>/<lang>/listing/                 (needs `provider: "pageup"`;
 *    the host has no tenant segment, and any website could serve similar markup, so it is never auto-detected)
 */
import type { EmployerEntry, FetchContext, FetchResult, Job, Provider, Truncation } from '../../types.ts';
import { decodeEntities, htmlToText } from '../../util/html.ts';
import { isRefusedRedirectError } from '../../util/http.ts';
import { positiveInt, probeCap } from './_util.ts';

const VENDOR_HOST = 'careers.pageuppeople.com';
const PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 20;
const MAX_PAGES_CAP = 200;
const INTER_PAGE_DELAY_MS = 250;
const TENANT_PATH_RE = /^\/(\d+)\/([A-Za-z0-9_-]+)\/([A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})?)(?:\/|$)/;

export interface PageUpConfig {
  /** Numeric tenant id on the vendor host; empty on a branded host. */
  tenant: string;
  /** Career-website code (e.g. "cw"); may be empty on a branded host. */
  site: string;
  lang: string;
  /** Branded host. Absent for careers.pageuppeople.com. */
  host?: string;
}

const HOST_RE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
const BRANDED_LISTING_RE = /^\/(?:([A-Za-z0-9_-]+)\/)?([A-Za-z]{2,3}(?:-[A-Za-z0-9]{1,8})?)\/listing(?:\/|$)/;

const originOf = (cfg: PageUpConfig) => `https://${cfg.host ?? VENDOR_HOST}`;
const basePathOf = (cfg: PageUpConfig) =>
  cfg.host ? `/${[cfg.site, cfg.lang].filter(Boolean).join('/')}` : `/${cfg.tenant}/${cfg.site}/${cfg.lang}`;
const escapeRe = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function resolveConfig(entry: EmployerEntry): PageUpConfig | null {
  for (const raw of [entry?.api, entry?.careers_url]) {
    if (typeof raw !== 'string' || !raw) continue;
    let parsed: URL;
    try { parsed = new URL(raw); } catch { continue; }
    if (parsed.protocol !== 'https:') continue;
    if (parsed.hostname === VENDOR_HOST) {
      const m = parsed.pathname.match(TENANT_PATH_RE);
      if (m) return { tenant: m[1]!, site: m[2]!, lang: m[3]! };
      continue;
    }
    if (entry.provider !== 'pageup' || !HOST_RE.test(parsed.hostname) || parsed.port) continue;
    const b = parsed.pathname.match(BRANDED_LISTING_RE);
    if (b) return { tenant: '', site: b[1] ?? '', lang: b[2]!, host: parsed.hostname.toLowerCase() };
  }
  return null;
}

const listingUrl = (cfg: PageUpConfig, page: number) =>
  `${originOf(cfg)}${basePathOf(cfg)}/listing/?page=${page}&page-items=${PAGE_SIZE}`;

function stripComments(s: string): string {
  let out = '';
  let pos = 0;
  for (;;) {
    const open = s.indexOf('<!--', pos);
    if (open === -1) return out + s.slice(pos);
    out += s.slice(pos, open);
    const close = s.indexOf('-->', open + 4);
    if (close === -1) return out;
    pos = close + 3;
  }
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`(?<![\\w-])${name}=["']([^"'<>]*)["']`, 'i'));
  return m ? m[1]! : null;
}
const hasClass = (tag: string, token: string) => (attr(tag, 'class') ?? '').split(/\s+/).includes(token);

export interface PageUpParse {
  valid: boolean;
  reason?: 'no-table' | 'no-jobs-parsed';
  linkCount: number;
  hasMore: boolean;
  jobs: Job[];
}

/** Parse one listing page. `valid:false` means "not a listing page / markup changed", never "zero jobs". */
export function parsePageupListing(html: string, cfg: PageUpConfig, companyName: string): PageUpParse {
  const doc = String(html);
  const open = doc.match(/<tbody\b[^<>]*(?<![\w-])id=["']search-results-content["'][^<>]*>/i);
  if (!open) return { valid: false, reason: 'no-table', linkCount: 0, hasMore: false, jobs: [] };
  const start = (open.index ?? 0) + open[0].length;
  const close = doc.slice(start).search(/<\/tbody\s*>/i);
  const end = close === -1 ? doc.length : start + close;
  const body = stripComments(doc.slice(start, end));

  const jobs: Job[] = [];
  let linkCount = 0;
  const opens = [...body.matchAll(/<a\b[^<>]*>/gi)];
  const closes = [...body.matchAll(/<\/a\s*>/gi)].map((m) => m.index ?? 0);
  let nextClose = 0;
  for (let i = 0; i < opens.length; i++) {
    const tag = opens[i]!;
    if (!hasClass(tag[0], 'job-link')) continue;
    linkCount++;
    const href = attr(tag[0], 'href');
    if (!href) continue;
    let parsed: URL;
    try { parsed = new URL(decodeEntities(href), originOf(cfg)); } catch { continue; }
    if (parsed.origin !== originOf(cfg)) continue;
    const m = cfg.host
      ? parsed.pathname.match(new RegExp(`^${cfg.site ? `/${escapeRe(cfg.site)}` : ''}/[^/]+/job/(\\d+)(?:/|$)`))
      : parsed.pathname.match(/^\/(\d+)\/([A-Za-z0-9_-]+)\/[^/]+\/job\/(\d+)(?:\/|$)/);
    if (!m) continue;
    if (!cfg.host && (m[1] !== cfg.tenant || m[2] !== cfg.site)) continue;
    const jobId = cfg.host ? m[1]! : m[3]!;
    const textStart = (tag.index ?? 0) + tag[0].length;
    while (nextClose < closes.length && closes[nextClose]! < textStart) nextClose++;
    const textEnd = closes[nextClose];
    const nextOpen = opens[i + 1]?.index;
    if (textEnd === undefined || (nextOpen !== undefined && nextOpen < textEnd)) continue;
    const title = htmlToText(body.slice(textStart, textEnd));
    if (!title) continue;
    jobs.push({
      title,
      // Rebuild from ids only, so tracking params never leak into the dedup key.
      url: `${originOf(cfg)}${basePathOf(cfg)}/job/${jobId}`,
      company: companyName,
      location: '',
      externalId: jobId,
    });
  }
  if (jobs.length === 0 && (linkCount > 0 || /\/job\/\d/.test(body))) {
    return { valid: false, reason: 'no-jobs-parsed', linkCount, hasMore: false, jobs: [] };
  }
  const tail = doc.slice(end);
  let hasMore = false;
  if (tail.includes('more-link')) {
    for (const tag of stripComments(tail).matchAll(/<a\b[^<>]*>/gi)) {
      if (hasClass(tag[0], 'more-link')) { hasMore = true; break; }
    }
  }
  return { valid: true, linkCount, hasMore, jobs };
}

export const pageUpProvider: Provider = {
  id: 'pageup',
  detect(entry) {
    const cfg = resolveConfig(entry);
    return cfg ? { url: listingUrl(cfg, 1) } : null;
  },
  async fetch(entry: EmployerEntry, ctx: FetchContext): Promise<FetchResult> {
    const cfg = resolveConfig(entry);
    if (!cfg) {
      throw new Error(
        `pageup: cannot derive a listing URL for ${entry.name} (use https://careers.pageuppeople.com/<tenant>/<site>/<lang>/listing/, or provider "pageup" with https://<host>/<site>/<lang>/listing/)`,
      );
    }
    const maxPages = positiveInt(entry.max_pages, DEFAULT_MAX_PAGES, MAX_PAGES_CAP);
    const probe = probeCap(ctx);
    const pagesToFetch = probe !== null ? Math.min(maxPages, probe) : maxPages;
    const jobs: Job[] = [];
    const seen = new Set<string>();
    let stop: 'cap' | 'complete' | 'fetch-error' | 'unrecognised-page' = 'cap';
    let detail: string | undefined;

    for (let page = 1; page <= pagesToFetch; page++) {
      if (page > 1) await ctx.sleep(INTER_PAGE_DELAY_MS);
      let html: string;
      try {
        html = await ctx.fetchText(listingUrl(cfg, page), { redirect: 'error' }, probe !== null ? { retries: 0 } : undefined);
      } catch (err) {
        if (probe !== null) throw err;
        if (page === 1 && isRefusedRedirectError(err)) {
          throw new Error(
            `pageup: ${entry.name} redirects away from ${originOf(cfg)}; the careers site has likely moved`,
            { cause: err },
          );
        }
        if (page === 1) throw err;
        stop = 'fetch-error';
        detail = `stopped at page ${page}: ${err instanceof Error ? err.message : String(err)}`;
        break;
      }
      const parsed = parsePageupListing(html, cfg, entry.name);
      if (!parsed.valid) {
        const what = parsed.reason === 'no-table'
          ? 'no search-results table (login/error/challenge page, not zero postings)'
          : 'posting links present but none readable (markup changed)';
        if (page === 1) throw new Error(`pageup: ${entry.name} returned a listing page with ${what}`);
        stop = 'unrecognised-page';
        detail = `page ${page}: ${what}`;
        break;
      }
      let fresh = 0;
      for (const job of parsed.jobs) {
        if (seen.has(job.url)) continue;
        seen.add(job.url);
        fresh++;
        jobs.push(job);
      }
      if (fresh === 0) { stop = 'complete'; break; }
      if (!parsed.hasMore && parsed.linkCount < PAGE_SIZE) { stop = 'complete'; break; }
    }

    let truncation: Truncation | undefined;
    if (stop === 'cap' && probe === null) truncation = { reason: 'cap', transient: false, detail: `max_pages=${maxPages}` };
    else if (stop === 'fetch-error') truncation = { reason: 'fetch-error', transient: true, detail };
    else if (stop === 'unrecognised-page') truncation = { reason: 'unrecognised-page', transient: false, detail };
    return truncation ? { jobs, truncation } : { jobs };
  },
};
