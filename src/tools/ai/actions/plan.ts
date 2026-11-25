/**
 * From the picker's JSON to an action the app can show on a confirm card.
 *
 * THE BOUNDARY
 * ------------
 * The model chooses: which action, which category key, which screen, which
 * calculator, which named day, which named currency. Every one of those is
 * checked against a fixed list. It never supplies a number: amounts and counts
 * arrive as spans of the user's own words, are refused unless the user said
 * them (`saidInMessage`), and are read by the app's parser. Every price, rate
 * and result after that is the app's own code (`spendMoney`, the calculators).
 *
 * Pure apart from the inputs it is handed: no storage reads, no writes.
 */
import { extractJson } from '../../../lib/ai/json';
import { ymdLocal } from '../../../lib/date';
import { parseQuickAdd } from '../../lib/quickAdd';
import {
  contextOf, isHomeTrip, spendMoney, tripDefaults, tripOn, type SpendMoney, type Trip,
} from '../../lib/trips';
import type { BudgetStore } from '../../lib/budget';
import type { MarketPack } from '../../lib/markets/types';
import { runCalculator, CALCULATOR_HOME, CALCULATOR_LABEL, type CalcResult, type CalculatorId } from './calculators';
import { namedCurrency, normalizeSpoken, parseSpokenAmount, parseSpokenCount, saidInMessage, timesSaid } from './spoken';
import { SCREENS, screenById } from './screens';

export type ActionName = 'log_expense' | 'log_trip_spend' | 'set_budget' | 'run_calculator' | 'open_screen' | 'plan' | 'none';

const ACTIONS: readonly ActionName[] = ['log_expense', 'log_trip_spend', 'set_budget', 'run_calculator', 'open_screen', 'plan', 'none'];
/** What a multi-step plan may hold: writes that each get their own confirm card. */
const STEP_ACTIONS: readonly ActionName[] = ['log_expense', 'log_trip_spend', 'set_budget'];
/** Most steps in one plan (step 3.9). More is refused rather than cut short. */
export const MAX_PLAN_STEPS = 4;
const DAYS = { today: 0, yesterday: 1, day_before_yesterday: 2 } as const;
const CALCULATORS: readonly CalculatorId[] = ['goal', 'sip', 'emergency'];

/** The picker's reply, every field a string exactly as it wrote it. */
export interface RawPlan {
  action: ActionName;
  amount?: string;
  category?: string;
  note?: string;
  day?: string;
  currency?: string;
  calculator?: string;
  target?: string;
  monthly?: string;
  years?: string;
  months?: string;
  saved?: string;
  screen?: string;
  /** `plan` only: each step, parsed like a single action. */
  steps?: RawPlan[];
}

const FIELDS = ['amount', 'category', 'note', 'day', 'currency', 'calculator', 'target', 'monthly', 'years', 'months', 'saved', 'screen'] as const;

/** Null when the reply is not a plan at all, which the caller treats as "none". */
export function parsePlan(content: string): RawPlan | null {
  return planFrom(extractJson(content), true);
}

function planFrom(dict: Record<string, unknown>, top: boolean): RawPlan | null {
  const action = dict.action;
  if (typeof action !== 'string' || !ACTIONS.includes(action as ActionName)) return null;
  const plan: RawPlan = { action: action as ActionName };
  for (const f of FIELDS) {
    const v = dict[f];
    // A number where a span belongs is the model writing a figure, not copying
    // one: it is kept as text and still has to be found in the message.
    if (typeof v === 'string' || typeof v === 'number') {
      const s = String(v).trim().slice(0, 80);
      if (s) plan[f] = s;
    }
  }
  if (action === 'plan') {
    // Steps only at the top level, and only the writes a card can confirm.
    if (!top || !Array.isArray(dict.steps)) return null;
    const steps = dict.steps
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x))
      .map((x) => planFrom(x, false));
    if (steps.length < 1 || steps.length > MAX_PLAN_STEPS) return null;
    if (steps.some((st) => !st || !STEP_ACTIONS.includes(st.action))) return null;
    plan.steps = steps as RawPlan[];
  }
  return plan;
}

/* ── Stored actions ──────────────────────────────────────────────────────── */

/** pending → saved → undone, or pending → cancelled. */
export type ActionStatus = 'pending' | 'saved' | 'cancelled' | 'undone';

export interface ExpenseAction {
  kind: 'expense';
  status: ActionStatus;
  /** The amount as said, in `typedCurrency`. */
  typed: number;
  typedCurrency: string;
  homeCurrency: string;
  /** The user named the trip's currency (`'trip'`), the home one (`'home'`), or neither. */
  named: 'trip' | 'home' | null;
  category: string;
  date: string;
  note?: string;
  paymentMethod?: string;
  /** Set once saved, for Undo. */
  savedId?: string;
}

export interface BudgetAction {
  kind: 'budget';
  status: ActionStatus;
  month: string;
  category: string;
  amount: number;
  /** The value before, read when it is saved. Null when the category had none. */
  previous?: number | null;
}

export interface CalcAction {
  kind: 'calc';
  status: 'saved';
  result: CalcResult;
  href: string;
  label: string;
  hrefLabel: string;
}

export interface OpenAction {
  kind: 'open';
  status: 'saved';
  screen: string;
  href: string;
  label: string;
}

export type AssistantAction = ExpenseAction | BudgetAction | CalcAction | OpenAction;

/** What the picker's plan became. */
export type Resolution =
  | { kind: 'action'; action: AssistantAction }
  /** Several writes in one message (step 3.9): one confirm card each, plus what could not be done. */
  | { kind: 'plan'; actions: Array<ExpenseAction | BudgetAction>; skipped: string[] }
  | { kind: 'refuse'; message: string; href?: string; hrefLabel?: string }
  | { kind: 'none' };

export interface ResolveContext {
  utterance: string;
  now: Date;
  homeCurrency: string;
  /** The budget month the panel is on. */
  month: string;
  /** This month's active categories. */
  categories: ReadonlyArray<{ k: string; l: string }>;
  /** Word → category key, from the user's own ledger. */
  learned?: ReadonlyMap<string, string>;
  trips: readonly Trip[];
  budgets: BudgetStore;
  market: MarketPack;
  /**
   * The words a plan step is about (its note), read for the category, day and
   * payment method instead of the whole message, so one step's "rent" can't
   * become every step's category. Spans are still checked against the message.
   */
  scope?: string;
}

/** A span the user said, read as an amount. Undefined when not said or not readable. */
function amountOf(span: string | undefined, utterance: string): number | undefined {
  if (!span || !saidInMessage(span, utterance)) return undefined;
  return parseSpokenAmount(span) ?? undefined;
}

function countOf(span: string | undefined, utterance: string): number | undefined {
  if (!span || !saidInMessage(span, utterance)) return undefined;
  return parseSpokenCount(span) ?? undefined;
}

/**
 * The category for this message. The user's own history and category names
 * beat the model; the model beats the generic keyword table, because it
 * understands "kal ka khana" and the table does not.
 */
function categoryFor(plan: RawPlan, ctx: ResolveContext): { category: string; date: string; paymentMethod?: string } {
  const keys = new Set(ctx.categories.map((c) => c.k));
  const parsed = parseQuickAdd(ctx.scope ?? ctx.utterance, ctx.now, { categories: ctx.categories, learned: ctx.learned });
  const fromUser = parsed.category && (parsed.categorySource === 'history' || parsed.categorySource === 'label') ? parsed.category : '';
  const fromModel = plan.category && keys.has(plan.category) ? plan.category : '';
  const category = fromUser || fromModel || (parsed.category && keys.has(parsed.category) ? parsed.category : '');
  return { category, date: parsed.date, paymentMethod: parsed.paymentMethod };
}

function dayOf(plan: RawPlan, fallback: string, now: Date): string {
  const back = plan.day && Object.hasOwn(DAYS, plan.day) ? DAYS[plan.day as keyof typeof DAYS] : null;
  if (back === null) return fallback;
  return ymdLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
}

const NO_AMOUNT = 'I didn’t catch an amount. Say it with the number, like “450 for lunch”.';

export function resolvePlan(plan: RawPlan | null, ctx: ResolveContext): Resolution {
  if (!plan || plan.action === 'none') return { kind: 'none' };
  if (plan.action === 'plan') return resolveSteps(plan.steps ?? [], ctx);
  const u = ctx.utterance;

  if (plan.action === 'open_screen') {
    const screen = plan.screen ? screenById(plan.screen) : undefined;
    if (!screen) return { kind: 'none' };
    return { kind: 'action', action: { kind: 'open', status: 'saved', screen: screen.id, href: screen.href, label: screen.label } };
  }

  if (plan.action === 'run_calculator') {
    const id = CALCULATORS.find((c) => c === plan.calculator);
    if (!id) return { kind: 'none' };
    const out = runCalculator(id, {
      target: amountOf(plan.target, u),
      monthly: amountOf(plan.monthly, u),
      years: countOf(plan.years, u),
      months: countOf(plan.months, u),
      saved: amountOf(plan.saved, u),
    }, ctx.market);
    const home = CALCULATOR_HOME[id];
    if (!out.ok) return { kind: 'refuse', message: out.message, href: home.href, hrefLabel: `Open ${home.label}` };
    return { kind: 'action', action: { kind: 'calc', status: 'saved', result: out.result, href: home.href, label: CALCULATOR_LABEL[id], hrefLabel: `Open ${home.label}` } };
  }

  if (plan.action === 'set_budget') {
    const amount = amountOf(plan.amount, u);
    if (amount === undefined) return { kind: 'refuse', message: NO_AMOUNT };
    const { category } = categoryFor(plan, ctx);
    if (!category) {
      return { kind: 'refuse', message: 'Which category? Say its name as it appears in Budget Builder.', href: '/tools/budget', hrefLabel: 'Open Budget Builder' };
    }
    if (!Object.hasOwn(ctx.budgets, ctx.month)) {
      return { kind: 'refuse', message: 'This month’s budget isn’t set up yet. Start it in Budget Builder, then ask again.', href: '/tools/budget', hrefLabel: 'Open Budget Builder' };
    }
    return { kind: 'action', action: { kind: 'budget', status: 'pending', month: ctx.month, category, amount } };
  }

  // log_expense and log_trip_spend: one entry route, priced by `spendMoney`.
  const typed = amountOf(plan.amount, u);
  if (typed === undefined) return { kind: 'refuse', message: NO_AMOUNT };
  const { category, date: parsedDate, paymentMethod } = categoryFor(plan, ctx);
  const date = dayOf(plan, parsedDate, ctx.now);
  const trip = tripOn(ctx.trips, date);
  const code = plan.currency && namedCurrency(plan.currency, u) ? plan.currency.toUpperCase() : null;

  let named: ExpenseAction['named'] = null;
  if (code && code === ctx.homeCurrency) named = 'home';
  else if (code) {
    if (!trip || isHomeTrip(trip) || trip.currency !== code) {
      return {
        kind: 'refuse',
        message: trip && !isHomeTrip(trip)
          ? `Your trip on that day is in ${trip.currency}, so I can’t log ${code}. Add it in the Expense Tracker if it was a different currency.`
          : `You don’t have a trip in ${code} on that day. Set one up in the Expense Tracker’s travel mode first.`,
        href: '/tools/expenses', hrefLabel: 'Open Expense Tracker',
      };
    }
    named = 'trip';
  } else if (plan.action === 'log_trip_spend' && (!trip || isHomeTrip(trip))) {
    return { kind: 'refuse', message: 'You don’t have a trip on that day. Set one up in the Expense Tracker’s travel mode first.', href: '/tools/expenses', hrefLabel: 'Open Expense Tracker' };
  }

  const note = plan.note && saidInMessage(plan.note, u) ? plan.note : undefined;
  const typedCurrency = named === 'trip' && trip ? trip.currency : named === 'home' ? ctx.homeCurrency : (tripDefaults(trip, category, false).paidInTrip && trip ? trip.currency : ctx.homeCurrency);
  return {
    kind: 'action',
    action: {
      kind: 'expense', status: 'pending', typed, typedCurrency, homeCurrency: ctx.homeCurrency, named,
      category, date, ...(note ? { note } : {}), ...(paymentMethod ? { paymentMethod } : {}),
    },
  };
}

/**
 * A multi-step plan: every step resolved on its own, exactly like a single
 * action, into its own confirm card. Nothing is saved here or together: each
 * card is saved (and undone) by its own tap.
 *
 * One more guard than a single action: the model may not reuse the user's
 * words. "450 for lunch and dinner" said once cannot become two 450s; a span
 * is usable as many times as the user said it.
 */
function resolveSteps(steps: readonly RawPlan[], ctx: ResolveContext): Resolution {
  const left = new Map<string, number>();
  const actions: Array<ExpenseAction | BudgetAction> = [];
  const skipped: string[] = [];
  steps.forEach((step, i) => {
    const label = `Step ${i + 1}`;
    const span = step.amount ? normalizeSpoken(step.amount) : '';
    if (span) {
      const remaining = left.has(span) ? left.get(span)! : timesSaid(step.amount!, ctx.utterance);
      if (remaining <= 0) {
        skipped.push(`${label}: that amount was already used by an earlier step, so I left it out.`);
        return;
      }
      left.set(span, remaining - 1);
    }
    const note = step.note && saidInMessage(step.note, ctx.utterance) ? step.note : '';
    const out = resolvePlan(step, { ...ctx, scope: note });
    if (out.kind === 'action' && (out.action.kind === 'expense' || out.action.kind === 'budget')) actions.push(out.action);
    else if (out.kind === 'refuse') skipped.push(`${label}: ${out.message}`);
    else skipped.push(`${label}: I couldn’t work out what to do.`);
  });
  if (actions.length === 0) {
    return skipped.length ? { kind: 'refuse', message: skipped.join(' ') } : { kind: 'none' };
  }
  return { kind: 'plan', actions, skipped };
}

/* ── Pricing an expense (the app's maths) ────────────────────────────────── */

export type Priced =
  | { ok: true; money: SpendMoney; trip: Trip | null; inTripCurrency: boolean; currency: string }
  | { ok: false; message: string };

/**
 * The money fields this expense will be saved with, for its current category
 * and date. The same rule and the same `spendMoney` call as the Expense
 * Tracker's quick-add line: on a trip the amount is in the trip's currency
 * unless the category stays home. Naming a currency overrides that default.
 */
export function priceExpense(a: Pick<ExpenseAction, 'typed' | 'named' | 'typedCurrency' | 'homeCurrency' | 'category' | 'date' | 'paymentMethod'>, trips: readonly Trip[]): Priced {
  const trip = tripOn(trips, a.date);
  const defaults = tripDefaults(trip, a.category, false);
  if (a.named === 'trip') {
    if (!trip || isHomeTrip(trip) || trip.currency !== a.typedCurrency) {
      return { ok: false, message: `There is no ${a.typedCurrency} trip on that day.` };
    }
    const money = spendMoney(a.typed, { ctx: contextOf(trip), paidInTrip: true, tripId: trip.id, paymentMethod: a.paymentMethod });
    return { ok: true, money, trip, inTripCurrency: true, currency: trip.currency };
  }
  const paidInTrip = a.named === 'home' ? false : defaults.paidInTrip;
  const money = spendMoney(a.typed, { ...defaults, paidInTrip, paymentMethod: a.paymentMethod });
  return { ok: true, money, trip, inTripCurrency: paidInTrip, currency: paidInTrip && trip ? trip.currency : a.homeCurrency };
}

export { SCREENS };
