import { expect, test } from '@playwright/test';

/**
 * Pressing Import on a tab that was opened before a deploy.
 *
 * The importer is a chunk fetched on first use, and a deploy removes the chunk
 * that an already-open tab would ask for. That request failing used to throw at
 * the app's only error boundary: the whole app was replaced with the error
 * screen. This runs against the production bundle, where Vite's own
 * `vite:preloadError` event is what triggers the recovery — the part a unit
 * test cannot exercise.
 *
 * Service workers are blocked so the request reaches the route handler below
 * rather than the worker's cache.
 */
test.use({ serviceWorkers: 'block' });

const IMPORT_CHUNK = /\/assets\/StatementImport-[\w-]+\.js$/;
/** The app's own "has the site been deployed since I loaded?" question. */
const BUILD_CHECK = /\/index\.html\?build-check=\d+$/;
const NEWER_SHELL = '<!doctype html><script type="module" crossorigin src="/assets/index-anewerbuild.js"></script><div id="root"></div>';

test('a missing importer chunk reloads the page once, then explains itself, and never crashes the app', async ({ page }) => {
  await page.goto('/tools/expenses');
  const importButton = page.getByRole('button', { name: 'Import', exact: true });
  await expect(importButton).toBeVisible();

  // The deploy: the chunk this tab knows about is gone, and the server now
  // serves a shell for a newer build.
  await page.route(IMPORT_CHUNK, (route) => route.fulfill({ status: 404, contentType: 'text/plain', body: 'Not found' }));
  await page.route(BUILD_CHECK, (route) => route.fulfill({ status: 200, contentType: 'text/html', body: NEWER_SHELL }));

  // First press: the page reloads itself onto the current build.
  await importButton.click();
  await page.waitForFunction(() => window.sessionStorage.getItem('fx_chunk_reload_at') !== null);
  await page.waitForLoadState('load');
  await expect(page.getByRole('heading', { name: 'Your money, tracked and understood.' })).toBeVisible();
  await expect(page.getByText(/glitch on our end/i)).toHaveCount(0);

  // Second press, with the chunk still missing: a reload did not cure it, so
  // there is no second reload — a message, and a page that still works.
  await page.evaluate(() => { (window as unknown as { __sameDocument?: boolean }).__sameDocument = true; });
  await importButton.click();
  await expect(page.getByText('Import could not be loaded. Check your connection and try again.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your money, tracked and understood.' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);

  // The chunk is reachable again. A browser may remember a module that failed
  // to load for as long as the page lives, so the cure is a fresh page — which
  // is what the automatic reload does once its one-minute guard has passed.
  await page.unroute(IMPORT_CHUNK);
  await page.unroute(BUILD_CHECK);
  await page.reload();
  await importButton.click();
  const dialog = page.getByRole('dialog', { name: 'Import a statement' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Choose a file' })).toBeFocused();
});

test('a chunk that fails with no newer build behind it never reloads the page', async ({ page }) => {
  // What an interrupted import looks like to the app — WebKit fails every
  // import in flight the moment a navigation starts. The build is unchanged,
  // so reloading would only cancel whatever the user had just asked for.
  await page.goto('/tools/expenses');
  const importButton = page.getByRole('button', { name: 'Import', exact: true });
  await expect(importButton).toBeVisible();
  await page.route(IMPORT_CHUNK, (route) => route.fulfill({ status: 503, contentType: 'text/plain', body: 'Unavailable' }));
  await page.evaluate(() => { (window as unknown as { __sameDocument?: boolean }).__sameDocument = true; });

  await importButton.click();

  await expect(page.getByText('Import could not be loaded. Check your connection and try again.')).toBeVisible();
  expect(await page.evaluate(() => window.sessionStorage.getItem('fx_chunk_reload_at'))).toBeNull();
  expect(await page.evaluate(() => (window as unknown as { __sameDocument?: boolean }).__sameDocument)).toBe(true);
});

test('a statement for an earlier month takes the tracker to that month', async ({ page }) => {
  await page.goto('/tools/expenses');
  await page.getByRole('button', { name: 'Import', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a statement' });

  // Three months back from today, whatever today is.
  const day = new Date();
  day.setDate(5);
  day.setMonth(day.getMonth() - 3);
  const two = (n: number) => String(n).padStart(2, '0');
  const date = `${two(day.getDate())}/${two(day.getMonth() + 1)}/${day.getFullYear()}`;
  const label = day.toLocaleString('default', { month: 'long', year: 'numeric' });

  await dialog.locator('input[type="file"]').setInputFiles({
    name: 'older-statement.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from([
      'Date,Description,Debit,Credit,Balance',
      `${date},SWIGGY BANGALORE,450.00,,9550.00`,
      `${date},UBER TRIP,220.50,,9329.50`,
    ].join('\n')),
  });

  await dialog.getByRole('button', { name: 'Import 2 transactions' }).click();
  await expect(dialog).toHaveCount(0);

  // The rows are on screen, in the month they belong to — not left in a month
  // nobody was looking at.
  await expect(page.getByText(`Imported 2 transactions. Showing ${label}, where they landed.`)).toBeVisible();
  await expect(page.getByText('Viewing past month')).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem('fx_expenses') ?? '[]').length)).toBe(2);
});
