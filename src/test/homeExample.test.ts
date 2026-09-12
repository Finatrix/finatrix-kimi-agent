/**
 * The homepage's illustrated month, per market.
 *
 * Three things can go wrong here and none of them is visible in a screenshot:
 *
 *   • The four figures stop adding up, so the card shows an arithmetic error on
 *     the site's most-visited page — on a product whose whole claim is that it
 *     shows its working.
 *   • Someone "fixes" a market by converting the Indian figures at an exchange
 *     rate, which produces numbers nobody in that country would recognise as a
 *     monthly income. The test below pins the shape that prevents it.
 *   • The market lookup starts guessing from the browser instead of reading a
 *     stored choice, which turns an illustration into the site telling a
 *     stranger where it thinks they are.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  HOME_EXAMPLES, MARKET_KEY, homeExampleFor, marketForHomeExample,
} from '../shared/homeExample';
import { MARKET_IDS, type MarketId } from '../tools/lib/markets/types';

const IDS = MARKET_IDS as readonly MarketId[];

describe('homepage example figures', () => {
  it('has an illustration for every market the product claims to serve', () => {
    expect(new Set(Object.keys(HOME_EXAMPLES))).toEqual(new Set(IDS));
  });

  it.each(IDS)('%s adds up: income − spending − set aside is what is left', (id) => {
    const raw = HOME_EXAMPLES[id];
    const view = homeExampleFor(id);
    const left = raw.income - raw.spending - raw.setAside;
    expect(left).toBeGreaterThan(0);
    // The rendered strings are localised currency, so compare the numbers via
    // the bar, which is the same subtraction expressed as percentages.
    expect(view.bar.spending + view.bar.setAside + view.bar.left).toBeGreaterThanOrEqual(99);
    expect(view.bar.spending + view.bar.setAside + view.bar.left).toBeLessThanOrEqual(101);
  });

  it.each(IDS)('%s renders in its own currency, named on the card', (id) => {
    const view = homeExampleFor(id);
    expect(view.currency).toBe(HOME_EXAMPLES[id].currency);
    // Every figure is formatted, not a bare number the reader has to interpret.
    for (const value of [view.income, view.spending, view.setAside, view.left]) {
      expect(value).not.toMatch(/^\d+$/);
      expect(value.length).toBeGreaterThan(2);
    }
  });

  it.each(IDS)('%s uses round illustrative figures, not converted ones', (id) => {
    const raw = HOME_EXAMPLES[id];
    // An FX conversion of ₹80,000 lands on values like 4,812 or 903. Round
    // numbers are the signal that a human chose them for this market.
    for (const n of [raw.income, raw.spending, raw.setAside]) {
      expect(n % 10, `${n} is not a round figure`).toBe(0);
    }
  });

  it('keeps every market plausible relative to its own scale', () => {
    for (const id of IDS) {
      const { income, spending, setAside } = HOME_EXAMPLES[id];
      // Same story everywhere: most of the month recorded or committed, a real
      // amount set aside, and something genuinely left to decide about.
      expect(spending / income).toBeGreaterThan(0.35);
      expect(spending / income).toBeLessThan(0.6);
      expect(setAside / income).toBeGreaterThan(0.1);
      expect(setAside / income).toBeLessThan(0.3);
    }
  });

  it('India keeps the figures the homepage has always shown', () => {
    // Changing these is a product decision, not a refactor. Pinning them makes
    // an accidental change to the shipped illustration fail rather than ship.
    expect(HOME_EXAMPLES.IN).toMatchObject({
      currency: 'INR', income: 80_000, spending: 36_500, setAside: 16_000,
    });
  });

  it('falls back to a real illustration for an unknown market id', () => {
    const view = homeExampleFor('ZZ' as MarketId);
    expect(view.income).toBe(homeExampleFor('IN').income);
  });
});

describe('which market the homepage illustrates', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.unstubAllGlobals());

  it('shows the default when the visitor has never chosen one', () => {
    expect(marketForHomeExample()).toBe('IN');
  });

  it('shows the market the visitor chose inside the tools', () => {
    localStorage.setItem(MARKET_KEY, 'GB');
    expect(marketForHomeExample()).toBe('GB');
    expect(homeExampleFor(marketForHomeExample()).currency).toBe('GBP');
  });

  it('ignores a stored value that is not a market', () => {
    localStorage.setItem(MARKET_KEY, 'ZZ');
    expect(marketForHomeExample()).toBe('IN');
  });

  it('never guesses from the browser — an unset preference is the default', () => {
    // A locale and time zone that would make the tools' own detection say "GB".
    // The homepage must not: guessing a visitor's country before they have told
    // us is a claim about them, not a default.
    vi.stubGlobal('Intl', {
      ...Intl,
      DateTimeFormat: Object.assign(
        () => ({ resolvedOptions: () => ({ timeZone: 'Europe/London', locale: 'en-GB' }) }),
        { supportedLocalesOf: () => [] },
      ),
    });
    expect(marketForHomeExample()).toBe('IN');
  });

  it('survives storage that throws, rather than taking the page down', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('site data blocked');
    });
    expect(marketForHomeExample()).toBe('IN');
    spy.mockRestore();
  });
});
