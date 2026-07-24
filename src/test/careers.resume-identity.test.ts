import { describe, expect, it } from 'vitest';
import { uniqueResumeName } from '../careers/services/resumes';

/**
 * Audit regression guard (P3): re-uploading a file after a run that failed
 * part-way — the normal recovery path — created a second resume family with
 * the same name, file, date and "v1" as the first. The library then showed two
 * cards nothing on screen could tell apart, so rename and delete were a coin
 * flip. Default names are now suffixed away from any name already in use.
 */
describe('uniqueResumeName', () => {
  it('leaves an unused name alone', () => {
    expect(uniqueResumeName('Finance Resume', [])).toBe('Finance Resume');
    expect(uniqueResumeName('Finance Resume', ['Product Resume'])).toBe('Finance Resume');
  });

  it('suffixes a name a family already owns', () => {
    expect(uniqueResumeName('Resume', ['Resume'])).toBe('Resume (2)');
    expect(uniqueResumeName('Resume', ['Resume', 'Resume (2)'])).toBe('Resume (3)');
  });

  it('treats case and surrounding whitespace as the same name', () => {
    expect(uniqueResumeName('resume', ['  Resume  '])).toBe('resume (2)');
    expect(uniqueResumeName(' Resume ', ['RESUME'])).toBe('Resume (2)');
  });

  it('falls back to a sensible name when the file name is empty', () => {
    expect(uniqueResumeName('', [])).toBe('Resume');
    expect(uniqueResumeName('   ', ['Resume'])).toBe('Resume (2)');
  });

  it('always returns something not already taken', () => {
    const existing = ['Resume', ...Array.from({ length: 40 }, (_, i) => `Resume (${i + 2})`)];
    const next = uniqueResumeName('Resume', existing);
    expect(existing).not.toContain(next);
    expect(next).toBe('Resume (42)');
  });
});
