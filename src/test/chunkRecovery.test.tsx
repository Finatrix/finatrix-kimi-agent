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
  installChunkRecovery, isChunkLoadError, isReloadingForNewBuild, reloadForNewBuild,
  resetChunkRecoveryForTests,
} from '../lib/chunkRecovery';

const realLocation = window.location;
let reload: ReturnType<typeof vi.fn>;
let online = true;

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
});

afterEach(() => {
  cleanup();
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
    expect(isReloadingForNewBuild()).toBe(true);
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

  it('is triggered by the event Vite raises when a chunk cannot be fetched', () => {
    installChunkRecovery();
    window.dispatchEvent(new Event('vite:preloadError'));
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe('the root error boundary', () => {
  function Throw({ error }: { error: Error }): never {
    throw error;
  }
  const chunkError = () =>
    new TypeError('Failed to fetch dynamically imported module: /assets/StatementImport-CoqXlJOA.js');

  it('reloads onto the current build instead of showing an error, when that can help', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container } = render(<ErrorBoundary><Throw error={chunkError()} /></ErrorBoundary>);

    expect(reload).toHaveBeenCalledTimes(1);
    // Nothing is flashed at someone whose page is about to be replaced.
    expect(container).toBeEmptyDOMElement();
  });

  it('says what happened, and retries the same page, when a reload cannot help', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    online = false;
    render(<ErrorBoundary><Throw error={chunkError()} /></ErrorBoundary>);

    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(/didn.t finish loading/i);
    expect(screen.getByRole('alert')).toHaveTextContent(/saved data is safe/i);
    // Not "a glitch on our end", and not a trip to the home page.
    expect(screen.queryByText(/glitch on our end/i)).not.toBeInTheDocument();

    screen.getByRole('button', { name: 'Try again' }).click();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(window.location.assign).not.toHaveBeenCalled();
  });

  it('still treats a real crash as a crash', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<ErrorBoundary><Throw error={new Error('boom')} /></ErrorBoundary>);

    expect(screen.getByText(/glitch on our end/i)).toBeInTheDocument();
    expect(reload).not.toHaveBeenCalled();
  });
});
