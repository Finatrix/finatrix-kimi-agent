/**
 * Offer Management + AI Offer Analysis (Phase 3, Modules 12/13) — track every
 * offer's full comp package, compare them side-by-side, and get an AI read
 * on market fit, pros/cons, negotiation angles and long-term value.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { AmountInput } from '../../tools/ui/AmountInput';
import { evaluateFormula } from '../../tools/lib/formula';
import { ErrorCard, PageLoading } from '../components/states';
import { Empty } from '../ui/primitives';
import '../ui/forms.css';
import { useCareers } from '../context/CareersContext';
import { analyzeOffer, deleteOffer, listOffers, setOfferStatus, upsertOffer } from '../services/offers';
import type { ResumeVersionRow, ResumeWithVersions } from '../types';
import type { OfferRow, OfferStatus } from '../types/phase3';
import { toCareersError, type CareersError } from '../utils/errors';
import { formatDate, scoreColor } from '../utils/format';

function completeVersions(resumes: ResumeWithVersions[]): { label: string; version: ResumeVersionRow }[] {
  return resumes.flatMap((r) => r.versions.filter((v) => v.status === 'complete' && v.parsed).map((v) => ({ label: `${r.name}, version ${v.version_number}`, version: v })));
}

/**
 * Parse a money field that may hold arithmetic. Returns null for empty or
 * unparseable input, matching the previous `x ? Number(x) : null` behaviour
 * for every plain number.
 */
function money(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const parsed = evaluateFormula(t);
  return parsed.ok ? parsed.value : null;
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
        // evaluateFormula, not Number(): the amount fields accept arithmetic,
        // and Number('95000*1.1') is NaN. A plain "95000" parses identically.
        base_salary: money(form.base_salary),
        bonus: money(form.bonus),
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
    <div className="cxf-stack">
      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      <section className="cx-panel" aria-labelledby="of-new">
        <div className="cx-panel-head"><h2 id="of-new">New offer</h2></div>
        <div className="cxf-form cxf-form-3">
          <div className="fg">
            <label className="fl" htmlFor="of-company">Company (required)</label>
            <input id="of-company" className="fi" value={form.company_name} onChange={(e) => setForm((f) => ({ ...f, company_name: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="of-title">Job title (required)</label>
            <input id="of-title" className="fi" value={form.job_title} onChange={(e) => setForm((f) => ({ ...f, job_title: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="of-currency">Currency</label>
            <input id="of-currency" className="fi" value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))} />
          </div>
          {/* Money is never `type="number"` (see MoneyField): the browser blanks
              the field on the first decimal point, so "12.5" could not be
              typed. AmountInput is text + a decimal keypad, and accepts
              arithmetic — "95000*1.1" is a normal way to state a counter. */}
          <div className="fg">
            <label className="fl" htmlFor="offer-base">Base salary per year</label>
            <AmountInput
              id="offer-base" className="fi" sym={form.currency || '₹'}
              placeholder="Base salary per year" ariaLabel="Base salary per year"
              value={form.base_salary} onChange={(v) => setForm((f) => ({ ...f, base_salary: v }))}
            />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="offer-bonus">Bonus</label>
            <AmountInput
              id="offer-bonus" className="fi" sym={form.currency || '₹'}
              placeholder="Bonus" ariaLabel="Bonus"
              value={form.bonus} onChange={(v) => setForm((f) => ({ ...f, bonus: v }))}
            />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="of-equity">Equity</label>
            <input id="of-equity" className="fi" value={form.equity} onChange={(e) => setForm((f) => ({ ...f, equity: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="of-mode">Work mode: onsite, hybrid or remote</label>
            <input id="of-mode" className="fi" value={form.work_mode} onChange={(e) => setForm((f) => ({ ...f, work_mode: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="of-visa">Visa sponsorship</label>
            <input id="of-visa" className="fi" value={form.visa_sponsorship} onChange={(e) => setForm((f) => ({ ...f, visa_sponsorship: e.target.value }))} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="of-notice">Notice period</label>
            <input id="of-notice" className="fi" value={form.notice_period} onChange={(e) => setForm((f) => ({ ...f, notice_period: e.target.value }))} />
          </div>
        </div>
        <div className="cxf-actions">
          <button type="button" className="cx-btn cx-btn-primary" disabled={saving} onClick={() => void add()}>Add offer</button>
        </div>
      </section>

      <div className="cxf-toolbar">
        <label className="fl" style={{ marginBottom: 0 }} htmlFor="offers-version">Analyse against</label>
        <select id="offers-version" className="fs" value={version?.id ?? ''} onChange={(e) => setVersionId(e.target.value)}>
          {versions.length ? versions.map((v) => <option key={v.version.id} value={v.version.id}>{v.label}</option>) : <option value="">No analysed resume</option>}
        </select>
      </div>

      {compared.length >= 2 && (
        <section className="cx-panel" style={{ overflowX: 'auto' }} aria-labelledby="of-compare">
          <div className="cx-panel-head"><h2 id="of-compare">Comparison</h2></div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
            <thead>
              <tr>
                <th scope="col" style={{ textAlign: 'left', padding: 8 }}><span className="cx-muted">Term</span></th>
                {compared.map((o) => <th scope="col" key={o.id} style={{ textAlign: 'left', padding: 8 }}>{o.company_name}</th>)}
              </tr>
            </thead>
            <tbody>
              {([
                ['base_salary', 'Base salary'], ['bonus', 'Bonus'], ['equity', 'Equity'],
                ['visa_sponsorship', 'Visa sponsorship'], ['work_mode', 'Work mode'], ['notice_period', 'Notice period'],
              ] as const).map(([field, label]) => (
                <tr key={field}>
                  <th scope="row" style={{ textAlign: 'left', padding: 8, fontWeight: 500, borderTop: '1px solid var(--hair2)' }} className="cx-muted">{label}</th>
                  {compared.map((o) => <td key={o.id} className="cx-num" style={{ padding: 8, borderTop: '1px solid var(--hair2)' }}>{String(o[field] ?? '—')}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {!offers.length ? (
        <div className="cx-panel"><Empty title="No offers yet">Add an offer above to keep its terms in one place and compare it with others.</Empty></div>
      ) : (
        <section className="cx-panel" aria-label="Offers">
          <ul className="cx-list">
            {offers.map((o) => (
              <li key={o.id}>
                <div className="cx-row" style={{ flexWrap: 'wrap' }}>
                  <input type="checkbox" style={{ width: 20, height: 20, flex: 'none' }} checked={compareIds.includes(o.id)}
                    aria-label={`Compare offer: ${o.job_title} at ${o.company_name}`}
                    onChange={(e) => setCompareIds((ids) => e.target.checked ? [...ids, o.id] : ids.filter((x) => x !== o.id))} />
                  <div className="cx-row-main">
                    <p className="cx-row-title wrap">{o.job_title} at {o.company_name}</p>
                    <p className="cx-row-meta">
                      <span className="cx-chip cx-chip-accent">{o.status}</span>
                      {o.base_salary != null && <span className="cx-num">{o.currency} {o.base_salary.toLocaleString()}{o.bonus ? `, plus ${o.bonus.toLocaleString()} bonus` : ''}</span>}
                      {o.equity && <span>{o.equity} equity</span>}
                      <span>Received {formatDate(o.received_at)}</span>
                    </p>
                  </div>
                  <div className="cx-row-actions">
                    <select className="fs" aria-label={`Status of offer: ${o.job_title} at ${o.company_name}`} value={o.status} onChange={(e) => { if (user) void setOfferStatus(user.id, o.id, e.target.value as OfferStatus).then(load); }}>
                      {(['received', 'negotiating', 'accepted', 'declined', 'expired'] as OfferStatus[]).map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    {!o.ai_analysis && (
                      <button type="button" className="cx-btn cx-btn-sm" disabled={!!analyzing} onClick={() => void runAnalysis(o)}>
                        {analyzing === o.id ? 'Analysing' : 'Analyse with AI'}
                      </button>
                    )}
                    <button type="button" className="cx-icon-btn" aria-label={`Delete offer ${o.job_title}`} onClick={() => { if (user) void deleteOffer(user.id, o.id).then(load); }}>✕</button>
                  </div>

                  {o.ai_analysis && (
                    <div className="cx-notice" style={{ flexBasis: '100%', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, width: '100%' }}>
                        <strong>AI recommendation</strong>
                        <span className="cx-num" style={{ color: scoreColor(o.ai_analysis.score) }}>{o.ai_analysis.score}/100</span>
                      </div>
                      <p className="cx-sub">{o.ai_analysis.recommendation}</p>
                      <div className="cx-grid cx-grid-2" style={{ width: '100%' }}>
                        <div>
                          <strong>Pros</strong>
                          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{o.ai_analysis.pros.map((p, i) => <li key={i}>{p}</li>)}</ul>
                        </div>
                        <div>
                          <strong>Cons</strong>
                          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{o.ai_analysis.cons.map((c, i) => <li key={i}>{c}</li>)}</ul>
                        </div>
                      </div>
                      {o.ai_analysis.negotiationSuggestions.length > 0 && (
                        <div>
                          <strong>Negotiation suggestions</strong>
                          <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>{o.ai_analysis.negotiationSuggestions.map((s, i) => <li key={i}>{s}</li>)}</ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
