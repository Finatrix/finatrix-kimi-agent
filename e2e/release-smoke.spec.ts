import { ARTICLES, articlePath } from '../src/shared/content';
import { ANALYTICS_URL, TRAPPED_ANALYTICS, expect, test } from './support/fixtures';
import { watch } from './support/pageHealth';

/**
 * The deploy gate's browser check: the exact bundle about to ship, booted in
 * every engine (Chromium desktop, the Pixel 7 viewport, and WebKit).
 *
 * The full suite does not run at deploy time. CI runs all of it on every pull
 * request and again on every push to main. What CI never drives is THIS
 * bundle: it builds with no client config (FX_ALLOW_UNCONFIGURED_BUILD=1), so
 * the Supabase client and analytics are compiled out of everything it tests.
 * The Deploy workflow builds with the real config, and that is the difference
 * left to check:
 *
 *   • each kind of page boots with no uncaught error, no console error and no
 *     failed request. A malformed secret, or a client that throws on start,
 *     would blank the site while every fetch-based check after the deploy
 *     still passes;
 *   • it honours Global Privacy Control, which is also how a deploy keeps its
 *     own test traffic out of the visitor numbers (see ./support/fixtures.ts).
 *
 * Deploy runs it through `npm run test:e2e:release`, together with the AI
 * specs that need a configured client and are skipped in CI. It also runs in
 * CI against the unconfigured bundle, so it cannot rot between deploys. Keep it
 * small and deterministic: every production deploy waits on it.
 */

/** One page per shell and lazy-loaded area, rather than every URL. */
const PAGES = [
  '/', // the marketing shell
  '/tools/expenses', // the tools shell and the core tracker
  '/pricing', // plans and billing copy
  '/careers', // the careers shell
  '/login', // account entry, the screen that drives the Supabase client
  articlePath(ARTICLES[0]), // a guide, from the registry the sitemap reads
];

for (const path of PAGES) {
  test(`${path} boots clean`, async ({ page }) => {
    const { errors, failed } = watch(page);

    const response = await page.goto(path, { waitUntil: 'networkidle' });
    expect(response?.status(), `${path} HTTP status`).toBeLessThan(400);
    // A shell that rendered without its content still has a nav and a footer,
    // so the page's own h1 is the signal that the route really mounted.
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();

    expect(errors, `${path} console errors:\n${errors.join('\n')}`).toEqual([]);
    expect(failed, `${path} failed requests:\n${failed.join('\n')}`).toEqual([]);
  });
}

test('honours Global Privacy Control, so test traffic sends no analytics', async ({ page }) => {
  test.skip(!ANALYTICS_URL, 'This bundle was built without analytics.');

  await page.goto('/', { waitUntil: 'networkidle' });
  const sends = await page.evaluate(
    ({ endpoint, counter }) => {
      const trapped = () => (window as unknown as Record<string, number>)[counter];
      // The trap is armed for this exact endpoint: a beacon to it is caught here.
      navigator.sendBeacon(endpoint, 'trap-check');
      const armed = trapped();
      // What a closing tab does: `pagehide` flushes the queue. The handler runs
      // synchronously, so any send has happened by the time this line returns.
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      return { armed, byTheApp: trapped() - armed };
    },
    { endpoint: ANALYTICS_URL!.href, counter: TRAPPED_ANALYTICS },
  );

  expect(sends.armed, 'the analytics trap in e2e/support/fixtures.ts is not catching this endpoint').toBe(1);
  expect(
    sends.byTheApp,
    'the bundle sent analytics despite Global Privacy Control, a privacy regression (the trap kept it in the runner)',
  ).toBe(0);
});
