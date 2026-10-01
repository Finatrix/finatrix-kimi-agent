// @vitest-environment node
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const source = readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8');
const origin = 'https://finatrix.co';

function worker() {
  const cache = {
    match: vi.fn().mockResolvedValue(undefined),
    put: vi.fn().mockResolvedValue(undefined),
    add: vi.fn().mockResolvedValue(undefined),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue([]),
    delete: vi.fn().mockResolvedValue(true),
  };
  const fetch = vi.fn().mockResolvedValue(new Response('online content'));
  type Event = { request?: Request; waitUntil: (promise: Promise<unknown>) => void; respondWith: (promise: Promise<Response>) => void };
  const listeners = new Map<string, (event: Event) => void>();
  // Browser workers resolve relative Request URLs against their own origin.
  class WorkerRequest extends Request {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      super(typeof input === 'string' ? new URL(input, origin) : input, init);
    }
  }
  runInNewContext(source, {
    self: { location: { origin }, addEventListener: (name: string, callback: (event: Event) => void) => listeners.set(name, callback) },
    caches, fetch, Request: WorkerRequest, Response, URL, AbortController, setTimeout, clearTimeout,
  });
  function dispatch(name: string, request?: Request) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    listeners.get(name)!({ request, waitUntil: p => pending.push(p), respondWith: p => { response = p; } });
    return { response: () => response!, settled: () => Promise.all(pending), pending };
  }
  function get(path: string, navigate = false) {
    const request = new Request(new URL(path, origin));
    if (navigate) Object.defineProperty(request, 'mode', { value: 'navigate' });
    return dispatch('fetch', request);
  }
  return { cache, caches, fetch, get, dispatch };
}

describe('service worker storage failures', () => {
  it.each([
    ['/tools/budget', true],
    ['/assets/app.js', false],
    ['/manifest.webmanifest', false],
  ])('still serves online %s when CacheStorage is unavailable', async (path, navigate) => {
    const w = worker();
    w.caches.open.mockRejectedValue(new Error('Storage disabled'));
    const event = w.get(path, navigate);
    expect(await (await event.response()).text()).toBe('online content');
    await event.settled();
  });

  it.each([
    ['/tools/budget', true],
    ['/assets/app.js', false],
    ['/manifest.webmanifest', false],
  ])('still serves online %s when cache writes exceed quota', async (path, navigate) => {
    const w = worker();
    w.cache.put.mockRejectedValue(new Error('QuotaExceededError'));
    const event = w.get(path, navigate);
    expect(await (await event.response()).text()).toBe('online content');
    await event.settled();
  });

  it('shows the offline message when both storage and network are unavailable', async () => {
    const w = worker();
    w.caches.open.mockRejectedValue(new Error('Storage disabled'));
    w.fetch.mockRejectedValue(new Error('Offline'));
    const response = await w.get('/tools/budget', true).response();
    expect(response.status).toBe(503);
    expect(await response.text()).toContain('You are offline');
  });

  it('serves the cached shell when the network is unavailable', async () => {
    const w = worker();
    w.cache.match.mockResolvedValue(new Response('saved shell'));
    w.fetch.mockRejectedValue(new Error('Offline'));
    expect(await (await w.get('/tools/budget', true).response()).text()).toBe('saved shell');
  });

  it('serves a cached build asset without requiring the network', async () => {
    const w = worker();
    w.cache.match.mockResolvedValue(new Response('saved script'));
    expect(await (await w.get('/assets/app.js').response()).text()).toBe('saved script');
    expect(w.fetch).not.toHaveBeenCalled();
  });

  it('returns an online asset even when cache lookup fails', async () => {
    const w = worker();
    w.cache.match.mockRejectedValue(new Error('Cache read failed'));
    const event = w.get('/assets/app.js');
    expect(await (await event.response()).text()).toBe('online content');
    await event.settled();
  });

  it('keeps successful asset cache writes alive after returning the response', async () => {
    const w = worker();
    let finish!: () => void;
    w.cache.put.mockReturnValue(new Promise<void>(resolve => { finish = resolve; }));
    const event = w.get('/assets/app.js');
    expect(await (await event.response()).text()).toBe('online content');
    expect(event.pending.length).toBeGreaterThan(0);
    finish();
    await event.settled();
  });
});

describe('service worker update installation', () => {
  it('finishes installation when the shell and its entry assets are cached', async () => {
    const w = worker();
    w.fetch.mockResolvedValue(new Response('<script src="/assets/entry.js"></script><link href="/assets/style.css">'));
    await w.dispatch('install').settled();
    expect(w.cache.add).toHaveBeenCalledWith('/assets/entry.js');
    expect(w.cache.add).toHaveBeenCalledWith('/assets/style.css');
    expect(w.cache.put).toHaveBeenCalledWith('/index.html', expect.any(Response));
  });

  it('does not activate an update whose shell failed to download', async () => {
    const w = worker();
    w.fetch.mockResolvedValue(new Response('unavailable', { status: 503 }));
    await expect(w.dispatch('install').settled()).rejects.toThrow();
  });

  it('does not replace the working shell with an HTML error page returned as 200', async () => {
    const w = worker();
    w.fetch.mockResolvedValue(new Response('<html><body>Temporarily unavailable</body></html>'));
    await expect(w.dispatch('install').settled()).rejects.toThrow();
    expect(w.cache.put).not.toHaveBeenCalled();
  });

  it('does not activate an update with missing entry assets', async () => {
    const w = worker();
    w.fetch.mockResolvedValue(new Response('<script src="/assets/entry.js"></script>'));
    w.cache.add.mockRejectedValue(new Error('Offline'));
    await expect(w.dispatch('install').settled()).rejects.toThrow();
  });
});
