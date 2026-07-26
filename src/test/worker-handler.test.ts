/**
 * Edge Worker handler — end-to-end behaviour of `worker/index.ts`.
 *
 * `worker-routes.test.ts` pins the pure routing functions. This exercises the
 * handler itself against a stub ASSETS binding, which is where the things that
 * actually break in production live: the status code on the redirect, whether
 * `Location` is set at all, whether HSTS survives on a response the assets
 * runtime never sees, and whether `/healthz` still answers while the domain is
 * mid-cutover.
 *
 * Written during the finatrix.online → finatrix.co migration, when the Worker
 * gained HTTPS enforcement and self-generated security headers — none of which
 * the pure-function tests can observe.
 */
import { describe, it, expect } from 'vitest';
import worker from '../../worker/index';
import { CANONICAL_HOST, TOOL_IDS } from '../shared/routes';

const SHELL_BODY = '<!doctype html><html><head><title>FinatriX</title></head><body></body></html>';

/** Files that really exist in `dist`. Everything else is an SPA navigation. */
const BUILT_FILES: Record<string, string> = {
  '/index.html': SHELL_BODY,
  '/': SHELL_BODY,
  '/robots.txt': 'User-agent: *',
  '/sitemap.xml': '<urlset/>',
};

/**
 * Stands in for the Workers static-assets binding, including the part that
 * matters most: with `not_found_handling: "none"` it answers 404 for a path
 * that is not a built file. The Worker uses exactly that to tell a real asset
 * apart from a client route now that it runs first.
 */
const env = {
  ASSETS: {
    fetch: async (input: Request | URL | string) => {
      const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
      const body = BUILT_FILES[path];
      if (body === undefined) return new Response('not found', { status: 404 });
      return new Response(body, {
        status: 200,
        headers: {
          'Content-Type': path.endsWith('.txt') ? 'text/plain' : 'text/html; charset=utf-8',
          'X-From-Assets': '1',
        },
      });
    },
  },
  CANONICAL_HOST,
};

const get = (url: string, e: typeof env | Record<string, unknown> = env) =>
  worker.fetch(new Request(url), e as typeof env);

describe('worker: /healthz', () => {
  it('answers 200 JSON on the canonical host', async () => {
    const res = await get(`https://${CANONICAL_HOST}/healthz`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect((await res.json() as { status: string }).status).toBe('ok');
  });

  // Uptime monitors must keep working while DNS is half-migrated, so the probe
  // is answered BEFORE the canonical redirect is considered.
  it('answers 200 on a legacy host instead of redirecting the monitor', async () => {
    for (const host of ['finatrix.online', `www.${CANONICAL_HOST}`]) {
      const res = await get(`https://${host}/healthz`);
      expect(res.status, host).toBe(200);
    }
  });

  it('is never cached', async () => {
    const res = await get(`https://${CANONICAL_HOST}/healthz`);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});

describe('worker: canonical host enforcement', () => {
  it('301s www to the apex with a Location header and preserved query', async () => {
    const res = await get(`https://www.${CANONICAL_HOST}/tools/budget?ref=x`);
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe(`https://${CANONICAL_HOST}/tools/budget?ref=x`);
  });

  it('301s every retired domain to the apex', async () => {
    for (const host of ['finatrix.online', 'www.finatrix.online', 'finatrix.space']) {
      const res = await get(`https://${host}/privacy`);
      expect(res.status, host).toBe(301);
      expect(res.headers.get('Location'), host).toBe(`https://${CANONICAL_HOST}/privacy`);
    }
  });

  it('upgrades plain HTTP to HTTPS', async () => {
    const res = await get(`http://${CANONICAL_HOST}/terms`);
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe(`https://${CANONICAL_HOST}/terms`);
  });

  it('carries HSTS on the redirect itself, which never touches the assets runtime', async () => {
    const res = await get(`https://www.${CANONICAL_HOST}/`);
    const hsts = res.headers.get('Strict-Transport-Security') ?? '';
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
    expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('serves the canonical host normally', async () => {
    const res = await get(`https://${CANONICAL_HOST}/tools/budget`);
    expect(res.status).toBe(200);
    expect(res.headers.get('X-From-Assets')).toBe('1');
  });

  // The regression this whole `run_worker_first` change exists for: with the
  // assets runtime answering first, `/` matched index.html and was served
  // directly on ANY host, so the single most linked URL on the site never
  // redirected while deep links did. Deep-link-only tests cannot see this.
  it('redirects static document paths, including the homepage', async () => {
    for (const p of ['/', '/robots.txt', '/sitemap.xml']) {
      const res = await get(`https://www.${CANONICAL_HOST}${p}`);
      expect(res.status, p).toBe(301);
      expect(res.headers.get('Location'), p).toBe(`https://${CANONICAL_HOST}${p}`);
    }
  });

  // Deploying with no vars at all must not produce a non-canonical site.
  it('falls back to the compiled canonical host when the var is absent', async () => {
    const res = await get(`https://www.${CANONICAL_HOST}/`, { ASSETS: env.ASSETS });
    expect(res.status).toBe(301);
    expect(res.headers.get('Location')).toBe(`https://${CANONICAL_HOST}/`);
  });

  // The explicit escape hatch for a domain whose DNS is still propagating.
  it('is inert when CANONICAL_HOST is explicitly blank', async () => {
    const res = await get('https://finatrix.online/', { ASSETS: env.ASSETS, CANONICAL_HOST: '' });
    expect(res.status).toBe(200);
  });

  it('leaves previews and localhost alone', async () => {
    for (const url of ['https://finatrix.finatrix-hub.workers.dev/', 'http://localhost:5173/']) {
      const res = await get(url);
      expect(res.status, url).toBe(200);
    }
  });
});

describe('worker: honest HTTP status', () => {
  it('serves 200 for every real client route', async () => {
    const paths = ['/', '/tools', '/privacy', '/terms', '/careers/jobs', ...TOOL_IDS.map((t) => `/tools/${t}`)];
    for (const p of paths) {
      const res = await get(`https://${CANONICAL_HOST}${p}`);
      expect(res.status, p).toBe(200);
    }
  });

  it('serves a real 404 — not a soft-404 — for unknown URLs', async () => {
    for (const p of ['/nope', '/tools/not-a-tool', '/tools/budget/extra']) {
      const res = await get(`https://${CANONICAL_HOST}${p}`);
      expect(res.status, p).toBe(404);
      // Still the SPA shell, so the app renders its own NotFound screen.
      expect(await res.text()).toBe(SHELL_BODY);
    }
  });

  it('keeps the assets runtime headers (and therefore the CSP) on SPA navigations', async () => {
    const res = await get(`https://${CANONICAL_HOST}/tools/goals`);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(res.headers.get('X-From-Assets')).toBe('1');
  });

  // Running first must not turn the Worker into a proxy that rewrites files:
  // a real asset is handed back from the ASSETS binding untouched, so its
  // `_headers` content-type and cache-control survive.
  it('passes real files straight through from the assets binding', async () => {
    const res = await get(`https://${CANONICAL_HOST}/robots.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(await res.text()).toContain('User-agent');
  });
});
