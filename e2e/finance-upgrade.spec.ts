import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    // Seed once, so reloads exercise persistence rather than replacing data.
    if (localStorage.getItem('upgrade-seeded')) return;
    localStorage.setItem('upgrade-seeded', '1');
    localStorage.setItem('fx_currency', 'INR');
    localStorage.setItem('fx_market', 'IN');
    const d = new Date();
    const ym = (offset: number) => { const m = new Date(d.getFullYear(), d.getMonth() + offset, 1); return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`; };
    localStorage.setItem('fx_bb_data', JSON.stringify({ [ym(0)]: { income: '50000', n: '50', w: '30', s: '20', vals: { rent: 10000 } }, [ym(-1)]: { income: '50000', n: '50', w: '30', s: '20', vals: {} } }));
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: 'a', category: 'subscriptions', merchant: 'Example subscription', date: `${ym(-2)}-05`, amount: 500 },
      { id: 'b', category: 'subscriptions', merchant: 'Example subscription', date: `${ym(-1)}-05`, amount: 500 },
      { id: 'c', category: 'stocks', merchant: 'Broker', date: `${ym(-1)}-06`, amount: 5000 },
    ]));
  });
});

test('monthly review, recurring decisions and emergency plan persist', async ({ page }) => {
  await page.goto('/tools/dashboard');
  await expect(page.getByRole('heading', { name: 'Your money, this month.' })).toBeVisible();
  const review = page.getByRole('region', { name: 'Monthly financial review' });
  await expect(review.getByText('₹500', { exact: true })).toBeVisible();
  await expect(review.getByText('₹5,000', { exact: true })).toBeVisible();
  await page.getByLabel('One change for next month').fill('Check unused subscriptions.');
  await page.getByRole('button', { name: 'Mark month reviewed', exact: true }).click();
  await page.getByRole('button', { name: 'Confirm Example subscription', exact: true }).click();
  await page.getByLabel('Monthly essentials (INR)', { exact: true }).fill('20000');
  await page.getByLabel('Months of cover', { exact: true }).fill('6');
  await page.getByLabel('Accessible savings already set aside (INR)', { exact: true }).fill('20000');
  await page.getByLabel('Monthly contribution (INR)', { exact: true }).fill('10000');
  await expect(page.getByText('At this contribution, the remaining target takes 10 months.')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('One change for next month')).toHaveValue('Check unused subscriptions.');
  await expect(page.getByRole('button', { name: 'Mark reviewed again' })).toBeVisible();
  await expect(page.getByText(/Confirmed by you/)).toBeVisible();
  await expect(page.getByLabel('Monthly contribution (INR)', { exact: true })).toHaveValue('10000');
  await page.getByRole('button', { name: 'Dismiss Example subscription', exact: true }).click();
  await page.getByRole('button', { name: 'Show dismissed' }).click();
  await page.getByRole('button', { name: 'Restore Example subscription', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Confirm Example subscription', exact: true })).toBeVisible();
});

test('goal alternatives never overwrite the saved baseline', async ({ page }) => {
  await page.goto('/tools/goals');
  await page.getByLabel('Goal name', { exact: true }).fill('Home');
  await page.locator('#gp-target').fill('1000000');
  await page.locator('#gp-years').fill('10');
  await page.getByRole('button', { name: 'Show me the path' }).click();
  await expect(page.getByRole('heading', { name: 'Compare the trade-offs' })).toBeVisible();
  const original = await page.evaluate(() => localStorage.getItem('fx_goals'));
  await page.getByLabel('Alternative deadline (whole years)', { exact: true }).fill('15');
  await page.getByLabel('Alternative target in today’s money', { exact: true }).fill('800000');
  await page.getByLabel('Available each month after other commitments (optional)', { exact: true }).fill('5000');
  await expect(page.getByRole('columnheader', { name: 'Alternative · 15 years' })).toBeVisible();
  await expect(page.getByText('What this leaves for other priorities')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('fx_goals'))).toBe(original);
  await page.getByLabel('Alternative deadline (whole years)', { exact: true }).fill('0');
  await expect(page.getByText(/Enter a target of at least/)).toBeVisible();
});

test('setup help opens directly and answers guests without an AI request', async ({ page }) => {
  const aiCalls: string[] = [];
  page.on('request', req => { if (req.url().includes('/functions/v1/') && /ai|openrouter/.test(req.url())) aiCalls.push(req.url()); });
  await page.goto('/tools/dashboard?help=setup');
  const dialog = page.getByRole('dialog', { name: 'FinatriX AI' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'How do I get started?', exact: true }).click();
  await expect(dialog.getByText(/Start with Set up your month/)).toBeVisible();
  expect(aiCalls).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('privacy preference survives reload and clears chat separately', async ({ page }) => {
  await page.goto('/tools/settings');
  await page.evaluate(() => localStorage.setItem('fx_ai_chat_previous-user', JSON.stringify([{ id: '1', role: 'user', text: 'Private message', at: new Date().toISOString() }])));
  await page.getByRole('checkbox', { name: 'Allow optional usage analytics on this device' }).uncheck();
  await page.reload();
  await expect(page.getByRole('checkbox', { name: 'Allow optional usage analytics on this device' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Clear chat history…', exact: true }).click();
  await page.getByRole('button', { name: 'Delete saved chat history', exact: true }).click();
  expect(await page.evaluate(() => localStorage.getItem('fx_ai_chat_previous-user'))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem('fx_bb_data'))).not.toBeNull();
});

test('repeating onboarding preserves the existing month', async ({ page }) => {
  await page.goto('/welcome');
  const before = await page.evaluate(() => localStorage.getItem('fx_bb_data'));
  await page.getByRole('textbox', { name: 'Monthly income (after tax)' }).fill('90000');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect(page.getByText(/Your existing monthly budget was kept/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('fx_bb_data'))).toBe(before);
  expect(await page.evaluate(() => localStorage.getItem('fx_investmatch'))).toBeNull();
});

for (const route of ['/', '/tools/dashboard', '/tools/settings', '/welcome']) {
  test(`new surfaces meet automated accessibility checks: ${route}`, async ({ page }) => {
    // Match the existing public audit: measure settled colours, not a frame
    // part-way through the page's opacity transition.
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(route);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
    expect(result.violations.map(v => ({ rule: v.id, nodes: v.nodes.map(n => ({ target: n.target, reason: n.failureSummary })) }))).toEqual([]);
  });
}
