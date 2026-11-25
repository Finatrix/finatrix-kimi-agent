#!/usr/bin/env node
/**
 * Design audit: measures the floors the design system promises, across every
 * surface, phone width and theme, against a running build.
 *
 *   npm run build && npx vite preview --port 4319 --strictPort &
 *   node scripts/design-audit.mjs [--base http://localhost:4319] [--out audit.json] [--quick] [--motion-only | --keyboard-only]
 *
 * Per surface × width × theme it reports:
 *   - text   visible HTML text under 11px, prose paragraphs under 15px on phones
 *   - tap    controls whose hit area is under 44×44 (coarse pointer) or 24×24,
 *            measured by hit-testing points around the centre, so a padded
 *            pseudo-element counts and a neighbour covering the edge does not
 *   - contrast  WCAG text contrast, with translucent backgrounds composited and
 *            every colour format read back through a canvas (so `color(srgb …)`,
 *            `oklch()` and `color-mix()` are all converted the same way)
 *   - layout horizontal overflow, and content still under a fixed bottom bar or
 *            floating button when the page is scrolled to the end
 *   - motion elements whose computed transition covers `all`
 *   - keyboard  every Tab stop shows focus and is not left under a fixed bar
 *            (scripts/focus-walk.js), at one phone and one desktop width
 * plus `prefers-contrast: more` and `prefers-reduced-transparency` passes.
 *
 * The page logic runs in the browser in one evaluate per load; nothing here
 * depends on the app's own code, so it measures what ships.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { walkFocus } from './focus-walk.js';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
};
const BASE = arg('--base', 'http://localhost:4319');
const OUT = arg('--out', '');
const QUICK = args.includes('--quick');
const ONLY = arg('--only', '');

const PHONE_WIDTHS = [320, 360, 375, 390, 414, 430];
const WIDTHS = QUICK ? [320, 375, 1280] : [...PHONE_WIDTHS, 768, 1280];
const THEMES = ['light', 'dark'];

/** Storage that suppresses first-run overlays unless the surface asks for one. */
const QUIET = { fx_walkthrough_seen: '1', fx_tour_optout: '1', fx_onboarding_done: '1', fx_ai_consent: '1' };

const SURFACES = [
  { id: 'landing', path: '/' },
  { id: 'dashboard', path: '/tools/dashboard' },
  { id: 'budget', path: '/tools/budget' },
  { id: 'expenses', path: '/tools/expenses' },
  { id: 'goals', path: '/tools/goals' },
  { id: 'investmatch', path: '/tools/investmatch' },
  { id: 'lifemap', path: '/tools/lifemap' },
  { id: 'alltools', path: '/tools/all' },
  // Step 2.5, with someone who owes you (Remind + Mark as settled) and someone you owe.
  { id: 'splits', path: '/tools/splits', storage: {
    fx_split_people: JSON.stringify([
      { id: 'p_a', name: 'Asha Krishnamurthy-Venkataraman', createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T10:00:00Z' },
      { id: 'p_b', name: 'Ben', createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T10:00:00Z' },
    ]),
    fx_split_entries: JSON.stringify([
      { id: 's_1', kind: 'bill', amount: 2400, date: '2026-11-20', note: 'Saturday’s dinner at the place near the station', category: 'eating_out', paidBy: 'me', rule: 'equal', shares: [{ member: 'me', value: 1 }, { member: 'p_a', value: 1 }], createdAt: '2026-11-20T10:00:00Z', updatedAt: '2026-11-20T10:00:00Z' },
      { id: 's_2', kind: 'borrowed', personId: 'p_b', amount: 500, date: '2026-11-21', note: '', createdAt: '2026-11-21T10:00:00Z', updatedAt: '2026-11-21T10:00:00Z' },
    ]),
  } },
  // Seeded with a bill that has a warranty still running and one with none, so the list rows are measured too.
  { id: 'locker', path: '/tools/locker', storage: { fx_locker: JSON.stringify([
    { id: 'a', product: 'Samsung TV', shop: 'Croma', purchased: '2026-03-15', warrantyEnd: '2027-03-14', price: 42000, note: '', photoIds: [], remind: true, addedAt: 2 },
    { id: 'b', product: 'Running shoes', shop: 'Decathlon', purchased: '2026-10-01', warrantyEnd: null, price: null, note: '', photoIds: [], remind: true, addedAt: 1 },
  ]) } },
  { id: 'careers', path: '/careers' },
  { id: 'learn', path: '/learn', follow: /^\/learn\/[^/]+\/[^/]+$/ },
  { id: 'legal', path: '/privacy' },
  { id: 'signin', path: '/login' },
  { id: 'onboarding', path: '/welcome', storage: { fx_onboarding_done: null } },
  // The tour offer and the first-run intro only show to a person on an entry
  // path; the test opt-in keys let an automated browser see them.
  { id: 'tour', path: '/tools/dashboard', storage: { fx_tour_optout: null, fx_tour_test: '1', fx_last_tool: 'budget' }, settle: 2500 },
  { id: 'walkthrough', path: '/tools/dashboard', storage: { fx_walkthrough_seen: null, fx_walkthrough_test: '1', fx_onboarding_done: null }, settle: 2500 },
].filter((s) => !ONLY || ONLY.split(',').includes(s.id));

/** Runs in the page. Returns one row of measurements. */
function measure({ coarse, phone }) {
  const W = window.innerWidth;
  const H = window.innerHeight;
  const doc = document.scrollingElement || document.documentElement;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 1;
  const cx = cv.getContext('2d', { willReadFrequently: true });
  const cache = new Map();
  /** Any CSS colour string → [r,g,b,a] in sRGB 0–255 / 0–1, via the canvas. */
  const rgba = (s) => {
    if (!s || s === 'transparent' || s === 'none') return [0, 0, 0, 0];
    if (cache.has(s)) return cache.get(s);
    cx.clearRect(0, 0, 1, 1);
    cx.fillStyle = 'rgba(0,0,0,0)';
    cx.fillStyle = s;
    cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    const v = [d[0], d[1], d[2], d[3] / 255];
    cache.set(s, v);
    return v;
  };
  const over = (top, base) => {
    const a = top[3] + base[3] * (1 - top[3]);
    if (a === 0) return [0, 0, 0, 0];
    return [0, 1, 2].map((i) => (top[i] * top[3] + base[i] * base[3] * (1 - top[3])) / a).concat(a);
  };
  const lum = ([r, g, b]) => {
    const f = (c) => {
      c /= 255;
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => {
    const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (l1 + 0.05) / (l2 + 0.05);
  };
  const canvasBg = rgba(getComputedStyle(document.documentElement).backgroundColor)[3]
    ? rgba(getComputedStyle(document.documentElement).backgroundColor)
    : rgba(getComputedStyle(document.body).backgroundColor)[3]
      ? rgba(getComputedStyle(document.body).backgroundColor)
      : [255, 255, 255, 1];

  /** Background behind `el`, composited up the ancestor chain; null when an image or gradient sits under it. */
  const backgroundOf = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') return null;
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0) layers.push(c);
      if (c[3] >= 1) break;
    }
    let base = canvasBg;
    for (let i = layers.length - 1; i >= 0; i--) base = over(layers[i], base);
    return base;
  };
  const opacityOf = (el) => {
    let o = 1;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity) || 0;
    return o;
  };
  const visible = (el) => {
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    if (r.right <= 0 || r.left >= W) return false;
    if (el.closest('[inert],[aria-hidden="true"] [inert]')) return false;
    const cs = getComputedStyle(el);
    if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || cs.clipPath === 'inset(50%)') return false;
    return true;
  };
  const label = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || el.tagName).trim().replace(/\s+/g, ' ');
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''} "${t.slice(0, 32)}"`;
  };

  const out = {
    overflow: Math.max(0, doc.scrollWidth - doc.clientWidth),
    text: 0, under11: [], minFs: 99, under14: 0,
    prose: 0, proseUnder15: [], footnoteUnder13: [], pMedian: null,
    contrastFail: [], contrastSkipped: 0,
    controls: 0, under44: [], under24: [],
    covered: [], transitionAll: [], blur: 0,
  };

  // ---- text ---------------------------------------------------------------
  const FOOTNOTE = '.note, [class*="caption"], [class*="hint"], [class*="footnote"], small, figcaption, [role="note"], footer p';
  const pSizes = [];
  const textEls = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
  for (let el = walker.currentNode; el; el = walker.nextNode()) {
    if (el.closest('svg,script,style,noscript,template')) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText || !visible(el)) continue;
    textEls.push(el);
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    out.text++;
    out.minFs = Math.min(out.minFs, fs);
    if (fs < 11) out.under11.push(`${fs}px ${label(el)}`);
    if (fs < 14) out.under14++;
    if (el.tagName === 'P') pSizes.push(fs);
    // Prose: a paragraph of real reading length. Two tiers, after Apple's text
    // styles (typography.md): body copy at 15px or more on a phone, and
    // footnotes — explanatory notes, hints and captions — at 13px or more.
    if (el.tagName === 'P' && el.textContent.trim().length >= 80) {
      out.prose++;
      const footnote = el.matches(FOOTNOTE);
      if (phone && !footnote && fs < 15) out.proseUnder15.push(`${fs}px ${label(el)}`);
      if (phone && footnote && fs < 13) out.footnoteUnder13.push(`${fs}px ${label(el)}`);
    }
    // Contrast. Disabled controls are exempt (WCAG 1.4.3: inactive components).
    const bg = backgroundOf(el);
    if (el.closest(':disabled, [aria-disabled="true"]')) {
      // not measured
    } else if (!bg) {
      out.contrastSkipped++;
    } else {
      const c = rgba(cs.color);
      const fg = over([c[0], c[1], c[2], c[3] * opacityOf(el)], bg);
      const r = ratio(fg, bg);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const large = fs >= 24 || (bold && fs >= 18.66);
      const need = large ? 3 : 4.5;
      if (r < need - 0.005) out.contrastFail.push(`${r.toFixed(2)}<${need} ${fs}px ${label(el)}`);
    }
  }
  pSizes.sort((a, b) => a - b);
  out.pMedian = pSizes.length ? pSizes[Math.floor(pSizes.length / 2)] : null;

  // ---- motion & materials --------------------------------------------------
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    if (/(^|,\s*)all(\s|,|$)/.test(cs.transitionProperty) && cs.transitionDuration.split(',').some((d) => parseFloat(d) > 0)) {
      if (visible(el)) out.transitionAll.push(label(el));
    }
    if (cs.backdropFilter && cs.backdropFilter !== 'none' && visible(el)) out.blur++;
  }

  // ---- controls -------------------------------------------------------------
  const CONTROL = 'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=switch],[role=checkbox],[role=radio],[role=menuitem],[role=option],[role=link],[tabindex]:not([tabindex="-1"])';
  const controls = [...document.querySelectorAll(CONTROL)].filter((el) => {
    if (el.matches('main#main') || el.closest('[aria-hidden="true"]')) return false;
    // A visually hidden native input is reached through its label.
    if (el.matches('input') && el.labels?.length) {
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4 || parseFloat(getComputedStyle(el).opacity) === 0) return false;
    }
    // Nested controls (a button inside a link row) are measured once, as the outer one.
    if (el.parentElement?.closest(CONTROL) && !el.matches('input,select,textarea')) return false;
    return visible(el);
  });
  const labels = [...document.querySelectorAll('label')].filter((l) => l.control && visible(l) && !visible(l.control));
  const all = [...controls, ...labels];
  out.controls = all.length;
  const hits = (el, x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return false;
    const h = document.elementFromPoint(x, y);
    if (!h) return false;
    if (el === h || el.contains(h)) return true;
    const lab = h.closest('label');
    if (lab && (lab.control === el || lab === el || (el.labels && [...el.labels].includes(lab)))) return true;
    // A link or button whose whole row is the hit target.
    const ctl = h.closest(CONTROL);
    return !!ctl && ctl.contains(el);
  };
  for (const el of all) {
    el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (!hits(el, x, y)) continue; // covered at its own centre: overlays, carousels; not a size question
    // Hit extent along each axis, sampled every pixel across the target size:
    // a control passes when at least size−1 of those pixels reach it (one
    // pixel of tolerance for sub-pixel layout between two adjacent targets).
    const reach = (size) => {
      const half = Math.floor(size / 2);
      let nx = 0;
      let ny = 0;
      for (let d = -half; d <= half; d++) {
        if (hits(el, x + d, y)) nx++;
        if (hits(el, x, y + d)) ny++;
      }
      return nx >= size - 1 && ny >= size - 1;
    };
    const tag = `${Math.round(r.width)}×${Math.round(r.height)} ${label(el)}`;
    if (!reach(24)) out.under24.push(tag);
    if (coarse && !reach(44)) out.under44.push(tag);
  }

  // ---- covered by fixed bottom chrome ----------------------------------------
  window.scrollTo({ top: doc.scrollHeight, behavior: 'instant' });
  const fixed = [...document.querySelectorAll('body *')].filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
    if (!visible(el)) return false;
    const r = el.getBoundingClientRect();
    return r.bottom >= H - 2 - 160 && r.top > H * 0.45 && r.height < H * 0.5 && r.width > 0;
  });
  const fixedRects = fixed.map((el) => ({ el, r: el.getBoundingClientRect() }));
  for (const el of [...textEls, ...all]) {
    if (fixed.some((f) => f.contains(el) || el.contains(f))) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= H) continue;
    for (const { el: f, r: fr } of fixedRects) {
      const ix = Math.min(r.right, fr.right) - Math.max(r.left, fr.left);
      const iy = Math.min(r.bottom, fr.bottom) - Math.max(r.top, fr.top);
      if (ix > 4 && iy > 4) {
        out.covered.push(`${label(el)} under ${label(f)}`);
        break;
      }
    }
  }
  window.scrollTo({ top: 0, behavior: 'instant' });
  out.under11 = [...new Set(out.under11)];
  return out;
}

async function openSurface(browser, surface, width, theme, extra = {}) {
  const phone = width <= 430;
  const ctx = await browser.newContext({
    viewport: { width, height: phone ? 800 : width === 768 ? 1024 : 900 },
    deviceScaleFactor: 1,
    isMobile: phone,
    hasTouch: phone,
    colorScheme: theme,
    reducedMotion: extra.motion ? 'no-preference' : 'reduce',
    ...(extra.contrast ? { contrast: extra.contrast } : {}),
  });
  const storage = { ...QUIET, fx_theme: theme, ...(surface.storage || {}) };
  await ctx.addInitScript((s) => {
    if (sessionStorage.getItem('__audit_seeded')) return;
    sessionStorage.setItem('__audit_seeded', '1');
    for (const [k, v] of Object.entries(s)) {
      if (v === null) localStorage.removeItem(k);
      else localStorage.setItem(k, v);
    }
  }, storage);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 120)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text().slice(0, 120));
  });
  if (extra.transparency) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-transparency', value: 'reduce' }] });
  }
  await page.goto(BASE + surface.path, { waitUntil: 'networkidle' });
  if (surface.follow) {
    const href = await page.evaluate((src) => {
      const re = new RegExp(src);
      return [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).find((h) => re.test(h));
    }, surface.follow.source);
    if (href) await page.goto(BASE + href, { waitUntil: 'networkidle' });
  }
  await page.waitForTimeout(surface.settle ?? 600);
  return { ctx, page, errors, phone };
}

/**
 * Runs in the page with motion allowed. Reads the motion rules the way they
 * resolve (computed styles, so tokens are expanded) plus every loaded
 * stylesheet, inline <style> blocks included.
 */
function motionRules() {
  const ms = (v) => v.split(',').map((d) => (d.trim().endsWith('ms') ? parseFloat(d) : parseFloat(d) * 1000));
  const overshoot = (tf) => (tf.match(/cubic-bezier\(([^)]+)\)/g) || []).some((c) => {
    const [, y1, , y2] = c.slice(13, -1).split(',').map(Number);
    return y1 > 1 || y2 > 1 || y1 < 0 || y2 < 0;
  });
  const LAYOUT = /(^|,\s*)(width|height|max-height|max-width|min-height|padding[a-z-]*|margin[a-z-]*|top|left|right|bottom|inset)(\s|,|$)/;
  const out = { transitionAll: [], overshoot: [], slow: [], layoutAnim: [], hoverUngated: [], scaleZero: [] };
  const name = (el) => `${el.tagName.toLowerCase()}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''}`;
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el);
    const tDur = ms(cs.transitionDuration);
    if (tDur.some((d) => d > 0)) {
      if (/(^|,\s*)all(\s|,|$)/.test(cs.transitionProperty)) out.transitionAll.push(name(el));
      if (LAYOUT.test(cs.transitionProperty)) out.layoutAnim.push(`${name(el)} transition ${cs.transitionProperty}`);
      if (overshoot(cs.transitionTimingFunction)) out.overshoot.push(`${name(el)} ${cs.transitionTimingFunction}`);
      if (tDur.some((d) => d > 300)) out.slow.push(`${name(el)} ${cs.transitionDuration}`);
    }
    if (cs.animationName !== 'none') {
      const infinite = cs.animationIterationCount.includes('infinite');
      if (overshoot(cs.animationTimingFunction)) out.overshoot.push(`${name(el)} @${cs.animationName}`);
      if (!infinite && ms(cs.animationDuration).some((d) => d > 300)) out.slow.push(`${name(el)} @${cs.animationName} ${cs.animationDuration}`);
    }
  }
  const walk = (rules, gated) => {
    for (const r of rules) {
      if (r instanceof CSSMediaRule) walk(r.cssRules, gated || /hover\s*:\s*hover/.test(r.conditionText));
      else if (r instanceof CSSKeyframesRule) {
        for (const k of r.cssRules) {
          if (LAYOUT.test([...k.style].join(','))) out.layoutAnim.push(`@keyframes ${r.name}`);
          if (/scale\(0\)|scale\(0,/.test(k.style.transform)) out.scaleZero.push(`@keyframes ${r.name}`);
        }
      } else if (r instanceof CSSStyleRule) {
        if (r.selectorText.includes(':hover') && !gated) out.hoverUngated.push(r.selectorText.slice(0, 90));
        if (r.cssRules?.length) walk(r.cssRules, gated);
      } else if (r.cssRules) walk(r.cssRules, gated);
    }
  };
  for (const sheet of document.styleSheets) {
    try { walk(sheet.cssRules, false); } catch { /* cross-origin font sheet */ }
  }
  for (const k of Object.keys(out)) out[k] = [...new Set(out[k])];
  return out;
}

/**
 * Press feedback: force `:active` on each pressable through the DevTools
 * protocol and compare what it looks like before and after. A control whose
 * scale, transform, opacity, colours, shadow and filter are all unchanged
 * gives a finger no sign that it registered.
 */
async function pressFeedback(page, ctx) {
  const count = await page.evaluate(() => {
    const SEL = 'a[href],button,summary,[role=button],[role=tab],[role=switch],[role=menuitem],[role=option],label:has(> input)';
    let n = 0;
    for (const el of document.querySelectorAll(SEL)) {
      if (el.parentElement?.closest(SEL) || el.matches('main#main')) continue;
      if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2 || el.closest('[inert]')) continue;
      el.setAttribute('data-audit-press', String(n++));
    }
    return n;
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('DOM.enable');
  await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-audit-press]' });
  const snap = (i) => page.evaluate((idx) => {
    const el = document.querySelector(`[data-audit-press="${idx}"]`);
    const cs = getComputedStyle(el);
    return [cs.scale, cs.transform, cs.opacity, cs.backgroundColor, cs.color, cs.boxShadow, cs.borderColor, cs.filter, cs.textDecorationColor].join('|');
  }, i);
  const none = [];
  for (let i = 0; i < Math.min(nodeIds.length, count); i++) {
    const idx = await cdp.send('DOM.getAttributes', { nodeId: nodeIds[i] }).then((a) => a.attributes[a.attributes.indexOf('data-audit-press') + 1]);
    const before = await snap(idx);
    await cdp.send('CSS.forcePseudoState', { nodeId: nodeIds[i], forcedPseudoClasses: ['active'] });
    const after = await snap(idx);
    await cdp.send('CSS.forcePseudoState', { nodeId: nodeIds[i], forcedPseudoClasses: [] });
    if (before === after) {
      none.push(await page.evaluate((x) => {
        const el = document.querySelector(`[data-audit-press="${x}"]`);
        return `${el.tagName.toLowerCase()}.${String(el.className).trim().split(/\s+/).slice(0, 2).join('.')} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 28)}"`;
      }, idx));
    }
  }
  return { pressables: count, noPress: none };
}

async function motionPass(surface) {
  // Transitions are read with motion allowed: under reduced motion the global
  // safety net gives every element a non-zero duration on the default `all`.
  const mo = await openSurface(browser, surface, 375, 'light', { motion: true });
  await mo.page.waitForTimeout(400);
  const rules = await mo.page.evaluate(motionRules);
  const press = await pressFeedback(mo.page, mo.ctx);
  rows.push({ surface: surface.id, width: 375, theme: 'light', mode: 'motion', ...rules, ...press });
  await mo.ctx.close();
}

/** Keyboard focus at one phone width (the tab bar) and one desktop width (the full header). */
async function keyboardPass(surface) {
  for (const width of [390, 1280]) {
    for (const theme of THEMES) {
      const kb = await openSurface(browser, surface, width, theme);
      rows.push({ surface: surface.id, width, theme, mode: 'keyboard', ...(await walkFocus(kb.page)) });
      await kb.ctx.close();
    }
  }
}

const browser = await chromium.launch();
const rows = [];
const MOTION_ONLY = args.includes('--motion-only');
const KEYBOARD_ONLY = args.includes('--keyboard-only');
for (const surface of MOTION_ONLY || KEYBOARD_ONLY ? [] : SURFACES) {
  for (const width of WIDTHS) {
    for (const theme of THEMES) {
      const { ctx, page, errors, phone } = await openSurface(browser, surface, width, theme);
      try {
        const m = await page.evaluate(measure, { coarse: phone, phone });
        rows.push({ surface: surface.id, width, theme, url: page.url().replace(BASE, ''), errors, ...m });
      } catch (e) {
        rows.push({ surface: surface.id, width, theme, failed: String(e).slice(0, 200) });
      }
      await ctx.close();
    }
  }
  // High contrast and reduced transparency, at one phone width in both themes.
  for (const theme of THEMES) {
    const hc = await openSurface(browser, surface, 375, theme, { contrast: 'more' });
    const m = await hc.page.evaluate(measure, { coarse: true, phone: true });
    rows.push({ surface: surface.id, width: 375, theme, mode: 'contrast-more', contrastFail: m.contrastFail });
    await hc.ctx.close();
    const rt = await openSurface(browser, surface, 375, theme, { transparency: true });
    const blur = await rt.page.evaluate(() => [...document.querySelectorAll('body *')].filter((el) => {
      const cs = getComputedStyle(el);
      return cs.backdropFilter && cs.backdropFilter !== 'none' && el.getClientRects().length > 0;
    }).length);
    rows.push({ surface: surface.id, width: 375, theme, mode: 'reduced-transparency', blur });
    await rt.ctx.close();
  }
  await motionPass(surface);
  await keyboardPass(surface);
  process.stderr.write(`${surface.id} `);
}
if (MOTION_ONLY) for (const surface of SURFACES) await motionPass(surface);
if (KEYBOARD_ONLY) for (const surface of SURFACES) await keyboardPass(surface);
await browser.close();

// ---- summary ------------------------------------------------------------------
const base = rows.filter((r) => !r.mode && !r.failed);
const sum = (k) => base.reduce((n, r) => n + (Array.isArray(r[k]) ? r[k].length : r[k] || 0), 0);
const phones = base.filter((r) => r.width <= 430);
const keys = rows.filter((r) => r.mode === 'keyboard');
const summary = {
  loads: rows.length,
  failedLoads: rows.filter((r) => r.failed).map((r) => `${r.surface}@${r.width}/${r.theme}: ${r.failed}`),
  textUnder11: sum('under11'),
  minFontSize: Math.min(...base.map((r) => r.minFs)),
  proseUnder15OnPhones: phones.reduce((n, r) => n + r.proseUnder15.length, 0),
  footnoteUnder13OnPhones: phones.reduce((n, r) => n + (r.footnoteUnder13?.length ?? 0), 0),
  phonePMedianMin: Math.min(...phones.map((r) => r.pMedian ?? 99)),
  controlsMeasuredOnPhones: phones.reduce((n, r) => n + r.controls, 0),
  under44OnPhones: phones.reduce((n, r) => n + r.under44.length, 0),
  under24: sum('under24'),
  contrastFails: sum('contrastFail'),
  contrastFailsHighContrast: rows.filter((r) => r.mode === 'contrast-more').reduce((n, r) => n + r.contrastFail.length, 0),
  blurUnderReducedTransparency: rows.filter((r) => r.mode === 'reduced-transparency').reduce((n, r) => n + r.blur, 0),
  overflowLoads: base.filter((r) => r.overflow > 0).map((r) => `${r.surface}@${r.width}/${r.theme}+${r.overflow}px`),
  coveredOnPhones: phones.reduce((n, r) => n + r.covered.length, 0),
  ...Object.fromEntries(['transitionAll', 'overshoot', 'slow', 'layoutAnim', 'hoverUngated', 'scaleZero', 'noPress'].map((k) => [k, rows.filter((r) => r.mode === 'motion').reduce((n, r) => n + r[k].length, 0)])),
  pressables: rows.filter((r) => r.mode === 'motion').reduce((n, r) => n + r.pressables, 0),
  focusStops: keys.reduce((n, r) => n + r.stops, 0),
  focusNoRing: keys.reduce((n, r) => n + r.noRing.length, 0),
  focusObscured: keys.reduce((n, r) => n + r.obscured.length, 0),
  consoleErrorLoads: base.filter((r) => r.errors.length).map((r) => `${r.surface}@${r.width}/${r.theme}: ${r.errors[0]}`).slice(0, 10),
};
// Per-surface digest so a failure can be traced without opening the JSON.
const bySurface = {};
for (const r of base) {
  const s = (bySurface[r.surface] ??= { u11: 0, p15: 0, t44: 0, t24: 0, con: 0, cov: 0, ovf: 0, tall: 0 });
  s.u11 += r.under11.length;
  s.p15 += r.proseUnder15.length + (r.footnoteUnder13?.length ?? 0);
  s.t44 += r.under44.length;
  s.t24 += r.under24.length;
  s.con += r.contrastFail.length;
  s.cov += r.covered.length;
  s.ovf += r.overflow > 0 ? 1 : 0;
}
for (const r of rows.filter((x) => x.mode === 'motion')) {
  const s = (bySurface[r.surface] ??= {});
  Object.assign(s, { tall: r.transitionAll.length, over: r.overshoot.length, slow: r.slow.length, lay: r.layoutAnim.length, hov: r.hoverUngated.length, press: `${r.pressables - r.noPress.length}/${r.pressables}` });
}
for (const r of keys) {
  const s = (bySurface[r.surface] ??= {});
  s.ring = (s.ring ?? 0) + r.noRing.length;
  s.hid = (s.hid ?? 0) + r.obscured.length;
}
if (OUT) writeFileSync(OUT, JSON.stringify({ summary, bySurface, rows }, null, 1));
console.log(JSON.stringify(summary, null, 1));
console.table(bySurface);
