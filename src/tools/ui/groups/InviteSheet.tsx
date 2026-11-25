import { useState } from 'react';
import { ToolSheet } from '../ToolSheet';
import { QrCode } from './QrCode';
import { copyToClipboard, shareLink } from '../../../lib/shareApp';
import { formatGroupCode, groupInviteUrl } from '../../../lib/groupCode';
import { useOptionalToast } from '../Toast';

function expiryLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Invite people: the room code to read out, a link to send (it opens the app
 * when installed, the website otherwise) and a QR code to scan in person.
 */
export function InviteSheet({ group, invite, isAdmin, onReset, onClose }: {
  group: { name: string; emoji: string };
  invite: { code: string; expires_at: string } | null;
  isAdmin: boolean;
  onReset: () => Promise<void>;
  onClose: () => void;
}) {
  const { notify } = useOptionalToast();
  const [busy, setBusy] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [openedAt] = useState(() => Date.now());
  const expired = invite ? new Date(invite.expires_at).getTime() < openedAt : true;
  const url = invite ? groupInviteUrl(invite.code) : '';
  const shown = invite ? formatGroupCode(invite.code) : '';

  const share = async () => {
    const outcome = await shareLink({
      title: `Join ${group.name} on FinatriX`,
      text: `Join ${group.emoji} ${group.name} on FinatriX. Room code ${shown}.`,
      url,
      dialogTitle: 'Invite to the group',
    });
    if (outcome === 'copied') notify('Invite copied. Paste it into a chat.', 'ok');
    if (outcome === 'failed') notify('Could not share or copy the invite.', 'error');
  };

  const copy = async (text: string, what: string) => {
    const ok = await copyToClipboard(text);
    notify(ok ? `${what} copied.` : `Could not copy the ${what.toLowerCase()}.`, ok ? 'ok' : 'error');
  };

  const reset = async () => {
    setBusy(true);
    try {
      await onReset();
      notify('New code made. The old one no longer works.', 'ok');
    } catch {
      notify('Could not make a new code. Please try again.', 'error');
    }
    setBusy(false);
    setConfirmReset(false);
  };

  return (
    <ToolSheet title={`Invite to ${group.name}`} description="Share the link on WhatsApp, read the code out on a call, or let someone scan the QR." onClose={onClose}>
      {invite && !expired ? (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 16, marginBottom: 14 }}>
            <QrCode text={url} label={`QR code that opens the invite to ${group.name}`} />
            <div style={{ minWidth: 0 }}>
              <div className="note" style={{ marginBottom: 2 }}>Room code</div>
              <div className="fx-grp-code" data-testid="grp-code">{shown}</div>
              <div className="note">Works until {expiryLabel(invite.expires_at)}</div>
            </div>
          </div>
          <div className="fx-grp-actions" style={{ marginBottom: 14 }}>
            <button type="button" className="btn btn-sm" onClick={() => void share()}>Share invite</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy(url, 'Link')}>Copy link</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void copy(shown, 'Code')}>Copy code</button>
          </div>
        </>
      ) : (
        <p className="note">{isAdmin ? 'This code has expired. Make a new one to invite people.' : 'This code has expired. Ask the group’s admin for a new one.'}</p>
      )}
      <p className="note">Anyone with the code can join for 7 days. Only people 18 or over can join.</p>
      {isAdmin && (confirmReset ? (
        <div className="card" style={{ marginTop: 10 }}>
          <p style={{ margin: '0 0 10px', fontSize: 14 }}>Make a new code? The current code and link stop working at once.</p>
          <div className="fx-grp-actions">
            <button type="button" className="btn btn-sm" onClick={() => void reset()} disabled={busy}>{busy ? 'Making…' : 'Make new code'}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmReset(false)}>Keep this one</button>
          </div>
        </div>
      ) : (
        <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => (invite && !expired ? setConfirmReset(true) : void reset())} disabled={busy}>
          {invite && !expired ? 'Reset code' : 'Make a new code'}
        </button>
      ))}
    </ToolSheet>
  );
}
