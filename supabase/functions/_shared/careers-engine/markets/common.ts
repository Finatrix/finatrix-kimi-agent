/**
 * Shared vocabulary for every market: places outside all five markets, work-rights phrasing that
 * reads the same everywhere, agency words and employment types.
 *
 * Adapted from the Australian layer of @finatrix/careers-engine (its NON_AU_PLACES, RIGHTS_PATTERNS
 * and detectEmploymentType), generalised so each market supplies only what is specific to it.
 */
import type { RightsPattern } from './types.ts';

/**
 * Countries, regions and cities outside all five markets that turn up on multinational boards.
 * Places inside a market live in that market's definition, which also makes them foreign evidence
 * for every other market.
 */
export const WORLD_PLACES = [
  'canada', 'ireland', 'singapore', 'china', 'hong kong', 'japan', 'korea', 'taiwan', 'philippines', 'malaysia',
  'indonesia', 'vietnam', 'thailand', 'germany', 'france', 'spain', 'italy', 'netherlands', 'switzerland', 'sweden',
  'norway', 'denmark', 'finland', 'poland', 'israel', 'brazil', 'mexico', 'argentina', 'chile', 'peru', 'south africa',
  'nigeria', 'kenya', 'egypt', 'united arab emirates', 'saudi arabia', 'qatar', 'bahrain', 'oman', 'kuwait', 'turkey',
  'ukraine', 'romania', 'hungary', 'czechia', 'czech republic', 'greece', 'portugal', 'belgium', 'austria',
  'luxembourg', 'estonia', 'lithuania', 'latvia', 'serbia', 'croatia', 'bulgaria', 'pakistan', 'bangladesh',
  'sri lanka', 'nepal', 'colombia', 'costa rica', 'latin america', 'europe', 'north america', 'americas',
  // Canadian provinces
  'ontario', 'quebec', 'british columbia', 'alberta', 'manitoba', 'saskatchewan', 'nova scotia', 'new brunswick',
  'newfoundland',
  // cities
  'toronto', 'vancouver', 'montreal', 'ottawa', 'calgary', 'dublin', 'cork', 'paris', 'berlin', 'munich', 'hamburg',
  'frankfurt', 'amsterdam', 'rotterdam', 'madrid', 'barcelona', 'lisbon', 'milan', 'rome', 'zurich', 'geneva',
  'stockholm', 'copenhagen', 'oslo', 'helsinki', 'warsaw', 'krakow', 'prague', 'budapest', 'bucharest', 'vienna',
  'brussels', 'tel aviv', 'dubai', 'abu dhabi', 'riyadh', 'doha', 'karachi', 'lahore', 'islamabad', 'dhaka', 'colombo',
  'kathmandu', 'kuala lumpur', 'jakarta', 'manila', 'bangkok', 'ho chi minh', 'hanoi', 'shenzhen', 'shanghai',
  'beijing', 'taipei', 'seoul', 'tokyo', 'osaka', 'johannesburg', 'cape town', 'nairobi', 'lagos', 'cairo',
  'sao paulo', 'mexico city', 'buenos aires', 'bogota', 'santiago', 'lima',
];

/** Case-sensitive standalone tokens that name somewhere outside the market ("Remote - EMEA"). */
export const WORLD_TOKENS = ['UAE', 'EMEA', 'LATAM', 'APAC', 'APJ', 'ANZ', 'SG', 'IE'];

/** Canadian province codes after a comma ("Toronto, ON"); a trailing hyphen makes "ON-SITE" a work mode. */
export const FOREIGN_POSTFIX_CODES = ['BC', 'AB', 'MB', 'SK', 'ON', 'QC', 'NB', 'NS', 'NL', 'PE'];

interface RightsVocab {
  /** Regex source for the demonym or country adjective ("australian", "u\\.?s\\.?|american"). */
  adj: string;
  /** Regex source for the country as it follows "work in" ("australia", "the u\\.?s\\.?|the united states"). */
  country: string;
  /** Regex source for permanent status ("permanent residents?|pr", "green card holders?"). */
  permanent: string;
}

/** Citizenship, permanent-status and work-rights phrasing built from a market's vocabulary. */
export function citizenshipPatterns({ adj, country, permanent }: RightsVocab): RightsPattern[] {
  return [
    { re: new RegExp(`\\b(?:${adj}) (?:citizens?|nationals?)\\s+only\\b`, 'i'), kind: 'citizen_only' },
    { re: new RegExp(`\\bmust be an? (?:${adj}) (?:citizen|national)\\b(?!\\s+(?:or|and))`, 'i'), kind: 'citizen_only' },
    {
      re: new RegExp(`\\b(?:open|available|restricted|limited) to (?:${adj}) (?:citizens?|nationals?)\\b(?!\\s+(?:or|and))`, 'i'),
      kind: 'citizen_only',
    },
    {
      re: new RegExp(`\\b(?:${adj}) citizenship\\s+(?:is\\s+)?(?:required|mandatory|essential|a requirement)\\b`, 'i'),
      kind: 'citizen_only',
    },
    {
      re: new RegExp(`\\b(?:${adj}) (?:citizens?|citizenship|nationals?) (?:or|and|\\/) (?:${permanent})\\b`, 'i'),
      kind: 'citizen_or_pr',
    },
    { re: new RegExp(`\\bcitizens? (?:and|or|\\/) (?:${permanent})\\b`, 'i'), kind: 'citizen_or_pr' },
    { re: new RegExp(`\\b(?:${permanent})\\s+(?:is\\s+|status\\s+)?(?:required|mandatory|essential)\\b`, 'i'), kind: 'citizen_or_pr' },
    { re: new RegExp(`\\b(?:${permanent})(?: holders?)? only\\b`, 'i'), kind: 'citizen_or_pr' },
    {
      re: new RegExp(
        `\\b(?:full|unrestricted|valid|current|ongoing)\\s+(?:(?:${adj})\\s+)?(?:work(?:ing)?\\s+rights|right to work|work authori[sz]ation|work permit)\\b`,
        'i',
      ),
      kind: 'work_rights_required',
    },
    {
      re: new RegExp(
        `\\b(?:right|eligib(?:le|ility)|entitled|authori[sz]ed|legally (?:entitled|eligible|able|authori[sz]ed)) to work in (?:${country})\\b|\\bwork rights in (?:${country})\\b`,
        'i',
      ),
      kind: 'work_rights_required',
    },
  ];
}

/** Phrasing that reads the same in every market. `visas` is the market's visa vocabulary for sponsorship. */
export function genericRightsPatterns(visas: string): RightsPattern[] {
  return [
    { re: /\bcitizenship\s+(?:is\s+)?(?:required|mandatory|essential)\b/i, kind: 'citizen_only' },
    { re: /\bpermanent residen(?:t|cy)\s+(?:is\s+)?(?:required|mandatory|essential)\b/i, kind: 'citizen_or_pr' },
    { re: /\b(?:pr|permanent resident) holders? only\b/i, kind: 'citizen_or_pr' },
    {
      re: /\bsecurity clearance\b.{0,40}\b(?:required|essential|must)\b|\b(?:must|ability to)\b.{0,40}\b(?:obtain|hold|maintain)\b.{0,30}\b(?:security )?clearance\b/i,
      kind: 'clearance_required',
    },
    {
      re: /\bwork(?:ing)?\s+(?:rights|authori[sz]ation)\s+(?:are\s+|is\s+)?(?:required|essential|mandatory|a requirement)\b|\bmust\s+(?:have|hold)\s+(?:\w+\s+){0,2}work(?:ing)?\s+(?:rights|authori[sz]ation)\b/i,
      kind: 'work_rights_required',
    },
    {
      re: /\b(?:no|not)\b[^.\n]{0,40}\b(?:visa )?sponsorship\b|\bsponsorship\s+(?:is\s+)?(?:not|un)\s*(?:available|offered|provided)\b|\bwithout\s+(?:the need for\s+)?(?:current or future\s+|present or future\s+)?(?:visa\s+|employer\s+)?sponsorship\b|\b(?:unable|cannot|can't|do not|don't|will not|won't)\s+(?:to\s+)?(?:offer|provide|sponsor|support)\b[^.\n]{0,30}\b(?:visa|sponsorship|sponsor)/i,
      kind: 'no_sponsorship',
    },
    {
      re: new RegExp(
        `\\b(?:(?:${visas}) )?sponsorship\\s+(?:is\\s+)?(?:available|offered|provided|may be (?:available|considered))\\b|\\b(?:we|company)\\s+(?:can|will|may)\\s+(?:offer|provide|consider|support)\\s+(?:(?:${visas})\\s+)?sponsorship\\b|\\bsponsor(?:ship)?\\s+(?:for\\s+)?(?:a\\s+|an\\s+)?(?:${visas})\\b`,
        'i',
      ),
      kind: 'sponsorship_available',
    },
  ];
}

/** Words that mark a recruitment agency in any market. */
export const GENERIC_AGENCY_WORDS = [
  'recruitment', 'recruiters', 'recruiting', 'staffing', 'search & selection', 'executive search', 'labour hire',
  'labor hire', 'workforce solutions', 'resourcing', 'people & culture solutions', 'placements',
];

export type EmploymentType =
  | 'permanent'
  | 'fixed_term'
  | 'contract'
  | 'casual'
  | 'part_time'
  | 'internship'
  | 'graduate'
  | 'unknown';

/** Employment type from posting text. Market terms (W-2, C2C, IR35, FTC, casual) read the same wherever they appear. */
export function detectEmploymentType(text: string): EmploymentType {
  const t = String(text ?? '');
  if (/\bintern(ship)?\b|\bvacation(?:er)?\s+program/i.test(t)) return 'internship';
  if (/\bgraduate\s+(?:program|programme|scheme|role|analyst)|\bgrad\s+program|\bfreshers?\b/i.test(t)) return 'graduate';
  if (/\bfixed[- ]term\b|\bFTC\b|\b\d+[- ]month (?:contract|term)\b|\bmaximum[- ]term\b|\bmat(?:ernity)? leave cover\b/i.test(t)) {
    return 'fixed_term';
  }
  if (/\bcasual\b/i.test(t)) return 'casual';
  if (/\bcontract(?:or)?\b|\bday rate\b|\btemp(?:orary)?\b|\bW-?2\b|\b1099\b|\bC2C\b|\bcorp[- ]to[- ]corp\b|\bIR35\b|\binterim\b/i.test(t)) {
    return 'contract';
  }
  if (/\bpart[- ]time\b/i.test(t)) return 'part_time';
  if (/\bpermanent\b|\bfull[- ]time\b|\bongoing\b/i.test(t)) return 'permanent';
  return 'unknown';
}
