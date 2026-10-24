import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAREERS_MARKETS,
  compareRights,
  detectEmploymentType,
  detectMarket,
  detectWorkRights,
  isLikelyAgency,
  parseIndianSalary,
  parseLocation,
  parseSalary,
  rightsLabel,
  toCareersMarket,
} from './index.ts';

const inAU = (s: string) => parseLocation(s, 'au');

describe('AU location (ported from the original Australian layer)', () => {
  it('reads city, state and work mode', () => {
    expect(inAU('Sydney NSW')).toMatchObject({ regions: ['NSW'], inMarket: true, remote: false, multi: false });
    expect(inAU('Melbourne, VIC (Hybrid)')).toMatchObject({ regions: ['VIC'], hybrid: true });
    expect(inAU('Remote - Australia')).toMatchObject({ remote: true, inMarket: true });
    expect(inAU('Brisbane QLD or Perth WA').multi).toBe(true);
    expect(inAU('Sydney').multi).toBe(false);
    expect(inAU('Canberra').regions).toEqual(['ACT']);
    expect(inAU('Remote - ANZ').inMarket).toBe(true);
  });

  it('does not mistake overseas namesakes for Australia', () => {
    for (const place of [
      'Melbourne, Florida', 'Melbourne, FL, United States', 'Perth, Scotland', 'Sydney, Nova Scotia', 'Sydney, NS, Canada',
      'Newcastle, UK', 'Seattle, WA', 'US, WA, Redmond', 'Victoria, BC', 'Toronto, ON', 'London, United Kingdom',
      'Bengaluru, Karnataka', 'Auckland, New Zealand',
    ]) {
      const l = inAU(place);
      expect([place, l.inMarket, l.outside]).toEqual([place, false, true]);
      expect(l.cities).toEqual([]);
    }
  });

  it('says "unknown" instead of guessing', () => {
    for (const place of ['Remote', 'Tullamarine', '', 'Hybrid']) {
      expect([place, inAU(place)]).toEqual([place, expect.objectContaining({ inMarket: false, outside: false, ambiguous: false })]);
    }
    for (const place of ['Newcastle', 'Liverpool', 'Victoria', 'Joondalup WA']) {
      expect([place, inAU(place)]).toEqual([place, expect.objectContaining({ inMarket: false, outside: false, ambiguous: true })]);
    }
  });

  it('lets corroborating evidence settle an ambiguous name', () => {
    for (const place of ['Newcastle NSW', 'Victoria, Australia', 'Perth WA', 'Darwin NT', 'Sydney NSW or London UK', 'Adelaide, South Australia']) {
      expect([place, inAU(place).inMarket]).toEqual([place, true]);
    }
    expect(inAU('Perth').inMarket).toBe(true);
  });
});

describe('locations in every market', () => {
  const cases: Array<[string, string, boolean]> = [
    // [market, text, inMarket]
    ['us', 'Austin, TX', true], ['us', 'Melbourne, Florida', true], ['us', 'Remote - North America', true],
    ['us', 'New York, NY', true], ['us', 'Berlin, DE', false], ['us', 'Perth, WA', false], ['us', 'London, UK', false],
    ['gb', 'London', true], ['gb', 'Perth, Scotland', true], ['gb', 'Canary Wharf, London', true], ['gb', 'Remote - EMEA', true],
    ['gb', 'Sydney, New South Wales', false], ['gb', 'New York, NY', false], ['gb', 'Vancouver, British Columbia', false],
    ['in', 'Bengaluru, Karnataka', true], ['in', 'Gurugram', true], ['in', 'Pan India', true], ['in', 'Remote - APAC', true],
    ['in', 'Lahore, Punjab', false], ['in', 'Singapore', false],
    ['nz', 'Auckland', true], ['nz', 'Wellington, New Zealand', true], ['nz', 'Christchurch', true], ['nz', 'Remote - ANZ', true],
    ['nz', 'Sydney NSW', false], ['nz', 'Canterbury, Kent', false], ['nz', 'Hamilton, ON', false],
  ];
  it.each(cases)('%s: %s → inMarket %s', (market, text, expected) => {
    expect(parseLocation(text, market as never).inMarket).toBe(expected);
  });

  it('keeps weak names ambiguous until something corroborates them', () => {
    expect(parseLocation('Hamilton', 'nz')).toMatchObject({ inMarket: false, ambiguous: true });
    expect(parseLocation('Hamilton, Waikato', 'nz').inMarket).toBe(true);
    expect(parseLocation('Perth', 'gb')).toMatchObject({ inMarket: false, ambiguous: true });
    expect(parseLocation('Cambridge', 'us')).toMatchObject({ inMarket: false, ambiguous: true });
    expect(parseLocation('Cambridge, MA', 'us').inMarket).toBe(true);
  });

  it('detects the one market a posting sits in', () => {
    expect(detectMarket('Sydney NSW')).toBe('au');
    expect(detectMarket('Austin, TX')).toBe('us');
    expect(detectMarket('Pune, Maharashtra')).toBe('in');
    expect(detectMarket('Manchester, England')).toBe('gb');
    expect(detectMarket('Auckland')).toBe('nz');
    expect(detectMarket('Berlin, Germany')).toBeNull();
    expect(detectMarket('Remote')).toBeNull();
    expect(detectMarket('Sydney NSW or London UK')).toBeNull();
  });

  it('maps stored country spellings to markets', () => {
    expect(toCareersMarket('GB')).toBe('gb');
    expect(toCareersMarket('uk')).toBe('gb');
    expect(toCareersMarket('USA')).toBe('us');
    expect(toCareersMarket('New Zealand')).toBe('nz');
    expect(toCareersMarket('sg')).toBeNull();
    expect(toCareersMarket(null)).toBeNull();
  });
});

describe('salary', () => {
  it('reads AU figures and labels super without computing it', () => {
    expect(parseSalary('$75,000 - $85,000 + super', 'au')).toMatchObject({
      currency: 'AUD', annualMin: 75000, annualMax: 85000, period: 'year', contribution: { kind: 'super', treatment: 'excluded' },
    });
    expect(parseSalary('$95k including super', 'au')).toMatchObject({ annualMin: 95000, contribution: { treatment: 'included' } });
    expect(parseSalary('Competitive package', 'au')).toBeNull();
  });

  it('never annualises an hourly or daily rate', () => {
    expect(parseSalary('$45 - $50 per hour', 'au')).toMatchObject({ period: 'hour', annualMin: null, annualMax: null });
    expect(parseSalary('£550 per day outside IR35', 'gb')).toMatchObject({ period: 'day', currency: 'GBP', annualMin: null });
    expect(parseSalary('£4,000 per month', 'gb')).toMatchObject({ period: 'month', annualMin: 48000 });
  });

  it('reads each market currency, and a bare $ only where it is local', () => {
    expect(parseSalary('$120k - $150k', 'us')).toMatchObject({ currency: 'USD', annualMin: 120000, annualMax: 150000 });
    expect(parseSalary('$90,000 plus KiwiSaver', 'nz')).toMatchObject({ currency: 'NZD', contribution: { kind: 'kiwisaver', treatment: 'excluded' } });
    expect(parseSalary('£45,000 - £55,000 per annum + pension', 'gb')).toMatchObject({
      currency: 'GBP', annualMin: 45000, contribution: { kind: 'pension', treatment: 'excluded' },
    });
    expect(parseSalary('$100,000 USD', 'gb')).toMatchObject({ currency: 'USD' });
    expect(parseSalary('US$95k', 'au')).toMatchObject({ currency: 'USD' });
  });

  it('reads Indian shorthand exactly as the app always has', () => {
    expect(parseSalary('CTC 12-18 LPA', 'in')).toMatchObject({
      currency: 'INR', annualMin: 1_200_000, annualMax: 1_800_000, contribution: { kind: 'pf', treatment: 'included' },
    });
    expect(parseSalary('₹15,00,000 per annum', 'in')).toMatchObject({ currency: 'INR', annualMin: 1_500_000, period: 'year' });
    expect(parseSalary('₹45,000', 'in')).toBeNull(); // monthly or annual? unclear, so no figure
    // Parity with the app's original parseIndianSalary: a figure needs a lakh/crore unit.
    expect(parseIndianSalary('12 LPA')).toEqual({ min: 1_200_000, max: 1_200_000 });
    expect(parseIndianSalary('8-12 lakhs')).toEqual({ min: 800_000, max: 1_200_000 });
    expect(parseIndianSalary('₹15,00,000')).toEqual({ min: null, max: null });
    expect(parseIndianSalary('1.2 Cr')).toEqual({ min: 12_000_000, max: 12_000_000 });
    expect(parseIndianSalary('CTC 10L')).toEqual({ min: 1_000_000, max: 1_000_000 });
    expect(parseIndianSalary('nothing here')).toEqual({ min: null, max: null });
  });
});

describe('employment type', () => {
  it('detects common types across markets', () => {
    expect(detectEmploymentType('Graduate Program 2027')).toBe('graduate');
    expect(detectEmploymentType('Casual, ongoing')).toBe('casual');
    expect(detectEmploymentType('12 month fixed term contract')).toBe('fixed_term');
    expect(detectEmploymentType('Part-time, 3 days a week')).toBe('part_time');
    expect(detectEmploymentType('Summer internship')).toBe('internship');
    expect(detectEmploymentType('W-2 only, no C2C')).toBe('contract');
    expect(detectEmploymentType('6 month FTC')).toBe('fixed_term');
    expect(detectEmploymentType('Freshers welcome')).toBe('graduate');
  });
});

describe('work rights (detect and show)', () => {
  it('detects the strictest AU requirement', () => {
    expect(detectWorkRights('Australian citizens only', 'au').requirement).toBe('citizen_only');
    expect(detectWorkRights('Must hold NV1 clearance', 'au').clearance).toBe('nv1');
    expect(detectWorkRights('Open to Australian citizens or permanent residents', 'au').requirement).toBe('citizen_or_pr');
    expect(detectWorkRights('No visa sponsorship. Must have full work rights.', 'au').all).toEqual(
      expect.arrayContaining(['no_sponsorship', 'work_rights_required']),
    );
    expect(detectWorkRights('Sponsorship is available', 'au').requirement).toBe('sponsorship_available');
    expect(detectWorkRights('No sponsorship provided', 'au').all).toEqual(['no_sponsorship']);
    expect(detectWorkRights('Great culture and snacks', 'au').requirement).toBe('unspecified');
  });

  it('reads each market in its own words', () => {
    expect(detectWorkRights('Must be authorized to work in the United States without sponsorship now or in the future', 'us').all).toEqual(
      expect.arrayContaining(['no_sponsorship', 'work_rights_required']),
    );
    expect(detectWorkRights('Active TS/SCI clearance required', 'us')).toMatchObject({ requirement: 'clearance_required', clearance: 'ts_sci' });
    expect(detectWorkRights('US citizens or green card holders', 'us').requirement).toBe('citizen_or_pr');
    expect(detectWorkRights('We can offer H-1B sponsorship', 'us').requirement).toBe('sponsorship_available');
    expect(detectWorkRights('You must have the right to work in the UK', 'gb').requirement).toBe('work_rights_required');
    expect(detectWorkRights('Candidates must hold SC clearance', 'gb')).toMatchObject({ requirement: 'clearance_required', clearance: 'sc' });
    expect(detectWorkRights('Skilled Worker visa sponsorship is available', 'gb').requirement).toBe('sponsorship_available');
    expect(detectWorkRights('Open to NZ citizens or residents only', 'nz').requirement).toBe('citizen_or_pr');
    expect(detectWorkRights('We can support an AEWV: sponsorship is available', 'nz').requirement).toBe('sponsorship_available');
    expect(detectWorkRights('Indian citizens or OCI holders', 'in').requirement).toBe('citizen_or_pr');
  });

  it('labels a requirement in the market\'s wording', () => {
    expect(rightsLabel(detectWorkRights('Candidates must hold SC clearance', 'gb'), 'gb')).toBe('SC clearance required');
    expect(rightsLabel({ requirement: 'citizen_or_pr' }, 'us')).toBe('Citizens or green card holders');
    expect(rightsLabel({ requirement: 'unspecified' }, 'nz')).toBe('Work rights not stated');
  });

  it('compares a posting with what the user declared, never with a visa rule', () => {
    const citizensOnly = detectWorkRights('Australian citizens only', 'au');
    const noSponsor = detectWorkRights('No visa sponsorship is available', 'au');
    const sponsor = detectWorkRights('Visa sponsorship is available', 'au');
    const silent = detectWorkRights('Great culture', 'au');
    expect(compareRights(citizensOnly, 'citizen')).toBe('meets');
    expect(compareRights(citizensOnly, 'permanent')).toBe('does_not_meet');
    expect(compareRights(noSponsor, 'unrestricted_visa')).toBe('meets');
    expect(compareRights(noSponsor, 'needs_sponsorship')).toBe('does_not_meet');
    expect(compareRights(sponsor, 'needs_sponsorship')).toBe('meets');
    expect(compareRights(silent, 'needs_sponsorship')).toBe('check');
    expect(compareRights(detectWorkRights('Baseline clearance required', 'au'), 'citizen')).toBe('check');
    expect(compareRights(silent, null)).toBe('unknown');
  });

  it('flags likely agencies without over-matching', () => {
    expect(isLikelyAgency('Hays Specialist Recruitment')).toBe(true);
    expect(isLikelyAgency('Michael Page')).toBe(true);
    expect(isLikelyAgency('TEKsystems', 'us')).toBe(true);
    expect(isLikelyAgency('TeamLease Services', 'in')).toBe(true);
    expect(isLikelyAgency('Tata Consultancy Services', 'in')).toBe(false);
    expect(isLikelyAgency('Westpac Group')).toBe(false);
    expect(isLikelyAgency('Sapphire Coast Council')).toBe(false);
    expect(isLikelyAgency(null)).toBe(false);
  });
});

describe('tripwires', () => {
  const dir = __dirname;
  const sources = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'));

  it('defines every market with labels for every requirement', () => {
    expect(CAREERS_MARKETS.map((m) => m.id)).toEqual(['in', 'gb', 'us', 'au', 'nz']);
    for (const m of CAREERS_MARKETS) {
      expect(Object.keys(m.rightsLabels).sort()).toEqual(
        ['citizen_only', 'citizen_or_pr', 'clearance_required', 'no_sponsorship', 'sponsorship_available', 'unspecified', 'work_rights_required'],
      );
    }
  });

  it('holds no contribution rates, percentages or other ageing figures', () => {
    for (const file of sources) {
      const text = readFileSync(join(dir, file), 'utf8');
      expect([file, /\b\d+(?:\.\d+)?\s?%/.test(text)]).toEqual([file, false]);
      expect([file, /\b0\.\d+\b/.test(text)]).toEqual([file, false]);
    }
  });

  it('stays browser-safe: no node: imports in the market layer', () => {
    for (const file of sources) {
      expect([file, /from ['"]node:/.test(readFileSync(join(dir, file), 'utf8'))]).toEqual([file, false]);
    }
  });
});
