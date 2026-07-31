/**
 * Category & income-source organisation for Budget Builder.
 *
 * The built-in category tables in `budget.ts` are parity-pinned — their keys,
 * labels and order are a contract. Everything a user can do to *organise* those
 * categories (reorder, hide, archive) therefore lives here as a preference
 * layer applied on top, so personalisation never rewrites the canonical set and
 * a restore always brings a category back exactly as it was.
 *
 * Income is modelled the same way: a list of sources the user owns (seeded with
 * the common ones), with per-month amounts stored alongside the budget so
 * history stays intact.
 *
 * Everything here is pure except the two localStorage load/save pairs, and the
 * stored shapes are additive — older saved data loads unchanged.
 */
import { getJSON, setJSON } from './storage';
import type { IconName } from '../ui/Icon';
import { loadCustomCats, mergedCats, type BudgetCat, type CatKey, type SectionedCats } from './budget';

export const CAT_PREFS_KEY = 'fx_bb_catprefs';
export const INCOME_KEY = 'fx_bb_income';

const SECTIONS: CatKey[] = ['needs', 'wants', 'save'];

/* ══════════════════════════════════════════════════════════════════════════
   Category preferences — order / hidden / archived
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * `order` holds an explicit key order per section. Keys the user has never
 * moved are absent and simply keep their natural position, so adding a built-in
 * category in a future release slots it in rather than dumping it at the end.
 *
 * `hidden`  — tucked out of the main list to cut clutter; still budgeted and
 *             still counted in every total.
 * `archived`— retired: removed from the budget list, the expense picker and all
 *             totals. The stored amounts are untouched, so restoring is lossless.
 */
export interface CatPrefs {
  order: Record<CatKey, string[]>;
  hidden: string[];
  archived: string[];
}

export const emptyCatPrefs = (): CatPrefs => ({
  order: { needs: [], wants: [], save: [] },
  hidden: [],
  archived: [],
});

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function loadCatPrefs(): CatPrefs {
  const raw = getJSON<Partial<CatPrefs>>(CAT_PREFS_KEY, {});
  const order = (raw.order ?? {}) as Partial<Record<CatKey, string[]>>;
  return {
    order: {
      needs: strList(order.needs),
      wants: strList(order.wants),
      save: strList(order.save),
    },
    hidden: strList(raw.hidden),
    archived: strList(raw.archived),
  };
}

export function saveCatPrefs(p: CatPrefs): void {
  setJSON(CAT_PREFS_KEY, p);
}

/**
 * Apply an explicit key order to a section. Ordered keys lead (in the stored
 * sequence); anything the order doesn't mention keeps its natural position
 * after them. Unknown keys in `order` are ignored, so deleting a custom
 * category never leaves a hole.
 */
export function orderSection<T extends { k: string }>(items: T[], order: string[]): T[] {
  if (order.length === 0) return items;
  const byKey = new Map(items.map((c) => [c.k, c]));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const k of order) {
    const c = byKey.get(k);
    if (c && !seen.has(k)) { out.push(c); seen.add(k); }
  }
  for (const c of items) if (!seen.has(c.k)) out.push(c);
  return out;
}

export type SectionedCat = BudgetCat & { section: CatKey };

export interface CatView {
  /** Ordered, non-hidden, non-archived categories — the working list. */
  visible: SectionedCats;
  /** Ordered categories the user tucked away (still budgeted and counted). */
  hidden: SectionedCat[];
  /** Retired categories — excluded from every total until restored. */
  archived: SectionedCat[];
  /** visible + hidden, i.e. everything that still counts toward a total. */
  active: SectionedCats;
}

/**
 * Split the merged category set into the four views the UI needs. Ordering is
 * applied once here so every consumer (Budget list, Expense picker, exports)
 * sees the user's arrangement in the same sequence.
 */
export function applyCatPrefs(cats: SectionedCats, prefs: CatPrefs): CatView {
  const hiddenSet = new Set(prefs.hidden);
  const archivedSet = new Set(prefs.archived);
  const visible = { needs: [], wants: [], save: [] } as SectionedCats;
  const active = { needs: [], wants: [], save: [] } as SectionedCats;
  const hidden: SectionedCat[] = [];
  const archived: SectionedCat[] = [];

  for (const section of SECTIONS) {
    const ordered = orderSection(cats[section], prefs.order[section] ?? []);
    for (const c of ordered) {
      if (archivedSet.has(c.k)) { archived.push({ ...c, section }); continue; }
      active[section].push(c);
      if (hiddenSet.has(c.k)) hidden.push({ ...c, section });
      else visible[section].push(c);
    }
  }
  return { visible, hidden, archived, active };
}

/**
 * The user's whole category arrangement in one call — built-ins plus their own
 * categories, ordered, with hidden and archived split out. Every consumer that
 * needs "the categories as this user arranged them" goes through here, so the
 * builder, the expense picker, the dashboard and the exports can never disagree
 * about which categories are live.
 */
export function loadCatView(): CatView {
  return applyCatPrefs(mergedCats(loadCustomCats()), loadCatPrefs());
}

/** Toggle a key in a preference list (used for hide / archive). */
export function toggleKey(list: string[], k: string): string[] {
  return list.includes(k) ? list.filter((x) => x !== k) : [...list, k];
}

/**
 * Move a category within its section. `keys` is the section's current visible
 * order; the result is a full explicit order for that section, so subsequent
 * moves are stable regardless of where the category started.
 */
export function reorderKeys(keys: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || from >= keys.length) return keys;
  const clamped = Math.max(0, Math.min(keys.length - 1, to));
  const next = [...keys];
  const [moved] = next.splice(from, 1);
  next.splice(clamped, 0, moved);
  return next;
}

/**
 * Persist a new order for one section. The stored order is the *full* section
 * sequence (visible + hidden, in their current relative order) so hiding a
 * category and revealing it later doesn't scramble the list.
 */
export function withSectionOrder(prefs: CatPrefs, section: CatKey, keys: string[]): CatPrefs {
  return { ...prefs, order: { ...prefs.order, [section]: keys } };
}

/**
 * Move one item of a *subset* of a list, leaving every other item where it is.
 *
 * The organise UI only shows non-archived rows, so a drag from row 2 to row 0
 * is a move within that subset — but the stored order covers the whole section.
 * Reordering only the visible entries and writing them back into their original
 * slots keeps archived items pinned, so restoring one puts it back exactly
 * where the user left it.
 */
export function reorderSubset(full: string[], include: (k: string) => boolean, from: number, to: number): string[] {
  const slots: number[] = [];
  full.forEach((k, i) => { if (include(k)) slots.push(i); });
  const live = slots.map((i) => full[i]);
  const moved = reorderKeys(live, from, to);
  if (moved === live) return full;
  const out = [...full];
  slots.forEach((slot, j) => { out[slot] = moved[j]; });
  return out;
}

/** Drop a key from every preference list — used when a custom category is deleted. */
export function forgetKey(prefs: CatPrefs, k: string): CatPrefs {
  return {
    order: {
      needs: prefs.order.needs.filter((x) => x !== k),
      wants: prefs.order.wants.filter((x) => x !== k),
      save: prefs.order.save.filter((x) => x !== k),
    },
    hidden: prefs.hidden.filter((x) => x !== k),
    archived: prefs.archived.filter((x) => x !== k),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Income sources
   ══════════════════════════════════════════════════════════════════════════ */

export interface IncomeSource {
  k: string;
  l: string;
  ic: IconName;
  /** true for user-created sources (deletable; built-ins are archived instead). */
  custom?: boolean;
}

/**
 * The income sources a household actually has. Seeded once, then fully owned by
 * the user — rename, reorder, hide, archive, or add as many as they like.
 */
export const DEFAULT_INCOME_SOURCES: IncomeSource[] = [
  { k: 'salary', l: 'Salary', ic: 'briefcase' },
  { k: 'interest', l: 'Interest', ic: 'bank' },
  { k: 'dividend', l: 'Dividend', ic: 'trending' },
  { k: 'rental', l: 'Rental Income', ic: 'home' },
  { k: 'business', l: 'Business Income', ic: 'layers' },
  { k: 'asset_sale', l: 'Sale of Asset', ic: 'dollar' },
  { k: 'benefits', l: 'Government Benefits', ic: 'shield' },
  { k: 'other_income', l: 'Other', ic: 'other' },
];

/** The key legacy single-field income is migrated onto. */
export const LEGACY_INCOME_KEY = 'salary';

export interface IncomeConfig {
  sources: IncomeSource[];
  hidden: string[];
  archived: string[];
}

export const defaultIncomeConfig = (): IncomeConfig => ({
  sources: DEFAULT_INCOME_SOURCES.map((s) => ({ ...s })),
  hidden: [],
  archived: [],
});

export function newIncomeKey(): string {
  return 'i_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * Load the user's sources, seeding the defaults on first run. Built-in sources
 * that a future release adds are appended (unless the user archived them), so
 * the list grows without ever reordering what the user arranged.
 */
export function loadIncome(): IncomeConfig {
  const raw = getJSON<Partial<IncomeConfig> | null>(INCOME_KEY, null);
  if (!raw || !Array.isArray(raw.sources) || raw.sources.length === 0) return defaultIncomeConfig();
  const sources: IncomeSource[] = raw.sources
    .filter((s): s is IncomeSource => !!s && typeof s.k === 'string')
    .map((s) => ({ k: s.k, l: String(s.l ?? ''), ic: (s.ic ?? 'other') as IconName, ...(s.custom ? { custom: true } : {}) }));
  const known = new Set(sources.map((s) => s.k));
  const archived = strList(raw.archived);
  for (const d of DEFAULT_INCOME_SOURCES) {
    if (!known.has(d.k) && !archived.includes(d.k)) sources.push({ ...d });
  }
  return { sources, hidden: strList(raw.hidden), archived };
}

export function saveIncome(cfg: IncomeConfig): void {
  setJSON(INCOME_KEY, cfg);
}

export interface IncomeView {
  visible: IncomeSource[];
  hidden: IncomeSource[];
  archived: IncomeSource[];
  /**
   * Everything that still counts toward total income (visible + hidden), in the
   * user's own order. It must stay a filtered view of `sources` rather than
   * `[...visible, ...hidden]`: the organise UI renders this list and reorders by
   * index, so concatenating the two groups would silently move a hidden source
   * to the end and make every drag land on the wrong row.
   */
  active: IncomeSource[];
}

export function applyIncomeConfig(cfg: IncomeConfig): IncomeView {
  const hiddenSet = new Set(cfg.hidden);
  const archivedSet = new Set(cfg.archived);
  const visible: IncomeSource[] = [];
  const hidden: IncomeSource[] = [];
  const archived: IncomeSource[] = [];
  const active: IncomeSource[] = [];
  for (const s of cfg.sources) {
    if (archivedSet.has(s.k)) { archived.push(s); continue; }
    active.push(s);
    if (hiddenSet.has(s.k)) hidden.push(s);
    else visible.push(s);
  }
  return { visible, hidden, archived, active };
}

/**
 * Total income from the per-source amounts. Archived sources are excluded — the
 * same rule archived expense categories follow — so one concept of "retired"
 * applies across the whole builder.
 */
export function totalIncome(amounts: Record<string, number>, active: IncomeSource[]): number {
  return active.reduce((s, src) => {
    const v = Number(amounts[src.k]);
    return s + (Number.isFinite(v) && v > 0 ? v : 0);
  }, 0);
}

/**
 * Migrate a month that predates multi-source income: the old single field
 * becomes the Salary line, so no one loses a number and totals are unchanged.
 */
export function seedIncomeAmounts(
  stored: Record<string, number> | undefined,
  legacyIncome: string | number | undefined,
): Record<string, number> {
  if (stored && Object.keys(stored).length > 0) {
    const out: Record<string, number> = {};
    Object.keys(stored).forEach((k) => {
      const v = Number(stored[k]);
      out[k] = Number.isFinite(v) && v > 0 ? v : 0;
    });
    return out;
  }
  const legacy = Number(legacyIncome);
  return Number.isFinite(legacy) && legacy > 0 ? { [LEGACY_INCOME_KEY]: legacy } : {};
}
