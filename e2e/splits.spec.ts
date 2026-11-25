import { test, expect, type Page } from '@playwright/test';

/**
 * Splits with people not on FinatriX (build step 2.5), in a shipped production
 * build. Guest-only, so no account is touched; each test starts from a clean
 * localStorage. Follows the worked example in docs/SPLITS.md: ₹2,400 split four
 * ways puts ₹600 in your tracker, and each friend owes you ₹600.
 */

async function gotoFresh(page: Page) {
  await page.goto('/tools/splits');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Split it. Settle it.' })).toBeVisible();
}

/** On phones the formula keys sit over the sheet's footer while an amount field has focus (as in networth.spec.ts). */
async function footer(page: Page, name: string) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.getByRole('dialog').getByRole('button', { name, exact: true }).click();
}

async function addPerson(page: Page, name: string) {
  const field = page.getByRole('dialog').getByLabel(/someone new/);
  await field.fill(name);
  await field.press('Enter');
  await expect(page.getByRole('dialog').getByRole('button', { name, pressed: true })).toBeVisible();
}

test('split a bill, lend money, remind and settle up', async ({ page }) => {
  await gotoFresh(page);
  await expect(page.getByTestId('splits-empty')).toBeVisible();

  await page.getByRole('button', { name: 'Split a bill' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Total amount (INR)').fill('2400');
  await dialog.getByLabel('What was it for?').fill('Saturday’s dinner');
  for (const name of ['Asha', 'Ben', 'Chetan']) await addPerson(page, name);
  await expect(dialog.getByTestId('split-fields')).toContainText('₹600.00');
  await footer(page, 'Save');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const people = page.getByTestId('splits-people');
  for (const name of ['Asha', 'Ben', 'Chetan']) {
    await expect(people.getByTestId('splits-person').filter({ hasText: name })).toContainText('Owes you ₹600.00');
  }
  await expect(page.getByTestId('splits-totals')).toContainText('₹1,800.00');

  // Only your share reached the Expense Tracker, marked Split.
  const copies = await page.evaluate(() => (JSON.parse(localStorage.getItem('fx_expenses') || '[]') as Array<{ id: string; amount: number; tags?: string[] }>)
    .filter((e) => e.id.startsWith('tx_split_')));
  expect(copies).toHaveLength(1);
  expect(copies[0]).toMatchObject({ amount: 600, tags: ['Split'] });

  // The reminder is a WhatsApp link the user sends.
  const remind = page.getByRole('link', { name: 'Remind Asha on WhatsApp' });
  await expect(remind).toHaveAttribute('href', /^https:\/\/wa\.me\/\?text=Hi%20Asha%2C%20a%20quick%20reminder%3A%20you%20owe%20me%20%E2%82%B9600\.00%20for%20Saturday/);

  // Lending is tracked apart from spending.
  await page.getByRole('button', { name: 'Lent or borrowed' }).click();
  await dialog.getByLabel('With').selectOption({ label: 'Ben' });
  await dialog.getByLabel('Amount (INR)').fill('1000');
  await footer(page, 'Save');
  await expect(people.getByTestId('splits-person').filter({ hasText: 'Ben' })).toContainText('Owes you ₹1,600.00');
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('fx_expenses') || '[]') as unknown[]).length)).toBe(1);

  // Mark as settled: the full amount is filled in.
  await page.getByRole('button', { name: 'Mark as settled with Asha' }).click();
  await expect(dialog.getByLabel('Amount (INR)')).toHaveValue('600');
  await footer(page, 'Mark as settled');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(people.getByTestId('splits-person').filter({ hasText: 'Asha' })).toContainText('Settled up');
  await expect(page.getByTestId('splits-activity')).toContainText('Asha paid you ₹600.00');
});

test('deleting a bill takes your share out of the tracker', async ({ page }) => {
  await gotoFresh(page);
  await page.getByRole('button', { name: 'Split a bill' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Total amount (INR)').fill('100');
  await dialog.getByLabel('What was it for?').fill('Chai');
  await addPerson(page, 'Asha');
  await addPerson(page, 'Ben');
  await footer(page, 'Save');
  // ₹100 three ways: the spare paisa is yours.
  await expect(page.getByTestId('splits-activity')).toContainText('your share ₹33.34');

  await page.getByTestId('splits-activity').getByRole('button', { name: /Chai/ }).click();
  await footer(page, 'Delete');
  await footer(page, 'Delete');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('splits-person').filter({ hasText: 'Asha' })).toContainText('Settled up');
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem('fx_expenses') || '[]') as Array<{ id: string }>)
    .filter((e) => e.id.startsWith('tx_split_')).length)).toBe(0);
});
