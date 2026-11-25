/**
 * Story bank (Phase 3, Module 19) — STAR stories, achievements,
 * leadership moments, failures and successes, searchable and reused by the
 * interview simulator's STAR builder.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { ErrorCard, PageLoading } from '../components/states';
import { Empty } from '../ui/primitives';
import '../ui/forms.css';
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

  if (loading) return <PageLoading />;

  return (
    <div className="cxf-stack">
      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      <section className="cx-panel" aria-labelledby="kb-new">
        <div className="cx-panel-head"><h2 id="kb-new">Add a story</h2></div>
        <p className="cx-sub" style={{ marginBottom: 14 }}>
          Stories, achievements and lessons you save here are used when you practise, so your answers draw on your real experience.
        </p>
        <div className="cxf-form">
          <div className="fg">
            <label className="fl" htmlFor="kb-title">Title (required)</label>
            <input id="kb-title" className="fi" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="kb-kind">Type</label>
            <select id="kb-kind" className="fs" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as KnowledgeKind }))}>
              {KNOWLEDGE_KINDS.map((k) => <option key={k} value={k}>{k.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div className="fg cxf-wide">
            <label className="fl" htmlFor="kb-body">What happened: situation, action, result</label>
            <textarea id="kb-body" className="fi" style={{ minHeight: 100 }} value={form.body} onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))} />
          </div>
          <div className="fg cxf-wide">
            <label className="fl" htmlFor="kb-tags">Tags, separated by commas</label>
            <input id="kb-tags" className="fi" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} />
          </div>
        </div>
        <div className="cxf-actions">
          <button type="button" className="cx-btn cx-btn-primary" disabled={saving} onClick={() => void add()}>Save story</button>
        </div>
      </section>

      <div className="cxf-toolbar">
        <input className="fi cxf-grow" type="search" placeholder="Search your stories" aria-label="Search your stories" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {!visible.length ? (
        <div className="cx-panel"><Empty title="Nothing saved yet">Add your first STAR story or achievement above.</Empty></div>
      ) : (
        <section className="cx-panel" aria-label="Saved stories">
          <ul className="cx-list">
            {visible.map((i) => (
              <li key={i.id}>
                <div className="cx-row" style={{ alignItems: 'flex-start' }}>
                  <div className="cx-row-main">
                    <p className="cx-row-title wrap">{i.title}</p>
                    <p className="cx-row-meta">
                      <span className="cx-chip">{i.kind.replace('_', ' ')}</span>
                      {i.tags.map((t) => <span key={t} className="cx-chip">{t}</span>)}
                    </p>
                    <p className="cx-sub" style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{i.body}</p>
                  </div>
                  <button type="button" className="cx-icon-btn" aria-label={`Delete ${i.title}`} onClick={() => { if (user) void deleteKnowledgeItem(user.id, i.id).then(load); }}>✕</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
