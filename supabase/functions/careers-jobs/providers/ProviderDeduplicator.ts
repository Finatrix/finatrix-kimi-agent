// Cross-provider de-duplication.
//
// The same role routinely appears from several providers (LinkedIn surfaces a
// post, Glassdoor surfaces the company page, an ATS feed surfaces the original).
// We collapse these into ONE job, keeping the highest-priority provider's record
// as the canonical base while MERGING every duplicate's metadata so nothing is
// discarded (a lower-priority record may carry a salary or logo the winner lacks).
//
// Similarity signals: exact company+title+location key, apply-URL key, and a
// token-Jaccard description similarity as a fuzzy fallback. An optional async
// AI-similarity hook is supported by the manager but off by default (calling an
// LLM per candidate pair is cost-prohibitive at search time).

import type { FinatriXJob } from './types.ts';
import { normToken } from './sanitize.ts';

/** Strong key: company + title + coarse location. */
export function contentKey(j: FinatriXJob): string {
  return `${normToken(j.company)}::${normToken(j.title)}::${normToken(j.location).slice(0, 24)}`;
}

/** Apply-URL key scoped by company+title (aggregators reuse generic portals). */
export function urlKey(j: FinatriXJob): string {
  if (!j.applyUrl) return '';
  let host = '';
  try {
    const u = new URL(j.applyUrl);
    host = `${u.host}${u.pathname.replace(/\/+$/, '')}`.toLowerCase();
  } catch {
    host = j.applyUrl.toLowerCase().split(/[?#]/)[0].replace(/\/+$/, '');
  }
  return `${host}::${normToken(j.company)}::${normToken(j.title)}`;
}

/** Token-set Jaccard over the first N chars of two descriptions. */
export function descSimilarity(a: string, b: string): number {
  const toks = (s: string) => new Set(normToken(s.slice(0, 1200)).split(' ').filter((t) => t.length > 3));
  const A = toks(a), B = toks(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const t of A) if (B.has(t)) inter++;
  return inter / (A.size + B.size - inter);
}

/** Merge `dup` into `base`, filling gaps and preserving all metadata. */
export function mergeInto(base: FinatriXJob, dup: FinatriXJob): FinatriXJob {
  return {
    ...base,
    salary: {
      min: base.salary.min ?? dup.salary.min,
      max: base.salary.max ?? dup.salary.max,
      currency: base.salary.currency || dup.salary.currency,
      period: base.salary.period || dup.salary.period,
      estimated: base.salary.estimated && dup.salary.estimated,
    },
    companyLogo: base.companyLogo ?? dup.companyLogo,
    description: base.description.length >= dup.description.length ? base.description : dup.description,
    postedDate: base.postedDate ?? dup.postedDate,
    closesAt: base.closesAt ?? dup.closesAt,
    industry: base.industry || dup.industry,
    skills: [...new Set([...base.skills, ...dup.skills])].slice(0, 16),
    badges: [...new Set([...base.badges, ...dup.badges])],
    // Never discard the other provider's payload.
    metadata: {
      ...dup.metadata,
      ...base.metadata,
      mergedFrom: [
        ...(Array.isArray((base.metadata as Record<string, unknown>).mergedFrom)
          ? ((base.metadata as Record<string, unknown>).mergedFrom as unknown[])
          : []),
        { provider: dup.provider, id: dup.id, via: dup.via },
      ],
    },
  };
}

export interface DedupeOptions {
  /** Fuzzy-match threshold on description Jaccard (0–1). */
  descThreshold?: number;
  /** Optional async AI similarity — returns true if two jobs are the same role. */
  aiSimilar?: (a: FinatriXJob, b: FinatriXJob) => Promise<boolean>;
}

/**
 * De-duplicate a flat list. Input SHOULD already be priority-sorted (highest
 * first) so the first occurrence wins; `mergeInto` folds later duplicates in.
 * Returns the deduped list in the same order the winners first appeared.
 */
export async function deduplicate(
  jobs: FinatriXJob[],
  opts: DedupeOptions = {},
): Promise<FinatriXJob[]> {
  const threshold = opts.descThreshold ?? 0.82;
  const byContent = new Map<string, number>();   // key → index in `out`
  const byUrl = new Map<string, number>();
  const out: FinatriXJob[] = [];

  for (const job of jobs) {
    const ck = contentKey(job);
    const uk = urlKey(job);
    let hitIndex = byContent.has(ck) ? byContent.get(ck)! : (uk && byUrl.has(uk) ? byUrl.get(uk)! : -1);

    // Fuzzy fallback: same company + high description overlap.
    if (hitIndex === -1 && job.description) {
      for (let i = 0; i < out.length; i++) {
        const other = out[i];
        if (normToken(other.company) !== normToken(job.company)) continue;
        if (descSimilarity(other.description, job.description) >= threshold) { hitIndex = i; break; }
        if (opts.aiSimilar && await opts.aiSimilar(other, job)) { hitIndex = i; break; }
      }
    }

    if (hitIndex >= 0) {
      out[hitIndex] = mergeInto(out[hitIndex], job);
    } else {
      const idx = out.push(job) - 1;
      byContent.set(ck, idx);
      if (uk) byUrl.set(uk, idx);
    }
  }
  return out;
}
