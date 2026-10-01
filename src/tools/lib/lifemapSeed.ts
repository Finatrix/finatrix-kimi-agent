/**
 * LifeMap's opening form, filled in from what the user has already told
 * FinatriX.
 *
 * LifeMap asks for eleven figures — income, expenses, savings, emergency fund,
 * investments, a monthly contribution, debt and an EMI — and every one of them
 * is something the budget, the expense tracker, InvestMatch or Net Worth may
 * already hold. Asking a returning user to type all eleven again is the clearest
 * possible statement that these are eight separate calculators rather than one
 * financial system, and it is the single biggest reason a first LifeMap run gets
 * abandoned: the form is the wall.
 *
 * So: read what exists, fill it in, and SAY where each figure came from. The
 * saying matters as much as the filling — a number that appears in a field the
 * user did not type is either a helpful head start or a mystery, and the only
 * difference between the two is whether the page tells them which.
 *
 * NO NEW ARITHMETIC
 * -----------------
 * Every figure comes from `readDashboard` (the shared snapshot the dashboard
 * itself renders) or from `computeNetWorth` — the same functions, so a seeded
 * LifeMap starts from figures identical to the ones on the dashboard. Nothing
 * here recomputes a budget, re-sums an expense month or re-derives a balance.
 *
 * WHAT IS DELIBERATELY NOT SEEDED
 * -------------------------------
 * Property and vehicles are assets on the balance sheet and are excluded here.
 * LifeMap compounds `savings + invest` forward at an assumed rate, and a house
 * counted at market value would be projected as though it were an index fund —
 * a wrong answer arrived at confidently, which is worse than an empty field.
 * Age, name, career and goals are not stored anywhere else and stay blank.
 *
 * Pure and read-only: no writes, no side effects, and every read is defensive so
 * a missing or corrupt store yields "no seed" rather than an exception on the
 * one screen that is a new user's first impression.
 */

import { readDashboard } from './dashboard';
import { computeNetWorth, loadAccounts, type CategoryTotal } from './netWorth';
import { currentMonth } from './month';
import { converterTo, effectiveRates } from './fx';

/** Which FinatriX surface a seeded figure came from. Shown to the user. */
export type SeedSource = 'Budget' | 'Expenses' | 'Net Worth' | 'InvestMatch';

export interface LifeMapSeed {
  /** Form values, keyed exactly as `FORM_DEFAULTS` in LifeMapPage. */
  values: Record<string, string>;
  /** Field key → where its value came from, for the "we filled this in" note. */
  sources: Record<string, SeedSource>;
  /** The distinct surfaces contributing, in a stable order, for the summary line. */
  from: SeedSource[];
}

const EMPTY: LifeMapSeed = { values: {}, sources: {}, from: [] };

/** Assets that compound. Property and vehicles are wealth, but not this kind. */
const SAVINGS_CATEGORIES = new Set(['cash', 'deposits']);
const INVESTED_CATEGORIES = new Set(['equity', 'retirement', 'gold']);

/**
 * What the user has already recorded, mapped onto LifeMap's form.
 *
 * Returns empty when nothing useful exists, which is the honest state for a
 * first-time visitor and the signal the page uses to show its "you can start
 * here" guidance instead of a "we filled this in" note.
 */
export function readLifeMapSeed(): LifeMapSeed {
  let snap;
  try {
    snap = readDashboard();
  } catch {
    return EMPTY;
  }

  const values: Record<string, string> = {};
  const sources: Record<string, SeedSource> = {};
  const put = (key: string, value: number, source: SeedSource) => {
    values[key] = String(Math.round(value));
    sources[key] = source;
  };

  if (snap.income != null && snap.income > 0) put('lm-income', snap.income, 'Budget');
  if (snap.monthlySpend != null && snap.monthlySpend > 0) put('lm-expenses', snap.monthlySpend, 'Expenses');
  if (snap.invest && snap.invest.monthly > 0) {
    put('lm-sip', snap.invest.monthly, 'InvestMatch');
    values['lm-sip-yn'] = 'yes';
  }

  try {
    const accounts = loadAccounts();
    if (accounts.length > 0) {
      const nw = computeNetWorth(accounts, currentMonth(), {
        displayCurrency: snap.currency,
        convert: converterTo(snap.currency, effectiveRates()),
      });
      const sum = (rows: readonly CategoryTotal[], keep: Set<string>) =>
        rows.filter((r) => keep.has(r.category.k)).reduce((t, r) => t + r.total, 0);

      const savings = sum(nw.assetCategories, SAVINGS_CATEGORIES);
      const invested = sum(nw.assetCategories, INVESTED_CATEGORIES);
      if (savings > 0) put('lm-savings', savings, 'Net Worth');
      if (invested > 0) put('lm-invest', invested, 'Net Worth');
      if (nw.liabilities > 0) {
        put('lm-debt-total', nw.liabilities, 'Net Worth');
        values['lm-debt-yn'] = 'yes';
      }
    }
  } catch {
    // A malformed net-worth store costs the three fields it would have filled,
    // not the page. The rest of the seed stands.
  }

  const order: SeedSource[] = ['Budget', 'Expenses', 'Net Worth', 'InvestMatch'];
  const from = order.filter((s) => Object.values(sources).includes(s));
  return from.length > 0 ? { values, sources, from } : EMPTY;
}
