// End-to-end check of groups (build step 2.2) with no Docker, no credentials
// and nothing installed in the repo. Real Postgres (PGlite: Postgres compiled
// to WebAssembly) is set up the way Supabase sets up a project, the real
// migration runs on it twice, and then:
//   1. supabase/probes/groups_rls_probe.sql proves every policy, privilege and
//      membership rule, acting as each kind of caller, and rolls itself back;
//   2. the real `group-join` function runs with its Supabase calls answered by
//      that same database, so what it sends meets the SQL that will judge it.
//
//   deno run --node-modules-dir=none --no-lock -A supabase/functions/_e2e/groups.ts
//
// Not a deployed function (the leading underscore keeps it out of the deploy
// and drift lists). The first run downloads PGlite and the function's imports.
import { PGlite } from 'npm:@electric-sql/pglite@0.3';
import { privateQuotaKey } from '../_shared/sharedQuota.ts';

const ROOT = new URL('../../../', import.meta.url);
const read = (path: string) => Deno.readTextFile(new URL(path, ROOT));
const checks: Array<[string, boolean, unknown]> = [];
const check = (name: string, ok: boolean, detail?: unknown) => checks.push([name, ok, detail]);

const db = new PGlite();

// ── A database shaped like a Supabase project ─────────────────────────────
await db.exec(`
  create role anon nologin noinherit;
  create role authenticated nologin noinherit;
  create role service_role nologin noinherit bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text);
  -- Supabase's auth.uid(): the subject of the JWT claims PostgREST sets per request.
  create function auth.uid() returns uuid language sql stable as $$
    select nullif(coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''),
                           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'), '')::uuid
  $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  -- Supabase grants every new public object to the API roles, so the
  -- migration has to take back what it doesn't mean to give.
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  create publication supabase_realtime;
`);

// What the migration builds on: the shared quota table and its counter, taken
// from the schema file that defines them in production.
const infra = await read('supabase/careers_provider_infrastructure.sql');
const pick = (re: RegExp) => {
  const m = infra.match(re);
  if (!m) throw new Error(`careers_provider_infrastructure.sql no longer has ${re}`);
  return m[0];
};
await db.exec(pick(/create table if not exists public\.provider_quota[\s\S]*?\n\);/));
await db.exec(pick(/create or replace function public\.increment_provider_quota[\s\S]*?end \$\$;/));
await db.exec('revoke execute on function public.increment_provider_quota(text, text, int, int) from public, anon, authenticated;');

const migration = await read('supabase/migrations/20261124000100_groups.sql');
await db.exec(migration);
try {
  await db.exec(migration);
  check('the migration can run twice', true);
} catch (e) {
  check('the migration can run twice', false, (e as Error).message);
}

// ── 1. The policy probe ───────────────────────────────────────────────────
try {
  await db.exec(await read('supabase/probes/groups_rls_probe.sql'));
  check('the probe rolls itself back', false, 'it finished without raising RESULT');
} catch (e) {
  const message = String((e as Error).message);
  const m = message.match(/RESULT (\[[\s\S]*\])/);
  if (!m) check('the probe ran to the end', false, message);
  else for (const r of JSON.parse(m[1]) as Array<{ check: string; ok: boolean }>) check(`probe: ${r.check}`, r.ok);
}
const leftover = await db.query<{ n: number }>(
  'select ((select count(*) from auth.users) + (select count(*) from public.groups) + (select count(*) from public.group_members))::int as n',
);
check('the probe left nothing behind', leftover.rows[0].n === 0, leftover.rows[0].n);

// ── 2. The group-join function, against this database ─────────────────────
type Person = { id: string; token: string; name?: string };
const people: Person[] = [];
async function person(name?: string): Promise<Person> {
  const p = { id: crypto.randomUUID(), token: `user-${crypto.randomUUID()}`, name };
  await db.query('insert into auth.users (id, email) values ($1, $2)', [p.id, `e2e-${p.id}@groups.invalid`]);
  people.push(p);
  return p;
}
async function as<T>(role: 'authenticated' | 'service_role', sub: string | null, sql: string, params: unknown[] = []) {
  return await db.transaction(async (tx) => {
    await tx.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub, role })]);
    await tx.exec(`set local role ${role}`);
    return (await tx.query<{ r: T }>(sql, params)).rows[0]?.r as T;
  });
}

let quotaDown = false;
/** PostgREST's /rpc for the service role: named arguments, run as service_role. */
async function rpc(fn: string, args: Record<string, unknown>): Promise<Response> {
  if (fn === 'increment_provider_quota' && quotaDown) return Response.json({ message: 'unavailable' }, { status: 503 });
  const names = Object.keys(args);
  if (!names.every((n) => /^p_[a-z_]+$/.test(n))) return Response.json({ message: 'bad argument' }, { status: 400 });
  try {
    const sql = `select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}`).join(', ')}) as r`;
    return Response.json(await as('service_role', null, sql, names.map((n) => args[n])));
  } catch (e) {
    return Response.json({ message: String((e as Error).message) }, { status: 400 });
  }
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const req = input instanceof Request ? input : null;
  const url = new URL(req ? req.url : String(input));
  if (url.origin !== 'http://supabase.mock') return realFetch(input, init);
  const headers = new Headers(req ? req.headers : init.headers);
  const auth = (headers.get('Authorization') ?? '').replace(/^Bearer /, '');
  if (url.pathname === '/auth/v1/user') {
    const who = people.find((p) => p.token === auth);
    return who
      ? Response.json({ id: who.id, aud: 'authenticated', app_metadata: {}, user_metadata: who.name ? { full_name: who.name } : {} })
      : Response.json({ code: 401, msg: 'invalid JWT' }, { status: 401 });
  }
  const fn = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/)?.[1];
  if (fn) {
    if (auth !== 'service') return Response.json({ message: 'service role only' }, { status: 401 });
    const body = req ? await req.text() : String(init.body ?? '{}');
    return rpc(fn, JSON.parse(body || '{}'));
  }
  return Response.json({ message: `unexpected ${url.pathname}` }, { status: 404 });
}) as typeof fetch;

Deno.env.set('SUPABASE_URL', 'http://supabase.mock');
Deno.env.set('SUPABASE_ANON_KEY', 'anon');
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service');

const handlers: Array<(r: Request) => Promise<Response>> = [];
(Deno as unknown as { serve: unknown }).serve = (h: (r: Request) => Promise<Response>) => {
  handlers.push(h);
  return { finished: Promise.resolve(), shutdown() {} };
};
await import(new URL('supabase/functions/group-join/index.ts', ROOT).href);
const [groupJoin] = handlers;

let ipCounter = 0;
const nextIp = () => `198.51.100.${(ipCounter++ % 250) + 1}`;
async function call(who: Person | null, body: unknown, ip = nextIp()) {
  const res = await groupJoin(new Request('http://fn/', {
    method: 'POST',
    headers: {
      ...(who ? { Authorization: `Bearer ${who.token}` } : {}),
      'Content-Type': 'application/json',
      Origin: 'https://finatrix.co',
      'X-Forwarded-For': ip,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json().catch(() => null) };
}
const quotaCount = async (scope: string, key: string) =>
  (await db.query<{ n: number }>('select coalesce(sum(count), 0)::int as n from public.provider_quota where scope = $1 and key = $2', [scope, key])).rows[0].n;

const owner = await person('Asha Rao');
const made = await as<{ group_id: string; code: string }>('authenticated', owner.id,
  "select public.create_group('Rao family', '🏡', 'family', 'Asha', 'INR', true) as r");

let res = await groupJoin(new Request('http://fn/', { method: 'OPTIONS', headers: { Origin: 'https://finatrix.co' } }));
check('answers the CORS preflight', res.status === 200 && (res.headers.get('Access-Control-Allow-Methods') ?? '').includes('POST'), res.status);
res = await groupJoin(new Request('http://fn/', { method: 'GET' }));
check('refuses anything but POST (405)', res.status === 405, res.status);

let r = await call(null, { action: 'preview', code: made.code });
check('refuses a caller with no session (401)', r.status === 401, r);
r = await call({ id: 'x', token: 'forged' }, { action: 'preview', code: made.code });
check('refuses a token the auth server rejects (401)', r.status === 401, r);

const riya = await person();
r = await call(riya, '{not json');
check('refuses a body that is not JSON (400)', r.status === 400, r);
r = await call(riya, { code: made.code });
check('refuses a request with no action (400)', r.status === 400, r);
r = await call(riya, { action: 'preview', code: 'hello!' });
check('refuses something that cannot be a code (400), without spending a lookup',
  r.status === 400 && r.body?.error === 'invalid_code' && (await quotaCount('group-join:user:hour', riya.id)) === 0, r);

r = await call(riya, { action: 'preview', code: `fx-${made.code.toLowerCase()}` });
check('a preview shows the join card ("Rao family, 1 member") without the group id, whatever the format',
  r.status === 200 && r.body?.status === 'ok' && r.body?.group?.name === 'Rao family' && r.body?.group?.members === 1
    && !('id' in (r.body?.group ?? {})), r);
check('every lookup counts against the person', (await quotaCount('group-join:user:hour', riya.id)) === 1);

r = await call(riya, { action: 'join', code: made.code, displayName: 'Riya' });
check('the first join asks for the 18+ confirmation', r.status === 200 && r.body?.status === 'adult_confirmation_required', r);
r = await call(riya, { action: 'join', code: `FX ${made.code}`, displayName: '  Riya  ', confirmAdult: true });
check('joining with the confirmation works and returns the group id',
  r.status === 200 && r.body?.status === 'joined' && r.body?.group?.id === made.group_id && r.body?.group?.members === 2, r);
const riyaRow = await db.query<{ display_name: string }>(
  'select display_name from public.group_members where group_id = $1 and user_id = $2', [made.group_id, riya.id]);
check('the name is stored trimmed', riyaRow.rows[0]?.display_name === 'Riya', riyaRow.rows[0]);
r = await call(riya, { action: 'join', code: made.code, confirmAdult: true });
check('joining twice says already_member', r.status === 200 && r.body?.status === 'already_member', r);

const meera = await person('Meera Iyer');
r = await call(meera, { action: 'join', code: made.code, confirmAdult: true });
const meeraRow = await db.query<{ display_name: string }>(
  'select display_name from public.group_members where group_id = $1 and user_id = $2', [made.group_id, meera.id]);
check('with no name sent, the account name is used', r.body?.status === 'joined' && meeraRow.rows[0]?.display_name === 'Meera Iyer', r);

const kiran = await person();
r = await call(kiran, { action: 'join', code: made.code, displayName: 'K'.repeat(41), confirmAdult: true });
check('refuses a name longer than 40 characters (400)', r.status === 400 && r.body?.error === 'invalid_name', r);

const unused = made.code === 'ZZZZZZ' ? 'YYYYYY' : 'ZZZZZZ';
r = await call(kiran, { action: 'preview', code: unused });
check('an unknown code is not_found', r.status === 200 && r.body?.status === 'not_found', r);

await db.query("update public.group_invites set expires_at = now() - interval '1 minute' where group_id = $1", [made.group_id]);
r = await call(kiran, { action: 'join', code: made.code, confirmAdult: true });
check('an expired code is refused', r.status === 200 && r.body?.status === 'expired', r);
await db.query("update public.group_invites set expires_at = now() + interval '7 days' where group_id = $1", [made.group_id]);

const host = await person('Farah');
const club = await as<{ group_id: string; code: string }>('authenticated', host.id,
  "select public.create_group('Football club', '⚽', 'friends', 'Farah', 'INR', true) as r");
for (let i = 1; i < 20; i++) {
  const p = await person();
  await as('service_role', null, 'select public.group_join_by_code($1, $2, $3, true) as r', [p.id, club.code, `Player ${i}`]);
}
r = await call(kiran, { action: 'join', code: club.code, confirmAdult: true });
check('a group of 20 is full', r.status === 200 && r.body?.status === 'group_full' && r.body?.group?.members === 20, r);

// Limits: fill a window to one below the limit, then go over it.
const hourWindow = Math.floor(Date.now() / 1000 / 3600);
const busy = await person();
await db.query("insert into public.provider_quota (scope, key, window_start, count) values ('group-join:user:hour', $1, $2, 19)",
  [busy.id, hourWindow]);
const first = await call(busy, { action: 'preview', code: made.code });
r = await call(busy, { action: 'preview', code: made.code });
check('the 21st lookup in an hour by one person is refused (429)', first.status === 200 && r.status === 429, [first.status, r.status]);

const sharedIp = '203.0.113.7';
await db.query("insert into public.provider_quota (scope, key, window_start, count) values ('group-join:ip:hour', $1, $2, 60)",
  [await privateQuotaKey(sharedIp, 'service'), hourWindow]);
r = await call(await person(), { action: 'preview', code: made.code }, sharedIp);
check('the 61st lookup in an hour from one IP is refused (429)', r.status === 429, r);

const ipKeys = await db.query<{ key: string }>("select key from public.provider_quota where scope = 'group-join:ip:hour'");
check('IP limits are stored under a keyed hash, never the address',
  ipKeys.rows.length > 0 && ipKeys.rows.every((k) => /^[0-9a-f]{32}$/.test(k.key) && !k.key.includes('.')), ipKeys.rows.slice(0, 3));

quotaDown = true;
r = await call(await person(), { action: 'preview', code: made.code });
quotaDown = false;
check('when the limits cannot be checked, lookups stop (503) instead of running unlimited', r.status === 503, r);

// ── Report ────────────────────────────────────────────────────────────────
let failed = 0;
for (const [name, ok, detail] of checks) {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || detail === undefined ? '' : `\n      ${JSON.stringify(detail)}`}`);
}
console.log(`\n${checks.length - failed}/${checks.length} passed`);
await db.close();
Deno.exit(failed ? 1 : 0);
