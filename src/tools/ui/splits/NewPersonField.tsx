import { useId, useState } from 'react';
import { Icon } from '../Icon';
import { PERSON_NAME_MAX, type SplitPersonRecord } from '../../lib/splits';

/**
 * Add someone to your list without leaving the form. Enter adds them (it never
 * submits the form around it). A name already on the list picks that person.
 */
export function NewPersonField({ existing, onAdd, label = 'Add someone new' }: {
  existing: readonly SplitPersonRecord[];
  onAdd: (name: string) => boolean;
  label?: string;
}) {
  const id = useId();
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const add = () => {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) { setError('Type a name first.'); return; }
    if (onAdd(clean)) { setName(''); setError(null); } else setError('Couldn’t save on this device.');
  };
  const known = existing.some((p) => p.name.toLowerCase() === name.trim().toLowerCase());
  return (
    <div style={{ marginTop: 8 }}>
      <label className="fl" htmlFor={id}>{label}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input id={id} className="fi" type="text" autoComplete="off" maxLength={PERSON_NAME_MAX} placeholder="Name"
          value={name} aria-describedby={error ? `${id}-err` : undefined}
          onChange={(e) => { setName(e.target.value); setError(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} />
        <button type="button" className="btn btn-ghost btn-sm" onClick={add} style={{ flexShrink: 0 }}>
          <Icon name="plus" size={15} /> {known ? 'Choose' : 'Add'}
        </button>
      </div>
      {error && <p id={`${id}-err`} className="fx-grp-err" role="alert" style={{ marginTop: 4 }}>{error}</p>}
    </div>
  );
}
