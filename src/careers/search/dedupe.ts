/**
 * Phase 2.2 — Multi-signal duplicate detection.
 *
 * The same posting routinely appears from several providers (JSearch surfaces a
 * LinkedIn post, Adzuna surfaces the company page, etc.). The old dedupe keyed
 * only on company/title/location, so near-identical rows slipped through. This
 * collapses duplicates on ANY strong signal:
 *
 *   • canonical apply URL (host + path, query/hash stripped) — gated on the
 *     same company + similar title, because aggregators reuse one generic
 *     apply portal (company.com/careers) across many distinct roles
 *   • provider external id
 *   • alias-normalized company + normalized title (+ location)
 *   • near-identical description (token Jaccard ≥ threshold) for the same
 *     company+title even when locations differ slightly
 *
 * Pure and deterministic. Keeps the FIRST occurrence (providers are fanned out
 * in quality order), so the highest-quality source wins.
 */

import { normalizeCompanyName } from './companyMatch';

export interface DedupeInput {
  source: string;
  external_id: string;
  company: string;
  title: string;
  location: string;
  description: string;
  apply_url: string;
}

export interface DedupeResult<T> {
  unique: T[];
  removed: number;
}

/** Canonical apply URL: lowercase host+path, no query/hash/trailing slash. */
export function canonicalUrl(raw: string): string {
  if (!raw) return '';
  try {
    const u = new URL(raw);
    const path = u.pathname.replace(/\/+$/, '');
    return `${u.host}${path}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase().split(/[?#]/)[0].replace(/\/+$/, '');
  }
}

/** Normalized title: lowercased, trailing "(remote)"/"- City" noise removed. */
export function normalizeTitle(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .replace(/\(([^)]*)\)/g, ' ')            // drop parentheticals
    .replace(/\b(remote|hybrid|on-?site|wfh)\b/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(text: string, limit = 400): Set<string> {
  const toks = (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((w) => w.length > 2);
  return new Set(toks.slice(0, limit));
}

/** Jaccard similarity of two token sets (0–1). */
export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

const DESC_SIMILARITY_THRESHOLD = 0.82;
const TITLE_SIMILARITY_THRESHOLD = 0.5;

/**
 * De-duplicate a list of postings. `T` only needs the DedupeInput fields.
 */
export function dedupeJobs<T extends DedupeInput>(jobs: T[]): DedupeResult<T> {
  const unique: T[] = [];
  const seenId = new Set<string>();
  const seenContent = new Set<string>();
  // URL collapse must not treat a shared apply portal as one job, so kept jobs
  // are indexed by URL and only collapse against a same-company, similar-title
  // prior.
  const byUrl = new Map<string, { company: string; titleTokens: Set<string> }[]>();
  // For near-duplicate description checks, index kept jobs by company+title.
  const byCompanyTitle = new Map<string, { tokens: Set<string> }[]>();
  let removed = 0;

  for (const job of jobs) {
    const url = canonicalUrl(job.apply_url);
    const idKey = job.external_id ? `${job.source}:${job.external_id}` : '';
    const company = normalizeCompanyName(job.company);
    const title = normalizeTitle(job.title);
    const titleTokens = new Set(title.split(' ').filter(Boolean));
    const loc = (job.location || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 24);
    const contentKey = `${company}::${title}::${loc}`;
    const ctKey = `${company}::${title}`;

    const urlPriors = url ? byUrl.get(url) : undefined;
    if (
      urlPriors?.some(
        (p) =>
          p.company === company &&
          (p.titleTokens.size === 0 || titleTokens.size === 0
            ? true
            : jaccard(titleTokens, p.titleTokens) >= TITLE_SIMILARITY_THRESHOLD)
      )
    ) {
      removed++;
      continue;
    }
    if (idKey && seenId.has(idKey)) { removed++; continue; }
    if (seenContent.has(contentKey)) { removed++; continue; }

    // Near-duplicate description for the same company+title (different location
    // wording, reposted, etc.).
    const tokens = tokenSet(job.description);
    const priors = byCompanyTitle.get(ctKey);
    if (priors && tokens.size > 0 && priors.some((p) => jaccard(tokens, p.tokens) >= DESC_SIMILARITY_THRESHOLD)) {
      removed++;
      continue;
    }

    unique.push(job);
    if (idKey) seenId.add(idKey);
    seenContent.add(contentKey);
    if (url) {
      const urlList = byUrl.get(url);
      if (urlList) urlList.push({ company, titleTokens });
      else byUrl.set(url, [{ company, titleTokens }]);
    }
    const list = byCompanyTitle.get(ctKey);
    if (list) list.push({ tokens });
    else byCompanyTitle.set(ctKey, [{ tokens }]);
  }

  return { unique, removed };
}
