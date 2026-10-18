import { beforeEach, describe, expect, it } from 'vitest';
import { SYNC_KEYS } from '../tools/cloudSync';
import { LOCAL_ONLY_KEYS, resetAllData } from '../tools/lib/settings';
import {
  TOUR_LOCAL_KEYS, TOUR_OFFER_KEY, TOUR_OPTOUT_KEY, TOUR_PROGRESS_KEY,
  chapterProgress, loadProgress, markChapterDone, markFinished, markSeen, markStarted, resetProgress, snoozeOffer, setOptOut,
} from '../tour/progress';

const NOW = Date.UTC(2026, 9, 17, 9, 30);

describe('tour progress', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty', () => {
    expect(loadProgress()).toEqual({ v: 1, seen: {}, done: {}, startedAt: undefined, finishedAt: undefined, last: undefined });
  });

  it('records seen steps once, the place to continue from, and finished chapters', () => {
    markSeen('budget', 'income', NOW);
    markSeen('budget', 'income', NOW + 5000); // first time is what counts
    markSeen('budget', 'split', NOW + 9000);
    markChapterDone('budget', NOW + 10000);
    const p = loadProgress();
    expect(p.seen).toEqual({ 'budget.income': NOW, 'budget.split': NOW + 9000 });
    expect(p.last).toEqual({ chapter: 'budget', step: 'split' });
    expect(p.startedAt).toBe(NOW);
    expect(p.done.budget).toBe(NOW + 10000);
    expect(chapterProgress(p, 'budget', ['income', 'split', 'score'])).toEqual({ seen: 2, total: 3, done: true });
    // Persisted as JSON under the documented key.
    expect(JSON.parse(localStorage.getItem(TOUR_PROGRESS_KEY)!).seen['budget.income']).toBe(NOW);
  });

  it('keeps the first start time and the finish time', () => {
    markStarted(NOW);
    markStarted(NOW + 1);
    markFinished(NOW + 2);
    expect(loadProgress().startedAt).toBe(NOW);
    expect(loadProgress().finishedAt).toBe(NOW + 2);
  });

  it('survives corrupt or hostile stored values', () => {
    localStorage.setItem(TOUR_PROGRESS_KEY, '{"seen":{"a.b":"yesterday"},"done":[1],"last":{"chapter":3}}');
    expect(loadProgress()).toMatchObject({ seen: {}, done: {}, last: undefined });
    localStorage.setItem(TOUR_PROGRESS_KEY, 'not json');
    expect(loadProgress().seen).toEqual({});
  });

  it('"Reset tour progress" forgets what was seen but keeps an opt-out', () => {
    markSeen('dashboard', 'hero', NOW);
    setOptOut(true);
    resetProgress();
    expect(loadProgress().seen).toEqual({});
    expect(localStorage.getItem(TOUR_OPTOUT_KEY)).toBe('1');
  });

  it('is local-only: registered for reset, never synced', () => {
    for (const k of TOUR_LOCAL_KEYS) {
      expect(LOCAL_ONLY_KEYS).toContain(k);
      expect(SYNC_KEYS).not.toContain(k);
    }
  });

  it('is cleared by "Reset all data"', () => {
    markSeen('dashboard', 'hero', NOW);
    setOptOut(true);
    snoozeOffer(NOW);
    expect(localStorage.getItem(TOUR_OFFER_KEY)).not.toBeNull();
    resetAllData();
    for (const k of TOUR_LOCAL_KEYS) expect(localStorage.getItem(k)).toBeNull();
  });
});
