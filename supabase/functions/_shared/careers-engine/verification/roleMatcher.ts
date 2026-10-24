/**
 * Fuzzy "are these the same role?" matcher. Derived from career-ops role-matcher.mjs (MIT, see NOTICE),
 * tuned for Australian finance / risk / compliance titles (AML, KYC, CDD, ...) and graduate programs.
 */

export const SENIORITY_TOKENS = new Set([
  'junior', 'mid', 'middle', 'senior', 'staff', 'principal', 'lead', 'head', 'chief', 'associate',
  'intern', 'entry', 'graduate', 'cadet', 'trainee',
]);

/** Entry-level markers: "Graduate Risk Analyst" must not collapse into "Risk Analyst". */
export const SUB_BASELINE_SENIORITY = new Set(['associate', 'junior', 'entry', 'intern', 'graduate', 'cadet', 'trainee']);

export const LEVEL_TOKENS = new Map<string, number>([
  ['i', 1], ['ii', 2], ['iii', 3], ['iv', 4], ['v', 5], ['vi', 6],
  ['1', 1], ['2', 2], ['3', 3], ['4', 4], ['5', 5], ['6', 6],
]);

const LEVEL_RE = /(?:^|[\s,(/\-–—])(?:level|lvl|grade|tier)?\s*(i{1,3}|iv|vi?|[1-6])(?=$|[\s,)/\-–—])/giu;

export const ROLE_STOPWORDS = new Set([
  'junior', 'mid', 'middle', 'senior', 'staff', 'principal', 'lead', 'head', 'chief', 'associate',
  'intern', 'entry', 'level', 'graduate', 'cadet', 'trainee',
  'remote', 'hybrid', 'onsite', 'contract', 'contractor', 'freelance', 'fulltime', 'parttime',
  'permanent', 'temporary', 'internship', 'casual',
  'role', 'position', 'opportunity', 'team', 'based', 'repost', 'reposted', 'relisted',
  // Australian + common cities / regions: location is not part of a role's identity
  'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide', 'canberra', 'hobart', 'darwin', 'parramatta',
  'australia', 'australian', 'victoria', 'queensland', 'tasmania', 'wales', 'nsw', 'anz',
  'bangalore', 'bengaluru', 'mumbai', 'delhi', 'hyderabad', 'pune', 'chennai', 'london', 'singapore',
  'europe', 'emea', 'apac', 'latam', 'americas', 'india', 'canada', 'zealand', 'auckland',
  'with', 'from', 'into', 'over', 'this', 'that',
]);

const MTS_PREFIX = /\bmember\s+of\s+technical\s+staff\b/g;

/** 2–3 letter tokens that *are* meaningful specialties. */
export const SHORT_SPECIALTY = new Set([
  'api', 'sre', 'sdk', 'cli', 'gpu', 'cpu', 'ios', 'qa', 'ux', 'ui', 'ar', 'vr', 'ocr', 'crm', 'erp',
  // Financial crime, risk and compliance
  'aml', 'ctf', 'kyc', 'cdd', 'edd', 'grc', 'sar', 'smr', 'fcc', 'esg', 'irb', 'cra', 'bcp', 'sox', 'bau',
]);

/** Generic role nouns that do not discriminate between roles on their own. */
export const BASELINE_TOKENS = new Set([
  'software', 'engineer', 'developer', 'manager', 'architect', 'analyst', 'designer', 'consultant', 'specialist',
  'platform', 'systems', 'services', 'backend', 'frontend', 'full', 'stack', 'fullstack', 'product',
  'officer', 'coordinator', 'advisor', 'adviser', 'assistant', 'executive',
]);

function normalizeTitle(value: unknown): string {
  const text = typeof value === 'string' ? value : String(value ?? '');
  return text.toLowerCase().normalize('NFD').replace(/(?<=[a-z])\p{Mn}/gu, '').normalize('NFC');
}

export function roleTokens(role: unknown): string[] {
  return normalizeTitle(role)
    .replace(MTS_PREFIX, ' engineer ')
    // "CI/CD" collapses to one token, but "AML/CTF" / "KYC/CDD" are two specialties and must stay two.
    .replace(/\b([a-z0-9]{1,3})\/([a-z0-9]{1,3})\b/g, (_m, a: string, b: string) => (SHORT_SPECIALTY.has(a) && SHORT_SPECIALTY.has(b) ? `${a} ${b}` : `${a}${b}`))
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => (w.length > 3 || SHORT_SPECIALTY.has(w)) && !ROLE_STOPWORDS.has(w));
}

export function extractLevels(title: unknown): Set<number> {
  const levels = new Set<number>();
  for (const m of normalizeTitle(title).matchAll(LEVEL_RE)) {
    const level = LEVEL_TOKENS.get(m[1]!);
    if (level !== undefined) levels.add(level);
  }
  return levels;
}

function extractSeniorities(title: unknown): Set<string> {
  return new Set(
    normalizeTitle(title)
      .replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => SENIORITY_TOKENS.has(w)),
  );
}

const SHORT_ACRONYM_NOISE = new Set(['ALL', 'AND', 'FOR', 'THE', 'NEW', 'FTE', 'PTE', 'LLC', 'INC', 'LTD', 'SR', 'JR', 'II', 'III', 'IV', 'VI', 'PTY']);

/** ALL-CAPS 2–3 letter acronyms ("AML", "KYC"); skipped when the whole title is upper case. */
export function extractShortAcronyms(title: unknown): Set<string> {
  const text = String(title ?? '');
  const letters = text.replace(/[^\p{L}]/gu, '');
  if (letters === '' || letters.replace(/\p{Lu}/gu, '') === '') return new Set();
  const found = text.match(/(?<![A-Za-z0-9])[A-Z]{2,3}(?![A-Za-z0-9])/g) ?? [];
  return new Set(found.filter((w) => !SHORT_ACRONYM_NOISE.has(w)));
}

/**
 * Conservative: false negatives are cheap (a possible duplicate is only advisory), false positives
 * would hide a genuinely different role.
 */
export function roleFuzzyMatch(a: unknown, b: unknown): boolean {
  const textA = String(a ?? '').trim().toLowerCase();
  const textB = String(b ?? '').trim().toLowerCase();
  if (textA && textA === textB) return true;

  const senA = extractSeniorities(a);
  const senB = extractSeniorities(b);
  if (senA.size > 0 && senB.size > 0) {
    if (![...senA].some((s) => senB.has(s))) return false;
  } else if (senA.size > 0 || senB.size > 0) {
    const lone = senA.size > 0 ? senA : senB;
    if ([...lone].some((s) => SUB_BASELINE_SENIORITY.has(s))) return false;
  }

  const lvlA = extractLevels(a);
  const lvlB = extractLevels(b);
  if (lvlA.size > 0 && lvlB.size > 0 && ![...lvlA].some((l) => lvlB.has(l))) return false;

  const wordsA = [...new Set(roleTokens(a))];
  const wordsB = [...new Set(roleTokens(b))];
  if (wordsA.length === 0 || wordsB.length === 0) return false;

  const setB = new Set(wordsB);
  const overlap = wordsA.filter((w) => setB.has(w));
  if (overlap.length < 2) return false;
  if (overlap.filter((w) => !BASELINE_TOKENS.has(w)).length === 0) return false;

  const smaller = wordsA.length <= wordsB.length ? wordsA : wordsB;
  const larger = wordsA.length <= wordsB.length ? wordsB : wordsA;
  if (larger.length > smaller.length && overlap.length === smaller.length) {
    const smallerSet = new Set(smaller);
    if (larger.filter((w) => !smallerSet.has(w)).some((w) => !BASELINE_TOKENS.has(w))) return false;
  }

  const setA = new Set(wordsA);
  const isPluralOf = (x: string, y: string) => x === `${y}s` || y === `${x}s`;
  const uniqueA = wordsA.filter((w) => !setB.has(w) && !BASELINE_TOKENS.has(w));
  const uniqueB = wordsB.filter((w) => !setA.has(w) && !BASELINE_TOKENS.has(w));
  const unmatchedA = uniqueA.filter((x) => !uniqueB.some((y) => isPluralOf(x, y)));
  const unmatchedB = uniqueB.filter((y) => !uniqueA.some((x) => isPluralOf(x, y)));
  if (unmatchedA.length > 0 && unmatchedB.length > 0) return false;

  const acrA = extractShortAcronyms(a);
  const acrB = extractShortAcronyms(b);
  if ([...acrA].some((w) => !acrB.has(w)) && [...acrB].some((w) => !acrA.has(w))) return false;

  const union = new Set([...wordsA, ...wordsB]).size;
  return overlap.length / union >= 0.6;
}
