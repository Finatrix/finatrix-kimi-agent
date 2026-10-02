// Run Reverse Goal Planner and LifeMap through their own forms with the demo profile.
import os from 'node:os';
import { open, BASE, settle, here } from './lib.mjs';
const OUT = process.argv[2] || os.tmpdir(); // review stills only; plates come from 05
const { browser, ctx, page } = await open({ state: here('state-expenses.json') });
await page.setViewportSize({ width: 390, height: 4200 });

await page.goto(BASE + '/tools/goals', { waitUntil: 'networkidle' }); await settle(page, 1200);
await page.screenshot({ path: `${OUT}/goals_input.png` });
await page.getByRole('button', { name: /Show me the path/ }).click(); await settle(page, 1800);
await page.evaluate(() => window.scrollTo(0, 0)); await settle(page, 400);
await page.screenshot({ path: `${OUT}/goals_result.png` });

await page.goto(BASE + '/tools/lifemap', { waitUntil: 'networkidle' }); await settle(page, 1200);
const set = async (id, v) => { const f = page.locator('#' + id); await f.fill(v); await f.press('Tab'); };
await set('lm-name', 'Demo'); await set('lm-age', '28'); await set('lm-income', '85000'); await set('lm-expenses', '56200');
await set('lm-savings', '300000'); await set('lm-emergency', '100000'); await set('lm-invest', '200000');
await page.locator('#lm-sip-yn').selectOption('yes'); await settle(page, 300);
await set('lm-sip', '10000');
await page.getByRole('button', { name: /Own a home/ }).click();
await settle(page, 400);
await page.screenshot({ path: `${OUT}/lm_input.png` });
await page.getByRole('button', { name: /Launch my LifeMap/ }).click(); await settle(page, 3500);
await page.evaluate(() => window.scrollTo(0, 0)); await settle(page, 600);
await page.screenshot({ path: `${OUT}/lm_result.png` });
await ctx.storageState({ path: here('state-final.json') });
await browser.close();
