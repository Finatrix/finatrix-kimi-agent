import { test, expect, type Page } from '@playwright/test';

/**
 * Expense Tracker — real-browser lifecycle.
 *
 * Covers the exact regression that started this work (a visible, usable submit
 * action) plus the full save → persist-across-reload → edit → delete → undo
 * journey, in a shipped production build. Guest/local-only, so no account is
 * touched; each test starts from a clean localStorage.
 */

async function gotoFresh(page: Page) {
  await page.goto('/tools/expenses');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: /Your money, tracked and understood/i })).toBeVisible();
}

/** Open the add-transaction modal via the transactions list "+ Add" / empty CTA. */
async function openAddModal(page: Page) {
  const add = page.getByRole('button', { name: '+ Add' });
  const emptyCta = page.getByRole('button', { name: /Add your first transaction/i });
  if (await add.isVisible().catch(() => false)) await add.click();
  else await emptyCta.click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

async function addExpense(page: Page, amount: string, category: RegExp) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Amount/).fill(amount);
  await dialog.getByRole('button', { name: category }).click();
  const submit = dialog.getByRole('button', { name: 'Add transaction' });
  await expect(submit).toBeVisible();
  await submit.click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('shows a visible submit and saves a transaction that survives reload', async ({ page }) => {
  await gotoFresh(page);
  await openAddModal(page);
  await addExpense(page, '249.99', /Groceries/);

  // Reflected in the list + persisted.
  const txCard = page.locator('.card', { hasText: 'Transactions' });
  await expect(txCard.getByText('Groceries').first()).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fx_expenses') || '[]'));
  expect(stored).toHaveLength(1);
  expect(stored[0].amount).toBeCloseTo(249.99);

  // Hard reload → still there and still totalled.
  await page.reload();
  await expect(page.locator('.card', { hasText: 'Transactions' }).getByText('Groceries').first()).toBeVisible();
  const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem('fx_expenses') || '[]'));
  expect(afterReload).toHaveLength(1);
});

test('validates an empty amount inline without saving', async ({ page }) => {
  await gotoFresh(page);
  await openAddModal(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Add transaction' }).click();
  await expect(dialog).toBeVisible(); // stays open
  await expect(dialog.getByRole('alert')).toContainText(/amount greater than 0/i);
  const stored = await page.evaluate(() => localStorage.getItem('fx_expenses'));
  expect(stored).toBeNull();
});

test('edits a transaction in place, then deletes with confirm + undo', async ({ page }) => {
  await gotoFresh(page);
  await openAddModal(page);
  await addExpense(page, '500', /Rent/);

  const txCard = page.locator('.card', { hasText: 'Transactions' });

  // Edit 500 → 750.
  // The row-main button (label includes the amount) opens the edit modal on
  // both desktop and mobile; the compact row-action button is hidden < 560px.
  await txCard.getByRole('button', { name: /^Edit Rent, ₹/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/^Amount/).fill('750');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fx_expenses') || '[]'))).toHaveLength(1);

  // Delete via the modal's confirmation layer.
  // The row-main button (label includes the amount) opens the edit modal on
  // both desktop and mobile; the compact row-action button is hidden < 560px.
  await txCard.getByRole('button', { name: /^Edit Rent, ₹/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
  const confirm = page.getByRole('alertdialog');
  await expect(confirm.getByText('Delete this transaction?')).toBeVisible();
  await confirm.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fx_expenses') || '[]'))).toHaveLength(0);

  // Undo restores it.
  await page.getByRole('button', { name: /^Undo/ }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fx_expenses') || '[]'))).toHaveLength(1);
});

test('add-transaction submit is reachable on a mobile viewport', async ({ page }) => {
  await gotoFresh(page);
  await openAddModal(page);
  const submit = page.getByRole('dialog').getByRole('button', { name: 'Add transaction' });
  await expect(submit).toBeVisible();
  await expect(submit).toBeInViewport();
});
