import { useId, useState } from 'react';
import { ToolSheet } from '../ToolSheet';
import { PERSON_NAME_MAX, type SplitPersonRecord } from '../../lib/splits';

/** Rename someone, or take them off your list once you're settled up. Their old entries keep their name. */
export function PersonSheet({ person, settled, onRename, onRemove, onClose }: {
  person: SplitPersonRecord;
  settled: boolean;
  onRename: (name: string) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(person.name);
  const [error, setError] = useState<string | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) { setError('Type a name.'); return; }
    onRename(clean);
  };
  return (
    <ToolSheet title={person.name} description="Only you see this list. FinatriX never contacts the people on it." onClose={onClose}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
          <button type="submit" form={`${id}-person`} className="btn btn-sm">Save</button>
        </div>
      )}>
      <form id={`${id}-person`} onSubmit={submit} noValidate>
        <div className="fg" style={{ marginBottom: 10 }}>
          <label className="fl" htmlFor={`${id}-name`}>Name</label>
          <input id={`${id}-name`} className="fi" type="text" autoComplete="off" maxLength={PERSON_NAME_MAX} value={name}
            onChange={(e) => { setName(e.target.value); setError(null); }} />
        </div>
        {error && <p className="fx-grp-err" role="alert">{error}</p>}
      </form>
      <div style={{ borderTop: '1px solid var(--hair2)', paddingTop: 12, marginTop: 6 }}>
        {settled ? (
          <button type="button" className="btn btn-ghost btn-sm fx-split-danger-text" onClick={onRemove}>Remove from my list</button>
        ) : (
          <p className="note" style={{ margin: 0 }}>Settle up first to remove {person.name} from your list.</p>
        )}
      </div>
    </ToolSheet>
  );
}
