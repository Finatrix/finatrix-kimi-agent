/**
 * PeerCompare — data + math, ported verbatim from PC_CITIES / PC_BENCH and the
 * pcBracket()/pcPct()/pcCompare() logic in tools-app.html. All pure and
 * parity-checked against the source. Renders with INR `fmt`.
 */
import { fmt } from './format';

export interface City {
  l: string;
  tier: 'metro' | 'tier2' | 'tier3';
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

export interface Bench {
  income: Record<'metro' | 'tier2' | 'tier3', number>;
  savings: number;
  invest: number;
  rate: number;
  expenses: Record<'metro' | 'tier2' | 'tier3', number>;
  nw: number;
}
export const PC_BENCH: Record<string, Bench> = {
  '18-22': { income: { metro: 22000, tier2: 13000, tier3: 9000 }, savings: 35000, invest: 12000, rate: 8, expenses: { metro: 16000, tier2: 11000, tier3: 7500 }, nw: 35000 },
  '23-25': { income: { metro: 42000, tier2: 26000, tier3: 19000 }, savings: 110000, invest: 45000, rate: 14, expenses: { metro: 30000, tier2: 19000, tier3: 13000 }, nw: 130000 },
  '26-28': { income: { metro: 63000, tier2: 40000, tier3: 26000 }, savings: 260000, invest: 160000, rate: 18, expenses: { metro: 40000, tier2: 26000, tier3: 19000 }, nw: 380000 },
  '29-32': { income: { metro: 88000, tier2: 54000, tier3: 36000 }, savings: 470000, invest: 380000, rate: 20, expenses: { metro: 52000, tier2: 36000, tier3: 26000 }, nw: 750000 },
  '33-37': { income: { metro: 115000, tier2: 73000, tier3: 50000 }, savings: 730000, invest: 650000, rate: 23, expenses: { metro: 68000, tier2: 47000, tier3: 33000 }, nw: 1300000 },
  '38-45': { income: { metro: 155000, tier2: 98000, tier3: 67000 }, savings: 1050000, invest: 1100000, rate: 25, expenses: { metro: 88000, tier2: 62000, tier3: 44000 }, nw: 2200000 },
  '46+': { income: { metro: 185000, tier2: 115000, tier3: 82000 }, savings: 1600000, invest: 2100000, rate: 28, expenses: { metro: 105000, tier2: 73000, tier3: 52000 }, nw: 3700000 },
};

export function pcBracket(age: number): string {
  if (age <= 22) return '18-22';
  if (age <= 25) return '23-25';
  if (age <= 28) return '26-28';
  if (age <= 32) return '29-32';
  if (age <= 37) return '33-37';
  if (age <= 45) return '38-45';
  return '46+';
}

/** Smooth logistic percentile on the you/avg ratio (verbatim). */
export function pcPct(ratio: number): number {
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
  avg: number;
  money?: boolean;
  suf?: string;
  invert?: boolean;
  pct: number;
  status: MetricStatus;
}
export type PcTip = ['warn' | 'ok', string, string];

export interface PeerInput {
  age: number;
  cityKey: string;
  income: number;
  savings: number;
  invest: number;
  debt: number;
  rate: number;
  expenses: number;
}

export interface PeerResult {
  age: number;
  city: City;
  bracket: string;
  metrics: Metric[];
  score: number;
  scColor: string;
  scHex: string;
  msg: string;
  eMonths: number;
  dti: number;
  nw: number;
  investedRatio: number;
  tips: PcTip[];
}

/** Verbatim port of pcCompare()'s calculation core. */
export function computePeerCompare(inp: PeerInput): PeerResult {
  const age = Math.min(70, Math.max(18, inp.age));
  const city = PC_CITIES[inp.cityKey] || PC_CITIES.tier2other;
  const income = inp.income, savings = inp.savings, invest = inp.invest;
  const debt = inp.debt, rate = Math.min(100, inp.rate), expenses = inp.expenses;

  const bracket = pcBracket(age);
  const b = PC_BENCH[bracket];
  const avgIncome = Math.round(b.income[city.tier] * city.col);
  const avgExpenses = Math.round(b.expenses[city.tier] * city.col);
  const nw = savings + invest - debt;
  const eMonths = expenses > 0 ? Math.round((savings / expenses) * 10) / 10 : savings > 0 ? 99 : 0;
  const dti = income > 0 ? Math.round((debt / (income * 12)) * 100) : 0;

  const baseMetrics: Omit<Metric, 'pct' | 'status'>[] = [
    { k: 'income', l: 'Monthly income', i: '💰', yours: income, avg: avgIncome, money: true },
    { k: 'savings', l: 'Total savings', i: '🏦', yours: savings, avg: b.savings, money: true },
    { k: 'invest', l: 'Investments', ic: 'sip', yours: invest, avg: b.invest, money: true },
    { k: 'rate', l: 'Savings rate', i: '📊', yours: rate, avg: b.rate, suf: '%' },
    { k: 'nw', l: 'Net worth', i: '👑', yours: nw, avg: b.nw, money: true },
    { k: 'expenses', l: 'Monthly expenses', i: '💸', yours: expenses, avg: avgExpenses, money: true, invert: true },
  ];
  const metrics: Metric[] = baseMetrics.map((m) => {
    let ratio = m.avg > 0 ? m.yours / m.avg : m.yours > 0 ? 2 : 1;
    if (m.invert) ratio = m.yours > 0 ? m.avg / m.yours : 2;
    const pct = pcPct(ratio);
    const status: MetricStatus = pct >= 60 ? 'ahead' : pct >= 40 ? 'ontrack' : 'behind';
    return { ...m, pct, status };
  });

  const score = Math.round(metrics.reduce((s, m) => s + m.pct, 0) / metrics.length);
  const scColor = score >= 65 ? 'var(--green)' : score >= 40 ? 'var(--gold)' : 'var(--red)';
  const scHex = score >= 65 ? '#1d7d46' : score >= 40 ? '#b08a36' : '#FF5A52';
  const msg =
    score >= 75 ? "Outstanding — you're way ahead"
      : score >= 60 ? 'Great job — ahead of most peers'
        : score >= 45 ? 'Doing okay, with room to grow'
          : score >= 30 ? 'Time to level up'
            : "Let's build the plan from here";

  const investedRatio = savings + invest > 0 ? Math.round((invest / (savings + invest)) * 100) : 0;

  const tips: PcTip[] = [];
  const get = (k: string) => metrics.find((m) => m.k === k)!;
  if (get('income').status === 'ahead') tips.push(['ok', 'Income strength', `You earn more than the typical ${city.l} peer your age. Channel the surplus into a higher savings rate — that's where the gap compounds.`]);
  if (get('income').status === 'behind') tips.push(['warn', 'Income gap', `You're below the ${city.l} average for your age. Upskilling, a negotiated raise or a side income moves this fastest.`]);
  if (get('savings').status === 'behind') tips.push(['warn', 'Savings below peers', `Aim toward ${fmt(b.savings)} — start with an emergency fund, then automate the rest.`]);
  if (get('invest').status === 'behind') tips.push(['warn', 'Investments lagging', 'Even a ₹2,000/month SIP started today beats a ₹10,000 SIP started in five years.']);
  if (get('invest').status === 'ahead') tips.push(['ok', 'Strong investing game', "You're ahead of peers on investments. Make sure you're diversified across asset classes, not concentrated in one bet."]);
  if (expenses > 0 && eMonths < 3) tips.push(['warn', 'Thin emergency buffer', `Your savings cover ${eMonths} months of expenses. Build toward 6 months (${fmt(expenses * 6)}).`]);
  if (expenses > 0 && eMonths >= 6 && eMonths < 99) tips.push(['ok', 'Solid emergency fund', `${eMonths} months of cover — you're well prepared for surprises.`]);
  if (dti > 40) tips.push(['warn', 'Heavy debt load', `Debt is ${dti}% of your annual income. Clear high-interest loans before adding investments.`]);

  return { age, city, bracket, metrics, score, scColor, scHex, msg, eMonths, dti, nw, investedRatio, tips };
}
