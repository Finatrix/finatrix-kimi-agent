// Fictional demo profile, entered through the app's own onboarding UI.
import os from 'node:os';
import { open, BASE, settle, here } from './lib.mjs';
const OUT = process.argv[2] || os.tmpdir(); // review stills only; plates come from 05
const { browser, ctx, page } = await open();
await page.goto(BASE + '/welcome', { waitUntil: 'networkidle' });
await settle(page);
await page.screenshot({ path: `${OUT}/onb0.png` });
const step = async (fill) => { await fill(); await settle(page, 300); await page.getByRole('button', { name: /^(Continue|Finish)$/ }).click(); await settle(page, 600); };
await step(() => page.locator('input[placeholder="50,000"]').fill('85000'));
await step(() => page.locator('.fx-onb-step input').first().fill('12000'));
await page.screenshot({ path: `${OUT}/onb2.png` });
await step(async () => {});
await step(async () => {
  await page.locator('input[placeholder="e.g. House down payment"]').fill('Home down payment');
  await page.locator('input[placeholder="20,00,000"]').fill('1500000');
  await page.locator('input[placeholder="10"]').fill('5');
});
await page.screenshot({ path: `${OUT}/onb4.png` });
console.log(page.url());
await ctx.storageState({ path: here('state-onboarded.json') });
await browser.close();
