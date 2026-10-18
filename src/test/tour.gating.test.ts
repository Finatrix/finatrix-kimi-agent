import { describe, expect, it } from 'vitest';
import { isReturningVisitor, passesOfferPrecheck, shouldOfferTour, type OfferInput } from '../tour/gating';
import {
  MAX_SNOOZES, SNOOZE_MS, TOUR_OFFER_KEY, TOUR_OPTOUT_KEY, TOUR_PROGRESS_KEY, TOUR_TEST_OPT_IN_KEY,
  acceptOffer, loadOffer, recordOfferShown, setOptOut, snoozeOffer, type Storage,
} from '../tour/progress';

/**
 * Who gets the automatic "want a tour?" offer. A fixed clock, pinned here at
 * the top level and passed in explicitly, so nothing depends on the real date.
 */
const NOW = Date.UTC(2026, 9, 17, 9, 30);
const DAY = 24 * 60 * 60 * 1000;

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

function memory(init: Record<string, string> = {}): Storage & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    read: (k) => (k in data ? data[k] : null),
    write: (k, v) => { data[k] = v; },
    remove: (k) => { delete data[k]; },
  };
}

/** A returning visitor (saw the intro in an earlier session) on the dashboard. */
function input(over: Partial<OfferInput & { hasData: () => boolean }> & { store?: Record<string, string> } = {}): OfferInput & { hasData: () => boolean } {
  const s = memory(over.store ?? { fx_walkthrough_seen: '1' });
  return {
    pathname: '/tools/dashboard',
    client: { userAgent: CHROME_ANDROID, webdriver: false },
    testRun: false,
    storage: s,
    now: NOW,
    hasData: () => false,
    ...over,
  };
}

describe('tour offer — who is asked', () => {
  it('asks a returning visitor at the dashboard', () => {
    expect(shouldOfferTour(input())).toBe(true);
    expect(shouldOfferTour(input({ pathname: '/tools/' }))).toBe(true);
  });

  it('asks existing users who update (saved data, setup done, or a tool opened before)', () => {
    expect(shouldOfferTour(input({ store: {}, hasData: () => true }))).toBe(true);
    expect(shouldOfferTour(input({ store: { fx_onboarding_done: '1' } }))).toBe(true);
    expect(shouldOfferTour(input({ store: { fx_last_tool: 'budget' } }))).toBe(true);
  });

  it('never stacks on the first-run intro: a brand-new visitor is not asked', () => {
    // Nothing seen, nothing saved — exactly who the intro is for.
    expect(shouldOfferTour(input({ store: {}, hasData: () => false }))).toBe(false);
    expect(isReturningVisitor(() => null)).toBe(false);
  });

  it('fails closed when the data check throws', () => {
    expect(shouldOfferTour(input({ store: {}, hasData: () => { throw new Error('storage'); } }))).toBe(false);
  });

  it('is only ever offered at the dashboard entry — never deep links or marketing pages', () => {
    for (const pathname of ['/', '/learn', '/pricing', '/tools/budget', '/tools/settings', '/welcome']) {
      expect(passesOfferPrecheck(input({ pathname }))).toBe(false);
    }
  });

  it('never asks crawlers, audits or driven browsers', () => {
    expect(shouldOfferTour(input({ client: { userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' } }))).toBe(false);
    expect(shouldOfferTour(input({ client: { userAgent: 'Mozilla/5.0 HeadlessChrome/129.0' } }))).toBe(false);
    expect(shouldOfferTour(input({ client: { userAgent: CHROME_ANDROID, webdriver: true } }))).toBe(false);
    expect(shouldOfferTour(input({ client: undefined }))).toBe(false);
  });

  it('stays silent under vitest unless a test opts in', () => {
    expect(shouldOfferTour(input({ testRun: true }))).toBe(false);
    expect(shouldOfferTour(input({ testRun: true, store: { fx_walkthrough_seen: '1', [TOUR_TEST_OPT_IN_KEY]: '1' } }))).toBe(true);
  });

  it('never asks again after "Don\'t remind me again"', () => {
    const s = input();
    setOptOut(true, s.storage as Storage);
    expect((s.storage as Storage).read(TOUR_OPTOUT_KEY)).toBe('1');
    expect(shouldOfferTour(s)).toBe(false);
    setOptOut(false, s.storage as Storage);
    expect(shouldOfferTour(s)).toBe(true);
  });

  it('never asks someone who has already taken (or accepted) the tour', () => {
    expect(shouldOfferTour(input({ store: { fx_walkthrough_seen: '1', [TOUR_PROGRESS_KEY]: JSON.stringify({ v: 1, seen: {}, done: {}, startedAt: NOW - DAY }) } }))).toBe(false);
    const s = input();
    acceptOffer(s.storage as Storage);
    expect(shouldOfferTour(s)).toBe(false);
  });

  it('"Maybe later" holds the offer back three days, and re-offers at most twice', () => {
    const s = input();
    const store = s.storage as Storage;
    recordOfferShown(store);
    let o = snoozeOffer(NOW, store);
    expect(o.snoozes).toBe(1);
    expect(o.nextAt).toBe(NOW + SNOOZE_MS);
    expect(shouldOfferTour({ ...s, now: NOW + 2 * DAY })).toBe(false);
    expect(shouldOfferTour({ ...s, now: NOW + 3 * DAY })).toBe(true); // re-offer 1

    o = snoozeOffer(NOW + 3 * DAY, store);
    expect(shouldOfferTour({ ...s, now: NOW + 6 * DAY })).toBe(true); // re-offer 2

    o = snoozeOffer(NOW + 6 * DAY, store);
    expect(o.snoozes).toBe(MAX_SNOOZES);
    expect(shouldOfferTour({ ...s, now: NOW + 60 * DAY })).toBe(false); // a quiet no
    expect(loadOffer(store).shown).toBe(1);
  });

  it('treats unreadable offer state as a fresh start, never a crash', () => {
    expect(shouldOfferTour(input({ store: { fx_walkthrough_seen: '1', [TOUR_OFFER_KEY]: '{not json' } }))).toBe(true);
    expect(shouldOfferTour(input({ store: { fx_walkthrough_seen: '1', [TOUR_PROGRESS_KEY]: '[]' } }))).toBe(true);
  });
});
