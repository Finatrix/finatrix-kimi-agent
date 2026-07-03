import { describe, it, expect } from 'vitest';
import {
  CareersError,
  mapSupabaseError,
  toCareersError,
  withRetry,
} from '../careers/utils/errors';

describe('careers errors', () => {
  it('detects missing schema and points at setup', () => {
    const e = mapSupabaseError({ code: '42P01', message: 'relation "resumes" does not exist' }, 'Loading');
    expect(e.code).toBe('not-setup');
    expect(e.retryable).toBe(false);
    expect(e.message).toContain('careers_schema.sql');
  });

  it('detects the PostgREST missing-table code', () => {
    const e = mapSupabaseError({ code: 'PGRST205', message: "Could not find the table 'public.resumes'" }, 'Loading');
    expect(e.code).toBe('not-setup');
  });

  it('maps RLS denials to auth guidance', () => {
    const e = mapSupabaseError({ code: '42501', message: 'permission denied' }, 'Loading');
    expect(e.code).toBe('auth');
  });

  it('falls back to a friendly database error', () => {
    const e = mapSupabaseError({ code: 'XX000', message: 'internal' }, 'Loading your resumes');
    expect(e.code).toBe('database');
    expect(e.message).not.toContain('internal'); // raw messages never surface
  });

  it('classifies fetch failures as network errors', () => {
    expect(toCareersError(new TypeError('Failed to fetch')).code).toBe('network');
  });

  it('withRetry retries retryable errors then succeeds', async () => {
    let calls = 0;
    const result = await withRetry(async () => {
      calls++;
      if (calls < 3) throw new CareersError('network', 'offline');
      return 'ok';
    }, { attempts: 3, baseDelayMs: 1 });
    expect(result).toBe('ok');
    expect(calls).toBe(3);
  });

  it('withRetry fails fast on validation errors', async () => {
    let calls = 0;
    await expect(
      withRetry(async () => {
        calls++;
        throw new CareersError('validation', 'bad file');
      }, { attempts: 3, baseDelayMs: 1 })
    ).rejects.toMatchObject({ code: 'validation' });
    expect(calls).toBe(1);
  });
});
