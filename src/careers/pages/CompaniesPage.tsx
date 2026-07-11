/**
 * Companies — the user's company intelligence base: searchable records, AI
 * insight summaries (cached), recruiter contacts, and side-by-side company
 * comparison.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { CAREERS_ROUTES } from '../constants';
import { useToast } from '../../tools/ui/Toast';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { ConfirmDialog, EmptyState, ErrorCard } from '../components/states';
import { useCareers } from '../context/CareersContext';
import {
  deleteCompany,
  deleteContact,
  generateCompanyInsights,
  listCompanies,
  listContacts,
  upsertCompany,
  upsertContact,
} from '../services/companies';
import { contactsTable, companiesTable, exportCsv, exportExcel } from '../services/exports';
import type { CompanyContactRow, CompanyRow } from '../types/jobs';
import { toCareersError, type CareersError } from '../utils/errors';
import { formatDate } from '../utils/format';

const EMPTY_FORM = {
  name: '', industry: '', headquarters: '', company_size: '', website: '',
  linkedin_url: '', funding_stage: '', notes: '',
};

const COMPARE_FIELDS: { key: keyof NonNullable<CompanyRow['ai_summary']>; label: string }[] = [
  { key: 'culture', label: 'Culture' },
  { key: 'careerGrowth', label: 'Career growth' },
  { key: 'learningOpportunities', label: 'Learning' },
  { key: 'workLifeBalance', label: 'Work-life balance' },
  { key: 'interviewDifficulty', label: 'Interview difficulty' },
  { key: 'growthPotential', label: 'Growth potential' },
  { key: 'financialHealth', label: 'Stability' },
];

export default function CompaniesPage() {
  const { user } = useAuth();
  const { loading, error: ctxError, settings, refresh } = useCareers();
  const { notify } = useToast();

  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [contacts, setContacts] = useState<CompanyContactRow[]>([]);
  const [loadError, setLoadError] = useState<CareersError | null>(null);
  const [search, setSearch] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<typeof EMPTY_FORM & { id?: string }>({ ...EMPTY_FORM });
  const [detail, setDetail] = useState<CompanyRow | null>(null);
  const [insightBusy, setInsightBusy] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CompanyRow | null>(null);
  const [contactForm, setContactForm] = useState({ name: '', position: '', email: '', linkedin: '' });

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const [c, k] = await Promise.all([listCompanies(user.id), listContacts(user.id)]);
      setCompanies(c);
      setContacts(k);
      setLoadError(null);
    } catch (e) {
      setLoadError(toCareersError(e));
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter((c) =>
      [c.name, c.industry, c.headquarters, c.notes, c.preferred_skills.join(' ')].join(' ').toLowerCase().includes(q)
    );
  }, [companies, search]);

  const save = async () => {
    if (!user) return;
    try {
      await upsertCompany(user.id, form as Partial<CompanyRow> & { name: string });
      setEditOpen(false);
      setForm({ ...EMPTY_FORM });
      await load();
      notify('Company saved.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  const runInsights = async (company: CompanyRow) => {
    if (!user) return;
    setInsightBusy(true);
    try {
      const insights = await generateCompanyInsights(user.id, company, '', settings.model);
      setDetail({ ...company, ai_summary: insights });
      await load();
      notify('Company insights generated.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    } finally {
      setInsightBusy(false);
    }
  };

  const addContact = async (companyId: string | null) => {
    if (!user || !contactForm.name.trim()) {
      notify('Contact name is required.', 'error');
      return;
    }
    try {
      await upsertContact(user.id, {
        name: contactForm.name.trim(),
        position: contactForm.position.trim(),
        email: contactForm.email.trim(),
        linkedin_url: contactForm.linkedin.trim(),
        company_id: companyId,
      });
      setContactForm({ name: '', position: '', email: '', linkedin: '' });
      await load();
      notify('Contact saved.', 'ok');
    } catch (e) {
      notify(toCareersError(e).message, 'error');
    }
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= 3 ? prev : [...prev, id]
    );
  };

  const compareRows = companies.filter((c) => compareIds.includes(c.id));

  if (loading) return <div style={{ minHeight: '50vh' }} aria-busy="true" />;

  return (
    <div className="fx-page">
      <PageHead
        chip="Company Intelligence"
        chipColor="#D4AF37"
        chipBg="rgba(212,175,55,.12)"
        icon="bank"
        title="Know who you're applying to"
      >
        Build your own intelligence base on target companies — culture, growth,
        recruiters — and compare them side by side before you commit.
      </PageHead>

      {(ctxError || loadError) && <ErrorCard error={(ctxError ?? loadError)!} onRetry={() => { void refresh(); void load(); }} />}

      <div className="lib-toolbar">
        <input className="fi" type="search" placeholder="Search companies…" aria-label="Search companies" value={search} onChange={(e) => setSearch(e.target.value)} />
        <button className="btn btn-sm" style={{ width: 'auto' }} onClick={() => { setForm({ ...EMPTY_FORM }); setEditOpen(true); }}>+ Add company</button>
        <Link className="btn btn-ghost btn-sm" style={{ width: 'auto', textDecoration: 'none' }} to={CAREERS_ROUTES.intelligence}>
          Search intelligence base ↗
        </Link>
        {compareIds.length >= 2 && (
          <button className="btn btn-ghost btn-sm" onClick={() => setCompareOpen(true)}>Compare ({compareIds.length})</button>
        )}
        <span style={{ flex: 1 }} />
        <button className="btn btn-ghost btn-sm" onClick={() => exportCsv(companiesTable(visible))}>CSV</button>
        <button className="btn btn-ghost btn-sm" onClick={() => void exportExcel(contactsTable(contacts)).then(() => notify('Contacts exported.', 'ok'), (e) => notify(toCareersError(e).message, 'error'))}>
          Contacts Excel
        </button>
      </div>

      {!visible.length ? (
        <div className="card">
          <EmptyState icon="bank" title={companies.length ? 'Nothing matches your search' : 'No companies yet'}>
            {companies.length ? 'Try different keywords.' : 'Add the companies you are targeting — insights, recruiters and comparisons live here.'}
          </EmptyState>
        </div>
      ) : (
        <div className="lib-grid">
          {visible.map((c) => (
            <div className="card" key={c.id} style={{ marginBottom: 0 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 650 }}>{c.name}</div>
                  <div className="job-meta">
                    {c.industry && <span>{c.industry}</span>}
                    {c.headquarters && <span>{c.headquarters}</span>}
                    {c.company_size && <span>{c.company_size}</span>}
                    {c.glassdoor_rating != null && <span>★ {c.glassdoor_rating} Glassdoor</span>}
                    {c.ambitionbox_rating != null && <span>★ {c.ambitionbox_rating} AmbitionBox</span>}
                  </div>
                </div>
                <label className="note" style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                  <input type="checkbox" checked={compareIds.includes(c.id)} onChange={() => toggleCompare(c.id)} aria-label={`Compare ${c.name}`} />
                  compare
                </label>
              </div>
              {c.ai_summary?.overview && (
                <p style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.55, margin: '10px 0 0' }}>
                  {c.ai_summary.overview.slice(0, 180)}{c.ai_summary.overview.length > 180 ? '…' : ''}
                </p>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
                <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => setDetail(c)}>Open</button>
                <button
                  className="icon-btn" title="Edit" aria-label={`Edit ${c.name}`}
                  onClick={() => {
                    setForm({
                      id: c.id, name: c.name, industry: c.industry, headquarters: c.headquarters,
                      company_size: c.company_size, website: c.website, linkedin_url: c.linkedin_url,
                      funding_stage: c.funding_stage, notes: c.notes,
                    });
                    setEditOpen(true);
                  }}
                >✎</button>
                <button className="icon-btn danger" aria-label={`Delete ${c.name}`} onClick={() => setDeleteTarget(c)}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / edit modal */}
      {editOpen && (
        <div className="fx-modal-wrap" role="dialog" aria-modal="true" aria-label="Company details">
          <div className="fx-modal-back" onClick={() => setEditOpen(false)} />
          <div className="fx-modal">
            <h3>{form.id ? 'Edit company' : 'Add company'}</h3>
            {([
              ['name', 'Name *'], ['industry', 'Industry'], ['headquarters', 'Headquarters'],
              ['company_size', 'Company size'], ['website', 'Website'], ['linkedin_url', 'LinkedIn'],
              ['funding_stage', 'Funding stage'],
            ] as const).map(([key, label]) => (
              <div className="fg" key={key} style={{ marginBottom: 10 }}>
                <label className="fl" htmlFor={`co-${key}`}>{label}</label>
                <input id={`co-${key}`} className="fi" value={form[key]} onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="fg">
              <label className="fl" htmlFor="co-notes">Notes</label>
              <textarea id="co-notes" className="fi" style={{ minHeight: 70, resize: 'vertical' }} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => setEditOpen(false)}>Cancel</button>
              <button className="btn btn-sm" style={{ flex: 1 }} onClick={() => void save()}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detail && (
        <div className="fx-modal-wrap" role="dialog" aria-modal="true" aria-label={`Company — ${detail.name}`}>
          <div className="fx-modal-back" onClick={() => setDetail(null)} />
          <div className="fx-modal wide">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ flex: 1, marginBottom: 0 }}>{detail.name}</h3>
              <button className="icon-btn" aria-label="Close" onClick={() => setDetail(null)}>✕</button>
            </div>
            <div className="job-meta" style={{ marginBottom: 14 }}>
              {detail.industry && <span>{detail.industry}</span>}
              {detail.website && <a href={detail.website} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>Website ↗</a>}
              {detail.linkedin_url && <a href={detail.linkedin_url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--gold)' }}>LinkedIn ↗</a>}
              <span>Added {formatDate(detail.created_at)}</span>
            </div>

            {detail.ai_summary ? (
              <>
                <div className="tip tip-info"><b>Overview</b>{detail.ai_summary.overview}</div>
                <div className="grid2" style={{ marginTop: 10 }}>
                  {COMPARE_FIELDS.map(({ key, label }) => {
                    const value = detail.ai_summary![key];
                    if (!value || Array.isArray(value)) return null;
                    return (
                      <div className="row-line" key={key} style={{ fontSize: 13 }}>
                        <span style={{ flex: '0 0 150px', color: 'var(--ink2)' }}>{label}</span>
                        <span style={{ flex: 1 }}>{value}</span>
                      </div>
                    );
                  })}
                </div>
                {detail.ai_summary.technologyStack.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    {detail.ai_summary.technologyStack.map((t) => <span className="tag" key={t}>{t}</span>)}
                  </div>
                )}
              </>
            ) : (
              <button className={`btn btn-sm ${insightBusy ? 'btn-loading' : ''}`} disabled={insightBusy} onClick={() => void runInsights(detail)}>
                {insightBusy ? 'Researching…' : 'Generate AI insights'}
              </button>
            )}

            <div className="panel-eyebrow" style={{ margin: '18px 0 8px' }}>Recruiters &amp; contacts</div>
            {contacts.filter((k) => k.company_id === detail.id).map((k) => (
              <div className="act-row" key={k.id}>
                <div style={{ flex: 1 }}>
                  <b>{k.name}</b>{k.position ? ` · ${k.position}` : ''}
                  <div style={{ fontSize: 12, color: 'var(--ink3)' }}>
                    {[k.email, k.linkedin_url].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <button className="icon-btn danger" aria-label={`Delete contact ${k.name}`} onClick={() => { if (user) void deleteContact(user.id, k.id).then(load); }}>✕</button>
              </div>
            ))}
            <div className="grid2" style={{ gap: 8, marginTop: 8 }}>
              <input className="fi" style={{ padding: '10px 13px' }} placeholder="Name" aria-label="Contact name" value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} />
              <input className="fi" style={{ padding: '10px 13px' }} placeholder="Position" aria-label="Contact position" value={contactForm.position} onChange={(e) => setContactForm((f) => ({ ...f, position: e.target.value }))} />
              <input className="fi" style={{ padding: '10px 13px' }} placeholder="Email" aria-label="Contact email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} />
              <button className="btn btn-ghost btn-sm" onClick={() => void addContact(detail.id)}>Add contact</button>
            </div>
          </div>
        </div>
      )}

      {/* Compare modal */}
      {compareOpen && compareRows.length >= 2 && (
        <div className="fx-modal-wrap" role="dialog" aria-modal="true" aria-label="Compare companies">
          <div className="fx-modal-back" onClick={() => setCompareOpen(false)} />
          <div className="fx-modal wide">
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <h3 style={{ flex: 1, marginBottom: 0 }}>Company comparison</h3>
              <button className="icon-btn" aria-label="Close" onClick={() => setCompareOpen(false)}>✕</button>
            </div>
            <table className="cmp" style={{ marginTop: 14 }}>
              <tbody>
                <tr>
                  <td style={{ color: 'var(--ink2)' }}>Company</td>
                  {compareRows.map((c) => <td key={c.id}><b>{c.name}</b></td>)}
                </tr>
                <tr>
                  <td style={{ color: 'var(--ink2)' }}>Ratings</td>
                  {compareRows.map((c) => (
                    <td key={c.id}>{[c.glassdoor_rating && `★${c.glassdoor_rating} GD`, c.ambitionbox_rating && `★${c.ambitionbox_rating} AB`].filter(Boolean).join(' · ') || '—'}</td>
                  ))}
                </tr>
                {COMPARE_FIELDS.map(({ key, label }) => (
                  <tr key={key}>
                    <td style={{ color: 'var(--ink2)' }}>{label}</td>
                    {compareRows.map((c) => {
                      const value = c.ai_summary?.[key];
                      return <td key={c.id}>{typeof value === 'string' && value ? value : '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="note" style={{ marginTop: 10 }}>
              Fields showing “—” need AI insights — open the company and run “Generate AI insights”.
            </p>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this company?"
        body={`“${deleteTarget?.name ?? ''}” and its insights will be removed. Contacts remain but lose the company link.`}
        confirmLabel="Delete"
        danger
        onConfirm={() => {
          const target = deleteTarget;
          setDeleteTarget(null);
          if (user && target) void deleteCompany(user.id, target.id).then(load).catch((e) => notify(toCareersError(e).message, 'error'));
        }}
        onCancel={() => setDeleteTarget(null)}
      />

      <ToolFoot>
        <b>Company Intelligence</b> · your private research base — insights cached, never re-billed
      </ToolFoot>
    </div>
  );
}
