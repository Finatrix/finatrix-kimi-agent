/** New Zealand. Region names that are also places elsewhere (Canterbury, Nelson, West Coast) are weak evidence only. */
import { citizenshipPatterns, genericRightsPatterns } from './common.ts';
import type { MarketDef } from './types.ts';

export const NZ: MarketDef = {
  id: 'nz',
  iso: 'NZ',
  name: 'New Zealand',
  currency: 'NZD',

  countryNames: ['new zealand', 'aotearoa'],
  countryTokens: ['NZ', 'NZL'],
  regions: {
    northland: 'NTL',
    waikato: 'WKO',
    'bay of plenty': 'BOP',
    gisborne: 'GIS',
    "hawke's bay": 'HKB',
    'hawkes bay': 'HKB',
    taranaki: 'TKI',
    'manawatu-whanganui': 'MWT',
    manawatu: 'MWT',
    whanganui: 'MWT',
    otago: 'OTA',
    southland: 'STL',
  },
  strongRegionCodes: [],
  weakRegionCodes: [],
  postfixRegionCodes: [],
  cities: {
    auckland: 'AUK', 'auckland cbd': 'AUK', 'north shore': 'AUK', manukau: 'AUK', takapuna: 'AUK', albany: 'AUK',
    wellington: 'WGN', 'wellington cbd': 'WGN', 'lower hutt': 'WGN', 'upper hutt': 'WGN', porirua: 'WGN',
    christchurch: 'CAN', canterbury: 'CAN', timaru: 'CAN',
    hamilton: 'WKO', tauranga: 'BOP', rotorua: 'BOP', napier: 'HKB', hastings: 'HKB', 'new plymouth': 'TKI',
    'palmerston north': 'MWT', whangarei: 'NTL', dunedin: 'OTA', queenstown: 'OTA', invercargill: 'STL',
    nelson: 'NSN', tasman: 'TAS', marlborough: 'MBH', blenheim: 'MBH', 'west coast': 'WTC', greymouth: 'WTC',
  },
  weakCities: ['north shore', 'albany', 'hamilton', 'canterbury', 'hastings', 'nelson', 'tasman', 'marlborough', 'west coast'],
  remoteRegions: ['anz', 'apac'],

  salary: {
    bareDollar: true,
    inferYearFrom: 10_000,
    inferHourBelow: 250,
    contribution: {
      kind: 'kiwisaver',
      rules: [
        { re: /(?:inclusive of|incl\.?|including|inc\.?)\s+(?:employer\s+)?kiwisaver/i, treatment: 'included' },
        { re: /\bkiwisaver\s+inclusive\b/i, treatment: 'included' },
        { re: /(?:\+|plus)\s*(?:\d+(?:\.\d+)?%\s*)?(?:employer\s+)?kiwisaver/i, treatment: 'excluded' },
        { re: /\bkiwisaver\s+(?:on top|in addition)\b/i, treatment: 'excluded' },
        { re: /\btotal remuneration\b/i, treatment: 'included' },
      ],
    },
  },

  rights: [
    ...citizenshipPatterns({
      adj: 'new zealand|nz',
      country: 'new zealand|nz|aotearoa',
      permanent: '(?:nz |new zealand )?(?:residents?|residency|resident visa holders?|permanent residents?|resident class visa holders?)',
    }),
    { re: /\b(?:confidential|restricted)\s+(?:level\s+)?(?:security\s+)?clearance\b/i, kind: 'clearance_required', clearance: 'confidential' },
    { re: /(?<!top\s)\bsecret\s+(?:level\s+)?(?:security\s+)?clearance\b/i, kind: 'clearance_required', clearance: 'secret' },
    { re: /\btop secret\b/i, kind: 'clearance_required', clearance: 'top_secret' },
    { re: /\bNZSIS\b/i, kind: 'clearance_required' },
    ...genericRightsPatterns('aewv|accredited employer work visa|work visa|visa'),
  ],
  clearanceLevels: [
    { id: 'confidential', label: 'Confidential' },
    { id: 'secret', label: 'Secret' },
    { id: 'top_secret', label: 'Top Secret' },
  ],
  rightsLabels: {
    citizen_only: 'NZ citizens only',
    citizen_or_pr: 'Citizens or residents',
    clearance_required: 'Security clearance required',
    work_rights_required: 'NZ work rights required',
    no_sponsorship: 'No visa sponsorship',
    sponsorship_available: 'Visa sponsorship available',
    unspecified: 'Work rights not stated',
  },
  permanentLabel: 'Resident',

  agencies: [
    'hays', 'robert walters', 'randstad', 'beyond recruitment', 'absolute it', 'potentia', 'madison', 'adecco',
    'robert half', 'michael page', 'tradestaff', 'allied workforce', 'alliance recruitment', 'tribe recruitment',
  ],
};
