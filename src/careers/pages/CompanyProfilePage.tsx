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
import { PageHead, ToolFoot } from '../../tools/ui/common';
import { EmptyState, ErrorCard, PageLoading } from '../components/states';
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
    <div className="stat-cell">
      <div className="l">{label}</div>
      <div className="v" style={{ fontSize: 14 }}>{value}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card" style={{ padding: 18, marginBottom: 12 }} aria-label={title}>
      <div className="panel-eyebrow" style={{ marginBottom: 10 }}>{title}</div>
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
      <div className="fx-page">
        <EmptyState icon="bank" title="Company not found">
          This company is not in the intelligence base.{' '}
          <Link to={CAREERS_ROUTES.intelligence}>Back to Company Intelligence</Link>.
        </EmptyState>
      </div>
    );
  }

  const c = company;
  const hq = [c.hqCity, c.hqState, c.hqCountry].filter(Boolean).join(', ');
  const careerPage = c.careerPages.find((p) => p.url) ?? null;

  return (
    <div className="fx-page">
      <PageHead chip="Company Intelligence" chipColor="#D4AF37" chipBg="rgba(212,175,55,.12)" icon="bank" title={c.name}>
        {[c.industry, c.sector].filter(Boolean).join(' · ') || 'Structured company intelligence'}
      </PageHead>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <button className="btn btn-sm" onClick={() => void toggleSave()} aria-pressed={saved}>
          {saved ? 'Saved ✓' : 'Save company'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => void toggleFavourite()} aria-pressed={favourite}>
          {favourite ? '★ Favourite' : '☆ Favourite'}
        </button>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => navigate(`${CAREERS_ROUTES.jobs}?q=${encodeURIComponent(c.name)}`)}
        >
          Find live jobs ↗
        </button>
        {c.confidenceScore != null && <span className="badge badge-gold" style={{ alignSelf: 'center' }}>Confidence {c.confidenceScore}%</span>}
        {c.lastVerified && <span className="badge badge-mute" style={{ alignSelf: 'center' }}>Verified {formatDate(c.lastVerified)}</span>}
        {!c.lastVerified && c.verificationStatus && <span className="badge badge-mute" style={{ alignSelf: 'center' }}>{c.verificationStatus}</span>}
      </div>

      <Section title="Overview">
        <div className="dash-grid">
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
        </div>
        {(c.officialWebsite || careerPage) && (
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            {c.officialWebsite && (
              <a className="btn btn-ghost btn-sm" style={{ width: 'auto', textDecoration: 'none' }} href={c.officialWebsite} target="_blank" rel="noopener noreferrer">Official website ↗</a>
            )}
            {careerPage && (
              <a className="btn btn-ghost btn-sm" style={{ width: 'auto', textDecoration: 'none' }} href={careerPage.url} target="_blank" rel="noopener noreferrer">Careers page ↗</a>
            )}
          </div>
        )}
      </Section>

      {c.departments.length > 0 && (
        <Section title="Hiring departments">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {c.departments.map((d) => (
              <Link key={d.function_id} to={`${CAREERS_ROUTES.intelligence}?facet=department&q=${encodeURIComponent(d.function_name)}`} className="badge badge-blue" style={{ textDecoration: 'none' }}>
                {d.function_name}{d.hiring_active === 'likely' ? '' : ''}
              </Link>
            ))}
          </div>
        </Section>
      )}

      {c.locations.length > 0 && (
        <Section title="Locations">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {c.locations.map((l) => (
              <span key={l.location_id} className={`badge ${l.is_headquarters ? 'badge-gold' : 'badge-mute'}`}>
                {[l.city, l.state_region].filter(Boolean).join(', ')}{l.is_headquarters ? ' · HQ' : ''}
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
                  {g.program_type && <span className="badge badge-mute" style={{ marginLeft: 6 }}>{g.program_type.replace(/_/g, ' ')}</span>}
                </li>
              ))}
            </ul>
          ) : <div className="note">This company hires graduates.</div>}
        </Section>
      )}

      {(c.internFriendly || c.internships.length > 0) && (
        <Section title="Internships">
          {c.internships.length > 0 ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {c.internships.map((i) => (
                <li key={i.internship_id} style={{ marginBottom: 4 }}>
                  {i.internship_url ? <a href={i.internship_url} target="_blank" rel="noopener noreferrer">{i.internship_type}</a> : i.internship_type}
                  {i.typical_season && <span className="note" style={{ marginLeft: 6 }}>{i.typical_season}</span>}
                </li>
              ))}
            </ul>
          ) : <div className="note">This company offers internships.</div>}
        </Section>
      )}

      {c.ats.length > 0 && (
        <Section title="Applicant Tracking System">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {c.ats.map((a) => (
              <span key={a.ats_record_id} className="badge badge-blue">
                {a.detected_ats}{a.detection_confidence ? ` · ${a.detection_confidence} confidence` : ''}
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
          <div className="note" style={{ marginTop: 8 }}>Market estimates — confidence varies by row; not an offer or guarantee.</div>
        </Section>
      )}

      {c.sources.length > 0 && (
        <Section title="Where opportunities are posted">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {c.sources.map((s) => (
              s.source.website_url ? (
                <a key={s.source.source_id} className="badge badge-mute" style={{ textDecoration: 'none' }} href={s.source.website_url} target="_blank" rel="noopener noreferrer">
                  {s.source.source_name} ↗
                </a>
              ) : (
                <span key={s.source.source_id} className="badge badge-mute">{s.source.source_name}</span>
              )
            ))}
          </div>
        </Section>
      )}

      {related.length > 0 && (
        <Section title="Related companies">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {related.map((r) => (
              <Link key={r.id} to={`${CAREERS_ROUTES.companyProfile}?id=${encodeURIComponent(r.id)}`} className="badge badge-gold" style={{ textDecoration: 'none' }}>
                {r.name}
              </Link>
            ))}
          </div>
        </Section>
      )}

      <ToolFoot>
        Company intelligence is structured metadata to help you research employers. It is not a source of
        live job listings and is never a guarantee of hiring. <Link to={CAREERS_ROUTES.intelligence}>Search all companies</Link>.
      </ToolFoot>
    </div>
  );
}
