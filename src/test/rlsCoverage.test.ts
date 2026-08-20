import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every relation the browser can reach must be protected in the database.
 *
 * The client holds the Supabase **anon** key, which ships in the bundle and is
 * public by design. The only thing standing between it and every user's résumé,
 * salary offers, application history and network contacts is Row Level Security
 * — so a table added without an `enable row level security` line is not a
 * hardening gap, it is a full read of that table by anyone with a browser.
 *
 * Nothing else catches it. The table works, the feature works, the tests pass,
 * and the failure is silent and total. This test derives BOTH sides from the
 * repository — the tables from `.from('…')` call sites, the protection from the
 * SQL — so adding a table to one side without the other fails here.
 *
 * A view is protected differently and both halves are required: `security_invoker
 * = true` (so the querying user's policies apply to the base tables rather than
 * the view owner's, who bypasses RLS entirely) and an explicit `revoke … from
 * anon`.
 */

const root = join(__dirname, '..', '..');

function filesUnder(dir: string, ext: string[]): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...filesUnder(full, ext));
    else if (ext.some((e) => name.endsWith(e))) out.push(full);
  }
  return out;
}

const sql = filesUnder(join(root, 'supabase'), ['.sql'])
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

/** Relations the client queries through the anon key. */
const clientRelations = (() => {
  const found = new Set<string>();
  for (const file of filesUnder(join(root, 'src'), ['.ts', '.tsx'])) {
    if (file.includes(`${join('src', 'test')}`)) continue;
    for (const m of readFileSync(file, 'utf8').matchAll(/\.from\('([a-z0-9_]+)'\)/g)) {
      found.add(m[1]);
    }
  }
  return [...found].sort();
})();

const rlsEnabled = new Set(
  [...sql.matchAll(/alter\s+table\s+(?:public\.)?([a-z0-9_]+)\s+enable\s+row\s+level\s+security/gi)]
    .map((m) => m[1].toLowerCase()),
);

/** Views declared `security_invoker = true` AND revoked from anon. */
const guardedViews = new Set(
  [...sql.matchAll(/create\s+(?:or\s+replace\s+)?view\s+(?:public\.)?([a-z0-9_]+)\s*\n?\s*with\s*\(\s*security_invoker\s*=\s*true\s*\)/gi)]
    .map((m) => m[1].toLowerCase())
    .filter((name) => new RegExp(`revoke\\s+all\\s+on\\s+(?:public\\.)?${name}\\s+from\\s+anon`, 'i').test(sql)),
);

describe('database access control', () => {
  it('finds the call sites and the schema it is meant to be comparing', () => {
    // Without this the comparison is vacuous: a broken scan yields two empty
    // sets, every relation is trivially covered, and the guard reads as green.
    expect(clientRelations.length).toBeGreaterThan(30);
    expect(rlsEnabled.size).toBeGreaterThan(30);
    expect(clientRelations).toContain('resumes');
    expect(clientRelations).toContain('tool_data');
  });

  it('protects every relation the browser can query', () => {
    const unprotected = clientRelations.filter(
      (name) => !rlsEnabled.has(name) && !guardedViews.has(name),
    );

    expect(
      unprotected,
      'these are queried with the public anon key and have neither RLS nor a ' +
        `security_invoker view with anon revoked:\n${unprotected.join('\n')}`,
    ).toEqual([]);
  });

  it('never exposes an operational view to anon', () => {
    // Every view the client reads is admin-facing (provider cost, search terms).
    // `security_invoker` alone is enough under today's policies; the revoke is
    // what keeps it true after a future policy edit, so both are required.
    const views = clientRelations.filter((name) => !rlsEnabled.has(name));
    expect(views.length).toBeGreaterThan(0);
    for (const name of views) {
      expect(guardedViews.has(name), `${name} must be security_invoker and revoked from anon`).toBe(true);
    }
  });
});
