/**
 * Lightweight, honest activity tracking for the dashboard's "Recent activity".
 *
 * It piggybacks on the existing fx:write event (dispatched by every tool save)
 * and records a real timestamp per tool. No polling, no fabrication — if a tool
 * was never saved, it simply never appears. Initialised once app-wide from
 * main.tsx so writes from onboarding AND the tools are all captured.
 */
import { getJSON, setJSON, onLocalWrite } from './storage';

export interface ActivityEntry {
  key: string;
  ts: number;
}

const STORE_KEY = 'fx_activity';
const TRACKED: Record<string, true> = {
  fx_bb_data: true, fx_bb_cats: true, fx_bb_catprefs: true, fx_bb_income: true,
  fx_bb_cats_by_month: true,
  fx_expenses: true, fx_goals: true,
  fx_investmatch: true, fx_parksmart: true, fx_peercompare: true, fx_lifemap: true,
};
// Custom categories, their arrangement and income sources all roll up to Budget.
const NORMALIZE: Record<string, string> = {
  fx_bb_cats: 'fx_bb_data', fx_bb_catprefs: 'fx_bb_data', fx_bb_income: 'fx_bb_data',
  fx_bb_cats_by_month: 'fx_bb_data',
};

let started = false;

/** Subscribe once, for the app's lifetime, to same-document tool writes. */
export function initActivityTracking(): void {
  if (started) return;
  started = true;
  onLocalWrite((key) => {
    if (!TRACKED[key]) return; // ignores fx_activity itself → no loop
    const norm = NORMALIZE[key] ?? key;
    try {
      const list = getJSON<ActivityEntry[]>(STORE_KEY, []).filter((e) => e && e.key !== norm);
      list.unshift({ key: norm, ts: Date.now() });
      setJSON(STORE_KEY, list.slice(0, 8));
    } catch {
      /* storage blocked — activity is a nicety, never critical */
    }
  });
}

export function readActivity(): ActivityEntry[] {
  return getJSON<ActivityEntry[]>(STORE_KEY, [])
    .filter((e) => e && typeof e.key === 'string' && typeof e.ts === 'number')
    .slice(0, 6);
}
