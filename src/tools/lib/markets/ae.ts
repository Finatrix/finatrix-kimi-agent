/**
 * United Arab Emirates.
 *
 * ON THE FIGURES
 * --------------
 * Yields are indicative averages for retail products available to UAE residents
 * in mid 2026. Dirham rates track US dollar rates closely because the AED is
 * pegged, so this pack moves when the Fed moves.
 *
 * TAX. The UAE levies no personal income tax on salary, savings interest or
 * investment gains for residents, so every instrument here is `taxFree` and the
 * marginal-rate control has one honest setting. That is not a modelling
 * shortcut — it is the actual rule, and it is the single biggest reason the
 * ranking looks different here than anywhere else in this product.
 *
 * The corporate tax introduced in 2023 applies to businesses, not to an
 * individual's salary or personal savings, and is out of scope for a personal
 * cash-parking comparison.
 *
 * Peer benchmarks are the softest data in this file and are labelled as
 * indicative in the UI. The UAE publishes no household wealth survey comparable
 * to the SCF or ONS, so these are built from published salary-guide medians and
 * expatriate cost-of-living surveys. Treat them as orientation, not as a
 * measurement.
 */

import type { MarketPack } from './types';

export const AE_MARKET: MarketPack = {
  id: 'AE',
  name: 'United Arab Emirates',
  flag: '🇦🇪',
  country: 'ae',
  currency: 'AED',
  locale: 'en-AE',
  asOf: '2026-06',
  sources: [
    'Published UAE retail bank deposit and savings rates',
    'Recruiter salary guides for the UAE market (median base pay by experience)',
    'Expatriate cost-of-living surveys across the seven emirates',
  ],
  icon: 'bank',

  park: {
    minAmount: 1000,
    splitThreshold: 50000,
    treatments: {
      // No personal income tax for UAE residents.
      taxFree: { exempt: true },
    },
    options: [
      { n: 'Short-term bond fund', rate: 4.5, tax: 'taxFree', liquid: true, risk: 'Low', ic: 'trending', d: 'Investment-grade paper under three years, usually USD-denominated. Higher yield than a deposit, with credit and small duration risk.', minM: 3 },
      { n: 'Money market fund', rate: 4.4, tax: 'taxFree', liquid: true, risk: 'Very low', ic: 'invest-cat', d: 'Short-dated bank and government paper, redeemable in a day or two. Held at a fund manager, not a bank — no deposit guarantee.', minM: 0 },
      { n: 'Sukuk fund', rate: 4.3, tax: 'taxFree', liquid: true, risk: 'Low', ic: 'shield', d: 'Shariah-compliant fixed income. Returns come from asset rentals and profit-sharing rather than interest, and track conventional bonds closely.', minM: 3 },
      { n: 'Wakala deposit', rate: 4.25, tax: 'taxFree', liquid: false, risk: 'None*', ic: 'lock', d: 'Islamic bank term deposit — your money is invested on your behalf for an agreed expected profit rate. Early exit reduces the profit paid.', minM: 3 },
      { n: 'Fixed deposit (1 yr)', rate: 4.2, tax: 'taxFree', liquid: false, risk: 'None*', ic: 'lock', d: 'Rate locked for the term at a UAE bank. Breaking early typically costs 1% or the difference to the shorter-term rate.', minM: 6 },
      { n: 'US T-bill via broker', rate: 4.1, tax: 'taxFree', liquid: false, risk: 'None', ic: 'bills', d: 'US Treasury backed, bought through an international broker. The AED is pegged to the dollar, so currency risk is minimal in practice — but the peg is a policy, not a law.', minM: 3 },
      { n: 'Call / notice deposit', rate: 3.6, tax: 'taxFree', liquid: true, risk: 'None*', ic: 'clock', d: 'Withdraw at short notice while earning more than a current account. The usual home for an emergency fund here.', minM: 0 },
      { n: 'Savings account', rate: 2.5, tax: 'taxFree', liquid: true, risk: 'None*', ic: 'bank', d: 'Instant access at your existing bank. Rates vary enormously between banks and by balance tier — check yours before assuming this number.', minM: 0 },
    ],
    rateLabel: 'Personal income tax',
    rateOptions: [
      { value: 0, label: '0% — no personal income tax in the UAE' },
    ],
    defaultRate: 0,
    quickAmounts: [5000, 25000, 100000, 250000, 500000],
    taxNote: 'The UAE levies no personal income tax, so gross and post-tax returns are the same figure. If you remain tax-resident elsewhere — US citizens always are — your home country may still tax this income.',
    keepInMind: 'Rates shown are indicative and vary sharply between banks and balance tiers — check your own before assuming this figure. UAE deposit rates track US dollar rates because the dirham is pegged, so they move when the Fed moves. There is no personal income tax, but if you are still tax-resident elsewhere — as every US citizen is — that country taxes this income anyway. And with no state safety net here, keep 6 months of expenses liquid rather than 3, plus the cost of a flight home.',
  },

  invest: {
    inflation: 0.025,
    rates: { conservative: 0.055, moderate: 0.075, aggressive: 0.09 },
    alloc: {
      conservative: [
        { n: 'Global bond fund', p: 30, c: '#1d7d46' }, { n: 'Global equity index', p: 25, c: '#0071e3' },
        { n: 'Sukuk fund', p: 20, c: '#0c8079' }, { n: 'Fixed deposits', p: 15, c: '#b08a36' },
        { n: 'Gold ETF', p: 10, c: '#c2410c' }],
      moderate: [
        { n: 'Global equity index', p: 38, c: '#0071e3' }, { n: 'US equity', p: 18, c: '#6e3bd4' },
        { n: 'Global bond fund', p: 18, c: '#1d7d46' }, { n: 'Sukuk fund', p: 9, c: '#0c8079' },
        { n: 'Gold ETF', p: 9, c: '#c2410c' }, { n: 'UAE / GCC equity', p: 8, c: '#b3387a' }],
      aggressive: [
        { n: 'Global equity index', p: 40, c: '#0071e3' }, { n: 'US equity', p: 22, c: '#6e3bd4' },
        { n: 'Emerging markets', p: 14, c: '#b3387a' }, { n: 'UAE / GCC equity', p: 10, c: '#1d7d46' },
        { n: 'Global bond fund', p: 9, c: '#b08a36' }, { n: 'High-risk / crypto', p: 5, c: '#0c8079' }],
    },
    taxInsight:
      'There is no personal income tax here, so there is no tax shelter to optimise — which changes what matters. Check what your end-of-service gratuity will actually pay, keep enough to fly home and live for six months, and remember that if you are still tax-resident elsewhere (every US citizen is) that country taxes this income regardless of where you earned it.',
    sipExample: 'Even an AED 500/month automatic investment started today beats an AED 2,500/month one started in five years.',
    money: (n: number) => `AED ${Math.round(n).toLocaleString('en-US')}`,
    monthlyTerm: 'Monthly contribution',
    defaults: { age: 28, income: 15000, monthly: 3000, risk: 'moderate', horizon: '5-10', goal: 'wealth' },
  },

  peer: {
    fallbackCity: 'dubai',
    cityLabel: 'Where you live',
    population:
      'Employed residents in your age band, in emirates of the same cost tier as yours. Mostly expatriate, which is what the UAE workforce is.',
    basis:
      'Reference estimates built from recruiter salary guides for the UAE and expatriate cost-of-living surveys, scaled by an emirate cost multiplier. Not a survey of FinatriX users.',
    cities: {
      dubai: { l: 'Dubai', tier: 'metro', col: 1.15 },
      abudhabi: { l: 'Abu Dhabi', tier: 'metro', col: 1.1 },
      sharjah: { l: 'Sharjah', tier: 'tier2', col: 0.85 },
      rasalkhaimah: { l: 'Ras Al Khaimah', tier: 'tier2', col: 0.8 },
      fujairah: { l: 'Fujairah', tier: 'tier2', col: 0.8 },
      ajman: { l: 'Ajman', tier: 'tier2', col: 0.78 },
      ummalquwain: { l: 'Umm Al Quwain', tier: 'tier3', col: 0.75 },
      tier2other: { l: 'Other emirate', tier: 'tier2', col: 0.85 },
    },
    bench: {
      '18-22': { income: { metro: 5500, tier2: 4200, tier3: 3600 }, savings: 12000, invest: 5000, rate: 12, expenses: { metro: 4200, tier2: 3300, tier3: 2900 }, nw: 15000 },
      '23-25': { income: { metro: 9000, tier2: 7000, tier3: 6000 }, savings: 35000, invest: 18000, rate: 18, expenses: { metro: 6500, tier2: 5100, tier3: 4400 }, nw: 48000 },
      '26-28': { income: { metro: 13000, tier2: 10000, tier3: 8500 }, savings: 70000, invest: 55000, rate: 22, expenses: { metro: 9000, tier2: 7000, tier3: 6000 }, nw: 120000 },
      '29-32': { income: { metro: 18000, tier2: 14000, tier3: 11500 }, savings: 120000, invest: 130000, rate: 25, expenses: { metro: 12000, tier2: 9400, tier3: 8000 }, nw: 240000 },
      '33-37': { income: { metro: 24000, tier2: 18500, tier3: 15500 }, savings: 190000, invest: 260000, rate: 27, expenses: { metro: 15500, tier2: 12200, tier3: 10300 }, nw: 420000 },
      '38-45': { income: { metro: 31000, tier2: 24000, tier3: 20000 }, savings: 280000, invest: 460000, rate: 29, expenses: { metro: 19500, tier2: 15300, tier3: 12900 }, nw: 700000 },
      '46+': { income: { metro: 36000, tier2: 28000, tier3: 23000 }, savings: 380000, invest: 700000, rate: 30, expenses: { metro: 22000, tier2: 17300, tier3: 14600 }, nw: 1000000 },
    },
    sipExample: 'Even an AED 500/month automatic investment started today beats an AED 2,500/month one started in five years.',
    money: (n: number) => `AED ${Math.round(n).toLocaleString('en-US')}`,
    defaults: {
      age: 28, cityKey: 'dubai', income: 15000, savings: 60000,
      invest: 40000, debt: 0, rate: 22, expenses: 9000,
    },
  },

  goals: {
    paths: [
      { n: 'Aggressive path', d: 'Global and GCC equity heavy · higher volatility, higher reward', rate: 0.1, c: '#c2410c', inst: 'Global equity ETF, US equity, emerging markets, UAE and GCC equity' },
      { n: 'Moderate path', d: 'Global index core with sukuk · steady growth, managed risk', rate: 0.075, c: '#b08a36', inst: 'Global equity ETF, US equity, global bond fund, sukuk fund, gold' },
      { n: 'Conservative path', d: 'Sukuk and deposit heavy · capital preservation first', rate: 0.05, c: '#0c8079', inst: 'Sukuk funds, global bond fund, wakala and fixed deposits, money market funds' },
    ],
    presets: [
      ['Property down payment', 'ic-home', 400000, 5], ['New car', 'ic-car', 120000, 3], ['Europe trip', 'ic-compass', 20000, 2],
      ['Wedding fund', 'ic-award', 150000, 5], ['AED 5 Million club', 'ic-dollar', 5000000, 20], ['Retirement', 'ic-sun', 6000000, 30],
    ],
    inflation: 0.025,
    minTarget: 1000,
  },

  netWorth: {
    labels: {
      deposits: 'Fixed & wakala deposits',
      retirement: 'Gratuity & pension',
      gold: 'Gold & jewellery',
    },
  },
};
