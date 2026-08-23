/**
 * PeerCompare — how your money compares to published national benchmarks and
 * to standard planning guidelines.
 *
 * What changed, and why
 * ─────────────────────
 * This tool used to compare the user against `PC_BENCH`: a hand-written 7 × 3
 * grid of income, savings, investment, savings-rate, expense and net-worth
 * "averages" by age bracket and city tier, presented under the footer
 * "Benchmarks modelled on RBI, PLFS & survey data" and rendered as a
 * "percentile". Three separate things were wrong with that:
 *
 *  1. **The sourcing claim was false.** None of those 126 numbers came from
 *     RBI or PLFS. Researching it established that they could not have: MoSPI
 *     does not publish earnings by age, and no official Indian series reports
 *     household savings, investments or net worth by age bracket and city tier.
 *     The grid is not sourceable, so it is gone. What replaced it is in
 *     `benchmarks.ts`, where every figure carries its publisher, period and URL.
 *
 *  2. **The city adjustment double-counted.** `b.income[city.tier] * city.col`
 *     took a benchmark already tiered metro/tier-2/tier-3 and multiplied it
 *     again by a *cost-of-living* index — asserting, for instance, that Kolkata
 *     salaries run 10% below Chennai's because rent is cheaper. Cost of living
 *     now applies only to the expense guideline, which is what it measures.
 *
 *  3. **"Percentile" was not a percentile.** `pcPct` is a logistic curve over
 *     a ratio-to-mean with an arbitrary exponent; a percentile requires a
 *     distribution, and there was none. The function is unchanged in shape —
 *     it is a reasonable way to compress a ratio onto 0–100 — but it is now
 *     named and labelled for what it is: a comparison index.
 *
 * The tool is therefore narrower than it was and honest about its basis. It no
 * longer claims to tell you how you rank among people your age in your city,
 * because that comparison cannot be made from published data.
 */
import { fmt } from './format';
import {
  DEBT_SERVICE_BENCHMARK,
  EMERGENCY_FUND_BENCHMARK,
  GUIDELINES,
  INCOME_BENCHMARK,
  SAVINGS_RATE_BENCHMARK,
  type Benchmark,
} from './benchmarks';

export interface City {
  l: string;
  tier: 'metro' | 'tier2' | 'tier3';
  /**
   * Cost-of-living index relative to a national baseline of 1.0.
   *
   * Used ONLY to scale the expense guideline — the thing a cost index actually
   * measures. It is a modelling assumption rather than a published series, and
   * the UI labels the expense benchmark `derived` accordingly.
   */
  col: number;
}
export const PC_CITIES: Record<string, City> = {
  mumbai: { l: 'Mumbai', tier: 'metro', col: 1.15 },
  delhi: { l: 'Delhi NCR', tier: 'metro', col: 1.1 },
  bengaluru: { l: 'Bengaluru', tier: 'metro', col: 1.12 },
  hyderabad: { l: 'Hyderabad', tier: 'metro', col: 1.02 },
  chennai: { l: 'Chennai', tier: 'metro', col: 1.0 },
  kolkata: { l: 'Kolkata', tier: 'metro', col: 0.9 },
  pune: { l: 'Pune', tier: 'metro', col: 0.98 },
  ahmedabad: { l: 'Ahmedabad', tier: 'tier2', col: 1.02 },
  jaipur: { l: 'Jaipur', tier: 'tier2', col: 0.98 },
  kochi: { l: 'Kochi', tier: 'tier2', col: 1.0 },
  chandigarh: { l: 'Chandigarh', tier: 'tier2', col: 1.05 },
  lucknow: { l: 'Lucknow', tier: 'tier2', col: 0.95 },
  indore: { l: 'Indore', tier: 'tier2', col: 0.95 },
  coimbatore: { l: 'Coimbatore', tier: 'tier2', col: 0.97 },
  tier2other: { l: 'Other Tier-2 city', tier: 'tier2', col: 1.0 },
  tier3: { l: 'Tier-3 / small town', tier: 'tier3', col: 1.0 },
};

/**
 * Share of income the expense guideline allows, before the city cost index.
 *
 * Derived from the RBI savings benchmark rather than chosen: if households keep
 * `SAVINGS_RATE_BENCHMARK` per cent of income, the rest is what they spend.
 * Stating it this way means the two guidelines cannot contradict each other.
 */
export const EXPENSE_SHARE_OF_INCOME = (100 - SAVINGS_RATE_BENCHMARK.value) / 100;

/**
 * Compress a you/benchmark ratio onto a 0–100 comparison index.
 *
 * Unchanged in shape from the original `pcPct` — a logistic in the ratio,
 * saturating at the ends so an outlier does not peg the bar — but renamed. It
 * was labelled a percentile in both the code and the UI, and it is not one:
 * there is no distribution behind it, only a curve. At parity with the
 * benchmark it returns 50; twice the benchmark returns about 82.
 */
export function comparisonIndex(ratio: number): number {
  if (!isFinite(ratio) || ratio <= 0) return 1;
  return Math.min(99, Math.max(1, Math.round(100 / (1 + Math.pow(ratio, -2.2)))));
}

export type MetricStatus = 'ahead' | 'ontrack' | 'behind';

export interface Metric {
  k: string;
  l: string;
  i?: string;
  ic?: string;
  yours: number;
  /** The published or derived figure being compared against. */
  benchmark: number;
  money?: boolean;
  suf?: string;
  /** True when a LOWER value is better (expenses, debt service). */
  invert?: boolean;
  /** 0–100 comparison index. NOT a percentile — see `comparisonIndex`. */
  index: number;
  status: MetricStatus;
  /** Where the benchmark came from, rendered on the card. */
  provenance: Benchmark['provenance'];
  basis: string;
  sourceLabel?: string;
  sourceUrl?: string;
}

export type PcTip = ['warn' | 'ok', string, string];

export interface PeerInput {
  age: number;
  cityKey: string;
  income: number;
  savings: number;
  invest: number;
  /** Total outstanding debt. Used for net worth. */
  debt: number;
  /**
   * Total monthly loan repayments (EMIs).
   *
   * New input, and the reason the debt metric is now correct. The tool used to
   * compute `debt / (income * 12)` — total outstanding debt over annual income
   * — label it "Debt-to-income" and warn above 40%, which is the conventional
   * threshold for the entirely different monthly-payment ratio. Anyone with a
   * home loan tripped it: a ₹40 lakh mortgage on ₹20 lakh income read 200% and
   * was told to "clear high-interest loans before adding investments", advice
   * that could be actively harmful to someone whose real debt-service ratio was
   * a healthy 30%.
   */
  emi: number;
  rate: number;
  expenses: number;
}

export interface PeerResult {
  age: number;
  city: City;
  metrics: Metric[];
  score: number;
  scColor: string;
  scHex: string;
  msg: string;
  eMonths: number;
  /** EMIs ÷ gross monthly income, as a percentage. A real debt-service ratio. */
  debtServiceRatio: number;
  nw: number;
  investedRatio: number;
  tips: PcTip[];
}

function statusFor(index: number): MetricStatus {
  return index >= 60 ? 'ahead' : index >= 40 ? 'ontrack' : 'behind';
}

/** Ratio of `yours` to `benchmark`, flipped when lower is better. */
function ratioFor(yours: number, benchmark: number, invert: boolean): number {
  if (invert) return yours > 0 ? benchmark / yours : 2;
  return benchmark > 0 ? yours / benchmark : yours > 0 ? 2 : 1;
}

export function computePeerCompare(inp: PeerInput): PeerResult {
  const age = Math.min(70, Math.max(18, inp.age));
  const city = PC_CITIES[inp.cityKey] || PC_CITIES.tier2other;
  const { income, savings, invest, debt, expenses } = inp;
  const emi = Math.max(0, inp.emi);
  const rate = Math.min(100, inp.rate);

  const nw = savings + invest - debt;
  const eMonths =
    expenses > 0 ? Math.round((savings / expenses) * 10) / 10 : savings > 0 ? Infinity : 0;

  /**
   * Debt-service ratio: EMIs as a share of gross monthly income. This is what
   * "debt-to-income" means everywhere it is used as a lending threshold, and
   * what the 36%/43% guidelines in `benchmarks.ts` are stated against.
   */
  const debtServiceRatio = income > 0 ? Math.round((emi / income) * 100) : 0;

  /**
   * The expense guideline: what this city's cost index implies you would spend
   * on your own income if you saved at the national rate. Derived from the
   * user's income — not a claim about what anyone else in the city spends.
   */
  const expenseGuideline = Math.round(income * EXPENSE_SHARE_OF_INCOME * city.col);

  const built: Omit<Metric, 'index' | 'status'>[] = [
    {
      k: 'income',
      l: 'Monthly income',
      i: '💰',
      yours: income,
      benchmark: INCOME_BENCHMARK.value,
      money: true,
      provenance: INCOME_BENCHMARK.provenance,
      basis: INCOME_BENCHMARK.basis,
      sourceLabel: INCOME_BENCHMARK.source?.label,
      sourceUrl: INCOME_BENCHMARK.source?.url,
    },
    {
      k: 'rate',
      l: 'Savings rate',
      i: '📊',
      yours: rate,
      benchmark: SAVINGS_RATE_BENCHMARK.value,
      suf: '%',
      provenance: SAVINGS_RATE_BENCHMARK.provenance,
      basis: SAVINGS_RATE_BENCHMARK.basis,
      sourceLabel: SAVINGS_RATE_BENCHMARK.source?.label,
      sourceUrl: SAVINGS_RATE_BENCHMARK.source?.url,
    },
    {
      k: 'expenses',
      l: 'Monthly expenses',
      i: '💸',
      yours: expenses,
      benchmark: expenseGuideline,
      money: true,
      invert: true,
      provenance: 'derived',
      basis:
        `Your income × ${Math.round(EXPENSE_SHARE_OF_INCOME * 100)}% (the share left after saving at the ` +
        `national rate) × ${city.col} for ${city.l} living costs.`,
    },
    {
      k: 'emergency',
      l: 'Emergency fund',
      ic: 'shield',
      yours: eMonths === Infinity ? GUIDELINES.emergencyMonths : eMonths,
      benchmark: EMERGENCY_FUND_BENCHMARK.value,
      suf: ' months',
      provenance: EMERGENCY_FUND_BENCHMARK.provenance,
      basis: EMERGENCY_FUND_BENCHMARK.basis,
    },
    {
      k: 'debtService',
      l: 'Debt-service ratio',
      ic: 'lock',
      yours: debtServiceRatio,
      benchmark: DEBT_SERVICE_BENCHMARK.value,
      suf: '%',
      invert: true,
      provenance: DEBT_SERVICE_BENCHMARK.provenance,
      basis: DEBT_SERVICE_BENCHMARK.basis,
    },
  ];

  const metrics: Metric[] = built.map((m) => {
    // No debt is the best possible debt-service ratio, not a missing value.
    const index =
      m.k === 'debtService' && m.yours === 0 ? 99 : comparisonIndex(ratioFor(m.yours, m.benchmark, !!m.invert));
    return { ...m, index, status: statusFor(index) };
  });

  const score = Math.round(metrics.reduce((s, m) => s + m.index, 0) / metrics.length);
  const scColor = score >= 65 ? 'var(--green)' : score >= 40 ? 'var(--gold)' : 'var(--red)';
  const scHex = score >= 65 ? '#1d7d46' : score >= 40 ? '#b08a36' : '#FF5A52';
  const msg =
    score >= 75 ? 'Well ahead of the national benchmarks'
      : score >= 60 ? 'Ahead on most measures'
        : score >= 45 ? 'Around the benchmarks, with room to grow'
          : score >= 30 ? 'Behind on several measures'
            : "Let's build the plan from here";

  const investedRatio = savings + invest > 0 ? Math.round((invest / (savings + invest)) * 100) : 0;

  const get = (k: string) => metrics.find((m) => m.k === k)!;
  const tips: PcTip[] = [];

  if (get('income').status === 'ahead') {
    tips.push([
      'ok',
      'Income strength',
      `You earn more than the national average for regular wage/salaried workers (${fmt(INCOME_BENCHMARK.value)}/month). ` +
        'Channelling the surplus into a higher savings rate is where the gap compounds.',
    ]);
  }
  if (get('income').status === 'behind') {
    tips.push([
      'warn',
      'Below the national average',
      `The PLFS all-India average for regular wage/salaried workers is ${fmt(INCOME_BENCHMARK.value)}/month. ` +
        'This is a national figure across every occupation and location — it is a reference point, not a target for your role.',
    ]);
  }
  if (get('rate').status === 'behind') {
    tips.push([
      'warn',
      'Saving below the national rate',
      `Indian households net-saved ${SAVINGS_RATE_BENCHMARK.value}% of disposable income in FY 2024-25. ` +
        'Automating a transfer on payday is the change that moves this most reliably.',
    ]);
  }
  if (get('rate').status === 'ahead') {
    tips.push([
      'ok',
      'Strong savings rate',
      `You are saving above the national household rate of ${SAVINGS_RATE_BENCHMARK.value}%. ` +
        'Make sure it is invested across asset classes rather than sitting idle.',
    ]);
  }
  if (expenses > 0 && eMonths < GUIDELINES.emergencyMonthsMin) {
    tips.push([
      'warn',
      'Thin emergency buffer',
      `Your savings cover ${eMonths} months of expenses. The usual guideline is ` +
        `${GUIDELINES.emergencyMonthsMin}–${GUIDELINES.emergencyMonths} months (${fmt(expenses * GUIDELINES.emergencyMonths)}).`,
    ]);
  }
  if (expenses > 0 && eMonths >= GUIDELINES.emergencyMonths && eMonths !== Infinity) {
    tips.push([
      'ok',
      'Solid emergency fund',
      `${eMonths} months of cover — at or above the ${GUIDELINES.emergencyMonths}-month guideline.`,
    ]);
  }
  if (income > 0 && debtServiceRatio > GUIDELINES.debtServiceStretched) {
    tips.push([
      'warn',
      'Debt service is stretched',
      `EMIs take ${debtServiceRatio}% of your gross monthly income. Most lenders treat anything above ` +
        `${GUIDELINES.debtServiceStretched}% as the point to stop adding credit; clearing the highest-rate loan first frees the most room.`,
    ]);
  } else if (income > 0 && debtServiceRatio > GUIDELINES.debtServiceComfortable) {
    tips.push([
      'warn',
      'Debt service above the comfortable range',
      `EMIs take ${debtServiceRatio}% of your gross monthly income, against a ${GUIDELINES.debtServiceComfortable}% guideline. ` +
        'This is common with a home loan and is not automatically a problem — but it limits what you can borrow next.',
    ]);
  }
  if (invest === 0 && savings > 0) {
    tips.push([
      'warn',
      'Everything is in cash',
      'None of your money is invested. Even a small monthly SIP started now compounds for longer than a larger one started later.',
    ]);
  }

  return {
    age, city, metrics, score, scColor, scHex, msg,
    eMonths: eMonths === Infinity ? Infinity : eMonths,
    debtServiceRatio, nw, investedRatio, tips,
  };
}
