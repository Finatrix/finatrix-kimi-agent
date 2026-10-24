/**
 * India. Salaries are usually quoted as CTC in lakhs ("12 LPA", "8-12 lakhs", "1.2 Cr"), so the shorthand
 * parser lives here and the app's `parseIndianSalary` re-exports it unchanged.
 */
import { citizenshipPatterns, genericRightsPatterns } from './common.ts';
import type { MarketDef } from './types.ts';

export const IN: MarketDef = {
  id: 'in',
  iso: 'IN',
  name: 'India',
  currency: 'INR',

  countryNames: ['india', 'bharat', 'pan india', 'pan-india'],
  countryTokens: ['IND'],
  regions: {
    'andhra pradesh': 'AP', 'arunachal pradesh': 'AR', assam: 'AS', bihar: 'BR', chhattisgarh: 'CG', goa: 'GA',
    gujarat: 'GJ', haryana: 'HR', 'himachal pradesh': 'HP', jharkhand: 'JH', karnataka: 'KA', kerala: 'KL',
    'madhya pradesh': 'MP', maharashtra: 'MH', manipur: 'MN', meghalaya: 'ML', mizoram: 'MZ', nagaland: 'NL',
    odisha: 'OD', orissa: 'OD', rajasthan: 'RJ', sikkim: 'SK', 'tamil nadu': 'TN', telangana: 'TG', tripura: 'TR',
    'uttar pradesh': 'UP', uttarakhand: 'UK', 'west bengal': 'WB', 'jammu and kashmir': 'JK', ladakh: 'LA',
    puducherry: 'PY', pondicherry: 'PY', chandigarh: 'CH', 'delhi ncr': 'DL', ncr: 'DL', 'national capital region': 'DL',
    'andaman and nicobar': 'AN', lakshadweep: 'LD', 'dadra and nagar haveli': 'DN', 'daman and diu': 'DN',
  },
  strongRegionCodes: [],
  weakRegionCodes: [],
  postfixRegionCodes: [],
  cities: {
    mumbai: 'MH', bombay: 'MH', 'navi mumbai': 'MH', thane: 'MH', pune: 'MH', nagpur: 'MH', nashik: 'MH',
    bengaluru: 'KA', bangalore: 'KA', mysuru: 'KA', mysore: 'KA', mangaluru: 'KA', mangalore: 'KA',
    chennai: 'TN', madras: 'TN', coimbatore: 'TN', madurai: 'TN', hyderabad: 'TG', secunderabad: 'TG',
    'new delhi': 'DL', delhi: 'DL', gurugram: 'HR', gurgaon: 'HR', faridabad: 'HR', noida: 'UP',
    'greater noida': 'UP', ghaziabad: 'UP', lucknow: 'UP', kanpur: 'UP', kolkata: 'WB', calcutta: 'WB',
    ahmedabad: 'GJ', vadodara: 'GJ', surat: 'GJ', gandhinagar: 'GJ', jaipur: 'RJ', indore: 'MP', bhopal: 'MP',
    kochi: 'KL', cochin: 'KL', thiruvananthapuram: 'KL', trivandrum: 'KL', bhubaneswar: 'OD',
    visakhapatnam: 'AP', vizag: 'AP', vijayawada: 'AP', patna: 'BR', ranchi: 'JH', dehradun: 'UK', mohali: 'PB',
    ludhiana: 'PB', amritsar: 'PB', guwahati: 'AS',
    // Punjab is also a Pakistani province, so the name alone is weak.
    punjab: 'PB',
  },
  weakCities: ['punjab'],
  remoteRegions: ['apac', 'apj', 'south asia'],

  salary: {
    bareDollar: false,
    // ₹ figures with no period: monthly pay is common, so only clearly annual amounts are read as annual.
    inferYearFrom: 200_000,
    inferHourBelow: null,
    contribution: {
      kind: 'pf',
      rules: [
        { re: /(?:\+|plus)\s*(?:pf|provident fund)\b/i, treatment: 'excluded' },
        { re: /\bctc\b|\bcost to company\b/i, treatment: 'included' },
        { re: /(?:inclusive of|including|incl\.?)\s+(?:pf|provident fund)/i, treatment: 'included' },
      ],
    },
  },

  rights: [
    ...citizenshipPatterns({
      adj: 'indian',
      country: 'india',
      permanent: 'oci(?: card)?(?: holders?)?|overseas citizens? of india',
    }),
    ...genericRightsPatterns('employment visa|work permit|visa'),
  ],
  clearanceLevels: [],
  rightsLabels: {
    citizen_only: 'Indian citizens only',
    citizen_or_pr: 'Citizens or OCI cardholders',
    clearance_required: 'Security clearance required',
    work_rights_required: 'Right to work in India required',
    no_sponsorship: 'No visa sponsorship',
    sponsorship_available: 'Visa sponsorship available',
    unspecified: 'Work eligibility not stated',
  },
  permanentLabel: 'OCI cardholder',

  agencies: [
    'teamlease', 'quess', 'randstad', 'adecco', 'abc consultants', 'kelly services', 'manpowergroup', 'ciel hr',
    'careernet', 'xpheno', 'ma foi', 'michael page', 'hunt partners', 'antal', 'kornferry', 'korn ferry', 'heidrick',
  ],
};

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
