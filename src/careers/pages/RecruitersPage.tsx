/**
 * Recruiter CRM (Phase 3, Module 6) — searchable recruiter directory with a
 * relationship score and logged communication history.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { EmptyState, ErrorCard, ModalShell, PageLoading } from '../components/states';
import { useCareers } from '../context/CareersContext';
import {
  deleteRecruiter,
  listInteractions,
  listRecruiters,
  logInteraction,
  searchRecruiters,
  upsertRecruiter,
} from '../services/recruiters';
import type { InteractionKind, RecruiterInteractionRow, RecruiterRow } from '../types/phase3';
import { toCareersError, type CareersError } from '../utils/errors';
import { formatDate } from '../utils/format';

const EMPTY_FORM = { name: '', role: '', company_name: '', email: '', phone: '', linkedin_url: '', notes: '' };

export default function RecruitersPage() {
  const { user } = useAuth();
  const { loading, error: ctxError, refresh } = useCareers();
  const { notify } = useToast();

  const [recruiters, setRecruiters] = useState<RecruiterRow[]>([]);
  const [loadError, setLoadError] = useState<CareersError | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<typeof EMPTY_FORM & { id?: string }>({ ...EMPTY_FORM });
  const [editOpen, setEditOpen] = useState(false);
  const [detail, setDetail] = useState<RecruiterRow | null>(null);
  const [interactions, setInteractions] = useState<RecruiterInteractionRow[]>([]);
  const [logKind, setLogKind] = useState<InteractionKind>('note');
  const [logBody, setLogBody] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await listRecruiters(user.id);
      setRecruiters(rows);
      setLoadError(null);
    } catch (e) {
      setLoadError(toCareersError(e));
    }
  }, [user]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard load-on-mount pattern used across every Careers page
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => searchRecruiters(recruiters, search), [recruiters, search]);

  const save = async () => {
    if (!user || !form.name.trim()) { notify('Give the recruiter a name.', 'error'); return; }
    try {
      await upsertRecruiter(user.id, form);
      setEditOpen(false);
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (e) { notify(toCareersError(e).message, 'error'); }
  };

  const openDetail = async (r: RecruiterRow) => {
    setDetail(r);
    if (user) setInteractions(await listInteractions(user.id, r.id).catch(() => []));
  };

  const logNow = async () => {
    if (!user || !detail || !logBody.trim()) return;
    try {
      await logInteraction(user.id, detail.id, logKind, logBody);
      setLogBody('');
      await load();
      setInteractions(await listInteractions(user.id, detail.id));
      notify('Logged.', 'ok');
    } catch (e) { notify(toCareersError(e).message, 'error'); }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="fx-page">
      <PageHead chip="Recruiter CRM" chipColor="#D4AF37" chipBg="rgba(212,175,55,.12)" icon="users" title="Every recruiter, one place">
        Track who you've talked to, how the relationship is going, and every conversation that led there.
      </PageHead>

      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      <div className="lib-toolbar">
        <input className="fi" style={{ maxWidth: 320 }} placeholder="Search recruiters…" aria-label="Search recruiters…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-sm" style={{ width: 'auto' }} onClick={() => { setForm({ ...EMPTY_FORM }); setEditOpen(true); }}>+ Add recruiter</button>
      </div>

      {!visible.length ? (
        <div className="card"><EmptyState icon="users" title="No recruiters yet">Add the first one you've spoken with.</EmptyState></div>
      ) : (
        visible.map((r) => (
          <div className="card" key={r.id} style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{r.name}</b> {r.role && <span className="note">· {r.role}</span>}
                <div className="job-meta">
                  {r.company_name && <span>{r.company_name}</span>}
                  <span className="badge badge-blue">relationship {r.relationship_score}</span>
                  {r.last_contact_at && <span>Last contact {formatDate(r.last_contact_at)}</span>}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={() => void openDetail(r)}>Open</button>
              <button className="icon-btn danger" aria-label={`Delete ${r.name}`} onClick={() => { if (user) void deleteRecruiter(user.id, r.id).then(load); }}>✕</button>
            </div>
          </div>
        ))
      )}

      {editOpen && (
        <ModalShell label="Add recruiter" onClose={() => setEditOpen(false)}>
            <h3>Add recruiter</h3>
            <div className="grid2" style={{ marginTop: 12 }}>
              <input className="fi" placeholder="Name *" aria-label="Name (required)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <input className="fi" placeholder="Role" aria-label="Role" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))} />
              <input className="fi" placeholder="Company" aria-label="Company" value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
              <input className="fi" placeholder="Email" aria-label="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              <input className="fi" placeholder="Phone" aria-label="Phone" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
              <input className="fi" placeholder="LinkedIn URL" aria-label="LinkedIn URL" value={form.linkedin_url} onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))} />
            </div>
            <textarea className="fi" style={{ minHeight: 80, marginTop: 10 }} placeholder="Notes" aria-label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn btn-sm" onClick={() => void save()}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditOpen(false)}>Cancel</button>
            </div>
        </ModalShell>
      )}

      {detail && (
        <ModalShell label={`Recruiter — ${detail.name}`} onClose={() => setDetail(null)} wide>
            <h3>{detail.name} — {detail.company_name || 'no company'}</h3>
            {detail.notes && <p className="note" style={{ marginTop: 8 }}>{detail.notes}</p>}
            <div className="panel-eyebrow" style={{ marginTop: 16 }}>Log a contact</div>
            <div className="grid2" style={{ marginTop: 8 }}>
              <select className="fs" aria-label="Contact type" value={logKind} onChange={(e) => setLogKind(e.target.value as InteractionKind)}>
                <option value="note">Note</option>
                <option value="email">Email</option>
                <option value="call">Call</option>
                <option value="meeting">Meeting</option>
                <option value="message">Message</option>
              </select>
              <button className="btn btn-sm" onClick={() => void logNow()}>Log</button>
            </div>
            <textarea className="fi" style={{ minHeight: 60, marginTop: 8 }} placeholder="What happened?" aria-label="What happened?" value={logBody} onChange={(e) => setLogBody(e.target.value)} />
            <div className="panel-eyebrow" style={{ marginTop: 16 }}>History</div>
            {interactions.map((i) => (
              <div className="act-row" key={i.id}>
                <span className="badge badge-mute">{i.kind}</span>
                <span style={{ flex: 1 }}>{i.body}</span>
                <span className="note">{formatDate(i.occurred_at)}</span>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => setDetail(null)}>Close</button>
        </ModalShell>
      )}

      <ToolFoot><b>Recruiter CRM</b> · relationship score grows automatically as you log contact</ToolFoot>
    </div>
  );
}
