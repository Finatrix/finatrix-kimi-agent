/**
 * Applications — the career CRM: live stats, smart reminders, the 22-stage
 * pipeline with immutable timeline, calendar view (month/week), manual
 * tracking, and exports (CSV / JSON / Excel / PDF).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { Icon } from '../../tools/ui/Icon';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { Tabs } from '../../tools/ui/Tabs';
import { ConfirmDialog, EmptyState, ErrorCard, ModalShell, PageLoading } from '../components/states';
import { useCareers } from '../context/CareersContext';
import {
  addApplicationNote,
  computeApplicationStats,
  createApplication,
  deleteApplication,
  getHistory,
  listApplications,
  moveStage,
  updateApplication,
} from '../services/applications';
import { computeAutomationReminders } from '../services/automation';
import { allowAction } from '../utils/rateLimit';
import { listAssessments } from '../services/assessments';
import { downloadIcs } from '../services/calendar';
import { generateEmail, listGeneratedEmails } from '../services/emails';
import { completeTask, createTask, listTasks } from '../services/tasks';
import { EMAIL_KIND_LABELS, EMAIL_KINDS, type AssessmentRow, type CalendarEvent, type EmailKind, type GeneratedEmailRow, type TaskRow } from '../types/phase3';
import {
  analyticsTable,
  applicationsTable,
  exportCsv,
  exportExcel,
  exportJson,
  exportTablePdf,
  timelineTable,
} from '../services/exports';
import { computeReminders } from '../services/reminders';
import { syncReminderNotifications } from '../services/notifications';
import {
  APPLICATION_STAGES,
  STAGE_LABELS,
  matchBand,
  type ApplicationHistoryRow,
  type ApplicationRow,
  type ApplicationStage,
  type Reminder,
} from '../types/jobs';
import type { ResumeVersionRow, ResumeWithVersions } from '../types';
import { toCareersError, type CareersError } from '../utils/errors';
import { formatDate, formatDateTime, timeAgo } from '../utils/format';

function completeVersions(resumes: ResumeWithVersions[]): { label: string; version: ResumeVersionRow }[] {
  return resumes.flatMap((r) => r.versions.filter((v) => v.status === 'complete' && v.parsed).map((v) => ({ label: `${r.name} · v${v.version_number}`, version: v })));
}

// ─────────────────────────── calendar ───────────────────────────

interface CalEvent {
  date: string; // YYYY-MM-DD
  kind: 'interview' | 'deadline' | 'offer' | 'followup';
  label: string;
}

function eventsOf(apps: ApplicationRow[], reminders: Reminder[]): CalEvent[] {
  const events: CalEvent[] = [];
  for (const a of apps) {
    if (a.archived) continue;
    const label = `${a.company_name}: ${a.job_title}`;
    if (a.interview_at) events.push({ date: a.interview_at.slice(0, 10), kind: 'interview', label: `Interview — ${label}` });
    if (a.closes_at) events.push({ date: a.closes_at.slice(0, 10), kind: 'deadline', label: `Deadline — ${label}` });
    if (a.offer_expires_at) events.push({ date: a.offer_expires_at.slice(0, 10), kind: 'offer', label: `Offer expires — ${label}` });
  }
  for (const r of reminders) {
    if (r.kind === 'follow_up') events.push({ date: r.dueAt.slice(0, 10), kind: 'followup', label: r.title });
  }
  return events;
}

const CAL_EVENT_KIND: Record<CalEvent['kind'], CalendarEvent['kind']> = {
  interview: 'interview', deadline: 'deadline', offer: 'deadline', followup: 'follow_up',
};

/** Module 15 — .ics needs a real timestamp; a bare calendar date defaults to 9am local. */
function toCalendarEvents(events: CalEvent[]): CalendarEvent[] {
  return events.map((e, i) => ({
    id: `${e.kind}-${e.date}-${i}`,
    kind: CAL_EVENT_KIND[e.kind],
    title: e.label,
    description: '',
    at: new Date(`${e.date}T09:00:00`).toISOString(),
    location: '',
    url: '',
  }));
}

function CalendarView({ events }: { events: CalEvent[] }) {
  const [mode, setMode] = useState<'month' | 'week'>('month');
  const [anchor, setAnchor] = useState(() => new Date());
  const byDate = useMemo(() => {
    const m = new Map<string, CalEvent[]>();
    for (const e of events) m.set(e.date, [...(m.get(e.date) ?? []), e]);
    return m;
  }, [events]);

  const days: Date[] = useMemo(() => {
    const list: Date[] = [];
    if (mode === 'week') {
      const start = new Date(anchor);
      start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // Monday
      for (let i = 0; i < 7; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        list.push(d);
      }
    } else {
      const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
      const start = new Date(first);
      start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
      for (let i = 0; i < 42; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        list.push(d);
      }
    }
    return list;
  }, [anchor, mode]);

  const todayKey = new Date().toISOString().slice(0, 10);
  const monthLabel = anchor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const step = (dir: 1 | -1) => {
    const next = new Date(anchor);
    if (mode === 'month') next.setMonth(next.getMonth() + dir);
    else next.setDate(next.getDate() + dir * 7);
    setAnchor(next);
  };

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button className="icon-btn" aria-label="Previous" onClick={() => step(-1)}>‹</button>
        <b style={{ flex: 1, textAlign: 'center' }}>{monthLabel}</b>
        <button className="icon-btn" aria-label="Next" onClick={() => step(1)}>›</button>
        <Tabs
          variant="nav"
          label="Calendar mode"
          style={{ padding: 0 }}
          active={mode}
          onChange={setMode}
          items={[{ key: 'month', label: 'Month' }, { key: 'week', label: 'Week' }]}
        />
      </div>
      <div className="cal-grid" role="grid" aria-label={`Calendar — ${monthLabel}`}>
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div className="cal-head" key={d}>{d}</div>)}
        {days.map((d) => {
          const key = d.toISOString().slice(0, 10);
          const dayEvents = byDate.get(key) ?? [];
          const other = mode === 'month' && d.getMonth() !== anchor.getMonth();
          return (
            <div key={key} className={`cal-cell ${other ? 'other' : ''} ${key === todayKey ? 'today' : ''}`}>
              <span className="cal-num">{d.getDate()}</span>
              {dayEvents.slice(0, 3).map((e, i) => (
                <span key={i} className={`cal-ev ${e.kind === 'followup' ? '' : e.kind}`} title={e.label}>{e.label}</span>
              ))}
              {dayEvents.length > 3 && <span className="cal-ev">+{dayEvents.length - 3} more</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────── detail modal ───────────────────────────

function ApplicationDetail({
  app,
  version,
  onClose,
  onChanged,
}: {
  app: ApplicationRow;
  version: ResumeVersionRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const { notify } = useToast();
  const [history, setHistory] = useState<ApplicationHistoryRow[]>([]);
  const [note, setNote] = useState('');
  const [form, setForm] = useState({ ...app });
  const [saving, setSaving] = useState(false);

  // Module 1 — Application Workspace: tasks + emails scoped to this application.
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [taskTitle, setTaskTitle] = useState('');
  const [emails, setEmails] = useState<GeneratedEmailRow[]>([]);
  const [emailKind, setEmailKind] = useState<EmailKind>('application');
  const [emailBusy, setEmailBusy] = useState(false);

  const loadWorkspace = useCallback(() => {
    if (!user) return;
    void listTasks(user.id).then((all) => setTasks(all.filter((t) => t.application_id === app.id)));
    void listGeneratedEmails(user.id).then((all) => setEmails(all.filter((e) => e.application_id === app.id)));
  }, [user, app.id]);

  useEffect(() => {
    if (user) void getHistory(user.id, app.id).then(setHistory, () => setHistory([]));
    loadWorkspace();
  }, [user, app.id, loadWorkspace]);

  const addTask = async () => {
    if (!user || !taskTitle.trim()) return;
    try {
      await createTask(user.id, { title: taskTitle, applicationId: app.id });
      setTaskTitle('');
      loadWorkspace();
    } catch (e) { notify(toCareersError(e).message, 'error'); }
  };

  const generateWorkspaceEmail = async () => {
    if (!user || !version) { notify('Pick an analysed resume version (top of the page) first.', 'error'); return; }
    if (!allowAction(`generate-email:${user.id}`, 10, 60_000)) {
      notify('Too many emails generated in a short time — wait a moment and try again.', 'error');
      return;
    }
    setEmailBusy(true);
    try {
      await generateEmail(user.id, version, emailKind, {
        company: app.company_name, jobTitle: app.job_title, recipientName: '', extra: app.notes,
        applicationId: app.id,
      });
      loadWorkspace();
      notify('Email drafted.', 'ok');
    } catch (e) { notify(toCareersError(e).message, 'error'); } finally { setEmailBusy(false); }
  };

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      await updateApplication(user.id, app.id, {
        department: form.department, salary_text: form.salary_text, location: form.location,
        work_mode: form.work_mode, job_url: form.job_url, priority: form.priority,
        notes: form.notes, tags: form.tags,
        closes_at: form.closes_at, interview_at: form.interview_at, offer_expires_at: form.offer_expires_at,
      });
      notify('Application saved.', 'ok');
      onChanged();
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setSaving(false);
    }
  };

  const addNote = async () => {
    if (!user || !note.trim()) return;
    try {
      await addApplicationNote(user.id, app.id, note.trim());
      setNote('');
      setHistory(await getHistory(user.id, app.id));
      notify('Note added to timeline.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  const dateInput = (key: 'closes_at' | 'interview_at' | 'offer_expires_at', label: string) => (
    <div className="fg" style={{ marginBottom: 10 }}>
      <label className="fl" htmlFor={`ad-${key}`}>{label}</label>
      <input
        id={`ad-${key}`} type="date" className="fi" style={{ padding: '10px 13px' }}
        value={form[key]?.slice(0, 10) ?? ''}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value ? new Date(e.target.value).toISOString() : null }))}
      />
    </div>
  );

  return (
    <ModalShell label={`Application — ${app.job_title}`} onClose={onClose} wide>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <h3 style={{ flex: 1, marginBottom: 0 }}>{app.job_title} — {app.company_name}</h3>
          <button className="icon-btn" aria-label="Close" onClick={onClose}>✕</button>
        </div>
        <div className="job-meta" style={{ marginBottom: 16 }}>
          <span className="badge badge-gold">{STAGE_LABELS[app.stage]}</span>
          {app.match_score != null && (
            <span><span className={`tl-dot tl-${matchBand(app.match_score)}`} />{app.match_score}% match</span>
          )}
          {app.ats_score != null && <span>ATS {app.ats_score}</span>}
          <span>Tracked {timeAgo(app.created_at)}</span>
        </div>

        <div className="grid2">
          <div>
            <div className="panel-eyebrow" style={{ marginBottom: 10 }}>Details</div>
            <div className="grid2" style={{ gap: '0 12px' }}>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label className="fl" htmlFor="ad-dept">Department</label>
                <input id="ad-dept" className="fi" value={form.department} onChange={(e) => setForm((f) => ({ ...f, department: e.target.value }))} />
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label className="fl" htmlFor="ad-salary">Salary / range</label>
                <input id="ad-salary" className="fi" value={form.salary_text} onChange={(e) => setForm((f) => ({ ...f, salary_text: e.target.value }))} />
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label className="fl" htmlFor="ad-loc">Location</label>
                <input id="ad-loc" className="fi" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
              </div>
              <div className="fg" style={{ marginBottom: 10 }}>
                <label className="fl" htmlFor="ad-priority">Priority</label>
                <select id="ad-priority" className="fs" value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as ApplicationRow['priority'] }))}>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
              {dateInput('closes_at', 'Application deadline')}
              {dateInput('interview_at', 'Next interview')}
              {dateInput('offer_expires_at', 'Offer expiry')}
              <div className="fg" style={{ marginBottom: 10 }}>
                <label className="fl" htmlFor="ad-url">Job URL</label>
                <input id="ad-url" className="fi" value={form.job_url} onChange={(e) => setForm((f) => ({ ...f, job_url: e.target.value }))} />
              </div>
            </div>
            <div className="fg" style={{ marginBottom: 10 }}>
              <label className="fl" htmlFor="ad-tags">Tags (comma separated)</label>
              <input id="ad-tags" className="fi" value={form.tags.join(', ')}
                onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 12) }))} />
            </div>
            <div className="fg">
              <label className="fl" htmlFor="ad-notes">Personal notes</label>
              <textarea id="ad-notes" className="fi" style={{ minHeight: 90, resize: 'vertical' }} value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <button className={`btn btn-sm ${saving ? 'btn-loading' : ''}`} disabled={saving} onClick={() => void save()}>Save details</button>
          </div>

          <div>
            <div className="panel-eyebrow" style={{ marginBottom: 10 }}>Timeline (immutable)</div>
            <div style={{ maxHeight: 320, overflowY: 'auto', paddingRight: 4 }}>
              {history.map((h) => (
                <div className="act-row" key={h.id}>
                  <div className="act-ic">
                    <Icon name={h.event === 'note' ? 'bills' : h.event === 'created' ? 'zap' : 'check'} size={13} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div>{h.body || h.event}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>
                      {formatDateTime(h.created_at)}
                      {h.from_stage && h.to_stage ? ` · ${STAGE_LABELS[h.from_stage as ApplicationStage] ?? h.from_stage} → ${STAGE_LABELS[h.to_stage as ApplicationStage] ?? h.to_stage}` : ''}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input className="fi" style={{ padding: '10px 13px' }} placeholder="Add a timeline note…" aria-label="Timeline note"
                value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addNote()} />
              <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => void addNote()}>Add</button>
            </div>
            <button
              className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}
              onClick={() => void exportTablePdf(timelineTable(app, history)).catch((e) => notify(toCareersError(e).message, 'error'))}
            >
              Export timeline PDF
            </button>
          </div>
        </div>

        <div className="grid2" style={{ marginTop: 20 }}>
          <div>
            <div className="panel-eyebrow" style={{ marginBottom: 10 }}>Tasks</div>
            {tasks.map((t) => (
              <label className="act-row" key={t.id} style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={t.status === 'done'} onChange={() => { if (user) void completeTask(user.id, t.id).then(loadWorkspace); }} />
                <span style={{ flex: 1, textDecoration: t.status === 'done' ? 'line-through' : 'none' }}>{t.title}</span>
              </label>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input className="fi" style={{ padding: '10px 13px' }} placeholder="Add a task…" value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && void addTask()} />
              <button className="btn btn-ghost btn-sm" style={{ flexShrink: 0 }} onClick={() => void addTask()}>Add</button>
            </div>
          </div>

          <div>
            <div className="panel-eyebrow" style={{ marginBottom: 10 }}>Emails</div>
            {emails.map((e) => (
              <div className="act-row" key={e.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b>{EMAIL_KIND_LABELS[e.kind]}</b>{e.sent && <span className="badge badge-green" style={{ marginLeft: 8 }}>sent</span>}
                  <div className="note" style={{ whiteSpace: 'pre-wrap' }}>{e.subject}</div>
                </div>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <select className="fs" value={emailKind} onChange={(ev) => setEmailKind(ev.target.value as EmailKind)}>
                {EMAIL_KINDS.map((k) => <option key={k} value={k}>{EMAIL_KIND_LABELS[k]}</option>)}
              </select>
              <button className={`btn btn-ghost btn-sm ${emailBusy ? 'btn-loading' : ''}`} disabled={emailBusy} style={{ flexShrink: 0 }} onClick={() => void generateWorkspaceEmail()}>
                Generate
              </button>
            </div>
          </div>
        </div>
    </ModalShell>
  );
}

// ─────────────────────────── page ───────────────────────────

const STAGE_FILTERS = [
  { id: 'active', label: 'Active' },
  { id: 'interviewing', label: 'Interviewing' },
  { id: 'offers', label: 'Offers' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
] as const;

export default function ApplicationsPage() {
  const { user } = useAuth();
  const { loading, error: ctxError, refresh, resumes } = useCareers();
  const { notify } = useToast();
  const workspaceVersion = useMemo(() => completeVersions(resumes)[0]?.version ?? null, [resumes]);

  const [apps, setApps] = useState<ApplicationRow[]>([]);
  const [loadError, setLoadError] = useState<CareersError | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<(typeof STAGE_FILTERS)[number]['id']>('active');
  const [view, setView] = useState<'list' | 'calendar'>('list');
  const [detail, setDetail] = useState<ApplicationRow | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ company: '', title: '', url: '', location: '' });
  const [deleteTarget, setDeleteTarget] = useState<ApplicationRow | null>(null);
  const [assessments, setAssessments] = useState<AssessmentRow[]>([]);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [rows, assessmentRows] = await Promise.all([
        listApplications(user.id),
        listAssessments(user.id).catch(() => []),
      ]);
      setApps(rows);
      setAssessments(assessmentRows);
      setLoadError(null);
      // Materialize smart reminders as (deduped) notifications.
      const reminders = [...computeReminders(rows), ...computeAutomationReminders(assessmentRows, resumes)];
      void syncReminderNotifications(user.id, reminders);
    } catch (e) {
      setLoadError(toCareersError(e));
    }
  }, [user, resumes]);

  useEffect(() => {
    // Deferred a tick so state lands from a promise callback, never the
    // synchronous effect body (react-hooks/set-state-in-effect).
    void Promise.resolve().then(load);
  }, [load]);

  const stats = useMemo(() => computeApplicationStats(apps), [apps]);
  const reminders = useMemo(
    () => [...computeReminders(apps), ...computeAutomationReminders(assessments, resumes)],
    [apps, assessments, resumes]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return apps.filter((a) => {
      if (filter === 'active' && (a.archived || ['offer_accepted', 'offer_declined', 'rejected', 'withdrawn', 'archived'].includes(a.stage))) return false;
      if (filter === 'interviewing' && !['phone_screening', 'technical_assessment', 'online_assessment', 'behavioural_interview', 'technical_interview', 'panel_interview', 'final_interview'].includes(a.stage)) return false;
      if (filter === 'offers' && !['offer_received', 'negotiating', 'offer_accepted'].includes(a.stage)) return false;
      if (filter === 'closed' && !['offer_accepted', 'offer_declined', 'rejected', 'withdrawn', 'archived'].includes(a.stage)) return false;
      if (q && ![a.company_name, a.job_title, a.location, a.tags.join(' ')].join(' ').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [apps, filter, search]);

  const onStageChange = async (app: ApplicationRow, to: ApplicationStage) => {
    if (!user) return;
    try {
      await moveStage(user.id, app, to);
      await load();
      notify(`Moved to ${STAGE_LABELS[to]}.`, 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  const addManual = async () => {
    if (!user || !addForm.company.trim() || !addForm.title.trim()) {
      notify('Company and job title are required.', 'error');
      return;
    }
    try {
      await createApplication(user.id, {
        company_name: addForm.company.trim(),
        job_title: addForm.title.trim(),
        job_url: addForm.url.trim(),
        location: addForm.location.trim(),
        source: 'manual',
      });
      setAddOpen(false);
      setAddForm({ company: '', title: '', url: '', location: '' });
      await load();
      notify('Application tracked.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  const onDelete = async () => {
    if (!user || !deleteTarget) return;
    const target = deleteTarget;
    setDeleteTarget(null);
    try {
      await deleteApplication(user.id, target.id);
      await load();
      notify('Application deleted.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  const doExport = (kind: 'csv' | 'json' | 'xlsx' | 'pdf') => {
    const table = applicationsTable(visible);
    const run = kind === 'csv' ? () => exportCsv(table)
      : kind === 'json' ? () => exportJson(table)
      : kind === 'xlsx' ? () => exportExcel(table)
      : () => exportTablePdf(table);
    void Promise.resolve(run()).then(
      () => notify(`${kind.toUpperCase()} export ready.`, 'ok'),
      (e) => notify(toCareersError(e).message, 'error')
    );
  };

  if (loading) return <PageLoading />;

  return (
    <div className="fx-page">
      <PageHead
        chip="Applications"
        chipColor="#D4AF37"
        chipBg="rgba(212,175,55,.12)"
        icon="briefcase"
        title="Your application command center"
      >
        Every application, from saved to offer, with a full immutable history —
        a personal ATS built for the candidate side of the table.
      </PageHead>

      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      {/* Stats */}
      <div className="dash-grid" style={{ marginBottom: 14 }}>
        <div className="metric"><div className="ml">Applied</div><div className="mv">{stats.applied}</div><div className="md">{stats.total} tracked · {stats.saved} saved</div></div>
        <div className="metric" style={{ ['--metric-accent' as string]: 'var(--blue)' }}><div className="ml">Interviews</div><div className="mv">{stats.interviews}</div><div className="md">{stats.interviewRate}% interview rate</div></div>
        <div className="metric" style={{ ['--metric-accent' as string]: 'var(--green)' }}><div className="ml">Offers</div><div className="mv">{stats.offers}</div><div className="md">{stats.successRate}% success rate · {stats.accepted} accepted</div></div>
        <div className="metric" style={{ ['--metric-accent' as string]: 'var(--red)' }}><div className="ml">Rejections</div><div className="mv">{stats.rejections}</div><div className="md">{stats.withdrawn} withdrawn</div></div>
        <div className="metric" style={{ ['--metric-accent' as string]: 'var(--purple)' }}><div className="ml">Avg match</div><div className="mv">{stats.avgMatchScore ?? '—'}</div><div className="md">Avg ATS {stats.avgAtsScore ?? '—'}</div></div>
      </div>

      {/* Reminders */}
      {reminders.length > 0 && (
        <div className="card" style={{ padding: 16 }}>
          <div className="panel-eyebrow" style={{ marginBottom: 6 }}>Smart reminders</div>
          {reminders.slice(0, 5).map((r) => (
            <div className="act-row" key={r.id}>
              <div className="act-ic" style={r.overdue ? { color: 'var(--red)', background: 'rgba(255,90,82,.1)' } : { color: 'var(--gold)', background: 'rgba(212,175,55,.1)' }}>
                <Icon name={r.kind === 'interview' ? 'clock' : 'warn'} size={14} />
              </div>
              <div style={{ flex: 1 }}>{r.title}</div>
              <span className="note">{formatDate(r.dueAt)}</span>
              <button
                className="btn btn-ghost btn-sm" style={{ padding: '5px 12px', fontSize: 12 }}
                onClick={() => { const app = apps.find((a) => a.id === r.applicationId); if (app) setDetail(app); }}
              >
                Open
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Toolbar */}
      <div className="lib-toolbar">
        <input className="fi" type="search" placeholder="Search applications…" aria-label="Search applications" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="fs" aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
          {STAGE_FILTERS.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
        </select>
        <button className="icon-btn" aria-label={view === 'list' ? 'Calendar view' : 'List view'} title={view === 'list' ? 'Calendar view' : 'List view'} onClick={() => setView((v) => (v === 'list' ? 'calendar' : 'list'))}>
          <Icon name={view === 'list' ? 'clock' : 'bills'} size={14} />
        </button>
        <button className="btn btn-sm" style={{ width: 'auto' }} onClick={() => setAddOpen(true)}>+ Track application</button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => doExport('csv')}>CSV</button>
        <button className="btn btn-ghost btn-sm" onClick={() => doExport('xlsx')}>Excel</button>
        <button className="btn btn-ghost btn-sm" onClick={() => doExport('json')}>JSON</button>
        <button className="btn btn-ghost btn-sm" onClick={() => doExport('pdf')}>PDF</button>
        {view === 'calendar' && (
          <button className="btn btn-ghost btn-sm" onClick={() => downloadIcs(toCalendarEvents(eventsOf(apps, reminders)), 'careers-calendar.ics')}>
            Export .ics
          </button>
        )}
      </div>

      {view === 'calendar' ? (
        <CalendarView events={eventsOf(apps, reminders)} />
      ) : !visible.length ? (
        <div className="card">
          <EmptyState icon="briefcase" title={apps.length ? 'Nothing matches your filters' : 'No applications tracked yet'}>
            {apps.length ? 'Try a different search or filter.' : 'Track jobs from the Jobs page, or add one manually.'}
          </EmptyState>
        </div>
      ) : (
        visible.map((app) => (
          <div className="card" key={app.id} style={{ padding: 16, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 15, fontWeight: 650 }}>{app.job_title}</div>
                <div className="job-meta">
                  <span><b style={{ color: 'var(--ink)' }}>{app.company_name}</b></span>
                  {app.location && <span>{app.location}</span>}
                  {app.priority === 'high' && <span className="badge badge-red">high priority</span>}
                  {app.match_score != null && (
                    <span><span className={`tl-dot tl-${matchBand(app.match_score)}`} />{app.match_score}%</span>
                  )}
                  {app.closes_at && <span>Closes {formatDate(app.closes_at)}</span>}
                  <span>Updated {timeAgo(app.updated_at)}</span>
                </div>
              </div>
              <select
                className="fs stage-select" style={{ width: 'auto' }} aria-label={`Stage for ${app.job_title}`}
                value={app.stage}
                onChange={(e) => void onStageChange(app, e.target.value as ApplicationStage)}
              >
                {APPLICATION_STAGES.map((s) => <option key={s} value={s}>{STAGE_LABELS[s]}</option>)}
              </select>
              <button className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={() => setDetail(app)}>Open</button>
              <button className="icon-btn danger" aria-label={`Delete application at ${app.company_name}`} onClick={() => setDeleteTarget(app)}>✕</button>
            </div>
          </div>
        ))
      )}

      {view === 'list' && apps.length > 0 && (
        <button
          className="btn btn-ghost btn-sm" style={{ marginTop: 6 }}
          onClick={() => void exportTablePdf(analyticsTable(stats)).then(() => notify('Analytics PDF ready.', 'ok'), (e) => notify(toCareersError(e).message, 'error'))}
        >
          Export analytics report
        </button>
      )}

      {/* Manual add modal */}
      {addOpen && (
        <ModalShell label="Track an application" onClose={() => setAddOpen(false)}>
            <h3>Track an application</h3>
            <div className="fg"><label className="fl" htmlFor="add-company">Company *</label>
              <input id="add-company" className="fi" value={addForm.company} onChange={(e) => setAddForm((f) => ({ ...f, company: e.target.value }))} /></div>
            <div className="fg"><label className="fl" htmlFor="add-title">Job title *</label>
              <input id="add-title" className="fi" value={addForm.title} onChange={(e) => setAddForm((f) => ({ ...f, title: e.target.value }))} /></div>
            <div className="fg"><label className="fl" htmlFor="add-location">Location</label>
              <input id="add-location" className="fi" value={addForm.location} onChange={(e) => setAddForm((f) => ({ ...f, location: e.target.value }))} /></div>
            <div className="fg"><label className="fl" htmlFor="add-url">Job URL</label>
              <input id="add-url" className="fi" value={addForm.url} onChange={(e) => setAddForm((f) => ({ ...f, url: e.target.value }))} /></div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setAddOpen(false)}>Cancel</button>
              <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => void addManual()}>Track</button>
            </div>
        </ModalShell>
      )}

      {detail && (
        <ApplicationDetail
          app={detail}
          version={workspaceVersion}
          onClose={() => setDetail(null)}
          onChanged={() => void load()}
        />
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this application?"
        body={`“${deleteTarget?.job_title ?? ''}” at ${deleteTarget?.company_name ?? ''} and its entire timeline will be removed permanently. Consider Archived instead to keep the history.`}
        confirmLabel="Delete forever"
        danger
        onConfirm={() => void onDelete()}
        onCancel={() => setDeleteTarget(null)}
      />

      <ToolFoot>
        <b>Applications</b> · timeline events are immutable — history is never rewritten
      </ToolFoot>
    </div>
  );
}
