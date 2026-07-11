import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getDataSummary, hasAnyData, exportBackup, resetAllData } from '../tools/lib/settings';
import { currentMonth } from '../tools/lib/month';

const CM = currentMonth();

function seed() {
  localStorage.setItem('fx_bb_data', JSON.stringify({ [CM]: { income: '50000', n: '50', w: '30', s: '20', vals: { rent: 15000 } } }));
  localStorage.setItem('fx_expenses', JSON.stringify([{ id: '1', amount: 500, category: 'rent', date: `${CM}-01` }]));
  localStorage.setItem('fx_notif_read', JSON.stringify(['x']));
}

describe('settings data management', () => {
  beforeEach(() => {
    localStorage.clear();
    // jsdom lacks object URLs — stub the download side-effects.
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  });

  it('summarises only the data that actually exists', () => {
    expect(hasAnyData()).toBe(false);
    seed();
    const present = getDataSummary().filter((a) => a.present).map((a) => a.label);
    expect(present).toContain('Budget');
    expect(present).toContain('Expenses');
    expect(hasAnyData()).toBe(true);
  });

  it('exportBackup returns false with no data and true once data exists', () => {
    expect(exportBackup()).toBe(false);
    seed();
    expect(exportBackup()).toBe(true);
  });

  it('resetAllData clears tool data and notification state', () => {
    seed();
    const cleared = resetAllData();
    expect(cleared).toBeGreaterThan(0);
    expect(localStorage.getItem('fx_bb_data')).toBeNull();
    expect(localStorage.getItem('fx_expenses')).toBeNull();
    expect(localStorage.getItem('fx_notif_read')).toBeNull();
    expect(hasAnyData()).toBe(false);
  });
});
