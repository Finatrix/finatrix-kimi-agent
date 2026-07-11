import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDashPrefs, toggleSection, moveSection, resetDashPrefs, DASH_SECTIONS,
} from '../tools/lib/dashboardPrefs';

const ALL = DASH_SECTIONS.map((s) => s.id);

describe('dashboard personalisation prefs', () => {
  beforeEach(() => localStorage.clear());

  it('defaults to all sections visible in canonical order', () => {
    const p = getDashPrefs();
    expect(p.order).toEqual(ALL);
    expect(p.hidden).toEqual([]);
  });

  it('toggles a section hidden and back, persisting to storage', () => {
    toggleSection('insights');
    expect(getDashPrefs().hidden).toContain('insights');
    toggleSection('insights');
    expect(getDashPrefs().hidden).not.toContain('insights');
  });

  it('moves a section down and up within bounds', () => {
    const first = ALL[0];
    const second = ALL[1];
    moveSection(first, 1);
    expect(getDashPrefs().order[0]).toBe(second);
    expect(getDashPrefs().order[1]).toBe(first);
    moveSection(first, -1);
    expect(getDashPrefs().order[0]).toBe(first);
  });

  it('never moves out of bounds', () => {
    const first = ALL[0];
    moveSection(first, -1); // already at top → no-op
    expect(getDashPrefs().order[0]).toBe(first);
  });

  it('reset restores defaults', () => {
    toggleSection('upcoming');
    moveSection(ALL[0], 1);
    resetDashPrefs();
    const p = getDashPrefs();
    expect(p.order).toEqual(ALL);
    expect(p.hidden).toEqual([]);
  });

  it('reconciles a saved order that is missing a newer section', () => {
    // Simulate an older saved layout without the last section.
    localStorage.setItem('fx_dash_layout', JSON.stringify({ order: [ALL[0]], hidden: [] }));
    const p = getDashPrefs();
    // Missing sections are appended, so every section is still present.
    expect(new Set(p.order)).toEqual(new Set(ALL));
    expect(p.order.length).toBe(ALL.length);
  });
});
