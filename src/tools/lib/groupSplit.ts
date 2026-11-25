/**
 * Groups, Split costs (NEW_FEATURES item 12, build step 2.4): the maths.
 *
 * Pure functions, no storage and no Supabase. Every figure here is a whole
 * number of PAISE, so sums are exact and the same on every phone. The rules,
 * with worked examples and the reasons for each choice, are written out in
 * docs/GROUPS.md ("Split costs: the maths").
 *
 * 1. `splitExpense` turns one expense into each person's share, by the
 *    largest-remainder method: the shares always add up to the amount.
 * 2. `computeBalances` nets what each member paid, owes and settled.
 * 3. `suggestPayments` finds the few payments that settle everyone up.
 *
 * The AI never sets any of these numbers.
 */

export type SplitRule = 'equal' | 'shares' | 'exact';

/** One entry of `group_expenses.shares` (docs/GROUPS.md "Shares"). */
export interface ShareEntry {
  member: string;
  value: number;
}

export const SPLIT_RULES: readonly SplitRule[] = ['equal', 'shares', 'exact'];
export const isSplitRule = (v: unknown): v is SplitRule => v === 'equal' || v === 'shares' || v === 'exact';

/** Whole paise. Group amounts are numeric(14,2), so this is exact. */
export const toPaise = (amount: number): number => Math.round(Number(amount) * 100);
export const fromPaise = (paise: number): number => paise / 100;

/** The member ids are uuids: a plain compare gives every phone the same order. */
const byId = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The stored list, checked. Null when it is not a usable list of 1 to 20 people. */
export function parseShares(raw: unknown): ShareEntry[] | null {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 20) return null;
  const seen = new Set<string>();
  const out: ShareEntry[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return null;
    const member = (item as { member?: unknown }).member;
    if (typeof member !== 'string' || !member || seen.has(member)) return null;
    seen.add(member);
    const value = Number((item as { value?: unknown }).value);
    out.push({ member, value: Number.isFinite(value) ? value : 0 });
  }
  return out;
}

/**
 * Split `amount` paise by whole-number weights, largest remainder first.
 *
 * - base_i = floor(amount * w_i / W), remainder_i = amount * w_i mod W
 * - the paise left over (always fewer than the people) go one each to the
 *   people with the largest remainders; a tie goes to the smaller member id.
 *
 * Products can pass 2^53 (1e14 paise times a weight), so they use BigInt.
 */
export function weightedSplit(amount: number, weights: ReadonlyArray<{ member: string; weight: number }>): Map<string, number> {
  const people = [...weights].sort((a, b) => byId(a.member, b.member));
  const total = people.reduce((sum, p) => sum + BigInt(p.weight), 0n);
  const A = BigInt(amount);
  const rows = people.map((p) => {
    const product = A * BigInt(p.weight);
    return { member: p.member, base: product / total, rem: product % total };
  });
  const left = Number(A - rows.reduce((sum, r) => sum + r.base, 0n));
  const order = [...rows].sort((a, b) => (a.rem === b.rem ? byId(a.member, b.member) : a.rem > b.rem ? -1 : 1));
  const extra = new Set(order.slice(0, left).map((r) => r.member));
  return new Map(rows.map((r) => [r.member, Number(r.base) + (extra.has(r.member) ? 1 : 0)]));
}

export interface SplitResult {
  /** member id -> that person's share, in paise. Adds up to the amount. */
  shares: Map<string, number>;
  /** The stored split could not be used as written (see the rules), so it was split equally. */
  repaired: boolean;
}

/**
 * One expense into shares. Null for an expense that is not split (Budget
 * together), which belongs to no balance.
 */
export function splitExpense(amountPaise: number, rule: string | null, rawShares: unknown): SplitResult | null {
  if (!isSplitRule(rule)) return null;
  const list = parseShares(rawShares);
  if (!list || !Number.isSafeInteger(amountPaise) || amountPaise <= 0) return null;
  const equal = (repaired: boolean): SplitResult => ({
    shares: weightedSplit(amountPaise, list.map((p) => ({ member: p.member, weight: 1 }))),
    repaired,
  });
  if (rule === 'equal') return equal(false);
  if (rule === 'shares') {
    const weights = list.map((p) => ({ member: p.member, weight: Math.round(p.value * 100) }));
    if (weights.some((w) => !(w.weight > 0))) return equal(true);
    return { shares: weightedSplit(amountPaise, weights), repaired: false };
  }
  // exact: the parts to the paisa, which must add up to the amount.
  const parts = list.map((p) => ({ member: p.member, paise: toPaise(p.value) }));
  const sum = parts.reduce((s, p) => s + p.paise, 0);
  if (parts.some((p) => p.paise < 0) || sum !== amountPaise) return equal(true);
  return { shares: new Map(parts.map((p) => [p.member, p.paise])), repaired: false };
}

/** What `splitExpense` needs of a group expense row. */
export interface SplitExpense {
  amount: number;
  paid_by: string;
  split_rule: string | null;
  shares: unknown;
  deleted_at?: string | null;
}

export interface SplitSettlement {
  from_member: string;
  to_member: string;
  amount: number;
  deleted_at?: string | null;
}

/** Your own share of one expense, in paise (0 when you are not in it or it is not split). */
export function shareOf(expense: SplitExpense, memberId: string): number {
  return splitExpense(toPaise(expense.amount), expense.split_rule, expense.shares)?.shares.get(memberId) ?? 0;
}

/**
 * Each member's balance in paise: paid - owed + settled by them - settled to
 * them. Positive: the group owes them. Negative: they owe the group. The
 * balances always add up to 0. Deleted rows don't count.
 */
export function computeBalances(
  expenses: readonly SplitExpense[],
  settlements: readonly SplitSettlement[],
): Map<string, number> {
  const balance = new Map<string, number>();
  const add = (member: string, paise: number) => balance.set(member, (balance.get(member) ?? 0) + paise);
  for (const e of expenses) {
    if (e.deleted_at) continue;
    const amount = toPaise(e.amount);
    const split = splitExpense(amount, e.split_rule, e.shares);
    if (!split) continue;
    add(e.paid_by, amount);
    for (const [member, share] of split.shares) add(member, -share);
  }
  for (const s of settlements) {
    if (s.deleted_at) continue;
    const amount = toPaise(s.amount);
    add(s.from_member, amount);
    add(s.to_member, -amount);
  }
  return balance;
}

export interface Payment {
  from: string;
  to: string;
  /** Paise. */
  amount: number;
}

/**
 * The fewest payments that settle everyone up (greedy; the true minimum is
 * NP-hard). At most (people with a balance - 1) payments, the same list on
 * every phone whatever order the balances arrive in.
 *
 * 1. A debtor and a creditor for exactly the same amount are paired first.
 * 2. Then the biggest debtor pays the biggest creditor `min(debt, credit)`,
 *    until nobody is left. Ties go to the smaller member id.
 */
export function suggestPayments(balances: ReadonlyMap<string, number>): Payment[] {
  const debtors = [...balances].filter(([, v]) => v < 0).map(([member, v]) => ({ member, left: -v }));
  const creditors = [...balances].filter(([, v]) => v > 0).map(([member, v]) => ({ member, left: v }));
  const biggest = (a: { member: string; left: number }, b: { member: string; left: number }) => b.left - a.left || byId(a.member, b.member);
  debtors.sort(biggest);
  creditors.sort(biggest);
  const payments: Payment[] = [];

  for (const d of debtors) {
    const match = creditors.filter((c) => c.left === d.left).sort((a, b) => byId(a.member, b.member))[0];
    if (!match || d.left === 0) continue;
    payments.push({ from: d.member, to: match.member, amount: d.left });
    match.left = 0;
    d.left = 0;
  }
  for (;;) {
    const d = debtors.filter((x) => x.left > 0).sort(biggest)[0];
    const c = creditors.filter((x) => x.left > 0).sort(biggest)[0];
    if (!d || !c) break;
    const pay = Math.min(d.left, c.left);
    payments.push({ from: d.member, to: c.member, amount: pay });
    d.left -= pay;
    c.left -= pay;
  }
  return payments.sort((a, b) => byId(a.from, b.from) || byId(a.to, b.to));
}

/* ------------------------------------------------------------------------ */
/* The form: turning what was typed into a split the database accepts        */
/* ------------------------------------------------------------------------ */

export interface SplitDraft {
  rule: SplitRule;
  /** Who takes part. */
  members: readonly string[];
  /** `shares`: a weight per member (default 1). `exact`: the part per member, in rupees. */
  values: Readonly<Record<string, number>>;
}

export type SplitCheck =
  | { ok: true; rule: SplitRule; shares: ShareEntry[]; preview: Map<string, number> }
  | { ok: false; reason: string };

/** Max weight the database accepts, and two decimals of weight (docs/GROUPS.md). */
export const MAX_WEIGHT = 1000;

/**
 * Check a typed split against the amount. `reason` is the sentence the form
 * shows: "₹40.00 left to assign", never a bare "invalid".
 */
export function checkSplit(draft: SplitDraft, amountPaise: number, money: (paise: number) => string): SplitCheck {
  if (draft.members.length === 0) return { ok: false, reason: 'Choose who is in this split.' };
  if (draft.rule === 'equal') {
    const shares = draft.members.map((member) => ({ member, value: 1 }));
    return { ok: true, rule: 'equal', shares, preview: splitExpense(amountPaise, 'equal', shares)!.shares };
  }
  if (draft.rule === 'shares') {
    const shares = draft.members.map((member) => ({ member, value: Math.round((draft.values[member] ?? 1) * 100) / 100 }));
    if (shares.some((s) => !(s.value > 0) || s.value > MAX_WEIGHT)) return { ok: false, reason: `Each share must be more than 0 and at most ${MAX_WEIGHT}.` };
    const split = splitExpense(amountPaise, 'shares', shares);
    return split ? { ok: true, rule: 'shares', shares, preview: split.shares } : { ok: false, reason: 'Those shares can’t be split.' };
  }
  const shares = draft.members.map((member) => ({ member, value: Math.round((draft.values[member] ?? 0) * 100) / 100 }));
  if (shares.some((s) => s.value < 0)) return { ok: false, reason: 'An amount can’t be negative.' };
  const sum = shares.reduce((total, s) => total + toPaise(s.value), 0);
  if (sum !== amountPaise) {
    const diff = amountPaise - sum;
    return { ok: false, reason: diff > 0 ? `${money(diff)} left to assign.` : `${money(-diff)} too much: the parts must add up to the total.` };
  }
  return { ok: true, rule: 'exact', shares, preview: new Map(shares.map((s) => [s.member, toPaise(s.value)])) };
}

/* ------------------------------------------------------------------------ */
/* Reminder through WhatsApp                                                 */
/* ------------------------------------------------------------------------ */

/**
 * A reminder the user sends THEMSELVES: opening this link shows WhatsApp's
 * chooser with the message filled in. FinatriX sends nothing and moves no
 * money. The text holds only names, an amount and the group's name, all of
 * which the group already shows.
 */
export function reminderText(opts: { toName: string; amount: string; groupName: string }): string {
  return `Hi ${opts.toName}, a reminder from our ${opts.groupName} group on FinatriX: you owe me ${opts.amount}. Thank you!`;
}

export function whatsappLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}
