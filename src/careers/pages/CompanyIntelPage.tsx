/**
 * Phase 4.1 — Company Intelligence search.
 *
 * The multi-entity search surface layered on top of "Search Jobs": search
 * companies, graduate programs, internships, or by department / industry / ATS
 * / location / tag / opportunity source. Reuses the existing form controls and
 * the same CI store that powers job-search enrichment. Fully paginated so it
 * scales unchanged from 804 to 10,000+ companies.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { EmptyState, ErrorCard } from '../components/states';
import { CAREERS_ROUTES } from '../constants';
import {
  getCompanyStore,
  searchByFacetPaged,
  searchCompaniesPaged,
  type CompanyIntelStore,
} from '../services/companyIntelligence';
import { listApplications } from '../services/applications';
import { buildCompanyReports, topEntries, type CompanyReports } from '../search/companyReports';
import type { CompanyFilters, CompanyIntel, CompanySearchFacet } from '../types/companyIntel';
import { toCareersError, type CareersError } from '../utils/errors';

const FACETS: { id: CompanySearchFacet; label: string }[] = [
  { id: 'company', label: 'Companies' },
  { id: 'graduate', label: 'Graduate programs' },
  { id: 'internship', label: 'Internships' },
  { id: 'department', label: 'By department' },
  { id: 'industry', label: 'By industry' },
  { id: 'ats', label: 'By ATS platform' },
  { id: 'location', label: 'By location' },
  { id: 'tag', label: 'By tag' },
  { id: 'source', label: 'By opportunity source' },
];

const PAGE_SIZE = 25;

export default function CompanyIntelPage() {
  const { user } = useAuth();
  const location = useLocation();
  const initial = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const [reports, setReports] = useState<CompanyReports | null>(null);

  const [store, setStore] = useState<CompanyIntelStore | null>(null);
  const [facet, setFacet] = useState<CompanySearchFacet>((initial.get('facet') as CompanySearchFacet) || 'company');
  const [query, setQuery] = useState(initial.get('q') ?? '');
  const queryRef = useRef(query);
  queryRef.current = query;
  const [filters, setFilters] = useState<CompanyFilters>({});
  const [page, setPage] = useState(0);
  const [results, setResults] = useState<CompanyIntel[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CareersError | null>(null);

  useEffect(() => {
    getCompanyStore().then(setStore, (e) => setError(toCareersError(e)));
  }, []);

  // Applications-by-company-intelligence reports (fail-soft).
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      try {
        const [s, apps] = await Promise.all([getCompanyStore(), listApplications(user.id)]);
        if (!alive || apps.length === 0) return;
        setReports(buildCompanyReports(apps.map((a) => ({ company_name: a.company_name, location: a.location })), s.index));
      } catch { /* reports are optional */ }
    })();
    return () => { alive = false; };
  }, [user]);

  const run = useCallback(async (p: number) => {
    const q = queryRef.current;
    setLoading(true);
    setError(null);
    try {
      const paged = facet === 'company'
        ? await searchCompaniesPaged(q, filters, { limit: PAGE_SIZE, offset: p * PAGE_SIZE })
        : await searchByFacetPaged(facet, q, filters, { limit: PAGE_SIZE, offset: p * PAGE_SIZE });
      setResults(paged.results);
      setTotal(paged.total);
      setPage(p);
    } catch (e) {
      setError(toCareersError(e));
    } finally {
      setLoading(false);
    }
  }, [facet, filters]);

  // Re-run when the store loads or facet/filters change (typing runs on submit).
  useEffect(() => { if (store) void run(0); }, [store, run]);

  const setFilter = (key: keyof CompanyFilters, value: string | boolean | undefined) =>
    setFilters((f) => ({ ...f, [key]: value || undefined }));

  const pages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="fx-page">
      <PageHead chip="Company Intelligence" chipColor="#D4AF37" chipBg="rgba(212,175,55,.12)" icon="bank" title="Search company intelligence">
        Search {store ? store.companies.length.toLocaleString() : 'thousands of'} companies and their graduate
        programs, internships, departments, ATS platforms and locations — the same intelligence that enriches your job search.
      </PageHead>

      {/* Applications reports — grouped via Company Intelligence. */}
      {reports && reports.total > 0 && (
        <details className="card" style={{ padding: 16, marginBottom: 12 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
            Your applications, by company intelligence ({reports.total} tracked)
          </summary>
          <div className="dash-grid" style={{ marginTop: 12 }}>
            {([
              ['By industry', reports.byIndustry],
              ['By ATS platform', reports.byAts],
              ['By company', reports.byCompany],
              ['By location', reports.byLocation],
            ] as const).map(([label, rec]) => (
              topEntries(rec, 5).length > 0 && (
                <div key={label} className="stat-cell" style={{ textAlign: 'left' }}>
                  <div className="l" style={{ marginBottom: 6 }}>{label}</div>
                  {topEntries(rec, 5).map(([k, n]) => (
                    <div key={k} className="job-meta" style={{ justifyContent: 'space-between' }}>
                      <span>{k}</span><b>{n}</b>
                    </div>
                  ))}
                </div>
              )
            ))}
          </div>
          <div className="note" style={{ marginTop: 10 }}>
            Graduate-track applications: <b>{reports.graduateApplications}</b> ·
            Internship-track: <b>{reports.internshipApplications}</b> ·
            Matched to intelligence base: <b>{reports.matched}/{reports.total}</b>
          </div>
        </details>
      )}

      {/* Facet selector */}
      <div className="nav" role="tablist" aria-label="Search scope" style={{ flexWrap: 'wrap', marginBottom: 12, padding: '10px 0' }}>
        {FACETS.map((f) => (
          <a
            key={f.id}
            role="tab"
            aria-selected={facet === f.id}
            tabIndex={0}
            className={facet === f.id ? 'on' : ''}
            style={{ cursor: 'pointer' }}
            onClick={() => setFacet(f.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setFacet(f.id)}
          >
            {f.label}
          </a>
        ))}
      </div>

      {/* Query + filters */}
      <div className="lib-toolbar" style={{ flexWrap: 'wrap', gap: 8 }}>
        <input
          className="fi"
          type="search"
          placeholder={`Search ${FACETS.find((f) => f.id === facet)?.label.toLowerCase()}…`}
          aria-label="Search query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run(0)}
        />
        <button className="btn btn-sm" style={{ width: 'auto' }} onClick={() => void run(0)}>Search</button>
      </div>

      {store && (
        <div className="lib-toolbar" style={{ flexWrap: 'wrap', gap: 8, marginTop: 8 }} role="group" aria-label="Filters">
          <select className="fi" aria-label="Industry filter" value={filters.industry ?? ''} onChange={(e) => setFilter('industry', e.target.value)}>
            <option value="">All industries</option>
            {store.industries.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <select className="fi" aria-label="Department filter" value={filters.department ?? ''} onChange={(e) => setFilter('department', e.target.value)}>
            <option value="">All departments</option>
            {store.departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
          <select className="fi" aria-label="ATS platform filter" value={filters.ats ?? ''} onChange={(e) => setFilter('ats', e.target.value)}>
            <option value="">All ATS platforms</option>
            {store.atsPlatforms.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select className="fi" aria-label="Company size filter" value={filters.sizeBand ?? ''} onChange={(e) => setFilter('sizeBand', e.target.value)}>
            <option value="">All sizes</option>
            {store.sizeBands.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <select className="fi" aria-label="Opportunity source filter" value={filters.source ?? ''} onChange={(e) => setFilter('source', e.target.value)}>
            <option value="">All sources</option>
            {store.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={!!filters.graduateOnly} onChange={(e) => setFilter('graduateOnly', e.target.checked)} /> Graduate
          </label>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
            <input type="checkbox" checked={!!filters.internshipOnly} onChange={(e) => setFilter('internshipOnly', e.target.checked)} /> Internships
          </label>
        </div>
      )}

      <div style={{ marginTop: 14 }} aria-live="polite">
        {error && <ErrorCard error={error} onRetry={() => void run(page)} />}
        {!error && loading && <div style={{ minHeight: 120 }} aria-busy="true" />}
        {!error && !loading && results.length === 0 && (
          <EmptyState icon="bank" title="No companies match">
            Try a different scope, broaden your filters, or clear the search box.
          </EmptyState>
        )}
        {!error && !loading && results.length > 0 && (
          <>
            <div className="note" style={{ marginBottom: 8 }}>{total.toLocaleString()} companies · page {page + 1} of {pages}</div>
            {results.map((c) => (
              <div className="card" key={c.id} style={{ padding: 16, marginBottom: 8 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 650 }}>{c.name}</div>
                    <div className="job-meta">
                      {c.industry && <span className="badge badge-gold">{c.industry}</span>}
                      {(c.hqCity || c.hqCountry) && <span>{[c.hqCity, c.hqCountry].filter(Boolean).join(', ')}</span>}
                      {c.sizeBand && <span>{c.sizeBand}</span>}
                      {(c.graduateFriendly || c.graduatePrograms.length > 0) && <span className="badge badge-blue">Graduate</span>}
                      {(c.internFriendly || c.internships.length > 0) && <span className="badge badge-blue">Internships</span>}
                      {c.ats[0] && <span className="badge badge-mute">ATS: {c.ats[0].detected_ats}</span>}
                      {c.confidenceScore != null && <span className="badge badge-mute">Intel {c.confidenceScore}%</span>}
                    </div>
                  </div>
                  <Link className="btn btn-ghost btn-sm" style={{ width: 'auto', textDecoration: 'none', flexShrink: 0 }} to={`${CAREERS_ROUTES.companyProfile}?id=${encodeURIComponent(c.id)}`}>
                    View profile ↗
                  </Link>
                </div>
              </div>
            ))}
            {pages > 1 && (
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 6 }}>
                <button className="btn btn-ghost btn-sm" disabled={page === 0} onClick={() => void run(page - 1)}>← Previous</button>
                <button className="btn btn-ghost btn-sm" disabled={page + 1 >= pages} onClick={() => void run(page + 1)}>Next →</button>
              </div>
            )}
          </>
        )}
      </div>

      <ToolFoot>
        Company intelligence is structured reference metadata, not a live jobs feed.{' '}
        <Link to={CAREERS_ROUTES.jobs}>Search live jobs</Link> to see current openings enriched with this data.
      </ToolFoot>
    </div>
  );
}
