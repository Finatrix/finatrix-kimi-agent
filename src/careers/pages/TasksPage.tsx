/**
 * Task Manager (Phase 3, Module 14) — one flat, filterable action list across
 * every application: apply, follow up, prep, research, practice STAR,
 * assessments. Feeds the Notification Engine and Automation Engine.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { Tabs } from '../../tools/ui/Tabs';
import { ErrorCard, PageLoading } from '../components/states';
import { Empty } from '../ui/primitives';
import '../ui/forms.css';
import { useCareers } from '../context/CareersContext';
import { listApplications } from '../services/applications';
import { completeTask, createTask, deleteTask, dismissTask, listTasks } from '../services/tasks';
import { TASK_KINDS, type TaskKind, type TaskPriority, type TaskRow } from '../types/phase3';
import type { ApplicationRow } from '../types/jobs';
import { toCareersError, type CareersError } from '../utils/errors';
import { formatDate } from '../utils/format';

const EMPTY_FORM = { title: '', detail: '', kind: 'general' as TaskKind, priority: 'medium' as TaskPriority, dueAt: '', applicationId: '' };

export default function TasksPage() {
  const { user } = useAuth();
  const { loading, error: ctxError, refresh } = useCareers();
  const { notify } = useToast();

  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [loadError, setLoadError] = useState<CareersError | null>(null);
  const [filter, setFilter] = useState<'open' | 'done' | 'all'>('open');
  const [form, setForm] = useState(EMPTY_FORM);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [t, a] = await Promise.all([listTasks(user.id), listApplications(user.id).catch(() => [])]);
      setTasks(t);
      setApplications(a.filter((x) => !x.archived));
      setLoadError(null);
    } catch (e) {
      setLoadError(toCareersError(e));
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const appName = (id: string | null) => {
    const a = applications.find((x) => x.id === id);
    return a ? `${a.job_title} at ${a.company_name}` : '';
  };

  const visible = useMemo(() => {
    if (filter === 'all') return tasks;
    return tasks.filter((t) => (filter === 'open' ? t.status === 'open' : t.status === 'done'));
  }, [tasks, filter]);

  const add = async () => {
    if (!user || !form.title.trim()) {
      notify('Give the task a title.', 'error');
      return;
    }
    setAdding(true);
    try {
      await createTask(user.id, {
        title: form.title,
        detail: form.detail,
        kind: form.kind,
        priority: form.priority,
        dueAt: form.dueAt ? new Date(form.dueAt).toISOString() : null,
        applicationId: form.applicationId || null,
      });
      setForm(EMPTY_FORM);
      await load();
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setAdding(false);
    }
  };

  const overdue = (t: TaskRow) => t.status === 'open' && t.due_at != null && new Date(t.due_at).getTime() < Date.now();

  if (loading) return <PageLoading />;

  return (
    <div className="cxf-stack">
      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      <section className="cx-panel" aria-labelledby="tk-new">
        <div className="cx-panel-head"><h2 id="tk-new">New task</h2></div>
        <div className="cxf-form cxf-form-3">
          <div className="fg cxf-wide">
            <label className="fl" htmlFor="tk-title">Title (required)</label>
            <input id="tk-title" className="fi" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="tk-kind">Type</label>
            <select id="tk-kind" className="fs" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as TaskKind }))}>
              {TASK_KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="fg">
            <label className="fl" htmlFor="tk-priority">Priority</label>
            <select id="tk-priority" className="fs" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}>
              <option value="low">Low priority</option>
              <option value="medium">Medium priority</option>
              <option value="high">High priority</option>
            </select>
          </div>
          <div className="fg">
            <label className="fl" htmlFor="tk-due">Due date and time</label>
            <input id="tk-due" className="fi" type="datetime-local" value={form.dueAt} onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))} />
          </div>
          <div className="fg cxf-wide">
            <label className="fl" htmlFor="tk-app">Linked application</label>
            <select id="tk-app" className="fs" value={form.applicationId} onChange={(e) => setForm((f) => ({ ...f, applicationId: e.target.value }))}>
              <option value="">No linked application</option>
              {applications.map((a) => <option key={a.id} value={a.id}>{a.job_title} at {a.company_name}</option>)}
            </select>
          </div>
        </div>
        <div className="cxf-actions">
          <button type="button" className="cx-btn cx-btn-primary" disabled={adding} onClick={() => void add()}>Add task</button>
        </div>
      </section>

      <Tabs
        variant="nav"
        label="Task filter"
        style={{ padding: 0 }}
        active={filter}
        onChange={setFilter}
        items={[
          { key: 'open', label: `Open (${tasks.filter((t) => t.status === 'open').length})` },
          { key: 'done', label: 'Done' },
          { key: 'all', label: 'All' },
        ]}
      />

      {!visible.length ? (
        <div className="cx-panel"><Empty title="Nothing here">Add your first task above.</Empty></div>
      ) : (
        <section className="cx-panel" aria-label="Tasks">
          <ul className="cx-list">
            {visible.map((t) => (
              <li key={t.id}>
                <div className="cx-row">
                  <input
                    type="checkbox" checked={t.status === 'done'} aria-label={`Mark ${t.title} done`}
                    onChange={() => {
                      if (!user) return;
                      void (t.status === 'done' ? dismissTask(user.id, t.id) : completeTask(user.id, t.id)).then(load);
                    }}
                    style={{ width: 20, height: 20, flex: 'none' }}
                  />
                  <div className="cx-row-main">
                    <p className="cx-row-title wrap" style={t.status === 'done' ? { textDecoration: 'line-through' } : undefined}>{t.title}</p>
                    <p className="cx-row-meta">
                      <span className={`cx-chip ${t.status === 'done' ? 'cx-chip-good' : ''}`}>{t.status === 'done' ? 'Done' : 'Open'}</span>
                      <span className="cx-chip">{t.kind.replace('_', ' ')}</span>
                      <span className={`cx-chip ${t.priority === 'high' ? 'cx-chip-bad' : ''}`}>{t.priority} priority</span>
                      {overdue(t) && <span className="cx-chip cx-chip-bad">Overdue</span>}
                      {t.application_id && <span>{appName(t.application_id)}</span>}
                      {t.due_at && <span>Due {formatDate(t.due_at)}</span>}
                    </p>
                    {t.detail && <p className="cx-sub" style={{ marginTop: 4 }}>{t.detail}</p>}
                  </div>
                  <button type="button" className="cx-icon-btn" aria-label={`Delete ${t.title}`} onClick={() => { if (user) void deleteTask(user.id, t.id).then(load); }}>✕</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
