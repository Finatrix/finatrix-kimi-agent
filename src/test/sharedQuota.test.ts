import { describe, it, expect } from 'vitest';
import { privateQuotaKey } from '../../supabase/functions/_shared/sharedQuota';

describe('privateQuotaKey', () => {
  it('is stable, so one address keeps hitting one counter', async () => {
    expect(await privateQuotaKey('203.0.113.9', 's')).toBe(await privateQuotaKey('203.0.113.9', 's'));
  });

  it('separates addresses and does not contain the address', async () => {
    const key = await privateQuotaKey('203.0.113.9', 's');
    expect(key).not.toBe(await privateQuotaKey('203.0.113.10', 's'));
    expect(key).not.toContain('203.0.113.9');
    expect(key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('depends on the secret, so an address cannot be brute-forced from the table', async () => {
    expect(await privateQuotaKey('203.0.113.9', 'a')).not.toBe(await privateQuotaKey('203.0.113.9', 'b'));
  });
});
