import { expect, test } from '@playwright/test';

/**
 * Warranty and bill locker (step 3.5), in a real browser.
 *
 * The photo goes into IndexedDB, which jsdom does not have, so this is the
 * test that proves a bill and its photo survive a reload, that search finds it
 * by shop, and that deleting it takes the photo out of the store.
 */

/** A 1×1 PNG: enough to be stored, shown and counted. */
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

const photoCount = (page: import('@playwright/test').Page) => page.evaluate(() => new Promise<number>((resolve) => {
  const open = indexedDB.open('fx-bill-locker', 1);
  open.onerror = () => resolve(0);
  open.onupgradeneeded = () => { open.result.createObjectStore('photos', { keyPath: 'id' }); };
  open.onsuccess = () => {
    const db = open.result;
    const req = db.transaction('photos', 'readonly').objectStore('photos').count();
    req.onsuccess = () => { db.close(); resolve(req.result); };
    req.onerror = () => { db.close(); resolve(0); };
  };
}));

test('a bill and its photo stay across a reload, are found by shop, and go when deleted', async ({ page }) => {
  await page.goto('/tools/locker');
  await expect(page.getByRole('heading', { name: /Every bill and warranty/ })).toBeVisible();
  await expect(page.getByText('Nothing in the locker yet')).toBeVisible();

  await page.getByRole('button', { name: 'Add your first bill' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a bill' });
  await expect(dialog).toBeVisible();

  await dialog.locator('input[type=file][multiple]').setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: PNG });
  await expect(dialog.getByText('Photo kept on this device.')).toBeVisible();

  await dialog.getByLabel('What did you buy?').fill('Samsung TV');
  await dialog.getByLabel('Shop').fill('Croma');
  await dialog.getByRole('button', { name: '2 years' }).click();
  await expect(dialog.getByText(/^Covered up to \d+ \w+ \d{4}\.$/)).toBeVisible();
  await dialog.getByRole('button', { name: 'Add to locker' }).click();

  const row = page.getByRole('button', { name: /^Samsung TV, Croma\./ });
  await expect(row).toBeVisible();
  await expect(row).toContainText('Ends in');
  expect(await photoCount(page)).toBe(1);

  await page.reload();
  await expect(page.getByRole('button', { name: /^Samsung TV, Croma\./ })).toBeVisible();
  expect(await photoCount(page)).toBe(1);

  await page.getByLabel('Search your bills').fill('croma');
  await expect(page.getByRole('button', { name: /^Samsung TV/ })).toBeVisible();
  await page.getByLabel('Search your bills').fill('fridge');
  await expect(page.getByText('No bill matches “fridge”.')).toBeVisible();
  await page.getByLabel('Search your bills').fill('');

  await page.getByRole('button', { name: /^Samsung TV/ }).click();
  const edit = page.getByRole('dialog', { name: 'Edit bill' });
  await edit.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog', { name: 'Delete Samsung TV?' }).getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText('Nothing in the locker yet')).toBeVisible();
  await expect.poll(() => photoCount(page)).toBe(0);
});

test('a bill needs a product, and closing the sheet drops an unsaved photo', async ({ page }) => {
  await page.goto('/tools/locker');
  await page.getByRole('button', { name: 'Add a bill' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add a bill' });
  await dialog.locator('input[type=file][multiple]').setInputFiles({ name: 'bill.png', mimeType: 'image/png', buffer: PNG });
  await expect(dialog.getByText('Photo kept on this device.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Add to locker' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Say what you bought.');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect.poll(() => photoCount(page)).toBe(0);
});
