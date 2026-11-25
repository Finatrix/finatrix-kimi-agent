import type { Page, WebSocketRoute } from '@playwright/test';
import { expect, test } from './support/fixtures';
import AxeBuilder from '@axe-core/playwright';
import { loadEnv } from 'vite';

/**
 * Groups, Split costs (build step 2.4), in real browsers, against a fake
 * backend, as in groups.spec.ts: every Supabase request and the Realtime socket
 * are answered here, so no real account, group or row is ever touched.
 */

const backend = loadEnv('production', process.cwd(), 'VITE_').VITE_SUPABASE_URL;
const uid = '00000000-0000-4000-8000-0000000000a1';
const GROUP = '11111111-1111-4111-8111-111111111111';
const ME = '22222222-2222-4222-8222-222222222222';
const PRIYA = '33333333-3333-4333-8333-333333333333';
const RAHUL = '44444444-4444-4444-8444-444444444444';

// page.route cannot stub a request that goes through the service worker.
test.use({ serviceWorkers: 'block' });

interface Fake {
  expenses: Array<Record<string, unknown>>;
  settlements: Array<Record<string, unknown>>;
  expensePosts: Array<Record<string, unknown>>;
  settlementPosts: Array<Record<string, unknown>>;
  /** The cloud sync row, kept so a reload sees what the app saved (the tracker syncs like any signed-in session). */
  toolData: { data: unknown; updated_at: string } | null;
  socket: WebSocketRoute | null;
  bindings: Array<{ id: number; event: string; table: string }>;
}

const now = () => new Date().toISOString();
const ymd = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const trip = () => ({ id: GROUP, name: 'Goa trip', emoji: '✈️', type: 'trip', currency: 'INR', budget_together: false, split_costs: true, created_at: '2026-11-01T00:00:00Z' });
const memberRow = (id: string, name: string, role = 'member') => ({ id, group_id: GROUP, role, display_name: name, joined_at: `2026-11-01T00:00:0${id === ME ? 0 : id === PRIYA ? 1 : 2}Z`, left_at: null });
const equal3 = [{ member: ME, value: 1 }, { member: PRIYA, value: 1 }, { member: RAHUL, value: 1 }];
const dinner = (id: string, paidBy: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id, group_id: GROUP, amount, category: 'eating_out', note: 'Dinner', spent_on: ymd(), paid_by: paidBy, split_rule: 'equal', shares: equal3,
  created_by: paidBy, created_at: now(), updated_by: paidBy, updated_at: now(), deleted_at: null, ...extra,
});

async function setUp(page: Page, seed: Array<Record<string, unknown>> = []): Promise<Fake> {
  // CI's unconfigured bundle has no backend URL to stub; the deploy-time run (test:e2e:release) does.
  test.skip(!backend, 'This browser fixture requires a configured client URL.');
  const fake: Fake = { expenses: [...seed], settlements: [], expensePosts: [], settlementPosts: [], toolData: null, socket: null, bindings: [] };
  const members = [memberRow(ME, 'Amma', 'admin'), memberRow(PRIYA, 'Priya'), memberRow(RAHUL, 'Rahul')];
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', email_confirmed_at: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Amma Sharma' } };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, exp: expires, role: 'authenticated' })).toString('base64url')}.synthetic-signature`;

  await page.route(`${backend}/**`, async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    const method = req.method();
    const body = req.postDataJSON?.() ?? null;
    if (path.includes('/auth/v1/user')) return route.fulfill({ json: user });
    if (path.includes('/rest/v1/tool_data')) {
      if (method === 'GET') return route.fulfill({ json: fake.toolData ?? { data: {} } });
      if (body?.data) fake.toolData = { data: body.data, updated_at: now() };
      return route.fulfill({ json: { updated_at: fake.toolData?.updated_at ?? now() } });
    }
    if (path.endsWith('/rpc/my_group_memberships')) return route.fulfill({ json: [{ group_id: GROUP, member_id: ME, role: 'admin' }] });
    if (path.endsWith('/rest/v1/group_age_confirmations')) return route.fulfill({ json: [{ confirmed_at: now() }] });
    if (path.endsWith('/rest/v1/groups')) return route.fulfill({ json: [trip()] });
    if (path.endsWith('/rest/v1/group_members')) return route.fulfill({ json: members });
    if (path.endsWith('/rest/v1/group_invites')) return route.fulfill({ json: [{ code: '7K2P9Q', expires_at: '2099-12-01T00:00:00Z' }] });
    if (path.endsWith('/rest/v1/group_budgets')) return route.fulfill({ json: [] });
    if (path.endsWith('/rest/v1/group_settlements')) {
      if (method === 'POST') {
        const rows = Array.isArray(body) ? body : [body];
        for (const r of rows) {
          fake.settlementPosts.push(r);
          if (!fake.settlements.some((s) => s.id === r.id)) fake.settlements.push({ ...r, created_by: ME, created_at: now(), updated_by: ME, updated_at: now(), deleted_at: null });
        }
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fulfill({ json: fake.settlements });
    }
    if (path.endsWith('/rest/v1/group_expenses')) {
      if (method === 'POST') {
        const rows = Array.isArray(body) ? body : [body];
        for (const r of rows) {
          fake.expensePosts.push(r);
          if (!fake.expenses.some((e) => e.id === r.id)) fake.expenses.push({ ...r, created_by: ME, created_at: now(), updated_by: ME, updated_at: now(), deleted_at: null });
        }
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fulfill({ json: fake.expenses });
    }
    return route.fulfill({ json: [] });
  });

  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    fake.socket = ws;
    ws.onMessage((raw) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(String(raw));
      if (event === 'phx_join') {
        const changes = (payload?.config?.postgres_changes ?? []) as Array<{ event: string; table: string }>;
        fake.bindings = changes.map((c, i) => ({ id: i + 1, event: c.event, table: c.table }));
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: { postgres_changes: changes.map((c, i) => ({ ...c, id: i + 1 })) } }]));
      } else {
        ws.send(JSON.stringify([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }]));
      }
    });
  });

  await page.addInitScript(({ backend: b, user: u, token: t, expires: e, uid: id }) => {
    const key = `sb-${new URL(b).hostname.split('.')[0]}-auth-token`;
    localStorage.setItem(key, JSON.stringify({ access_token: t, refresh_token: 'synthetic-refresh', expires_at: e, expires_in: 3600, token_type: 'bearer', user: u }));
    localStorage.setItem('fx_has_session', '1');
    localStorage.setItem('fx_last_uid', id);
  }, { backend, user, token, expires, uid });
  return fake;
}

function pushLive(fake: Fake, table: string, type: 'INSERT' | 'UPDATE', record: Record<string, unknown>) {
  const binding = fake.bindings.find((b) => b.table === table && b.event === type);
  if (!fake.socket || !binding) throw new Error('not subscribed');
  const columns = Object.keys(record).map((name) => ({ name, type: name === 'amount' ? 'numeric' : name === 'shares' ? 'jsonb' : 'text' }));
  fake.socket.send(JSON.stringify([null, null, `realtime:group:${GROUP}`, 'postgres_changes', {
    ids: [binding.id],
    data: { schema: 'public', table, commit_timestamp: now(), type, errors: null, columns, record },
  }]));
}

/** The copies of group expenses in this phone's own ledger. */
const copies = (page: Page) => page.evaluate(() => (JSON.parse(localStorage.getItem('fx_expenses') ?? '[]') as Array<Record<string, unknown>>)
  .filter((e) => String(e.id).startsWith('tx_grp_')));

test.describe('Groups: Split costs', () => {
  test('paid by you, split equally by default, one tap to shares or exact; your share lands in your tracker once', async ({ page }) => {
    const fake = await setUp(page);
    await page.goto(`/tools/groups?g=${GROUP}`);
    await expect(page.getByTestId('grp-live')).toHaveText('Live');
    await page.getByRole('link', { name: 'Add an expense' }).click();

    const form = page.getByRole('dialog', { name: 'Add a transaction' });
    await expect(form.getByLabel('Add to')).toHaveValue(GROUP);
    await expect(form.getByLabel('Paid by')).toHaveValue(ME);
    await expect(form.getByLabel('Equally')).toBeChecked();
    await form.getByLabel(/^Amount/).fill('1000');
    await form.getByLabel('Merchant').fill('Beach shack');

    // Exact amounts must add up: the form says how much is left.
    await form.getByLabel('Exact amounts').check();
    await form.getByLabel('Your part').first().fill('400');
    await expect(form.getByTestId('split-fields')).toContainText('left to assign');
    await form.getByRole('button', { name: 'Add to group' }).click();
    await expect(form.getByTestId('split-fields')).toContainText('left to assign');
    expect(fake.expensePosts).toHaveLength(0);

    await form.getByLabel('Equally').check();
    await expect(form.getByTestId('split-fields')).toContainText('₹333.34');
    await form.getByRole('button', { name: 'Add to group' }).click();

    await expect.poll(() => fake.expensePosts.length).toBe(1);
    expect(fake.expensePosts[0]).toMatchObject({
      group_id: GROUP, amount: 1000, paid_by: ME, split_rule: 'equal', note: 'Beach shack',
      shares: [{ member: ME, value: 1 }, { member: PRIYA, value: 1 }, { member: RAHUL, value: 1 }],
    });

    // Your share, and only your share, is in your own tracker, marked with the group's name.
    await expect.poll(async () => (await copies(page)).length).toBe(1);
    const [copy] = await copies(page);
    expect(copy).toMatchObject({ amount: 333.34, tags: ['Goa trip'], date: ymd() });
    expect(copy.id).toBe(`tx_grp_${fake.expensePosts[0].id}`);

    // Opening the tracker, going back and reconnecting never makes a second one.
    await page.goto('/tools/expenses');
    await expect(page.getByText('Goa trip').first()).toBeVisible();
    await page.reload();
    await page.waitForTimeout(500);
    expect(await copies(page)).toHaveLength(1);
  });

  test('balances, the fewest payments, Mark as paid and a WhatsApp reminder', async ({ page }) => {
    // Priya paid 900 (I owe 300, Rahul owes 300); I paid 600 for the three (they owe me 200 each).
    const fake = await setUp(page, [dinner('e1', PRIYA, 900), dinner('e2', ME, 600, { note: 'Cab' })]);
    await page.goto(`/tools/groups?g=${GROUP}`);
    await expect(page.getByTestId('grp-live')).toHaveText('Live');

    // Balances: me 600-300-200=+100 owed... ME paid 600, owes 300+200 = 500 -> +100; Priya +900-300-200 = +400; Rahul -500.
    const balances = page.getByTestId('grp-balances');
    await expect(balances).toContainText('Priya is owed ₹400.00');
    await expect(balances).toContainText('You are owed ₹100.00');
    await expect(balances).toContainText('Rahul owes ₹500.00');
    const payments = page.getByTestId('grp-payments');
    await expect(payments.getByTestId('grp-payment')).toHaveCount(2);
    await expect(payments).toContainText('Rahul pays Priya');

    // I am owed by Rahul: a reminder I send myself through WhatsApp.
    const row = payments.getByTestId('grp-payment').filter({ hasText: 'Rahul pays you' });
    const href = await row.getByRole('link', { name: 'Remind Rahul on WhatsApp' }).getAttribute('href');
    expect(href).toMatch(/^https:\/\/wa\.me\/\?text=/);
    const text = decodeURIComponent(href!.replace('https://wa.me/?text=', ''));
    expect(text).toContain('Rahul');
    expect(text).toContain('₹100.00');
    expect(text).toContain('Goa trip');

    // Mark that payment as paid: a settlement row is written, and the balance updates.
    await row.getByRole('button', { name: 'Mark as paid' }).click();
    const sheet = page.getByRole('dialog', { name: 'Mark as paid' });
    await sheet.getByRole('button', { name: 'Mark as paid' }).click();
    await expect.poll(() => fake.settlementPosts.length).toBe(1);
    expect(fake.settlementPosts[0]).toMatchObject({ group_id: GROUP, from_member: RAHUL, to_member: ME, amount: 100, settled_on: ymd() });
    await expect(balances).toContainText('You are settled up');
    await expect(page.getByTestId('grp-feed')).toContainText('Rahul paid you ₹100.00');

    const results = await new AxeBuilder({ page }).include('main').analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('a live edit and delete change your copy; your own spending counts only your share', async ({ page }) => {
    const fake = await setUp(page);
    await page.goto(`/tools/groups?g=${GROUP}`);
    await expect(page.getByTestId('grp-live')).toHaveText('Live');

    const row = dinner('55555555-5555-4555-8555-555555555555', PRIYA, 900);
    pushLive(fake, 'group_expenses', 'INSERT', row);
    await expect.poll(async () => (await copies(page)).map((c) => c.amount)).toEqual([300]);

    // The same event again (a reconnect) changes nothing.
    pushLive(fake, 'group_expenses', 'INSERT', row);
    await page.waitForTimeout(300);
    expect(await copies(page)).toHaveLength(1);

    pushLive(fake, 'group_expenses', 'UPDATE', { ...row, amount: 1200, updated_by: PRIYA, updated_at: new Date(Date.now() + 5000).toISOString() });
    await expect.poll(async () => (await copies(page)).map((c) => c.amount)).toEqual([400]);

    pushLive(fake, 'group_expenses', 'UPDATE', { ...row, amount: 1200, deleted_at: new Date(Date.now() + 9000).toISOString(), updated_at: new Date(Date.now() + 9000).toISOString(), updated_by: PRIYA });
    await expect.poll(async () => (await copies(page)).length).toBe(0);
    const tombstones = await page.evaluate(() => JSON.parse(localStorage.getItem('fx_expense_tombstones') ?? '{}'));
    expect(Object.keys(tombstones)).toEqual([`tx_grp_${row.id}`]);
  });
});
