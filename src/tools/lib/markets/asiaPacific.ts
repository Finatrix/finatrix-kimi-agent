/**
 * Local configuration for AU, SG and Mainland CN. No commercial yield or peer
 * grid is manufactured to satisfy the legacy calculator shapes. The pages
 * resolve the explicit input/context modes before calling those engines.
 */
import type { MarketPack } from './types';

interface LocalMarket {
  id: 'AU' | 'SG' | 'CN';
  name: string;
  flag: string;
  currency: string;
  locale: string;
  income: number;
  sources: readonly string[];
  retirement: string;
  taxContext: string;
}

function makeMarket(local: LocalMarket): MarketPack {
  const money = (n: number) => new Intl.NumberFormat(local.locale, {
    style: 'currency', currency: local.currency, maximumFractionDigits: 0,
  }).format(n);
  return {
    id: local.id, name: local.name, flag: local.flag,
    country: local.id.toLowerCase(), currency: local.currency, locale: local.locale,
    asOf: '2026-09', sources: local.sources, icon: 'bank',
    planningNote: 'Illustrative planning scenarios: 2%, 4% and 6% annual returns with 2% inflation. These are shared educational examples, not measured local returns or forecasts. Goal amounts and starting answers are examples to replace with your own figures. LifeMap uses its separate disclosed scenario assumptions.',
    park: {
      inputMode: 'net-rates', options: [], treatments: { enteredNet: { exempt: true } },
      minAmount: 1, splitThreshold: Number.MAX_SAFE_INTEGER,
      rateLabel: 'Tax already reflected in entered rates',
      rateOptions: [{ value: 0, label: 'No further tax deduction' }], defaultRate: 0,
      quickAmounts: [1000, 5000, 10000, 50000],
      taxNote: 'Enter an annual rate after any taxes and fees for each option. FinatriX makes no further tax deduction and does not infer a personal tax exemption. ' + local.taxContext,
      keepInMind: 'The rates and access conditions are your inputs. The calculation assumes a constant annual rate and simple interest over the selected period. It does not price early withdrawal, compounding or changes in rates. A higher modeled return does not identify the most suitable account. Check the institution, currency and ownership conditions in the protection disclosure.',
    },
    invest: {
      inflation: 0.02,
      rates: { conservative: 0.02, moderate: 0.04, aggressive: 0.06 },
      alloc: {
        conservative: [{ n: 'Diversified equities', p: 20, c: '#0071e3' }, { n: 'High-quality bonds', p: 50, c: '#1d7d46' }, { n: 'Cash', p: 30, c: '#b08a36' }],
        moderate: [{ n: 'Diversified equities', p: 50, c: '#0071e3' }, { n: 'High-quality bonds', p: 35, c: '#1d7d46' }, { n: 'Cash', p: 15, c: '#b08a36' }],
        aggressive: [{ n: 'Diversified equities', p: 75, c: '#0071e3' }, { n: 'High-quality bonds', p: 20, c: '#1d7d46' }, { n: 'Cash', p: 5, c: '#b08a36' }],
      },
      taxInsight: local.taxContext,
      sipExample: 'Contribution amounts, timing and future returns all affect an illustration. An earlier start alone does not guarantee a larger result.',
      money, monthlyTerm: 'Monthly contribution',
      defaults: { age: 30, income: local.income, monthly: 500, risk: 'moderate', horizon: '5-10', goal: 'wealth' },
    },
    peer: {
      mode: 'published-context', cities: {}, bench: {}, fallbackCity: '', cityLabel: 'Reference population',
      population: 'The population stated beside each published summary.',
      basis: 'Official dated summary statistics. No age or city multipliers and no inferred percentile.',
      sipExample: '', money,
      defaults: { age: 30, cityKey: '', income: 0, savings: 0, invest: 0, debt: 0, rate: 0, expenses: 0 },
    },
    goals: {
      inflation: 0.02, minTarget: 1,
      paths: [
        { n: '6% scenario', d: 'Illustrative higher-return assumption', rate: 0.06, c: '#c2410c', inst: 'Broad asset categories only; no product or expected local return is implied.' },
        { n: '4% scenario', d: 'Illustrative middle-return assumption', rate: 0.04, c: '#b08a36', inst: 'Broad asset categories only; no product or expected local return is implied.' },
        { n: '2% scenario', d: 'Illustrative lower-return assumption', rate: 0.02, c: '#0c8079', inst: 'Broad asset categories only; no product or expected local return is implied.' },
      ],
      presets: [['Custom goal', 'ic-goal', 10000, 5], ['Travel fund', 'ic-compass', 5000, 2], ['Education fund', 'ic-award', 20000, 10]],
    },
    netWorth: { labels: { deposits: 'Savings & term deposits', retirement: local.retirement, gold: 'Gold & precious metals' } },
  };
}

export const AU_MARKET = makeMarket({
  id: 'AU', name: 'Australia', flag: '🇦🇺', currency: 'AUD', locale: 'en-AU', income: 6000,
  sources: ['APRA — Financial Claims Scheme', 'Australian Taxation Office — individual income and superannuation', 'Australian Bureau of Statistics — Survey of Income and Housing'],
  retirement: 'Superannuation account balances',
  taxContext: 'Australian interest and investment taxes depend on your circumstances. Superannuation balances are separate from accessible savings; Age Pension entitlements are not projected.',
});
export const SG_MARKET = makeMarket({
  id: 'SG', name: 'Singapore', flag: '🇸🇬', currency: 'SGD', locale: 'en-SG', income: 5000,
  sources: ['SDIC — Deposit Insurance Scheme', 'IRAS — individual income tax', 'CPF Board — member rules', 'Singapore Department of Statistics — Key Household Income Trends'],
  retirement: 'CPF & other retirement account balances',
  taxContext: 'Check IRAS treatment for the account and income involved. CPF eligibility, contributions, allocation and access depend on age and membership status; no CPF entitlement is calculated.',
});
export const CN_MARKET = makeMarket({
  id: 'CN', name: 'Mainland China', flag: '🇨🇳', currency: 'CNY', locale: 'zh-CN', income: 10000,
  sources: ['State Taxation Administration — individual income tax', 'PBOC — Deposit Insurance Regulation', 'National Bureau of Statistics — household income and expenditure'],
  retirement: 'Individual pension account balances',
  taxContext: 'Mainland China only. Tax treatment depends on income type and status. Social insurance and housing provident fund rules require local information. Account access and cross-border investment eligibility are not inferred.',
});
