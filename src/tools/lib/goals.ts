/**
 * Reverse Goal Planner — data + math, ported verbatim from GP_PRESETS / GP_PATHS
 * and gpSip()/gpStepUp()/gpCalc() in tools-app.html. gpSip (annuity-due) and
 * gpStepUp (binary-search over a step-up simulation) are pure and directly
 * parity-checked; computeGoalPlanner assembles them exactly as gpCalc did.
 * Renders with INR `fmt`.
 */

// Preset tuples kept identical to the source ([label, iconId, amount, years]);
// iconId carries the "ic-" prefix as in the original.
export type GoalPreset = [string, string, number, number];
export const GP_PRESETS: GoalPreset[] = [
  ['Dream house', 'ic-home', 5000000, 10], ['New car', 'ic-car', 1000000, 3], ['Europe trip', 'ic-compass', 500000, 2],
  ['Wedding fund', 'ic-award', 2000000, 5], ['₹1 Crore club', 'ic-dollar', 10000000, 15], ['Retirement', 'ic-sun', 30000000, 25],
];

export interface GoalPath {
  n: string;
  d: string;
  rate: number;
  c: string;
  inst: string;
}
export const GP_PATHS: GoalPath[] = [
  { n: 'Aggressive path', d: 'Small + mid-cap heavy · higher volatility, higher reward', rate: 0.14, c: '#c2410c', inst: 'Small-cap MF, mid-cap MF, international equity, sectoral funds' },
  { n: 'Moderate path', d: 'Large-cap + balanced · steady growth, managed risk', rate: 0.12, c: '#b08a36', inst: 'Large-cap MF, Nifty 50 index, ELSS, balanced advantage fund' },
  { n: 'Conservative path', d: 'Debt + FD heavy · capital preservation first', rate: 0.08, c: '#0c8079', inst: 'PPF, FDs, debt MF, short-duration funds, gold SGBs' },
];

/** SIP needed (annuity-due) — verbatim. */
export function gpSip(target: number, r: number, n: number): number {
  if (target <= 0) return 0;
  return (target * r) / ((Math.pow(1 + r, n) - 1) * (1 + r));
}

/** Starting SIP with 10% annual step-up, solved by simulation + binary search. */
export function gpStepUp(target: number, annualRate: number, years: number): number {
  if (target <= 0) return 0;
  const sim = (start: number) => {
    let bal = 0;
    let sip = start;
    const mr = annualRate / 12;
    for (let m = 0; m < years * 12; m++) {
      if (m > 0 && m % 12 === 0) sip *= 1.1;
      bal = (bal + sip) * (1 + mr);
    }
    return bal;
  };
  let lo = 0;
  let hi = target;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (sim(mid) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

export interface GoalMilestone {
  y: number;
  val: number;
  pct: number;
}
export interface GoalPathResult extends GoalPath {
  monthly: number;
  stepStart: number;
  invested: number;
  totalValue: number;
  gains: number;
  milestones: GoalMilestone[];
  existingFV: number;
  investPct: number;
}
export interface GoalInput {
  name: string;
  targetToday: number;
  years: number;
  existing: number;
  inflate: boolean;
}
export interface GoalResult {
  valid: boolean;
  name: string;
  targetToday: number;
  target: number;
  years: number;
  existing: number;
  inflate: boolean;
  results: GoalPathResult[];
}

const CHECKPOINTS = [1, 2, 3, 5, 7, 10, 15, 20, 25, 30, 35, 40];

/** Verbatim port of gpCalc()'s calculation core. `targetToday < 1000` is invalid. */
export function computeGoalPlanner(inp: GoalInput): GoalResult {
  const name = inp.name.trim() || 'Your goal';
  const targetToday = Math.max(0, inp.targetToday);
  const years = Math.min(40, Math.max(1, inp.years));
  const existing = Math.max(0, inp.existing);
  const inflate = inp.inflate;

  if (targetToday < 1000) {
    return { valid: false, name, targetToday, target: 0, years, existing, inflate, results: [] };
  }

  const target = inflate ? targetToday * Math.pow(1.06, years) : targetToday;

  const results: GoalPathResult[] = GP_PATHS.map((p) => {
    const r = p.rate / 12;
    const n = years * 12;
    const existingFV = existing * Math.pow(1 + p.rate, years);
    const need = Math.max(0, target - existingFV);
    const monthly = Math.ceil(gpSip(need, r, n));
    const stepStart = Math.ceil(gpStepUp(need, p.rate, years));
    const invested = monthly * n;
    const totalValue = monthly * ((Math.pow(1 + r, n) - 1) / r) * (1 + r) + existingFV;
    const gains = Math.max(0, totalValue - invested - existing);

    const checkpoints = CHECKPOINTS.filter((y) => y <= years);
    const milestones: GoalMilestone[] = checkpoints.map((y) => {
      const nm = y * 12;
      const val = monthly * ((Math.pow(1 + r, nm) - 1) / r) * (1 + r) + existing * Math.pow(1 + p.rate, y);
      return { y, val, pct: Math.min(100, target > 0 ? (val / target) * 100 : 0) };
    });

    return {
      ...p, monthly, stepStart, invested, totalValue, gains, milestones, existingFV,
      investPct: totalValue > 0 ? Math.round((invested / totalValue) * 100) : 0,
    };
  });

  return { valid: true, name, targetToday, target, years, existing, inflate, results };
}
