/**
 * Career Profile — the user's permanent professional identity, separate
 * from any single resume. Fully editable; resume uploads only produce
 * suggestions (shown as accept/dismiss chips) and never overwrite manual
 * values. Also renders the full Career DNA profile.
 */

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { EmptyState, ErrorCard, PageLoading } from '../components/states';
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
    <div className="fx-page">
      <PageHead
        chip="Career Profile"
        chipColor="#D4AF37"
        chipBg="rgba(212,175,55,.12)"
        icon="users"
        title="Your professional identity"
      >
        This profile powers everything Careers builds for you next — job matching in
        Phase 2 starts here. Resume uploads suggest updates; only you apply them.
      </PageHead>

      {error && <ErrorCard error={error} onRetry={() => void refresh()} />}

      {!error && profile && form && (
        <div className="grid2" style={{ alignItems: 'flex-start' }}>
          <div className="card">
            <div className="panel-eyebrow">Profile</div>
            <div style={{ marginTop: 14 }}>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7, flexWrap: 'wrap' }}>
                        <span className="badge badge-gold">From your resume</span>
                        <span style={{ fontSize: 12.5, color: 'var(--ink2)', flex: '1 1 auto' }}>{suggestion}</span>
                        <button className="btn btn-ghost btn-sm" style={{ padding: '5px 12px', fontSize: 12 }} onClick={() => void acceptSuggestion(def.key, suggestion)}>
                          Apply
                        </button>
                        <button className="icon-btn" aria-label={`Dismiss suggestion for ${def.label}`} onClick={() => void dismissSuggestion(def.key)}>
                          ✕
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              <button className={`btn ${saving ? 'btn-loading' : ''}`} disabled={saving || !dirty} onClick={() => void save()} style={{ opacity: dirty ? 1 : 0.6 }}>
                {saving ? 'Saving…' : dirty ? 'Save profile' : 'Saved'}
              </button>
            </div>
          </div>

          <div>
            <div className="card">
              <div className="panel-eyebrow">Career DNA</div>
              {dna ? (
                <>
                  <p style={{ fontSize: 13.5, color: 'var(--ink2)', lineHeight: 1.65, margin: '12px 0 18px' }}>
                    {dna.personalitySummary}
                  </p>
                  {dna.traits.map((t) => (
                    <div className="dna-trait" key={t.name}>
                      <div className="dt-row">
                        <span className="dt-name">{t.name}</span>
                        <span className="dt-val">{t.confidence}%</span>
                      </div>
                      <div className="bar">
                        <div className="bar-fill" style={{ width: `${t.confidence}%`, background: 'var(--gold)' }} />
                      </div>
                    </div>
                  ))}
                  <div className="hr" />
                  <div className="panel-eyebrow" style={{ marginBottom: 8 }}>Strengths</div>
                  <div>{dna.strengths.map((s) => <span className="tag green" key={s}>{s}</span>)}</div>
                  <div className="panel-eyebrow" style={{ margin: '14px 0 8px' }}>Growth areas</div>
                  <div>{dna.weaknesses.map((s) => <span className="tag red" key={s}>{s}</span>)}</div>
                  <div className="panel-eyebrow" style={{ margin: '14px 0 8px' }}>Recommended industries</div>
                  <div>{dna.recommendedIndustries.map((s) => <span className="tag gold" key={s}>{s}</span>)}</div>
                  <div className="panel-eyebrow" style={{ margin: '14px 0 8px' }}>Suitable roles</div>
                  <div>{dna.suitableRoles.map((s) => <span className="tag" key={s}>{s}</span>)}</div>
                </>
              ) : (
                <EmptyState icon="layers" title="No Career DNA yet">
                  Upload and analyse a resume to generate your AI career profile.
                </EmptyState>
              )}
            </div>
            {suggestions.length > 0 && (
              <div className="tip tip-info">
                <b>{suggestions.length} suggestion{suggestions.length === 1 ? '' : 's'} from your latest resume</b>
                Review them next to each field — nothing changes until you apply it.
              </div>
            )}
          </div>
        </div>
      )}

      <ToolFoot>
        <b>Career Profile</b> · manual edits always win over AI suggestions
      </ToolFoot>
    </div>
  );
}
