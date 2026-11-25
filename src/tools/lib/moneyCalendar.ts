/**
 * Money calendar — the next 30, 60 or 90 days as an ESTIMATE of money in, money
 * out and the balance each day.
 *
 * Every figure here is a projection, and the screen says so. The rules are
 * chosen to be explainable in one sentence each and, where a choice had to be
 * made, to err towards a LOWER balance: a forecast that says "fine" and is
 * wrong costs someone a bounced EMI; one that says "tight" and is wrong costs
 * them a second look.
 *
 * WHAT GOES IN
 * ------------
 * • Salary: the amount the person typed here, or else their Budget Builder
 *   income, on the payday they chose (clamped to the month's last day, as the
 *   Calendar does). No payday chosen, no salary — it is never guessed.
 * • Recurring payments: exactly the patterns `detectRecurring` finds, on the
 *   day of the last logged payment (the Calendar's rule), at the pattern's own
 *   average. Spending patterns are bills; savings-section patterns (a SIP, a
 *   standing transfer to an RD) are money leaving the account too. Patterns in
 *   transfer/income keys with no section are left out: their direction is not
 *   known. The person can leave any pattern out (a cancelled subscription).
 * • This month follows `computeCommitments` exactly: a payment counts only if
 *   its day is today or later and nothing matching it is logged this month yet.
 * • Everyday spending (optional, on by default, labelled): the average per day
 *   of everything NOT recurring in spending categories over the last three
 *   complete months, counted from the first day anything was logged. Trip
 *   spending in another currency is left out as a one-off. Needs 28 days.
 *
 * THE BALANCE
 * -----------
 * The person types today's balance. A balance typed on an earlier day is
 * carried forward: minus everything logged since, plus any payday since. Older
 * than 31 days, it is not used at all.
 *
 *     balance(today) = typed − logged since + paydays since + today's flows
 *     balance(d)     = balance(d − 1) + salary(d) − payments(d) − everyday
 *
 * Salary counts only on a day AFTER the day the balance was typed (it may
 * already be in it). Nothing here changes an existing formula: detection,
 * averages and the "already paid" rule are the tools' own.
 */
import type { IconName } from '../ui/Icon';
import { ymdLocal, ymLocal } from '../../lib/date';
import { getJSON, setJSON } from './storage';
import { isSpendingCategory, migrateCategory, type ExpenseItem } from './expense';
import { detectRecurring, type CatMeta } from './expenseAnalytics';
import { daysBetween } from './subscriptions';

/** Per device, like `fx_sub_radar`; cleared on account switch (cloudSync ACCOUNT_LOCAL_KEYS). */
export const MONEY_CAL_KEY = 'fx_money_cal';
export const HORIZONS = [30, 60, 90] as const;
export type Horizon = (typeof HORIZONS)[number];
/** A balance older than this is not carried forward: too much has happened. */
export const BALANCE_MAX_AGE_DAYS = 31;
/** A balance older than this is used, with a nudge to update it. */
export const BALANCE_NUDGE_DAYS = 7;
/** Complete months the everyday average looks back over. */
export const EVERYDAY_LOOKBACK_MONTHS = 3;
/** Days of logging needed before an everyday average means anything. */
export const EVERYDAY_MIN_DAYS = 28;

export interface MoneyCalPrefs {
  /** Balance as typed, and the day it was typed. */
  balance: number | null;
  asOf: string | null;
  /** Monthly salary typed here. Null = use Budget Builder income. */
  salary: number | null;
  /** Day of the month salary arrives, 1–31. Null = not set. */
  payday: number | null;
  /** Include the everyday spending average. */
  everyday: boolean;
  /** Recurring patterns left out of the estimate, by `patternKey`. */
  skipped: string[];
  horizon: Horizon;
}

export const DEFAULT_MONEY_CAL_PREFS: MoneyCalPrefs = {
  balance: null, asOf: null, salary: null, payday: null, everyday: true, skipped: [], horizon: 30,
};

const YMD = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const finite = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function loadMoneyCalPrefs(): MoneyCalPrefs {
  const s = getJSON<Partial<Record<keyof MoneyCalPrefs, unknown>>>(MONEY_CAL_KEY, {});
  const balance = finite(s.balance);
  const asOf = typeof s.asOf === 'string' && YMD.test(s.asOf) ? s.asOf : null;
  const salary = finite(s.salary);
  const payday = finite(s.payday);
  return {
    balance: balance !== null && asOf ? balance : null,
    asOf: balance !== null && asOf ? asOf : null,
    salary: salary !== null && salary >= 0 ? salary : null,
    payday: payday !== null && Number.isInteger(payday) && payday >= 1 && payday <= 31 ? payday : null,
    everyday: s.everyday !== false,
    skipped: Array.isArray(s.skipped) ? s.skipped.filter((k): k is string => typeof k === 'string').slice(0, 200) : [],
    horizon: (HORIZONS as readonly unknown[]).includes(s.horizon) ? (s.horizon as Horizon) : 30,
  };
}

export function saveMoneyCalPrefs(prefs: MoneyCalPrefs): boolean {
  return setJSON(MONEY_CAL_KEY, prefs);
}

export function toggleSkipped(prefs: MoneyCalPrefs, key: string): MoneyCalPrefs {
  const skipped = prefs.skipped.includes(key) ? prefs.skipped.filter((k) => k !== key) : [...prefs.skipped, key];
  return { ...prefs, skipped };
}

/* ── Types ──────────────────────────────────────────────────────────────── */

export type FlowKind = 'salary' | 'bill' | 'saving';

export interface Flow {
  key: string;
  kind: FlowKind;
  label: string;
  /** Always positive; `kind` gives the direction. */
  amount: number;
  icon: IconName;
}

export interface ProjectedDay {
  date: string;
  flows: Flow[];
  inflow: number;
  /** Recurring payments out (bills and savings), not everyday spending. */
  outflow: number;
  /** Everyday spending applied to this day (0 on day 0 and when switched off). */
  everyday: number;
  /** Cumulative net change from the starting balance, through this day. */
  change: number;
  /** Projected end-of-day balance; null when there is no usable balance. */
  balance: number | null;
}

export interface RecurringRow {
  /** `category::merchant`, the identity `detectRecurring` groups on. */
  key: string;
  name: string;
  category: string;
  kind: 'bill' | 'saving';
  icon: IconName;
  amount: number;
  day: number;
  lastDate: string;
  monthsSeen: number;
  included: boolean;
}

export interface EverydayBasis {
  perDay: number;
  total: number;
  days: number;
  from: string;
  to: string;
}

export interface StartingBalance {
  typed: number;
  asOf: string;
  ageDays: number;
  /** Logged money out between the balance day (exclusive) and today (inclusive). */
  loggedSince: number;
  /** Paydays between the balance day and today, both exclusive. */
  salarySince: number;
  /** typed − loggedSince + salarySince: the balance at the start of today. */
  amount: number;
  /** Older than BALANCE_NUDGE_DAYS. */
  stale: boolean;
}

export type BalanceStatus = 'none' | 'ok' | 'expired';

export interface Projection {
  today: string;
  end: string;
  days: ProjectedDay[];
  balanceStatus: BalanceStatus;
  start: StartingBalance | null;
  salary: { amount: number; day: number } | null;
  recurring: RecurringRow[];
  /** The average, whether or not it is switched on. */
  everydayBasis: EverydayBasis | null;
  everydayApplied: boolean;
  totals: { salary: number; bills: number; savings: number; everyday: number; net: number };
  /** Lowest projected balance (first such day). Null without a balance. */
  low: { date: string; balance: number } | null;
  /** First run of days below zero. Null when the balance never goes below zero. */
  shortfall: { date: string; lowDate: string; amount: number; about: number } | null;
}

export interface ProjectionInput {
  items: readonly ExpenseItem[];
  catMeta: Map<string, CatMeta>;
  now: Date;
  horizon: number;
  balance: { amount: number; asOf: string } | null;
  salary: { amount: number; day: number } | null;
  everyday: boolean;
  skipped: readonly string[];
}

/* ── Helpers ────────────────────────────────────────────────────────────── */

const round2 = (n: number): number => Math.round(n * 100) / 100;
const pad = (n: number): string => String(n).padStart(2, '0');

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  return ymdLocal(new Date(y, m - 1, d + n));
}

/** The day `day` lands on in `month`, clamped to the month's last day. */
function dayIn(month: string, day: number): string {
  const [y, m] = month.split('-').map(Number);
  return `${month}-${pad(Math.min(day, new Date(y, m, 0).getDate()))}`;
}

/** Every `YYYY-MM` from `from`'s month through `to`'s month. */
function monthsBetween(from: string, to: string): string[] {
  const [y, m] = from.split('-').map(Number);
  const last = to.slice(0, 7);
  const out: string[] = [];
  for (let i = 0; ; i++) {
    const month = ymLocal(new Date(y, m - 1 + i, 1));
    if (month > last) return out;
    out.push(month);
  }
}

/** Money out, by category: a bill, a saving, or neither (direction unknown). */
function kindOf(category: string, catMeta: Map<string, CatMeta>): 'bill' | 'saving' | null {
  const section = catMeta.get(category)?.section ?? null;
  if (isSpendingCategory({ k: category, section })) return 'bill';
  return section === 'save' ? 'saving' : null;
}

/** The group identity `detectRecurring` uses, for a pattern or an expense. */
export function patternKey(category: string, merchant: string | null | undefined): string {
  return `${category}::${(merchant || '').toLowerCase()}`;
}

/** Salary dates from `from` to `to`, both inclusive. */
function paydays(salary: { day: number }, from: string, to: string): string[] {
  if (from > to) return [];
  return monthsBetween(from, to).map((m) => dayIn(m, salary.day)).filter((d) => d >= from && d <= to);
}

/* ── Everyday spending ─────────────────────────────────────────────────── */

/**
 * Average daily spending that is NOT a recurring payment, over the last
 * `EVERYDAY_LOOKBACK_MONTHS` complete months, counted from the first day
 * anything was logged if that is later. Null with under `EVERYDAY_MIN_DAYS`.
 */
export function everydayAverage(
  items: readonly ExpenseItem[], catMeta: Map<string, CatMeta>, now: Date, recurringKeys: ReadonlySet<string>,
): EverydayBasis | null {
  const to = ymdLocal(new Date(now.getFullYear(), now.getMonth(), 0));
  const windowStart = ymdLocal(new Date(now.getFullYear(), now.getMonth() - EVERYDAY_LOOKBACK_MONTHS, 1));
  let earliest: string | null = null;
  for (const e of items) if (YMD.test(e.date || '') && (earliest === null || e.date < earliest)) earliest = e.date;
  if (earliest === null || earliest > to) return null;
  const from = earliest > windowStart ? earliest : windowStart;
  const days = daysBetween(from, to) + 1;
  if (days < EVERYDAY_MIN_DAYS) return null;

  const validKeys = new Set(catMeta.keys());
  let total = 0;
  for (const e of items) {
    if (!YMD.test(e.date || '') || e.date < from || e.date > to) continue;
    if (e.fxCurrency) continue; // trip spending: a one-off, not an everyday rate
    const cat = migrateCategory(e.category, validKeys);
    if (kindOf(cat, catMeta) !== 'bill') continue;
    if (recurringKeys.has(patternKey(cat, e.merchant))) continue;
    total += Number(e.amount) || 0;
  }
  total = round2(Math.max(0, total));
  return { perDay: round2(total / days), total, days, from, to };
}

/* ── The projection ────────────────────────────────────────────────────── */

export function projectMoney(input: ProjectionInput): Projection {
  const { items, catMeta, now, skipped } = input;
  const horizon = Math.max(1, Math.min(366, Math.round(input.horizon)));
  const today = ymdLocal(now);
  const end = addDays(today, horizon);
  const month = today.slice(0, 7);
  const todayDay = Number(today.slice(8, 10));
  const validKeys = new Set(catMeta.keys());
  const skip = new Set(skipped);
  const salary = input.salary && input.salary.amount > 0 && Number.isInteger(input.salary.day)
    && input.salary.day >= 1 && input.salary.day <= 31 ? input.salary : null;

  // Display names keep the merchant's own capitalisation, from its latest entry.
  const display = new Map<string, { date: string; name: string }>();
  for (const e of items) {
    const name = (e.merchant || '').trim();
    if (!name) continue;
    const key = patternKey(migrateCategory(e.category, validKeys), e.merchant);
    const seen = display.get(key);
    if (!seen || e.date > seen.date) display.set(key, { date: e.date, name });
  }

  // ── Recurring payments ──
  const patterns = detectRecurring([...items], catMeta);
  const recurringKeys = new Set(patterns.map((p) => patternKey(p.category, p.merchant)));
  const recurring: RecurringRow[] = [];
  for (const p of patterns) {
    const kind = kindOf(p.category, catMeta);
    if (!kind) continue;
    const day = Number((p.lastDate || '').slice(8, 10));
    if (!Number.isFinite(day) || day < 1) continue;
    const key = patternKey(p.category, p.merchant);
    recurring.push({
      key, kind, day,
      name: display.get(key)?.name ?? p.label,
      category: p.category,
      icon: p.icon,
      amount: p.estimatedMonthly,
      lastDate: p.lastDate,
      monthsSeen: p.monthsDetected,
      included: !skip.has(key),
    });
  }
  recurring.sort((a, b) => a.day - b.day || b.amount - a.amount);

  /** Same rule as computeCommitments: anything matching logged in this month. */
  const paidThisMonth = (row: RecurringRow): boolean => {
    const merchant = row.key.slice(row.category.length + 2).trim();
    return items.some((e) => (e.date || '').slice(0, 7) === month
      && migrateCategory(e.category, validKeys) === row.category
      && (merchant === '' || (e.merchant || '').trim().toLowerCase() === merchant));
  };

  const flowsByDate = new Map<string, Flow[]>();
  const addFlow = (date: string, flow: Flow) => {
    const list = flowsByDate.get(date) ?? [];
    list.push(flow);
    flowsByDate.set(date, list);
  };

  const months = monthsBetween(today, end);
  for (const row of recurring) {
    if (!row.included) continue;
    for (const m of months) {
      if (m === month && (row.day < todayDay || paidThisMonth(row))) continue;
      const date = dayIn(m, row.day);
      if (date < today || date > end) continue;
      addFlow(date, { key: `${row.key}|${m}`, kind: row.kind, label: row.name, amount: row.amount, icon: row.icon });
    }
  }

  // ── Starting balance ──
  let start: StartingBalance | null = null;
  let balanceStatus: BalanceStatus = 'none';
  if (input.balance && Number.isFinite(input.balance.amount) && YMD.test(input.balance.asOf)) {
    const { amount: typed, asOf } = input.balance;
    const ageDays = daysBetween(asOf, today);
    if (ageDays < 0 || ageDays > BALANCE_MAX_AGE_DAYS) {
      balanceStatus = 'expired';
    } else {
      let loggedSince = 0;
      for (const e of items) {
        if (!YMD.test(e.date || '') || e.date <= asOf || e.date > today) continue;
        if (!kindOf(migrateCategory(e.category, validKeys), catMeta)) continue;
        loggedSince += Number(e.amount) || 0;
      }
      loggedSince = round2(loggedSince);
      const salarySince = salary ? paydays(salary, addDays(asOf, 1), addDays(today, -1)).length * salary.amount : 0;
      start = {
        typed, asOf, ageDays, loggedSince, salarySince,
        amount: round2(typed - loggedSince + salarySince),
        stale: ageDays > BALANCE_NUDGE_DAYS,
      };
      balanceStatus = 'ok';
    }
  }

  // ── Salary: only on a day after the balance day (today's may be in it) ──
  if (salary) {
    const after = start ? start.asOf : today;
    for (const date of paydays(salary, addDays(after, 1), end)) {
      if (date < today) continue;
      addFlow(date, { key: `salary|${date}`, kind: 'salary', label: 'Salary', amount: salary.amount, icon: 'briefcase' });
    }
  }

  // ── Everyday spending ──
  const everydayBasis = everydayAverage(items, catMeta, now, recurringKeys);
  const everydayApplied = input.everyday && everydayBasis !== null && everydayBasis.perDay > 0;
  const perDay = everydayApplied && everydayBasis ? everydayBasis.perDay : 0;

  // ── Day by day ──
  const days: ProjectedDay[] = [];
  const totals = { salary: 0, bills: 0, savings: 0, everyday: 0, net: 0 };
  let change = 0;
  for (let i = 0; i <= horizon; i++) {
    const date = addDays(today, i);
    const flows = (flowsByDate.get(date) ?? []).sort((a, b) => (a.kind === 'salary' ? -1 : 0) - (b.kind === 'salary' ? -1 : 0) || b.amount - a.amount);
    let inflow = 0;
    let outflow = 0;
    for (const f of flows) {
      if (f.kind === 'salary') { inflow += f.amount; totals.salary += f.amount; }
      else { outflow += f.amount; if (f.kind === 'bill') totals.bills += f.amount; else totals.savings += f.amount; }
    }
    const everyday = i === 0 ? 0 : perDay;
    totals.everyday += everyday;
    change = round2(change + inflow - outflow - everyday);
    days.push({
      date, flows, inflow: round2(inflow), outflow: round2(outflow), everyday, change,
      balance: start ? round2(start.amount + change) : null,
    });
  }
  totals.salary = round2(totals.salary);
  totals.bills = round2(totals.bills);
  totals.savings = round2(totals.savings);
  totals.everyday = round2(totals.everyday);
  totals.net = change;

  // ── Low point and the first shortfall ──
  let low: Projection['low'] = null;
  let shortfall: Projection['shortfall'] = null;
  if (start) {
    for (const d of days) {
      if (d.balance === null) continue;
      if (!low || d.balance < low.balance) low = { date: d.date, balance: d.balance };
    }
    const first = days.findIndex((d) => (d.balance ?? 0) < 0);
    if (first >= 0) {
      let lowDay = days[first];
      for (let i = first; i < days.length && (days[i].balance ?? 0) < 0; i++) {
        if ((days[i].balance ?? 0) < (lowDay.balance ?? 0)) lowDay = days[i];
      }
      const amount = round2(-(lowDay.balance ?? 0));
      shortfall = { date: days[first].date, lowDate: lowDay.date, amount, about: Math.ceil(amount / 100) * 100 };
    }
  }

  return {
    today, end, days, balanceStatus, start, salary, recurring, everydayBasis, everydayApplied,
    totals, low, shortfall,
  };
}
