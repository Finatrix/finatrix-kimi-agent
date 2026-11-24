import { expect, test, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loadEnv } from 'vite';

/**
 * Voice in FinatriX AI, in real browsers. The browser's speech features are
 * replaced with scripted stand-ins (a test cannot speak into a microphone), so
 * this checks everything around them: the mic sits behind the AI consent, a
 * heard question goes through the chat, the answer is read aloud, and the
 * conversation listens again and ends after a pause. Entirely synthetic
 * account; every backend request is intercepted.
 */

const backend = loadEnv('production', process.cwd(), 'VITE_').VITE_SUPABASE_URL;
const uid = '00000000-0000-4000-8000-000000000001';

declare global {
  interface Window {
    __voice: { spoken: string[]; recs: Array<{ lang: string; onresult?: (e: unknown) => void; onerror?: (e: unknown) => void; onend?: () => void }> };
  }
}

async function signIn(page: Page) {
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', email_confirmed_at: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: {} };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, exp: expires, role: 'authenticated' })).toString('base64url')}.synthetic-signature`;
  const calls = { ai: 0 };
  await page.route(`${backend}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.includes('/functions/v1/careers-ai')) {
      calls.ai += 1;
      await route.fulfill({ status: 503, json: { error: 'AI deliberately offline in this test' } });
    } else if (path.includes('/auth/v1/user')) await route.fulfill({ json: user });
    else await route.fulfill({ json: [] });
  });
  await page.addInitScript(({ backend, user, token, expires }) => {
    const key = `sb-${new URL(backend).hostname.split('.')[0]}-auth-token`;
    localStorage.setItem(key, JSON.stringify({ access_token: token, refresh_token: 'synthetic-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer', user }));
    localStorage.setItem('fx_has_session', '1');
    localStorage.setItem('fx_voice_lang', 'en-IN');

    // Scripted speech: recognisers wait for the test to "say" something, and
    // speaking records the text and finishes at once.
    window.__voice = { spoken: [], recs: [] };
    class FakeRecognition {
      lang = '';
      onresult?: (e: unknown) => void;
      onerror?: (e: unknown) => void;
      onend?: () => void;
      constructor() { window.__voice.recs.push(this); }
      start() {}
      abort() { this.onerror?.({ error: 'aborted' }); this.onend?.(); }
    }
    Object.assign(window, { SpeechRecognition: FakeRecognition, webkitSpeechRecognition: FakeRecognition });
    class FakeUtterance { text: string; voice: unknown = null; lang = ''; onend?: () => void; onerror?: (e: unknown) => void; constructor(t: string) { this.text = t; } }
    Object.assign(window, { SpeechSynthesisUtterance: FakeUtterance });
    const voices = [{ lang: 'en-IN', name: 'Scripted', localService: true, default: true, voiceURI: 'scripted' }];
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => voices,
        speak(u: FakeUtterance) {
          if (u.text) window.__voice.spoken.push(u.text);
          setTimeout(() => u.onend?.(), 5);
        },
        cancel() {},
        addEventListener() {},
        removeEventListener() {},
      },
    });
  }, { backend, user, token, expires });
  return calls;
}

const say = (page: Page, text: string) => page.evaluate((t) => {
  const r = window.__voice.recs[window.__voice.recs.length - 1];
  r.onresult?.({ resultIndex: 0, results: { length: 1, 0: { isFinal: true, length: 1, 0: { transcript: t } } } });
  r.onend?.();
}, text);

const pause = (page: Page) => page.evaluate(() => {
  const r = window.__voice.recs[window.__voice.recs.length - 1];
  r.onerror?.({ error: 'no-speech' });
  r.onend?.();
});

test('talks hands-free with FinatriX AI after the AI consent', async ({ page }, testInfo) => {
  test.skip(!backend, 'This browser fixture requires a configured client URL.');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const calls = await signIn(page);
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/tools/dashboard?help=setup');
  const dialog = page.getByRole('dialog', { name: 'FinatriX AI' });
  const mic = dialog.getByRole('button', { name: 'Talk hands-free' });
  await mic.click();

  // The existing AI consent covers voice, asked before the microphone opens.
  const consent = dialog.getByRole('group', { name: 'Talk to FinatriX AI?' });
  await expect(consent).toBeVisible();
  await expect(consent).toContainText('never receives the audio');
  expect(await page.evaluate(() => window.__voice.recs.length)).toBe(0);
  await consent.getByRole('button', { name: 'Allow and start talking' }).click();

  // Listening: what it is doing, the language, and a way to stop.
  const bar = dialog.getByRole('group', { name: 'Voice conversation' });
  await expect(bar.getByText(/Listening/)).toBeVisible();
  await expect(bar.getByLabel('Language you speak')).toHaveValue('en-IN');
  await expect(mic).toHaveAttribute('aria-pressed', 'true');
  const accessibility = await new AxeBuilder({ page }).include('[role="dialog"]').withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze();
  expect(accessibility.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))).toEqual([]);
  await dialog.screenshot({ path: testInfo.outputPath('voice-listening.png') });

  // A spoken setup question is answered on the device and read aloud, then it listens again.
  await say(page, 'How do I add an expense?');
  await expect.poll(() => page.evaluate(() => window.__voice.spoken.length)).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.__voice.recs.length)).toBe(2);
  await expect(dialog.getByText('How do I add an expense?')).toBeVisible();
  expect(calls.ai).toBe(0);

  // A money question goes to the AI like a typed one would.
  await say(page, 'Where did my money go this month?');
  await expect.poll(() => calls.ai).toBe(1);
  // The AI is offline in this test: the reason is read out, and voice stops rather than looping.
  await expect(mic).toHaveAttribute('aria-pressed', 'false');
  expect(await page.evaluate(() => window.__voice.spoken.length)).toBe(2);

  // Started again, a pause ends it with a line saying so.
  await mic.click();
  await expect(bar.getByText(/Listening/)).toBeVisible();
  await pause(page);
  await expect(dialog.getByText('Voice ended after a pause. Tap the mic to talk again.')).toBeVisible();
  expect(errors).toEqual([]);
});

test('says "stop" to end, and never offers voice where the browser cannot listen', async ({ page }) => {
  test.skip(!backend, 'This browser fixture requires a configured client URL.');
  await signIn(page);
  await page.addInitScript(() => localStorage.setItem('fx_ai_consent', '1'));
  await page.goto('/tools/dashboard?help=setup');
  const dialog = page.getByRole('dialog', { name: 'FinatriX AI' });
  const mic = dialog.getByRole('button', { name: 'Talk hands-free' });
  await mic.click();
  await expect(dialog.getByText(/Listening/)).toBeVisible();
  await say(page, 'Stop.');
  await expect(dialog.getByText('Voice stopped.')).toBeVisible();
  await expect(mic).toHaveAttribute('aria-pressed', 'false');

  await page.addInitScript(() => {
    delete (window as Partial<Window> & { SpeechRecognition?: unknown }).SpeechRecognition;
    delete (window as Partial<Window> & { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;
  });
  await page.reload();
  await expect(page.getByRole('dialog', { name: 'FinatriX AI' }).getByLabel(/Ask FinatriX AI/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Talk hands-free' })).toHaveCount(0);
});
