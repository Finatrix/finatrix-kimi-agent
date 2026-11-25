import { test as base, expect } from '@playwright/test';
import { loadEnv } from 'vite';

/**
 * `test` and `expect` for specs that run against a CONFIGURED bundle, one
 * built with the real client config the way the Deploy workflow builds it.
 *
 * Import them from here instead of '@playwright/test' and no page the test
 * opens sends analytics. Deploy used to run the whole suite against its bundle
 * with nothing in the way, so every deploy posted a page view for each test
 * and counted several hundred automated sessions as real visitors.
 */

// The same source vite.config.ts builds from: the .env files, overridden by any
// VITE_* variable in the environment.
const env = loadEnv('production', process.cwd(), 'VITE_');

/**
 * Where the bundle under test sends analytics, or null when it was built
 * without it. CI builds with no client config, so there it is compiled out.
 */
export const ANALYTICS_URL: URL | null = env.VITE_ANALYTICS_URL?.trim()
  ? new URL(env.VITE_ANALYTICS_URL.trim())
  : null;

/** Page global counting analytics sends the trap below swallowed. */
export const TRAPPED_ANALYTICS = '__fxE2eTrappedAnalytics';

export const test = base.extend<{ noAnalytics: void }>({
  /**
   * Two layers, both inside the page, because the network layer cannot do it.
   * Playwright's request routing never sees an analytics beacon in WebKit (it
   * goes straight to the network), nor in Chromium when the beacon is sent as
   * the page unloads, which is exactly when the app flushes its queue.
   *
   * 1. The page reports Global Privacy Control. The app honours it
   *    (src/lib/privacyPreferences.ts and src/lib/analytics.ts), so nothing is
   *    queued and nothing is sent.
   * 2. A trap on the two transports the analytics module uses, sendBeacon and
   *    fetch. A call aimed at the analytics endpoint is counted and dropped,
   *    never sent. If the app ever stops honouring GPC, release-smoke.spec.ts
   *    fails on the count and nothing has left the runner.
   */
  noAnalytics: [
    async ({ context }, use) => {
      await context.addInitScript(
        ({ endpoint, counter }) => {
          Object.defineProperty(navigator, 'globalPrivacyControl', { configurable: true, get: () => true });
          if (!endpoint) return;

          const target = new URL(endpoint);
          const page = window as unknown as Record<string, number>;
          page[counter] = 0;
          const isAnalytics = (url: string | URL): boolean => {
            try {
              const u = new URL(String(url), location.href);
              return u.origin === target.origin && u.pathname === target.pathname;
            } catch {
              return false;
            }
          };

          const sendBeacon = navigator.sendBeacon?.bind(navigator);
          if (sendBeacon) {
            navigator.sendBeacon = (url, data) => {
              if (!isAnalytics(url)) return sendBeacon(url, data);
              page[counter] += 1;
              return true;
            };
          }
          const fetch = window.fetch.bind(window);
          window.fetch = (input, init) => {
            const url = input instanceof Request ? input.url : input;
            if (!isAnalytics(url)) return fetch(input, init);
            page[counter] += 1;
            return Promise.resolve(new Response(null, { status: 204 }));
          };
        },
        { endpoint: ANALYTICS_URL?.href ?? '', counter: TRAPPED_ANALYTICS },
      );
      await use();
    },
    { auto: true },
  ],
});

export { expect };
