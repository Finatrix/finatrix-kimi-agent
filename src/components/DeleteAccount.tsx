import { useId, useState } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { confirmationPhrase } from '../lib/accountDeletion';
import { invokeAuthed } from '../lib/functions';
import { clearSyncedLocal, setLastUid } from '../tools/cloudSync';
import { Field, Notice } from './AuthShell';

/**
 * Permanent account deletion, from inside the product.
 *
 * Required by Google Play for any app with sign-up, and by App Review 5.1.1(v)
 * for any app with accounts. Two deliberate steps — reveal, then type the
 * account's email (see `confirmationPhrase`) — because this is the one
 * irreversible action the app offers, and a single mis-tap must never reach it.
 * The server side is `supabase/functions/account-delete`, which re-checks
 * identity from the token and removes files, rows and the login together.
 */

/**
 * What to tell someone whose deletion did not complete.
 *
 * The server's own message wins whenever there is one: it knows which step
 * failed, and it is written to be shown (a stale session, a rate limit, files
 * that could not be removed so the account was kept). Without one the request
 * never got an answer, and the honest thing is to say so — not to promise that
 * nothing happened, which the device cannot know.
 */
async function failureMessage(result: { error: unknown; reason: string | null }): Promise<string> {
  if (result.reason === 'no-session') return 'Your session has expired. Sign in again, then delete your account.';
  const response = (result.error as { context?: unknown } | null)?.context;
  if (response instanceof Response) {
    try {
      const body = (await response.clone().json()) as { error?: unknown };
      if (typeof body.error === 'string' && body.error) return body.error;
    } catch {
      /* not JSON — fall through */
    }
    return 'Your account was not deleted. Please try again.';
  }
  return 'Could not reach FinatriX to delete your account. Check your connection and try again.';
}

export default function DeleteAccount({ email }: { email: string | null | undefined }) {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelId = useId();

  const phrase = confirmationPhrase(email);
  const byEmail = phrase !== 'DELETE';
  const confirmed = typed.trim().toLowerCase() === phrase.toLowerCase();

  async function remove() {
    if (!confirmed || busy) return;
    setBusy(true);
    setError(null);
    const result = await invokeAuthed<{ deleted?: boolean; error?: string }>('account-delete', { confirm: 'DELETE' });
    if (result.error || !result.data?.deleted) {
      setBusy(false);
      setError(await failureMessage(result));
      return;
    }
    // The account is gone server-side. Remove this device's synced copy too, so
    // nothing of it remains here, then end the (now invalid) local session.
    clearSyncedLocal();
    setLastUid(null);
    await signOut();
    navigate('/login?deleted=1', { replace: true });
  }

  return (
    <section aria-labelledby={`${panelId}-h`} className="mt-8 border-t border-hairline-2 pt-6">
      <h2 id={`${panelId}-h`} className="font-mono text-[10px] uppercase tracking-[0.08em] text-ink-3 mb-2">
        Delete account
      </h2>
      <p className="text-[13px] leading-relaxed text-ink-2 mb-3">
        Permanently deletes your account, your synced tool data, your Careers records and any files you uploaded.
        This cannot be undone. Export anything you want to keep from Settings first.
      </p>

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-expanded={false}
          aria-controls={panelId}
          className="w-full rounded-full border border-[color:var(--status-danger)] text-[color:var(--status-danger)] hover:bg-hairline-2 font-mono text-[12px] uppercase tracking-[0.08em] py-3.5 transition-colors"
        >
          Delete my account…
        </button>
      ) : (
        <div id={panelId}>
          {error && <Notice kind="error">{error}</Notice>}
          <Field
            label={`Type ${phrase} to confirm`}
            type={byEmail ? 'email' : 'text'}
            autoComplete="off"
            autoCapitalize={byEmail ? 'none' : 'characters'}
            autoCorrect="off"
            spellCheck={false}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder={phrase}
          />
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => { setOpen(false); setTyped(''); setError(null); }}
              disabled={busy}
              className="flex-1 rounded-full border border-hairline text-ink-2 hover:text-ink font-mono text-[12px] uppercase tracking-[0.08em] py-3.5 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void remove()}
              disabled={!confirmed || busy}
              aria-disabled={!confirmed || busy}
              className="flex-1 rounded-full bg-[#B42318] text-white font-mono text-[12px] uppercase tracking-[0.08em] py-3.5 transition-opacity disabled:opacity-40"
            >
              {busy ? 'Deleting…' : 'Delete forever'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
