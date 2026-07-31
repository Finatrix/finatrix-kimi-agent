// Global Vitest setup. @testing-library/react registers automatic DOM cleanup
// between tests when run with Vitest globals enabled.
import '@testing-library/jest-dom/vitest';

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
