// Fill fictional October category plans through Budget Builder's own fields.
import { open, BASE, settle, here } from './lib.mjs';
const PLAN = {
  'Rent': 24000, 'Groceries': 7000, 'Utilities / Bills': 3500, 'Transport': 3500, 'Insurance': 2000, 'Phone': 600, 'Internet': 900,
  'Eating Out': 5000, 'Going Out': 2500, 'Shopping': 4000, 'Subscriptions': 1200, 'Entertainment': 2000,
  'Stocks / Equity': 10000, 'Home Deposit': 5000,
};
const { browser, ctx, page } = await open({ state: here('state-onboarded.json') });
await page.goto(BASE + '/tools/budget', { waitUntil: 'networkidle' });
await settle(page, 1200);
for (const [name, v] of Object.entries(PLAN)) {
  const f = page.getByLabel(`${name} amount (₹)`, { exact: true });
  await f.scrollIntoViewIfNeeded(); await f.fill(String(v)); await f.press('Tab'); await settle(page, 150);
}
await page.evaluate(() => document.activeElement?.blur?.());
await settle(page, 1000);
console.log(await page.evaluate(() => localStorage.getItem('fx_bb_data')));
await ctx.storageState({ path: here('state-budget.json') });
await browser.close();
