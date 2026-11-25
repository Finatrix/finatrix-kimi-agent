import type { Page } from '@playwright/test';
import { expect, test } from './support/fixtures';
import AxeBuilder from '@axe-core/playwright';
import { loadEnv } from 'vite';

/**
 * FinatriX AI actions (step 3.2), in real browsers: a typed request becomes a
 * confirm card, nothing is written until Save, Undo takes it back, and a trip
 * spend is priced in the trip's currency by the app. The action picker's reply
 * is scripted (the AI is replaced), so this checks the app's side of the
 * boundary. Entirely synthetic account; every backend request is intercepted.
 */

const backend = loadEnv('production', process.cwd(), 'VITE_').VITE_SUPABASE_URL;
const uid = '00000000-0000-4000-8000-000000000001';

test.use({ serviceWorkers: 'block' });

function ymd(offset: number): string {
  const d = new Date();
  const t = new Date(d.getFullYear(), d.getMonth(), d.getDate() + offset);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

async function signIn(page: Page, plans: Record<string, unknown>) {
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', email_confirmed_at: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, exp: expires, role: 'authenticated' })).toString('base64url')}.synthetic-signature`;
  const tasks: string[] = [];
  // The account's one cloud row, remembered like the real table does. The app
  // pushes its local data about 700 ms after a Save, then reads the row back
  // and merges it. A fake that always answered "empty" made that merge treat
  // the seeded trip as deleted elsewhere, so the second request below passed
  // or failed on how fast the browser was (it never passed on Linux WebKit).
  let cloudRow: { data: unknown; updated_at: string } | null = null;
  await page.route(`${backend}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/functions/v1/careers-ai')) {
      const body = route.request().postDataJSON() as { task: string; user: string };
      tasks.push(body.task);
      if (body.task === 'money-action') {
        const said = /<message>\n([\s\S]*?)\n<\/message>/.exec(body.user)?.[1] ?? '';
        const plan = plans[said] ?? { action: 'none' };
        await route.fulfill({ json: { content: JSON.stringify(plan), model: 'scripted', ms: 1, promptTokens: 1, completionTokens: 1 } });
      } else {
        await route.fulfill({ status: 503, json: { error: 'Chat deliberately offline in this test' } });
      }
    } else if (path.includes('/auth/v1/user')) await route.fulfill({ json: user });
    else if (path.includes('/rest/v1/tool_data')) {
      const method = route.request().method();
      if (method === 'GET') await route.fulfill({ json: cloudRow ? [cloudRow] : [] });
      else {
        const sent = route.request().postDataJSON() as { data: unknown };
        cloudRow = { data: sent.data, updated_at: new Date().toISOString() };
        await route.fulfill({ json: [{ updated_at: cloudRow.updated_at }] });
      }
    } else await route.fulfill({ json: [] });
  });
  const trip = { id: 'trip-e2e', name: 'Dubai', currency: 'AED', homeCurrency: 'INR', start: ymd(0), end: ymd(3), rate: 22.75, rateSource: 'manual', homeCats: ['rent'], createdAt: '2025-01-01T00:00:00Z', updatedAt: '2025-01-01T00:00:00Z' };
  await page.addInitScript(({ backend, user, token, expires, trip }) => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    const key = `sb-${new URL(backend).hostname.split('.')[0]}-auth-token`;
    localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer', user }));
    localStorage.setItem('fx_has_session', '1');
    localStorage.setItem('fx_ai_consent', '1');
    localStorage.setItem('fx_currency', 'INR');
    localStorage.setItem('fx_market', 'IN');
    localStorage.setItem('fx_trips', JSON.stringify([trip]));
  }, { backend, user, token, expires, trip });
  return { tasks, cloudHasData: () => cloudRow !== null };
}

const ledger = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('fx_expenses') || '[]') as Array<Record<string, unknown>>);

test('a typed request becomes a confirm card, and Undo takes it back', async ({ page }, testInfo) => {
  test.skip(!backend, 'This browser fixture requires a configured client URL.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const { tasks, cloudHasData } = await signIn(page, {
    'Add 450 for lunch yesterday': { action: 'log_expense', amount: '450', category: 'eating_out', note: 'lunch', day: 'yesterday' },
    '50 dirhams for a taxi': { action: 'log_trip_spend', amount: '50', currency: 'AED', category: 'transport', note: 'taxi' },
  });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/tools/dashboard?help=setup');
  const dialog = page.getByRole('dialog', { name: 'FinatriX AI' });
  const box = dialog.getByRole('textbox');
  await box.fill('Add 450 for lunch yesterday');
  await box.press('Enter');

  const card = dialog.getByRole('group', { name: 'Log spend' });
  await expect(card).toBeVisible();
  await expect(card.getByLabel('Category')).toHaveValue('eating_out');
  await expect(card.getByLabel('Date')).toHaveValue(ymd(-1));
  expect(await ledger(page)).toEqual([]);
  const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(accessibility.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
  await dialog.screenshot({ path: testInfo.outputPath('action-card.png') });

  await card.getByRole('button', { name: 'Save' }).click();
  await expect(card.getByRole('button', { name: 'Undo' })).toBeFocused();
  expect(await ledger(page)).toEqual([expect.objectContaining({ amount: 450, category: 'eating_out', date: ymd(-1), note: 'lunch' })]);
  await card.getByRole('button', { name: 'Undo' }).click();
  await expect(card.getByText(/Undone/)).toBeVisible();
  expect(await ledger(page)).toEqual([]);

  // Let the app's sync push land and merge back before the next request. The
  // trip must survive that round trip whatever the browser's pace.
  await expect.poll(cloudHasData).toBe(true);

  // A trip spend: the amount is the user's, the rupee figure is the app's.
  await box.fill('50 dirhams for a taxi');
  await box.press('Enter');
  const trip = dialog.getByRole('group', { name: 'Log trip spend' });
  await expect(trip).toContainText('AED 50');
  await expect(trip).toContainText('₹1,137.50');
  await trip.getByRole('button', { name: 'Save' }).click();
  expect(await ledger(page)).toEqual([expect.objectContaining({ amount: 1137.5, fxAmount: 50, fxCurrency: 'AED', fxRate: 22.75, tripId: 'trip-e2e' })]);

  expect(tasks.every((t) => t === 'money-action')).toBe(true);
  expect(errors).toEqual([]);
});
