// Final film plates: each screen at 4x device scale plus the CSS-pixel boxes of
// the regions the edit frames, so camera moves land on real UI edges.
// Run after 01–04 (needs state-pre-lunch.json and the dev server on :3000).
process.env.DSF = '4';
import fs from 'node:fs';
import { open, BASE, settle, here } from './lib.mjs';
const OUT = process.argv[2] || here('../assets/plates');
fs.mkdirSync(OUT, { recursive: true });
const meta = { dsf: 4, width: 390, plates: {} };
const { browser, page } = await open({ state: here('state-pre-lunch.json') });

const boxes = (spec) => page.evaluate((spec) => {
  const out = {};
  for (const [key, [text, sel, nth = 0]] of Object.entries(spec)) {
    const match = (t) => (text.startsWith('^') ? t.startsWith(text.slice(1)) : t === text);
    const leaves = [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && match(e.textContent.trim()));
    const el = text.startsWith('@') ? document.querySelectorAll(text.slice(1))[nth]
      : leaves[nth] && (sel ? leaves[nth].closest(sel) : leaves[nth]);
    if (!el) { out[key] = null; continue; }
    const b = el.getBoundingClientRect();
    out[key] = { x: b.x + scrollX, y: b.y + scrollY, w: b.width, h: b.height };
  }
  return out;
}, spec);
// Plates are cropped to [y0, y0 + h): Chromium will not decode() an image much
// over 8 MP, and the film never frames the rest. Boxes are stored crop-relative.
async function plate(name, h, spec, y0 = 0) {
  await page.evaluate(() => { document.activeElement?.blur?.(); window.scrollTo(0, 0); });
  await settle(page, 500);
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: y0, width: 390, height: h } });
  const b = await boxes(spec);
  for (const k in b) if (b[k]) b[k].y -= y0;
  meta.plates[name] = { h, y0, boxes: b };
  const missing = Object.entries(meta.plates[name].boxes).filter(([, v]) => !v).map(([k]) => k);
  console.log(name, missing.length ? 'MISSING ' + missing : 'ok');
}
// The viewport always extends well past the crop, so the app's fixed bottom
// layer (tab bar, wallet chip, assistant button) never lands inside a plate.
async function go(route, h) {
  await page.setViewportSize({ width: 390, height: h + 900 });
  await page.goto(BASE + route, { waitUntil: 'networkidle' });
  await settle(page, 1500);
}

// Expense Tracker — the on-camera Quick add, before and after the tap.
await go('/tools/expenses', 4000);
const qa = page.locator('#fx-qa-input');
await qa.scrollIntoViewIfNeeded(); await qa.click();
const QA = { card: ['Quick add', '.card'], qa: ['Quick add', '.fx-qa'], add: ['Add', 'button'] };
// Every keystroke state of the on-camera entry, as the live parser renders it.
const LINE = '340 lunch upi';
{
  const b = await boxes(QA);
  const c = { x: 0, y: Math.round(b.card.y - 60), width: 390, height: 520 };
  for (let i = 0; i <= LINE.length; i++) {
    await qa.fill(LINE.slice(0, i)); await settle(page, 250);
    await page.screenshot({ path: `${OUT}/exp_key_${String(i).padStart(2, '0')}.png`, clip: c });
  }
}
await settle(page, 500);
// Clipped to the card: a full-page 4x capture takes longer than the 1.1 s
// "Added ✓" confirmation stays on screen.
const qaBoxes = await boxes(QA);
const y0 = Math.round(qaBoxes.card.y - 60), clipH = 520;
const clip = { x: 0, y: y0, width: 390, height: clipH };
const shift = (b) => Object.fromEntries(Object.entries(b).map(([k, v]) => [k, v && { ...v, y: v.y - y0 }]));
await page.screenshot({ path: `${OUT}/exp_typed.png`, clip });
meta.plates.exp_typed = { h: clipH, y0, boxes: shift(qaBoxes) };
await page.locator('.fx-qa-btn').click(); await settle(page, 150);
await page.screenshot({ path: `${OUT}/exp_added.png`, clip });
meta.plates.exp_added = { h: clipH, y0, boxes: shift(await boxes(QA)) };
await settle(page, 1500);
await plate('exp_after', 1100, { tiles: ['Monthly spent', '.dash-grid'], spent: ['Monthly spent', '.stat-cell'], remaining: ['Remaining budget', '.stat-cell'], budget: ['Monthly budget', '.stat-cell'] });

await go('/tools/dashboard', 1100);
await plate('dashboard', 1100, {
  hero: ['October 2026', 'section'], heading: ['October 2026', '.fx-dash-hero-main'],
  income: ['Budgeted income', '.stat-cell'], savings: ['Planned savings rate', '.stat-cell'],
  spent: ['Recorded spending', '.stat-cell'], left: ['Income less spending', '.stat-cell'],
});

await go('/tools/budget', 1700);
await plate('budget', 800, { split: ['Your budget split', '.card'], pn: ['@#bb-pct-needs'], pw: ['@#bb-pct-wants'], ps: ['@#bb-pct-save'], income: ['Monthly income', '.card'] }, 900);

await go('/tools/goals', 1300);
await plate('goals_input', 900, { form: ['Goal name', '.card'], target: ['^Target amount', '.fg'], years: ['Years to reach', '.fg'], name: ['Goal name', '.fg'], cta: ['Show me the path', 'button'] }, 280);
await page.getByRole('button', { name: /Show me the path/ }).click(); await settle(page, 1800);
await page.setViewportSize({ width: 390, height: 2800 }); await settle(page, 600);
await plate('goals_result', 1100, { title: ['Home down payment', null], aggressive: ['Aggressive path', '.card'], moderate: ['Moderate path', '.card'], conservative: ['Conservative path', '.card'] }, 300);

await go('/tools/lifemap', 1300);
const set = async (id, v) => { const f = page.locator('#' + id); await f.fill(v); await f.press('Tab'); };
await set('lm-name', 'Demo'); await set('lm-age', '28'); await set('lm-income', '85000'); await set('lm-expenses', '56200');
await set('lm-savings', '300000'); await set('lm-emergency', '100000'); await set('lm-invest', '200000');
await page.locator('#lm-sip-yn').selectOption('yes'); await settle(page, 300);
await set('lm-sip', '10000');
await page.getByRole('button', { name: /Own a home/ }).click(); await settle(page, 400);
await page.getByRole('button', { name: /Launch my LifeMap/ }).click(); await settle(page, 3500);
await plate('lifemap', 1000, { chart: ['Wealth projection', '.card'], canvas: ['@.lm-chart-row canvas'], welcome: ['Welcome, Demo', null] }, 60);

fs.writeFileSync(`${OUT}/plates.json`, JSON.stringify(meta, null, 1));
await browser.close();
