/**
 * United States. State codes count only after a comma or dash ("Austin, TX"), and codes that are also words
 * or other markets' regions (WA, IN, OR, ME, OK, HI, ID) are left out so "Perth, WA" never reads as Washington.
 */
import { citizenshipPatterns, genericRightsPatterns } from './common.ts';
import type { MarketDef } from './types.ts';

export const US: MarketDef = {
  id: 'us',
  iso: 'US',
  name: 'United States',
  currency: 'USD',

  countryNames: ['united states', 'united states of america', 'u.s.a.', 'u.s.'],
  countryTokens: ['US', 'USA'],
  regions: {
    alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO', connecticut: 'CT',
    delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
    kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI',
    minnesota: 'MN', mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
    'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
    'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI',
    'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
    virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI', wyoming: 'WY',
    'district of columbia': 'DC', 'washington dc': 'DC', 'washington d.c.': 'DC', 'puerto rico': 'PR',
  },
  strongRegionCodes: [],
  weakRegionCodes: [],
  postfixRegionCodes: [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'FL', 'GA', 'IL', 'IA', 'KS', 'KY', 'LA', 'MD', 'MA', 'MI', 'MN', 'MS',
    'MO', 'MT', 'NE', 'NV', 'NH', 'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT', 'VA',
    'WV', 'WI', 'WY', 'DC',
  ],
  cities: {
    'new york city': 'NY', nyc: 'NY', manhattan: 'NY', brooklyn: 'NY', 'san francisco': 'CA', 'bay area': 'CA',
    'los angeles': 'CA', 'san diego': 'CA', 'san jose': 'CA', 'palo alto': 'CA', 'mountain view': 'CA',
    'menlo park': 'CA', sunnyvale: 'CA', 'santa clara': 'CA', oakland: 'CA', irvine: 'CA', sacramento: 'CA',
    chicago: 'IL', boston: 'MA', seattle: 'WA', redmond: 'WA', bellevue: 'WA', austin: 'TX', dallas: 'TX',
    houston: 'TX', 'san antonio': 'TX', 'fort worth': 'TX', atlanta: 'GA', denver: 'CO', boulder: 'CO', miami: 'FL',
    tampa: 'FL', orlando: 'FL', jacksonville: 'FL', philadelphia: 'PA', pittsburgh: 'PA', phoenix: 'AZ',
    scottsdale: 'AZ', charlotte: 'NC', raleigh: 'NC', durham: 'NC', nashville: 'TN', minneapolis: 'MN',
    detroit: 'MI', 'salt lake city': 'UT', portland: 'OR', columbus: 'OH', cleveland: 'OH', cincinnati: 'OH',
    indianapolis: 'IN', 'kansas city': 'MO', 'st louis': 'MO', 'st. louis': 'MO', baltimore: 'MD', 'jersey city': 'NJ',
    hoboken: 'NJ', arlington: 'VA', 'mclean': 'VA', reston: 'VA', 'las vegas': 'NV', 'new orleans': 'LA',
    milwaukee: 'WI', omaha: 'NE', 'oklahoma city': 'OK', richmond: 'VA', cambridge: 'MA', birmingham: 'AL',
  },
  weakCities: ['portland', 'arlington', 'richmond', 'cambridge', 'birmingham', 'columbus', 'durham', 'bellevue'],
  remoteRegions: ['north america', 'americas'],

  salary: {
    bareDollar: true,
    inferYearFrom: 10_000,
    inferHourBelow: 250,
    contribution: null,
  },

  rights: [
    ...citizenshipPatterns({
      adj: 'u\\.?s\\.?|united states|american',
      country: 'the u\\.?s\\.?a?\\.?|the united states(?: of america)?|the us|the usa',
      permanent: '(?:u\\.?s\\.? )?(?:permanent residents?|green card holders?|green card|lawful permanent residents?|lprs?)',
    }),
    // Export-control language: a "U.S. person" is a citizen, permanent resident or protected individual.
    { re: /\b(?:must be|only)\s+(?:an?\s+)?u\.?s\.?\s+persons?\b|\bitar\b/i, kind: 'citizen_or_pr' },
    { re: /\bpublic trust\b/i, kind: 'clearance_required', clearance: 'public_trust' },
    { re: /(?<!top\s)\bsecret\s+(?:security\s+)?clearance\b|\bactive secret\b/i, kind: 'clearance_required', clearance: 'secret' },
    { re: /\btop secret\b(?!\s*\/\s*sci)/i, kind: 'clearance_required', clearance: 'top_secret' },
    { re: /\bTS\s*\/\s*SCI\b|\btop secret\s*\/\s*sci\b/i, kind: 'clearance_required', clearance: 'ts_sci' },
    ...genericRightsPatterns('h-?1b|o-?1|tn|green card|visa'),
  ],
  clearanceLevels: [
    { id: 'public_trust', label: 'Public Trust' },
    { id: 'secret', label: 'Secret' },
    { id: 'top_secret', label: 'Top Secret' },
    { id: 'ts_sci', label: 'TS/SCI' },
  ],
  rightsLabels: {
    citizen_only: 'US citizens only',
    citizen_or_pr: 'Citizens or green card holders',
    clearance_required: 'Security clearance required',
    work_rights_required: 'US work authorization required',
    no_sponsorship: 'No visa sponsorship',
    sponsorship_available: 'Visa sponsorship available',
    unspecified: 'Work authorization not stated',
  },
  permanentLabel: 'Green card holder',

  agencies: [
    'robert half', 'randstad', 'adecco', 'kelly services', 'manpower', 'insight global', 'teksystems', 'aerotek',
    'kforce', 'apex systems', 'beacon hill', 'cybercoders', 'motion recruitment', 'aston carter', 'yoh', 'collabera',
    'judge group', 'vaco', 'creative circle', 'actalent',
  ],
};
