/**
 * United States.
 *
 * ON THE FIGURES
 * --------------
 * Yields are indicative averages for widely available retail products in mid
 * 2026 and are labelled as such wherever they render. They are a starting point
 * for a comparison, not a quote: the spread between the best and the median
 * high-yield savings account is routinely wider than the gap between two of the
 * categories below.
 *
 * Only FEDERAL tax is modelled. Treasury bills and Treasury money market funds
 * are additionally exempt from state and local income tax, which is worth real
 * money in California or New York and nothing at all in Texas or Florida —
 * modelling it would require a state, so the instrument notes say so instead of
 * the arithmetic pretending to know.
 *
 * Peer benchmarks are anchored on the Federal Reserve's Survey of Consumer
 * Finances (median net worth by age of head of household) and Census Bureau
 * median personal earnings, interpolated onto this tool's narrower age bands.
 * They describe a median, which is not a target — see the note in the UI.
 */

/*
 * THE FDIC LIMIT IS NOT IN THIS FILE
 * ----------------------------------
 * For the same reason the FSCS limit is not in `gb.ts`: a legal threshold
 * written into prose carries no effective date, so nothing can tell when it has
 * lapsed. The UK's did, and stayed wrong in four sentences until somebody went
 * looking. The figure, its ownership-category rules and its conditions live
 * once in `src/reference/deposits.ts`, and the descriptions here refer to it.
 */

import type { MarketPack } from './types';

export const US_MARKET: MarketPack = {
  id: 'US',
  name: 'United States',
  flag: '🇺🇸',
  country: 'us',
  currency: 'USD',
  locale: 'en-US',
  asOf: '2026-06',
  sources: [
    'Federal Reserve Survey of Consumer Finances (median net worth by age)',
    'US Census Bureau median personal earnings by age',
    'Published retail rates for savings, CDs, Treasury bills and money market funds',
  ],
  icon: 'dollar',

  park: {
    minAmount: 100,
    splitThreshold: 10000,
    treatments: {
      // Interest and short-term gains are ordinary income at the marginal rate.
      taxable: {},
      // Federally tax-exempt. State treatment varies and is not modelled.
      muni: { exempt: true },
    },
    options: [
      { n: 'High-yield savings', rate: 4.0, tax: 'taxable', liquid: true, risk: 'None', ic: 'bank', d: 'Covered by the FDIC limit, per depositor per ownership category. Online banks pay 4%+ while big-bank savings pays near zero — the gap is the whole decision.', minM: 0 },
      { n: 'Government money market fund', rate: 4.15, tax: 'taxable', liquid: true, risk: 'Very low', ic: 'invest-cat', d: 'Settles same or next day. Holds Treasury and agency repo. Not FDIC insured, but has never broken the buck in this category.', minM: 0 },
      { n: 'Treasury money market fund', rate: 4.1, tax: 'taxable', liquid: true, risk: 'Negligible', ic: 'shield', d: 'Direct Treasury holdings. Interest is exempt from state and local income tax — worth roughly another 0.3–0.5% if you file in a high-tax state.', minM: 0 },
      { n: '3-month T-bill', rate: 4.1, tax: 'taxable', liquid: false, risk: 'None', ic: 'bills', d: 'Backed by the US Treasury. Buy at TreasuryDirect or through a broker. State-tax exempt. Sellable early on the secondary market at the going price.', minM: 3 },
      { n: '6-month CD', rate: 4.05, tax: 'taxable', liquid: false, risk: 'None', ic: 'lock', d: 'FDIC insured within the limit. Rate locked for the term. Early withdrawal typically forfeits 3–6 months of interest.', minM: 6 },
      { n: '1-year CD', rate: 4.0, tax: 'taxable', liquid: false, risk: 'None', ic: 'lock', d: 'FDIC insured within the limit. Best when you are confident about the date you need the money and rates are expected to fall.', minM: 12 },
      { n: 'Municipal money market fund', rate: 2.8, tax: 'muni', liquid: true, risk: 'Very low', ic: 'award', d: 'Interest is exempt from federal income tax. The lower headline rate wins only in the 32% bracket and above — this tool does that comparison for you.', minM: 0 },
      { n: 'Short-term Treasury ETF', rate: 4.2, tax: 'taxable', liquid: true, risk: 'Low', ic: 'trending', d: '0–1 year Treasuries in an ETF wrapper. Trades like a stock, settles T+1. Tiny price moves as rates shift.', minM: 3 },
      { n: 'Ultra-short bond fund', rate: 4.5, tax: 'taxable', liquid: true, risk: 'Low', ic: 'zap', d: 'Investment-grade corporate and asset-backed paper under a year. Higher yield than Treasuries, with credit risk that shows up exactly when you least want it.', minM: 3 },
      { n: 'Brokerage cash sweep', rate: 3.7, tax: 'taxable', liquid: true, risk: 'None', ic: 'layers', d: 'Whatever your broker pays on uninvested cash. Zero effort and instantly available — and usually 0.3–2% below a money market fund you could buy in the same account.', minM: 0 },
    ],
    rateLabel: 'Federal marginal tax rate',
    rateOptions: [
      { value: 0, label: '0% (no federal tax owed)' },
      { value: 10, label: '10%' },
      { value: 12, label: '12%' },
      { value: 22, label: '22%' },
      { value: 24, label: '24%' },
      { value: 32, label: '32%' },
      { value: 35, label: '35%' },
      { value: 37, label: '37%' },
    ],
    defaultRate: 22,
    quickAmounts: [1000, 5000, 25000, 50000, 100000],
    taxNote: 'Returns are shown after federal income tax at your marginal rate. State and local tax is not modelled — Treasury and municipal options are better than they look here if you file in a high-tax state.',
    keepInMind: 'Rates shown are indicative averages — the spread between the best high-yield savings account and the median one is usually wider than the gap between two categories here, so shop the rate itself. Only federal tax is modelled: Treasury bills and Treasury money market funds are also exempt from state and local income tax, which is worth real money in California or New York and nothing in Texas or Florida. CDs are quoted as APY and break early at a cost. And whatever you choose, keep 3–6 months of expenses somewhere you can reach the same day.',
  },

  invest: {
    inflation: 0.025,
    rates: { conservative: 0.055, moderate: 0.075, aggressive: 0.09 },
    alloc: {
      conservative: [
        { n: 'Total bond market index', p: 32, c: '#1d7d46' }, { n: 'Total US stock index', p: 25, c: '#0071e3' },
        { n: 'Short-term Treasuries', p: 15, c: '#0c8079' }, { n: 'TIPS', p: 10, c: '#b08a36' },
        { n: 'International stock index', p: 10, c: '#6e3bd4' }, { n: 'Money market fund', p: 8, c: '#c2410c' }],
      moderate: [
        { n: 'Total US stock index', p: 40, c: '#0071e3' }, { n: 'Total bond market index', p: 22, c: '#1d7d46' },
        { n: 'International stock index', p: 18, c: '#6e3bd4' }, { n: 'REIT index', p: 7, c: '#c2410c' },
        { n: 'TIPS', p: 6, c: '#b08a36' }, { n: 'Money market fund', p: 7, c: '#0c8079' }],
      aggressive: [
        { n: 'Total US stock index', p: 42, c: '#0071e3' }, { n: 'International stock index', p: 20, c: '#6e3bd4' },
        { n: 'Small-cap value', p: 13, c: '#1d7d46' }, { n: 'Emerging markets', p: 10, c: '#b3387a' },
        { n: 'Total bond market index', p: 10, c: '#b08a36' }, { n: 'High-risk / crypto', p: 5, c: '#0c8079' }],
    },
    taxInsight:
      'Order matters more than picks: take the full 401(k) employer match first — it is an immediate 50–100% return no fund can beat. Then an HSA if you are on a high-deductible plan, then a Roth or Traditional IRA, then back to the 401(k) up to the limit, and only then a taxable brokerage.',
    sipExample: 'Even a $100/month automatic investment started today beats a $500/month one started in five years.',
    money: (n: number) => `$${Math.round(n).toLocaleString('en-US')}`,
    monthlyTerm: 'Monthly contribution',
    defaults: { age: 25, income: 5000, monthly: 500, risk: 'moderate', horizon: '5-10', goal: 'wealth' },
  },

  peer: {
    fallbackCity: 'metroother',
    cityLabel: 'Your metro area',
    population:
      'Working adults in your age band, in metro areas of the same cost tier as yours.',
    basis:
      'Reference estimates built from Federal Reserve Survey of Consumer Finances medians by age and Census Bureau earnings by age, scaled by a metro cost-of-living multiplier. Not a survey of FinatriX users.',
    cities: {
      sanfrancisco: { l: 'San Francisco Bay Area', tier: 'metro', col: 1.35 },
      newyork: { l: 'New York', tier: 'metro', col: 1.25 },
      boston: { l: 'Boston', tier: 'metro', col: 1.18 },
      losangeles: { l: 'Los Angeles', tier: 'metro', col: 1.16 },
      seattle: { l: 'Seattle', tier: 'metro', col: 1.15 },
      washington: { l: 'Washington DC', tier: 'metro', col: 1.14 },
      miami: { l: 'Miami', tier: 'metro', col: 1.1 },
      denver: { l: 'Denver', tier: 'metro', col: 1.06 },
      chicago: { l: 'Chicago', tier: 'metro', col: 1.02 },
      austin: { l: 'Austin', tier: 'metro', col: 1.02 },
      philadelphia: { l: 'Philadelphia', tier: 'tier2', col: 1.03 },
      atlanta: { l: 'Atlanta', tier: 'tier2', col: 0.99 },
      phoenix: { l: 'Phoenix', tier: 'tier2', col: 0.99 },
      dallas: { l: 'Dallas–Fort Worth', tier: 'tier2', col: 0.98 },
      houston: { l: 'Houston', tier: 'tier2', col: 0.96 },
      metroother: { l: 'Other large metro', tier: 'metro', col: 1.0 },
      tier2other: { l: 'Other mid-size city', tier: 'tier2', col: 1.0 },
      tier3: { l: 'Small town / rural', tier: 'tier3', col: 1.0 },
    },
    bench: {
      '18-22': { income: { metro: 2800, tier2: 2200, tier3: 1900 }, savings: 3000, invest: 1500, rate: 6, expenses: { metro: 2400, tier2: 1900, tier3: 1650 }, nw: 4000 },
      '23-25': { income: { metro: 4200, tier2: 3300, tier3: 2800 }, savings: 9000, invest: 6000, rate: 9, expenses: { metro: 3400, tier2: 2700, tier3: 2300 }, nw: 14000 },
      '26-28': { income: { metro: 5200, tier2: 4100, tier3: 3400 }, savings: 15000, invest: 18000, rate: 12, expenses: { metro: 4000, tier2: 3200, tier3: 2700 }, nw: 30000 },
      '29-32': { income: { metro: 6100, tier2: 4800, tier3: 4000 }, savings: 22000, invest: 42000, rate: 14, expenses: { metro: 4600, tier2: 3700, tier3: 3100 }, nw: 62000 },
      '33-37': { income: { metro: 7000, tier2: 5500, tier3: 4600 }, savings: 30000, invest: 85000, rate: 15, expenses: { metro: 5200, tier2: 4200, tier3: 3500 }, nw: 120000 },
      '38-45': { income: { metro: 7800, tier2: 6100, tier3: 5100 }, savings: 40000, invest: 150000, rate: 16, expenses: { metro: 5800, tier2: 4700, tier3: 3900 }, nw: 200000 },
      '46+': { income: { metro: 8200, tier2: 6400, tier3: 5300 }, savings: 55000, invest: 260000, rate: 17, expenses: { metro: 6000, tier2: 4900, tier3: 4100 }, nw: 300000 },
    },
    sipExample: 'Even a $100/month automatic investment started today beats a $500/month one started in five years.',
    money: (n: number) => `$${Math.round(n).toLocaleString('en-US')}`,
    defaults: {
      age: 25, cityKey: 'metroother', income: 5000, savings: 12000,
      invest: 15000, debt: 0, rate: 12, expenses: 3800,
    },
  },

  goals: {
    paths: [
      { n: 'Aggressive path', d: 'Small-cap and emerging-market heavy · higher volatility, higher reward', rate: 0.1, c: '#c2410c', inst: 'Total US stock index, small-cap value, emerging markets, sector funds' },
      { n: 'Moderate path', d: 'Broad index core with bonds · steady growth, managed risk', rate: 0.075, c: '#b08a36', inst: 'Total US stock index, international index, total bond market, REITs' },
      { n: 'Conservative path', d: 'Bond and Treasury heavy · capital preservation first', rate: 0.05, c: '#0c8079', inst: 'Total bond market, TIPS, short-term Treasuries, CDs, money market funds' },
    ],
    presets: [
      ['Dream home', 'ic-home', 400000, 10], ['New car', 'ic-car', 35000, 3], ['Europe trip', 'ic-compass', 8000, 2],
      ['Wedding fund', 'ic-award', 30000, 5], ['$1 Million club', 'ic-dollar', 1000000, 20], ['Retirement', 'ic-sun', 1500000, 30],
    ],
    inflation: 0.025,
    minTarget: 100,
  },

  netWorth: {
    labels: {
      deposits: 'CDs & savings bonds',
      retirement: '401(k), IRA & HSA',
      gold: 'Gold & collectibles',
      education_loan: 'Student loans',
    },
  },
};
