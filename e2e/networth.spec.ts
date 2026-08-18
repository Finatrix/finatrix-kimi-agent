import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Net Worth — real-browser lifecycle and a rule-engine pass over the POPULATED
 * page.
 *
 * The a11y floor spec visits this route empty, which exercises none of what the
 * tool actually renders: a balance field per account, a delete confirmation, a
 * trend with its table equivalent. Those are scanned here, with data.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

function month(back: number): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

async function gotoFresh(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tools/networth');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('What you own');
}

/**
 * Scoped to the balance sheet: the tool's educational footer carries a worked
 * example that uses the same account names, and an unscoped text query finds
 * those too.
 */
function assets(page: Page) {
  return page.getByRole('region', { name: 'Assets' });
}

async function seed(page: Page) {
  await page.goto('/tools/networth');
  await page.evaluate(
    ([prev, cur]) => {
      localStorage.setItem('fx_networth', JSON.stringify([
        { id: 'cash', name: 'Salary account', kind: 'asset', category: 'cash', balances: { [prev]: 100000, [cur]: 140000 } },
        { id: 'mf', name: 'Equity MFs', kind: 'asset', category: 'equity', balances: { [prev]: 600000 } },
        { id: 'loan', name: 'Home loan', kind: 'liability', category: 'home_loan', balances: { [prev]: 3300000, [cur]: 3200000 } },
      ]));
    },
    [month(1), month(0)],
  );
  await page.reload();
  await expect(assets(page).getByText('Salary account', { exact: true })).toBeVisible();
}

test('adds an account through the form and keeps it across a reload', async ({ page }) => {
  await gotoFresh(page);
  await page.getByRole('button', { name: /add your first account/i }).click();
  await page.getByLabel('What is it?').fill('HDFC savings');
  await page.getByLabel(/^Balance in /).fill('140000');
  await page.getByRole('button', { name: 'Add account' }).click();

  await expect(assets(page).getByText('HDFC savings', { exact: true })).toBeVisible();
  await page.reload();
  await expect(assets(page).getByText('HDFC savings', { exact: true })).toBeVisible();

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fx_networth') || '[]'));
  expect(stored).toHaveLength(1);
  expect(stored[0].name).toBe('HDFC savings');
});

test('records a new balance for the month and keeps the history behind it', async ({ page }) => {
  await seed(page);
  const field = page.getByLabel(/^Equity MFs balance for /);
  await field.fill('650000');
  await field.blur();

  const account = await page.evaluate(
    () => JSON.parse(localStorage.getItem('fx_networth') || '[]').find((a: { id: string }) => a.id === 'mf'),
  );
  expect(account.balances[month(0)]).toBe(650000);
  expect(account.balances[month(1)]).toBe(600000);
});

test('confirms before deleting an account', async ({ page }) => {
  await seed(page);
  await page.getByRole('button', { name: 'Remove Equity MFs' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(assets(page).getByText('Equity MFs', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Remove Equity MFs' }).click();
  await page.getByRole('button', { name: 'Delete Equity MFs' }).click();
  await expect(assets(page).getByText('Equity MFs', { exact: true })).toHaveCount(0);
});

test('the populated page has no WCAG 2.2 AA violations', async ({ page }) => {
  await seed(page);
  // Open the trend's table equivalent so it is in the DOM for the scan.
  await page.getByText('View as a table').click();
  await expect(page.getByRole('table', { name: /net worth by month/i })).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const described = results.violations
    .map((v) => `[${v.impact}] ${v.id}: ${v.help}\n    at ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
    .join('\n');
  expect(results.violations.length, `\n${described}\n`).toBe(0);
});
