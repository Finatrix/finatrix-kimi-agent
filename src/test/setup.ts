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
