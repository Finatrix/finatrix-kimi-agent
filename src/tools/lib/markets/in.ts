/**
 * India — the market FinatriX was built for.
 *
 * Everything here is a re-export of the constants the tools already shipped
 * with. Nothing is recalculated, rephrased or re-rated: this file exists so that
 * India becomes *one of* the markets rather than the hard-coded assumption
 * underneath all of them, and the parity suites are what prove the values made
 * the trip unchanged.
 *
 * The one genuine addition is provenance. `asOf` and `sources` were not part of
 * the original tables, and their absence was a real gap — a reader looking at
 * "Liquid mutual fund 7.0%" had no way to know when that was true. Recording it
 * does not change a single figure.
 */

import type { MarketPack } from './types';
import { IN_PARK } from '../parksmart';
import { IN_INVEST, IM_DEFAULTS } from '../investmatch';
import { IN_PEER } from '../peercompare';
import { GP_PRESETS, GP_PATHS } from '../goals';

export const IN_MARKET: MarketPack = {
  id: 'IN',
  name: 'India',
  flag: '🇮🇳',
  country: 'in',
  currency: 'INR',
  locale: 'en-IN',
  asOf: '2026-06',
  sources: [
    'RBI and scheduled-bank published card rates',
    'AMFI category averages for debt mutual funds',
    'Income Tax Act provisions current for AY 2026–27',
  ],
  icon: 'bank',

  park: {
    ...IN_PARK,
    rateLabel: 'Income-tax slab',
    rateOptions: [
      { value: 0, label: '0% — total income below the nil-tax threshold (new regime)' },
      { value: 5, label: '5%' },
      { value: 10, label: '10%' },
      { value: 15, label: '15%' },
      { value: 20, label: '20%' },
      { value: 25, label: '25%' },
      { value: 30, label: '30%' },
    ],
    defaultRate: 20,
    quickAmounts: [25000, 100000, 500000, 1000000, 2500000],
    taxNote: 'Returns are shown after tax at your slab, with 80TTA and equity LTCG applied where they are due.',
    keepInMind: 'Returns are indicative category averages — actual fund and FD rates vary, so compare before committing. Arbitrage funds enjoy equity taxation (20% STCG, 12.5% LTCG beyond the exemption), which beats slab tax for higher earners. Debt funds bought after April 2023 are taxed at your slab with no indexation. Banks deduct TDS on FD interest above ₹50,000 a year. And whatever you choose, keep 3–6 months of expenses in something liquid.',
  },

  invest: {
    ...IN_INVEST,
    monthlyTerm: 'Monthly SIP',
    defaults: IM_DEFAULTS,
  },

  peer: {
    ...IN_PEER,
    cityLabel: 'Your city',
    population:
      'Salaried urban working adults in your age band, in cities of the same cost-of-living tier as yours.',
    basis:
      'Reference estimates maintained by FinatriX from published earnings and household-savings distributions, scaled by a city cost-of-living multiplier. Not a survey, and not a sample of FinatriX users.',
    defaults: {
      age: 25, cityKey: 'mumbai', income: 50000, savings: 200000,
      invest: 100000, debt: 0, rate: 20, expenses: 30000,
    },
  },

  goals: {
    paths: GP_PATHS,
    presets: GP_PRESETS,
    inflation: 0.06,
    minTarget: 1000,
  },

  netWorth: {
    // The shipped labels. Listed explicitly rather than left to the default so
    // that "what does India call this bucket" is answered in the same place as
    // every other market, instead of only by omission.
    labels: {
      deposits: 'Deposits (FD/RD)',
      retirement: 'EPF, PPF & NPS',
      gold: 'Gold & jewellery',
    },
  },
};
