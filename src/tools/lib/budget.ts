/**
 * Budget Builder — data + math, ported verbatim from the original
 * BB_NEEDS/BB_WANTS/BB_SAVE tables and the bbUpdate()/bbCat() logic in
 * tools-app.html. No formula is altered. `computeBudget` is a pure function so
 * it can be parity-checked against the original.
 */
import type { IconName } from '../ui/Icon';

export interface BudgetCat {
  k: string;
  ic: IconName;
  l: string;
}

// V4 category set. Only the categorisation changed — the 50/30/20 compute in
// computeBudget() below is unchanged and is still parity-checked against the
// original bbUpdate() (with these categories injected into the oracle).
export const BB_NEEDS: BudgetCat[] = [
  { k: 'rent', ic: 'rent', l: 'Rent' }, { k: 'groceries', ic: 'grocery', l: 'Groceries' },
  { k: 'utilities', ic: 'bills', l: 'Utilities / Bills' }, { k: 'transport', ic: 'transport', l: 'Transport' },
  { k: 'insurance', ic: 'shield', l: 'Insurance' }, { k: 'medical', ic: 'health', l: 'Medical' },
  { k: 'phone', ic: 'subs', l: 'Phone' }, { k: 'internet', ic: 'layers', l: 'Internet' },
  { k: 'other_needs', ic: 'other', l: 'Other Needs' },
];
export const BB_WANTS: BudgetCat[] = [
  { k: 'eating_out', ic: 'dining', l: 'Eating Out' }, { k: 'going_out', ic: 'users', l: 'Going Out' },
  { k: 'shopping', ic: 'shopping', l: 'Shopping' }, { k: 'subscriptions', ic: 'subs', l: 'Subscriptions' },
  { k: 'entertainment', ic: 'fun', l: 'Entertainment' }, { k: 'personal_care', ic: 'care', l: 'Personal Care' },
  { k: 'travel', ic: 'travel', l: 'Travel / Holidays' }, { k: 'gifts', ic: 'charity', l: 'Gifts' },
  { k: 'other_wants', ic: 'other', l: 'Other Wants' },
];
export const BB_SAVE: BudgetCat[] = [
  { k: 'emergency', ic: 'shield', l: 'Emergency Fund' }, { k: 'loan_invest', ic: 'emi', l: 'Investment for Loan' },
  { k: 'stocks', ic: 'trending', l: 'Stocks / Equity' }, { k: 'gold', ic: 'dollar', l: 'Gold / SGBs' },
  { k: 'self_invest', ic: 'education', l: 'Self Investment' }, { k: 'transfers', ic: 'refresh', l: 'Transfers' },
  { k: 'home_deposit', ic: 'home', l: 'Home Deposit' }, { k: 'other_savings', ic: 'other', l: 'Other Savings' },
];

export const BB_ALL: BudgetCat[] = [...BB_NEEDS, ...BB_WANTS, ...BB_SAVE];

export type BudgetVals = Record<string, number>;

/** Original `num()` semantics: finite → max(0, v), else 0. */
export function numify(v: unknown): number {
  const n = Number(v);
  return isFinite(n) ? Math.max(0, n) : 0;
}

export type CatKey = 'needs' | 'wants' | 'save';
export type CatState = 'empty' | 'over' | 'ok';

export interface CatResult {
  total: number;
  limit: number;
  /** fill width %, capped at 100 (original bbCat pct) */
  fillPct: number;
  over: boolean;
  state: CatState;
  overBy: number;
}

export type Tip = ['warn' | 'info' | 'ok', string, string];

export interface BudgetResult {
  income: number;
  nPct: number;
  wPct: number;
  sPct: number;
  splitWarn: boolean;
  nL: number;
  wL: number;
  sL: number;
  nT: number;
  wT: number;
  sT: number;
  spent: number;
  free: number;
  /** segment-bar widths (original nPctV/wPctV/sPctV) */
  nPctV: number;
  wPctV: number;
  sPctV: number;
  savePct: number;
  pos: boolean;
  allocatedPct: number;
  cats: Record<CatKey, CatResult>;
  tips: Tip[];
}

export interface BudgetInput {
  incomeRaw: string | number;
  needsRaw: string | number;
  wantsRaw: string | number;
  saveRaw: string | number;
  vals: BudgetVals;
}

function catResult(total: number, limit: number): CatResult {
  const fillPct = limit > 0 ? Math.min((total / limit) * 100, 100) : 0;
  const over = total > limit && limit > 0;
  const state: CatState = total === 0 ? 'empty' : over ? 'over' : 'ok';
  return { total, limit, fillPct, over, state, overBy: total - limit };
}

/** Verbatim port of the numeric core of bbUpdate() + bbCat(). */
export function computeBudget(input: BudgetInput): BudgetResult {
  const { vals } = input;
  const income = numify(input.incomeRaw);
  const nPct = Math.min(100, Math.max(0, numify(input.needsRaw) || 50));
  const wPct = Math.min(100, Math.max(0, numify(input.wantsRaw) || 30));
  const sPct = Math.min(100, Math.max(0, numify(input.saveRaw) || 20));
  const splitWarn = nPct + wPct + sPct !== 100;

  const nL = (income * nPct) / 100;
  const wL = (income * wPct) / 100;
  const sL = (income * sPct) / 100;

  const sum = (cfg: BudgetCat[]) => cfg.reduce((s, c) => s + (vals[c.k] || 0), 0);
  const nT = sum(BB_NEEDS);
  const wT = sum(BB_WANTS);
  const sT = sum(BB_SAVE);
  const spent = nT + wT + sT;
  const free = income - spent;

  const nPctV = income > 0 ? Math.round((nL / income) * 100) : nPct;
  const wPctV = income > 0 ? Math.round((wL / income) * 100) : wPct;
  const sPctV = income > 0 ? Math.round((sL / income) * 100) : sPct;

  const pos = free >= 0;
  const savePct = income > 0 ? Math.round((sT / income) * 100) : 0;
  const allocatedPct = income > 0 ? Math.round((spent / income) * 100) : 0;

  const tips: Tip[] = [];
  if (income > 0) {
    if (nT > nL) tips.push(['warn', 'Needs above 50%', 'Rent, EMIs or transport may be squeezing you. Aim to bring fixed costs under half your income.']);
    if (wT > wL) tips.push(['warn', 'Wants above 30%', 'Dining, subscriptions and shopping are over the line. Trimming 10% here funds your future.']);
    if (sT > 0 && sT < sL * 0.5) tips.push(['info', 'Savings under 10%', "You're saving less than half the 20% target. Even a ₹2,000 SIP automates the habit."]);
    if (sT >= sL) tips.push(['ok', 'Savings target hit', "You're at or above 20%. Consider a yearly 10% SIP step-up to compound faster."]);
    if ((vals.emi || 0) > income * 0.3) tips.push(['warn', 'EMI danger zone', 'EMIs alone exceed 30% of income. Prioritise clearing high-interest loans before new investments.']);
    if ((vals.sip || 0) > 0 && (vals.efund || 0) === 0) tips.push(['info', 'No emergency fund', 'You invest but have no buffer. Build 3–6 months of expenses in a liquid fund first.']);
    if (spent === 0) tips.push(['info', 'Start above', 'Fill in your expenses to see your live budget breakdown.']);
  }

  return {
    income, nPct, wPct, sPct, splitWarn,
    nL, wL, sL, nT, wT, sT, spent, free,
    nPctV, wPctV, sPctV, savePct, pos, allocatedPct,
    cats: {
      needs: catResult(nT, nL),
      wants: catResult(wT, wL),
      save: catResult(sT, sL),
    },
    tips,
  };
}

/* ── Month persistence (fx_bb_data) — shape preserved exactly ── */
export interface BudgetMonthData {
  vals: BudgetVals;
  income: string;
  n: string;
  w: string;
  s: string;
}
export type BudgetStore = Record<string, BudgetMonthData>;
