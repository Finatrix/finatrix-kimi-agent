import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Account entry routes are intentionally absent from the indexable-page crawl.
// They still need the same accessibility checks as the public marketing pages.
for (const theme of ['light', 'dark'] as const) {
  for (const path of ['/login', '/signup', '/reset-password']) {
    test(`${path} is accessible in ${theme}`, async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: theme });
      await page.addInitScript(t => localStorage.setItem('fx_theme', t), theme);
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(path, { waitUntil: 'networkidle' });
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      const result = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      expect(result.violations.map(v => ({ rule: v.id, targets: v.nodes.map(n => n.target) }))).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}

test('a malformed section link does not crash the page', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/pricing#%E0%A4%A', { waitUntil: 'networkidle' });
  await expect(page.getByRole('heading', { name: 'Simple, honest pricing' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('an inherited property name cannot be rendered as a tool', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/tools/__proto__', { waitUntil: 'networkidle' });
  await expect(page).toHaveURL(/\/tools\/dashboard$/);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});
