/** Australia. Ported from the engine's original Australian layer, with its namesake rules kept. */
import { citizenshipPatterns, genericRightsPatterns } from './common.ts';
import type { MarketDef } from './types.ts';

export const AU: MarketDef = {
  id: 'au',
  iso: 'AU',
  name: 'Australia',
  currency: 'AUD',

  countryNames: ['australia', 'australian'],
  countryTokens: ['AU', 'AUS'],
  regions: {
    'new south wales': 'NSW',
    queensland: 'QLD',
    'western australia': 'WA',
    'south australia': 'SA',
    tasmania: 'TAS',
    'australian capital territory': 'ACT',
    'northern territory': 'NT',
  },
  // NSW/VIC/QLD/TAS are Australia-only. WA/SA/NT/ACT also mean Washington, South Africa and others.
  strongRegionCodes: ['NSW', 'VIC', 'QLD', 'TAS'],
  weakRegionCodes: ['WA', 'SA', 'NT', 'ACT'],
  postfixRegionCodes: [],
  cities: {
    sydney: 'NSW', parramatta: 'NSW', 'north sydney': 'NSW', 'sydney cbd': 'NSW', barangaroo: 'NSW', pyrmont: 'NSW',
    chatswood: 'NSW', 'macquarie park': 'NSW', 'st leonards': 'NSW', 'bondi junction': 'NSW', norwest: 'NSW',
    newcastle: 'NSW', wollongong: 'NSW', 'central coast': 'NSW', penrith: 'NSW', liverpool: 'NSW', burwood: 'NSW',
    melbourne: 'VIC', 'melbourne cbd': 'VIC', docklands: 'VIC', southbank: 'VIC', 'south bank': 'VIC', geelong: 'VIC',
    ballarat: 'VIC', bendigo: 'VIC', clayton: 'VIC', 'box hill': 'VIC', 'glen waverley': 'VIC', 'richmond vic': 'VIC',
    victoria: 'VIC',
    brisbane: 'QLD', 'brisbane cbd': 'QLD', 'fortitude valley': 'QLD', 'spring hill': 'QLD', 'gold coast': 'QLD',
    'sunshine coast': 'QLD', townsville: 'QLD', cairns: 'QLD', toowoomba: 'QLD', mackay: 'QLD', rockhampton: 'QLD',
    ipswich: 'QLD',
    perth: 'WA', 'perth cbd': 'WA', fremantle: 'WA', 'west perth': 'WA', 'osborne park': 'WA', bunbury: 'WA',
    adelaide: 'SA', 'adelaide cbd': 'SA', 'mawson lakes': 'SA',
    hobart: 'TAS', launceston: 'TAS', devonport: 'TAS',
    canberra: 'ACT', barton: 'ACT', civic: 'ACT', belconnen: 'ACT', fyshwick: 'ACT', russell: 'ACT',
    darwin: 'NT', 'alice springs': 'NT',
  },
  weakCities: [
    'newcastle', 'liverpool', 'ipswich', 'penrith', 'launceston', 'devonport', 'clayton', 'burwood', 'civic', 'russell',
    'barton', 'southbank', 'south bank', 'central coast', 'spring hill', 'docklands', 'mackay', 'norwest', 'victoria',
  ],
  remoteRegions: ['anz', 'apac'],

  salary: {
    bareDollar: true,
    inferYearFrom: 10_000,
    inferHourBelow: 250,
    contribution: {
      kind: 'super',
      rules: [
        { re: /(?:inclusive of|incl\.?|including|inc\.?)\s+super/i, treatment: 'included' },
        { re: /\bsuper\s+inclusive\b/i, treatment: 'included' },
        { re: /(?:\+|plus)\s*(?:\d+(?:\.\d+)?%\s*)?super(?:annuation)?/i, treatment: 'excluded' },
        { re: /\b(?:TRP|TFR|total (?:remuneration|reward|package)|package)\b/i, treatment: 'included' },
      ],
    },
  },

  rights: [
    ...citizenshipPatterns({
      adj: 'australian',
      country: 'australia',
      permanent: '(?:australian )?(?:permanent residents?|permanent residency|pr holders?|pr)',
    }),
    { re: /\bbaseline\s+(?:security\s+)?clearance\b/i, kind: 'clearance_required', clearance: 'baseline' },
    { re: /\bnegative vetting\s*(?:level\s*)?(?:1|one)\b|\bNV\s?1\b/i, kind: 'clearance_required', clearance: 'nv1' },
    { re: /\bnegative vetting\s*(?:level\s*)?(?:2|two)\b|\bNV\s?2\b/i, kind: 'clearance_required', clearance: 'nv2' },
    { re: /\bpositive vetting\b|\bPV\s+(?:security\s+)?clearance\b/i, kind: 'clearance_required', clearance: 'pv' },
    { re: /\bAGSVA\b/i, kind: 'clearance_required' },
    ...genericRightsPatterns('482|186|494|TSS|visa'),
  ],
  clearanceLevels: [
    { id: 'baseline', label: 'Baseline' },
    { id: 'nv1', label: 'NV1' },
    { id: 'nv2', label: 'NV2' },
    { id: 'pv', label: 'PV' },
  ],
  rightsLabels: {
    citizen_only: 'Australian citizens only',
    citizen_or_pr: 'Citizens or permanent residents',
    clearance_required: 'Security clearance required',
    work_rights_required: 'Australian work rights required',
    no_sponsorship: 'No visa sponsorship',
    sponsorship_available: 'Visa sponsorship available',
    unspecified: 'Work rights not stated',
  },
  permanentLabel: 'Permanent resident',

  agencies: [
    'hays', 'randstad', 'robert half', 'michael page', 'page personnel', 'robert walters', 'hudson', 'talent international',
    'chandler macleod', 'adecco', 'kelly services', 'manpower', 'six degrees executive', 'peoplebank', 'paxus',
    'ready workforce', 'finite recruitment', 'workpac', 'beyond recruitment', 'stellar recruitment', 'aurec',
  ],
};
