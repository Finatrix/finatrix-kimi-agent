/**
 * The user's plans beyond this month, for FinatriX AI.
 *
 * The snapshot in `context.ts` describes one month of spending. The questions
 * people actually bring to a money assistant cross tools — "can I afford this",
 * "should I pay into the emergency fund or the goal first", "am I on track" —
 * and an assistant that can see only the ledger answers them by guessing at the
 * rest, or by declining. So this reads what the user has saved in the other
 * tools and hands it over alongside the month.
 *
 * Same rules as the snapshot:
 *  - every figure is computed by the owning tool's own engine (`readSavedGoal`,
 *    `readDashboard`, `emergencyPlan`) — nothing here is a second implementation
 *    of a formula, and the model reads these numbers rather than deriving them;
 *  - only the user's own locally held data, which cloud sync seeds from their
 *    RLS-protected row;
 *  - free text (the goal's name) is sanitised before it can reach a prompt.
 *
 * Reads storage, so it is called at ask-time by the panel and passed into the
 * pure `buildSnapshot` — which keeps the snapshot itself testable without a
 * storage fixture.
 */

import { sanitizeField } from '../../lib/sanitize';
import { readDashboard, readSavedGoal } from '../lib/dashboard';
import { loadMarket, marketFor } from '../lib/markets';
import { emergencyPlan, loadPlanning } from '../lib/planning';

export interface PlanContext {
  goal: {
    name: string;
    targetInTodaysMoney: number;
    /** What the target will cost at the deadline — inflated when the user chose that. */
    targetAtDeadline: number;
    adjustedForInflation: boolean;
    years: number;
    alreadySaved: number;
    fundedPct: number;
    /** Every return path the Goal Planner shows, each with its assumption. */
    monthlyByReturnPath: Array<{ path: string; assumedAnnualReturnPct: number; monthly: number }>;
  } | null;
  netWorth: {
    total: number;
    assets: number;
    liabilities: number;
    changeSinceLastMonth: number | null;
  } | null;
  investingPlan: {
    riskProfile: string;
    monthlyAmount: number;
    projectedValue: number;
    years: number;
  } | null;
  emergencyFund: {
    essentialCostsPerMonth: number;
    monthsOfCoverChosen: number;
    target: number;
    saved: number;
    gap: number;
    monthsCoveredNow: number | null;
    monthlyContribution: number;
    monthsToTarget: number | null;
  } | null;
}

const round = (n: number) => Math.round(n);

/**
 * Read the plans. Every section is independent and defensive: a tool the user
 * never opened is `null`, and a store that cannot be read is `null` too — the
 * assistant says what is missing rather than inventing it.
 */
export function readPlanContext(currency: string): PlanContext {
  const market = marketFor(loadMarket());

  let goal: PlanContext['goal'] = null;
  try {
    const res = readSavedGoal(market);
    if (res) {
      goal = {
        name: sanitizeField(res.name, 60) || 'Goal',
        targetInTodaysMoney: round(res.targetToday),
        targetAtDeadline: round(res.target),
        adjustedForInflation: res.inflate,
        years: res.years,
        alreadySaved: round(res.existing),
        fundedPct: res.target > 0 ? Math.min(100, Math.round((res.existing / res.target) * 100)) : 0,
        monthlyByReturnPath: res.results.map((p) => ({
          path: sanitizeField(p.n, 40),
          assumedAnnualReturnPct: Math.round(p.rate * 1000) / 10,
          monthly: round(p.monthly),
        })),
      };
    }
  } catch { /* goal stays null */ }

  let netWorth: PlanContext['netWorth'] = null;
  let investingPlan: PlanContext['investingPlan'] = null;
  try {
    const dash = readDashboard();
    if (dash.netWorth) {
      netWorth = {
        total: round(dash.netWorth.net),
        assets: round(dash.netWorth.assets),
        liabilities: round(dash.netWorth.liabilities),
        changeSinceLastMonth: dash.netWorth.change ? round(dash.netWorth.change.abs) : null,
      };
    }
    if (dash.invest) {
      investingPlan = {
        riskProfile: dash.invest.profile,
        monthlyAmount: round(dash.invest.monthly),
        projectedValue: round(dash.invest.projected),
        years: dash.invest.years,
      };
    }
  } catch { /* both stay null */ }

  let emergencyFund: PlanContext['emergencyFund'] = null;
  try {
    const inputs = loadPlanning(currency).emergency;
    if (inputs.essentials > 0) {
      const plan = emergencyPlan(inputs);
      emergencyFund = {
        essentialCostsPerMonth: round(inputs.essentials),
        monthsOfCoverChosen: inputs.months,
        target: round(plan.target),
        saved: round(inputs.saved),
        gap: round(plan.gap),
        monthsCoveredNow: plan.coveredMonths == null ? null : Math.round(plan.coveredMonths * 10) / 10,
        monthlyContribution: round(inputs.contribution),
        monthsToTarget: plan.monthsToTarget,
      };
    }
  } catch { /* stays null */ }

  return { goal, netWorth, investingPlan, emergencyFund };
}
