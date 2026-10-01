import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn(), invoke: vi.fn() }));
vi.mock('../lib/supabase', () => ({
  isSupabaseConfigured: true,
  supabase: { auth: { getSession: h.getSession, refreshSession: h.refreshSession }, functions: { invoke: h.invoke } },
}));
import { currentAccessToken, invokeAuthed } from '../lib/functions';

beforeEach(() => {
  h.getSession.mockReset().mockResolvedValue({ data: { session: { access_token: 'current-token', expires_at: Date.now() / 1000 + 3600 } }, error: null });
  h.refreshSession.mockReset();
  h.invoke.mockReset().mockResolvedValue({ data: { deleted: true }, error: null });
});

describe('authenticated function failures', () => {
  it('attaches the active session token', async () => {
    expect(await invokeAuthed('account-delete', { confirm: 'DELETE' })).toEqual({ data: { deleted: true }, error: null, reason: null });
    expect(h.invoke).toHaveBeenCalledWith('account-delete', { body: { confirm: 'DELETE' }, headers: { Authorization: 'Bearer current-token' } });
  });

  it('contains a rejected session lookup and prevents the destructive request', async () => {
    const error = new Error('Storage unavailable');
    h.getSession.mockRejectedValue(error);
    expect(await invokeAuthed('account-delete', {})).toEqual({ data: null, error, reason: 'invoke-error' });
    expect(h.invoke).not.toHaveBeenCalled();
    expect(await currentAccessToken()).toBeNull();
  });

  it('contains a rejected function call so callers can end their loading state', async () => {
    const error = new Error('Network unavailable');
    h.invoke.mockRejectedValue(error);
    expect(await invokeAuthed('account-delete', {})).toEqual({ data: null, error, reason: 'invoke-error' });
  });

  it('never reuses the old token after refresh removes the session', async () => {
    h.getSession.mockResolvedValue({ data: { session: { access_token: 'expired-token', expires_at: Date.now() / 1000 - 1 } } });
    h.refreshSession.mockResolvedValue({ data: { session: null }, error: null });
    expect((await invokeAuthed('account-delete', {})).reason).toBe('no-session');
    expect(h.invoke).not.toHaveBeenCalled();
  });

  it('reports refresh failures instead of invoking with an expired credential', async () => {
    h.getSession.mockResolvedValue({ data: { session: { access_token: 'expired-token', expires_at: Date.now() / 1000 - 1 } } });
    const error = new Error('Could not refresh');
    h.refreshSession.mockResolvedValue({ data: { session: null }, error });
    expect(await invokeAuthed('account-delete', {})).toEqual({ data: null, error, reason: 'invoke-error' });
    expect(h.invoke).not.toHaveBeenCalled();
  });
});
