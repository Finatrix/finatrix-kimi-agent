/**
 * Per-month category arrangement — the layer that makes a category a decision
 * about **one month**, not a decision about the whole account.
 *
 * WHY
 * ---
 * A budget is a plan for a month. "I am not commuting in December" is a fact
 * about December, and until now deleting Transport to say so deleted it from
 * March as well — rewriting a plan the user had already executed, and orphaning
 * every transaction filed against it. The same in reverse: adding "Wedding" to
 * plan for June put an empty row on every past month's report.
 *
 * THE RULE, IN ONE LINE
 * ---------------------
 * A month uses its own arrangement if it has one; otherwise it inherits the
 * most recent earlier month that does; otherwise the account-wide template.
 *
 * That is the same carry-forward rule the Net Worth tracker already uses for
 * balances, and it is the only one that gets all three cases right at once:
 *
 *   • Past months are frozen. Editing October cannot reach back into September,
 *     because September either has its own entry or inherits from something
 *     older than October.
 *   • New months are not empty. Opening December after editing October inherits
 *     October's arrangement, which is what someone who reorganised their budget
 *     in October actually expects to see.
 *   • Nothing existing moves. Every account that has never edited a month keeps
 *     resolving to the account-wide template — byte-identical to the behaviour
 *     before this file existed.
 *
 * A month materialises its own entry the moment it is edited, and never before,
 * so the store stays small and "which months did I actually customise" stays
 * answerable.
 *
 * Pure apart from the load/save pair; every resolver takes the store explicitly
 * so the whole thing is testable without touching storage.
 */
import { getJSON, setJSON } from './storage';
import {
  loadCustomCats, mergedCats, saveCustomCats,
  type CustomCats, type SectionedCats,
} from './budget';
import {
  applyCatPrefs, emptyCatPrefs, loadCatPrefs, saveCatPrefs,
  type CatPrefs, type CatView,
} from './budgetCats';
import { currentMonth } from './month';

/** Storage key for the per-month overrides. Synced, like every plan key. */
export const MONTH_CATS_KEY = 'fx_bb_cats_by_month';

/** One month's own arrangement. Both halves are always written together. */
export interface MonthCatEntry {
  cats: CustomCats;
  prefs: CatPrefs;
}

/** `{ "2026-03": { cats, prefs } }` — only months the user actually edited. */
export type MonthCatStore = Record<string, MonthCatEntry>;

const EMPTY_CUSTOM: CustomCats = { needs: [], wants: [], save: [] };

/* ══════════════════════════════════════════════════════════════════════════
   Coercion. Storage is a text file the user can edit and a cloud row an older
   build may have written, so nothing here trusts its input.
   ══════════════════════════════════════════════════════════════════════════ */

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function coerceCustom(raw: unknown): CustomCats {
  const r = (raw ?? {}) as Partial<CustomCats>;
  const section = (list: unknown): CustomCats['needs'] =>
    (Array.isArray(list) ? list : [])
      .filter((c): c is { k: string } => !!c && typeof (c as { k?: unknown }).k === 'string')
      .map((c) => {
        const cat = c as CustomCats['needs'][number];
        return { k: cat.k, ic: cat.ic ?? 'other', l: String(cat.l ?? ''), custom: true as const };
      });
  return { needs: section(r.needs), wants: section(r.wants), save: section(r.save) };
}

function coercePrefs(raw: unknown): CatPrefs {
  const r = (raw ?? {}) as Partial<CatPrefs>;
  const order = (r.order ?? {}) as Partial<CatPrefs['order']>;
  return {
    order: {
      needs: strList(order.needs),
      wants: strList(order.wants),
      save: strList(order.save),
    },
    hidden: strList(r.hidden),
    archived: strList(r.archived),
  };
}

/* ══════════════════════════════════════════════════════════════════════════
   Storage boundary
   ══════════════════════════════════════════════════════════════════════════ */

export function loadMonthCatStore(): MonthCatStore {
  const raw = getJSON<Record<string, unknown>>(MONTH_CATS_KEY, {});
  const out: MonthCatStore = {};
  for (const [month, entry] of Object.entries(raw ?? {})) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !entry || typeof entry !== 'object') continue;
    const e = entry as Partial<MonthCatEntry>;
    out[month] = { cats: coerceCustom(e.cats), prefs: coercePrefs(e.prefs) };
  }
  return out;
}

export function saveMonthCatStore(store: MonthCatStore): void {
  setJSON(MONTH_CATS_KEY, store);
}

/**
 * The account-wide template: the arrangement a month inherits when no earlier
 * month has one of its own.
 *
 * This is the pair of keys that existed before per-month arrangements, read
 * unchanged — which is what makes the whole feature invisible to an account
 * that never edits a month.
 */
export function loadTemplate(): MonthCatEntry {
  return { cats: loadCustomCats(), prefs: loadCatPrefs() };
}

export function saveTemplate(entry: MonthCatEntry): void {
  saveCustomCats(entry.cats);
  saveCatPrefs(entry.prefs);
}

/* ══════════════════════════════════════════════════════════════════════════
   Resolution — the rule at the top of this file, written once.
   ══════════════════════════════════════════════════════════════════════════ */

/**
 * The month whose arrangement `month` actually uses: itself if it has an entry,
 * otherwise the latest earlier month that does, otherwise null (the template).
 */
export function sourceMonthFor(store: MonthCatStore, month: string): string | null {
  if (store[month]) return month;
  let best: string | null = null;
  for (const key of Object.keys(store)) {
    if (key < month && (best === null || key > best)) best = key;
  }
  return best;
}

/** The arrangement `month` resolves to. Never mutates the store. */
export function resolveMonthEntry(
  store: MonthCatStore,
  template: MonthCatEntry,
  month: string,
): MonthCatEntry {
  const source = sourceMonthFor(store, month);
  return source ? store[source] : template;
}

/** True when this month carries its own arrangement rather than inheriting one. */
export function isMonthCustomised(store: MonthCatStore, month: string): boolean {
  return Object.prototype.hasOwnProperty.call(store, month);
}

/**
 * Deep-copy an arrangement. Materialising a month must not alias the entry it
 * inherited from, or editing December would mutate October in place — the exact
 * bug this module exists to prevent.
 */
export function cloneEntry(e: MonthCatEntry): MonthCatEntry {
  return {
    cats: {
      needs: e.cats.needs.map((c) => ({ ...c })),
      wants: e.cats.wants.map((c) => ({ ...c })),
      save: e.cats.save.map((c) => ({ ...c })),
    },
    prefs: {
      order: {
        needs: [...e.prefs.order.needs],
        wants: [...e.prefs.order.wants],
        save: [...e.prefs.order.save],
      },
      hidden: [...e.prefs.hidden],
      archived: [...e.prefs.archived],
    },
  };
}

/**
 * Write one month's arrangement, materialising its entry from whatever it was
 * inheriting. Returns the new store; the caller persists it.
 *
 * Editing the month that a brand-new account is looking at also updates the
 * template, so an account that has never navigated away from "this month" keeps
 * behaving exactly as it did before per-month arrangements existed — one list of
 * categories, edited in one place. The moment a *second* month is customised the
 * template stops being written, because from then on the months disagree and
 * silently overwriting the template would leak one month's decision into every
 * month that inherits it.
 */
export function withMonthEntry(
  store: MonthCatStore,
  month: string,
  next: MonthCatEntry,
): MonthCatStore {
  return { ...store, [month]: cloneEntry(next) };
}

/** Drop a month's own arrangement, returning it to inheritance. */
export function withoutMonthEntry(store: MonthCatStore, month: string): MonthCatStore {
  if (!store[month]) return store;
  const next = { ...store };
  delete next[month];
  return next;
}

/* ══════════════════════════════════════════════════════════════════════════
   The view every consumer actually wants
   ══════════════════════════════════════════════════════════════════════════ */

/** Built-in + that month's custom categories, before hide/archive is applied. */
export function monthCats(entry: MonthCatEntry): SectionedCats {
  return mergedCats(entry.cats);
}

/**
 * The categories as this user arranged them **for this month** — ordered, with
 * hidden and archived split out. The month-aware sibling of `loadCatView`.
 */
export function loadCatViewFor(month: string): CatView {
  const entry = resolveMonthEntry(loadMonthCatStore(), loadTemplate(), month);
  return applyCatPrefs(monthCats(entry), entry.prefs);
}

/**
 * The arrangement for `month`, ready to hand to Budget Builder's editor.
 * Returns the resolved entry plus whether it is the month's own or inherited,
 * so the UI can say which — a category list that silently belongs to a
 * different month is exactly the confusion this feature is meant to remove.
 */
export interface MonthArrangement extends MonthCatEntry {
  month: string;
  /** The month this arrangement was read from; null when it came from the template. */
  inheritedFrom: string | null;
}

export function loadArrangement(month: string): MonthArrangement {
  const store = loadMonthCatStore();
  const source = sourceMonthFor(store, month);
  const entry = source ? store[source] : loadTemplate();
  return {
    ...cloneEntry(entry),
    month,
    inheritedFrom: source === month ? null : source,
  };
}

/**
 * Persist an arrangement for one month.
 *
 * See `withMonthEntry` for why the template is only kept in step while the
 * current month is the only month that has ever been customised.
 */
export function saveArrangement(month: string, entry: MonthCatEntry): void {
  const store = loadMonthCatStore();
  const next = withMonthEntry(store, month, entry);
  saveMonthCatStore(next);
  const customised = Object.keys(next);
  if (customised.length === 1 && customised[0] === month && month === currentMonth()) {
    saveTemplate(entry);
  }
}

/** An arrangement with nothing added and nothing hidden — the factory default. */
export function emptyArrangement(): MonthCatEntry {
  return { cats: { ...EMPTY_CUSTOM, needs: [], wants: [], save: [] }, prefs: emptyCatPrefs() };
}
