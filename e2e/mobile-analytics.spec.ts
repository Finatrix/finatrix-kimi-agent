import { test, expect, devices, type Page } from '@playwright/test';

/**
 * Mobile analytics must never force a horizontal page scroll, even with a dense
 * history (many categories, several months, long labels, payment methods). This
 * guards the responsive stacking of the Analytics tab — category comparison,
 * payment breakdown, 12-month trend, and the daily heatmap — at 375px.
 */
test.use({ ...devices['Pixel 7'] });

const SEED = () => {
  const now = new Date();
  const mk = (back: number) => {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };
  const cats = ['rent', 'groceries', 'eating_out', 'shopping', 'transport', 'entertainment', 'subscriptions'];
  const pays = ['UPI', 'Credit card', 'Cash', 'Bank transfer'];
  const items: unknown[] = [];
  for (let m = 0; m < 3; m++) {
    cats.forEach((c, i) => {
      items.push({
        id: `${c}-${m}`, amount: 1000 + i * 250 + m * 100, category: c,
        date: `${mk(m)}-1${(i % 9)}`, merchant: `Merchant With A Fairly Long Name ${i}`,
        paymentMethod: pays[i % pays.length],
      });
    });
  }
  localStorage.setItem('fx_expenses', JSON.stringify(items));
};

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth
  );
  expect(overflow, 'page must not scroll horizontally on mobile').toBeLessThanOrEqual(1);
}

test('Analytics tab does not overflow horizontally on mobile with dense data', async ({ page }) => {
  await page.goto('/tools/expenses');
  await page.evaluate(SEED);
  await page.reload();

  await page.getByRole('tab', { name: 'Analytics' }).click();
  await expect(page.getByText(/Avg per month/i)).toBeVisible();
  await noHorizontalScroll(page);

  // Scroll through the whole tab; nothing should push the page wider.
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await noHorizontalScroll(page);
});

test('Overview, Recurring and History tabs also stay within the viewport width', async ({ page }) => {
  await page.goto('/tools/expenses');
  await page.evaluate(SEED);
  await page.reload();
  await noHorizontalScroll(page);
  await page.getByRole('tab', { name: 'Recurring' }).click();
  await noHorizontalScroll(page);
  // History was the fourth tab added to a bar sized for three: the bar itself
  // is what would push the page wide, on every tab at once.
  await page.getByRole('tab', { name: 'History' }).click();
  await noHorizontalScroll(page);
});
