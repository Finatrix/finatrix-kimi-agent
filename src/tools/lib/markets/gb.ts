/**
 * United Kingdom.
 *
 * ON THE FIGURES
 * --------------
 * Yields are indicative averages for widely available retail accounts in mid
 * 2026. The best-buy tables move weekly and the gap between a legacy high-street
 * account and a current best buy is frequently larger than the gap between any
 * two categories here.
 *
 * The Personal Savings Allowance is modelled properly rather than as a flat
 * figure: £1,000 of savings interest is tax-free at the basic rate, £500 at the
 * higher rate and nothing at the additional rate. That taper is exactly why a
 * Cash ISA beats a marginally better-paying taxable account for a lot of people,
 * and flattening it would have hidden the one comparison this tool exists to
 * make.
 *
 * Premium Bonds are shown at the published annual prize rate. That is a *mean*
 * across all holders, and the median holder with a small holding wins less than
 * it — the note on the option says so.
 *
 * Peer benchmarks are anchored on ONS Annual Survey of Hours and Earnings
 * (median gross pay by age) and ONS Household Wealth statistics, interpolated
 * onto this tool's age bands.
 */

import type { MarketPack } from './types';

/**
 * The Personal Savings Allowance, by marginal rate.
 *
 * Written as a function because it is one: HMRC gives £1,000 to a basic-rate
 * taxpayer, halves it at the higher rate and withdraws it entirely at the
 * additional rate.
 */
const personalSavingsAllowance = (marginalRate: number): number => {
  if (marginalRate >= 0.45) return 0;
  if (marginalRate >= 0.4) return 500;
  return 1000;
};

export const GB_MARKET: MarketPack = {
  id: 'GB',
  name: 'United Kingdom',
  flag: '🇬🇧',
  country: 'gb',
  currency: 'GBP',
  locale: 'en-GB',
  asOf: '2026-06',
  sources: [
    'ONS Annual Survey of Hours and Earnings (median gross pay by age)',
    'ONS Household Total Wealth statistics',
    'Published best-buy rates for savings, ISAs and fixed-rate bonds; NS&I prize rate',
  ],
  icon: 'bank',

  park: {
    minAmount: 100,
    splitThreshold: 10000,
    treatments: {
      // Taxable savings interest, with the Personal Savings Allowance applied.
      savings: { allowanceFor: personalSavingsAllowance },
      // Inside an ISA, or an NS&I prize — no income tax at all.
      taxFree: { exempt: true },
    },
    options: [
      { n: 'Cash ISA (easy access)', rate: 4.2, tax: 'taxFree', liquid: true, risk: 'None', ic: 'shield', d: 'Tax-free for life, and it never touches your Personal Savings Allowance. £20,000 a year across all ISAs. FSCS protected to £85,000.', minM: 0 },
      { n: 'Easy-access savings', rate: 4.1, tax: 'savings', liquid: true, risk: 'None', ic: 'bank', d: 'Instant access, FSCS protected to £85,000. Interest counts against your Personal Savings Allowance, so the effective rate depends on your tax band.', minM: 0 },
      { n: 'Money market fund', rate: 4.45, tax: 'savings', liquid: true, risk: 'Very low', ic: 'invest-cat', d: 'Short-dated government and bank paper, settling in a day or two. Not FSCS protected as a deposit — it is an investment, not a bank account.', minM: 0 },
      { n: '90-day notice account', rate: 4.35, tax: 'savings', liquid: false, risk: 'None', ic: 'clock', d: 'Higher rate in exchange for three months of notice before you can withdraw. FSCS protected.', minM: 3 },
      { n: '1-year fixed-rate bond', rate: 4.3, tax: 'savings', liquid: false, risk: 'None', ic: 'lock', d: 'Rate locked for twelve months, FSCS protected. Most providers do not permit early withdrawal at all — not merely at a penalty.', minM: 12 },
      { n: 'Short gilt fund', rate: 4.25, tax: 'savings', liquid: true, risk: 'Low', ic: 'bills', d: 'UK government bonds under five years. No credit risk, small price moves when rates shift. Gilts are exempt from capital gains tax.', minM: 3 },
      { n: 'Premium Bonds', rate: 3.6, tax: 'taxFree', liquid: true, risk: 'None', ic: 'award', d: 'NS&I, backed by HM Treasury, prizes free of tax. The rate shown is the published annual prize fund rate — an average. With a small holding the most likely outcome is winning less than it.', minM: 0 },
      { n: 'NS&I Direct Saver', rate: 3.75, tax: 'savings', liquid: true, risk: 'None', ic: 'layers', d: '100% Treasury backed with no FSCS limit, which matters above £85,000. Rarely a best buy on rate alone.', minM: 0 },
    ],
    rateLabel: 'Income tax band',
    rateOptions: [
      { value: 0, label: '0% (within Personal Allowance)' },
      { value: 20, label: '20% — basic rate' },
      { value: 40, label: '40% — higher rate' },
      { value: 45, label: '45% — additional rate' },
    ],
    defaultRate: 20,
    quickAmounts: [1000, 5000, 20000, 50000, 100000],
    taxNote: 'Returns are shown after income tax, with your Personal Savings Allowance applied — £1,000 at the basic rate, £500 at the higher rate, nothing at the additional rate.',
    keepInMind: 'Rates shown are indicative averages and the best-buy tables move weekly — a legacy high-street account is often 3% behind the market. Use the ISA allowance before a taxable account: it never touches your Personal Savings Allowance and never has to be declared. FSCS protection is £85,000 per banking licence, not per account, so two accounts at brands sharing a licence are covered once. And whatever you choose, keep 3–6 months of expenses in something instant-access.',
  },

  invest: {
    inflation: 0.025,
    rates: { conservative: 0.05, moderate: 0.07, aggressive: 0.085 },
    alloc: {
      conservative: [
        { n: 'Global bond fund', p: 30, c: '#1d7d46' }, { n: 'Global equity index', p: 25, c: '#0071e3' },
        { n: 'Short gilts', p: 15, c: '#0c8079' }, { n: 'Cash ISA', p: 15, c: '#b08a36' },
        { n: 'UK equity income', p: 10, c: '#6e3bd4' }, { n: 'Gold ETC', p: 5, c: '#c2410c' }],
      moderate: [
        { n: 'Global equity index', p: 40, c: '#0071e3' }, { n: 'Global bond fund', p: 22, c: '#1d7d46' },
        { n: 'UK equity', p: 12, c: '#0c8079' }, { n: 'Cash ISA', p: 10, c: '#b08a36' },
        { n: 'Emerging markets', p: 8, c: '#b3387a' }, { n: 'Property / REIT', p: 8, c: '#c2410c' }],
      aggressive: [
        { n: 'Global equity index', p: 42, c: '#0071e3' }, { n: 'US equity', p: 18, c: '#6e3bd4' },
        { n: 'Emerging markets', p: 14, c: '#b3387a' }, { n: 'Global small-cap', p: 12, c: '#1d7d46' },
        { n: 'Global bond fund', p: 9, c: '#b08a36' }, { n: 'High-risk / crypto', p: 5, c: '#0c8079' }],
    },
    taxInsight:
      'Fill the ISA allowance first — £20,000 a year, and everything inside it is free of income and capital gains tax permanently, with no reporting. Then pension contributions, which get relief at your marginal rate; if your employer matches, that match beats every fund choice on this page.',
    sipExample: 'Even a £100/month standing order started today beats a £500/month one started in five years.',
    money: (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`,
    monthlyTerm: 'Monthly contribution',
    defaults: { age: 25, income: 3000, monthly: 300, risk: 'moderate', horizon: '5-10', goal: 'wealth' },
  },

  peer: {
    fallbackCity: 'metroother',
    cityLabel: 'Where you live',
    cities: {
      london: { l: 'London', tier: 'metro', col: 1.3 },
      cambridge: { l: 'Cambridge', tier: 'metro', col: 1.15 },
      oxford: { l: 'Oxford', tier: 'metro', col: 1.14 },
      bristol: { l: 'Bristol', tier: 'metro', col: 1.08 },
      edinburgh: { l: 'Edinburgh', tier: 'metro', col: 1.05 },
      manchester: { l: 'Manchester', tier: 'metro', col: 1.0 },
      birmingham: { l: 'Birmingham', tier: 'metro', col: 0.97 },
      leeds: { l: 'Leeds', tier: 'tier2', col: 0.96 },
      cardiff: { l: 'Cardiff', tier: 'tier2', col: 0.95 },
      glasgow: { l: 'Glasgow', tier: 'tier2', col: 0.94 },
      liverpool: { l: 'Liverpool', tier: 'tier2', col: 0.92 },
      newcastle: { l: 'Newcastle', tier: 'tier2', col: 0.9 },
      belfast: { l: 'Belfast', tier: 'tier2', col: 0.9 },
      metroother: { l: 'Other city', tier: 'metro', col: 1.0 },
      tier2other: { l: 'Other town', tier: 'tier2', col: 1.0 },
      tier3: { l: 'Village / rural', tier: 'tier3', col: 1.0 },
    },
    bench: {
      '18-22': { income: { metro: 1750, tier2: 1450, tier3: 1300 }, savings: 2000, invest: 900, rate: 7, expenses: { metro: 1500, tier2: 1250, tier3: 1100 }, nw: 2500 },
      '23-25': { income: { metro: 2500, tier2: 2050, tier3: 1850 }, savings: 6000, invest: 3500, rate: 10, expenses: { metro: 2050, tier2: 1700, tier3: 1500 }, nw: 9000 },
      '26-28': { income: { metro: 3000, tier2: 2450, tier3: 2200 }, savings: 11000, invest: 9000, rate: 13, expenses: { metro: 2350, tier2: 1950, tier3: 1750 }, nw: 20000 },
      '29-32': { income: { metro: 3500, tier2: 2850, tier3: 2550 }, savings: 17000, invest: 22000, rate: 15, expenses: { metro: 2700, tier2: 2250, tier3: 2000 }, nw: 42000 },
      '33-37': { income: { metro: 3900, tier2: 3200, tier3: 2850 }, savings: 24000, invest: 45000, rate: 16, expenses: { metro: 3000, tier2: 2500, tier3: 2200 }, nw: 78000 },
      '38-45': { income: { metro: 4200, tier2: 3450, tier3: 3050 }, savings: 32000, invest: 78000, rate: 17, expenses: { metro: 3200, tier2: 2700, tier3: 2400 }, nw: 135000 },
      '46+': { income: { metro: 4300, tier2: 3500, tier3: 3100 }, savings: 42000, invest: 130000, rate: 18, expenses: { metro: 3300, tier2: 2750, tier3: 2450 }, nw: 200000 },
    },
    sipExample: 'Even a £100/month standing order started today beats a £500/month one started in five years.',
    money: (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`,
    defaults: {
      age: 25, cityKey: 'metroother', income: 3000, savings: 8000,
      invest: 8000, debt: 0, rate: 13, expenses: 2300,
    },
  },

  goals: {
    paths: [
      { n: 'Aggressive path', d: 'Global small-cap and emerging heavy · higher volatility, higher reward', rate: 0.095, c: '#c2410c', inst: 'Global equity index, US equity, emerging markets, global small-cap — inside an ISA' },
      { n: 'Moderate path', d: 'Global index core with bonds · steady growth, managed risk', rate: 0.07, c: '#b08a36', inst: 'Global equity index, UK equity, global bond fund, property — inside an ISA' },
      { n: 'Conservative path', d: 'Gilt and cash heavy · capital preservation first', rate: 0.045, c: '#0c8079', inst: 'Short gilts, global bond fund, Cash ISA, money market funds' },
    ],
    presets: [
      ['First home deposit', 'ic-home', 60000, 5], ['New car', 'ic-car', 25000, 3], ['Big holiday', 'ic-compass', 5000, 2],
      ['Wedding fund', 'ic-award', 25000, 5], ['£1 Million club', 'ic-dollar', 1000000, 20], ['Retirement', 'ic-sun', 1000000, 30],
    ],
    inflation: 0.025,
    minTarget: 100,
  },

  netWorth: {
    labels: {
      deposits: 'Cash ISAs & fixed bonds',
      retirement: 'Pensions & SIPPs',
      equity: 'Stocks & Shares ISA / GIA',
      gold: 'Gold & collectibles',
      education_loan: 'Student loan',
    },
  },
};
