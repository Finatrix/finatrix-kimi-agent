import { computeInvestMatch, IM_HY, IM_Q, type ImAnswers, type InvestAssumptions } from './investmatch';
import { computeParkSmart, PS_M, type ParkInstruments } from './parksmart';
import type { PeerInput, PeerBenchmarks } from './peercompare';

/** Input checks sit outside the parity-pinned calculators; unknown never becomes zero. */
export function investAnswerError(answers: ImAnswers): string | null {
  for (const q of IM_Q) {
    const value = answers[q.k as keyof ImAnswers];
    if (q.type === 'num') {
      if (typeof value !== 'number' || !Number.isFinite(value) || value < q.min || value > (q.max ?? 1e12)) {
        return `Review ${q.k}: enter ${q.max ? `a value from ${q.min} to ${q.max}` : `a value from ${q.min} to 1 trillion`}.`;
      }
    } else if (!q.opts.some((o) => o.v === value)) return `Choose a valid ${q.k}.`;
  }
  return null;
}

export function investScenarios(answers: ImAnswers, pack: InvestAssumptions) {
  if (investAnswerError(answers)) return { contributions: [], horizons: [] };
  return {
    contributions: [0.8, 1, 1.2].map((factor) => ({
      factor, monthly: Math.round(answers.monthly * factor * 100) / 100,
    })).filter(({ monthly }) => monthly >= 100 && monthly <= 1e12).map((scenario) => ({
      ...scenario, result: computeInvestMatch({ ...answers, monthly: scenario.monthly }, pack),
    })),
    horizons: Object.keys(IM_HY).map((horizon) => ({ horizon, result: computeInvestMatch({ ...answers, horizon }, pack) })),
  };
}

/** Check eligibility before calling the original engine, which expects a nonempty set. */
export function safeParkComparison(amount: number, duration: string, taxRate: number, pack: ParkInstruments, liquidOnly = false) {
  if (!Number.isFinite(amount) || amount < pack.minAmount || amount > 1e12 || !Object.hasOwn(PS_M, duration) || !Number.isFinite(taxRate) || taxRate < 0 || taxRate > 1) return null;
  const options = pack.options.filter((o) => (!liquidOnly || o.liquid) && PS_M[duration] >= o.minM && (duration !== '0-1' || o.liquid));
  if (!options.length) return null;
  return computeParkSmart(amount, duration, taxRate, { ...pack, options });
}

export function peerInputError(input: PeerInput, pack: PeerBenchmarks): string | null {
  if (!Number.isInteger(input.age) || input.age < 18 || input.age > 70) return 'Enter an age from 18 to 70, in whole years.';
  if (!Object.hasOwn(pack.cities, input.cityKey)) return 'Choose a location in the selected market.';
  for (const key of ['income', 'savings', 'invest', 'debt', 'rate', 'expenses'] as const) {
    if (!Number.isFinite(input[key]) || input[key] < 0 || input[key] > (key === 'rate' ? 100 : 1e12)) return `Review ${key}: enter a finite, nonnegative value${key === 'rate' ? ' up to 100%' : ' up to 1 trillion'}.`;
  }
  return null;
}

/** A cash-flow cross-check, never an inferred savings rate or replacement answer. */
export function peerCashFlow(input: PeerInput) {
  if (input.income <= 0) return null;
  const surplus = input.income - input.expenses;
  const impliedSavings = input.income * input.rate / 100;
  return { surplus, impliedSavings, exceedsSurplus: impliedSavings > surplus + 0.01 };
}
