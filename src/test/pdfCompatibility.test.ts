import { describe, expect, it, vi } from 'vitest';
import { pdfCompatibilityMessage } from '../lib/pdfCompatibility';

describe('PDF stays an optional feature on older engines', () => {
  it('explains the iOS and Android floors while leaving newer engines enabled', () => {
    vi.stubGlobal('Worker', class {});
    vi.stubGlobal('ReadableStream', class {});
    vi.stubGlobal('WebAssembly', {});
    try {
      expect(pdfCompatibilityMessage('Mozilla/5.0 (iPhone; CPU iPhone OS 15_4 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'))
        .toMatch(/iOS 18/);
      expect(pdfCompatibilityMessage('Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 Chrome/91.0.4472.114 Mobile Safari/537.36'))
        .toMatch(/newer Android System WebView/);
      expect(pdfCompatibilityMessage('Mozilla/5.0 (Linux; Android 16) AppleWebKit/537.36 Chrome/133.0.0.0 Mobile Safari/537.36'))
        .toBeNull();
      expect(pdfCompatibilityMessage('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'))
        .toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('rejects an engine that lacks worker support even if its version is new', () => {
    expect(pdfCompatibilityMessage('Chrome/133.0.0.0')).toMatch(/PDF import is unavailable/);
  });
});
