import { describe, it, expect } from 'vitest';
import { safeUrl, stripHtml, num, iso, str, normToken, postedDate } from './sanitize.ts';

describe('sanitize.safeUrl', () => {
  it('accepts http and https', () => {
    expect(safeUrl('https://example.com/apply')).toBe('https://example.com/apply');
    expect(safeUrl('http://example.com')).toBe('http://example.com/');
  });
  it('rejects dangerous schemes', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JavaScript:alert(1)',
      'data:text/html,<script>alert(1)</script>',
      'file:///etc/passwd',
      'mailto:x@y.com',
      'vbscript:msgbox',
    ]) {
      expect(safeUrl(bad), bad).toBe('');
    }
  });
  it('rejects malformed and non-string input', () => {
    expect(safeUrl('not a url')).toBe('');
    expect(safeUrl('')).toBe('');
    expect(safeUrl(null)).toBe('');
    expect(safeUrl(42)).toBe('');
    expect(safeUrl('https://')).toBe('');
  });
});

describe('sanitize.stripHtml', () => {
  it('removes tags and script blocks, keeps text', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
    expect(stripHtml('<script>alert(1)</script>Safe')).toBe('Safe');
    expect(stripHtml('A<style>.x{}</style>B')).toBe('A B');
  });
  it('decodes common entities and collapses whitespace', () => {
    expect(stripHtml('Tom&nbsp;&amp;&nbsp;Jerry')).toBe('Tom & Jerry');
    expect(stripHtml('a\n\n   b')).toBe('a b');
  });
  it('clamps length', () => {
    expect(stripHtml('x'.repeat(50), 10).length).toBe(10);
  });
});

describe('sanitize primitives', () => {
  it('num returns positive integers or null', () => {
    expect(num(1200000)).toBe(1200000);
    expect(num('2500.7')).toBe(2501);
    expect(num(0)).toBeNull();
    expect(num(-5)).toBeNull();
    expect(num('abc')).toBeNull();
  });
  it('iso parses dates or returns null', () => {
    expect(iso('2026-07-01')).toBe('2026-07-01T00:00:00.000Z');
    expect(iso('garbage')).toBeNull();
    expect(iso(null)).toBeNull();
  });
  it('str clamps and coerces', () => {
    expect(str('hello', 3)).toBe('hel');
    expect(str(42)).toBe('42');
    expect(str({})).toBe('');
  });
  it('normToken lowercases and collapses non-alnum', () => {
    expect(normToken('Acme,  Corp!!')).toBe('acme corp');
  });
});

describe('sanitize.postedDate', () => {
  const NOW = new Date('2026-07-25T12:00:00Z').getTime();

  it('passes absolute dates through as ISO', () => {
    expect(postedDate('2026-07-24T10:00:00Z', NOW)).toBe('2026-07-24T10:00:00.000Z');
    expect(postedDate('2026-07-24 10:00:00', NOW)).toBe(new Date('2026-07-24 10:00:00').toISOString());
  });

  // Google Jobs (detected_extensions.posted_at) and Workday (postedOn) both
  // return human text. Passing it through broke the ISO contract, wrote an
  // unparseable value to jobs.posted_at (timestamptz) and lost all freshness.
  it('resolves the relative forms real providers emit', () => {
    expect(postedDate('2 days ago', NOW)).toBe('2026-07-23T12:00:00.000Z');
    expect(postedDate('Posted 3 Days Ago', NOW)).toBe('2026-07-22T12:00:00.000Z');
    expect(postedDate('30+ days ago', NOW)).toBe('2026-06-25T12:00:00.000Z');
    expect(postedDate('5 hours ago', NOW)).toBe('2026-07-25T07:00:00.000Z');
    expect(postedDate('1 week ago', NOW)).toBe('2026-07-18T12:00:00.000Z');
    expect(postedDate('Just posted', NOW)).toBe('2026-07-25T12:00:00.000Z');
    expect(postedDate('Yesterday', NOW)).toBe('2026-07-24T12:00:00.000Z');
  });

  it('returns null rather than inventing a date it cannot read', () => {
    expect(postedDate('sometime recently', NOW)).toBeNull();
    expect(postedDate('', NOW)).toBeNull();
    expect(postedDate(null, NOW)).toBeNull();
    expect(postedDate(undefined, NOW)).toBeNull();
  });

  it('never returns a value new Date() cannot parse back', () => {
    for (const v of ['2 days ago', 'Posted 3 Days Ago', '2026-07-24T10:00:00Z', 'Just posted']) {
      const out = postedDate(v, NOW)!;
      expect(Number.isNaN(new Date(out).getTime())).toBe(false);
    }
  });
});
