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
import { Tabs } from '../../tools/ui/Tabs';
import { ErrorCard } from '../components/states';
import { Empty } from '../ui/primitives';
import '../ui/forms.css';
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
    <div className="cxf-stack">
      <p className="cx-sub">
        Search {store ? store.companies.length.toLocaleString() : 'thousands of'} companies and their graduate programs, internships,
        departments, ATS platforms and locations. This is reference data, not a live jobs feed;{' '}
        <Link to={CAREERS_ROUTES.jobs}>search live jobs</Link> to see current openings.
      </p>

      {/* Applications reports, grouped via Company Intelligence. */}
      {reports && reports.total > 0 && (
        <details className="cx-panel">
          <summary style={{ cursor: 'pointer', fontWeight: 600, minHeight: 32 }}>
            Your applications by company ({reports.total} tracked)
          </summary>
          <div className="cx-grid cx-grid-2" style={{ marginTop: 14 }}>
            {([
              ['By industry', reports.byIndustry],
              ['By ATS platform', reports.byAts],
              ['By company', reports.byCompany],
              ['By location', reports.byLocation],
            ] as const).map(([label, rec]) => (
              topEntries(rec, 5).length > 0 && (
                <div key={label}>
                  <h3 className="cx-sub" style={{ fontWeight: 600, marginBottom: 4 }}>{label}</h3>
                  <ul className="cx-list">
                    {topEntries(rec, 5).map(([k, n]) => (
                      <li key={k} className="cx-row" style={{ minHeight: 36, padding: '4px 0', justifyContent: 'space-between' }}>
                        <span>{k}</span><span className="cx-num">{n}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            ))}
          </div>
          <p className="cx-sub" style={{ marginTop: 12 }}>
            <span className="cx-num">{reports.graduateApplications}</span> graduate-track applications,{' '}
            <span className="cx-num">{reports.internshipApplications}</span> internship-track,{' '}
            <span className="cx-num">{reports.matched} of {reports.total}</span> matched to the company directory.
          </p>
        </details>
      )}

      {/* Facet selector */}
      <Tabs
        variant="nav"
        label="Search scope"
        style={{ flexWrap: 'wrap', padding: 0 }}
        active={facet}
        onChange={setFacet}
        items={FACETS.map((f) => ({ key: f.id, label: f.label }))}
      />

      {/* One toolbar: query, filters, search */}
      <div className="cxf-toolbar" role="search" style={{ marginBottom: 0 }}>
        <input
          className="fi cxf-grow"
          type="search"
          placeholder={`Search ${FACETS.find((f) => f.id === facet)?.label.toLowerCase()}`}
          aria-label="Search query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run(0)}
        />
        {store && (
          <>
            <select className="fs" aria-label="Industry filter" value={filters.industry ?? ''} onChange={(e) => setFilter('industry', e.target.value)}>
              <option value="">All industries</option>
              {store.industries.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
            <select className="fs" aria-label="Department filter" value={filters.department ?? ''} onChange={(e) => setFilter('department', e.target.value)}>
              <option value="">All departments</option>
              {store.departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <select className="fs" aria-label="ATS platform filter" value={filters.ats ?? ''} onChange={(e) => setFilter('ats', e.target.value)}>
              <option value="">All ATS platforms</option>
              {store.atsPlatforms.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <select className="fs" aria-label="Company size filter" value={filters.sizeBand ?? ''} onChange={(e) => setFilter('sizeBand', e.target.value)}>
              <option value="">All sizes</option>
              {store.sizeBands.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="fs" aria-label="Opportunity source filter" value={filters.source ?? ''} onChange={(e) => setFilter('source', e.target.value)}>
              <option value="">All sources</option>
              {store.sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <label className="cxf-check cx-sub">
              <input type="checkbox" checked={!!filters.graduateOnly} onChange={(e) => setFilter('graduateOnly', e.target.checked)} /> Graduate
            </label>
            <label className="cxf-check cx-sub">
              <input type="checkbox" checked={!!filters.internshipOnly} onChange={(e) => setFilter('internshipOnly', e.target.checked)} /> Internships
            </label>
          </>
        )}
        <button type="button" className="cx-btn cx-btn-primary" onClick={() => void run(0)}>Search</button>
      </div>

      <div aria-live="polite">
        {error && <ErrorCard error={error} onRetry={() => void run(page)} />}
        {!error && loading && <div style={{ minHeight: 120 }} aria-busy="true" />}
        {!error && !loading && results.length === 0 && (
          <div className="cx-panel">
            <Empty title="No companies match">
              Try a different scope, broaden your filters, or clear the search box.
            </Empty>
          </div>
        )}
        {!error && !loading && results.length > 0 && (
          <section className="cx-panel" aria-label="Search results">
            <div className="cx-panel-head">
              <h2><span className="cx-num">{total.toLocaleString()}</span> companies</h2>
              <span className="cx-muted cx-num">Page {page + 1} of {pages}</span>
            </div>
            <ul className="cx-list">
              {results.map((c) => (
                <li key={c.id}>
                  <div className="cx-row">
                    <div className="cx-row-main">
                      <p className="cx-row-title">{c.name}</p>
                      <p className="cx-row-meta">
                        {c.industry && <span>{c.industry}</span>}
                        {(c.hqCity || c.hqCountry) && <span>{[c.hqCity, c.hqCountry].filter(Boolean).join(', ')}</span>}
                        {c.sizeBand && <span>{c.sizeBand}</span>}
                        {(c.graduateFriendly || c.graduatePrograms.length > 0) && <span className="cx-chip">Graduate programs</span>}
                        {(c.internFriendly || c.internships.length > 0) && <span className="cx-chip">Internships</span>}
                        {c.ats[0] && <span>ATS {c.ats[0].detected_ats}</span>}
                        {c.confidenceScore != null && <span className="cx-num">Data confidence {c.confidenceScore}%</span>}
                      </p>
                    </div>
                    <Link className="cx-btn cx-btn-sm" aria-label={`View profile: ${c.name}`} to={`${CAREERS_ROUTES.companyProfile}?id=${encodeURIComponent(c.id)}`}>
                      View profile
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
            {pages > 1 && (
              <div className="cxf-actions" style={{ justifyContent: 'center' }}>
                <button type="button" className="cx-btn" disabled={page === 0} onClick={() => void run(page - 1)}>Previous</button>
                <button type="button" className="cx-btn" disabled={page + 1 >= pages} onClick={() => void run(page + 1)}>Next</button>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
