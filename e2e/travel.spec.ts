import { test, expect, type Page } from '@playwright/test';
import { BASELINE_RATES } from '../src/shared/fxFeed';

/**
 * Travel mode, stages 1 and 2 (build steps 1.2 and 2.1), and Hide amounts: set up a trip, log spends in the trip
 * currency, and read the summary, in a shipped production build. Guest-only,
 * so no account is touched; each test starts from a clean localStorage.
 *
 * Live rates come from the app's own Worker (`/api/fx/latest`), which
 * `vite preview` does not run, so the feed is stubbed with a table where 1 AED
 * is exactly ₹24.00 (88.14 ÷ 3.6725): the rate in the agreed worked example,
 * AED 120 at 24.0 with a 3.5% card fee = ₹2,980.80.
 */

// `page.route` does not see requests that pass through a service worker, so the
// worker is blocked here, as in import-resilience.spec.ts.
test.use({ serviceWorkers: 'block' });

function utcDay(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

async function gotoFresh(page: Page) {
  await page.route('**/api/fx/latest', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      base: 'USD', asOf: utcDay(), source: 'exchangerate-api', rates: { ...BASELINE_RATES, INR: 88.14 },
    }),
  }));
  await page.goto('/tools/expenses');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole('heading', { name: /Your money, tracked and understood/i })).toBeVisible();
  // The app checks for today's rates once on load; wait until they are saved.
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem('fx_fx_live'))).toBe(true);
}

/** Open the add sheet, pick a category, type an amount, and optionally a payment method. */
async function addSpend(
  page: Page,
  { category, amount, currency, payment }: { category: string; amount: string; currency: string; payment?: string },
) {
  await page.getByRole('button', { name: 'Add an expense' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: category }).click();
  const field = dialog.getByLabel(`Amount (${currency})`);
  await expect(field).toBeVisible();
  await field.fill(amount);
  if (payment) await dialog.getByLabel('Payment method').selectOption(payment);
  return dialog;
}

async function save(page: Page) {
  await page.getByRole('dialog').getByRole('button', { name: 'Add transaction' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test('sets up a trip, logs spends in its currency, and sums them up', async ({ page }) => {
  await gotoFresh(page);

  // Setup: the country fills in the currency, and the live rate is fixed for the trip.
  await page.getByRole('button', { name: 'Travel mode' }).click();
  const sheet = page.getByRole('dialog', { name: 'Travel mode' });
  await sheet.getByLabel('Country').selectOption({ label: 'United Arab Emirates (Dubai, Abu Dhabi)' });
  await expect(sheet.getByLabel('Currency')).toHaveValue('AED');
  await expect(sheet.getByText('1 AED = ₹24.00', { exact: true })).toBeVisible();
  await expect(sheet.getByRole('link', { name: 'Rates By Exchange Rate API' })).toBeVisible();
  await sheet.getByRole('button', { name: '1 week' }).click();
  await sheet.getByLabel('Your card’s forex fee, in %').fill('3.5');
  await expect(sheet.getByText(/card fee = ₹24\.84/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Start travel mode' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const strip = page.getByRole('button', { name: /United Arab Emirates · 7 days left/ });
  await expect(strip).toBeVisible();

  // Paid by card in AED: 120 × 24.00 × 1.035 = ₹2,980.80, previewed before saving.
  const card = await addSpend(page, { category: 'Eating Out (Wants)', amount: '120', currency: 'AED', payment: 'Credit card' });
  await expect(card.locator('#tx-amount-fx')).toContainText('₹2,980.80');
  await save(page);

  // Cash skips the card fee: 120 × 24.00 = ₹2,880.
  const cash = await addSpend(page, { category: 'Transport (Needs)', amount: '120', currency: 'AED', payment: 'Cash' });
  await expect(cash.locator('#tx-amount-fx')).toContainText('₹2,880.00');
  await save(page);

  // Rent stays in ₹ and is not trip spending.
  await addSpend(page, { category: 'Rent (Needs)', amount: '25000', currency: '₹' });
  await save(page);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fx_expenses') || '[]'));
  const by = Object.fromEntries(stored.map((e: { category: string }) => [e.category, e]));
  expect(by.eating_out).toMatchObject({ amount: 2980.8, fxAmount: 120, fxCurrency: 'AED', fxRate: 24, fxFee: 3.5 });
  expect(by.transport).toMatchObject({ amount: 2880, fxAmount: 120, fxCurrency: 'AED', fxRate: 24 });
  expect(by.transport.fxFee).toBeUndefined();
  expect(by.rent.amount).toBe(25000);
  expect(by.rent.fxAmount).toBeUndefined();
  expect(by.rent.tripId).toBeUndefined();

  // Lists show both amounts, and the strip totals the trip in both currencies.
  await expect(page.getByText('AED 120').first()).toBeVisible();
  await expect(strip).toContainText('AED 240 (₹5,861)');

  // The travel fields survive a reload (normalizeExpense) and the trip stays on.
  await page.reload();
  await expect(strip).toContainText('AED 240 (₹5,861)');
  const reloaded = await page.evaluate(() => JSON.parse(localStorage.getItem('fx_expenses') || '[]'));
  expect(reloaded.filter((e: { fxCurrency?: string }) => e.fxCurrency === 'AED')).toHaveLength(2);

  // The summary: totals in both currencies, by category, and ending the trip.
  await strip.click();
  const summary = page.getByRole('dialog', { name: 'United Arab Emirates' });
  await expect(summary).toContainText('₹5,861');
  await expect(summary).toContainText('AED 240 spent in AED');
  await expect(summary).toContainText('Eating Out');
  await expect(summary).toContainText('1 AED = ₹24.00');
  await summary.getByRole('button', { name: 'End trip now' }).click();
  await expect(summary).toContainText('Last day');
  await expect(summary.getByRole('button', { name: 'Next stop?' })).toBeVisible();

  // "Next stop?" starts the next leg the day after this one ends.
  await summary.getByRole('button', { name: 'Next stop?' }).click();
  await expect(page.getByRole('dialog', { name: 'Next stop' })).toBeVisible();
});

test('one tap enters a single trip spend in ₹ instead', async ({ page }) => {
  await gotoFresh(page);
  await page.getByRole('button', { name: 'Travel mode' }).click();
  const sheet = page.getByRole('dialog', { name: 'Travel mode' });
  await sheet.getByLabel('Country').selectOption({ label: 'Thailand (Bangkok, Phuket)' });
  await sheet.getByRole('button', { name: 'Start travel mode' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const dialog = await addSpend(page, { category: 'Shopping (Wants)', amount: '1500', currency: 'THB' });
  await dialog.getByRole('button', { name: 'Enter in ₹' }).click();
  await expect(dialog.getByLabel('Amount (₹)')).toHaveValue('1500');
  await save(page);

  const [hotel] = await page.evaluate(() => JSON.parse(localStorage.getItem('fx_expenses') || '[]'));
  // Paid in ₹ during the trip: still the trip's spending, nothing converted.
  expect(hotel.amount).toBe(1500);
  expect(hotel.fxAmount).toBeUndefined();
  expect(typeof hotel.tripId).toBe('string');
});

/* ── Stage 2 (build step 2.1) ─────────────────────────────────────────── */

/** A local calendar day in the page's own time zone, `n` days from today. */
async function localDay(page: Page, n: number): Promise<string> {
  return page.evaluate((offset) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    const pad = (x: number) => String(x).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }, n);
}

test('a trip budget, a statement amount, and a flight booked before the trip', async ({ page }) => {
  await gotoFresh(page);

  await page.getByRole('button', { name: 'Travel mode' }).click();
  const sheet = page.getByRole('dialog', { name: 'Travel mode' });
  await sheet.getByLabel('Country').selectOption({ label: 'United Arab Emirates (Dubai, Abu Dhabi)' });
  await sheet.getByRole('button', { name: '1 week' }).click();
  await sheet.getByLabel('Your card’s forex fee, in %').fill('3.5');
  const budgetField = sheet.getByLabel('Trip budget (optional)');
  await budgetField.fill('48000');
  // On a phone the formula keys sit over the sheet while the field has focus,
  // as the keyboard does; done typing, the field lets go.
  await budgetField.blur();
  await sheet.getByRole('button', { name: 'Start travel mode' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);

  const strip = page.getByRole('button', { name: /United Arab Emirates · 7 days left/ });
  await expect(strip).toContainText('₹48,000 left');

  // The bank charged ₹2,995.40, not the ₹2,980.80 the trip rate gives.
  const card = await addSpend(page, { category: 'Eating Out (Wants)', amount: '120', currency: 'AED', payment: 'Credit card' });
  await expect(card.locator('#tx-amount-fx')).toContainText('₹2,980.80');
  await card.getByRole('button', { name: 'Charged a different amount?' }).click();
  await card.getByLabel('Charged in ₹, from your statement').fill('2995.40');
  await expect(card.locator('#tx-amount-fx')).toContainText('₹2,995.40 from your statement');
  await expect(card.locator('#tx-amount-fx')).toContainText('1 AED = ₹24.96 with fees');
  await save(page);

  // The flight, paid in ₹ three days before the trip, added to it with one tick.
  const flightDay = await localDay(page, -3);
  await page.getByRole('button', { name: 'Add an expense' }).click();
  const flight = page.getByRole('dialog');
  await flight.getByRole('button', { name: 'Transport (Needs)' }).click();
  await flight.getByLabel('Date').fill(flightDay);
  await flight.getByLabel(/Part of the United Arab Emirates trip/).check();
  await flight.getByLabel('Amount (₹)').fill('18500');
  await save(page);

  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fx_expenses') || '[]'));
  const by = Object.fromEntries(stored.map((e: { category: string }) => [e.category, e]));
  expect(by.eating_out).toMatchObject({ amount: 2995.4, fxAmount: 120, fxCurrency: 'AED', fxCharged: true });
  expect(by.eating_out.fxFee).toBeUndefined();
  expect(by.eating_out.fxRate).toBeCloseTo(24.961667, 5);
  expect(by.transport).toMatchObject({ amount: 18500, date: flightDay, tripId: by.eating_out.tripId });
  expect(by.transport.fxAmount).toBeUndefined();

  // 48,000 − (2,995.40 + 18,500) = 26,504.60 left.
  await expect(strip).toContainText('₹26,505 left');

  // The month's budget figures say how much came from the trip.
  const sameMonth = flightDay.slice(0, 7) === (await localDay(page, 0)).slice(0, 7);
  await expect(page.locator('.fx-trip-share')).toContainText(
    `Includes ${sameMonth ? '₹21,495' : '₹2,995'} from the United Arab Emirates trip.`,
  );

  // The summary counts the flight and shows the budget.
  await strip.click();
  const summary = page.getByRole('dialog', { name: 'United Arab Emirates' });
  await expect(summary).toContainText('₹21,495');
  await expect(summary).toContainText('₹26,505 left of the ₹48,000 trip budget');
});

test('hide amounts masks every amount, is remembered, and keeps a field readable', async ({ page }) => {
  await gotoFresh(page);
  await page.getByRole('button', { name: 'Add an expense' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: 'Eating Out (Wants)' }).click();
  await dialog.getByLabel('Amount (₹)').fill('2500');
  await save(page);
  await expect(page.getByText('₹2,500').first()).toBeVisible();

  const eye = page.getByRole('button', { name: 'Hide amounts' });
  await eye.click();
  await expect(eye).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('₹2,500')).toHaveCount(0);
  await expect(page.getByText('₹ ••••').first()).toBeVisible();

  // Remembered on this device.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Hide amounts' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('₹2,500')).toHaveCount(0);

  // What someone is typing stays readable.
  await page.getByRole('button', { name: 'Add an expense' }).click();
  const typing = page.getByRole('dialog').getByLabel('Amount (₹)');
  await typing.fill('1234');
  await expect(typing).toHaveValue('1234');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Hide amounts' }).click();
  await expect(page.getByText('₹2,500').first()).toBeVisible();
});
