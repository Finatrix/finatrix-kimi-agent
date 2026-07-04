/**
 * AI Knowledge Base (Phase 3, Module 19) — STAR stories, achievements,
 * leadership moments, failures and successes, searchable and reused by the
 * interview simulator's STAR builder.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { EmptyState, ErrorCard } from '../components/states';
import { useCareers } from '../context/CareersContext';
import { deleteKnowledgeItem, listKnowledgeItems, searchKnowledge, upsertKnowledgeItem } from '../services/knowledge';
import { KNOWLEDGE_KINDS, type KnowledgeItemRow, type KnowledgeKind } from '../types/phase3';
import { toCareersError, type CareersError } from '../utils/errors';

const EMPTY_FORM = { title: '', kind: 'star_story' as KnowledgeKind, body: '', tags: '' };

export default function KnowledgeBasePage() {
  const { user } = useAuth();
  const { loading, error: ctxError, refresh } = useCareers();
  const { notify } = useToast();

  const [items, setItems] = useState<KnowledgeItemRow[]>([]);
  const [loadError, setLoadError] = useState<CareersError | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try { setItems(await listKnowledgeItems(user.id)); setLoadError(null); } catch (e) { setLoadError(toCareersError(e)); }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => searchKnowledge(items, search), [items, search]);

  const add = async () => {
    if (!user || !form.title.trim() || !form.body.trim()) { notify('Give it a title and some content.', 'error'); return; }
    setSaving(true);
    try {
      await upsertKnowledgeItem(user.id, {
        title: form.title, kind: form.kind, body: form.body,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
      });
      setForm(EMPTY_FORM);
      await load();
    } catch (e) { notify(toCareersError(e).message, 'error'); } finally { setSaving(false); }
  };

  if (loading) return <div style={{ minHeight: '50vh' }} aria-busy="true" />;

  return (
    <div className="fx-page">
      <PageHead chip="Knowledge Base" chipColor="#D4AF37" chipBg="rgba(212,175,55,.12)" icon="lifemap" title="Every story, ready to reuse">
        STAR stories, achievements, leadership moments and lessons learned — searchable, and fed
        into your interview prep so answers draw on your real experience.
      </PageHead>

      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      <div className="card">
        <div className="panel-eyebrow" style={{ marginBottom: 12 }}>Add an item</div>
        <div className="grid2" style={{ marginBottom: 10 }}>
          <input className="fi" placeholder="Title *" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          <select className="fs" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as KnowledgeKind }))}>
            {KNOWLEDGE_KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
          </select>
        </div>
        <textarea className="fi" style={{ minHeight: 100, marginBottom: 10 }} placeholder="What happened — situation, action, result…" value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
        <input className="fi" style={{ marginBottom: 10 }} placeholder="Tags (comma separated)" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
        <button className={`btn ${saving ? 'btn-loading' : ''}`} disabled={saving} onClick={() => void add()}>Save</button>
      </div>

      <input className="fi" style={{ maxWidth: 320, marginBottom: 10 }} placeholder="Search your knowledge base…" value={search} onChange={(e) => setSearch(e.target.value)} />

      {!visible.length ? (
        <div className="card"><EmptyState icon="lifemap" title="Nothing saved yet">Add your first STAR story or achievement.</EmptyState></div>
      ) : (
        visible.map((i) => (
          <div className="card" key={i.id} style={{ padding: 14, marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{i.title}</b>
                <div className="job-meta">
                  <span className="badge badge-mute">{i.kind.replace('_', ' ')}</span>
                  {i.tags.map((t) => <span key={t} className="badge badge-blue">{t}</span>)}
                </div>
                <p className="note" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{i.body}</p>
              </div>
              <button className="icon-btn danger" aria-label={`Delete ${i.title}`} onClick={() => { if (user) void deleteKnowledgeItem(user.id, i.id).then(load); }}>✕</button>
            </div>
          </div>
        ))
      )}

      <ToolFoot><b>Knowledge Base</b> · your real stories, always available for interview prep</ToolFoot>
    </div>
  );
}
