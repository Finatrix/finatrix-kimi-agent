import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    if (localStorage.getItem('sitewide-test-seeded')) return;
    const d = new Date();
    const cm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const past = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const pm = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}`;
    localStorage.setItem('fx_market', 'IN'); localStorage.setItem('fx_currency', 'INR');
    localStorage.setItem('fx_bb_data', JSON.stringify({ [cm]: { income: '85000', n: '50', w: '30', s: '20', vals: { rent: 1000, groceries: 9000, stocks: 12000 } } }));
    localStorage.setItem('fx_expenses', JSON.stringify([
      { id: 'old', amount: 1200, category: 'rent', date: `${pm}-01`, merchant: 'Rent' },
      { id: 'one', amount: 1200, category: 'rent', date: `${cm}-01`, merchant: 'Rent' },
      { id: 'two', amount: 1200, category: 'rent', date: `${cm}-01`, merchant: 'Rent' },
    ]));
    localStorage.setItem('fx_networth', JSON.stringify([{ id: 'cash', name: 'Savings', kind: 'asset', category: 'cash', currency: 'INR', balances: { [pm]: 5000 } }]));
    localStorage.setItem('fx_investmatch', JSON.stringify({ a: { age: 30, income: 85000, monthly: 10000, risk: 'moderate', horizon: '5-10', goal: 'wealth' }, market: 'IN', currency: 'INR' }));
    localStorage.setItem('fx_lifemap', JSON.stringify({ 'lm-age': '30', 'lm-income': '85000', 'lm-expenses': '40000', 'lm-savings': '5000', 'lm-emergency': '2000', 'lm-invest': '10000' }));
    localStorage.setItem('sitewide-test-seeded', 'yes');
  });
});

for (const [route, heading] of [
  ['budget', 'Smart budget review'], ['expenses', 'Smart record review'],
  ['networth', 'Smart balance review'], ['reports', 'Smart report preparation'],
  ['calendar', 'Plan around your busiest money days'], ['dashboard', 'Your next useful step'],
  ['settings', 'Automatic data checks'], ['reference', 'Find and check a source'],
]) test(`${route} assistance loads accessibly and fits a narrow screen`, async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/tools/${route}`);
  await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 800 });
  // Responsive charts resize through ResizeObserver on the next frame. Wait
  // for the resulting layout rather than sampling the previous canvas width.
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  const a11y = await new AxeBuilder({ page }).include('main').withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  expect(a11y.violations).toEqual([]);
  expect(errors).toEqual([]);
});

test('budget reviews an observed gap, applies it and supports undo', async ({ page }) => {
  await page.goto('/tools/budget');
  const review = page.getByRole('region', { name: 'Smart budget review', exact: true });
  await review.getByText(/Review spending gaps/).click();
  await review.getByRole('button', { name: 'Preview matching logged amounts' }).click();
  await expect(page.getByRole('region', { name: 'Budget change preview' })).toBeVisible();
  await review.getByRole('button', { name: 'Apply reviewed allocations' }).click();
  const rent = () => page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('fx_bb_data')!)).map((value) => (value as { vals: { rent: number } }).vals.rent)[0]);
  expect(await rent()).toBe(2400);
  await review.getByRole('button', { name: 'Undo last smart allocation' }).click();
  expect(await rent()).toBe(1000);
});

test('calendar remembers the chosen contribution day and exports only filtered events', async ({ page }) => {
  await page.goto('/tools/calendar');
  await page.getByLabel('Preferred monthly investing day').selectOption('25');
  await page.reload();
  await expect(page.getByLabel('Preferred monthly investing day')).toHaveValue('25');
  await page.getByLabel('Event type', { exact: true }).selectOption('invest');
  await expect(page.locator('.fx-smart-assist [role="status"]')).toContainText('1 of');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export visible events to calendar' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/finatrix-calendar-.*\.ics/);
});

test('investing reuses reviewed answers and compares contributions without rewriting them', async ({ page }) => {
  await page.goto('/tools/investmatch');
  await page.getByRole('button', { name: 'Review saved answers' }).click();
  await page.getByRole('button', { name: 'Use these answers' }).click();
  await expect(page.getByRole('heading', { name: 'Explore what changes the outcome' })).toBeVisible();
  await page.getByRole('button', { name: /20% more/ }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fx_investmatch')!).a.monthly)).toBe(10000);
});

test('cash and peer comparisons expose interactive trade-offs', async ({ page }) => {
  await page.goto('/tools/parksmart');
  await page.getByRole('button', { name: 'Compare the options', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Make the trade-offs visible' })).toBeVisible();
  await page.getByLabel('Explore another holding period').selectOption('6-12');
  await page.goto('/tools/peercompare');
  await page.getByRole('button', { name: 'Show the comparison' }).click();
  await expect(page.getByRole('heading', { name: 'Understand the comparison' })).toBeVisible();
  await page.getByLabel('Focus on a measure').selectOption({ index: 1 });
});

test('goals finds fitting deadlines and LifeMap pins a scenario', async ({ page }) => {
  await page.goto('/tools/goals');
  await page.getByRole('button', { name: 'Show me the path' }).click();
  await page.getByLabel('Monthly contribution limit', { exact: true }).fill('50000');
  await expect(page.getByText(/Earliest modelled fit/).first()).toBeVisible();
  await page.getByText('Check the full 10% step-up commitment').click();
  await expect(page.getByRole('region', { name: 'Yearly step-up contribution schedule' })).toBeVisible();
  await page.goto('/tools/lifemap');
  await page.getByRole('button', { name: /Launch my LifeMap/ }).click();
  await page.getByRole('button', { name: 'Pin this scenario for comparison' }).click();
  await expect(page.getByText(/Pinned model score/)).toBeVisible();
  await page.getByLabel('Find the first modelled age for a wealth target').fill('100000');
  await expect(page.getByText(/First reaches/)).toBeVisible();
});
