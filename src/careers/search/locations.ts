/**
 * Phase 2.1 — Location Intelligence (pipeline stage: location hierarchy).
 * Country → state → city → metro localities → remote. India-first: every
 * major metro knows its IT corridors and satellite towns, so "Chennai"
 * accepts OMR/Guindy/Sholinganallur postings and rejects Bengaluru ones,
 * and a country gate guarantees an India search never shows UK jobs.
 */

import { containsTerm } from './taxonomy';

export interface CityDef {
  /** Canonical city name (lowercase). */
  city: string;
  /** ISO country code (lowercase). */
  country: string;
  state: string;
  /** Alternate names, localities, corridors, satellite towns (lowercase). */
  aliases: string[];
}

export const CITIES: CityDef[] = [
  {
    city: 'chennai', country: 'in', state: 'tamil nadu',
    aliases: [
      'madras', 'omr', 'old mahabalipuram road', 'guindy', 'velachery', 'taramani',
      'perungudi', 'sholinganallur', 'siruseri', 'ambattur', 'anna nagar',
      'thoraipakkam', 'porur', 'nungambakkam', 't nagar', 'egmore', 'mount road',
      'tidel park', 'dlf it park', 'navalur', 'kelambakkam', 'pallavaram', 'tambaram',
      'adyar', 'mylapore', 'teynampet', 'kilpauk', 'vadapalani', 'chromepet',
    ],
  },
  {
    city: 'bengaluru', country: 'in', state: 'karnataka',
    aliases: [
      'bangalore', 'bangaluru', 'whitefield', 'electronic city', 'electronics city',
      'koramangala', 'hsr layout', 'indiranagar', 'marathahalli', 'bellandur',
      'sarjapur', 'manyata', 'hebbal', 'jayanagar', 'jp nagar', 'btm layout',
      'outer ring road', 'yelahanka', 'bagmane', 'embassy tech village', 'itpl', 'mg road',
    ],
  },
  {
    city: 'mumbai', country: 'in', state: 'maharashtra',
    aliases: [
      'bombay', 'navi mumbai', 'thane', 'andheri', 'bandra', 'bkc',
      'bandra kurla complex', 'powai', 'lower parel', 'worli', 'goregaon',
      'malad', 'vikhroli', 'airoli', 'vashi', 'ghansoli', 'kurla', 'churchgate',
      'nariman point', 'fort', 'dadar', 'borivali', 'kalyan', 'mira road',
    ],
  },
  {
    city: 'hyderabad', country: 'in', state: 'telangana',
    aliases: [
      'secunderabad', 'hitec city', 'hitech city', 'gachibowli', 'madhapur',
      'kondapur', 'financial district', 'nanakramguda', 'kukatpally', 'begumpet',
      'banjara hills', 'jubilee hills', 'raidurg', 'kokapet', 'uppal', 'pocharam',
    ],
  },
  {
    city: 'pune', country: 'in', state: 'maharashtra',
    aliases: [
      'hinjewadi', 'hinjawadi', 'kharadi', 'magarpatta', 'hadapsar', 'baner',
      'aundh', 'viman nagar', 'yerwada', 'yerawada', 'wakad', 'pimpri', 'chinchwad',
      'pimpri-chinchwad', 'kalyani nagar', 'shivajinagar', 'talawade', 'balewadi',
    ],
  },
  {
    city: 'delhi', country: 'in', state: 'delhi',
    aliases: [
      'new delhi', 'delhi ncr', 'ncr', 'gurgaon', 'gurugram', 'noida', 'greater noida',
      'faridabad', 'ghaziabad', 'cyber city', 'cybercity', 'connaught place',
      'saket', 'nehru place', 'okhla', 'dwarka', 'manesar', 'sector 62',
    ],
  },
  {
    city: 'kolkata', country: 'in', state: 'west bengal',
    aliases: ['calcutta', 'salt lake', 'sector v', 'new town', 'rajarhat', 'howrah', 'park street'],
  },
  {
    city: 'ahmedabad', country: 'in', state: 'gujarat',
    aliases: ['gandhinagar', 'gift city', 'sg highway', 'prahlad nagar'],
  },
  {
    city: 'kochi', country: 'in', state: 'kerala',
    aliases: ['cochin', 'infopark', 'kakkanad', 'ernakulam'],
  },
  {
    city: 'coimbatore', country: 'in', state: 'tamil nadu',
    aliases: ['kovai', 'tidel park coimbatore', 'saravanampatti'],
  },
  {
    city: 'jaipur', country: 'in', state: 'rajasthan',
    aliases: ['sitapura', 'malviya nagar jaipur'],
  },
  {
    city: 'chandigarh', country: 'in', state: 'punjab',
    aliases: ['mohali', 'panchkula', 'zirakpur'],
  },
  {
    city: 'thiruvananthapuram', country: 'in', state: 'kerala',
    aliases: ['trivandrum', 'technopark'],
  },
  {
    city: 'indore', country: 'in', state: 'madhya pradesh',
    aliases: ['vijay nagar indore'],
  },
  // A few non-India metros so other countries keep working.
  { city: 'london', country: 'gb', state: 'england', aliases: ['canary wharf', 'city of london', 'greater london'] },
  { city: 'manchester', country: 'gb', state: 'england', aliases: ['greater manchester'] },
  { city: 'new york', country: 'us', state: 'new york', aliases: ['nyc', 'manhattan', 'brooklyn'] },
  { city: 'san francisco', country: 'us', state: 'california', aliases: ['sf', 'bay area', 'south san francisco'] },
  { city: 'sydney', country: 'au', state: 'new south wales', aliases: ['parramatta', 'north sydney'] },
  { city: 'melbourne', country: 'au', state: 'victoria', aliases: ['docklands', 'southbank'] },
  { city: 'singapore', country: 'sg', state: '', aliases: ['raffles place', 'changi', 'jurong'] },
  { city: 'dubai', country: 'ae', state: 'dubai', aliases: ['difc', 'business bay', 'jlt', 'dubai internet city'] },
  { city: 'abu dhabi', country: 'ae', state: 'abu dhabi', aliases: ['adgm'] },
];

export const COUNTRY_NAMES: Record<string, string[]> = {
  in: ['india', 'bharat', 'pan india'],
  gb: ['united kingdom', 'uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland'],
  us: ['united states', 'usa', 'us', 'america', 'united states of america'],
  au: ['australia'],
  sg: ['singapore'],
  ae: ['united arab emirates', 'uae', 'dubai', 'abu dhabi', 'sharjah'],
  ca: ['canada'],
  de: ['germany', 'deutschland'],
};

/** Resolve the metro a user typed ("Bangalore", "Gurgaon") to its city def. */
export function resolveCity(input: string): CityDef | null {
  const q = input.trim().toLowerCase();
  if (!q) return null;
  for (const def of CITIES) {
    if (def.city === q || containsTerm(q, def.city)) return def;
    for (const alias of def.aliases) {
      if (alias === q || (q.length > 3 && containsTerm(q, alias))) return def;
    }
  }
  return null;
}

/** All names that count as "in this city" (city + aliases + state). */
export function cityMatchTerms(def: CityDef): string[] {
  return [def.city, ...def.aliases];
}

export type LocationVerdict = 'match' | 'nearby' | 'remote' | 'unknown' | 'mismatch';

/**
 * Does a job's location text satisfy the searched city/country?
 * - `match`   — job names the city or one of its localities
 * - `nearby`  — job is in the same state, or a bare country-wide posting
 * - `remote`  — remote job usable from anywhere in the country
 * - `unknown` — provider gave no usable location (kept, flagged)
 * - `mismatch`— names a different known city/country
 */
export function locationVerdict(
  jobLocation: string,
  jobCountry: string,
  jobWorkMode: string,
  wantedCity: string,
  wantedCountry: string
): LocationVerdict {
  const loc = jobLocation.trim().toLowerCase();
  const jc = jobCountry.trim().toLowerCase();
  const wc = wantedCountry.trim().toLowerCase();

  // Country gate first — a hard mismatch is fatal regardless of city.
  if (wc && jc && jc.length === 2 && jc !== wc) {
    return jobWorkMode === 'remote' ? 'remote' : 'mismatch';
  }
  const countryNames = COUNTRY_NAMES[wc] ?? [];
  const otherCountry = Object.entries(COUNTRY_NAMES).some(
    ([code, names]) => code !== wc && names.some((n) => n.length > 2 && containsTerm(loc, n))
  );

  const city = resolveCity(wantedCity);
  if (!city) {
    // No city filter — only the country matters.
    if (otherCountry && !(jc && jc === wc)) return jobWorkMode === 'remote' ? 'remote' : 'mismatch';
    return loc || jc ? 'match' : 'unknown';
  }

  if (!loc) return jobWorkMode === 'remote' ? 'remote' : 'unknown';

  for (const term of cityMatchTerms(city)) {
    if (containsTerm(loc, term)) return 'match';
  }
  if (city.state && containsTerm(loc, city.state)) return 'nearby';

  // A different known city in the same country ⇒ mismatch.
  for (const def of CITIES) {
    if (def.city === city.city) continue;
    if (containsTerm(loc, def.city)) {
      return jobWorkMode === 'remote' ? 'remote' : 'mismatch';
    }
  }
  if (jobWorkMode === 'remote') return 'remote';
  // Country-wide posting ("India", "PAN India") counts as nearby.
  if (countryNames.some((n) => containsTerm(loc, n))) return 'nearby';
  if (otherCountry) return 'mismatch';
  return 'unknown';
}

// ─────────────────────────── India salary formats ───────────────────────────

/**
 * Parse Indian salary shorthand out of free text: "12 LPA", "8-12 lakhs",
 * "₹15,00,000", "1.2 Cr", "CTC 10L". Returns yearly INR or null.
 */
export function parseIndianSalary(text: string): { min: number | null; max: number | null } {
  const m = /(?:₹\s*)?([\d,.]+)\s*(?:-|to|–)\s*([\d,.]+)\s*(lpa|lakhs?|l\b|cr|crores?)/i.exec(text);
  const single = /(?:₹\s*)?([\d,.]+)\s*(lpa|lakhs?|l\b|cr|crores?)/i.exec(text);
  const unitMult = (u: string) => (/^cr/i.test(u) ? 10_000_000 : 100_000);
  const parse = (s: string) => {
    const n = Number(s.replace(/,/g, ''));
    return Number.isFinite(n) && n > 0 ? n : null;
  };
  if (m) {
    const mult = unitMult(m[3]);
    const lo = parse(m[1]);
    const hi = parse(m[2]);
    return { min: lo ? lo * mult : null, max: hi ? hi * mult : null };
  }
  if (single) {
    const v = parse(single[1]);
    const mult = unitMult(single[2]);
    return { min: v ? v * mult : null, max: v ? v * mult : null };
  }
  return { min: null, max: null };
}
