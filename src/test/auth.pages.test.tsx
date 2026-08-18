import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

/**
 * The two pages a Supabase auth email can land on.
 *
 * Both were reachable and both were dead ends. `/login` rendered a sign-in form
 * to people who had just been handed a working session by a confirmation link,
 * and reported failures from its two secondary actions inside a green success
 * notice. `/reset-password` did not exist at all — the recovery link pointed at
 * `/login`, so anyone who had forgotten their password had no route back into
 * their account.
 */

const h = vi.hoisted(() => ({
  auth: {} as Record<string, unknown>,
  signIn: vi.fn(),
  signInWithProvider: vi.fn(),
  resendVerification: vi.fn(),
  resetPassword: vi.fn(),
  updatePassword: vi.fn(),
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => h.auth,
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('../lib/analytics', () => ({ track: vi.fn(), trackPageView: vi.fn() }));

import Login from '../pages/Login';
import ResetPassword from '../pages/ResetPassword';

type User = { id: string; email: string };

function setAuth(overrides: Record<string, unknown> = {}) {
  h.auth = {
    user: null,
    session: null,
    loading: false,
    configured: true,
    callbackError: null,
    recovery: false,
    signUp: vi.fn(),
    signIn: h.signIn,
    signInWithProvider: h.signInWithProvider,
    signOut: vi.fn(),
    resendVerification: h.resendVerification,
    resetPassword: h.resetPassword,
    updatePassword: h.updatePassword,
    ...overrides,
  };
}

/** Renders a page with a stand-in for every destination it might navigate to. */
function renderAt(entry: string, element: React.ReactElement) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/login" element={element} />
        <Route path="/reset-password" element={element} />
        <Route path="/tools" element={<p>TOOLS PAGE</p>} />
        <Route path="/careers/dashboard" element={<p>CAREERS PAGE</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  for (const fn of [h.signIn, h.signInWithProvider, h.resendVerification, h.resetPassword, h.updatePassword]) {
    fn.mockReset().mockResolvedValue({ error: null });
  }
  setAuth();
});
afterEach(cleanup);

describe('/login', () => {
  /**
   * The email-confirmation strand. `signUp` sets `emailRedirectTo` to /login, so
   * clicking the link establishes a session and lands here — where the user was
   * shown "Welcome back, sign in" for the account they had just activated.
   */
  it('sends a visitor who already has a session onward instead of asking them to sign in', async () => {
    setAuth({ user: { id: 'u1', email: 'a@test.invalid' } satisfies User });
    renderAt('/login', <Login />);
    expect(await screen.findByText('TOOLS PAGE')).toBeInTheDocument();
  });

  it('waits for the session check before deciding — a slow restore is not a signed-out user', () => {
    setAuth({ user: null, loading: true });
    renderAt('/login', <Login />);
    expect(screen.queryByText('TOOLS PAGE')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Welcome back' })).toBeInTheDocument();
  });

  it('returns a signed-in visitor to the page they were sent here from', async () => {
    setAuth({ user: { id: 'u1', email: 'a@test.invalid' } satisfies User });
    renderAt('/login?next=%2Fcareers%2Fdashboard', <Login />);
    expect(await screen.findByText('CAREERS PAGE')).toBeInTheDocument();
  });

  /**
   * `?next=` is attacker-controlled. Honouring an absolute URL would make this
   * page an open redirector: a link that reads as finatrix.co, shows a genuine
   * sign-in form, and hands the browser to someone else's site on success.
   */
  it.each(['https://evil.example/harvest', '//evil.example/harvest'])(
    'refuses to forward to an off-site destination (%s)',
    async (target) => {
      setAuth({ user: { id: 'u1', email: 'a@test.invalid' } satisfies User });
      renderAt(`/login?next=${encodeURIComponent(target)}`, <Login />);
      expect(await screen.findByText('TOOLS PAGE')).toBeInTheDocument();
    },
  );

  it('signs in and moves on', async () => {
    renderAt('/login', <Login />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: ' a@test.invalid ' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'hunter2000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => expect(h.signIn).toHaveBeenCalledWith('a@test.invalid', 'hunter2000'));
    expect(await screen.findByText('TOOLS PAGE')).toBeInTheDocument();
  });

  it('shows a rejected sign-in as an alert', async () => {
    h.signIn.mockResolvedValue({ error: 'That email and password do not match an account.' });
    renderAt('/login', <Login />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@test.invalid' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('do not match an account');
    expect(screen.queryByText('TOOLS PAGE')).not.toBeInTheDocument();
  });

  /**
   * The regression this pins: both secondary actions used to route their
   * FAILURE into the success notice, which is green and carries `role="status"`
   * — so a screen reader announced a failure as a passive status update, and
   * everyone else read "sent" styling wrapped around the words explaining that
   * nothing had been sent.
   */
  it('shows a failed password-reset request as an alert, not as a success', async () => {
    h.resetPassword.mockResolvedValue({ error: 'Too many attempts in a short time.' });
    renderAt('/login', <Login />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@test.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a failed verification resend as an alert, not as a success', async () => {
    h.resendVerification.mockResolvedValue({ error: 'Could not resend the email.' });
    renderAt('/login', <Login />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@test.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Resend verification' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not resend');
  });

  it('confirms a sent reset link as a success', async () => {
    renderAt('/login', <Login />);
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@test.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Password reset link sent');
    expect(h.resetPassword).toHaveBeenCalledWith('a@test.invalid');
  });

  /**
   * A link GoTrue rejected arrives as URL fragment parameters and nothing else
   * reports it, so without this the page renders as an ordinary sign-in form
   * and a dead confirmation link looks like a page that simply did nothing.
   */
  it('explains a link the backend refused on the way here', () => {
    setAuth({ callbackError: 'That link has expired. Request a fresh one below.' });
    renderAt('/login', <Login />);
    expect(screen.getByRole('alert')).toHaveTextContent('That link has expired');
  });
});

describe('/reset-password', () => {
  const recovering = { user: { id: 'u1', email: 'a@test.invalid' } satisfies User, recovery: true };

  it('offers a new password once the recovery link has been accepted', () => {
    setAuth(recovering);
    renderAt('/reset-password', <ResetPassword />);
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
  });

  it('does not accuse a good link of being broken while the session is still resolving', () => {
    setAuth({ loading: true });
    renderAt('/reset-password', <ResetPassword />);
    expect(screen.getByRole('heading', { name: 'Choose a new password' })).toBeInTheDocument();
    expect(screen.queryByText("That link didn't work")).not.toBeInTheDocument();
  });

  it('sets the new password and confirms it', async () => {
    setAuth(recovering);
    renderAt('/reset-password', <ResetPassword />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'hunter2000' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'hunter2000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));

    await waitFor(() => expect(h.updatePassword).toHaveBeenCalledWith('hunter2000'));
    expect(await screen.findByRole('heading', { name: 'Password updated' })).toBeInTheDocument();
  });

  it('refuses a password that is too short, without troubling the server', async () => {
    setAuth(recovering);
    renderAt('/reset-password', <ResetPassword />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8 characters');
    expect(h.updatePassword).not.toHaveBeenCalled();
  });

  it('refuses a mismatched confirmation', async () => {
    setAuth(recovering);
    renderAt('/reset-password', <ResetPassword />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'hunter2000' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'hunter2001' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('do not match');
    expect(h.updatePassword).not.toHaveBeenCalled();
  });

  it('surfaces a rejected password change instead of claiming success', async () => {
    setAuth(recovering);
    h.updatePassword.mockResolvedValue({ error: 'New password should be different from the old one.' });
    renderAt('/reset-password', <ResetPassword />);
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'hunter2000' } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'hunter2000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save new password' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('should be different');
    expect(screen.queryByRole('heading', { name: 'Password updated' })).not.toBeInTheDocument();
  });

  /**
   * The expired-link case, which is the common one: recovery links are
   * single-use and time-limited, so by the time someone gets around to clicking
   * a second time it is dead. The remedy is another link, so the page offers
   * one rather than sending them elsewhere to start again.
   */
  it('explains a dead link and offers a fresh one without leaving the page', async () => {
    setAuth({ callbackError: 'That link has expired. Links are single-use and time-limited.' });
    renderAt('/reset-password', <ResetPassword />);

    expect(screen.getByRole('heading', { name: "That link didn't work" })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('has expired');

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@test.invalid' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send a new reset link' }));

    await waitFor(() => expect(h.resetPassword).toHaveBeenCalledWith('a@test.invalid'));
    expect(await screen.findByRole('status')).toHaveTextContent('Check your inbox');
  });

  it('says so plainly when there is no backend to change a password against', () => {
    setAuth({ configured: false });
    renderAt('/reset-password', <ResetPassword />);
    expect(screen.getByRole('alert')).toHaveTextContent("backend isn't configured");
  });
});
