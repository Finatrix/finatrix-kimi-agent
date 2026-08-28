/**
 * The open-redirect gate, exercised with the payloads that defeat a prefix check.
 *
 * Every string in `BYPASSES` passes `startsWith('/') && !startsWith('//')` — the
 * test the two call sites used to run inline — and then parses as a path
 * beginning `//`, because the WHATWG URL parser folds backslashes and strips
 * tabs and newlines before it decides where the authority ends. They are the
 * reason the check moved from string prefixes to real URL resolution.
 */
import { describe, it, expect } from 'vitest';
import { safeInternalPath } from '../lib/safePath';

const ORIGIN = 'https://finatrix.co';
const FALLBACK = '/tools';
const safe = (c: string | null | undefined) => safeInternalPath(c, FALLBACK, ORIGIN);

/** Written the way a prefix check reads them: all start `/`, none start `//`. */
const BYPASSES = [
  '/\\evil.example',
  '/\\\\evil.example',
  '/\t/evil.example',
  '/\n/evil.example',
  '/\r/evil.example',
  '/./\\evil.example',
];

describe('safeInternalPath', () => {
  it('keeps a plain same-site path, with its query and hash', () => {
    expect(safe('/tools/budget')).toBe('/tools/budget');
    expect(safe('/tools/expenses?add=340%20lunch')).toBe('/tools/expenses?add=340%20lunch');
    expect(safe('/learn/budgeting#in-short')).toBe('/learn/budgeting#in-short');
  });

  it('rejects an absolute URL to another origin', () => {
    expect(safe('https://evil.example')).toBe(FALLBACK);
    expect(safe('https://evil.example/tools')).toBe(FALLBACK);
    expect(safe('http://finatrix.co/tools')).toBe(FALLBACK); // scheme downgrade
  });

  it('rejects a protocol-relative URL', () => {
    expect(safe('//evil.example')).toBe(FALLBACK);
    expect(safe('//evil.example/tools')).toBe(FALLBACK);
  });

  it('rejects a scheme that is not navigation at all', () => {
    expect(safe('javascript:alert(1)')).toBe(FALLBACK);
    expect(safe('data:text/html,<script>alert(1)</script>')).toBe(FALLBACK);
  });

  it.each(BYPASSES)('rejects %j, which survives a startsWith check', (candidate) => {
    // The bypass is only interesting if the old guard really would have passed
    // it — assert that first, so this test cannot quietly stop testing anything.
    expect(candidate.startsWith('/') && !candidate.startsWith('//')).toBe(true);
    expect(safe(candidate)).toBe(FALLBACK);
  });

  it('falls back for an absent or empty candidate', () => {
    expect(safe(null)).toBe(FALLBACK);
    expect(safe(undefined)).toBe(FALLBACK);
    expect(safe('')).toBe(FALLBACK);
  });

  it('normalises a same-site path rather than echoing the raw string', () => {
    // Still this origin, so it is honoured — but the caller gets what the
    // browser would navigate to, not the text that was handed in.
    expect(safe('/tools/../learn')).toBe('/learn');
  });

  it('resolves a host that only looks like a subdomain of ours', () => {
    expect(safe('https://finatrix.co.evil.example/tools')).toBe(FALLBACK);
    expect(safe('https://evil.example/?x=finatrix.co')).toBe(FALLBACK);
  });
});
