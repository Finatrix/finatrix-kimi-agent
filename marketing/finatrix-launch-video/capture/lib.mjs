import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
/** Capture state lives next to these scripts, whatever the working directory. */
export const here = (name) => path.join(path.dirname(fileURLToPath(import.meta.url)), name);
export const BASE = 'http://localhost:3000';
export async function open({ state } = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: Number(process.env.DSF || 3), colorScheme: 'dark',
    isMobile: true, hasTouch: true, locale: 'en-IN', timezoneId: 'Asia/Kolkata',
    reducedMotion: 'reduce', storageState: state,
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 200)));
  return { browser, ctx, page };
}
export const settle = (p, ms = 900) => p.waitForTimeout(ms);
