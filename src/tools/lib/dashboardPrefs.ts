/**
 * Dashboard personalisation preferences. Persists only the user's layout choice
 * (order + hidden set) for the optional dashboard modules — never any financial
 * data. Forward-compatible: unknown/new sections are appended with defaults, so
 * adding a module later never breaks a saved layout. Stored at `fx_dash_layout`.
 */
import { getJSON, setJSON } from './storage';

export const DASH_SECTIONS = [
  { id: 'recommended', label: 'Recommended & activity' },
  { id: 'milestones', label: 'Milestones' },
  { id: 'insights', label: 'Personalised insights' },
  { id: 'upcoming', label: 'Upcoming events' },
] as const;

export type DashSectionId = (typeof DASH_SECTIONS)[number]['id'];

const ALL_IDS = DASH_SECTIONS.map((s) => s.id) as DashSectionId[];
const KEY = 'fx_dash_layout';

export interface DashPrefs {
  order: DashSectionId[];
  hidden: DashSectionId[];
}

function isId(x: unknown): x is DashSectionId {
  return typeof x === 'string' && (ALL_IDS as string[]).includes(x);
}

/** Read prefs, reconciled against the canonical section list. */
export function getDashPrefs(): DashPrefs {
  const raw = getJSON<Partial<DashPrefs>>(KEY, {});
  const savedOrder = Array.isArray(raw.order) ? raw.order.filter(isId) : [];
  // Keep saved order, then append any sections not yet present (new modules).
  const order = [...savedOrder, ...ALL_IDS.filter((id) => !savedOrder.includes(id))];
  const hidden = Array.isArray(raw.hidden) ? raw.hidden.filter(isId) : [];
  return { order, hidden };
}

export function saveDashPrefs(prefs: DashPrefs): void {
  setJSON(KEY, { order: prefs.order, hidden: prefs.hidden });
}

export function isHidden(id: DashSectionId): boolean {
  return getDashPrefs().hidden.includes(id);
}

/** Show/hide a section; returns the updated prefs. */
export function toggleSection(id: DashSectionId): DashPrefs {
  const p = getDashPrefs();
  const hidden = p.hidden.includes(id) ? p.hidden.filter((x) => x !== id) : [...p.hidden, id];
  const next = { ...p, hidden };
  saveDashPrefs(next);
  return next;
}

/** Move a section up (-1) or down (+1) in the order; returns updated prefs. */
export function moveSection(id: DashSectionId, dir: -1 | 1): DashPrefs {
  const p = getDashPrefs();
  const i = p.order.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= p.order.length) return p;
  const order = [...p.order];
  [order[i], order[j]] = [order[j], order[i]];
  const next = { ...p, order };
  saveDashPrefs(next);
  return next;
}

/** Restore the default layout (all visible, canonical order). */
export function resetDashPrefs(): DashPrefs {
  const next: DashPrefs = { order: [...ALL_IDS], hidden: [] };
  saveDashPrefs(next);
  return next;
}
