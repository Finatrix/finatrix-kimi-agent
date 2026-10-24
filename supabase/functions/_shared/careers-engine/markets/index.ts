/**
 * The FinatriX Careers market layer: one set of functions over five market definitions (US, UK, India,
 * Australia, New Zealand). Shared by the Vite app and the Deno edge functions, so it imports nothing from
 * `node:` and nothing from the network.
 *
 * Generalised from the engine's Australian layer. The rules it keeps:
 *  - Unknown stays unknown. Ambiguous text returns `ambiguous`/`unspecified`/null, never a guess.
 *  - Hard evidence (a country, region or market-unique code) beats a foreign word elsewhere in the text;
 *    a city alone loses to positive evidence of somewhere else ("Melbourne, Florida" is not Australia).
 *  - No figure is invented: hourly and daily rates get no annual equivalent, because that would need an
 *    hours assumption; contributions are labelled, never computed.
 */
import { escapeRegExp, foldAscii } from '../util/text.ts';
import { AU } from './au.ts';
import { FOREIGN_POSTFIX_CODES, GENERIC_AGENCY_WORDS, WORLD_PLACES, WORLD_TOKENS } from './common.ts';
import { GB } from './gb.ts';
import { IN, parseIndianSalary } from './in.ts';
import { NZ } from './nz.ts';
import type {
  CareersMarket,
  ContributionKind,
  ContributionTreatment,
  MarketCurrency,
  MarketDef,
  RightsRequirement,
} from './types.ts';
import { US } from './us.ts';

export type {
  CareersMarket,
  ContributionKind,
  ContributionTreatment,
  MarketCurrency,
  MarketDef,
  RightsPattern,
  RightsRequirement,
} from './types.ts';
export { detectEmploymentType, type EmploymentType } from './common.ts';
export { parseIndianSalary } from './in.ts';

export const MARKETS: Readonly<Record<CareersMarket, MarketDef>> = { in: IN, gb: GB, us: US, au: AU, nz: NZ };

/** Every market, in picker order. */
export const CAREERS_MARKETS: readonly MarketDef[] = [IN, GB, US, AU, NZ];

export function isCareersMarket(value: unknown): value is CareersMarket {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(MARKETS, value);
}

/** Map any country spelling the app stores ("GB", "uk", "IN", "usa") to a market, or null. */
export function toCareersMarket(code: string | null | undefined): CareersMarket | null {
  const c = String(code ?? '').trim().toLowerCase();
  if (isCareersMarket(c)) return c;
  if (c === 'uk') return 'gb';
  if (c === 'usa') return 'us';
  return CAREERS_MARKETS.find((m) => m.iso.toLowerCase() === c || m.name.toLowerCase() === c)?.id ?? null;
}

// ── Compiled matchers (built once per market, on first use) ────────────────────────────────────

/** A lowercase phrase as a whole-word pattern: "new south wales" also matches "New  South Wales". */
function phraseSource(phrase: string): string {
  return escapeRegExp(phrase).replace(/ +/g, '\\s+');
}

function phrasesRe(phrases: Iterable<string>, flags = ''): RegExp | null {
  const list = [...new Set(phrases)].filter(Boolean).sort((a, b) => b.length - a.length);
  return list.length ? new RegExp(`(?<![a-z])(?:${list.map(phraseSource).join('|')})(?![a-z])`, flags) : null;
}

function tokensRe(tokens: Iterable<string>, flags = ''): RegExp | null {
  const list = [...new Set(tokens)].filter(Boolean);
  return list.length ? new RegExp(`(?<![A-Za-z])(${list.map(escapeRegExp).join('|')})(?![A-Za-z])`, flags) : null;
}

function postfixRe(codes: Iterable<string>, flags = ''): RegExp | null {
  const list = [...new Set(codes)].filter(Boolean);
  return list.length ? new RegExp(`(?:,|\\s-\\s|-)\\s*(${list.map(escapeRegExp).join('|')})(?![A-Za-z])`, flags) : null;
}

interface Compiled {
  def: MarketDef;
  cities: Array<{ name: string; re: RegExp; region: string; weak: boolean }>;
  regions: Array<{ re: RegExp; region: string }>;
  country: RegExp | null;
  countryToken: RegExp | null;
  strongCodes: RegExp | null;
  weakCodes: RegExp | null;
  postfix: RegExp | null;
  /** Foreign phrases that contain one of this market's names ("new south wales" for "wales"); blanked first. */
  shadow: RegExp | null;
  foreign: RegExp | null;
  foreignToken: RegExp | null;
  foreignPostfix: RegExp | null;
  foreignProvince: RegExp;
  remoteRegion: RegExp | null;
}

const compiledCache = new Map<CareersMarket, Compiled>();

function ownPhrases(def: MarketDef): Set<string> {
  return new Set([...def.countryNames, ...Object.keys(def.regions), ...Object.keys(def.cities), ...def.remoteRegions]);
}

/** Phrases that prove a posting is in `def`: its country, its regions and its unambiguous cities. */
function hardPhrases(def: MarketDef): string[] {
  const weak = new Set(def.weakCities);
  return [...def.countryNames, ...Object.keys(def.regions), ...Object.keys(def.cities).filter((c) => !weak.has(c))];
}

function compile(market: CareersMarket): Compiled {
  const cached = compiledCache.get(market);
  if (cached) return cached;
  const def = MARKETS[market];
  const own = ownPhrases(def);
  const others = CAREERS_MARKETS.filter((m) => m.id !== market);
  const foreignPhrases = [...WORLD_PLACES, ...others.flatMap(hardPhrases)].filter((p) => !own.has(p));
  const ownWord = phrasesRe(own);
  const shadowPhrases = ownWord ? foreignPhrases.filter((p) => ownWord.test(p)) : [];
  const ownUpper = new Set([...def.countryTokens, ...def.remoteRegions.map((r) => r.toUpperCase()), ...def.postfixRegionCodes]);
  const weak = new Set(def.weakCities);

  const compiled: Compiled = {
    def,
    cities: Object.entries(def.cities)
      .sort(([a], [b]) => b.length - a.length)
      .map(([name, region]) => ({ name, re: new RegExp(`(?<![a-z])${phraseSource(name)}(?![a-z])`), region, weak: weak.has(name) })),
    regions: Object.entries(def.regions).map(([name, region]) => ({ re: new RegExp(`(?<![a-z])${phraseSource(name)}(?![a-z])`), region })),
    country: phrasesRe(def.countryNames),
    countryToken: tokensRe(def.countryTokens),
    strongCodes: tokensRe(def.strongRegionCodes, 'g'),
    weakCodes: tokensRe(def.weakRegionCodes, 'g'),
    postfix: postfixRe(def.postfixRegionCodes, 'g'),
    shadow: phrasesRe(shadowPhrases, 'g'),
    foreign: phrasesRe(foreignPhrases),
    foreignToken: tokensRe(
      [...WORLD_TOKENS, ...others.flatMap((m) => m.countryTokens), ...others.flatMap((m) => m.strongRegionCodes)].filter((t) => !ownUpper.has(t)),
    ),
    foreignPostfix: postfixRe(others.flatMap((m) => m.postfixRegionCodes).filter((c) => !ownUpper.has(c))),
    foreignProvince: new RegExp(`,\\s*(?:${FOREIGN_POSTFIX_CODES.join('|')})(?![A-Za-z-])`),
    remoteRegion: phrasesRe(def.remoteRegions),
  };
  compiledCache.set(market, compiled);
  return compiled;
}

// ── Locations ───────────────────────────────────────────────────────────────────────────────────

export interface MarketLocation {
  raw: string;
  market: CareersMarket;
  /** Cities found, title-cased. Empty when the posting is elsewhere. */
  cities: string[];
  /** Region codes from the market definition ("NSW", "CA", "MH"). */
  regions: string[];
  remote: boolean;
  hybrid: boolean;
  /** Text names several places (multi-location posting). */
  multi: boolean;
  /** The posting plausibly sits in this market. */
  inMarket: boolean;
  /** Positive evidence the posting is elsewhere. Never true for unknown places. */
  outside: boolean;
  /** Only weak evidence ("Newcastle", "Perth" for the UK): could be here or overseas. */
  ambiguous: boolean;
  /** The evidence was a country, region name or market-unique code, not just a city. */
  explicit: boolean;
}

function titleCase(s: string): string {
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

export function parseLocation(rawInput: string, market: CareersMarket): MarketLocation {
  const c = compile(market);
  const raw = String(rawInput ?? '').trim();
  const text = foldAscii(raw);
  const lower = text.toLowerCase();
  // Own names inside foreign names ("wales" in "New South Wales") must not count for this market.
  const ownLower = c.shadow ? lower.replace(c.shadow, ' ') : lower;

  const strongCities: string[] = [];
  const weakCities: string[] = [];
  const strongRegions = new Set<string>();
  const weakRegions = new Set<string>();

  let working = ownLower;
  for (const city of c.cities) {
    if (!city.re.test(working)) continue;
    const display = titleCase(city.name.replace(/ (?:vic|cbd)$/, ''));
    const bucket = city.weak ? weakCities : strongCities;
    if (!bucket.includes(display)) bucket.push(display);
    (city.weak ? weakRegions : strongRegions).add(city.region);
    working = working.replace(city.re, ' ');
  }
  let regionNamed = false;
  for (const { re, region } of c.regions) {
    if (re.test(ownLower)) {
      strongRegions.add(region);
      regionNamed = true;
    }
  }
  let strongCode = false;
  if (c.strongCodes) for (const m of text.matchAll(c.strongCodes)) { strongRegions.add(m[1]!); strongCode = true; }
  if (c.weakCodes) for (const m of text.matchAll(c.weakCodes)) weakRegions.add(m[1]!);
  let postfixCode = false;
  if (c.postfix) for (const m of text.matchAll(c.postfix)) { strongRegions.add(m[1]!); postfixCode = true; }

  const remote = /\bremote\b|work from home|\bwfh\b|fully remote/i.test(text);
  const hybrid = /\bhybrid\b/i.test(text);
  const explicit = (c.country?.test(ownLower) ?? false) || (c.countryToken?.test(text) ?? false) || regionNamed || strongCode;
  const foreign =
    (c.foreign?.test(lower) ?? false) ||
    (c.foreignToken?.test(text) ?? false) ||
    (c.foreignPostfix?.test(text) ?? false) ||
    c.foreignProvince.test(text);

  let inMarket = false;
  let outside = false;
  let ambiguous = false;
  if (explicit) inMarket = true;
  else if (foreign) outside = true;
  else if (postfixCode || strongCities.length > 0) inMarket = true;
  else if (weakCities.length > 0 || weakRegions.size > 0) ambiguous = true;
  if (!inMarket && !outside && remote && c.remoteRegion?.test(lower)) inMarket = true;

  const keepWeak = inMarket || ambiguous;
  const cities = outside ? [] : [...strongCities, ...(keepWeak ? weakCities : [])];
  const regions = outside ? [] : [...new Set([...strongRegions, ...(keepWeak ? weakRegions : [])])];
  const multi = Math.max(cities.length, regions.length) > 1 || /;|·|\||\bmultiple locations?\b|\b\d+\s+locations?\b/i.test(raw);
  return { raw, market, cities, regions, remote, hybrid, multi, inMarket, outside, ambiguous, explicit };
}

/**
 * The one market a location sits in, or null when it sits in none, several, or only ambiguously.
 * Used at ingest time, when a posting arrives without a country.
 */
export function detectMarket(raw: string): CareersMarket | null {
  const hits = CAREERS_MARKETS.map((m) => parseLocation(raw, m.id)).filter((l) => l.inMarket);
  if (hits.length === 1) return hits[0]!.market;
  const explicit = hits.filter((l) => l.explicit);
  return explicit.length === 1 ? explicit[0]!.market : null;
}

// ── Salary ──────────────────────────────────────────────────────────────────────────────────────

export type SalaryPeriod = 'hour' | 'day' | 'week' | 'month' | 'year';
export type SalaryCurrency = MarketCurrency | 'EUR';

export interface SalaryParse {
  raw: string;
  currency: SalaryCurrency;
  min: number;
  max: number;
  period: SalaryPeriod;
  /** The period was inferred from magnitude rather than stated. */
  periodInferred: boolean;
  /** How the figure treats the market's contribution (super, KiwiSaver, pension, PF); null where none is quoted. */
  contribution: { kind: ContributionKind; treatment: ContributionTreatment } | null;
  /** Exact annual equivalents of yearly, monthly and weekly figures; null for hourly and daily rates. */
  annualMin: number | null;
  annualMax: number | null;
}

const MONEY = String.raw`(?:NZ\$|A\$|AU\$|US\$|C\$|S\$|\$|£|€|₹|\bRs\.?\s?|\bINR\s?|\bUSD\s?|\bGBP\s?|\bAUD\s?|\bNZD\s?|\bEUR\s?)`;
const AMOUNT = String.raw`(\d[\d,]*(?:\.\d+)?)\s?([km])?\b`;
const RANGE_RE = new RegExp(`${MONEY}\\s?${AMOUNT}\\s?(?:-|–|—|to)\\s?${MONEY}?\\s?${AMOUNT}`, 'i');
const SINGLE_RE = new RegExp(`${MONEY}\\s?${AMOUNT}`, 'i');
const INDIAN_SHORTHAND_RE = /(?:₹\s*)?[\d,.]+\s*(?:(?:-|to|–)\s*[\d,.]+\s*)?(?:lpa|lakhs?|l\b|cr\b|crores?)/i;

function detectCurrency(window: string, def: MarketDef): SalaryCurrency {
  if (/\bNZ\$|\bNZD\b/i.test(window)) return 'NZD';
  if (/\bA\$|\bAU\$|\bAUD\b/i.test(window)) return 'AUD';
  if (/\bUS\$|\bUSD\b/i.test(window)) return 'USD';
  if (/£|\bGBP\b/i.test(window)) return 'GBP';
  if (/€|\bEUR\b/i.test(window)) return 'EUR';
  if (/₹|\bRs\.?(?=\s?\d)|\bINR\b/i.test(window)) return 'INR';
  return def.salary.bareDollar ? def.currency : 'USD';
}

function detectPeriod(text: string): SalaryPeriod | null {
  if (/(?:per|an?|\/|p\.?)\s?(?:hour|hr|h)\b|\bhourly\b|\bp\.?h\.?\b/i.test(text)) return 'hour';
  if (/(?:per|a|\/|p\.?)\s?(?:day|d)\b|\bdaily\b|\bday rate\b|\bp\.?d\.?\b/i.test(text)) return 'day';
  if (/(?:per|a|\/)\s?week\b|\bweekly\b|\bp\.?w\.?\b/i.test(text)) return 'week';
  if (/(?:per|a|\/)\s?month\b|\bmonthly\b/i.test(text)) return 'month';
  if (/(?:per|a|\/)\s?(?:annum|year|yr)\b|\bp\.?a\.?\b|\bannual(?:ly)?\b|\bpackage\b|\bsalary\b|\bctc\b/i.test(text)) return 'year';
  return null;
}

function detectContribution(window: string, def: MarketDef): SalaryParse['contribution'] {
  const rule = def.salary.contribution;
  if (!rule) return null;
  const hit = rule.rules.find((r) => r.re.test(window));
  return { kind: rule.kind, treatment: hit ? hit.treatment : 'unknown' };
}

function amount(num: string, suffix?: string): number {
  const base = Number(num.replace(/,/g, ''));
  const s = (suffix ?? '').toLowerCase();
  return s === 'k' ? base * 1_000 : s === 'm' ? base * 1_000_000 : base;
}

const ANNUAL_FACTOR: Record<SalaryPeriod, number | null> = { hour: null, day: null, week: 52, month: 12, year: 1 };

/** Exact annual equivalent of a yearly, monthly or weekly figure; null for hourly and daily rates or no figure. */
export function annualEquivalent(value: number | null | undefined, period: string | null | undefined): number | null {
  if (value == null || !(value > 0) || !period || !Object.prototype.hasOwnProperty.call(ANNUAL_FACTOR, period)) return null;
  const factor = ANNUAL_FACTOR[period as SalaryPeriod];
  return factor === null ? null : Math.round(value * factor);
}

/** Extract one salary from free text. Returns null when no money figure is present or its period is unclear. */
export function parseSalary(textInput: string, market: CareersMarket): SalaryParse | null {
  const def = MARKETS[market];
  const text = String(textInput ?? '');

  if (market === 'in') {
    const shorthand = INDIAN_SHORTHAND_RE.exec(text);
    if (shorthand) {
      const { min, max } = parseIndianSalary(text);
      if (min && max) {
        const window = text.slice(Math.max(0, shorthand.index - 40), shorthand.index + shorthand[0].length + 60);
        return {
          raw: shorthand[0].trim(),
          currency: 'INR',
          min: Math.min(min, max),
          max: Math.max(min, max),
          period: 'year',
          periodInferred: false,
          contribution: detectContribution(window, def),
          annualMin: Math.min(min, max),
          annualMax: Math.max(min, max),
        };
      }
    }
  }

  let min: number;
  let max: number;
  let match: RegExpExecArray;
  const range = RANGE_RE.exec(text);
  if (range) {
    let suffixA = range[2];
    const suffixB = range[4];
    // "80-90k" means both figures are thousands.
    if (!suffixA && suffixB && Number(range[1]!.replace(/,/g, '')) < 1000) suffixA = suffixB;
    min = amount(range[1]!, suffixA);
    max = amount(range[3]!, suffixB);
    match = range;
  } else {
    const single = SINGLE_RE.exec(text);
    if (!single) return null;
    min = max = amount(single[1]!, single[2]);
    match = single;
  }
  if (min > max) [min, max] = [max, min];
  if (!(max > 0)) return null;

  const window = text.slice(Math.max(0, match.index - 40), match.index + match[0].length + 60);
  let period = detectPeriod(window);
  let periodInferred = false;
  if (!period) {
    periodInferred = true;
    if (def.salary.inferHourBelow !== null && max < def.salary.inferHourBelow) period = 'hour';
    else if (max >= def.salary.inferYearFrom) period = 'year';
    else return null; // a mid-sized figure with no period is genuinely ambiguous (day rate? weekly? monthly?)
  }
  const factor = ANNUAL_FACTOR[period];
  return {
    raw: match[0].trim(),
    currency: detectCurrency(window, def),
    min,
    max,
    period,
    periodInferred,
    contribution: detectContribution(window, def),
    annualMin: factor === null ? null : Math.round(min * factor),
    annualMax: factor === null ? null : Math.round(max * factor),
  };
}

// ── Work rights (detect and show) ───────────────────────────────────────────────────────────────

export interface WorkRightsSignal {
  /** Strictest requirement found. */
  requirement: RightsRequirement;
  /** Every distinct requirement found, so a card can show "No sponsorship" and "Work rights required". */
  all: RightsRequirement[];
  /** Highest clearance level named, as a level id of the market. */
  clearance?: string;
  /** Verbatim snippets that triggered each signal. */
  evidence: string[];
}

const STRICTNESS: RightsRequirement[] = [
  'citizen_only', 'clearance_required', 'citizen_or_pr', 'no_sponsorship', 'work_rights_required', 'sponsorship_available', 'unspecified',
];

const NEGATION_BEFORE_RE = /\b(?:no|not|never|without|unable|cannot|can't|won't|don't|doesn't|unavailable)\b[^.\n]{0,30}$/i;

function snippet(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 30);
  return text.slice(start, Math.min(text.length, index + length + 30)).replace(/\s+/g, ' ').trim();
}

/** Screen posting text for citizenship, permanent-status, clearance and sponsorship language. */
export function detectWorkRights(textInput: string, market: CareersMarket): WorkRightsSignal {
  const def = MARKETS[market];
  const text = String(textInput ?? '');
  const order = def.clearanceLevels.map((l) => l.id);
  const found = new Set<RightsRequirement>();
  const evidence: string[] = [];
  let clearance: string | undefined;
  for (const { re, kind, clearance: level } of def.rights) {
    const m = re.exec(text);
    if (!m) continue;
    // "No sponsorship provided" must not also read as "sponsorship provided".
    if (kind === 'sponsorship_available' && NEGATION_BEFORE_RE.test(text.slice(Math.max(0, m.index - 40), m.index + m[0].length))) continue;
    found.add(kind);
    evidence.push(snippet(text, m.index, m[0].length));
    if (level && (!clearance || order.indexOf(level) > order.indexOf(clearance))) clearance = level;
  }
  const all = STRICTNESS.filter((k) => found.has(k));
  return { requirement: all[0] ?? 'unspecified', all: all.length ? all : ['unspecified'], ...(clearance ? { clearance } : {}), evidence };
}

/** Card wording for a signal ("SC clearance required", "Citizens or green card holders"). */
export function rightsLabel(signal: Pick<WorkRightsSignal, 'requirement' | 'clearance'>, market: CareersMarket): string {
  const def = MARKETS[market];
  if (signal.requirement === 'clearance_required' && signal.clearance) {
    const level = def.clearanceLevels.find((l) => l.id === signal.clearance);
    if (level) return `${level.label} clearance required`;
  }
  return def.rightsLabels[signal.requirement];
}

/** What the user declares about themselves, per market. Never inferred. */
export type DeclaredRights = 'citizen' | 'permanent' | 'unrestricted_visa' | 'needs_sponsorship';

export type RightsFit = 'meets' | 'does_not_meet' | 'check' | 'unknown';

const FIT_RANK: Record<RightsFit, number> = { does_not_meet: 3, check: 2, unknown: 1, meets: 0 };

function fitFor(requirement: RightsRequirement, declared: DeclaredRights): RightsFit {
  switch (requirement) {
    case 'citizen_only':
      return declared === 'citizen' ? 'meets' : 'does_not_meet';
    case 'citizen_or_pr':
      return declared === 'citizen' || declared === 'permanent' ? 'meets' : 'does_not_meet';
    case 'clearance_required':
      return 'check'; // we never know who holds a clearance
    case 'work_rights_required':
    case 'no_sponsorship':
      return declared === 'needs_sponsorship' ? 'does_not_meet' : 'meets';
    case 'sponsorship_available':
      return 'meets';
    case 'unspecified':
      return declared === 'needs_sponsorship' ? 'check' : 'meets';
  }
}

/**
 * Compare a posting's stated requirements with what the user declared. This is a reading of the posting,
 * not advice about eligibility: the result says whether the stated wording fits the stated status.
 */
export function compareRights(signal: Pick<WorkRightsSignal, 'all'>, declared: DeclaredRights | null | undefined): RightsFit {
  if (!declared) return 'unknown';
  return signal.all.map((k) => fitFor(k, declared)).reduce<RightsFit>((worst, f) => (FIT_RANK[f] > FIT_RANK[worst] ? f : worst), 'meets');
}

// ── Agencies (advisory) ─────────────────────────────────────────────────────────────────────────

const agencyCache = new Map<string, RegExp>();

/**
 * Advisory only: the name looks like a recruitment agency. Agencies post for unnamed clients, so the real
 * employer and its sponsorship stance are unknown until the client is revealed.
 */
export function isLikelyAgency(company: string | null | undefined, market?: CareersMarket): boolean {
  const name = String(company ?? '').trim();
  if (!name) return false;
  const key = market ?? '*';
  let re = agencyCache.get(key);
  if (!re) {
    const names = [...GENERIC_AGENCY_WORDS, ...(market ? MARKETS[market].agencies : CAREERS_MARKETS.flatMap((m) => m.agencies))];
    re = phrasesRe(names, 'i')!;
    agencyCache.set(key, re);
  }
  return re.test(name.toLowerCase());
}
