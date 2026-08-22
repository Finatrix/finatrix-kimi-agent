/**
 * Deploy-configuration regression tests.
 *
 * These guard launch-critical config that no runtime test would ever touch:
 * the fiantrix.online domain typo that shipped in three files (P1 audit
 * blocker), the retired domains that the finatrix.co migration replaced, the
 * Cloudflare security headers, and the SPA fallback without which every deep
 * link 404s in production.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CANONICAL_HOST, TOOL_IDS } from '../shared/routes';
import { seoForPath, OG_VERSION } from '../lib/seo';

const ORIGIN = `https://${CANONICAL_HOST}`;

/** Domains this app must no longer advertise anywhere public-facing. */
const RETIRED_DOMAINS = [/fiantrix/i, /finatrix\.online/i, /finatrix\.space/i, /finatrix\.app/i, /workers\.dev/i];

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

/**
 * Read a baseline/progressive JPEG's real pixel dimensions from its SOF marker.
 * Used to prove `og:image:width`/`height` describe the file that actually
 * ships — a mismatch is invisible locally and renders as a stretched card.
 */
function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2; // skip SOI
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    // SOF0/1/2/9/10 carry the frame header; DHT/DAC/RST/SOS do not.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error('no JPEG SOF marker found');
}

function textFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) out.push(...textFilesUnder(rel));
    else if (/\.(html|xml|txt|webmanifest|json|jsonc|md)$/.test(name)) out.push(rel);
  }
  return out;
}

describe('deploy configuration', () => {
  // Covers both the original `fiantrix` typo and every domain the finatrix.co
  // migration retired. A single stale reference in any of these files is enough
  // to split the site's identity across two hosts.
  it('advertises no retired or misspelled domain anywhere public-facing', () => {
    for (const f of ['index.html', ...textFilesUnder('public')]) {
      for (const domain of RETIRED_DOMAINS) {
        expect(read(f), `${f} still references ${domain}`).not.toMatch(domain);
      }
    }
  });

  it('the edge Worker, the client and the static assets all agree on one canonical host', () => {
    expect(read('index.html')).toContain(`<link rel="canonical" href="${ORIGIN}/" />`);
    expect(read('public/robots.txt')).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
    expect(read('public/sitemap.xml')).toContain(`<loc>${ORIGIN}/</loc>`);
    expect(read('public/.well-known/security.txt')).toContain(`Canonical: ${ORIGIN}/.well-known/security.txt`);
    // The Worker var is what activates the 301; a blank one ships a site that
    // answers on every host at once and is canonical on none.
    expect(read('wrangler.jsonc')).toContain(`"CANONICAL_HOST": "${CANONICAL_HOST}"`);
  });

  it('binds the Worker to both the apex and www so www can be redirected, not dropped', () => {
    const wrangler = read('wrangler.jsonc');
    expect(wrangler).toContain(`{ "pattern": "${CANONICAL_HOST}", "custom_domain": true }`);
    expect(wrangler).toContain(`{ "pattern": "www.${CANONICAL_HOST}", "custom_domain": true }`);
  });

  // `_headers` is only honoured by the Workers static-assets runtime from the
  // 2025-04-01 compatibility date onward. Below it the security and cache
  // headers are silently ignored — the file is present and does nothing.
  it('uses a compatibility date new enough for _headers to be applied', () => {
    const date = /"compatibility_date":\s*"([\d-]+)"/.exec(read('wrangler.jsonc'))?.[1];
    expect(date).toBeTruthy();
    expect(Date.parse(date!)).toBeGreaterThanOrEqual(Date.parse('2025-04-01'));
  });

  it('sitemap lists every public calculator route (the acquisition surface)', () => {
    const sitemap = read('public/sitemap.xml');
    for (const t of TOOL_IDS) {
      expect(sitemap, `sitemap is missing /tools/${t}`).toContain(
        `<loc>${ORIGIN}/tools/${t}</loc>`,
      );
    }
  });

  it('every sitemap URL is absolute, https and on the canonical host', () => {
    const locs = [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    expect(locs.length).toBeGreaterThan(0);
    for (const loc of locs) {
      const url = new URL(loc);
      expect(url.protocol, loc).toBe('https:');
      expect(url.host, loc).toBe(CANONICAL_HOST);
    }
    expect(new Set(locs).size, 'sitemap contains duplicate URLs').toBe(locs.length);
  });

  it('ships valid, canonical-origin JSON-LD', () => {
    const blocks = [...read('index.html').matchAll(
      /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g,
    )].map((m) => m[1]);
    expect(blocks.length).toBeGreaterThan(0);

    for (const block of blocks) {
      const parsed = JSON.parse(block); // throws → the test fails, which is the point
      const graph = parsed['@graph'] ?? [parsed];
      expect(Array.isArray(graph)).toBe(true);
      for (const node of graph) expect(node['@type'], JSON.stringify(node)).toBeTruthy();

      // Every first-party URL in the graph — @id, url, logo, publisher refs —
      // must name the canonical origin, or the brand entity stays attached to
      // the retired domain. Matched on HOSTNAME, so if an off-site profile link
      // is ever added to `sameAs` it is correctly left alone. (There is none
      // today — see the TODO above the block; brand.test.ts guards that any
      // future entry is a real, verified profile rather than a placeholder.)
      for (const raw of JSON.stringify(parsed).match(/https?:\/\/[^"\\]+/g) ?? []) {
        if (/finatrix/i.test(new URL(raw).hostname)) expect(raw.startsWith(ORIGIN), raw).toBe(true);
      }
    }
  });

  it('ships a social card at the 1.91:1 size Facebook and X actually render', () => {
    const html = read('index.html');
    const og = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/.exec(html)?.[1];
    expect(og).toBe(`${ORIGIN}/images/og-cover.jpg?v=${OG_VERSION}`);
    expect(html).toContain('<meta property="og:image:width" content="1200" />');
    expect(html).toContain('<meta property="og:image:height" content="630" />');
    // Declared dimensions must match the file that ships, or crawlers that
    // trust the tags render a stretched card.
    const jpeg = readFileSync(join(root, 'public/images/og-cover.jpg'));
    const { width, height } = jpegSize(jpeg);
    expect({ width, height }).toEqual({ width: 1200, height: 630 });
    // A large card needs alt text for the same reason an <img> does.
    expect(html).toContain('property="og:image:alt"');
    expect(html).toContain('name="twitter:image:alt"');
  });

  // Every public page advertises its own card; each one has to exist, be the
  // declared size, and be the file the copy was generated from. A missing
  // og:image is not an error anywhere — the platform just drops the image and
  // renders a bare text card, which is invisible from inside the repo.
  it('ships the per-page share card every public route advertises', () => {
    const seen = new Set<string>();
    for (const path of ['/', '/privacy', '/terms', ...TOOL_IDS.map((t) => `/tools/${t}`)]) {
      const { image, imageAlt } = seoForPath(path);
      expect(image, `${path} image must be absolute`).toMatch(new RegExp(`^${ORIGIN}/images/`));
      expect(imageAlt, `${path} card needs alt text`).toBeTruthy();

      const file = new URL(image).pathname.replace(/^\//, 'public/');
      const { width, height } = jpegSize(readFileSync(join(root, file)));
      expect({ width, height }, file).toEqual({ width: 1200, height: 630 });
      seen.add(image);
    }
    // Distinct cards, not the same one advertised ten times — that was the
    // state this replaced.
    expect(seen.size, 'two public pages share a card').toBe(TOOL_IDS.length + 3);
  });

  it('ships a parseable manifest with a stable PWA identity', () => {
    const manifest = JSON.parse(read('public/manifest.webmanifest'));
    // Without "id" the install identity is start_url, so changing start_url (or
    // the origin) silently registers a second, unrelated installed app.
    expect(manifest.id).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('ships the Cloudflare security headers', () => {
    const headers = read('public/_headers');
    for (const h of [
      'X-Content-Type-Options: nosniff',
      'X-Frame-Options: SAMEORIGIN',
      'Referrer-Policy: strict-origin-when-cross-origin',
      'Strict-Transport-Security:',
      'Permissions-Policy:',
      'Origin-Agent-Cluster: ?1',
      'X-Permitted-Cross-Domain-Policies: none',
    ]) {
      expect(headers).toContain(h);
    }
    expect(headers).toContain('Cache-Control: public, max-age=31536000, immutable');
  });

  /**
   * The four directives that permit nothing.
   *
   * They are easy to read as noise and delete in a tidy-up, which is exactly
   * why they are pinned. `worker-src` is the one that matters most and is the
   * least obvious: workers fall back through `child-src` to **script-src**, not
   * to `default-src`, so without it the two workers this app runs (pdf.js,
   * Tesseract) are governed by whatever `script-src` grows to allow — and
   * `script-src` is the line most likely to gain a `blob:` or an `'unsafe-eval'`
   * for some future inline need. pdf.js is also the app's hostile-binary parser,
   * which makes "what may be spawned as a worker" a question worth answering
   * once, here, rather than inheriting.
   */
  it('pins the CSP directives that exist to deny rather than to permit', () => {
    const policies = [
      /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(read('index.html'))?.[1] ?? '',
      ...[...read('public/_headers').matchAll(/^\s*Content-Security-Policy: (.+)$/gm)].map((m) => m[1]),
    ];
    expect(policies).toHaveLength(3);
    for (const policy of policies) {
      // Workers are same-origin scripts; nothing is framed; there is no media.
      expect(policy).toContain("worker-src 'self'");
      expect(policy).toContain("manifest-src 'self'");
      expect(policy).toContain("frame-src 'none'");
      expect(policy).toContain("media-src 'none'");
      // The three that were already load-bearing, restated so a rewrite of the
      // policy string cannot drop one while adding the four above.
      expect(policy).toContain("object-src 'none'");
      expect(policy).toContain("base-uri 'self'");
      expect(policy).toContain("form-action 'self'");
      // Never: eval is what makes a pdf.js font bug arbitrary code execution.
      expect(policy).not.toContain('unsafe-eval');
    }
  });

  // OAuth here is a full-page redirect (`signInWithOAuth({ redirectTo })`), so
  // nothing depends on window.opener surviving — which is what makes this safe
  // to assert rather than merely aspire to.
  it('isolates the browsing context from cross-origin openers', () => {
    expect(read('public/_headers')).toContain('Cross-Origin-Opener-Policy: same-origin');
  });

  // COEP would demand CORP or CORS on every subresource and break the
  // self-hosted Tesseract OCR worker. Pinned so a future "harden the headers"
  // pass cannot add it without this failing first and explaining why.
  it('does not enable COEP, which would break the self-hosted OCR worker', () => {
    expect(read('public/_headers')).not.toContain('Cross-Origin-Embedder-Policy');
  });

  it('switches off every powerful browser feature the app does not use', () => {
    const policy = read('public/_headers')
      .split('\n')
      .find((l) => l.includes('Permissions-Policy:')) ?? '';
    for (const feature of [
      'camera', 'microphone', 'geolocation', 'payment', 'usb', 'bluetooth',
      'serial', 'midi', 'display-capture', 'idle-detection',
    ]) {
      expect(policy, `${feature} must be disabled`).toContain(`${feature}=()`);
    }
  });

  /**
   * The trap this exists for: `Disallow` and `noindex` look like belt-and-braces
   * and are actually mutually defeating. A disallowed URL is never fetched, so
   * the `noindex` it serves is never read — and Google will still index it from
   * inbound links alone, listing it with no title or snippet. robots.txt
   * previously carried `Disallow: /profile` while /profile served noindex,
   * which is exactly that combination.
   *
   * Any future `Disallow` must therefore name something that is NOT a noindex
   * route (a non-route asset path, say). This does not forbid Disallow — it
   * forbids the specific pairing that silently fails.
   */
  it('never disallows a route whose noindex the crawler would then never see', () => {
    const disallowed = [...read('public/robots.txt').matchAll(/^\s*Disallow:\s*(\S+)/gim)]
      .map((m) => m[1])
      .filter((p) => p !== '/'); // a bare "Disallow: /" is a deliberate full block

    for (const path of disallowed) {
      expect(
        seoForPath(path).robots,
        `${path} is Disallow'd but serves noindex — the two cancel out`,
      ).not.toBe('noindex, nofollow');
    }
  });

  it('wrangler serves dist through a Worker that returns real 404s for unknown routes', () => {
    const wrangler = read('wrangler.jsonc');
    expect(wrangler).toContain('"directory": "./dist"');
    expect(wrangler).toContain('"main": "worker/index.ts"');
    expect(wrangler).toContain('"binding": "ASSETS"');
    // The soft-404 SPA fallback must be gone — the Worker owns status codes now.
    expect(wrangler).toContain('"not_found_handling": "none"');
    expect(wrangler).not.toContain('single-page-application');
  });

  // Without run_worker_first the assets runtime answers document paths before
  // the Worker, so `/` was served on any host and never redirected. The
  // fingerprinted asset paths stay excluded so they keep bypassing the Worker.
  it('runs the Worker before the assets runtime on document paths only', () => {
    const wrangler = read('wrangler.jsonc');
    expect(wrangler).toContain('"run_worker_first"');
    const block = /"run_worker_first":\s*\[([\s\S]*?)\]/.exec(wrangler)?.[1] ?? '';
    expect(block).toContain('"/*"');
    for (const excluded of ['/assets/', '/fonts/', '/images/', '/careers-ocr/']) {
      expect(block, `${excluded} should bypass the Worker`).toContain(`"!${excluded}*"`);
    }
  });

  it('delivers the production CSP header on document responses, in sync with the meta CSP', () => {
    const html = read('index.html');
    expect(html).toMatch(/http-equiv="Content-Security-Policy"/);
    const metaPolicy = /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1];
    expect(metaPolicy).toBeTruthy();

    const headers = read('public/_headers');
    const headerPolicies = [...headers.matchAll(/^\s*Content-Security-Policy: (.+)$/gm)].map((m) => m[1]);
    // One header per document path ("/" and "/index.html"; the SPA Worker
    // copies /index.html's headers onto every client-route navigation).
    expect(headerPolicies).toHaveLength(2);
    for (const policy of headerPolicies) {
      // Byte-identical to the meta policy (differing CSPs enforce their
      // intersection), plus frame-ancestors, which meta CSP cannot express.
      expect(policy).toBe(`${metaPolicy}; frame-ancestors 'self'`);
    }
    // CSP must never apply to /* — it would break WASM inside the
    // self-hosted OCR worker (workers read CSP from their own response).
    const starBlock = headers.split(/^\/(?:\S*)$/m)[1] ?? '';
    expect(starBlock).not.toContain('Content-Security-Policy');
  });

  /**
   * The inline theme-boot script is allowed by a sha256 hash, and the hash is
   * maintained BY HAND in two places (the meta CSP in index.html and both
   * header blocks in _headers).
   *
   * Nothing else can catch this drifting. The script sets `data-theme` before
   * first paint; blocked, it does not throw, does not fail a build, does not
   * fail a unit test and does not fail a deploy — every visitor simply gets a
   * flash of the wrong theme and a wrong `theme-color`, on every load, and the
   * only symptom is a CSP violation in a console nobody is watching. So the
   * hash is recomputed here from the bytes that actually ship.
   */
  it('allows the inline theme-boot script by a hash that matches its bytes', () => {
    const html = read('index.html');
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    // One inline script, and it is the theme boot. A second one would need its
    // own hash and would otherwise be silently blocked.
    expect(inline).toHaveLength(1);
    expect(inline[0]).toContain("setAttribute('data-theme'");

    const digest = createHash('sha256').update(inline[0], 'utf8').digest('base64');
    const expected = `'sha256-${digest}'`;

    const policies = [
      /http-equiv="Content-Security-Policy"\s+content="([^"]+)"/.exec(html)?.[1] ?? '',
      ...[...read('public/_headers').matchAll(/^\s*Content-Security-Policy: (.+)$/gm)].map((m) => m[1]),
    ];
    expect(policies).toHaveLength(3);
    for (const policy of policies) {
      expect(
        policy,
        `script-src must carry ${expected} — recompute it after editing the boot script in index.html`,
      ).toContain(expected);
    }
  });
});

describe('observability wiring', () => {
  it('the edge Worker exposes a /healthz liveness probe', () => {
    expect(read('worker/index.ts')).toContain("'/healthz'");
  });

  it('the analytics table denies client writes and restricts reads to admins', () => {
    const sql = read('supabase/analytics_schema.sql');
    expect(sql).toContain('enable row level security');
    expect(sql).toContain('analytics_events_admin_select');
    // No insert/update/delete policy → PostgREST denies direct client writes.
    expect(sql).not.toMatch(/for insert/i);
    // Retention function must be present.
    expect(sql).toContain('prune_analytics_events');
  });

  it('the analytics ingest re-validates the event allowlist and never stores IP', () => {
    const fn = read('supabase/functions/analytics-collect/index.ts');
    expect(fn).toContain('ALLOWED_EVENTS'); // server-side re-validation (never trust client)
    expect(fn).toContain('CF-Connecting-IP'); // IP read for rate-limiting…
    // …but the inserted row object has no `ip` field (session_id/event/props/client_t only).
    expect(fn).not.toContain('ip:');
  });
});

/**
 * The deploy workflow's own preconditions.
 *
 * Every Deploy run for three weeks failed on its first line, because none of
 * the repository secrets were ever set — and the check that reported it named
 * exactly one of the seven, so finding out what was actually needed took one
 * push per missing name. These tests pin the two properties that fixed it: the
 * whole set is checked, and it is checked in one pass before any minutes are
 * spent installing.
 */
describe('deploy workflow preflight', () => {
  const workflow = read('.github/workflows/deploy.yml');

  /** Everything the front-end job cannot produce a correct artifact without. */
  const DEPLOY_SECRETS = [
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ACCOUNT_ID',
    // Inlined by Vite at build time. Absent, the build SUCCEEDS and emits a
    // bundle with sign-in, cloud sync and analytics compiled out — a site that
    // passes every other check while refusing every login. It has shipped twice.
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_ANON_KEY',
    'VITE_ANALYTICS_URL',
  ];
  const EDGE_SECRETS = ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF'];

  /** The `run:` script of the named step. */
  function stepScript(name: string): string {
    const from = workflow.indexOf(`- name: ${name}`);
    expect(from, `no step named "${name}"`).toBeGreaterThan(-1);
    const rest = workflow.slice(from);
    const next = rest.indexOf('\n      - ', 1);
    return next === -1 ? rest : rest.slice(0, next);
  }

  it.each(DEPLOY_SECRETS)('the deploy job refuses to run without %s', (secret) => {
    expect(stepScript('Preflight — deploy secrets')).toContain(secret);
  });

  it.each(EDGE_SECRETS)('the edge-functions job refuses to run without %s', (secret) => {
    expect(stepScript('Preflight — Supabase secrets')).toContain(secret);
  });

  /**
   * Checking credentials AFTER `npm ci` and the full gate suite means a
   * misconfigured repository burns five minutes to report a missing string.
   * Both preflights are the first step in their job.
   */
  it('checks credentials before spending any runner minutes on them', () => {
    for (const step of ['Preflight — deploy secrets', 'Preflight — Supabase secrets']) {
      expect(workflow.indexOf(`- name: ${step}`)).toBeLessThan(
        workflow.indexOf('npm ci', workflow.indexOf(`- name: ${step}`)),
      );
    }
    // Nothing may run before them inside their job.
    expect(workflow).toMatch(/deploy:\n\s+runs-on: ubuntu-latest\n\s+steps:\n(\s*#[^\n]*\n)*\s*- name: Preflight — deploy secrets/);
  });

  /**
   * `if [ -z "${{ secrets.FOO }}" ]` expands the VALUE into the command line,
   * which the runner prints to the log before executing it. Masking is a
   * post-processing pass over a string, not a guarantee — so secrets are read
   * through `env:` and referenced by NAME in the script.
   */
  /**
   * A `run: |` block ends at the step's next key (`env:`, 8 spaces) or at the
   * next step (`- `, 6 spaces), whichever comes first. Stopping only at the
   * next step swallows the step's own `env:` block — and since passing secrets
   * through `env:` is exactly the safe pattern this test exists to encourage,
   * that made the test fail on correct code the moment a `run: |` step needed
   * credentials.
   */
  it('never expands a secret value into a logged command line', () => {
    const runScripts = [...workflow.matchAll(/run: \|([\s\S]*?)(?=\n {8}[a-z]+:|\n {6}[-a-z])/g)]
      .map((m) => m[1]);
    expect(runScripts.length).toBeGreaterThan(0);
    for (const script of runScripts) {
      expect(script, 'a run: script interpolates a secret').not.toMatch(/\$\{\{\s*secrets\./);
    }
  });

  /**
   * The regex above is only meaningful if it still catches the thing it was
   * written for, so this proves it does rather than assuming it.
   */
  it('would catch a secret interpolated directly into a run script', () => {
    const bad = [
      '      - name: Careless',
      '        run: |',
      '          echo "${{ secrets.SUPABASE_ACCESS_TOKEN }}"',
      '        env:',
      '          SAFE: ${{ secrets.SUPABASE_PROJECT_REF }}',
      '      - run: echo done',
    ].join('\n');
    const scripts = [...bad.matchAll(/run: \|([\s\S]*?)(?=\n {8}[a-z]+:|\n {6}[-a-z])/g)].map((m) => m[1]);
    expect(scripts).toHaveLength(1);
    expect(scripts[0]).toMatch(/\$\{\{\s*secrets\./);
  });

  /**
   * `checkAuthRedirect` and `checkEdgeCors` are the two assertions in
   * verify:production that exist because the last domain migration passed every
   * other check while login was completely broken. Both report "skipped"
   * without VITE_SUPABASE_URL, so running the step without it verifies
   * everything except the failure it was written for.
   */
  it('gives the production verifier the credential its auth checks need', () => {
    expect(stepScript('Verify production domain')).toContain('VITE_SUPABASE_URL');
  });
});

/**
 * Every edge function must be both DEPLOYED and DRIFT-CHECKED by CI.
 *
 * The outage this prevents: `careers-billing-checkout` and
 * `careers-billing-webhook` existed in the repo for weeks while appearing in
 * neither `deploy.yml` nor the drift verifier's FUNCTIONS list. The two
 * functions that take money and grant access were hand-deployed, so production
 * could sit on an arbitrarily old build with a fully green pipeline — the exact
 * failure the deploy job's own error message warns about ("will drift from
 * main"). Adding a function without adding it to both lists now fails here
 * rather than in a customer's bank statement.
 */
describe('edge function deploy coverage', () => {
  /** Every deployable function directory — `_shared` is a library, not a function. */
  const functionSlugs = readdirSync(join(root, 'supabase/functions'))
    .filter((name) => !name.startsWith('_') && !name.startsWith('.'))
    .filter((name) => statSync(join(root, 'supabase/functions', name)).isDirectory())
    .sort();

  const workflow = read('.github/workflows/deploy.yml');
  const verifier = read('scripts/verify-deployment.mjs');

  it('finds the function directories it is meant to be guarding', () => {
    // Guards the guard: a bad glob returning [] would make every test below
    // vacuously pass.
    expect(functionSlugs.length).toBeGreaterThanOrEqual(6);
    expect(functionSlugs).toContain('careers-billing-webhook');
    expect(functionSlugs).toContain('careers-billing-checkout');
  });

  it.each(functionSlugs)('%s is deployed by the deploy workflow', (slug) => {
    expect(workflow).toMatch(new RegExp(`functions deploy[^\\n]*\\b${slug}\\b`));
  });

  it.each(functionSlugs)('%s is drift-checked by verify:deploy', (slug) => {
    expect(verifier).toMatch(new RegExp(`'${slug}'`));
  });

  /**
   * Both of these are called by something that cannot present a Supabase JWT —
   * `sendBeacon` has no way to set an Authorization header, and Stripe calls
   * server-to-server. With the gateway check on, every request is rejected 401
   * before the function runs: analytics goes 100% dark, and paid customers are
   * never provisioned.
   */
  it.each(['analytics-collect', 'careers-billing-webhook'])(
    '%s is deployed with --no-verify-jwt',
    (slug) => {
      expect(workflow).toMatch(new RegExp(`functions deploy ${slug} --no-verify-jwt`));
    },
  );

  it('careers-billing-checkout keeps the JWT gate — it derives the buyer from the caller', () => {
    expect(workflow).not.toMatch(/functions deploy careers-billing-checkout --no-verify-jwt/);
  });
});
