/**
 * Which optional panels a tool shows.
 *
 * The Expense Tracker's Overview grew into a very long page: pacing,
 * commitments, warnings, streaks, insights, the section split, the trend chart,
 * the add form, category budgets, top categories and the transaction list. Every
 * one of those earns its place for somebody, and none of them for everybody —
 * a person who opens the tracker forty times a month to log a coffee is
 * scrolling past four analytical panels to reach a form.
 *
 * So the analytical panels are switchable, and the switch is remembered.
 *
 * Deliberately NOT a synced key. This is a display preference about one screen
 * on one device — the same class as the category sort beside it — and syncing it
 * would mean turning a panel off on a phone quietly turned it off on the desktop
 * where there is room for it.
 */
import { getJSON, setJSON } from './storage';

export const PANEL_PREFS_KEY = 'fx_exp_panels';

/** Every panel the user can switch off, with its default. */
export interface PanelPrefs {
  /** "Spending insights" — the derived observations card. */
  insights: boolean;
  /** "Monthly trend" — the six-month stacked chart. */
  trend: boolean;
  /** The month score card. */
  score: boolean;
  /** Opening/closing bank balance and its reconciliation. */
  bank: boolean;
}

export const DEFAULT_PANELS: PanelPrefs = {
  insights: true,
  trend: true,
  score: true,
  // Off by default: it is the one panel that asks the user for something rather
  // than telling them something, and a pair of empty fields at the top of a
  // tracker reads as work to do. Discoverable from the same switch row as the
  // rest, so turning it on is one tap.
  bank: false,
};

export type PanelKey = keyof PanelPrefs;

/** Label shown on each switch. Order here is the order they render in. */
export const PANEL_LABELS: ReadonlyArray<{ key: PanelKey; label: string; hint: string }> = [
  { key: 'score', label: 'Month score', hint: 'How closely this month followed the plan' },
  { key: 'insights', label: 'Spending insights', hint: 'Observations derived from this month' },
  { key: 'trend', label: 'Monthly trend', hint: 'Six months of spending, split by section' },
  { key: 'bank', label: 'Bank balance', hint: 'Opening and closing balance, reconciled' },
];

export function loadPanelPrefs(): PanelPrefs {
  const raw = getJSON<Partial<PanelPrefs>>(PANEL_PREFS_KEY, {});
  return {
    insights: typeof raw.insights === 'boolean' ? raw.insights : DEFAULT_PANELS.insights,
    trend: typeof raw.trend === 'boolean' ? raw.trend : DEFAULT_PANELS.trend,
    score: typeof raw.score === 'boolean' ? raw.score : DEFAULT_PANELS.score,
    bank: typeof raw.bank === 'boolean' ? raw.bank : DEFAULT_PANELS.bank,
  };
}

export function savePanelPrefs(p: PanelPrefs): void {
  setJSON(PANEL_PREFS_KEY, p);
}

export function togglePanel(p: PanelPrefs, key: PanelKey): PanelPrefs {
  return { ...p, [key]: !p[key] };
}
