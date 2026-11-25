import { describe, it, expect } from 'vitest';
import { checkCareersEntitlement, type EntitlementClient } from '../../supabase/functions/_shared/careersEntitlement';

interface Fake {
  admin?: boolean;
  adminError?: boolean;
  sub?: { plan_id: string; current_period_end?: string | null } | null;
  subError?: boolean;
}

function client({ admin = false, adminError = false, sub = null, subError = false }: Fake): EntitlementClient {
  return {
    rpc: () => Promise.resolve({ data: admin, error: adminError ? new Error('down') : null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          in: () => ({
            maybeSingle: () => Promise.resolve({ data: sub, error: subError ? new Error('down') : null }),
          }),
        }),
      }),
    }),
  };
}

const NOW = Date.parse('2026-11-05T00:00:00Z');
const user = { id: 'u1', app_metadata: {} };
const tester = { id: 'u1', app_metadata: { careers_beta: true } };

describe('checkCareersEntitlement', () => {
  it('lets an admin through before launch, with no subscription', async () => {
    expect(await checkCareersEntitlement(client({ admin: true }), user, false, NOW)).toEqual({ allowed: true });
  });

  it('refuses a paying account before launch unless it is a beta tester', async () => {
    const sub = { plan_id: 'premium' };
    expect(await checkCareersEntitlement(client({ sub }), user, false, NOW))
      .toMatchObject({ allowed: false, reason: 'not-launched' });
    expect(await checkCareersEntitlement(client({ sub }), tester, false, NOW)).toEqual({ allowed: true });
  });

  it('ignores a beta flag in user-editable metadata', async () => {
    const forged = { id: 'u1', app_metadata: {}, user_metadata: { careers_beta: true } };
    expect(await checkCareersEntitlement(client({ sub: { plan_id: 'premium' } }), forged, false, NOW))
      .toMatchObject({ allowed: false, reason: 'not-launched' });
  });

  it('refuses the free plan and no plan at all after launch', async () => {
    expect(await checkCareersEntitlement(client({ sub: { plan_id: 'free' } }), user, true, NOW))
      .toMatchObject({ allowed: false, status: 403, reason: 'not-subscribed' });
    expect(await checkCareersEntitlement(client({}), user, true, NOW))
      .toMatchObject({ allowed: false, reason: 'not-subscribed' });
  });

  it('treats a period that has ended as unpaid, ahead of the expiry job', async () => {
    const sub = { plan_id: 'student', current_period_end: '2026-11-04T00:00:00Z' };
    expect(await checkCareersEntitlement(client({ sub }), user, true, NOW))
      .toMatchObject({ allowed: false, reason: 'not-subscribed' });
  });

  it('allows a current paid period', async () => {
    const sub = { plan_id: 'student', current_period_end: '2026-12-04T00:00:00Z' };
    expect(await checkCareersEntitlement(client({ sub }), user, true, NOW)).toEqual({ allowed: true });
  });

  it('fails closed when either lookup errors', async () => {
    expect(await checkCareersEntitlement(client({ adminError: true }), user, true, NOW))
      .toMatchObject({ allowed: false, status: 503 });
    expect(await checkCareersEntitlement(client({ subError: true }), user, true, NOW))
      .toMatchObject({ allowed: false, status: 503 });
  });
});
