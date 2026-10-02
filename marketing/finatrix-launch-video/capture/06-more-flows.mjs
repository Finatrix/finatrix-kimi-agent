// The rest of the toolkit, driven through each tool's own form with the same
// fictional profile: ParkSmart, PeerCompare, InvestMatch and Net Worth.
import { open, BASE, settle, here } from './lib.mjs';
const { browser, ctx, page } = await open({ state: here('state-final.json') });
await page.setViewportSize({ width: 390, height: 2400 });

// ParkSmart — its own defaults: ₹1 L for 3–6 months at a 20% slab.
await page.goto(BASE + '/tools/parksmart', { waitUntil: 'networkidle' }); await settle(page, 1000);
await page.getByRole('button', { name: /Find the best options/ }).click(); await settle(page, 1200);

// PeerCompare — the demo profile (Mumbai is the tool's default city).
await page.goto(BASE + '/tools/peercompare', { waitUntil: 'networkidle' }); await settle(page, 1000);
const lab = async (t, v) => { const f = page.getByLabel(t, { exact: false }).first(); await f.fill(v); await f.press('Tab'); };
await lab('Your age', '28'); await lab('Monthly income', '85000'); await lab('Total savings', '300000');
await lab('Total investments', '200000'); await lab('Monthly savings rate', '32'); await lab('Monthly expenses', '56200');
await page.getByRole('button', { name: /See how I stack up/ }).click(); await settle(page, 1200);

// InvestMatch — six questions; option buttons advance on their own.
await page.goto(BASE + '/tools/investmatch', { waitUntil: 'networkidle' }); await settle(page, 1000);
const next = () => page.getByRole('button', { name: /^Next$/ }).click();
const num = async (v) => { await page.locator('main input').first().fill(v); await next(); await settle(page, 500); };
const pick = async (t) => { await page.locator('main button').filter({ hasText: t }).first().click(); await settle(page, 500); };
await num('28'); await num('85000'); await num('10000');
await pick('Moderate'); await pick(/5.10 years/); await pick('Buy a house');
await page.getByRole('button', { name: 'Build my portfolio' }).click(); await settle(page, 1200);

// Net Worth — three accounts through the add-account form (₹5 L in all).
await page.goto(BASE + '/tools/networth', { waitUntil: 'networkidle' }); await settle(page, 1000);
const acct = async (name, bal, cat) => {
  await page.getByPlaceholder('e.g. HDFC savings, Home loan').fill(name);
  const b = page.getByLabel(/Balance in/); await b.fill(String(bal)); await b.press('Tab');
  await page.locator('select').filter({ hasText: 'Cash & bank' }).first().selectOption({ label: cat });
  await page.getByRole('button', { name: /^Add account$/ }).click(); await settle(page, 900);
};
await page.getByRole('button', { name: /Add your first account/ }).click(); await settle(page, 600);
await acct('Savings account', 200000, 'Cash & bank');
for (const [n, b, c] of [['Emergency FD', 100000, 'Deposits (FD/RD)'], ['Mutual funds', 200000, 'Stocks & mutual funds']]) {
  await page.getByRole('button', { name: /Add (an )?account/ }).first().click(); await settle(page, 600);
  await acct(n, b, c);
}
await ctx.storageState({ path: here('state-more.json') });
console.log('state-more.json written');
await browser.close();
