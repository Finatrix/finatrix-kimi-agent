/**
 * Title keyword matching. Derived from career-ops title-keywords.mjs (MIT, see NOTICE).
 *
 * Keyword forms:
 *   "analyst"        substring match (2–3 letter all-letter acronyms anchor on word boundaries)
 *   "word:intern"    whole word only
 *   "stem:agent"     word that STARTS with the keyword
 */
import { foldAscii } from '../util/text.ts';

export const WORD_PREFIX = 'word:';
export const STEM_PREFIX = 'stem:';

function escapeForRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// CJK characters glue onto Latin acronyms ("AI工程师"), so they count as word edges.
const WORD_CHAR = String.raw`(?:(?![\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}])[\p{L}\p{M}\p{N}_])`;
const anchored = (body: string) => new RegExp(`(?<!${WORD_CHAR})${body}(?!${WORD_CHAR})`, 'u');
const stemmed = (body: string) => new RegExp(`(?<!${WORD_CHAR})${body}`, 'u');

export type Matcher = (lowerFoldedTitle: string) => boolean;

/** Compile one keyword. A bare prefix with nothing after it matches nothing (safe reading of a typo). */
export function compileKeyword(keyword: string): Matcher {
  const kw = foldAscii(keyword).trim().toLowerCase();
  if (kw.startsWith(WORD_PREFIX)) {
    const bare = kw.slice(WORD_PREFIX.length).trim();
    if (!bare) return () => false;
    const re = anchored(escapeForRegExp(bare));
    return (t) => re.test(t);
  }
  if (kw.startsWith(STEM_PREFIX)) {
    const bare = kw.slice(STEM_PREFIX.length).trim();
    if (!bare) return () => false;
    const re = stemmed(escapeForRegExp(bare));
    return (t) => re.test(t);
  }
  if (!kw) return () => false;
  if (/^[a-z]{2,3}$/.test(kw)) {
    const re = anchored(escapeForRegExp(kw));
    return (t) => re.test(t);
  }
  return (t) => t.includes(kw);
}

export interface TitleFilterConfig {
  /** At least one must match (when non-empty). */
  positive?: string[];
  /** Any match rejects. */
  negative?: string[];
}

export interface TitleFilter {
  test(title: string): boolean;
  /** Why a title was rejected, for audit trails. */
  explain(title: string): { accepted: boolean; reason: 'no-positive' | 'negative' | 'ok'; keyword?: string };
}

export function buildTitleFilter(config: TitleFilterConfig = {}): TitleFilter {
  const pos = (config.positive ?? []).map((k) => ({ k, m: compileKeyword(k) }));
  const neg = (config.negative ?? []).map((k) => ({ k, m: compileKeyword(k) }));
  const prep = (t: string) => foldAscii(String(t ?? '')).toLowerCase();
  const explain: TitleFilter['explain'] = (title) => {
    const t = prep(title);
    const bad = neg.find((n) => n.m(t));
    if (bad) return { accepted: false, reason: 'negative', keyword: bad.k };
    if (pos.length && !pos.some((p) => p.m(t))) return { accepted: false, reason: 'no-positive' };
    return { accepted: true, reason: 'ok', keyword: pos.find((p) => p.m(t))?.k };
  };
  return { explain, test: (title) => explain(title).accepted };
}
