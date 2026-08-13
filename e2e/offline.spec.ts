import { test, expect, type Page } from '@playwright/test';

/**
 * Offline support, proven rather than assumed.
 *
 * The money tools keep their data in localStorage, so once the shell is cached
 * the whole of Budget, Expenses and Goals works with no connection at all.
 * That claim is only worth making if it is tested: a service worker that
 * registers but does not actually serve the shell looks identical from the
 * outside until someone is in a tunnel.
 *
 * Runs against the real production build (`vite preview`, see
 * playwright.config webServer) — the worker is deliberately not registered in
 * dev, so a dev-server run would test nothing.
 */

/** Wait until a worker is installed AND controlling the page. */
async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(
    () => navigator.serviceWorker.controller !== null,
    undefined,
    { timeout: 15_000 },
  );
}

/**
 * Wait until the worker actually holds the route's code.
 *
 * Polling the real cache rather than sleeping a fixed interval: under parallel
 * workers a fixed wait is a coin toss, and a flaky offline test is worse than
 * none because it trains everyone to re-run it.
 */
async function waitForCachedApp(page: Page, minAssets = 4) {
  await page.waitForFunction(
    async (min) => {
      const names = await caches.keys();
      const shell = names.find((n) => n.startsWith('fx-shell-'));
      const assets = names.find((n) => n.startsWith('fx-assets-'));
      if (!shell || !assets) return false;
      const hasShell = await (await caches.open(shell)).match('/index.html');
      const held = await (await caches.open(assets)).keys();
      return !!hasShell && held.length >= min;
    },
    minAssets,
    { timeout: 20_000 },
  );
}

test('the app still loads with no connection once the shell is cached', async ({ page, context }) => {
  await page.goto('/tools/expenses', { waitUntil: 'networkidle' });
  await waitForServiceWorker(page);

  // One online reload, now that the worker controls the page: this is how a
  // returning visitor arrives, and it is when the route's own lazy chunk goes
  // through the worker and into the cache.
  await page.reload({ waitUntil: 'networkidle' });
  await waitForCachedApp(page);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'load' });
    // The shell booted and the SPA rendered a real tool, not an error page.
    await expect(page.getByRole('tab', { name: 'Overview' })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText('Add an expense')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('a transaction logged offline is saved and survives coming back online', async ({ page, context }) => {
  await page.goto('/tools/expenses', { waitUntil: 'networkidle' });
  await waitForServiceWorker(page);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForCachedApp(page);

  await context.setOffline(true);
  try {
    await page.reload({ waitUntil: 'load' });
    await expect(page.getByLabel('Quick add')).toBeVisible({ timeout: 15_000 });

    // The whole point: this works with no network, because the data never
    // needed one.
    await page.getByLabel('Quick add').fill('340 lunch');
    await page.getByLabel('Quick add').press('Enter');

    const stored = await page.evaluate(() =>
      JSON.parse(localStorage.getItem('fx_expenses') || '[]')
    );
    expect(stored).toHaveLength(1);
    expect(stored[0].amount).toBe(340);
  } finally {
    await context.setOffline(false);
  }

  await page.reload({ waitUntil: 'networkidle' });
  const afterOnline = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('fx_expenses') || '[]')
  );
  expect(afterOnline).toHaveLength(1);
});

/**
 * What the worker guarantees for a route the user has never opened.
 *
 * The DOCUMENT is always answered — every navigation resolves to the cached
 * shell, so the browser's dinosaur never appears. Whether that route's own lazy
 * chunk is present depends on whether it was ever loaded online, which is the
 * honest limit of a runtime cache and is asserted as such: the app boots and
 * renders its shell rather than the tab dying at the network layer.
 */
test('a never-visited route still resolves to the app shell offline', async ({ page, context }) => {
  await page.goto('/', { waitUntil: 'networkidle' });
  await waitForServiceWorker(page);
  await page.reload({ waitUntil: 'networkidle' });
  await waitForCachedApp(page);

  await context.setOffline(true);
  try {
    const res = await page.goto('/tools/budget', { waitUntil: 'load' });
    // Answered from the cache, not a network failure.
    expect(res, 'navigation must be answered offline').not.toBeNull();
    // React booted: the app's own chrome is on the page.
    await expect(page.locator('#root')).not.toBeEmpty({ timeout: 15_000 });
  } finally {
    await context.setOffline(false);
  }
});
