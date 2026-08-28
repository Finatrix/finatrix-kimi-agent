import { describe, it, expect, beforeEach } from 'vitest';
import {
  cloneEntry, isMonthCustomised, loadArrangement, loadCatViewFor, loadMonthCatStore,
  resolveMonthEntry, saveArrangement, saveMonthCatStore, sourceMonthFor,
  withoutMonthEntry, type MonthCatEntry, type MonthCatStore,
} from '../tools/lib/budgetCatsMonth';
import { emptyCatPrefs } from '../tools/lib/budgetCats';
import { currentMonth } from '../tools/lib/month';

/**
 * A category is a decision about ONE MONTH.
 *
 * Removing Transport to plan a month you are not commuting used to remove it
 * from every month you had already budgeted — rewriting a plan the user had
 * executed and orphaning its transactions. The rule that fixes it is one line:
 * a month uses its own arrangement if it has one, otherwise the most recent
 * earlier month that does, otherwise the account-wide template.
 *
 * Everything below is that rule, and the three cases it has to get right at
 * once: past months frozen, new months not empty, existing accounts unmoved.
 */

const entry = (labels: string[], archived: string[] = []): MonthCatEntry => ({
  cats: {
    needs: labels.map((l, i) => ({ k: `c_${l}${i}`, ic: 'other' as const, l, custom: true as const })),
    wants: [],
    save: [],
  },
  prefs: { ...emptyCatPrefs(), archived },
});

const TEMPLATE = entry(['Template']);

beforeEach(() => localStorage.clear());

describe('the resolution rule', () => {
  it('uses a month’s own arrangement when it has one', () => {
    const store: MonthCatStore = { '2026-05': entry(['May']) };
    expect(sourceMonthFor(store, '2026-05')).toBe('2026-05');
    expect(resolveMonthEntry(store, TEMPLATE, '2026-05').cats.needs[0].l).toBe('May');
  });

  it('inherits from the most recent EARLIER month, never a later one', () => {
    const store: MonthCatStore = { '2026-03': entry(['March']), '2026-08': entry(['August']) };
    // June looks back to March, not forward to August.
    expect(sourceMonthFor(store, '2026-06')).toBe('2026-03');
    expect(resolveMonthEntry(store, TEMPLATE, '2026-06').cats.needs[0].l).toBe('March');
  });

  it('falls back to the account-wide template when nothing earlier exists', () => {
    const store: MonthCatStore = { '2026-08': entry(['August']) };
    expect(sourceMonthFor(store, '2026-06')).toBeNull();
    expect(resolveMonthEntry(store, TEMPLATE, '2026-06').cats.needs[0].l).toBe('Template');
  });
});

describe('past months are frozen', () => {
  it('editing a later month cannot reach back into an earlier one', () => {
    saveArrangement('2026-05', entry(['May budget']));
    saveArrangement('2026-09', entry(['September budget']));

    const store = loadMonthCatStore();
    expect(resolveMonthEntry(store, TEMPLATE, '2026-05').cats.needs[0].l).toBe('May budget');
    expect(resolveMonthEntry(store, TEMPLATE, '2026-09').cats.needs[0].l).toBe('September budget');
    // …and June, between them, still reads May's.
    expect(resolveMonthEntry(store, TEMPLATE, '2026-06').cats.needs[0].l).toBe('May budget');
  });

  it('materialises a month without aliasing the one it inherited from', () => {
    // Without a deep copy, editing December would mutate October in place —
    // the exact bug this module exists to prevent.
    const source = entry(['Shared']);
    const copy = cloneEntry(source);
    copy.cats.needs[0].l = 'Changed';
    copy.prefs.archived.push('x');
    expect(source.cats.needs[0].l).toBe('Shared');
    expect(source.prefs.archived).toEqual([]);
  });
});

describe('new months are not empty', () => {
  it('carries the latest arrangement forward to a month never opened', () => {
    saveArrangement('2026-05', entry(['Gym']));
    const dec = loadArrangement('2026-12');
    expect(dec.cats.needs[0].l).toBe('Gym');
    // …and it is honest about where that came from.
    expect(dec.inheritedFrom).toBe('2026-05');
    expect(isMonthCustomised(loadMonthCatStore(), '2026-12')).toBe(false);
  });

  it('reports no inheritance for a month that owns its arrangement', () => {
    saveArrangement('2026-05', entry(['Gym']));
    expect(loadArrangement('2026-05').inheritedFrom).toBeNull();
  });
});

describe('accounts that never customise a month are untouched', () => {
  it('resolves to the account-wide template, byte for byte', () => {
    localStorage.setItem('fx_bb_cats', JSON.stringify({
      needs: [{ k: 'c_gym', ic: 'other', l: 'Gym' }], wants: [], save: [],
    }));
    const view = loadCatViewFor('2026-06');
    expect(view.active.needs.some((c) => c.l === 'Gym')).toBe(true);
  });

  it('honours the template’s archived list', () => {
    localStorage.setItem('fx_bb_catprefs', JSON.stringify({
      order: { needs: [], wants: [], save: [] }, hidden: [], archived: ['groceries'],
    }));
    expect(loadCatViewFor('2026-06').active.needs.some((c) => c.k === 'groceries')).toBe(false);
  });
});

describe('the two views a month can have', () => {
  it('excludes a category the month archived, and only that month', () => {
    saveArrangement('2026-09', { cats: entry([]).cats, prefs: { ...emptyCatPrefs(), archived: ['transport'] } });

    expect(loadCatViewFor('2026-09').active.needs.some((c) => c.k === 'transport')).toBe(false);
    // August is earlier and has no entry of its own, so it never saw the change.
    expect(loadCatViewFor('2026-08').active.needs.some((c) => c.k === 'transport')).toBe(true);
  });
});

describe('storage hygiene', () => {
  it('drops junk month keys and junk entries rather than trusting them', () => {
    localStorage.setItem('fx_bb_cats_by_month', JSON.stringify({
      'not-a-month': entry(['Nope']),
      '2026-13': entry(['Nope']),
      '2026-05': { cats: { needs: [{ k: 'ok', l: 'Fine' }] }, prefs: { hidden: 'not-an-array' } },
    }));
    const store = loadMonthCatStore();
    expect(Object.keys(store)).toEqual(['2026-05']);
    expect(store['2026-05'].cats.needs[0].l).toBe('Fine');
    expect(store['2026-05'].prefs.hidden).toEqual([]);
  });

  it('returns a month to inheritance when its own entry is dropped', () => {
    const store: MonthCatStore = { '2026-03': entry(['March']), '2026-06': entry(['June']) };
    const next = withoutMonthEntry(store, '2026-06');
    expect(sourceMonthFor(next, '2026-06')).toBe('2026-03');
  });

  it('keeps the template in step only while the current month is the only custom one', () => {
    // An account that has never navigated away from "this month" keeps behaving
    // exactly as it did before per-month arrangements existed. The moment a
    // second month is customised, the months disagree and silently overwriting
    // the template would leak one month's decision into every inheriting month.
    const cm = currentMonth();
    saveArrangement(cm, entry(['Only']));
    expect(JSON.parse(localStorage.getItem('fx_bb_cats') || '{}').needs?.[0]?.l).toBe('Only');

    saveArrangement('2027-11', entry(['Later']));
    saveArrangement(cm, entry(['Changed again']));
    expect(JSON.parse(localStorage.getItem('fx_bb_cats') || '{}').needs?.[0]?.l).toBe('Only');
  });

  it('round-trips a store through storage unchanged', () => {
    const store: MonthCatStore = { '2026-05': entry(['May'], ['transport']) };
    saveMonthCatStore(store);
    expect(loadMonthCatStore()).toEqual(store);
  });
});
