import type { Page, WebSocketRoute } from '@playwright/test';
import { expect, test } from './support/fixtures';
import AxeBuilder from '@axe-core/playwright';
import { loadEnv } from 'vite';

/**
 * Groups (build step 2.3), in real browsers, against a fake backend. Every
 * Supabase request is answered here, including the Realtime socket, so no
 * real account, group or row is ever touched. The fake keeps state, so
 * creating, joining, adding and hearing a live change all go through the
 * app's real code paths.
 */

const backend = loadEnv('production', process.cwd(), 'VITE_').VITE_SUPABASE_URL;
const uid = '00000000-0000-4000-8000-0000000000a1';
const GROUP = '11111111-1111-4111-8111-111111111111';
const ME = '22222222-2222-4222-8222-222222222222';
const PRIYA = '33333333-3333-4333-8333-333333333333';

// page.route cannot stub a request that goes through the service worker.
test.use({ serviceWorkers: 'block' });

interface Fake {
  groups: Array<Record<string, unknown>>;
  members: Array<Record<string, unknown>>;
  expenses: Array<Record<string, unknown>>;
  budgets: Array<Record<string, unknown>>;
  goals: Array<Record<string, unknown>>;
  contributions: Array<Record<string, unknown>>;
  children: Array<Record<string, unknown>>;
  confirmed: boolean;
  joinCalls: Array<Record<string, unknown>>;
  expensePosts: Array<{ body: unknown; url: string; prefer: string }>;
  socket: WebSocketRoute | null;
  bindings: Array<{ id: number; event: string; table: string }>;
}

const now = () => new Date().toISOString();
const family = () => ({ id: GROUP, name: 'Sharma Family', emoji: '🏠', type: 'family', currency: 'INR', budget_together: true, split_costs: false, created_at: '2026-11-01T00:00:00Z' });
const memberRow = (id: string, name: string, role = 'member') => ({ id, group_id: GROUP, role, display_name: name, joined_at: '2026-11-01T00:00:00Z', left_at: null });

async function setUp(page: Page, opts: { inGroup?: boolean; confirmed?: boolean } = {}): Promise<Fake> {
  // CI's unconfigured bundle has no backend URL to stub; the deploy-time run (test:e2e:release) does.
  test.skip(!backend, 'This browser fixture requires a configured client URL.');
  const fake: Fake = {
    groups: opts.inGroup ? [family()] : [],
    members: opts.inGroup ? [memberRow(ME, 'Amma', 'admin'), memberRow(PRIYA, 'Priya')] : [],
    expenses: [], budgets: [], goals: [], contributions: [], children: [], confirmed: !!opts.confirmed, joinCalls: [], expensePosts: [], socket: null, bindings: [],
  };
  const user = { id: uid, aud: 'authenticated', role: 'authenticated', email: 'synthetic@example.invalid', email_confirmed_at: '2025-01-01T00:00:00Z', created_at: '2025-01-01T00:00:00Z', app_metadata: { provider: 'email' }, user_metadata: { full_name: 'Amma Sharma' } };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${Buffer.from(JSON.stringify({ sub: uid, exp: expires, role: 'authenticated' })).toString('base64url')}.synthetic-signature`;

  await page.route(`${backend}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname;
    const method = req.method();
    const body = req.postDataJSON?.() ?? null;
    if (path.includes('/auth/v1/user')) return route.fulfill({ json: user });
    if (path.includes('/rest/v1/tool_data')) return route.fulfill({ json: { data: {} } });
    if (path.endsWith('/rpc/my_group_memberships')) {
      return route.fulfill({ json: fake.groups.map((g) => ({ group_id: g.id, member_id: ME, role: 'admin' })) });
    }
    if (path.endsWith('/rpc/create_group')) {
      expect(body).toMatchObject({ p_name: 'Sharma Family', p_type: 'family', p_display_name: 'Amma', p_confirm_adult: true, p_currency: 'INR' });
      fake.groups.push({ ...family(), emoji: body.p_emoji });
      fake.members.push(memberRow(ME, 'Amma', 'admin'));
      fake.confirmed = true;
      return route.fulfill({ json: [{ group_id: GROUP, code: '7K2P9Q', expires_at: '2099-12-01T00:00:00Z' }] });
    }
    if (path.endsWith('/functions/v1/group-join')) {
      fake.joinCalls.push(body);
      const group = { name: 'Sharma Family', emoji: '🏠', type: 'family', members: 3 };
      if (body.action === 'preview') return route.fulfill({ json: { status: 'ok', group } });
      if (!body.confirmAdult) return route.fulfill({ json: { status: 'adult_confirmation_required', group } });
      fake.groups.push(family());
      fake.members.push(memberRow(ME, body.displayName));
      return route.fulfill({ json: { status: 'joined', group: { ...group, id: GROUP } } });
    }
    if (path.endsWith('/rest/v1/group_age_confirmations')) return route.fulfill({ json: fake.confirmed ? [{ confirmed_at: now() }] : [] });
    if (path.endsWith('/rest/v1/groups')) return route.fulfill({ json: fake.groups });
    if (path.endsWith('/rest/v1/group_members')) return route.fulfill({ json: fake.members });
    if (path.endsWith('/rest/v1/group_invites')) return route.fulfill({ json: [{ code: '7K2P9Q', expires_at: '2099-12-01T00:00:00Z' }] });
    if (path.endsWith('/rest/v1/group_budgets')) return route.fulfill({ json: fake.budgets });
    // Step 3.9: goals, contributions and children. Inserts are kept, stamped as the server would.
    for (const [table, list] of [['group_goals', fake.goals], ['group_goal_contributions', fake.contributions], ['group_dependents', fake.children]] as const) {
      if (!path.endsWith(`/rest/v1/${table}`)) continue;
      if (method === 'POST') {
        list.push({ ...(body as Record<string, unknown>), created_by: ME, created_at: now(), updated_by: ME, updated_at: now(), deleted_at: null });
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fulfill({ json: list });
    }
    if (path.endsWith('/rest/v1/group_expenses')) {
      if (method === 'POST') {
        fake.expensePosts.push({ body, url: req.url(), prefer: req.headers().prefer ?? '' });
        const rows = Array.isArray(body) ? body : [body];
        for (const r of rows) {
          if (!fake.expenses.some((e) => e.id === r.id)) {
            fake.expenses.push({ ...r, created_by: ME, created_at: now(), updated_by: ME, updated_at: now(), deleted_at: null });
          }
        }
        return route.fulfill({ status: 201, body: '' });
      }
      return route.fulfill({ json: fake.expenses });
    }
    return route.fulfill({ json: [] });
  });

  // Realtime: the Phoenix protocol, version 2 (JSON arrays), just enough to
  // join a channel and push a change to it.
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    fake.socket = ws;
    ws.onMessage((raw) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(String(raw));
      if (event === 'phx_join') {
        const changes = (payload?.config?.postgres_changes ?? []) as Array<{ event: string; table: string }>;
        // pushLive speaks for the group's own channel; other channels (goals) only need their join answered.
        if (topic === `realtime:group:${GROUP}`) fake.bindings = changes.map((c, i) => ({ id: i + 1, event: c.event, table: c.table }));
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

/** Push a row to the page as if another member had just saved it. */
function pushLive(fake: Fake, table: string, type: 'INSERT' | 'UPDATE', record: Record<string, unknown>) {
  const binding = fake.bindings.find((b) => b.table === table && b.event === type);
  if (!fake.socket || !binding) throw new Error('not subscribed');
  const columns = Object.keys(record).map((name) => ({ name, type: name === 'amount' ? 'numeric' : 'text' }));
  fake.socket.send(JSON.stringify([null, null, `realtime:group:${GROUP}`, 'postgres_changes', {
    ids: [binding.id],
    data: { schema: 'public', table, commit_timestamp: now(), type, errors: null, columns, record },
  }]));
}

test.describe('Groups', () => {
  test('create a group, then invite with a code, a link and a QR', async ({ page }) => {
    await setUp(page);
    await page.goto('/tools/groups');
    await expect(page.getByText('No groups yet')).toBeVisible();
    await page.getByRole('button', { name: 'Create a group' }).click();

    const sheet = page.getByRole('dialog', { name: 'Create a group' });
    await expect(sheet.getByLabel(/Family/)).toBeChecked();
    await sheet.getByLabel('Name', { exact: true }).fill('Sharma Family');
    await expect(sheet.getByLabel('Your name in the group')).toHaveValue('Amma Sharma');
    await sheet.getByLabel('Your name in the group').fill('Amma');
    await sheet.getByRole('button', { name: 'Create group' }).click();
    await expect(sheet.getByRole('alert')).toContainText('18 or over');
    await sheet.getByLabel(/I am 18 or over/).check();
    await sheet.getByRole('button', { name: 'Create group' }).click();

    const invite = page.getByRole('dialog', { name: 'Invite to Sharma Family' });
    await expect(invite.getByTestId('grp-code')).toHaveText('FX-7K2P9Q');
    await expect(invite.getByRole('img', { name: /QR code that opens the invite/ })).toBeVisible();
    // Measure only once the sheet has stopped moving: axe reads colours mid-fade.
    await page.evaluate(() => Promise.all(document.getAnimations().map((x) => x.finished.catch(() => {}))));
    const results = await new AxeBuilder({ page }).include('[role="dialog"]').analyze();
    expect(results.violations.map((v) => [v.id, v.nodes.map((n) => n.target.join(' ') + ' :: ' + (n.any[0]?.message ?? ''))])).toEqual([]);
    await invite.getByRole('button', { name: 'Close' }).first().click();

    await expect(page.getByRole('heading', { name: 'Sharma Family' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Budget together' })).toBeVisible();
  });

  test('an invite link shows the join card first, then asks for 18+ once', async ({ page }) => {
    const fake = await setUp(page);
    await page.goto('/tools/groups?join=fx-7k2p9q');
    const sheet = page.getByRole('dialog', { name: 'Join Sharma Family?' });
    await expect(sheet.getByTestId('grp-join-card')).toContainText('3 members');
    expect(fake.joinCalls[0]).toEqual({ code: '7K2P9Q', action: 'preview' });

    await sheet.getByLabel('Your name in the group').fill('Riya');
    await sheet.getByLabel(/I am 18 or over/).check();
    await sheet.getByRole('button', { name: 'Join group' }).click();
    await expect(page.getByRole('heading', { name: 'Sharma Family' })).toBeVisible();
    expect(fake.joinCalls[1]).toEqual({ code: '7K2P9Q', action: 'join', displayName: 'Riya', confirmAdult: true });
    await expect(page).not.toHaveURL(/join=/);
  });

  test('the add-expense form sends to a group, queues offline and resends without duplicates', async ({ page, context }) => {
    const fake = await setUp(page, { inGroup: true, confirmed: true });
    await page.goto('/tools/groups');
    await page.getByRole('button', { name: /Sharma Family/ }).click();
    await expect(page.getByTestId('grp-live')).toHaveText('Live');
    await page.getByRole('link', { name: 'Add an expense' }).click();

    const form = page.getByRole('dialog', { name: 'Add a transaction' });
    await expect(form.getByLabel('Add to')).toHaveValue(GROUP);
    // Personal-only fields step aside for a group expense.
    await expect(form.getByLabel('Payment method')).toHaveCount(0);
    await form.getByLabel(/^Amount/).fill('1200');
    await form.getByLabel('Merchant').fill('BigBasket');

    await context.setOffline(true);
    await form.getByRole('button', { name: 'Add to group' }).click();
    await expect(page.getByText(/Saved on this phone/)).toBeVisible();
    expect(fake.expensePosts).toHaveLength(0);
    const queued = await page.evaluate(() => JSON.parse(localStorage.getItem('fx_group_outbox') ?? '[]'));
    expect(queued).toHaveLength(1);

    await context.setOffline(false);
    await expect.poll(() => fake.expensePosts.length).toBe(1);
    const post = fake.expensePosts[0];
    expect(post.url).toContain('on_conflict=id');
    expect(post.prefer).toContain('resolution=ignore-duplicates');
    expect(post.body).toMatchObject({ id: queued[0].key, group_id: GROUP, amount: 1200, category: expect.any(String), note: 'BigBasket', paid_by: ME, split_rule: null, shares: null });
    await expect.poll(() => page.evaluate(() => localStorage.getItem('fx_group_outbox'))).toBeNull();
  });

  test('the live feed shows another member’s change at once, with who made it', async ({ page }) => {
    const fake = await setUp(page, { inGroup: true, confirmed: true });
    await page.goto(`/tools/groups?g=${GROUP}`);
    await expect(page.getByTestId('grp-live')).toHaveText('Live');

    const added = { id: '44444444-4444-4444-8444-444444444444', group_id: GROUP, amount: 1200, category: 'groceries', note: null, spent_on: new Date().toISOString().slice(0, 8) + '01', paid_by: PRIYA, split_rule: null, shares: null, created_by: PRIYA, created_at: now(), updated_by: PRIYA, updated_at: now(), deleted_at: null };
    pushLive(fake, 'group_expenses', 'INSERT', added);
    await expect(page.getByTestId('grp-feed')).toContainText('Priya added ₹1,200 · Groceries');
    await expect(page.getByTestId('grp-spent')).toContainText('₹1,200');
    await expect(page.getByTestId('grp-members-added')).toContainText('Priya');

    pushLive(fake, 'group_expenses', 'UPDATE', { ...added, amount: 1500, updated_by: ME, updated_at: new Date(Date.now() + 5000).toISOString() });
    await expect(page.getByTestId('grp-feed')).toContainText('Edited by you');
    await expect(page.getByTestId('grp-spent')).toContainText('₹1,500');

    const results = await new AxeBuilder({ page }).include('main').analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);
  });

  test('save together: a goal, money put aside, and the progress everyone sees (step 3.9)', async ({ page }) => {
    const fake = await setUp(page, { inGroup: true, confirmed: true });
    await page.goto(`/tools/groups?g=${GROUP}`);
    const goals = page.getByTestId('grp-goals');
    await goals.getByRole('button', { name: 'New goal' }).click();
    await page.getByLabel('Name', { exact: true }).fill('Goa holiday');
    await page.getByLabel(/^Target/).fill('60000');
    await page.getByRole('button', { name: 'Add goal' }).click();
    await expect(goals.getByText('Goa holiday')).toBeVisible();
    expect(fake.goals[0]).toMatchObject({ group_id: GROUP, name: 'Goa holiday', target: 60000 });

    await goals.getByRole('button', { name: 'Add money' }).click();
    await page.getByLabel(/^Amount/).fill('15000');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    expect(fake.contributions[0]).toMatchObject({ goal_id: fake.goals[0].id, member_id: ME, amount: 15000 });
    await expect(goals.getByRole('progressbar', { name: 'Goa holiday: 25% saved' })).toBeVisible();
  });

  test('children: a first name with the parent’s confirmation, never without (step 3.9)', async ({ page }) => {
    const fake = await setUp(page, { inGroup: true, confirmed: true });
    await page.goto(`/tools/groups?g=${GROUP}`);
    const kids = page.getByTestId('grp-children');
    await kids.getByRole('button', { name: 'Add a child' }).click();
    await page.getByLabel('First name').fill('Aarav');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText('Confirm you’re their parent or guardian.');
    expect(fake.children).toHaveLength(0);
    await page.getByLabel(/I’m their parent or guardian/).check();
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(kids.getByText('Aarav')).toBeVisible();
    expect(fake.children[0]).toMatchObject({ group_id: GROUP, display_name: 'Aarav', guardian_confirmed: true });
  });

  test('signed out, an invite link asks to sign in and keeps the code', async ({ page }) => {
    // Without a backend the page can't offer sign-in at all (the unconfigured CI bundle).
    test.skip(!backend, 'This browser fixture requires a configured client URL.');
    await page.goto('/tools/groups?join=FX-7K2P9Q');
    await expect(page.getByText('Sign in to join the group')).toBeVisible();
    await expect(page.locator('.fx-page').getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', /next=%2Ftools%2Fgroups%3Fjoin%3DFX-7K2P9Q/);
  });
});
