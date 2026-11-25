import { parseShares, type ShareEntry, type SplitDraft, type SplitRule } from './groupSplit';

/** Someone who can pay or share in a group expense (a current member). */
export interface SplitPerson { id: string; name: string }

/** What the Paid by / Split fields hold while the form is open. */
export interface SplitState {
  paidBy: string;
  rule: SplitRule;
  /** Who is in the split. */
  included: string[];
  /** `shares`: what was typed per person ("2", "1.5"); a missing entry is 1. */
  weights: Record<string, string>;
  /** `exact`: each person's part, in rupees. */
  exact: Record<string, number>;
}

/**
 * The starting point: you paid, split equally between everyone. Or, when
 * editing, what the row already says.
 */
export function initialSplit(
  people: readonly SplitPerson[],
  meId: string,
  from?: { paid_by: string; split_rule: string | null; shares: unknown },
): SplitState {
  const state: SplitState = { paidBy: meId, rule: 'equal', included: people.map((p) => p.id), weights: {}, exact: {} };
  if (!from) return state;
  state.paidBy = from.paid_by;
  const list = parseShares(from.shares);
  if (!list || (from.split_rule !== 'equal' && from.split_rule !== 'shares' && from.split_rule !== 'exact')) return state;
  state.rule = from.split_rule;
  state.included = list.map((s: ShareEntry) => s.member);
  for (const s of list) {
    if (from.split_rule === 'shares') state.weights[s.member] = String(s.value);
    if (from.split_rule === 'exact') state.exact[s.member] = s.value;
  }
  return state;
}

/** The typed state as numbers, for `checkSplit`. A blank or unreadable weight counts as 1. */
export function splitDraftOf(state: SplitState): SplitDraft {
  const values: Record<string, number> = {};
  for (const id of state.included) {
    if (state.rule === 'shares') {
      const n = Number(String(state.weights[id] ?? '').trim().replace(',', '.'));
      values[id] = state.weights[id] === undefined || state.weights[id].trim() === '' ? 1 : n;
    } else if (state.rule === 'exact') {
      values[id] = state.exact[id] ?? 0;
    }
  }
  return { rule: state.rule, members: state.included, values };
}
