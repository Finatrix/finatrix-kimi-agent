import { useState } from 'react';
import { useToast } from '../../tools/ui/Toast';
import { CAREERS_MARKETS, type CareersMarket, type DeclaredRights } from '../markets';
import { updateProfileMeta } from '../services/careerProfile';
import type { CareerProfileRow } from '../types';
import { toCareersError } from '../utils/errors';
import '../areas/resume/resume.css';

const STATUS_VALUES: ReadonlySet<string> = new Set<DeclaredRights>(['citizen', 'permanent', 'unrestricted_visa', 'needs_sponsorship']);

function optionsFor(permanentLabel: string): Array<{ value: '' | DeclaredRights; label: string }> {
  return [
    { value: '', label: 'Not set' },
    { value: 'citizen', label: 'Citizen' },
    { value: 'permanent', label: permanentLabel },
    { value: 'unrestricted_visa', label: 'Visa with full work rights' },
    { value: 'needs_sponsorship', label: 'Need visa sponsorship' },
  ];
}

/**
 * The user's own statement of their work rights in each Careers market. Job cards compare a posting's stated
 * requirements with this; nothing is inferred, and the copy says plainly that it is not immigration advice.
 * Stored in `career_profiles.settings`, so it needs no schema change and syncs with the rest of the profile.
 */
export function DeclaredRightsCard({ userId, profile, onSaved }: { userId: string; profile: CareerProfileRow; onSaved: (row: CareerProfileRow) => void }) {
  const { notify } = useToast();
  const [saving, setSaving] = useState<CareersMarket | null>(null);
  const declared = profile.settings?.declaredRights ?? {};

  const change = async (market: CareersMarket, value: string) => {
    const next = { ...declared };
    if (STATUS_VALUES.has(value)) next[market] = value as DeclaredRights;
    else delete next[market];
    setSaving(market);
    try {
      onSaved(await updateProfileMeta(userId, { settings: { ...profile.settings, declaredRights: next } }));
      notify('Work rights saved.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setSaving(null);
    }
  };

  return (
    <fieldset className="rs-rights">
      <legend>Work rights by country</legend>
      <p className="cx-sub" style={{ marginBottom: 16 }}>
        Job cards compare what a posting says about citizenship, residency and sponsorship with what you set here.
        Nothing is guessed, and this is not immigration advice.
      </p>
      <div className="rs-form">
        {CAREERS_MARKETS.map((m) => (
          <div className="fg" key={m.id}>
            <label className="fl" htmlFor={`rights-${m.id}`}>{m.name}</label>
            <select
              id={`rights-${m.id}`}
              className="fs"
              value={declared[m.id] ?? ''}
              disabled={saving !== null}
              onChange={(e) => void change(m.id, e.target.value)}
            >
              {optionsFor(m.permanentLabel).map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </fieldset>
  );
}
