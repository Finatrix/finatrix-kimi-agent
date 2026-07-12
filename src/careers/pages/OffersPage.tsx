/**
 * Offer Management + AI Offer Analysis (Phase 3, Modules 12/13) — track every
 * offer's full comp package, compare them side-by-side, and get an AI read
 * on market fit, pros/cons, negotiation angles and long-term value.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { EmptyState, ErrorCard, PageLoading } from '../components/states';
import { useCareers } from '../context/CareersContext';
import { analyzeOffer, deleteOffer, listOffers, setOfferStatus, upsertOffer } from '../services/offers';
import type { ResumeVersionRow, ResumeWithVersions } from '../types';
import type { OfferRow, OfferStatus } from '../types/phase3';
import { toCareersError, type CareersError } from '../utils/errors';
import { formatDate, scoreColor } from '../utils/format';

function completeVersions(resumes: ResumeWithVersions[]): { label: string; version: ResumeVersionRow }[] {
  return resumes.flatMap((r) => r.versions.filter((v) => v.status === 'complete' && v.parsed).map((v) => ({ label: `${r.name} · v${v.version_number}`, version: v })));
}

const EMPTY_FORM = {
  company_name: '', job_title: '', base_salary: '', bonus: '', equity: '', currency: 'INR',
  visa_sponsorship: '', relocation: '', work_mode: '', notice_period: '',
};

export default function OffersPage() {
  const { user } = useAuth();
  const { loading, error: ctxError, resumes, refresh } = useCareers();
  const { notify } = useToast();

  const versions = useMemo(() => completeVersions(resumes), [resumes]);
  const [versionId, setVersionId] = useState('');
  const version = versions.find((v) => v.version.id === versionId)?.version ?? versions[0]?.version ?? null;

  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loadError, setLoadError] = useState<CareersError | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState('');

  const load = useCallback(async () => {
    if (!user) return;
    try { setOffers(await listOffers(user.id)); setLoadError(null); } catch (e) { setLoadError(toCareersError(e)); }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!user || !form.company_name.trim() || !form.job_title.trim()) {
      notify('Company and job title are required.', 'error');
      return;
    }
    setSaving(true);
    try {
      await upsertOffer(user.id, {
        ...form,
        base_salary: form.base_salary ? Number(form.base_salary) : null,
        bonus: form.bonus ? Number(form.bonus) : null,
      });
      setForm(EMPTY_FORM);
      await load();
    } catch (e) { notify(toCareersError(e).message, 'error'); } finally { setSaving(false); }
  };

  const runAnalysis = async (o: OfferRow) => {
    if (!user || !version) { notify('Pick an analysed resume version first.', 'error'); return; }
    setAnalyzing(o.id);
    try {
      await analyzeOffer(user.id, o, version);
      await load();
      notify('Offer analysed.', 'ok');
    } catch (e) { notify(toCareersError(e).message, 'error'); } finally { setAnalyzing(''); }
  };

  const compared = offers.filter((o) => compareIds.includes(o.id));

  if (loading) return <PageLoading />;

  return (
    <div className="fx-page">
      <PageHead chip="Offer Management" chipColor="#D4AF37" chipBg="rgba(212,175,55,.12)" icon="goal" title="Compare every offer">
        Full comp package, side-by-side comparison, and an AI read on market fit and negotiation angles.
      </PageHead>

      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      <div className="lib-toolbar" style={{ justifyContent: 'flex-start', gap: 10 }}>
        <label className="fl" style={{ marginBottom: 0 }} htmlFor="offers-version">Analyse against</label>
        <select id="offers-version" className="fs" style={{ width: 'auto' }} value={version?.id ?? ''} onChange={(e) => setVersionId(e.target.value)}>
          {versions.length ? versions.map((v) => <option key={v.version.id} value={v.version.id}>{v.label}</option>) : <option value="">No analysed resume</option>}
        </select>
      </div>

      <div className="card">
        <div className="panel-eyebrow" style={{ marginBottom: 12 }}>New offer</div>
        <div className="grid3" style={{ marginBottom: 10 }}>
          <input className="fi" placeholder="Company *" value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
          <input className="fi" placeholder="Job title *" value={form.job_title} onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))} />
          <input className="fi" type="number" placeholder="Base salary / yr" value={form.base_salary} onChange={(e) => setForm((f) => ({ ...f, base_salary: e.target.value }))} />
        </div>
        <div className="grid3" style={{ marginBottom: 10 }}>
          <input className="fi" type="number" placeholder="Bonus" value={form.bonus} onChange={(e) => setForm((f) => ({ ...f, bonus: e.target.value }))} />
          <input className="fi" placeholder="Equity" value={form.equity} onChange={(e) => setForm((f) => ({ ...f, equity: e.target.value }))} />
          <input className="fi" placeholder="Currency" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
        </div>
        <div className="grid3" style={{ marginBottom: 14 }}>
          <input className="fi" placeholder="Work mode (onsite/hybrid/remote)" value={form.work_mode} onChange={(e) => setForm((f) => ({ ...f, work_mode: e.target.value }))} />
          <input className="fi" placeholder="Visa sponsorship" value={form.visa_sponsorship} onChange={(e) => setForm((f) => ({ ...f, visa_sponsorship: e.target.value }))} />
          <input className="fi" placeholder="Notice period" value={form.notice_period} onChange={(e) => setForm((f) => ({ ...f, notice_period: e.target.value }))} />
        </div>
        <button className={`btn ${saving ? 'btn-loading' : ''}`} disabled={saving} onClick={() => void add()}>Add offer</button>
      </div>

      {compared.length >= 2 && (
        <div className="card" style={{ overflowX: 'auto' }}>
          <div className="panel-eyebrow" style={{ marginBottom: 10 }}>Comparison</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{compared.map((o) => <th key={o.id} style={{ textAlign: 'left', padding: 6 }}>{o.company_name}</th>)}</tr></thead>
            <tbody>
              {(['base_salary', 'bonus', 'equity', 'visa_sponsorship', 'work_mode', 'notice_period'] as const).map((field) => (
                <tr key={field}>
                  {compared.map((o) => <td key={o.id} style={{ padding: 6, borderTop: '1px solid var(--hair2)' }}>{String(o[field] ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!offers.length ? (
        <div className="card"><EmptyState icon="goal" title="No offers yet" /></div>
      ) : (
        offers.map((o) => (
          <div className="card" key={o.id} style={{ padding: 16, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <input type="checkbox" style={{ marginTop: 4 }} checked={compareIds.includes(o.id)}
                onChange={(e) => setCompareIds((ids) => e.target.checked ? [...ids, o.id] : ids.filter((x) => x !== o.id))} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>{o.job_title}</b> — {o.company_name}
                <div className="job-meta">
                  {o.base_salary != null && <span>{o.currency} {o.base_salary.toLocaleString()}{o.bonus ? ` + ${o.bonus.toLocaleString()} bonus` : ''}</span>}
                  {o.equity && <span>{o.equity} equity</span>}
                  <span className="badge badge-blue">{o.status}</span>
                  <span>Received {formatDate(o.received_at)}</span>
                </div>
              </div>
              <select className="fs" style={{ width: 'auto' }} value={o.status} onChange={(e) => { if (user) void setOfferStatus(user.id, o.id, e.target.value as OfferStatus).then(load); }}>
                {(['received', 'negotiating', 'accepted', 'declined', 'expired'] as OfferStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <button className="icon-btn danger" aria-label={`Delete offer ${o.job_title}`} onClick={() => { if (user) void deleteOffer(user.id, o.id).then(load); }}>✕</button>
            </div>

            {o.ai_analysis ? (
              <div className="tip tip-info" style={{ marginTop: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <b>AI recommendation</b>
                  <span style={{ color: scoreColor(o.ai_analysis.score) }}>{o.ai_analysis.score}/100</span>
                </div>
                <p>{o.ai_analysis.recommendation}</p>
                <div className="grid2" style={{ marginTop: 8 }}>
                  <div>
                    <b style={{ fontSize: 12 }}>Pros</b>
                    {o.ai_analysis.pros.map((p, i) => <div key={i}>· {p}</div>)}
                  </div>
                  <div>
                    <b style={{ fontSize: 12 }}>Cons</b>
                    {o.ai_analysis.cons.map((c, i) => <div key={i}>· {c}</div>)}
                  </div>
                </div>
                {o.ai_analysis.negotiationSuggestions.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <b style={{ fontSize: 12 }}>Negotiation suggestions</b>
                    {o.ai_analysis.negotiationSuggestions.map((s, i) => <div key={i}>· {s}</div>)}
                  </div>
                )}
              </div>
            ) : (
              <button className={`btn btn-ghost btn-sm ${analyzing === o.id ? 'btn-loading' : ''}`} style={{ marginTop: 12 }} disabled={!!analyzing} onClick={() => void runAnalysis(o)}>
                Analyse with AI
              </button>
            )}
          </div>
        ))
      )}

      <ToolFoot><b>Offer Management</b> · AI analysis grounds every recommendation in your actual offer data</ToolFoot>
    </div>
  );
}
