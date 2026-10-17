import { describe, expect, it } from 'vitest';
import {
  ONBOARDING_DONE_KEY,
  WALKTHROUGH_SEEN_KEY,
  WALKTHROUGH_TEST_OPT_IN_KEY,
  isAutomatedClient,
  isEntryPath,
  passesFirstRunPrecheck,
  shouldAutoShowWalkthrough,
  type FirstRunInput,
} from '../walkthrough/gating';
import { exampleFor, money } from '../walkthrough/examples';

const CHROME_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

function input(over: Partial<FirstRunInput> & { store?: Record<string, string> } = {}): FirstRunInput {
  const store = over.store ?? {};
  return {
    pathname: '/tools/dashboard',
    client: { userAgent: CHROME_ANDROID, webdriver: false },
    testRun: false,
    read: (k) => (k in store ? store[k] : null),
    ...over,
  };
}

describe('walkthrough gating — who sees the first-run intro', () => {
  it('shows to a brand-new person on the dashboard with nothing saved', () => {
    expect(shouldAutoShowWalkthrough({ ...input(), hasData: () => false })).toBe(true);
    // The /tools index redirects a new user to the dashboard, so it counts too.
    expect(shouldAutoShowWalkthrough({ ...input({ pathname: '/tools/' }), hasData: () => false })).toBe(true);
  });

  it('never shows twice', () => {
    expect(shouldAutoShowWalkthrough({ ...input({ store: { [WALKTHROUGH_SEEN_KEY]: '1' } }), hasData: () => false })).toBe(false);
  });

  it('never shows to someone who finished (or skipped through) setup', () => {
    expect(shouldAutoShowWalkthrough({ ...input({ store: { [ONBOARDING_DONE_KEY]: '1' } }), hasData: () => false })).toBe(false);
  });

  it('never shows to an existing user — saved data, or any tool opened before', () => {
    expect(shouldAutoShowWalkthrough({ ...input(), hasData: () => true })).toBe(false);
    expect(shouldAutoShowWalkthrough({ ...input({ store: { fx_last_tool: 'budget' } }), hasData: () => false })).toBe(false);
  });

  it('fails closed when the data check throws', () => {
    expect(shouldAutoShowWalkthrough({ ...input(), hasData: () => { throw new Error('storage'); } })).toBe(false);
  });

  it('never interrupts a deep link into a specific tool, or any page outside the tools entry', () => {
    for (const pathname of ['/tools/budget', '/tools/goals', '/tools/settings', '/', '/learn', '/welcome', '/tools/dashboard/extra']) {
      expect(passesFirstRunPrecheck(input({ pathname }))).toBe(false);
    }
  });

  it('never shows to crawlers, prerenderers, audits or driven browsers', () => {
    const bots = [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36 (compatible; Googlebot/2.1)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.0)',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/129 Safari/537.36 Chrome-Lighthouse',
      'Mozilla/5.0 (compatible; Google-InspectionTool/1.0)',
      'Prerender (+https://github.com/prerender/prerender)',
      'AdsBot-Google (+http://www.google.com/adsbot.html)',
    ];
    for (const userAgent of bots) {
      expect(isAutomatedClient({ userAgent }), userAgent).toBe(true);
      expect(passesFirstRunPrecheck(input({ client: { userAgent } }))).toBe(false);
    }
    expect(isAutomatedClient({ userAgent: CHROME_ANDROID, webdriver: true })).toBe(true);
    expect(isAutomatedClient(undefined)).toBe(true);
  });

  it('does not mistake an ordinary phone for a bot', () => {
    const phones = [
      CHROME_ANDROID,
      'Mozilla/5.0 (Linux; Android 11; CUBOT X50) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
    ];
    for (const userAgent of phones) expect(isAutomatedClient({ userAgent }), userAgent).toBe(false);
  });

  it('stays out of test runs unless a test opts in — and opting in bypasses nothing else', () => {
    expect(passesFirstRunPrecheck(input({ testRun: true }))).toBe(false);
    expect(passesFirstRunPrecheck(input({ testRun: true, store: { [WALKTHROUGH_TEST_OPT_IN_KEY]: '1' } }))).toBe(true);
    expect(passesFirstRunPrecheck(input({ client: { webdriver: true }, store: { [WALKTHROUGH_TEST_OPT_IN_KEY]: '1' } }))).toBe(true);
    expect(passesFirstRunPrecheck(input({ testRun: true, store: { [WALKTHROUGH_TEST_OPT_IN_KEY]: '1', [WALKTHROUGH_SEEN_KEY]: '1' } }))).toBe(false);
    expect(passesFirstRunPrecheck(input({ testRun: true, pathname: '/tools/budget', store: { [WALKTHROUGH_TEST_OPT_IN_KEY]: '1' } }))).toBe(false);
  });

  it('recognises only the entry paths', () => {
    expect(isEntryPath('/tools')).toBe(true);
    expect(isEntryPath('/tools/dashboard/')).toBe(true);
    expect(isEntryPath('/tools/budget')).toBe(false);
  });
});

describe('walkthrough example figures', () => {
  it('are illustrative literals, with the 50/30/20 bands adding up to the example income', () => {
    for (const code of ['INR', 'USD', 'GBP']) {
      const ex = exampleFor(code);
      expect(ex.needs + ex.wants + ex.save).toBe(ex.income);
      expect(ex.needs / ex.income).toBe(0.5);
    }
  });

  it('does not show rupee-scale figures (or UPI) in another currency', () => {
    expect(exampleFor('INR').typed).toContain('upi');
    expect(exampleFor('GBP').typed).not.toContain('upi');
    expect(exampleFor('GBP').income).toBeLessThan(exampleFor('INR').income);
  });

  it('formats with the user’s symbol, Indian grouping for rupees', () => {
    expect(money(1000000, 'INR', '₹')).toBe('₹10,00,000');
    expect(money(60000, 'USD', '$')).toBe('$60,000');
  });
});
