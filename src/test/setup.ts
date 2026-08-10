// Global Vitest setup. @testing-library/react registers automatic DOM cleanup
// between tests when run with Vitest globals enabled.
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';

/**
 * How long `findBy*` / `waitFor` may wait before failing.
 *
 * Testing Library's default is 1000ms, which is not a realistic budget for the
 * route-level tests: most pages here are `React.lazy` chunks, so a render has
 * to resolve a dynamic import before anything appears. On a developer machine
 * that lands in tens of milliseconds and every test passes; on a 2-core CI
 * runner under full worker contention it is genuinely marginal.
 *
 * The failure mode is what makes this worth fixing centrally rather than per
 * test: whichever test happens to lose the CPU lottery is the one that fails,
 * so CI goes red on a different, unrelated-looking test each run while the
 * suite stays green locally. Reproduced deliberately with
 * `vitest run --maxWorkers=2`: `E2ERoutes` failed in CI, and locally the same
 * contention took out `careers.matchQueue.page` instead. Both were timeouts
 * waiting on a lazy route, and neither indicated anything wrong with the code.
 *
 * 4s is well clear of that noise while staying below the 15s per-test timeout
 * in vite.config.ts, so a query that will never match still fails with Testing
 * Library's useful "unable to find element" output — including the rendered
 * DOM — rather than being cut off by a bare test-timeout error. A genuinely
 * broken render fails just as reliably, only later.
 */
configure({ asyncUtilTimeout: 4000 });

// jsdom's blank document ships no <title>, but index.html — the shell every
// route is really served from — always does. `applySeo` deliberately writes
// THROUGH the existing node instead of assigning `document.title`, so that it
// can never inject a head tag the shell does not already ship. Without a
// <title> here that write is a silent no-op, and every component test asserting
// a route's document title fails for a reason that exists nowhere but jsdom.
if (typeof document !== 'undefined' && !document.head.querySelector('title')) {
  document.head.appendChild(document.createElement('title'));
}

// jsdom implements neither IntersectionObserver (used by scroll-reveal) nor
// scrollTo. Provide inert shims so components that use them render in tests.
if (!('IntersectionObserver' in globalThis)) {
  class IntersectionObserverMock {
    readonly root = null;
    readonly rootMargin = '';
    readonly thresholds = [];
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver =
    IntersectionObserverMock;
}
if (typeof window !== 'undefined' && typeof window.scrollTo !== 'function') {
  window.scrollTo = () => {};
}
// jsdom implements neither scrollIntoView nor matchMedia. Both are used for
// progressive enhancement only (bringing a filtered list into view; honouring
// prefers-reduced-motion), so inert shims keep the default — motion enabled —
// and let tests exercise the same path a browser takes.
if (typeof Element !== 'undefined' && typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
}

// jsdom ships neither WebCrypto's subtle API nor Blob.arrayBuffer, both used
// by the Careers hashing/validation layer. Bridge to Node's implementations.
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, 'crypto', { value: webcrypto, configurable: true });
}
if (typeof Blob !== 'undefined' && typeof Blob.prototype.arrayBuffer !== 'function') {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}

// jsdom does not implement HTMLCanvasElement.prototype.getContext. Chart.js
// calls it in a useEffect during ExpensePage renders; without this shim
// every ExpensePage test logs a "Not implemented" error to stderr even though
// the tests themselves pass. Provide a minimal no-op implementation.
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = function () {
    return null;
  } as typeof HTMLCanvasElement.prototype.getContext;
}
