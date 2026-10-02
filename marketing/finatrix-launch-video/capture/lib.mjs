import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
/** Capture state lives next to these scripts, whatever the working directory. */
export const here = (name) => path.join(path.dirname(fileURLToPath(import.meta.url)), name);
export const BASE = 'http://localhost:3000';
export async function open({ state, dsf, viewport, mobile = true } = {}) {
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const ctx = await browser.newContext({
    viewport: viewport || { width: 390, height: 844 }, deviceScaleFactor: dsf || Number(process.env.DSF || 3), colorScheme: 'dark',
    isMobile: mobile, hasTouch: mobile, locale: 'en-IN', timezoneId: 'Asia/Kolkata',
    reducedMotion: 'reduce', storageState: state,
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('PAGEERR', e.message.slice(0, 200)));
  return { browser, ctx, page };
}
export const settle = (p, ms = 900) => p.waitForTimeout(ms);

/**
 * Plate shooter: screenshots a crop of the page and records the page-space
 * boxes of named regions (crop-relative), so the film can frame real UI edges.
 * spec values: [text, closestSelector?, nth?] — text '^x' is a prefix match,
 * '@sel' a CSS selector, '~x' the smallest element containing x.
 */
export function shooter(page, OUT, meta) {
  const boxes = (spec) => page.evaluate((spec) => {
    const out = {};
    for (const [key, [text, sel, nth = 0]] of Object.entries(spec)) {
      const match = (t) => (text.startsWith('^') ? t.startsWith(text.slice(1)) : t === text);
      // '~text': the smallest element whose text contains it (text split across nodes).
      const leaves = text.startsWith('@') ? []
        : text.startsWith('~') ? [...document.querySelectorAll('body *')].filter((e) => e.textContent.includes(text.slice(1)) && ![...e.children].some((c) => c.textContent.includes(text.slice(1))))
        : [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && match(e.textContent.trim()));
      const el = text.startsWith('@') ? document.querySelectorAll(text.slice(1))[nth] : leaves[nth] && (sel ? leaves[nth].closest(sel) : leaves[nth]);
      if (!el) { out[key] = null; continue; }
      const b = el.getBoundingClientRect();
      out[key] = { x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height };
    }
    return out;
  }, spec);
  return async function plate(name, spec, { y0 = 0, h, x0 = 0, w } = {}) {
    await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
    await page.waitForTimeout(500);
    const vw = page.viewportSize().width;
    const clip = { x: x0, y: y0, width: w || vw - x0, height: h };
    await page.screenshot({ path: `${OUT}/${name}.png`, clip });
    const b = await boxes(spec);
    for (const k in b) if (b[k]) { b[k].y -= y0; b[k].x -= x0; }
    meta.plates[name] = { w: clip.width, h, y0, x0, boxes: b };
    const missing = Object.entries(b).filter(([, v]) => !v).map(([k]) => k);
    console.log(name, missing.length ? 'MISSING ' + missing : 'ok');
  };
}
