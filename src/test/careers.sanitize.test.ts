import { describe, it, expect } from 'vitest';
import {
  clampScore,
  escapeHtml,
  sanitizeField,
  sanitizeFileName,
  sanitizeProse,
  sanitizeStringArray,
  sanitizeText,
} from '../careers/utils/sanitize';

describe('careers sanitize', () => {
  it('normalizes line endings and strips zero-width / bidi characters', () => {
    const dirty = 'Line1\r\nLine2 \u200B\u202Eevil';
    expect(sanitizeText(dirty)).toBe('Line1\nLine2 evil');
  });

  it('collapses excessive blank lines', () => {
    expect(sanitizeText('a\n\n\n\n\n\nb')).toBe('a\n\n\nb');
  });

  it('strips markup the model invented from fields', () => {
    expect(sanitizeField('<script>alert(1)</script>John Doe')).toBe('alert(1)John Doe');
    expect(sanitizeField('<img src=x onerror=alert(1)>CEO')).toBe('CEO');
  });

  it('coerces non-strings to empty fields', () => {
    expect(sanitizeField(42)).toBe('');
    expect(sanitizeField(null)).toBe('');
    expect(sanitizeField({ evil: true })).toBe('');
  });

  it('caps field length', () => {
    expect(sanitizeField('x'.repeat(1000), 50)).toHaveLength(50);
  });

  it('keeps paragraphs in prose but strips tags', () => {
    expect(sanitizeProse('Great <b>work</b>.\n\nMore.')).toBe('Great work.\n\nMore.');
  });

  it('bounds and dedupes string arrays', () => {
    expect(sanitizeStringArray(['a', 'a', 'b', 7, null, '<i>c</i>'], 10)).toEqual(['a', 'b', 'c']);
    expect(sanitizeStringArray('not-an-array')).toEqual([]);
    expect(sanitizeStringArray(Array(100).fill('x'), 5)).toHaveLength(1); // deduped
  });

  it('escapes HTML entities', () => {
    expect(escapeHtml('<a href="x">&\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;');
  });

  it('clamps scores into 0–100 integers', () => {
    expect(clampScore(105)).toBe(100);
    expect(clampScore(-3)).toBe(0);
    expect(clampScore('87.6')).toBe(88);
    expect(clampScore('nope')).toBe(0);
    expect(clampScore(undefined)).toBe(0);
  });

  it('makes file names storage-display safe', () => {
    expect(sanitizeFileName('../..\\evil/resume.pdf')).toBe('.._.._evil_resume.pdf');
    expect(sanitizeFileName('')).toBe('resume');
  });
});
