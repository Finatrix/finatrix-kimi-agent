/**
 * In-app account deletion (Google Play requirement; supabase/functions/account-delete).
 *
 * The one irreversible action the product offers, so the guard rails are the
 * contract: nothing is sent until the account's own email is typed, a failure
 * keeps the account signed in and says why, and success clears this device and signs out.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';

const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  signOut: vi.fn(async () => {}),
  clearSyncedLocal: vi.fn(),
  setLastUid: vi.fn(),
}));

vi.mock('../lib/functions', () => ({ invokeAuthed: h.invoke }));
vi.mock('../tools/cloudSync', () => ({ clearSyncedLocal: h.clearSyncedLocal, setLastUid: h.setLastUid }));
vi.mock('../context/AuthContext', () => ({ useAuth: () => ({ signOut: h.signOut }) }));

import DeleteAccount from '../components/DeleteAccount';

const EMAIL = 'asha@example.com';

function setup() {
  render(
    <MemoryRouter initialEntries={['/profile']}>
      <Routes>
        <Route path="/profile" element={<DeleteAccount email={EMAIL} />} />
        <Route path="/login" element={<p>login page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: /delete my account/i }));
  return {
    field: screen.getByLabelText(new RegExp(`Type ${EMAIL}`)),
    confirm: screen.getByRole('button', { name: /delete forever/i }),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('DeleteAccount', () => {
  it('stays disabled until the account email is typed exactly (case-insensitive)', () => {
    const { field, confirm } = setup();
    expect(confirm).toBeDisabled();
    fireEvent.change(field, { target: { value: 'someone@else.com' } });
    fireEvent.click(confirm);
    expect(confirm).toBeDisabled();
    expect(h.invoke).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: ' ASHA@example.com ' } });
    expect(confirm).toBeEnabled();
  });

  it('deletes server-side, clears this device, signs out and confirms', async () => {
    h.invoke.mockResolvedValue({ data: { deleted: true }, error: null, reason: null });
    const { field, confirm } = setup();
    fireEvent.change(field, { target: { value: EMAIL } });
    fireEvent.click(confirm);
    await screen.findByText('login page');
    expect(h.invoke).toHaveBeenCalledWith('account-delete', { confirm: 'DELETE' });
    expect(h.clearSyncedLocal).toHaveBeenCalled();
    expect(h.setLastUid).toHaveBeenCalledWith(null);
    expect(h.signOut).toHaveBeenCalled();
  });

  /** supabase-js puts the function's HTTP response on `error.context`. */
  function httpError(status: number, body: unknown) {
    return Object.assign(new Error(`HTTP ${status}`), {
      context: new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }),
    });
  }

  async function failWith(result: unknown) {
    h.invoke.mockResolvedValue(result);
    const { field, confirm } = setup();
    fireEvent.change(field, { target: { value: EMAIL } });
    fireEvent.click(confirm);
    const alert = await screen.findByRole('alert');
    expect(h.signOut).not.toHaveBeenCalled();
    expect(h.clearSyncedLocal).not.toHaveBeenCalled();
    expect(h.setLastUid).not.toHaveBeenCalled();
    expect(screen.queryByText('login page')).toBeNull();
    return alert;
  }

  it('on a server failure shows the server\'s reason and keeps the user signed in', async () => {
    const reason = 'Your account was not deleted because some of your files could not be removed. Please try again.';
    const alert = await failWith({ data: null, error: httpError(500, { error: reason }), reason: 'invoke-error' });
    expect(alert).toHaveTextContent(reason);
  });

  it('on no answer at all never claims to know what happened server-side', async () => {
    const alert = await failWith({ data: null, error: new Error('Failed to fetch'), reason: 'invoke-error' });
    expect(alert).toHaveTextContent(/could not reach finatrix/i);
    expect(alert).not.toHaveTextContent(/nothing was removed/i);
  });

  it('asks for a fresh sign-in when the session has expired', async () => {
    const alert = await failWith({ data: null, error: new Error('No active session'), reason: 'no-session' });
    expect(alert).toHaveTextContent(/sign in again/i);
  });

  it('treats a 200 that does not say deleted as a failure', async () => {
    await failWith({ data: { deleted: false }, error: null, reason: null });
  });

  it('re-enables the button after a failure so the user can retry', async () => {
    await failWith({ data: null, error: httpError(429, { error: 'Too many attempts.' }), reason: 'invoke-error' });
    await waitFor(() => expect(screen.getByRole('button', { name: /delete forever/i })).toBeEnabled());
  });
});
