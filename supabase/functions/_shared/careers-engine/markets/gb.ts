/**
 * United Kingdom. Town names shared with Australia or the US (Perth, Newcastle, Birmingham, Cambridge, Brighton)
 * are weak evidence; nations and counties are hard evidence.
 */
import { citizenshipPatterns, genericRightsPatterns } from './common.ts';
import type { MarketDef } from './types.ts';

export const GB: MarketDef = {
  id: 'gb',
  iso: 'GB',
  name: 'United Kingdom',
  currency: 'GBP',

  countryNames: ['united kingdom', 'great britain', 'britain', 'u.k.'],
  countryTokens: ['UK', 'GB', 'GBR'],
  regions: {
    england: 'ENG', scotland: 'SCT', wales: 'WLS', 'northern ireland': 'NIR',
    'greater london': 'LDN', 'greater manchester': 'MAN', 'west midlands': 'WMD', 'east midlands': 'EMD',
    'west yorkshire': 'YOR', 'south yorkshire': 'YOR', 'north yorkshire': 'YOR', yorkshire: 'YOR', merseyside: 'MSY',
    lancashire: 'LAN', cheshire: 'CHS', 'tyne and wear': 'TWR', northumberland: 'NBL', 'county durham': 'DUR',
    cumbria: 'CMA', kent: 'KEN', surrey: 'SRY', essex: 'ESS', sussex: 'SSX', 'east sussex': 'SSX', 'west sussex': 'SSX',
    hampshire: 'HAM', berkshire: 'BRK', buckinghamshire: 'BKM', hertfordshire: 'HRT', oxfordshire: 'OXF',
    cambridgeshire: 'CAM', norfolk: 'NFK', suffolk: 'SFK', devon: 'DEV', cornwall: 'CON', somerset: 'SOM',
    dorset: 'DOR', wiltshire: 'WIL', gloucestershire: 'GLS', leicestershire: 'LEI', nottinghamshire: 'NTT',
    derbyshire: 'DBY', staffordshire: 'STS', warwickshire: 'WAR', midlothian: 'MLN',
  },
  strongRegionCodes: [],
  weakRegionCodes: [],
  postfixRegionCodes: [],
  cities: {
    london: 'LDN', 'city of london': 'LDN', 'canary wharf': 'LDN', croydon: 'LDN', stratford: 'LDN',
    manchester: 'MAN', salford: 'MAN', stockport: 'MAN', birmingham: 'WMD', coventry: 'WMD', wolverhampton: 'WMD',
    solihull: 'WMD', leeds: 'YOR', sheffield: 'YOR', bradford: 'YOR', york: 'YOR', liverpool: 'MSY',
    newcastle: 'TWR', 'newcastle upon tyne': 'TWR', sunderland: 'TWR', glasgow: 'SCT', edinburgh: 'SCT',
    aberdeen: 'SCT', dundee: 'SCT', perth: 'SCT', cardiff: 'WLS', swansea: 'WLS', newport: 'WLS', belfast: 'NIR',
    bristol: 'ENG', bath: 'SOM', reading: 'BRK', slough: 'BRK', 'milton keynes': 'BKM', oxford: 'OXF',
    cambridge: 'CAM', nottingham: 'NTT', leicester: 'LEI', derby: 'DBY', southampton: 'HAM', portsmouth: 'HAM',
    basingstoke: 'HAM', brighton: 'SSX', guildford: 'SRY', woking: 'SRY', watford: 'HRT', 'st albans': 'HRT',
    chelmsford: 'ESS', norwich: 'NFK', ipswich: 'SFK', exeter: 'DEV', plymouth: 'DEV', swindon: 'WIL',
    gloucester: 'GLS', cheltenham: 'GLS', warrington: 'CHS', chester: 'CHS', preston: 'LAN', northampton: 'ENG',
    peterborough: 'CAM', luton: 'ENG', 'hemel hempstead': 'HRT',
  },
  weakCities: [
    'perth', 'newcastle', 'liverpool', 'ipswich', 'birmingham', 'cambridge', 'brighton', 'richmond', 'reading', 'bath',
    'york', 'derby', 'newport', 'plymouth', 'chester', 'aberdeen', 'stratford', 'norwich', 'portsmouth', 'preston',
  ],
  remoteRegions: ['emea', 'europe'],

  salary: {
    bareDollar: false,
    inferYearFrom: 10_000,
    inferHourBelow: 250,
    contribution: {
      kind: 'pension',
      rules: [
        { re: /(?:inclusive of|including|incl\.?)\s+(?:employer\s+)?pension/i, treatment: 'included' },
        { re: /(?:\+|plus)\s*(?:\d+(?:\.\d+)?%\s*)?(?:employer\s+)?pension/i, treatment: 'excluded' },
        { re: /\bpension contributions? (?:on top|in addition)\b/i, treatment: 'excluded' },
      ],
    },
  },

  rights: [
    ...citizenshipPatterns({
      adj: 'uk|u\\.k\\.|british',
      country: 'the uk|the u\\.k\\.|the united kingdom|great britain|britain',
      permanent: 'indefinite leave to remain|ilr|settled status|settlement|pre-settled status',
    }),
    { re: /\bBPSS\b|\bbaseline personnel security standard\b/i, kind: 'clearance_required', clearance: 'bpss' },
    { re: /\bCTC\s+(?:clear(?:ed|ance)|level)\b|\bcounter[- ]terrorist check\b/i, kind: 'clearance_required', clearance: 'ctc' },
    {
      re: /\bSC\s+(?:clear(?:ed|ance)|level|vetting)\b|\bsecurity check(?:ed)?\s+\(?SC\)?|\bsecurity check(?:ed)?\s+(?:clearance|level|vetting)\b/i,
      kind: 'clearance_required',
      clearance: 'sc',
    },
    { re: /\b(?:e)?DV\s+(?:clear(?:ed|ance)|level|vetting)\b|\bdeveloped vetting\b/i, kind: 'clearance_required', clearance: 'dv' },
    ...genericRightsPatterns('skilled worker(?: visa)?|tier 2|certificate of sponsorship|visa'),
  ],
  clearanceLevels: [
    { id: 'bpss', label: 'BPSS' },
    { id: 'ctc', label: 'CTC' },
    { id: 'sc', label: 'SC' },
    { id: 'dv', label: 'DV' },
  ],
  rightsLabels: {
    citizen_only: 'British citizens only',
    citizen_or_pr: 'Citizens or settled status',
    clearance_required: 'Security clearance required',
    work_rights_required: 'UK right to work required',
    no_sponsorship: 'No visa sponsorship',
    sponsorship_available: 'Visa sponsorship available',
    unspecified: 'Right to work not stated',
  },
  permanentLabel: 'Settled status (ILR)',

  agencies: [
    'hays', 'reed', 'michael page', 'page personnel', 'robert walters', 'robert half', 'harvey nash', 'huxley',
    'la fosse', 'pertemps', 'search consultancy', 'adecco', 'randstad', 'manpower', 'hudson shribman', 'nigel frank',
    'jefferson frank', 'hamilton barnes', 'oho group', 'investigo', 'morgan mckinley', 'goodman masson',
  ],
};
