import { describe, it, expect, beforeEach } from 'vitest';
import {
  applyCatPrefs, applyIncomeConfig, defaultIncomeConfig, emptyCatPrefs, forgetKey,
  loadCatPrefs, loadCatView, loadIncome, orderSection, reorderKeys, reorderSubset, saveCatPrefs,
  saveIncome, seedIncomeAmounts, toggleKey, totalIncome, withSectionOrder,
  DEFAULT_INCOME_SOURCES, LEGACY_INCOME_KEY,
} from '../tools/lib/budgetCats';
import { mergedCats, BB_NEEDS } from '../tools/lib/budget';

const cats = mergedCats({ needs: [], wants: [], save: [] });

beforeEach(() => localStorage.clear());

describe('category ordering', () => {
  it('leads with the stored order and keeps unmentioned keys in place', () => {
    const items = [{ k: 'a' }, { k: 'b' }, { k: 'c' }, { k: 'd' }];
    expect(orderSection(items, ['c', 'a']).map((x) => x.k)).toEqual(['c', 'a', 'b', 'd']);
    expect(orderSection(items, []).map((x) => x.k)).toEqual(['a', 'b', 'c', 'd']);
    // Stale keys (a deleted custom category) are ignored, not rendered as holes.
    expect(orderSection(items, ['zz', 'b']).map((x) => x.k)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('moves an item without mutating the input', () => {
    const keys = ['a', 'b', 'c'];
    expect(reorderKeys(keys, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(reorderKeys(keys, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(reorderKeys(keys, 1, 1)).toBe(keys);
    expect(keys).toEqual(['a', 'b', 'c']);
  });

  /**
   * The organise UI shows only non-archived rows and reorders by index, so a
   * move applies to that subset while everything else must stay pinned —
   * otherwise restoring an archived category drops it in the wrong place.
   */
  it('moves within the visible subset, leaving archived items pinned', () => {
    const full = ['a', 'ARCH', 'b', 'c'];
    const live = (k: string) => k !== 'ARCH';
    // Visible list is [a, b, c]; move c (index 2) to the front.
    expect(reorderSubset(full, live, 2, 0)).toEqual(['c', 'ARCH', 'a', 'b']);
    // A no-op move returns the original array identity.
    expect(reorderSubset(full, live, 1, 1)).toBe(full);
  });

  it('keeps the countable list in the user’s own order', () => {
    const view = applyCatPrefs(cats, { ...emptyCatPrefs(), hidden: ['groceries'] });
    // Hidden categories stay in position — concatenating them would break the
    // index mapping the reorder controls rely on.
    expect(view.active.needs.map((c) => c.k).slice(0, 3)).toEqual(['rent', 'groceries', 'utilities']);
  });

  it('persists an explicit section order across reloads', () => {
    const reordered = ['groceries', 'rent'];
    saveCatPrefs(withSectionOrder(emptyCatPrefs(), 'needs', reordered));
    const view = applyCatPrefs(cats, loadCatPrefs());
    expect(view.visible.needs.slice(0, 2).map((c) => c.k)).toEqual(reordered);
    // Everything else survives, just after the pinned pair.
    expect(view.visible.needs).toHaveLength(BB_NEEDS.length);
  });
});

describe('hide vs archive', () => {
  it('hides a category from the list but keeps it counted', () => {
    const view = applyCatPrefs(cats, { ...emptyCatPrefs(), hidden: ['rent'] });
    expect(view.visible.needs.some((c) => c.k === 'rent')).toBe(false);
    expect(view.hidden.map((c) => c.k)).toEqual(['rent']);
    // "active" is what totals are summed over — hidden categories are in it.
    expect(view.active.needs.some((c) => c.k === 'rent')).toBe(true);
  });

  it('archives a category out of every total, losslessly', () => {
    const view = applyCatPrefs(cats, { ...emptyCatPrefs(), archived: ['rent'] });
    expect(view.visible.needs.some((c) => c.k === 'rent')).toBe(false);
    expect(view.active.needs.some((c) => c.k === 'rent')).toBe(false);
    expect(view.archived.map((c) => c.k)).toEqual(['rent']);
  });

  it('round-trips a restore back to exactly where it was', () => {
    const archived = { ...emptyCatPrefs(), archived: ['rent'] };
    const restored = { ...archived, archived: toggleKey(archived.archived, 'rent') };
    expect(applyCatPrefs(cats, restored).visible.needs[0].k).toBe('rent');
  });

  it('forgets a deleted key from every preference list', () => {
    const prefs = {
      order: { needs: ['x', 'rent'], wants: ['x'], save: [] },
      hidden: ['x'], archived: ['x'],
    };
    const after = forgetKey(prefs, 'x');
    expect(after.order.needs).toEqual(['rent']);
    expect(after.order.wants).toEqual([]);
    expect(after.hidden).toEqual([]);
    expect(after.archived).toEqual([]);
  });

  it('loadCatView reflects saved preferences', () => {
    saveCatPrefs({ ...emptyCatPrefs(), archived: ['groceries'] });
    expect(loadCatView().active.needs.some((c) => c.k === 'groceries')).toBe(false);
  });
});

describe('income sources', () => {
  it('seeds the common sources on first run', () => {
    const cfg = loadIncome();
    expect(cfg.sources.map((s) => s.l)).toEqual([
      'Salary', 'Interest', 'Dividend', 'Rental Income',
      'Business Income', 'Sale of Asset', 'Government Benefits', 'Other',
    ]);
  });

  it('supports unlimited custom sources and keeps them forever', () => {
    const cfg = defaultIncomeConfig();
    const extra = Array.from({ length: 25 }, (_, i) => ({
      k: `c${i}`, l: `Side gig ${i}`, ic: 'dollar' as const, custom: true,
    }));
    saveIncome({ ...cfg, sources: [...cfg.sources, ...extra] });
    const reloaded = loadIncome();
    expect(reloaded.sources).toHaveLength(DEFAULT_INCOME_SOURCES.length + 25);
    expect(reloaded.sources.at(-1)!.l).toBe('Side gig 24');
  });

  it('appends newly shipped default sources without disturbing the user order', () => {
    saveIncome({ sources: [{ k: 'salary', l: 'Pay', ic: 'briefcase' }], hidden: [], archived: [] });
    const cfg = loadIncome();
    expect(cfg.sources[0]).toMatchObject({ k: 'salary', l: 'Pay' }); // rename preserved
    expect(cfg.sources.some((s) => s.k === 'rental')).toBe(true);
  });

  it('does not resurrect a default the user archived', () => {
    saveIncome({ sources: [{ k: 'salary', l: 'Salary', ic: 'briefcase' }], hidden: [], archived: ['rental'] });
    expect(loadIncome().sources.some((s) => s.k === 'rental')).toBe(false);
  });

  it('excludes archived sources from the total but keeps hidden ones', () => {
    const cfg = { ...defaultIncomeConfig(), hidden: ['interest'], archived: ['rental'] };
    const view = applyIncomeConfig(cfg);
    const amounts = { salary: 50000, interest: 2000, rental: 15000 };
    expect(totalIncome(amounts, view.active)).toBe(52000);
    expect(view.archived.map((s) => s.k)).toEqual(['rental']);
    // Hidden sources hold their position in `active` — the organise list is
    // rendered from it and reorders by index.
    expect(view.active.map((s) => s.k).slice(0, 3)).toEqual(['salary', 'interest', 'dividend']);
  });

  it('ignores negative and non-numeric amounts', () => {
    const view = applyIncomeConfig(defaultIncomeConfig());
    expect(totalIncome({ salary: -500, interest: NaN, dividend: 100 }, view.active)).toBe(100);
  });
});

describe('legacy income migration', () => {
  it('turns a pre-multi-source month into a Salary line', () => {
    expect(seedIncomeAmounts(undefined, '60000')).toEqual({ [LEGACY_INCOME_KEY]: 60000 });
  });

  it('prefers stored per-source amounts once they exist', () => {
    expect(seedIncomeAmounts({ salary: 40000, rental: 12000 }, '99999'))
      .toEqual({ salary: 40000, rental: 12000 });
  });

  it('produces an empty map for a month with no income at all', () => {
    expect(seedIncomeAmounts(undefined, '')).toEqual({});
    expect(seedIncomeAmounts({}, undefined)).toEqual({});
  });
});
