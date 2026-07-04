/**
 * Assessment Center (Phase 3, Module 11) — online assessments, case studies,
 * psychometric/numerical/logical/coding tests and video interviews in one
 * tracked list with results and prep resources.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { EmptyState, ErrorCard } from '../components/states';
import { useCareers } from '../context/CareersContext';
import { listApplications } from '../services/applications';
import {
  completeAssessment,
  deleteAssessment,
  listAssessments,
  upsertAssessment,
} from '../services/assessments';
import { ASSESSMENT_KINDS, type AssessmentKind, type AssessmentResult, type AssessmentRow } from '../types/phase3';
import type { ApplicationRow } from '../types/jobs';
import { toCareersError, type CareersError } from '../utils/errors';
import { formatDate, scoreColor } from '../utils/format';

const EMPTY_FORM = { title: '', kind: 'online' as AssessmentKind, provider: '', link: '', dueAt: '', notes: '', applicationId: '' };

export default function AssessmentsPage() {
  const { user } = useAuth();
  const { loading, error: ctxError, refresh } = useCareers();
  const { notify } = useToast();

  const [items, setItems] = useState<AssessmentRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loadError, setLoadError] = useState<CareersError | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [a, apps] = await Promise.all([listAssessments(user.id), listApplications(user.id).catch(() => [])]);
      setItems(a);
      setApplications(apps.filter((x) => !x.archived));
      setLoadError(null);
    } catch (e) { setLoadError(toCareersError(e)); }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const appName = (id: string | null) => {
    const a = applications.find((x) => x.id === id);
    return a ? `${a.job_title} — ${a.company_name}` : '';
  };

  const add = async () => {
    if (!user || !form.title.trim()) { notify('Give the assessment a title.', 'error'); return; }
    setSaving(true);
    try {
      await upsertAssessment(user.id, {
        title: form.title, kind: form.kind, provider: form.provider, link: form.link,
        due_at: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        notes: form.notes, application_id: form.applicationId || null,
      });
      setForm(EMPTY_FORM);
      await load();
    } catch (e) { notify(toCareersError(e).message, 'error'); } finally { setSaving(false); }
  };

  const setResult = async (a: AssessmentRow, result: AssessmentResult) => {
    if (!user) return;
    const scoreStr = result === 'pass' || result === 'fail' ? window.prompt('Score (optional, 0-100)', a.score?.toString() ?? '') : null;
    const score = scoreStr && scoreStr.trim() ? Math.min(100, Math.max(0, Number(scoreStr))) : a.score;
    try {
      await completeAssessment(user.id, a.id, result, Number.isFinite(score) ? score : null);
      await load();
    } catch (e) { notify(toCareersError(e).message, 'error'); }
  };

  if (loading) return <div style={{ minHeight: '50vh' }} aria-busy="true" />;

  return (
    <div className="fx-page">
      <PageHead chip="Assessment Center" chipColor="#D4AF37" chipBg="rgba(212,175,55,.12)" icon="check" title="Every test, tracked">
        Online assessments, case studies, psychometric and coding tests — deadlines, links and results in one place.
      </PageHead>

      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      <div className="card">
        <div className="panel-eyebrow" style={{ marginBottom: 12 }}>New assessment</div>
        <div className="grid3" style={{ marginBottom: 10 }}>
          <input className="fi" placeholder="Title *" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <select className="fs" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as AssessmentKind }))}>
            {ASSESSMENT_KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
          </select>
          <select className="fs" value={form.applicationId} onChange={(e) => setForm((f) => ({ ...f, applicationId: e.target.value }))}>
            <option value="">No linked application</option>
            {applications.map((a) => <option key={a.id} value={a.id}>{a.job_title} — {a.company_name}</option>)}
          </select>
        </div>
        <div className="grid3" style={{ marginBottom: 10 }}>
          <input className="fi" placeholder="Provider (e.g. HackerRank)" value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} />
          <input className="fi" placeholder="Link" value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} />
          <input className="fi" type="datetime-local" value={form.dueAt} onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))} />
        </div>
        <textarea className="fi" style={{ minHeight: 60, marginBottom: 10 }} placeholder="Prep notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
        <button className={`btn ${saving ? 'btn-loading' : ''}`} disabled={saving} onClick={() => void add()}>Add assessment</button>
      </div>

      {!items.length ? (
        <div className="card"><EmptyState icon="check" title="No assessments yet" /></div>
      ) : (
        items.map((a) => (
          <div className="card" key={a.id} style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{a.title}</b>
                <div className="job-meta">
                  <span className="badge badge-mute">{a.kind.replace('_', ' ')}</span>
                  {a.provider && <span>{a.provider}</span>}
                  {a.application_id && <span>{appName(a.application_id)}</span>}
                  {a.due_at && <span>Due {formatDate(a.due_at)}</span>}
                  {a.result && <span className={`badge ${a.result === 'pass' ? 'badge-green' : a.result === 'fail' ? 'badge-red' : 'badge-blue'}`}>{a.result}</span>}
                  {a.score != null && <b style={{ color: scoreColor(a.score) }}>{a.score}</b>}
                </div>
                {a.link && <a className="note" href={a.link} target="_blank" rel="noopener noreferrer">Open assessment ↗</a>}
              </div>
              {!a.completed_at && (
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={() => void setResult(a, 'pass')}>Passed</button>
                  <button className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={() => void setResult(a, 'fail')}>Failed</button>
                </div>
              )}
              <button className="icon-btn danger" aria-label={`Delete ${a.title}`} onClick={() => { if (user) void deleteAssessment(user.id, a.id).then(load); }}>✕</button>
            </div>
          </div>
        ))
      )}

      <ToolFoot><b>Assessment Center</b> · results feed your application timeline automatically</ToolFoot>
    </div>
  );
}
