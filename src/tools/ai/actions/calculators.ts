/**
 * The calculators the assistant may run, each through the app's own engine.
 *
 * The model only names the calculator and copies the user's numbers; every
 * figure on the result card comes from here.
 *
 *   goal      — the Goal Planner's `computeGoalPlanner`, with the active
 *               market's inflation and paths, exactly as the Goal Planner page
 *               runs it (inflation on, as the page defaults).
 *   emergency — the Planning tool's `emergencyPlan`, unchanged.
 *   sip       — `sipFutureValue` below. NEW MATHS, see its comment.
 */
import { computeGoalPlanner, type GoalPath } from '../../lib/goals';
import { emergencyPlan } from '../../lib/planning';
import type { MarketPack } from '../../lib/markets/types';

/**
 * What a fixed monthly investment, paid at the start of each month, grows to
 * after `years` at `annualRate` compounded monthly (annuity-due).
 *
 * NEW FUNCTION, NOT A NEW FORMULA. It is the formula the Goal Planner already
 * uses for a path's `totalValue` (`monthly * ((1 + r)^n - 1) / r * (1 + r)`,
 * r = annualRate / 12, n = years * 12) with no existing savings, and the same
 * one InvestMatch uses for `fv`. It is pulled out because neither engine takes
 * "this much a month for this many years" as its input. A parity test checks it
 * against `computeGoalPlanner`'s own `totalValue`.
 *
 * Worked example: ₹10,000 a month for 15 years at 12%:
 *   r = 0.01, n = 180, (1.01^180 − 1) / 0.01 × 1.01 × 10,000 ≈ ₹50,45,760.
 */
export function sipFutureValue(monthly: number, annualRate: number, years: number): number {
  const r = annualRate / 12;
  const n = years * 12;
  if (monthly <= 0 || n <= 0) return 0;
  if (r === 0) return monthly * n;
  return monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r);
}

export type CalculatorId = 'goal' | 'sip' | 'emergency';

export const CALCULATOR_LABEL: Record<CalculatorId, string> = {
  goal: 'Goal Planner',
  sip: 'Investment growth',
  emergency: 'Emergency fund',
};

/** Where each calculator lives in the app, for the card's link. */
export const CALCULATOR_HOME: Record<CalculatorId, { href: string; label: string }> = {
  goal: { href: '/tools/goals', label: 'Goal Planner' },
  sip: { href: '/tools/goals', label: 'Goal Planner' },
  emergency: { href: '/tools/dashboard', label: 'Dashboard' },
};

/** The inputs as the user said them, already read by the app's parsers. */
export interface CalculatorInputs {
  target?: number;
  monthly?: number;
  years?: number;
  months?: number;
  saved?: number;
}

/** One line of the result card. `amount` is money; `count` is a plain number. */
export interface CalcRow {
  label: string;
  amount?: number;
  /** A per-month figure, shown as "/month". */
  perMonth?: boolean;
  count?: number;
  unit?: string;
}

export interface CalcResult {
  calculator: CalculatorId;
  /** The inputs used, as rows, so the card shows what was understood. */
  inputs: CalcRow[];
  results: CalcRow[];
  /** Assumptions the figures stand on, in words. Never a figure the engine did not use. */
  basis: string;
}

export type CalcOutcome = { ok: true; result: CalcResult } | { ok: false; message: string };

function pct(rate: number): string {
  return `${Math.round(rate * 1000) / 10}%`;
}

function pathRates(paths: readonly GoalPath[]): string {
  return paths.map((p) => `${p.n.replace(/ path$/i, '').toLowerCase()} ${pct(p.rate)}`).join(', ');
}

/** Run one calculator. Refuses, with a reason, when a number it needs was not said. */
export function runCalculator(id: CalculatorId, inp: CalculatorInputs, market: MarketPack): CalcOutcome {
  const { goals } = market;
  if (id === 'goal') {
    if (!inp.target) return { ok: false, message: 'Say the amount you want to reach, like “50 lakh in 10 years”.' };
    if (!inp.years) return { ok: false, message: 'Say how many years you have, like “in 10 years”.' };
    if (inp.years > 40) return { ok: false, message: 'The Goal Planner works with 1 to 40 years.' };
    if (inp.target < goals.minTarget) return { ok: false, message: 'That target is below the Goal Planner’s minimum.' };
    const res = computeGoalPlanner(
      { name: 'Your goal', targetToday: inp.target, years: inp.years, existing: inp.saved ?? 0, inflate: true },
      goals.inflation, goals.paths,
    );
    if (!res.valid) return { ok: false, message: 'The Goal Planner could not work that out.' };
    return {
      ok: true,
      result: {
        calculator: id,
        inputs: [
          { label: 'Target in today’s money', amount: inp.target },
          { label: 'Years', count: inp.years },
          ...(inp.saved ? [{ label: 'Already saved', amount: inp.saved }] : []),
          { label: `Target after ${pct(goals.inflation)} yearly inflation`, amount: res.target },
        ],
        results: res.results.map((p) => ({ label: p.n, amount: p.monthly, perMonth: true })),
        basis: `Monthly investment needed on each Goal Planner path, assuming yearly returns of ${pathRates(goals.paths)}. Returns are not guaranteed.`,
      },
    };
  }
  if (id === 'sip') {
    if (!inp.monthly) return { ok: false, message: 'Say how much you would invest each month.' };
    if (!inp.years) return { ok: false, message: 'Say for how many years, like “for 15 years”.' };
    if (inp.years > 40) return { ok: false, message: 'This works with 1 to 40 years.' };
    const years = inp.years;
    const monthly = inp.monthly;
    return {
      ok: true,
      result: {
        calculator: id,
        inputs: [
          { label: 'Every month', amount: monthly },
          { label: 'Years', count: years },
          { label: 'Total put in', amount: monthly * years * 12 },
        ],
        results: goals.paths.map((p) => ({ label: p.n, amount: sipFutureValue(monthly, p.rate, years) })),
        basis: `Invested at the start of each month, at the Goal Planner’s assumed yearly returns of ${pathRates(goals.paths)}, before tax and inflation. Returns are not guaranteed.`,
      },
    };
  }
  if (!inp.monthly) return { ok: false, message: 'Say what your essential spending is each month.' };
  const months = Math.min(24, Math.max(1, inp.months ?? 3));
  const plan = emergencyPlan({ essentials: inp.monthly, months, saved: inp.saved ?? 0, contribution: 0 });
  return {
    ok: true,
    result: {
      calculator: id,
      inputs: [
        { label: 'Essential spending', amount: inp.monthly, perMonth: true },
        { label: 'Months covered', count: months },
        ...(inp.saved ? [{ label: 'Already saved', amount: inp.saved }] : []),
      ],
      results: [
        { label: 'Emergency fund target', amount: plan.target },
        ...(inp.saved ? [{ label: 'Still to save', amount: plan.gap }] : []),
      ],
      basis: inp.months
        ? 'Essential spending times the months you chose. Cash only, with no growth assumed.'
        : 'Essential spending times 3 months, the planner’s starting point. Say a number of months to change it.',
    },
  };
}
