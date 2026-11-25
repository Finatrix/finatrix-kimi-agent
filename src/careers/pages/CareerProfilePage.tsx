/**
 * Career Profile — the user's permanent professional identity, separate
 * from any single resume. Fully editable; resume uploads only produce
 * suggestions (shown as accept/dismiss chips) and never overwrite manual
 * values. Also renders the full Career DNA profile.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { ErrorCard, PageLoading } from '../components/states';
import { Empty } from '../ui/primitives';
import { RsIcon } from '../areas/resume/icons';
import '../areas/resume/resume.css';
import { DeclaredRightsCard } from '../components/DeclaredRightsCard';
import { EMPLOYMENT_TYPES, INDUSTRY_OPTIONS } from '../constants';
import { useCareers } from '../context/CareersContext';
import { updateProfileFields, updateProfileMeta } from '../services/careerProfile';
import type { CareerProfileFields } from '../types';
import { toCareersError } from '../utils/errors';

type FieldKey = keyof CareerProfileFields;

interface FieldDef {
  key: FieldKey;
  label: string;
  kind: 'text' | 'number' | 'select' | 'list';
  options?: readonly string[];
  placeholder?: string;
}

const FIELDS: FieldDef[] = [
  { key: 'job_title', label: 'Current role', kind: 'text', placeholder: 'e.g. Senior Risk Analyst' },
  { key: 'preferred_role', label: 'Preferred role', kind: 'text', placeholder: 'e.g. Risk Manager' },
  { key: 'preferred_industry', label: 'Preferred industry', kind: 'select', options: INDUSTRY_OPTIONS },
  { key: 'years_experience', label: 'Years of experience', kind: 'number', placeholder: 'e.g. 6' },
  { key: 'highest_qualification', label: 'Highest qualification', kind: 'text', placeholder: 'e.g. MBA — Finance' },
  { key: 'primary_skills', label: 'Primary skills', kind: 'list', placeholder: 'Comma separated' },
  { key: 'secondary_skills', label: 'Secondary skills', kind: 'list', placeholder: 'Comma separated' },
  { key: 'location_preference', label: 'Location preference', kind: 'text', placeholder: 'e.g. Bengaluru / Remote' },
  { key: 'employment_type', label: 'Employment type', kind: 'select', options: EMPLOYMENT_TYPES },
  { key: 'salary_expectation', label: 'Salary expectation', kind: 'text', placeholder: 'e.g. ₹24–28 LPA' },
  { key: 'notice_period', label: 'Notice period', kind: 'text', placeholder: 'e.g. 60 days' },
  { key: 'visa_status', label: 'Visa status', kind: 'text', placeholder: 'e.g. Citizen' },
  { key: 'work_rights', label: 'Work rights', kind: 'text', placeholder: 'e.g. Full working rights in India' },
  { key: 'languages', label: 'Languages', kind: 'list', placeholder: 'Comma separated' },
];

type FormState = Record<FieldKey, string>;

function toForm(fields: Partial<CareerProfileFields>): FormState {
  const out = {} as FormState;
  for (const def of FIELDS) {
    const v = fields[def.key];
    out[def.key] = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
  }
  return out;
}

function fromForm(form: FormState): Partial<CareerProfileFields> {
  const patch: Record<string, unknown> = {};
  for (const def of FIELDS) {
    const raw = form[def.key].trim();
    if (def.kind === 'list') {
      patch[def.key] = raw ? raw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 40) : [];
    } else if (def.kind === 'number') {
      const n = Number(raw);
      patch[def.key] = raw && Number.isFinite(n) ? Math.max(0, Math.min(60, n)) : null;
    } else {
      patch[def.key] = raw.slice(0, 200);
    }
  }
  return patch as Partial<CareerProfileFields>;
}

export default function CareerProfilePage() {
  const { user } = useAuth();
  const { loading, error, profile, setProfile, refresh } = useCareers();
  const { notify } = useToast();

  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (profile && !dirty) setForm(toForm(profile));
  }, [profile, dirty]);

  const dna = profile?.career_dna ?? null;
  const suggestions = useMemo(
    () => Object.entries(profile?.suggestions ?? {}).filter(([, v]) => v) as [FieldKey, string][],
    [profile]
  );

  const set = (key: FieldKey, value: string) => {
    setDirty(true);
    setForm((f) => (f ? { ...f, [key]: value } : f));
  };

  const save = async () => {
    if (!user || !form) return;
    setSaving(true);
    try {
      const updated = await updateProfileFields(user.id, fromForm(form));
      setProfile(updated);
      setDirty(false);
      notify('Career profile saved.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const acceptSuggestion = async (key: FieldKey, value: string) => {
    if (!user || !profile) return;
    set(key, value);
    const nextSuggestions = { ...profile.suggestions };
    delete nextSuggestions[key];
    try {
      const updated = await updateProfileMeta(user.id, { suggestions: nextSuggestions });
      setProfile({ ...updated });
    } catch {
      /* chip removal is cosmetic; the field value is already applied */
    }
  };

  const dismissSuggestion = async (key: FieldKey) => {
    if (!user || !profile) return;
    const nextSuggestions = { ...profile.suggestions };
    delete nextSuggestions[key];
    try {
      const updated = await updateProfileMeta(user.id, { suggestions: nextSuggestions });
      setProfile(updated);
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  if (loading) return <PageLoading />;

  return (
    <div>
      {error && <ErrorCard error={error} onRetry={() => void refresh()} />}

      {!error && profile && form && (
        <>
          <section className="cx-panel" aria-labelledby="cp-prefs">
            <div className="cx-panel-head"><h2 id="cp-prefs">Preferences</h2></div>
            <p className="cx-sub" style={{ marginBottom: 18 }}>
              Resume uploads suggest updates and only you apply them. Manual edits always win over AI suggestions.
            </p>
            {suggestions.length > 0 && (
              <div className="cx-notice" role="status" style={{ marginBottom: 18 }}>
                <p style={{ margin: 0 }}>
                  <strong>{suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'} from your latest resume.</strong>{' '}
                  Review them next to each field. Nothing changes until you apply it.
                </p>
              </div>
            )}
            <div className="rs-form">
              {FIELDS.map((def) => {
                const suggestion = profile.suggestions[def.key];
                return (
                  <div className="fg" key={def.key}>
                    <label className="fl" htmlFor={`cp-${def.key}`}>{def.label}</label>
                    {def.kind === 'select' ? (
                      <select
                        id={`cp-${def.key}`}
                        className="fs"
                        value={form[def.key]}
                        onChange={(e) => set(def.key, e.target.value)}
                      >
                        <option value="">Not set</option>
                        {def.options!.map((o) => <option key={o} value={o}>{o}</option>)}
                        {form[def.key] && !def.options!.includes(form[def.key]) && (
                          <option value={form[def.key]}>{form[def.key]}</option>
                        )}
                      </select>
                    ) : (
                      <input
                        id={`cp-${def.key}`}
                        className="fi"
                        type={def.kind === 'number' ? 'number' : 'text'}
                        inputMode={def.kind === 'number' ? 'decimal' : undefined}
                        value={form[def.key]}
                        placeholder={def.placeholder}
                        onChange={(e) => set(def.key, e.target.value)}
                      />
                    )}
                    {suggestion && suggestion !== form[def.key] && (
                      <div className="rs-suggest">
                        <span className="cx-chip cx-chip-accent">From your resume</span>
                        <span className="rs-suggest-text">{suggestion}</span>
                        <button type="button" className="cx-btn cx-btn-sm" onClick={() => void acceptSuggestion(def.key, suggestion)}>
                          Apply
                        </button>
                        <button type="button" className="cx-icon-btn" aria-label={`Dismiss suggestion for ${def.label}`} onClick={() => void dismissSuggestion(def.key)}>
                          <RsIcon name="close" size={16} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="rs-save">
              <button type="button" className="cx-btn cx-btn-primary" disabled={saving || !dirty} onClick={() => void save()}>
                {saving ? 'Saving…' : 'Save preferences'}
              </button>
              {!dirty && !saving && <span className="cx-sub cx-muted" role="status">All changes saved</span>}
            </div>
          </section>

          {user && (
            <section className="cx-panel">
              <DeclaredRightsCard userId={user.id} profile={profile} onSaved={setProfile} />
            </section>
          )}

          <section className="cx-panel" aria-labelledby="cp-dna">
            <div className="cx-panel-head"><h2 id="cp-dna">Career DNA</h2></div>
            {dna ? (
              <>
                <p className="cx-sub">{dna.personalitySummary}</p>
                <div className="rs-dna-bars">
                  {dna.traits.map((t) => (
                    <div key={t.name}>
                      <div className="rs-dna-row">
                        <span>{t.name}</span>
                        <span>{t.confidence}%</span>
                      </div>
                      <div className="rs-dna-track" aria-hidden="true"><i style={{ width: `${t.confidence}%` }} /></div>
                    </div>
                  ))}
                </div>
                {([
                  ['Strengths', dna.strengths, 'cx-chip-good'],
                  ['Growth areas', dna.weaknesses, 'cx-chip-warn'],
                  ['Recommended industries', dna.recommendedIndustries, 'cx-chip-accent'],
                  ['Suitable roles', dna.suitableRoles, ''],
                ] as const).map(([title, items, tone]) => (
                  <div className="rs-dna-group" key={title}>
                    <h3>{title}</h3>
                    <div className="rs-chips">{items.map((x) => <span key={x} className={`cx-chip ${tone}`}>{x}</span>)}</div>
                  </div>
                ))}
              </>
            ) : (
              <Empty title="No Career DNA yet">
                Upload and analyse a resume to generate it.
              </Empty>
            )}
          </section>
        </>
      )}
    </div>
  );
}
