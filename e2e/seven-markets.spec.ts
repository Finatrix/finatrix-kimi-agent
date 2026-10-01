import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { TOOL_IDS } from '../src/shared/routes';

const markets = [
  { id: 'AU', name: 'Australia', currency: 'AUD' },
  { id: 'SG', name: 'Singapore', currency: 'SGD' },
  { id: 'CN', name: 'Mainland China', currency: 'CNY' },
];
for (const market of markets) test.describe(market.name, () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(({ id, currency }) => {
      localStorage.setItem('fx_market', id);
      localStorage.setItem('fx_currency', currency);
    }, market);
  });
  for (const tool of TOOL_IDS) test(`${tool} loads with local configuration`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`/tools/${tool}`);
    await expect(page.locator('.fx-page h1, #lm-setup h1, main h1').first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Something went wrong');
    expect(errors).toEqual([]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
    expect(overflow).toBe(false);
  });
  test('LifeMap results exclude Indian product and fixed-price cards', async ({ page }) => {
    await page.goto('/tools/lifemap');
    await page.locator('#lm-income').fill('6000');
    await page.locator('#lm-expenses').fill('3000');
    for (const field of ['savings', 'emergency', 'invest']) await page.locator(`#lm-${field}`).fill('0');
    await page.getByRole('button', { name: /Launch/i }).click();
    await expect(page.locator('#lm-app')).toBeVisible();
    await expect(page.locator('#lm-app')).not.toContainText(/NPS|PPF|ELSS|80C|Nifty|SEBI|₹/);
    await expect(page.locator('#lm-app')).toContainText('Modeled effect');
  });
  test('cash comparison requires rates and produces a local-currency result', async ({ page }) => {
    await page.goto('/tools/parksmart');
    await page.getByRole('button', { name: 'Compare the options', exact: true }).click();
    await expect(page.getByText(/Enter both annual net rates/)).toBeVisible();
    await page.locator('#ps-amount').fill('1000');
    await page.locator('#ps-duration').selectOption('6-12');
    await page.locator('#ps-quote-0').fill('3');
    await page.locator('#ps-quote-1').fill('2');
    await page.getByRole('button', { name: 'Compare the options', exact: true }).click();
    await expect(page.getByText('Highest modeled earnings from your inputs')).toBeVisible();
    await expect(page.getByLabel('Deposit protection')).toBeVisible();
    await page.getByText('How this is calculated', { exact: true }).first().click();
    await expect(page.locator('.fx-method-body')).not.toContainText('80TTA');
    await page.locator('.result-card-anim, .result-hero-anim').evaluateAll(async (elements) => {
      await Promise.all(elements.flatMap((el) => el.getAnimations()).map((a) => a.finished.catch(() => undefined)));
    });
    expect((await new AxeBuilder({ page }).include('.fx-page').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/seven-${market.id}-cash-${test.info().project.name}.png`, fullPage: true });
  });
  test('published comparison requires a matching basis and has no rank', async ({ page }) => {
    await page.goto('/tools/peercompare');
    await page.getByLabel(/Your matching figure/).fill('1000');
    await page.getByRole('button', { name: 'Compare matching figures' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check();
    await page.getByRole('button', { name: 'Compare matching figures' }).click();
    await expect(page.getByRole('status')).toContainText('below this dated median');
    await expect(page.getByText('percentile', { exact: true })).toHaveCount(0);
    await expect.poll(async () => page.locator('#fx-route-schema').textContent()).toContain('Can this tell me my percentile?');
    await expect(page.locator('#fx-route-schema')).not.toContainText('Indian cities');
    await page.locator('.result-card-anim, .result-hero-anim').evaluateAll(async (elements) => {
      await Promise.all(elements.flatMap((el) => el.getAnimations()).map((a) => a.finished.catch(() => undefined)));
    });
    expect((await new AxeBuilder({ page }).include('.fx-page').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `test-results/seven-${market.id}-peer-${test.info().project.name}.png`, fullPage: true });
    await page.locator('.fx-page > .card').first().screenshot({ path: `test-results/seven-${market.id}-reference-card-${test.info().project.name}.png` });
  });
});

test('all seven markets are selectable and persist through navigation', async ({ page }) => {
  await page.goto('/tools/settings');
  await expect(page.locator('#fx-set-market option')).toHaveCount(7);
  for (const market of markets) {
    await page.locator('#fx-set-market').selectOption(market.id);
    await expect(page.locator('#fx-set-market')).toHaveValue(market.id);
    // Currency remains a separate user choice; use the explicit local-currency action.
    await page.getByRole('button', { name: `Switch to ${market.currency}`, exact: true }).click();
    await expect(page.locator('#fx-set-cur')).toHaveValue(market.currency);
    await page.reload();
    await expect(page.locator('#fx-set-market')).toHaveValue(market.id);
    await page.goto('/tools/parksmart');
    await expect(page.locator('#ps-quote-0')).toHaveValue('');
    await expect(page.locator('h1')).toBeVisible();
    await page.goto('/tools/settings');
  }
});
