import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * ⌘K in a real browser.
 *
 * The unit suite proves the registry, the ranking and the ARIA wiring. Three
 * things only a browser can prove, and all three are the ones that would make
 * the feature feel broken: that the shortcut actually reaches the app (rather
 * than the browser's own Ctrl+K), that a rule engine finds the open dialog
 * accessible, and that a spend typed into the palette survives the navigation
 * and lands in the ledger.
 */

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function openWorkspace(page: Page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/tools/budget');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('button', { name: 'Search tools, guides and actions' })).toBeVisible();
}

/**
 * Scoped to the dialog on purpose: the app bar's currency <select> contributes
 * its own `option` elements to the page, and an unscoped query finds those.
 */
function palette(page: Page) {
  return page.getByRole('dialog', { name: 'Command palette' });
}

async function openPalette(page: Page) {
  await page.keyboard.press('ControlOrMeta+k');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
  return page.getByRole('combobox', { name: 'Search tools, guides and actions' });
}

test('opens on the keyboard shortcut and navigates to a tool', async ({ page }) => {
  await openWorkspace(page);
  const input = await openPalette(page);
  await expect(input).toBeFocused();

  await input.fill('lifemap');
  await expect(palette(page).getByRole('option').first()).toContainText('LifeMap');
  await page.keyboard.press('Enter');

  await expect(page).toHaveURL(/\/tools\/lifemap$/);
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0);
});

test('the open palette has no WCAG 2.2 AA violations', async ({ page }) => {
  await openWorkspace(page);
  const input = await openPalette(page);
  await input.fill('sip');
  await expect(palette(page).getByRole('option').first()).toBeVisible();

  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const described = results.violations
    .map((v) => `[${v.impact}] ${v.id}: ${v.help}\n    at ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
    .join('\n');
  expect(results.violations.length, `\n${described}\n`).toBe(0);
});

test('carries a typed spend into the tracker, where the user confirms it', async ({ page }) => {
  await openWorkspace(page);
  const input = await openPalette(page);

  await input.fill('340 lunch upi');
  await expect(palette(page).getByRole('option').first()).toContainText('Log spend: 340 lunch upi');
  await page.keyboard.press('Enter');

  // The line is typed into the tracker's own quick-add field — not saved yet.
  const quickAdd = page.getByLabel('Quick add');
  await expect(quickAdd).toHaveValue('340 lunch upi');
  await expect(quickAdd).toBeFocused();
  expect(await page.evaluate(() => localStorage.getItem('fx_expenses'))).toBeNull();

  // Enter commits it through the ordinary path, and it survives a reload.
  await page.keyboard.press('Enter');
  await page.reload();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fx_expenses') || '[]'));
  expect(stored).toHaveLength(1);
  expect(stored[0]).toMatchObject({ amount: 340, note: 'lunch', paymentMethod: 'UPI' });
});

test('closes on Escape and hands focus back to the control that opened it', async ({ page }) => {
  await openWorkspace(page);
  const trigger = page.getByRole('button', { name: 'Search tools, guides and actions' });
  await trigger.click();
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
