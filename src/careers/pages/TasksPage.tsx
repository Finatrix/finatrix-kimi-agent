/**
 * Task Manager (Phase 3, Module 14) — one flat, filterable action list across
 * every application: apply, follow up, prep, research, practice STAR,
 * assessments. Feeds the Notification Engine and Automation Engine.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { EmptyState, ErrorCard } from '../components/states';
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
    return a ? `${a.job_title} — ${a.company_name}` : '';
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

  if (loading) return <div style={{ minHeight: '50vh' }} aria-busy="true" />;

  return (
    <div className="fx-page">
      <PageHead chip="Task Manager" chipColor="#D4AF37" chipBg="rgba(212,175,55,.12)" icon="check" title="Every action, one list">
        Apply, follow up, prep, research, practice STAR — nothing about your job search
        lives in a spreadsheet.
      </PageHead>

      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      <div className="card">
        <div className="panel-eyebrow" style={{ marginBottom: 12 }}>New task</div>
        <div className="grid3" style={{ marginBottom: 10 }}>
          <input className="fi" placeholder="Task title *" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <select className="fs" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as TaskKind }))}>
            {TASK_KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
          </select>
          <select className="fs" value={form.applicationId} onChange={(e) => setForm((f) => ({ ...f, applicationId: e.target.value }))}>
            <option value="">No linked application</option>
            {applications.map((a) => <option key={a.id} value={a.id}>{a.job_title} — {a.company_name}</option>)}
          </select>
        </div>
        <div className="grid3" style={{ marginBottom: 14 }}>
          <select className="fs" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as TaskPriority }))}>
            <option value="low">Low priority</option>
            <option value="medium">Medium priority</option>
            <option value="high">High priority</option>
          </select>
          <input className="fi" type="datetime-local" value={form.dueAt} onChange={(e) => setForm((f) => ({ ...f, dueAt: e.target.value }))} />
          <button className={`btn ${adding ? 'btn-loading' : ''}`} disabled={adding} onClick={() => void add()}>Add task</button>
        </div>
      </div>

      <div className="nav" style={{ padding: 0, marginBottom: 10 }}>
        <a className={filter === 'open' ? 'on' : ''} style={{ cursor: 'pointer' }} onClick={() => setFilter('open')}>Open ({tasks.filter((t) => t.status === 'open').length})</a>
        <a className={filter === 'done' ? 'on' : ''} style={{ cursor: 'pointer' }} onClick={() => setFilter('done')}>Done</a>
        <a className={filter === 'all' ? 'on' : ''} style={{ cursor: 'pointer' }} onClick={() => setFilter('all')}>All</a>
      </div>

      {!visible.length ? (
        <div className="card"><EmptyState icon="check" title="Nothing here">Add your first task above.</EmptyState></div>
      ) : (
        visible.map((t) => (
          <div className="card" key={t.id} style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <input
                type="checkbox" checked={t.status === 'done'} aria-label={`Mark ${t.title} done`}
                onChange={() => {
                  if (!user) return;
                  void (t.status === 'done' ? dismissTask(user.id, t.id) : completeTask(user.id, t.id)).then(load);
                }}
                style={{ marginTop: 3 }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</div>
                <div className="job-meta">
                  <span className="badge badge-mute">{t.kind.replace('_', ' ')}</span>
                  <span className={`badge ${t.priority === 'high' ? 'badge-red' : t.priority === 'low' ? 'badge-mute' : 'badge-blue'}`}>{t.priority}</span>
                  {t.application_id && <span>{appName(t.application_id)}</span>}
                  {t.due_at && <span style={overdue(t) ? { color: 'var(--danger, #e05252)' } : undefined}>Due {formatDate(t.due_at)}{overdue(t) ? ' · overdue' : ''}</span>}
                </div>
                {t.detail && <p className="note" style={{ marginTop: 4 }}>{t.detail}</p>}
              </div>
              <button className="icon-btn danger" aria-label={`Delete ${t.title}`} onClick={() => { if (user) void deleteTask(user.id, t.id).then(load); }}>✕</button>
            </div>
          </div>
        ))
      )}

      <ToolFoot><b>Task Manager</b> · linked to your applications, feeds reminders automatically</ToolFoot>
    </div>
  );
}
