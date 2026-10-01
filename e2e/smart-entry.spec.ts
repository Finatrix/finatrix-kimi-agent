import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('category automation is reviewable, editable and persisted', async ({ page }) => {
  await page.goto('/tools/expenses');
  await page.getByRole('button', { name: 'Add an expense' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Description', { exact: true }).fill('Uber Eats');
  await expect(dialog.getByRole('button', { name: /^Eating out \(/i })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('status')).toContainText('Auto-selected');
  await dialog.getByRole('button', { name: /^Groceries \(/ }).click();
  await dialog.getByLabel('Merchant', { exact: true }).fill('Spotify');
  await expect(dialog.getByRole('button', { name: /^Groceries \(/ })).toHaveAttribute('aria-pressed', 'true');
  await dialog.getByLabel(/^Amount/).fill('25');
  const accessibility = await new AxeBuilder({ page }).include('.fx-tx-card').withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(accessibility.violations).toEqual([]);
  await dialog.getByRole('button', { name: 'Add transaction' }).click();
  await page.reload();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fx_expenses') || '[]'));
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ category: 'groceries', amount: 25, note: 'Uber Eats' });
  await page.getByRole('button', { name: 'Add an expense' }).click();
  await dialog.getByLabel('Description', { exact: true }).fill('Uber Eats');
  await expect(dialog.getByRole('button', { name: /^Groceries \(/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('status')).toContainText('from your saved history');
});

test('Careers direct links show the 2027 lock on desktop and mobile', async ({ page }) => {
  await page.goto('/careers/billing');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('coming in 2027');
  await expect(page.getByRole('link', { name: 'Explore free money tools' })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ width: innerWidth, content: document.documentElement.scrollWidth }));
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.width);
  const accessibility = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(accessibility.violations).toEqual([]);
});
