import { useEffect, useState } from 'react';
import { ToolSheet } from '../ToolSheet';
import { formatGroupCode, readJoinInput } from '../../../lib/groupCode';
import { MEMBER_NAME_MAX, groupErrorMessage, groupTypeLabel } from '../../lib/groups';
import { joinByCode, type JoinPreview, type JoinStatus } from '../../lib/groupsApi';

/**
 * Join a group from a code or an invite link: a preview first ("Join Sharma
 * Family? 3 members"), then one tap. The 18+ confirmation is asked only the
 * first time a person creates or joins a group.
 */
export function JoinSheet({ initialCode, defaultName, needsAdult, onJoined, onClose }: {
  initialCode: string | null;
  defaultName: string;
  needsAdult: boolean;
  onJoined: (groupId: string, status: JoinStatus) => void;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState(initialCode ? formatGroupCode(initialCode) : '');
  const [code, setCode] = useState<string | null>(initialCode);
  const [preview, setPreview] = useState<JoinPreview | null>(null);
  const [me, setMe] = useState(defaultName);
  const [adult, setAdult] = useState(false);
  const [askAdult, setAskAdult] = useState(needsAdult);
  const [busy, setBusy] = useState(!!initialCode);
  const [error, setError] = useState<string | null>(null);

  const look = async (next: string) => {
    setBusy(true);
    setError(null);
    const res = await joinByCode(next, 'preview').catch(() => ({ status: 'failed' as JoinStatus, group: null }));
    setBusy(false);
    if (res.status === 'ok' && res.group) {
      setCode(next);
      setPreview(res.group);
    } else {
      setCode(null);
      setPreview(null);
      setError(groupErrorMessage(res.status));
    }
  };

  useEffect(() => {
    // A link opened the sheet: show the group straight away.
    if (initialCode) void look(initialCode);
    // Once, for the code the sheet opened with.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const findGroup = (e: React.FormEvent) => {
    e.preventDefault();
    const next = readJoinInput(typed);
    if (!next) { setError(groupErrorMessage('invalid_code')); return; }
    void look(next);
  };

  const join = async () => {
    if (!code) return;
    const myName = me.trim();
    if (!myName) { setError('Add the name the group will see for you.'); return; }
    if (askAdult && !adult) { setError(groupErrorMessage('adult_confirmation_required')); return; }
    setBusy(true);
    setError(null);
    const res = await joinByCode(code, 'join', { displayName: myName, confirmAdult: adult || !askAdult })
      .catch(() => ({ status: 'failed' as JoinStatus, group: null }));
    setBusy(false);
    if ((res.status === 'joined' || res.status === 'already_member') && res.group?.id) {
      onJoined(res.group.id, res.status);
      return;
    }
    if (res.status === 'adult_confirmation_required') setAskAdult(true);
    if (res.group) setPreview(res.group);
    setError(groupErrorMessage(res.status));
  };

  const members = preview?.members ?? 0;

  return (
    <ToolSheet
      title={preview ? `Join ${preview.name}?` : 'Join a group'}
      description={preview ? undefined : 'Type the room code someone shared with you, or paste their link.'}
      onClose={onClose}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>{preview ? 'Not now' : 'Cancel'}</button>
          {preview ? (
            <button type="button" className="btn btn-sm" onClick={() => void join()} disabled={busy}>{busy ? 'Joining…' : 'Join group'}</button>
          ) : (
            <button type="submit" form="grp-join" className="btn btn-sm" disabled={busy}>{busy ? 'Looking…' : 'Find group'}</button>
          )}
        </div>
      )}
    >
      {preview ? (
        <div>
          <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }} data-testid="grp-join-card">
            <span className="fx-grp-badge" aria-hidden="true">{preview.emoji}</span>
            <span style={{ minWidth: 0 }}>
              <span className="fx-grp-name" style={{ fontSize: 16 }}>Join {preview.name}?</span>
              <span className="fx-grp-sub">{members} {members === 1 ? 'member' : 'members'} · {groupTypeLabel(preview.type)}</span>
            </span>
          </div>
          <p className="note" style={{ marginTop: 0 }}>
            Members see the expenses you add to this group and your name in it. Your personal expenses,
            budgets and goals stay private.
          </p>
          <div className="fg" style={{ marginBottom: 12 }}>
            <label className="fl" htmlFor="grp-join-me">Your name in the group</label>
            <input id="grp-join-me" className="fi" type="text" maxLength={MEMBER_NAME_MAX} autoComplete="nickname"
              value={me} onChange={(e) => setMe(e.target.value)} placeholder="e.g. Riya" />
          </div>
          {askAdult && (
            <label className="fx-checkrow" style={{ marginBottom: 12 }}>
              <input type="checkbox" className="fx-check" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
              <span>I am 18 or over. Groups are for adults only.</span>
            </label>
          )}
        </div>
      ) : (
        <form id="grp-join" onSubmit={findGroup} noValidate>
          <div className="fg" style={{ marginBottom: 12 }}>
            <label className="fl" htmlFor="grp-code">Room code</label>
            <input id="grp-code" className="fi" type="text" inputMode="text" autoCapitalize="characters" autoComplete="off"
              spellCheck={false} maxLength={200} placeholder="FX-7K2P9Q" value={typed} onChange={(e) => setTyped(e.target.value)} />
          </div>
        </form>
      )}
      {error && <p className="fx-grp-err" role="alert">{error}</p>}
    </ToolSheet>
  );
}
