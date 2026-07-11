/**
 * Phase 4.1 — Company matching engine (pure & deterministic).
 *
 * Maps an employer string from a live job posting onto a Company Intelligence
 * record. Pure functions only (no Supabase, no React) so the whole thing is
 * unit-testable. Supports, in priority order:
 *
 *   exact → whitespace/case/punctuation-normalized → alias/synonym → fuzzy
 *
 * Aliases come from the dataset's `synonym` tags (e.g. "J.P. Morgan",
 * "JPMorgan", "ANZ" → Australia and New Zealand Banking Group), so we never
 * guess acronyms and never fabricate a match.
 */

import type { CompanyIntel, CompanyMatchResult } from '../types/companyIntel';

/** Legal suffixes that carry no identity signal, stripped during normalization. */
const LEGAL_SUFFIXES = [
  'private limited', 'pvt ltd', 'pvt limited', 'limited', 'ltd', 'pvt', 'llp', 'llc',
  'plc', 'inc', 'incorporated', 'corp', 'corporation', 'co', 'gmbh', 'sa', 'ag', 'nv',
];

/**
 * Canonical form for comparison: lowercased, `&`→`and`, punctuation → space,
 * whitespace collapsed, trailing legal suffixes removed. Mirrors the dataset's
 * own `name_normalized` conventions so exports line up.
 */
export function normalizeCompanyName(raw: string): string {
  let s = (raw || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[._'’`"(),/\\|-]+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // Strip one trailing legal suffix (longest first).
  for (const suffix of LEGAL_SUFFIXES) {
    if (s.endsWith(' ' + suffix)) {
      s = s.slice(0, -(suffix.length + 1)).trim();
      break;
    }
  }
  return s;
}

/** Tight key with all spaces removed — collapses "JP Morgan" ↔ "JPMorgan". */
export function tightKey(raw: string): string {
  return normalizeCompanyName(raw).replace(/\s+/g, '');
}

export interface CompanyIndex {
  byId: Map<string, CompanyIntel>;
  /** normalized name/alias → company id */
  byNormalized: Map<string, string>;
  /** space-stripped tight key → company id (for "JPMorgan" style) */
  byTight: Map<string, string>;
}

/**
 * Build lookup indexes once from the assembled companies. Later, exact-name and
 * alias collisions resolve to the higher-confidence / lower-tier company so the
 * best record wins deterministically.
 */
export function buildCompanyIndex(companies: CompanyIntel[]): CompanyIndex {
  const byId = new Map<string, CompanyIntel>();
  const byNormalized = new Map<string, string>();
  const byTight = new Map<string, string>();

  const prefer = (existingId: string | undefined, next: CompanyIntel): boolean => {
    if (!existingId) return true;
    const cur = byId.get(existingId);
    if (!cur) return true;
    const curScore = cur.confidenceScore ?? -1;
    const nextScore = next.confidenceScore ?? -1;
    if (nextScore !== curScore) return nextScore > curScore;
    const curTier = cur.priorityTier ?? 99;
    const nextTier = next.priorityTier ?? 99;
    return nextTier < curTier;
  };

  const register = (key: string, c: CompanyIntel, map: Map<string, string>) => {
    if (!key) return;
    if (prefer(map.get(key), c)) map.set(key, c.id);
  };

  for (const c of companies) {
    byId.set(c.id, c);
    const names = [c.name, c.nameNormalized, ...c.aliases].filter(Boolean);
    for (const n of names) {
      register(normalizeCompanyName(n), c, byNormalized);
      register(tightKey(n), c, byTight);
    }
  }
  return { byId, byNormalized, byTight };
}

/**
 * Resolve an employer string to a Company Intelligence record, or null.
 * Never throws; returns the match strategy for transparency in the UI.
 */
export function matchCompany(
  employer: string,
  index: CompanyIndex
): CompanyMatchResult | null {
  const trimmed = (employer || '').trim();
  if (!trimmed) return null;

  // 1 · exact (case-sensitive) name hit.
  const norm = normalizeCompanyName(trimmed);
  const tight = tightKey(trimmed);

  const exactId = index.byNormalized.get(norm);
  if (exactId) {
    const company = index.byId.get(exactId)!;
    const via = company.name === trimmed ? 'exact' : 'normalized';
    return { company, via, score: via === 'exact' ? 1 : 0.95 };
  }

  // 2 · tight (space-insensitive) — "JP Morgan" ↔ "JPMorgan".
  const tightId = index.byTight.get(tight);
  if (tightId) return { company: index.byId.get(tightId)!, via: 'alias', score: 0.9 };

  // 3 · conservative fuzzy: containment on tight keys, but only when the query
  // is distinctive enough (≥5 chars) to avoid matching short common words.
  if (tight.length >= 5) {
    let best: { id: string; score: number } | null = null;
    for (const [key, id] of index.byTight) {
      if (key.length < 5) continue;
      if (key === tight) continue;
      const contains = key.includes(tight) || tight.includes(key);
      if (!contains) continue;
      const score = Math.min(key.length, tight.length) / Math.max(key.length, tight.length);
      if (score >= 0.6 && (!best || score > best.score)) best = { id, score };
    }
    if (best) return { company: index.byId.get(best.id)!, via: 'fuzzy', score: best.score * 0.8 };
  }

  return null;
}
