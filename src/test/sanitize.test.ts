import { describe, expect, it } from 'vitest';

import { safeHttpUrl } from '../lib/sanitize';

describe('safeHttpUrl', () => {
  it('keeps web links and normalises them', () => {
    expect(safeHttpUrl('https://boards.greenhouse.io/acme/jobs/1')).toBe('https://boards.greenhouse.io/acme/jobs/1');
    expect(safeHttpUrl('  http://example.com ')).toBe('http://example.com/');
  });
  it('refuses every scheme that can run code or leave the web', () => {
    for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///etc/passwd', 'intent://x#Intent;end', '//evil.com', 'not a url', '', '   ']) {
      expect(safeHttpUrl(bad)).toBe('');
    }
    expect(safeHttpUrl(undefined)).toBe('');
    expect(safeHttpUrl({})).toBe('');
    expect(safeHttpUrl(`https://a.com/${'x'.repeat(2100)}`)).toBe('');
  });
});
