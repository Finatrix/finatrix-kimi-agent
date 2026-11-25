import { expect, test, type Page } from '@playwright/test';

/**
 * Share to FinatriX, through the web share target (step 3.3).
 *
 * An installed web app gets shared images as a POST to `/share-target`
 * (manifest.webmanifest `share_target`). The service worker answers it on the
 * device, puts the images in the share inbox and sends the page to the Expense
 * Tracker, which opens the screenshot import with them. This drives that POST
 * the way the browser's share sheet does, then checks the review opens with the
 * shared file and that nothing was saved on the way.
 *
 * Runs against the production build (`vite preview`): the worker is not
 * registered in dev.
 */

/** A 1×1 transparent PNG. Enough to prove the hand-over; recognition finds no text in it. */
const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, undefined, { timeout: 15_000 });
}

/** POST to the share target from inside the page, as the share sheet would. */
function share(page: Page, files: Array<{ name: string; type: string }>) {
  return page.evaluate(async ({ files, png }) => {
    const bytes = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
    const form = new FormData();
    for (const f of files) form.append('files', new File([bytes], f.name, { type: f.type }));
    const res = await fetch('/share-target', { method: 'POST', body: form });
    return new URL(res.url).pathname + new URL(res.url).search;
  }, { files, png: PNG_BASE64 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/tools/expenses');
  await waitForServiceWorker(page);
});

test('a shared screenshot opens the import review on this device, and nothing is saved', async ({ page }) => {
  expect(await share(page, [{ name: 'gpay-payment.png', type: 'image/png' }])).toBe('/tools/expenses?share=1');

  await page.goto('/tools/expenses?share=1');
  const dialog = page.getByRole('dialog', { name: 'Import a statement' });
  await expect(dialog).toBeVisible();
  // The shared file is the one being read (or, for this blank image, the one
  // that could not be): it reached the review, not the ledger.
  await expect(dialog.getByText(/gpay-payment\.png|could not read that file/)).toBeVisible({ timeout: 30_000 });
  // The parameter is consumed, so a reload does not open it again.
  await expect(page).toHaveURL(/\/tools\/expenses$/);
  expect(await page.evaluate(() => localStorage.getItem('fx_expenses'))).toBeNull();
});

test('the inbox is emptied once read, so the same share never opens twice', async ({ page }) => {
  await share(page, [{ name: 'once.png', type: 'image/png' }]);
  await page.goto('/tools/expenses?share=1');
  await expect(page.getByRole('dialog', { name: 'Import a statement' })).toBeVisible();

  await page.goto('/tools/expenses?share=1');
  await expect(page.getByText('Nothing is waiting to import. The shared images were already opened.')).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Import a statement' })).toHaveCount(0);
});

test('a share with no image says so instead of opening an empty review', async ({ page }) => {
  expect(await share(page, [{ name: 'notes.txt', type: 'text/plain' }])).toBe('/tools/expenses?share=failed');
  await page.goto('/tools/expenses?share=failed');
  await expect(page.getByText(/The shared image did not reach FinatriX/)).toBeVisible();
});
