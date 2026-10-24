/**
 * Repost detection: the same employer re-listing the same role under a new URL within a window.
 * Derived from career-ops detect-reposts.mjs (MIT, see NOTICE).
 */
import { companyIdentity } from './fingerprint.ts';
import { daysBetween } from '../util/text.ts';

export const DEFAULT_WINDOW_DAYS = 90;
export const MIN_REPOST_SPAN_DAYS = 1;

export interface HistoryRow {
  url: string;
  date: Date;
  /** Original date string, echoed back in cluster output. */
  dateStr: string;
  title: string;
  company: string;
  /** Only `added` rows count (expired / seen events are ignored). Defaults to 'added'. */
  status?: string;
  /** Pre-normalised company key, if the caller has one. */
  normCompany?: string;
}

export interface RepostCluster {
  company: string;
  role: string;
  repostCount: number;
  firstSeen: string;
  lastSeen: string;
  daysSpan: number;
  appearances: Array<{ url: string; date: string; title: string }>;
}

/** Order-insensitive identity for a title: "Risk Analyst, Credit" ≡ "Credit Risk Analyst". */
export function titleIdentityKey(title: unknown): string {
  const raw = String(title ?? '').trim();
  const words = raw
    .normalize('NFD')
    .replace(/\p{Mn}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return raw.toLowerCase();
  return [...new Set(words)].sort().join(' ');
}

function companyKey(row: HistoryRow): string {
  const stored = typeof row.normCompany === 'string' ? row.normCompany.trim() : '';
  const raw = typeof row.company === 'string' ? row.company.trim() : '';
  return stored || companyIdentity(raw) || raw.toLowerCase();
}

function groupByTitle(rows: HistoryRow[]): HistoryRow[][] {
  const groups: HistoryRow[][] = [];
  const index = new Map<string, number>();
  for (const row of rows) {
    const key = titleIdentityKey(row.title);
    let i = index.get(key);
    if (i === undefined) {
      i = groups.length;
      index.set(key, i);
      groups.push([]);
    }
    groups[i]!.push(row);
  }
  return groups;
}

function buildCluster(rows: HistoryRow[], windowDays: number, minSpan: number): RepostCluster | null {
  const byUrl = new Map<string, HistoryRow>();
  for (const row of rows) {
    const existing = byUrl.get(row.url);
    if (!existing || row.date < existing.date) byUrl.set(row.url, row);
  }
  const unique = [...byUrl.values()];
  if (unique.length < 2) return null;
  const sorted = unique.sort((a, b) => a.date.getTime() - b.date.getTime());
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  const span = daysBetween(first.date, last.date);
  if (span > windowDays || span < minSpan) return null;
  return {
    company: rows[0]!.company,
    role: last.title,
    repostCount: sorted.length,
    firstSeen: first.dateStr,
    lastSeen: last.dateStr,
    daysSpan: span,
    appearances: sorted.map((r) => ({ url: r.url, date: r.dateStr, title: r.title })),
  };
}

function detectInGroup(rows: HistoryRow[], windowDays: number, minSpan: number): RepostCluster[] {
  const results: RepostCluster[] = [];
  for (const group of groupByTitle(rows)) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => a.date.getTime() - b.date.getTime());
    let cluster: HistoryRow[] = [];
    const flush = () => {
      if (cluster.length >= 2) {
        const built = buildCluster(cluster, windowDays, minSpan);
        if (built) results.push(built);
      }
    };
    for (const row of sorted) {
      if (cluster.length === 0) {
        cluster = [row];
        continue;
      }
      if (daysBetween(cluster[0]!.date, row.date) <= windowDays) {
        cluster.push(row);
      } else {
        flush();
        cluster = cluster.filter((c) => daysBetween(c.date, row.date) <= windowDays);
        cluster.push(row);
      }
    }
    flush();
  }
  return results;
}

/**
 * Group history rows per company then per title, and return clusters of ≥2 distinct URLs
 * first seen within `windowDays` of each other and at least `minSpan` days apart (same-day
 * duplicates are multi-location variants, not reposts). Aggregator companies are skipped
 * (their feeds legitimately mix employers).
 */
export function detectReposts(
  rows: HistoryRow[],
  windowDays = DEFAULT_WINDOW_DAYS,
  minSpan = MIN_REPOST_SPAN_DAYS,
  aggregators: Set<string> | Map<string, unknown> | null = null,
): RepostCluster[] {
  if (!Array.isArray(rows)) return [];
  const valid = rows
    .filter(
      (r) =>
        r &&
        (r.status ?? 'added') === 'added' &&
        typeof r.url === 'string' && r.url.trim() &&
        r.date instanceof Date && !Number.isNaN(r.date.getTime()) &&
        typeof r.company === 'string' && r.company.trim() &&
        typeof r.title === 'string' && r.title.trim(),
    )
    .map((r) => ({ ...r, url: r.url.trim(), company: r.company.trim(), title: r.title.trim() }));
  if (valid.length < 2) return [];

  const byCompany = new Map<string, HistoryRow[]>();
  for (const row of valid) {
    const key = companyKey(row);
    if (!byCompany.has(key)) byCompany.set(key, []);
    byCompany.get(key)!.push(row);
  }

  const clusters: RepostCluster[] = [];
  for (const [key, group] of byCompany) {
    if (group.length < 2) continue;
    if (aggregators?.has(key)) continue;
    clusters.push(...detectInGroup(group, windowDays, minSpan));
  }
  return clusters.sort((a, b) => (a.lastSeen < b.lastSeen ? 1 : -1));
}
