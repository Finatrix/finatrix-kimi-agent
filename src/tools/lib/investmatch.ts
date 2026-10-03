/**
 * InvestMatch — data + math, ported verbatim from IM_Q / IM_ALLOC / IM_RATE /
 * IM_HY / IM_RL and the imBuild() logic in tools-app.html. `computeInvestMatch`
 * is a pure function (horizon-aware risk downgrade, annuity-due future value,
 * inflation-adjusted value, insights) and is parity-checked against the source.
 *
 * MARKETS
 * -------
 * `IM_ALLOC` and `IM_RATE` are India's allocation mix and its expected-return
 * assumptions, and both stay exactly as they shipped — the parity suite compares
 * them against the archived original, and `computeInvestMatch` called with one
 * argument still runs precisely the code it always did.
 *
 * What is new is the optional second argument. A market pack supplies its own
 * allocation, its own return assumptions and its own inflation figure, because
 * every one of those is a claim about a particular economy: a 12% moderate
 * return and 6% inflation describe India and would be a fabrication applied to
 * a UK portfolio. The arithmetic — risk downgrade, annuity-due future value,
 * real value, insight thresholds — is identical for every market.
 */
import { fmt } from './format';

export interface ImNumQuestion {
  k: string;
  t: string;
  type: 'num';
  ph: string;
  min: number;
  max?: number;
}
export interface ImOptQuestion {
  k: string;
  t: string;
  type: 'opt';
  opts: { v: string; l: string; d: string }[];
}
export type ImQuestion = ImNumQuestion | ImOptQuestion;

export const IM_Q: ImQuestion[] = [
  { k: 'age', t: 'How old are you?', type: 'num', ph: 'e.g. 25', min: 18, max: 75 },
  { k: 'income', t: 'Monthly income (₹)', type: 'num', ph: 'e.g. 50000', min: 1 },
  { k: 'monthly', t: 'How much can you invest monthly? (₹)', type: 'num', ph: 'e.g. 10000', min: 100 },
  {
    k: 'risk', t: "What's your risk appetite?", type: 'opt', opts: [
      { v: 'conservative', l: 'Conservative', d: 'Safety first, steady returns' },
      { v: 'moderate', l: 'Moderate', d: 'Balanced growth with some risk' },
      { v: 'aggressive', l: 'Aggressive', d: 'Maximum growth, higher volatility' }],
  },
  {
    k: 'horizon', t: 'Investment time horizon?', type: 'opt', opts: [
      { v: '1-3', l: '1–3 years', d: 'Short-term goals' },
      { v: '3-5', l: '3–5 years', d: 'Medium-term goals' },
      { v: '5-10', l: '5–10 years', d: 'Long-term wealth building' },
      { v: '10+', l: '10+ years', d: 'Retirement / major milestones' }],
  },
  {
    k: 'goal', t: 'Primary investment goal?', type: 'opt', opts: [
      { v: 'wealth', l: 'Wealth building', d: 'Grow my money over time' },
      { v: 'retirement', l: 'Retirement', d: 'Build a retirement corpus' },
      { v: 'house', l: 'Buy a house', d: 'Save for a down payment' },
      { v: 'tax', l: 'Tax saving', d: 'Reduce taxable income' },
      { v: 'emergency', l: 'Emergency fund', d: 'Build a safety net' }],
  },
];

export interface ImAlloc {
  n: string;
  p: number;
  c: string;
}
export const IM_ALLOC: Record<string, ImAlloc[]> = {
  conservative: [
    { n: 'Large-cap index fund', p: 25, c: '#0071e3' }, { n: 'Debt / bond funds', p: 30, c: '#1d7d46' },
    { n: 'PPF', p: 15, c: '#0c8079' }, { n: 'Fixed deposits', p: 15, c: '#b08a36' },
    { n: 'Gold (SGBs / ETF)', p: 10, c: '#c2410c' }, { n: 'Liquid fund', p: 5, c: '#6e3bd4' }],
  moderate: [
    { n: 'Large-cap funds', p: 20, c: '#0071e3' }, { n: 'Mid-cap funds', p: 18, c: '#1d7d46' },
    { n: 'Nifty 50 index fund', p: 15, c: '#0c8079' }, { n: 'ELSS (tax saver)', p: 15, c: '#b08a36' },
    { n: 'Debt / bond funds', p: 15, c: '#6e3bd4' }, { n: 'Gold (SGBs)', p: 10, c: '#c2410c' },
    { n: 'International fund', p: 7, c: '#b3387a' }],
  aggressive: [
    { n: 'Small-cap funds', p: 25, c: '#c2410c' }, { n: 'Mid-cap funds', p: 22, c: '#1d7d46' },
    { n: 'Large-cap funds', p: 13, c: '#0071e3' }, { n: 'International / US equity', p: 15, c: '#6e3bd4' },
    { n: 'ELSS (tax saver)', p: 10, c: '#b08a36' }, { n: 'Sectoral / thematic', p: 10, c: '#b3387a' },
    { n: 'High-risk / crypto', p: 5, c: '#0c8079' }],
};
export const IM_RATE: Record<string, number> = { conservative: 0.09, moderate: 0.12, aggressive: 0.14 };
export const IM_HY: Record<string, number> = { '1-3': 2, '3-5': 4, '5-10': 7, '10+': 15 };
export const IM_RL: Record<string, string> = { conservative: 'Conservative', moderate: 'Moderate', aggressive: 'Aggressive' };

export interface ImAnswers {
  age: number;
  income: number;
  monthly: number;
  risk: string;
  horizon: string;
  goal: string;
}

export const IM_DEFAULTS: ImAnswers = {
  age: 25, income: 50000, monthly: 10000, risk: 'moderate', horizon: '5-10', goal: 'wealth',
};

export interface ImResult {
  tooLow: boolean;
  effRisk: string;
  riskNote: string;
  /** Readonly because it is the market pack's table, handed straight through. */
  alloc: readonly ImAlloc[];
  rate: number;
  years: number;
  fv: number;
  invested: number;
  gains: number;
  realFv: number;
  growthPct: number;
  insights: string[];
}

/**
 * The market-varying half of InvestMatch.
 *
 * `money` is here rather than passed separately because two of the insight
 * strings quote amounts, and an insight that says "₹4,20,000" to someone
 * reading dollars is worse than no insight. It defaults to the INR `fmt`, which
 * is what the parity suite compares against.
 */
export interface InvestAssumptions {
  alloc: Readonly<Record<string, readonly ImAlloc[]>>;
  /** Expected nominal annual return by risk band, 0–1. */
  rates: Readonly<Record<string, number>>;
  /** Assumed long-run inflation, 0–1, used for the real-terms figure. */
  inflation: number;
  /** Tax-shelter advice for this jurisdiction. Empty means "say nothing". */
  taxInsight: string;
  /** The "start small" example, already formatted for the market. */
  sipExample: string;
  money: (n: number) => string;
}

/** India — the original tables and assumptions, unchanged. */
export const IN_INVEST: InvestAssumptions = {
  alloc: IM_ALLOC,
  rates: IM_RATE,
  inflation: 0.06,
  taxInsight:
    "For tax saving: ELSS covers ₹1.5L under 80C (old regime), plus NPS adds ₹50K under 80CCD(1B). Under the new regime most deductions don't apply — check which regime you file.",
  sipExample: 'Even a ₹2,000/month SIP started today beats a ₹10,000 SIP started in five years.',
  money: fmt,
};

/** Verbatim port of imBuild()'s calculation core. */
export function computeInvestMatch(ans: ImAnswers, pack: InvestAssumptions = IN_INVEST): ImResult {
  if (ans.monthly < 100) {
    return { tooLow: true, effRisk: ans.risk, riskNote: '', alloc: [], rate: 0, years: 0, fv: 0, invested: 0, gains: 0, realFv: 0, growthPct: 0, insights: [] };
  }

  let effRisk = ans.risk;
  let riskNote = '';
  if (ans.horizon === '1-3' && effRisk !== 'conservative') {
    effRisk = 'conservative';
    riskNote = 'Your horizon is under 3 years, so we dialled the allocation to conservative — equity needs 5+ years to ride out volatility.';
  } else if (ans.horizon === '3-5' && effRisk === 'aggressive') {
    effRisk = 'moderate';
    riskNote = 'With a 3–5 year horizon, we softened aggressive to moderate. Small-caps can stay underwater for years.';
  }

  const alloc = pack.alloc[effRisk];
  const rate = pack.rates[effRisk];
  const years = IM_HY[ans.horizon];
  const r = rate / 12;
  const n = years * 12;
  const fv = ans.monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
  const invested = ans.monthly * n;
  const gains = fv - invested;
  const realFv = fv / Math.pow(1 + pack.inflation, years);
  const growthPct = invested > 0 ? Math.round((gains / invested) * 100) : 0;

  const insights: string[] = [];
  if (riskNote) insights.push(riskNote);
  if (ans.age < 28 && effRisk === 'conservative' && ans.horizon !== '1-3')
    insights.push("You're young — time is your biggest edge. Consider gradually raising equity exposure as you get comfortable.");
  if (ans.income > 0 && ans.monthly < ans.income * 0.15)
    insights.push(`You're investing ${Math.round((ans.monthly / ans.income) * 100)}% of income. Pushing toward 20% meaningfully accelerates wealth.`);
  if (ans.goal === 'tax' && pack.taxInsight) insights.push(pack.taxInsight);
  if (ans.goal === 'emergency')
    insights.push('For an emergency fund, skip equity entirely — keep it in liquid funds or sweep-in FDs you can access within a day.');
  if (gains > invested)
    insights.push(`Your projected gains (${pack.money(gains)}) exceed what you put in (${pack.money(invested)}) — that's compounding doing the heavy lifting over ${years} years.`);

  return { tooLow: false, effRisk, riskNote, alloc, rate, years, fv, invested, gains, realFv, growthPct, insights };
}

/**
 * The question text as this market should read it.
 *
 * `IM_Q` is parity-pinned, so its two money questions carry a literal "(₹)"
 * that cannot be edited out. Substituting at render time keeps the table
 * byte-identical to the original while a reader in London is asked for their
 * income in pounds — the alternative was a second, drifting copy of the
 * questions.
 */
export function questionLabel(q: ImQuestion, sym: string): string {
  return q.t.replace('(₹)', `(${sym})`);
}

/**
 * True for a question answered in money. Keyed on the same `(₹)` marker
 * questionLabel swaps for the market's symbol, because IM_Q itself is pinned
 * to the original tool by the parity suite and cannot carry a new field.
 */
export function isAmountQuestion(q: ImQuestion): boolean {
  return q.type === 'num' && q.t.includes('(₹)');
}

/**
 * The placeholder for a numeric question, scaled to the market.
 *
 * "e.g. 50000" is a sensible monthly income in rupees and an absurd one in
 * pounds. The market's own starting answers are the honest source for what a
 * plausible number looks like here.
 */
export function questionPlaceholder(q: ImNumQuestion, defaults: ImAnswers): string {
  if (q.k === 'income') return `e.g. ${defaults.income}`;
  if (q.k === 'monthly') return `e.g. ${defaults.monthly}`;
  return q.ph;
}

/** Clamp a numeric answer to a question's min/max (port of imSaveNum). */
export function clampAnswer(q: ImNumQuestion, raw: unknown): number {
  let v = Number(raw) || 0;
  if (q.min != null) v = Math.max(q.min, v);
  if (q.max != null) v = Math.min(q.max, v);
  return v;
}
