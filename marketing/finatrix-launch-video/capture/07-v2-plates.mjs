// Plates for the 56-second film: the rest of the toolkit, the forecast, and the
// website itself. Mobile at 4x, desktop at 2x, all from state-more.json (06).
import fs from 'node:fs';
import { open, BASE, settle, here, shooter } from './lib.mjs';
const OUT = process.argv[2] || here('../assets/plates2');
fs.mkdirSync(OUT, { recursive: true });
const meta = { plates: {} };
const go = async (page, route, h) => {
  await page.setViewportSize({ width: page.viewportSize().width, height: h });
  await page.goto(BASE + route, { waitUntil: 'networkidle' }); await settle(page, 1500);
};

/* ── mobile, 4x ─────────────────────────────────────────────────────── */
{
  const { browser, page } = await open({ state: here('state-more.json'), dsf: 4, viewport: { width: 390, height: 2400 } });
  const plate = shooter(page, OUT, meta);
  // The viewport always runs ~900px past the crop so the fixed bottom layer
  // (tab bar, wallet chip, assistant button) never lands in a plate.
  await go(page, '/tools/dashboard', 2400);
  await plate('dash', {
    hero: ['October 2026', 'section'], income: ['Budgeted income', '.stat-cell'], savings: ['Planned savings rate', '.stat-cell'],
    spent: ['Recorded spending', '.stat-cell'], left: ['Income less spending', '.stat-cell'],
  }, { h: 700 });

  await go(page, '/tools/expenses', 2600);
  await page.getByRole('tab', { name: 'Analytics' }).click(); await settle(page, 1500);
  await plate('forecast', { card: ['Month-end forecast', '.card'], figure: ['^₹63,842', null], advice: ['~On track to exceed', null], top: ['~Top category', null] }, { y0: 520, h: 900 });

  await go(page, '/tools/networth', 2400);
  await plate('networth', { kpis: ['Net worth', '.nw-kpis'], nw: ['Net worth', '.nw-kpi'], list: ['What you own', '.card'] }, { y0: 300, h: 1100 });

  // InvestMatch does not restore a result on revisit, so answer again (same answers as 06).
  await go(page, '/tools/investmatch', 2400);
  const next = () => page.getByRole('button', { name: /^Next$/ }).click();
  const num = async (v) => { await page.locator('main input').first().fill(v); await next(); await settle(page, 500); };
  const pick = async (t) => { await page.locator('main button').filter({ hasText: t }).first().click(); await settle(page, 500); };
  await num('28'); await num('85000'); await num('10000');
  await pick('Moderate'); await pick(/5.10 years/); await pick('Buy a house');
  await page.getByRole('button', { name: 'Build my portfolio' }).click(); await settle(page, 1500);
  await plate('invest', { alloc: ['Recommended allocation', '.card'], head: ['~Your Moderate portfolio', null], summary: ['Summary', '.card'] }, { y0: 230, h: 900 });

  await go(page, '/tools/parksmart', 2400);
  await page.getByRole('button', { name: /Find the best options/ }).click(); await settle(page, 1200);
  await page.evaluate(() => scrollTo(0, 0));
  await plate('park', { best: ['Best Match', '.card'], ranked: ['All options, ranked', null] }, { y0: 230, h: 900 });

  await go(page, '/tools/peercompare', 2400);
  const again = page.getByRole('button', { name: /See how I stack up/ });
  if (await again.count()) { await again.click(); await settle(page, 1200); }
  await plate('peer', { ring: ['percentile', '.card'], metrics: ['Metric by metric', null], m1: ['~Monthly income', '.card'] }, { y0: 230, h: 1000 });

  await go(page, '/', 2400);
  await plate('home_m', { h1: ['@h1'], caption: ['~No account needed to start', null], preview: ['@.fx-home-preview'] }, { y0: 60, h: 1100 });
  await browser.close();
}

/* ── desktop, 2x ────────────────────────────────────────────────────── */
{
  const { browser, page } = await open({ state: here('state-more.json'), dsf: 2, viewport: { width: 1440, height: 900 }, mobile: false });
  const plate = shooter(page, OUT, meta);
  // Crops start below the site navigation (which lists the web-only Careers
  // workspace) and stop short of the floating assistant button.
  await go(page, '/', 1800);
  await plate('desk_hero', { h1: ['@h1'], preview: ['@.fx-home-preview'] }, { y0: 60, h: 760 });
  const sc = await page.evaluate(() => { const r = document.querySelector('#showcase').getBoundingClientRect(); return { y: r.y + scrollY, h: r.height }; });
  await page.setViewportSize({ width: 1440, height: Math.ceil(sc.y + sc.h + 900) }); await settle(page, 800);
  await plate('desk_tools', { section: ['@#showcase'] }, { y0: Math.round(sc.y), h: Math.round(Math.min(sc.h, 1300)) });
  await go(page, '/tools/dashboard', 900);
  await plate('desk_dash', { hero: ['October 2026', 'section'], kpis: ['Budgeted income', '.fx-kpi-grid'], left: ['Income less spending', '.stat-cell'] }, { y0: 100, h: 730 });
  await browser.close();
}
fs.writeFileSync(`${OUT}/plates.json`, JSON.stringify(meta, null, 1));
