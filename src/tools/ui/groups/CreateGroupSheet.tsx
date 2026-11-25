import { useState } from 'react';
import { ToolSheet } from '../ToolSheet';
import {
  GROUP_EMOJIS, GROUP_NAME_MAX, GROUP_TYPES, MEMBER_NAME_MAX, groupErrorMessage, type GroupType,
} from '../../lib/groups';
import { createGroup, GroupsError } from '../../lib/groupsApi';

export interface CreatedGroup {
  groupId: string;
  code: string;
  expiresAt: string;
  name: string;
  emoji: string;
}

/**
 * Create a group: a type, a name and an emoji. The type sets the starting
 * mode (Family and Couple budget together; Home, Trip and Friends split
 * costs), so nothing else needs filling in.
 */
export function CreateGroupSheet({ defaultName, needsAdult, currency, onCreated, onClose }: {
  defaultName: string;
  needsAdult: boolean;
  currency: string;
  onCreated: (group: CreatedGroup) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState<GroupType>('family');
  const [emoji, setEmoji] = useState<string>(GROUP_TYPES[0].emoji);
  const [emojiTouched, setEmojiTouched] = useState(false);
  const [name, setName] = useState('');
  const [me, setMe] = useState(defaultName);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickType = (next: GroupType) => {
    setType(next);
    if (!emojiTouched) setEmoji(GROUP_TYPES.find((t) => t.id === next)!.emoji);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const groupName = name.trim();
    const myName = me.trim();
    if (!groupName) { setError('Give the group a name.'); return; }
    if (!myName) { setError('Add the name the group will see for you.'); return; }
    if (needsAdult && !adult) { setError(groupErrorMessage('adult_confirmation_required')); return; }
    setBusy(true);
    setError(null);
    try {
      const made = await createGroup({ name: groupName, emoji, type, displayName: myName, currency, confirmAdult: adult });
      onCreated({ ...made, name: groupName, emoji });
    } catch (err) {
      setError(groupErrorMessage(err instanceof GroupsError ? err.code : undefined));
      setBusy(false);
    }
  };

  return (
    <ToolSheet
      title="Create a group"
      description="Everyone uses their own phone and sees the group’s spending as it happens."
      onClose={onClose}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" form="grp-create" className="btn btn-sm" disabled={busy}>{busy ? 'Creating…' : 'Create group'}</button>
        </div>
      )}
    >
      <form id="grp-create" onSubmit={submit} noValidate>
        <fieldset className="fx-grp-choices">
          <legend className="fl" style={{ marginBottom: 6 }}>Type</legend>
          {GROUP_TYPES.map((t) => (
            <label key={t.id} className="fx-grp-choice">
              <input type="radio" name="grp-type" value={t.id} checked={type === t.id} onChange={() => pickType(t.id)} />
              <b>{t.emoji} {t.label}</b>
              <span>{t.detail}</span>
            </label>
          ))}
        </fieldset>

        <div className="fg" style={{ marginBottom: 12 }}>
          <label className="fl" htmlFor="grp-name">Name</label>
          <input id="grp-name" className="fi" type="text" maxLength={GROUP_NAME_MAX} autoComplete="off"
            placeholder={type === 'family' ? 'e.g. Sharma Family' : type === 'trip' ? 'e.g. Goa 2027' : 'e.g. Flat 4B'}
            value={name} onChange={(e) => setName(e.target.value)} />
        </div>

        <fieldset className="fx-grp-emojis">
          <legend className="fl" style={{ marginBottom: 6, width: '100%' }}>Emoji</legend>
          {GROUP_EMOJIS.map((em) => (
            <label key={em} className="fx-grp-emoji">
              <input type="radio" name="grp-emoji" value={em} aria-label={em} checked={emoji === em}
                onChange={() => { setEmoji(em); setEmojiTouched(true); }} />
              <span aria-hidden="true">{em}</span>
            </label>
          ))}
        </fieldset>

        <div className="fg" style={{ marginBottom: 12 }}>
          <label className="fl" htmlFor="grp-me">Your name in the group</label>
          <input id="grp-me" className="fi" type="text" maxLength={MEMBER_NAME_MAX} autoComplete="nickname"
            aria-describedby="grp-me-help" value={me} onChange={(e) => setMe(e.target.value)} placeholder="e.g. Amma" />
          <p id="grp-me-help" className="note" style={{ marginTop: 5 }}>Members see this name, never your email or account.</p>
        </div>

        {needsAdult && (
          <label className="fx-checkrow" style={{ marginBottom: 12 }}>
            <input type="checkbox" className="fx-check" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
            <span>I am 18 or over. Groups are for adults only.</span>
          </label>
        )}

        {error && <p className="fx-grp-err" role="alert">{error}</p>}
      </form>
    </ToolSheet>
  );
}
