/**
 * A part of the app that fails to load must not look like a crash.
 *
 * Pins the repair for "pressing Import on a tab left open over a deploy
 * replaced the whole app with the error screen" — see lib/chunkRecovery.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import ErrorBoundary from '../components/ErrorBoundary';
import {
  installChunkRecovery, isBuildStale, isChunkLoadError, reloadForNewBuild, reloadIfBuildIsStale,
  resetChunkRecoveryForTests,
} from '../lib/chunkRecovery';

const realLocation = window.location;
let reload: ReturnType<typeof vi.fn>;
let online = true;
let entryScript: HTMLScriptElement;

/** The app shell as the server would send it for a given build. */
const shell = (entry: string) => `<!doctype html><script type="module" crossorigin src="${entry}"></script><div id="root"></div>`;
const THIS_BUILD = '/assets/index-thisbuild.js';
const NEWER_BUILD = '/assets/index-newerbuild.js';

/** What the server answers when asked for the shell. */
function serverHas(body: string | Error, status = 200) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    if (body instanceof Error) throw body;
    return new Response(body, { status, headers: { 'content-type': 'text/html' } });
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  sessionStorage.clear();
  resetChunkRecoveryForTests();
  online = true;
  reload = vi.fn();
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...realLocation, reload, assign: vi.fn() },
  });
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
  // This page booted from THIS_BUILD.
  entryScript = document.createElement('script');
  entryScript.type = 'module';
  entryScript.setAttribute('src', THIS_BUILD);
  document.head.appendChild(entryScript);
});

afterEach(() => {
  cleanup();
  entryScript.remove();
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation });
  vi.restoreAllMocks();
});

describe('isChunkLoadError', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://finatrix.co/assets/StatementImport-CoqXlJOA.js',
    'error loading dynamically imported module: https://finatrix.co/assets/StatementImport-CoqXlJOA.js',
    'Importing a module script failed.',
    'Unable to preload CSS for /assets/ExpensePage-abc.css',
  ])('recognises how an engine words it: %s', (message) => {
    expect(isChunkLoadError(new TypeError(message))).toBe(true);
  });

  it('does not mistake an ordinary bug for one', () => {
    expect(isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'map')"))).toBe(false);
    expect(isChunkLoadError(new Error('boom'))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false);
  });
});

describe('reloadForNewBuild', () => {
  it('reloads once when online, and reports that it is on its way', () => {
    expect(reloadForNewBuild(1_000_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    // Asked again before the page has gone: still one reload.
    expect(reloadForNewBuild(1_000_500)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('never reloads offline, where a reload cannot fetch anything', () => {
    online = false;
    expect(reloadForNewBuild()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('refuses a second reload inside a minute, so a failure a reload did not cure cannot loop', () => {
    expect(reloadForNewBuild(1_000_000)).toBe(true);
    // The page came back (module state is new, sessionStorage is not) and the
    // same chunk failed again.
    resetChunkRecoveryForTests();
    expect(reloadForNewBuild(1_030_000)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
    // Much later it is a different situation, and worth one more try.
    expect(reloadForNewBuild(1_061_000)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does nothing when it cannot record the attempt', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(reloadForNewBuild()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

});

describe('isBuildStale', () => {
  it('is true when the server now names a different entry script', async () => {
    const fetched = serverHas(shell(NEWER_BUILD));
    expect(await isBuildStale()).toBe(true);
    // Asked past every cache: a stale shell would answer "nothing has changed".
    const [url, init] = fetched.mock.calls[0];
    expect(String(url)).toMatch(/^\/index\.html\?build-check=\d+$/);
    expect(init).toMatchObject({ cache: 'no-store' });
  });

  it('is false when the server still serves the build this page is running', async () => {
    serverHas(shell(THIS_BUILD));
    expect(await isBuildStale()).toBe(false);
  });

  it.each([
    ['the request fails (offline, or the page is being torn down)', new TypeError('Load failed'), 200],
    ['the server answers with an error', 'Service unavailable', 503],
    ['the answer is not an app shell at all', '<html><body>Sign in to this network</body></html>', 200],
  ])('is false when %s', async (_why, body, status) => {
    serverHas(body as string | Error, status as number);
    expect(await isBuildStale()).toBe(false);
  });

  it('is false where there is no hashed entry to compare, as on the dev server', async () => {
    entryScript.remove();
    const fetched = serverHas(shell(NEWER_BUILD));
    expect(await isBuildStale()).toBe(false);
    expect(fetched).not.toHaveBeenCalled();
  });
});

describe('reloadIfBuildIsStale', () => {
  it('reloads when there is a newer build', async () => {
    serverHas(shell(NEWER_BUILD));
    expect(await reloadIfBuildIsStale()).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when the build has not changed', async () => {
    // What WebKit produces when a navigation interrupts an import in flight:
    // a failed chunk with nothing wrong on the server. Reloading here would
    // cancel the navigation the user asked for.
    serverHas(shell(THIS_BUILD));
    expect(await reloadIfBuildIsStale()).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('does not even ask when offline', async () => {
    online = false;
    const fetched = serverHas(shell(NEWER_BUILD));
    expect(await reloadIfBuildIsStale()).toBe(false);
    expect(fetched).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('is what the event Vite raises for a failed chunk leads to', async () => {
    serverHas(shell(NEWER_BUILD));
    installChunkRecovery();
    window.dispatchEvent(new Event('vite:preloadError'));
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('leaves the page alone when that event fires with the build unchanged', async () => {
    serverHas(shell(THIS_BUILD));
    installChunkRecovery();
    window.dispatchEvent(new Event('vite:preloadError'));
    await settle();
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('the root error boundary', () => {
  function Throw({ error }: { error: Error }): never {
    throw error;
  }
  const chunkError = () =>
    new TypeError('Failed to fetch dynamically imported module: /assets/StatementImport-CoqXlJOA.js');

  it('reloads onto the newer build instead of showing an error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    serverHas(shell(NEWER_BUILD));
    const { container } = render(<ErrorBoundary><Throw error={chunkError()} /></ErrorBoundary>);

    // Nothing is flashed while it finds out, or once it is reloading.
    expect(container).toBeEmptyDOMElement();
    await settle();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(container).toBeEmptyDOMElement();
  });

  it('says what happened, and retries the same page, when there is no newer build', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    serverHas(shell(THIS_BUILD));
    render(<ErrorBoundary><Throw error={chunkError()} /></ErrorBoundary>);

    expect(await screen.findByRole('alert')).toHaveTextContent(/didn.t finish loading/i);
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/saved data is safe/i);
    // Not "a glitch on our end", and not a trip to the home page.
    expect(screen.queryByText(/glitch on our end/i)).not.toBeInTheDocument();

    screen.getByRole('button', { name: 'Try again' }).click();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('says so when offline, without asking the server anything', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    online = false;
    const fetched = serverHas(shell(NEWER_BUILD));
    render(<ErrorBoundary><Throw error={chunkError()} /></ErrorBoundary>);

    expect(await screen.findByRole('alert')).toHaveTextContent(/didn.t finish loading/i);
    expect(fetched).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });

  it('still treats a real crash as a crash', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Throw error={new Error('boom')} /></ErrorBoundary>);

    expect(screen.getByText(/glitch on our end/i)).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
