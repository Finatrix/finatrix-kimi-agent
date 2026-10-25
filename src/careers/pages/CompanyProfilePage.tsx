/**
 * Phase 4.1 — Company Intelligence profile.
 *
 * Full structured view of a single company from the intelligence base. Every
 * field is shown only when the dataset actually has it — nothing is fabricated.
 * Records a "recently viewed" trail and supports save / favourite, all via the
 * RLS-scoped per-user tables.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../tools/ui/Toast';
import { Empty, PageHeader } from '../ui/primitives';
import { ErrorCard, PageLoading } from '../components/states';
import '../ui/forms.css';
import { CAREERS_ROUTES } from '../constants';
import { getCompanyById, relatedCompanies } from '../services/companyIntelligence';
import {
  listSavedCompanies,
  recordCompanyView,
  saveCompany,
  setFavourite,
  unsaveCompany,
} from '../services/companyIntelUser';
import { pushNotification } from '../services/notifications';
import type { CompanyIntel } from '../types/companyIntel';
import { toCareersError, type CareersError } from '../utils/errors';
import { formatDate } from '../utils/format';

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="cx-panel" aria-label={title}>
      <div className="cx-panel-head"><h2>{title}</h2></div>
      {children}
    </section>
  );
}

const YES_NO = (v: boolean | null) => (v === null ? null : v ? 'Yes' : 'No');

export default function CompanyProfilePage() {
  const { user } = useAuth();
  const { notify } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const id = useMemo(() => new URLSearchParams(location.search).get('id') ?? '', [location.search]);

  const [company, setCompany] = useState<CompanyIntel | null>(null);
  const [related, setRelated] = useState<CompanyIntel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<CareersError | null>(null);
  const [saved, setSaved] = useState(false);
  const [favourite, setFav] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const c = await getCompanyById(id);
      setCompany(c);
      if (c) {
        setRelated(await relatedCompanies(c).catch(() => []));
        if (user) {
          void recordCompanyView(user.id, c.id).catch(() => {});
          const savedRows = await listSavedCompanies(user.id).catch(() => []);
          const row = savedRows.find((r) => r.company_id === c.id);
          setSaved(Boolean(row));
          setFav(Boolean(row?.favourite));
        }
      }
    } catch (e) {
      setError(toCareersError(e));
    } finally {
      setLoading(false);
    }
  }, [id, user]);

  useEffect(() => { void load(); }, [load]);

  const toggleSave = async () => {
    if (!user || !company) { notify('Sign in to save companies.', 'error'); return; }
    try {
      if (saved) { await unsaveCompany(user.id, company.id); setSaved(false); setFav(false); notify('Removed from saved.', 'ok'); }
      else { await saveCompany(user.id, company.id); setSaved(true); notify('Company saved.', 'ok'); }
    } catch (e) { notify(toCareersError(e).message, 'error'); }
  };

  const toggleFavourite = async () => {
    if (!user || !company) { notify('Sign in to favourite companies.', 'error'); return; }
    try {
      const next = !favourite;
      await setFavourite(user.id, company.id, next);
      setFav(next); setSaved(true);
      notify(next ? 'Added to favourites.' : 'Removed from favourites.', 'ok');
      if (next) {
        // Data-supported notification (a real user action). Deduped per company.
        void pushNotification(user.id, {
          kind: 'company_favourited',
          title: `${company.name} added to favourites`,
          body: 'You will see it under Company Intelligence on your dashboard.',
          link: `${CAREERS_ROUTES.companyProfile}?id=${company.id}`,
          dedupeKey: `fav-${company.id}`,
        });
      }
    } catch (e) { notify(toCareersError(e).message, 'error'); }
  };

  if (loading) return <PageLoading />;
  if (error) return <div className="tool-wrap"><ErrorCard error={error} onRetry={() => void load()} /></div>;
  if (!company) {
    return (
      <div>
        <Empty title="Company not found">
          This company is not in the company directory.{' '}
          <Link to={CAREERS_ROUTES.intelligence}>Back to the directory</Link>.
        </Empty>
      </div>
    );
  }

  const c = company;
  const hq = [c.hqCity, c.hqState, c.hqCountry].filter(Boolean).join(', ');
  const careerPage = c.careerPages.find((p) => p.url) ?? null;

  return (
    <div className="cxf-stack">
      <PageHeader title={c.name} description={[c.industry, c.sector].filter(Boolean).join(', ') || undefined} />

      <div className="cxf-toolbar">
        <button type="button" className="cx-btn cx-btn-primary" onClick={() => void toggleSave()} aria-pressed={saved}>
          {saved ? 'Saved' : 'Save company'}
        </button>
        <button type="button" className="cx-btn" onClick={() => void toggleFavourite()} aria-pressed={favourite}>
          {favourite ? 'Favourited' : 'Favourite'}
        </button>
        <button
          type="button"
          className="cx-btn"
          onClick={() => navigate(`${CAREERS_ROUTES.jobs}?q=${encodeURIComponent(c.name)}`)}
        >
          Find live jobs
        </button>
        {c.confidenceScore != null && <span className="cx-chip cx-chip-accent cx-num">Data confidence {c.confidenceScore}%</span>}
        {c.lastVerified && <span className="cx-chip">Verified {formatDate(c.lastVerified)}</span>}
        {!c.lastVerified && c.verificationStatus && <span className="cx-chip">{c.verificationStatus}</span>}
      </div>

      <Section title="Overview">
        <dl className="cxf-facts">
          <Field label="Industry" value={c.industry} />
          <Field label="Sector" value={c.sector} />
          <Field label="Sub-sector" value={c.subSector} />
          <Field label="Headquarters" value={hq} />
          <Field label="Company size" value={c.sizeBand} />
          <Field label="Ownership" value={c.ownershipType.replace(/_/g, ' ')} />
          <Field label="Listed on" value={c.listedExchange} />
          <Field label="Market cap" value={c.marketCap} />
          <Field label="Work modes" value={c.workModes.join(', ')} />
          <Field label="Hiring frequency" value={c.hiringFrequency} />
          <Field label="Notice period" value={c.noticePeriod} />
          <Field label="Freshers friendly" value={YES_NO(c.freshersFriendly)} />
          <Field label="Experienced hiring" value={YES_NO(c.experiencedHiring)} />
          <Field label="Visa sponsorship" value={c.visaSponsorship.replace(/_/g, ' ')} />
        </dl>
        {(c.officialWebsite || careerPage) && (
          <div className="cxf-actions">
            {c.officialWebsite && (
              <a className="cx-btn cx-btn-sm" href={c.officialWebsite} target="_blank" rel="noopener noreferrer">Official website (opens in a new tab)</a>
            )}
            {careerPage && (
              <a className="cx-btn cx-btn-sm" href={careerPage.url} target="_blank" rel="noopener noreferrer">Careers page (opens in a new tab)</a>
            )}
          </div>
        )}
      </Section>

      {c.departments.length > 0 && (
        <Section title="Hiring departments">
          <div className="cxf-chips">
            {c.departments.map((d) => (
              <Link key={d.function_id} to={`${CAREERS_ROUTES.intelligence}?facet=department&q=${encodeURIComponent(d.function_name)}`} className="cx-chip" style={{ textDecoration: 'none', minHeight: 32 }}>
                {d.function_name}
              </Link>
            ))}
          </div>
        </Section>
      )}

      {c.locations.length > 0 && (
        <Section title="Locations">
          <div className="cxf-chips">
            {c.locations.map((l) => (
              <span key={l.location_id} className={`cx-chip ${l.is_headquarters ? 'cx-chip-accent' : ''}`}>
                {[l.city, l.state_region].filter(Boolean).join(', ')}{l.is_headquarters ? ', headquarters' : ''}
              </span>
            ))}
          </div>
        </Section>
      )}

      {(c.graduateFriendly || c.graduatePrograms.length > 0) && (
        <Section title="Graduate programs">
          {c.graduatePrograms.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {c.graduatePrograms.map((g) => (
                <li key={g.program_id} style={{ marginBottom: 4 }}>
                  {g.program_url ? <a href={g.program_url} target="_blank" rel="noopener noreferrer">{g.program_name}</a> : g.program_name}
                  {g.program_type && <span className="cx-chip" style={{ marginLeft: 6 }}>{g.program_type.replace(/_/g, ' ')}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="cx-sub">This company hires graduates.</p>}
        </Section>
      )}

      {(c.internFriendly || c.internships.length > 0) && (
        <Section title="Internships">
          {c.internships.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {c.internships.map((i) => (
                <li key={i.internship_id} style={{ marginBottom: 4 }}>
                  {i.internship_url ? <a href={i.internship_url} target="_blank" rel="noopener noreferrer">{i.internship_type}</a> : i.internship_type}
                  {i.typical_season && <span className="cx-muted" style={{ marginLeft: 6 }}>{i.typical_season}</span>}
                </li>
              ))}
            </ul>
          ) : <p className="cx-sub">This company offers internships.</p>}
        </Section>
      )}

      {c.ats.length > 0 && (
        <Section title="Applicant tracking system">
          <div className="cxf-chips">
            {c.ats.map((a) => (
              <span key={a.ats_record_id} className="cx-chip">
                {a.detected_ats}{a.detection_confidence ? `, ${a.detection_confidence} confidence` : ''}
              </span>
            ))}
          </div>
        </Section>
      )}

      {c.salary.length > 0 && (
        <Section title="Salary intelligence">
          <div style={{ overflowX: 'auto' }}>
            <table className="ci-table" style={{ width: '100%' }}>
              <thead>
                <tr><th scope="col">Role family</th><th scope="col">Experience</th><th scope="col">Range</th><th scope="col">Basis</th></tr>
              </thead>
              <tbody>
                {c.salary.map((s) => (
                  <tr key={s.salary_id}>
                    <td>{s.role_family.replace(/_/g, ' ')}</td>
                    <td>{s.experience_level.replace(/_/g, ' ')}</td>
                    <td>{s.min_annual != null && s.max_annual != null ? `${s.min_annual}–${s.max_annual} ${s.unit || ''} ${s.currency || ''}`.trim() : '—'}</td>
                    <td>{s.basis.replace(/_/g, ' ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cx-sub" style={{ marginTop: 8 }}>Market estimates. Confidence varies by row; this is not an offer or a guarantee.</p>
        </Section>
      )}

      {c.sources.length > 0 && (
        <Section title="Where opportunities are posted">
          <div className="cxf-chips">
            {c.sources.map((s) => (
              s.source.website_url ? (
                <a key={s.source.source_id} className="cx-chip" style={{ textDecoration: 'none', minHeight: 32 }} href={s.source.website_url} target="_blank" rel="noopener noreferrer">
                  {s.source.source_name} (opens in a new tab)
                </a>
              ) : (
                <span key={s.source.source_id} className="cx-chip">{s.source.source_name}</span>
              )
            ))}
          </div>
        </Section>
      )}

      {related.length > 0 && (
        <Section title="Related companies">
          <div className="cxf-chips">
            {related.map((r) => (
              <Link key={r.id} to={`${CAREERS_ROUTES.companyProfile}?id=${encodeURIComponent(r.id)}`} className="cx-chip" style={{ textDecoration: 'none', minHeight: 32 }}>
                {r.name}
              </Link>
            ))}
          </div>
        </Section>
      )}

      <p className="cx-sub">
        Company intelligence is structured metadata to help you research employers. It is not a source of
        live job listings and is never a guarantee of hiring. <Link to={CAREERS_ROUTES.intelligence}>Search all companies</Link>.
      </p>
    </div>
  );
}
