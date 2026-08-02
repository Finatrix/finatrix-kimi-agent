/**
 * The analytics taxonomy exists in three places that must agree, and two of
 * them cannot import the third.
 *
 *   1. `AnalyticsEvent` in src/lib/analytics.ts — the client's typed union.
 *   2. `ALLOWED_EVENTS` in supabase/functions/analytics-collect — a Deno edge
 *      function, deployed BY HAND, which drops anything not in its own set.
 *   3. The call sites that actually emit each event.
 *
 * Every disagreement between them fails silently and in the worst possible
 * direction:
 *
 *   • An event the client sends and the collector does not allow is discarded
 *     with a 204. Nothing errors, nothing logs, and the metric reads zero —
 *     indistinguishable from a feature nobody uses.
 *   • An event in the union that nothing emits reads zero for the same reason,
 *     and looks like a real number on a dashboard.
 *   • A prop key allowed on the client and not on the server arrives stripped,
 *     so the event survives and its dimension quietly does not.
 *
 * None of that is caught by types, because the edge function is a separate
 * TypeScript program that this one never imports. So it is caught by parsing.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..', '..');
const CLIENT = readFileSync(join(ROOT, 'src', 'lib', 'analytics.ts'), 'utf8');
const SERVER = readFileSync(
  join(ROOT, 'supabase', 'functions', 'analytics-collect', 'index.ts'),
  'utf8',
);

/**
 * Strip `//` and block comments.
 *
 * Not fussiness: the union is heavily commented, and one of those comments
 * contains a semicolon ("`checkout_*` describe the payment attempt;
 * `subscription_*` describe …"). Parsing the raw text stopped the union there
 * and silently found 13 of 24 events — a parser that under-reads is exactly how
 * a drift test passes while the drift it exists to catch goes unnoticed.
 */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

/** The `AnalyticsEvent` union members, read out of the client's type. */
function clientEvents(): string[] {
  const union = /export type AnalyticsEvent =([\s\S]*?);/.exec(stripComments(CLIENT))?.[1] ?? '';
  return [...union.matchAll(/\|\s*'([a-z_]+)'/g)].map((m) => m[1]);
}

/** A named `Set([...])` literal's string members, from either file. */
function setMembers(source: string, name: string): string[] {
  const clean = stripComments(source);
  const body = new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`).exec(clean)?.[1] ?? '';
  return [...body.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

/** Every `track('<event>'` / `trackEvent('<event>'` in application source. */
function emittedEvents(): Set<string> {
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) {
        if (entry === 'test' || entry === 'node_modules') continue;
        walk(path);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      if (path.endsWith(join('lib', 'analytics.ts'))) continue; // the definition, not a call
      const src = readFileSync(path, 'utf8');
      for (const m of src.matchAll(/\btrack(?:Event)?\(\s*'([a-z_]+)'/g)) found.add(m[1]);
    }
  };
  walk(join(ROOT, 'src'));
  return found;
}

describe('analytics taxonomy', () => {
  const events = clientEvents();
  const allowed = setMembers(SERVER, 'ALLOWED_EVENTS');

  it('parses all three sources', () => {
    // Regexes that quietly match nothing would make every assertion below pass
    // vacuously, which is worse than having no test at all.
    expect(events.length).toBeGreaterThan(15);
    expect(allowed.length).toBeGreaterThan(15);
    expect(emittedEvents().size).toBeGreaterThan(10);
  });

  it('lets the collector accept every event the client can send', () => {
    for (const e of events) {
      expect(allowed, `client sends "${e}" but the collector would drop it`).toContain(e);
    }
  });

  it('does not allow events the client cannot send', () => {
    for (const e of allowed) {
      expect(events, `collector allows "${e}" but it is not in the client taxonomy`).toContain(e);
    }
  });

  it('agrees on the prop-key allowlist', () => {
    const client = setMembers(CLIENT, 'ALLOWED_PROP_KEYS');
    const server = setMembers(SERVER, 'ALLOWED_PROP_KEYS');
    expect(client.length).toBeGreaterThan(5);
    expect(new Set(server)).toEqual(new Set(client));
  });

  /**
   * The rule the taxonomy is maintained by, enforced. A declared event that
   * nothing emits reads zero on a dashboard and is indistinguishable from a
   * real metric that has flatlined.
   */
  it('emits every event it declares', () => {
    const emitted = emittedEvents();
    // Three are emitted through helpers rather than a literal `track('…')`
    // call, so the source scan cannot see them.
    const viaHelper = new Set([
      'page_view', // trackPageView()
      'web_vital', // lib/webVitals.ts
      'app_error', // lib/errorReporting.ts
      'route_not_found', // pages/NotFound.tsx reporting path
    ]);
    for (const e of events) {
      if (viaHelper.has(e)) continue;
      expect(emitted, `"${e}" is declared but nothing emits it`).toContain(e);
    }
  });

  it('has no duplicate names', () => {
    expect(new Set(events).size).toBe(events.length);
    expect(new Set(allowed).size).toBe(allowed.length);
  });

  /**
   * The whole revenue funnel must exist, because its absence is what the launch
   * review named as making the business unmeasurable. Listed explicitly rather
   * than inferred, so deleting one of these fails loudly.
   */
  it('covers the acquisition and revenue funnel end to end', () => {
    for (const required of [
      'signup_started', 'signup_completed',
      'checkout_started', 'checkout_completed', 'checkout_failed',
      'subscription_started', 'subscription_renewed', 'subscription_expired',
      'ai_message_sent', 'report_exported', 'resume_uploaded', 'job_search_completed',
    ]) {
      expect(events, `missing funnel event "${required}"`).toContain(required);
    }
  });
});
