import { describe, it, expect } from 'vitest';
import { assertSafeHttpsUrl, isBlockedAddress } from './safeUrl.ts';

describe('assertSafeHttpsUrl', () => {
  // `new URL()` rewrites a mapped address to hex before the guard ever sees it.
  it.each([
    'https://127.0.0.1/',
    'https://2130706433/',
    'https://[::1]/',
    'https://[::ffff:127.0.0.1]/',
    'https://[::ffff:169.254.169.254]/',
    'https://[::ffff:10.0.0.1]/',
    'https://[64:ff9b::a9fe:a9fe]/',
    'https://[2002:7f00:1::]/',
    'https://[fec0::1]/',
    'https://198.18.0.1/',
    'https://192.0.0.1/',
  ])('blocks %s', (url) => {
    expect(() => assertSafeHttpsUrl(url)).toThrow();
  });

  it.each([
    'https://boards.greenhouse.io/acme',
    'https://8.8.8.8/',
    'https://[2606:4700:4700::1111]/',
    'https://[::ffff:808:808]/',
  ])('allows %s', (url) => {
    expect(() => assertSafeHttpsUrl(url)).not.toThrow();
  });

  it('reads the hex and dotted mapped forms the same way', () => {
    expect(isBlockedAddress('::ffff:7f00:1')).toBe(true);
    expect(isBlockedAddress('::ffff:127.0.0.1')).toBe(true);
  });
});
