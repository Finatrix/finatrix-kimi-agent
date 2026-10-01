import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loadEnv } from 'vite';

// Entirely synthetic account and ledger. All backend requests are intercepted.
const backend = loadEnv('production', process.cwd(), 'VITE_').VITE_SUPABASE_URL;
const uid = '00000000-0000-4000-8000-000000000001';

test('instant financial briefing is private, accessible and responsive', async ({ page }, testInfo) => {
  test.skip(!backend, 'This browser fixture requires a configured client URL.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', email_confirmed_at: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, exp: expires, role: 'authenticated' })).toString('base64url')}.synthetic-signature`;
  const blob = {
    fx_currency: 'INR', fx_market: 'IN',
    fx_bb_data: JSON.stringify({ [month]: { income: '50000', n: '50', w: '30', s: '20', vals: { groceries: 5000, emergency: 10000 } } }),
    fx_expenses: JSON.stringify([
      { id: 'a', date: `${month}-01`, category: 'groceries', amount: 6500 },
      { id: 'b', date: `${month}-01`, category: 'emergency', amount: 10000 },
    ]),
  };
  let aiCalls = 0;
  await page.route(`${backend}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/functions/v1/careers-ai')) {
      aiCalls += 1;
      await route.fulfill({ status: 503, json: { error: 'AI deliberately offline in this test' } });
    } else if (path.includes('/auth/v1/user')) await route.fulfill({ json: user });
    else if (path.includes('/rest/v1/tool_data')) await route.fulfill({ json: { data: blob } });
    else await route.fulfill({ json: [] });
  });
  await page.addInitScript(({ backend, user, token, expires, blob }) => {
    const key = `sb-${new URL(backend).hostname.split('.')[0]}-auth-token`;
    localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer', user }));
    localStorage.setItem('fx_has_session', '1');
    // A returning user who has already allowed FinatriX AI (lib/ai/consent);
    // the permission step itself is covered by src/test/aiConsent.test.tsx.
    localStorage.setItem('fx_ai_consent', '1');
    Object.entries(blob).forEach(([k, v]) => localStorage.setItem(k, v));
  }, { backend, user, token, expires, blob });
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/tools/dashboard?help=setup');
  const dialog = page.getByRole('dialog', { name: 'FinatriX AI' });
  await expect(dialog.getByRole('button', { name: 'Get my instant financial briefing' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Get my instant financial briefing' }).click();
  await expect(dialog.getByText('Calculated on your device · no AI request')).toBeVisible();
  // Long briefings collapse; expose the full evidence for accessibility checks.
  const expand = dialog.getByRole('button', { name: 'Show the full answer' });
  if (await expand.isVisible()) await expand.click();
  await expect(dialog.getByRole('heading', { name: 'Recorded spending exceeds the plan' })).toBeVisible();
  await expect(dialog.getByText('Recorded spending', { exact: true })).toBeVisible();
  expect(aiCalls).toBe(0);
  const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(accessibility.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
  const box = await dialog.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(page.viewportSize()!.width + 1);
  await dialog.screenshot({ path: testInfo.outputPath('briefing.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
  expect(errors).toEqual([]);
});

/**
 * App Review 5.1.2(i): nothing goes to a third-party AI without explicit
 * permission. The first AI question shows a consent card naming the recipient,
 * sends nothing until "Allow and send", and the card meets the same
 * accessibility floor as the panel around it.
 */
test('asks for permission before the first question reaches the AI provider', async ({ page }, testInfo) => {
  test.skip(!backend, 'This browser fixture requires a configured client URL.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', email_confirmed_at: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, exp: expires, role: 'authenticated' })).toString('base64url')}.synthetic-signature`;
  let aiCalls = 0;
  await page.route(`${backend}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/functions/v1/careers-ai')) {
      aiCalls += 1;
      await route.fulfill({ status: 503, json: { error: 'AI deliberately offline in this test' } });
    } else if (path.includes('/auth/v1/user')) await route.fulfill({ json: user });
    else await route.fulfill({ json: [] });
  });
  await page.addInitScript(({ backend, user, token, expires }) => {
    const key = `sb-${new URL(backend).hostname.split('.')[0]}-auth-token`;
    localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer', user }));
    localStorage.setItem('fx_has_session', '1');
  }, { backend, user, token, expires });

  await page.goto('/tools/dashboard?help=setup');
  const dialog = page.getByRole('dialog', { name: 'FinatriX AI' });
  await dialog.getByLabel(/Ask FinatriX AI/).fill('Where did my money go this month?');
  await dialog.getByRole('button', { name: 'Send question' }).click();

  const consent = dialog.getByRole('group', { name: 'Send this to an AI provider?' });
  await expect(consent).toBeVisible();
  await expect(consent).toContainText('OpenRouter');
  await expect(consent.getByRole('button', { name: 'Allow and send' })).toBeFocused();
  expect(aiCalls).toBe(0);
  const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(accessibility.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
  await dialog.screenshot({ path: testInfo.outputPath('ai-consent.png') });

  await consent.getByRole('button', { name: 'Allow and send' }).click();
  await expect(consent).toHaveCount(0);
  await expect.poll(() => aiCalls).toBe(1);
  expect(await page.evaluate(() => localStorage.getItem('fx_ai_consent'))).toBe('1');
});
