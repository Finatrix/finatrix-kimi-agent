// Log fictional October spending through the Expense Tracker's own Quick add.
import os from 'node:os';
import { open, BASE, settle, here } from './lib.mjs';
const OUT = process.argv[2] || os.tmpdir(); // review stills only; plates come from 05
const { browser, ctx, page } = await open({ state: here('state-budget.json') });
await page.goto(BASE + '/tools/expenses', { waitUntil: 'networkidle' });
await settle(page, 1200);
const qa = page.locator('#fx-qa-input');
const add = page.locator('.fx-qa-btn');
for (const line of ['24000 rent yesterday bank transfer', '2150 groceries yesterday upi', '640 uber upi', '499 netflix card']) {
  await qa.fill(line); await settle(page, 250); await add.click(); await settle(page, 1300);
}
await ctx.storageState({ path: here('state-pre-lunch.json') });
// The on-camera entry: typed state, then confirmed state.
await qa.scrollIntoViewIfNeeded();
await qa.click();
await qa.pressSequentially('340 lunch upi', { delay: 40 });
await settle(page, 600);
await page.screenshot({ path: `${OUT}/exp_typed.png` });
await add.click();
await settle(page, 250);
await page.screenshot({ path: `${OUT}/exp_added.png` });
await settle(page, 1500);
await page.evaluate(() => (document.activeElement)?.blur?.());
await page.evaluate(() => window.scrollTo(0, 0)); await settle(page, 600);
await page.setViewportSize({ width: 390, height: 2600 }); await settle(page, 800);
await page.screenshot({ path: `${OUT}/exp_full.png` });
console.log(await page.evaluate(() => localStorage.getItem('fx_expenses')));
await ctx.storageState({ path: here('state-expenses.json') });
await browser.close();
