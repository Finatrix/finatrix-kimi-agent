// Global Vitest setup. @testing-library/react registers automatic DOM cleanup
// between tests when run with Vitest globals enabled.
import '@testing-library/jest-dom/vitest';

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
