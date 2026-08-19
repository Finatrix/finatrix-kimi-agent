/**
 * Networking CRM (Phase 3, Module 7) — mentors, hiring managers, employees,
 * referrals, alumni and event contacts, with follow-up reminders.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { EmptyState, ErrorCard, ModalShell, PageLoading } from '../components/states';
import { useCareers } from '../context/CareersContext';
import {
  deleteNetworkContact,
  dueFollowUps,
  listNetworkContacts,
  listNetworkInteractions,
  logNetworkInteraction,
  upsertNetworkContact,
} from '../services/networking';
import { NETWORK_RELATIONSHIPS, type NetworkContactRow, type NetworkInteractionRow, type NetworkRelationship } from '../types/phase3';
import { toCareersError, type CareersError } from '../utils/errors';
import { formatDate } from '../utils/format';

const EMPTY_FORM = {
  name: '', relationship: 'connection' as NetworkRelationship, company_name: '',
  university: '', event_name: '', email: '', linkedin_url: '', notes: '', follow_up_at: '',
};

export default function NetworkPage() {
  const { user } = useAuth();
  const { loading, error: ctxError, refresh } = useCareers();
  const { notify } = useToast();

  const [contacts, setContacts] = useState<NetworkContactRow[]>([]);
  const [loadError, setLoadError] = useState<CareersError | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState<typeof EMPTY_FORM & { id?: string }>({ ...EMPTY_FORM });
  const [editOpen, setEditOpen] = useState(false);
  const [detail, setDetail] = useState<NetworkContactRow | null>(null);
  const [interactions, setInteractions] = useState<NetworkInteractionRow[]>([]);
  const [logBody, setLogBody] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const rows = await listNetworkContacts(user.id);
      setContacts(rows);
      setLoadError(null);
    } catch (e) { setLoadError(toCareersError(e)); }
  }, [user]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- standard load-on-mount pattern used across every Careers page
  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) => [c.name, c.company_name, c.university, c.event_name, c.notes].join(' ').toLowerCase().includes(q));
  }, [contacts, search]);

  const dueSoon = useMemo(() => dueFollowUps(contacts), [contacts]);

  const save = async () => {
    if (!user || !form.name.trim()) { notify('Give the contact a name.', 'error'); return; }
    try {
      await upsertNetworkContact(user.id, { ...form, follow_up_at: form.follow_up_at ? new Date(form.follow_up_at).toISOString() : null });
      setEditOpen(false);
      setForm({ ...EMPTY_FORM });
      await load();
    } catch (e) { notify(toCareersError(e).message, 'error'); }
  };

  const openDetail = async (c: NetworkContactRow) => {
    setDetail(c);
    if (user) setInteractions(await listNetworkInteractions(user.id, c.id).catch(() => []));
  };

  const logNow = async () => {
    if (!user || !detail || !logBody.trim()) return;
    try {
      await logNetworkInteraction(user.id, detail.id, logBody);
      setLogBody('');
      await load();
      setInteractions(await listNetworkInteractions(user.id, detail.id));
      notify('Logged.', 'ok');
    } catch (e) { notify(toCareersError(e).message, 'error'); }
  };

  if (loading) return <PageLoading />;

  return (
    <div className="fx-page">
      <PageHead chip="Networking" chipColor="#D4AF37" chipBg="rgba(212,175,55,.12)" icon="users" title="Your professional network">
        Mentors, hiring managers, referrals and alumni — with follow-up reminders so nobody goes cold.
      </PageHead>

      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      {dueSoon.length > 0 && (
        <div className="tip tip-info" style={{ marginBottom: 12 }}>
          <b>Follow up soon</b>
          {dueSoon.map((c) => <div key={c.id}>· {c.name} — due {formatDate(c.follow_up_at!)}</div>)}
        </div>
      )}

      <div className="lib-toolbar">
        <input className="fi" style={{ maxWidth: 320 }} placeholder="Search your network…" aria-label="Search your network…" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-sm" style={{ width: 'auto' }} onClick={() => { setForm({ ...EMPTY_FORM }); setEditOpen(true); }}>+ Add contact</button>
      </div>

      {!visible.length ? (
        <div className="card"><EmptyState icon="users" title="No contacts yet">Add a mentor, referral or hiring manager to get started.</EmptyState></div>
      ) : (
        visible.map((c) => (
          <div className="card" key={c.id} style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{c.name}</b>
                <div className="job-meta">
                  <span className="badge badge-blue">{c.relationship.replace('_', ' ')}</span>
                  {c.company_name && <span>{c.company_name}</span>}
                  {c.university && <span>{c.university}</span>}
                  {c.follow_up_at && <span>Follow up {formatDate(c.follow_up_at)}</span>}
                </div>
              </div>
              <button className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={() => void openDetail(c)}>Open</button>
              <button className="icon-btn danger" aria-label={`Delete ${c.name}`} onClick={() => { if (user) void deleteNetworkContact(user.id, c.id).then(load); }}>✕</button>
            </div>
          </div>
        ))
      )}

      {editOpen && (
        <ModalShell label="Add contact" onClose={() => setEditOpen(false)}>
            <h3>Add contact</h3>
            <div className="grid2" style={{ marginTop: 12 }}>
              <input className="fi" placeholder="Name *" aria-label="Name (required)" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              <select className="fs" aria-label="Relationship" value={form.relationship} onChange={(e) => setForm((f) => ({ ...f, relationship: e.target.value as NetworkRelationship }))}>
                {NETWORK_RELATIONSHIPS.map((r) => <option key={r} value={r}>{r.replace('_', ' ')}</option>)}
              </select>
              <input className="fi" placeholder="Company" aria-label="Company" value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
              <input className="fi" placeholder="University" aria-label="University" value={form.university} onChange={(e) => setForm((f) => ({ ...f, university: e.target.value }))} />
              <input className="fi" placeholder="Event" aria-label="Event" value={form.event_name} onChange={(e) => setForm((f) => ({ ...f, event_name: e.target.value }))} />
              <input className="fi" placeholder="Email" aria-label="Email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
              <input className="fi" placeholder="LinkedIn URL" aria-label="LinkedIn URL" value={form.linkedin_url} onChange={(e) => setForm((f) => ({ ...f, linkedin_url: e.target.value }))} />
              <input className="fi" type="datetime-local" aria-label="Follow up on" value={form.follow_up_at} onChange={(e) => setForm((f) => ({ ...f, follow_up_at: e.target.value }))} />
            </div>
            <textarea className="fi" style={{ minHeight: 80, marginTop: 10 }} placeholder="Notes" aria-label="Notes" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <button className="btn btn-sm" onClick={() => void save()}>Save</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setEditOpen(false)}>Cancel</button>
            </div>
        </ModalShell>
      )}

      {detail && (
        <ModalShell label={`Contact — ${detail.name}`} onClose={() => setDetail(null)} wide>
            <h3>{detail.name}</h3>
            {detail.notes && <p className="note" style={{ marginTop: 8 }}>{detail.notes}</p>}
            <div className="panel-eyebrow" style={{ marginTop: 16 }}>Log a conversation</div>
            <textarea className="fi" style={{ minHeight: 60, marginTop: 8 }} placeholder="What did you discuss?" aria-label="What did you discuss?" value={logBody} onChange={(e) => setLogBody(e.target.value)} />
            <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => void logNow()}>Log</button>
            <div className="panel-eyebrow" style={{ marginTop: 16 }}>History</div>
            {interactions.map((i) => (
              <div className="act-row" key={i.id}>
                <span style={{ flex: 1 }}>{i.body}</span>
                <span className="note">{formatDate(i.occurred_at)}</span>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => setDetail(null)}>Close</button>
        </ModalShell>
      )}

      <ToolFoot><b>Networking CRM</b> · every relationship, tracked</ToolFoot>
    </div>
  );
}
