/**
 * Assessment Center (Phase 3, Module 11) — online assessments, case studies,
 * psychometric/numerical/logical/coding tests and video interviews in one
 * tracked list with results and prep resources.
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { ErrorCard, PageLoading } from '../components/states';
import { Empty } from '../ui/primitives';
import '../ui/forms.css';
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
import { safeHttpUrl } from '../../lib/sanitize';

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
    return a ? `${a.job_title} at ${a.company_name}` : '';
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

  if (loading) return <PageLoading />;

  return (
    <div className="cxf-stack">
      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      <section className="cx-panel" aria-labelledby="as-new">
        <div className="cx-panel-head"><h2 id="as-new">New assessment</h2></div>
        <div className="cxf-form cxf-form-3">
          <div className="fg cxf-wide">
            <label className="fl" htmlFor="as-title">Title (required)</label>
            <input id="as-title" className="fi" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="as-kind">Type</label>
            <select id="as-kind" className="fs" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as AssessmentKind }))}>
              {ASSESSMENT_KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="fg">
            <label className="fl" htmlFor="as-provider">Provider, for example HackerRank</label>
            <input id="as-provider" className="fi" value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="as-due">Due date and time</label>
            <input id="as-due" className="fi" type="datetime-local" value={form.dueAt} onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))} />
          </div>
          <div className="fg cxf-wide">
            <label className="fl" htmlFor="as-link">Link</label>
            <input id="as-link" className="fi" value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} />
          </div>
          <div className="fg cxf-wide">
            <label className="fl" htmlFor="as-app">Linked application</label>
            <select id="as-app" className="fs" value={form.applicationId} onChange={(e) => setForm((f) => ({ ...f, applicationId: e.target.value }))}>
              <option value="">No linked application</option>
              {applications.map((a) => <option key={a.id} value={a.id}>{a.job_title} at {a.company_name}</option>)}
            </select>
          </div>
          <div className="fg cxf-wide">
            <label className="fl" htmlFor="as-notes">Prep notes</label>
            <textarea id="as-notes" className="fi" style={{ minHeight: 60 }} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
          </div>
        </div>
        <div className="cxf-actions">
          <button type="button" className="cx-btn cx-btn-primary" disabled={saving} onClick={() => void add()}>Add assessment</button>
        </div>
      </section>

      {!items.length ? (
        <div className="cx-panel"><Empty title="No assessments yet">Add online tests, case studies and coding challenges above to track deadlines and results.</Empty></div>
      ) : (
        <section className="cx-panel" aria-label="Assessments">
          <ul className="cx-list">
            {items.map((a) => (
              <li key={a.id}>
                <div className="cx-row">
                  <div className="cx-row-main">
                    <p className="cx-row-title wrap">{a.title}</p>
                    <p className="cx-row-meta">
                      <span className="cx-chip">{a.kind.replace('_', ' ')}</span>
                      <span className={`cx-chip ${a.result === 'pass' ? 'cx-chip-good' : a.result === 'fail' ? 'cx-chip-bad' : ''}`}>
                        {a.result ? a.result : a.completed_at ? 'Completed' : 'Not taken'}
                      </span>
                      {a.provider && <span>{a.provider}</span>}
                      {a.application_id && <span>{appName(a.application_id)}</span>}
                      {a.due_at && <span>Due {formatDate(a.due_at)}</span>}
                      {a.score != null && <span className="cx-num" style={{ color: scoreColor(a.score) }}>Score {a.score}</span>}
                    </p>
                    {safeHttpUrl(a.link) && <a className="cx-sub" href={safeHttpUrl(a.link)} target="_blank" rel="noopener noreferrer">Open assessment (opens in a new tab)</a>}
                  </div>
                  <div className="cx-row-actions">
                    {!a.completed_at && (
                      <>
                        <button type="button" className="cx-btn cx-btn-sm" onClick={() => void setResult(a, 'pass')}>Passed</button>
                        <button type="button" className="cx-btn cx-btn-sm" onClick={() => void setResult(a, 'fail')}>Failed</button>
                      </>
                    )}
                    <button type="button" className="cx-icon-btn" aria-label={`Delete ${a.title}`} onClick={() => { if (user) void deleteAssessment(user.id, a.id).then(load); }}>✕</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
