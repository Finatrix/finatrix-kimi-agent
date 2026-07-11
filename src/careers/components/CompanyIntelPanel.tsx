/**
 * Phase 4.1 — Dashboard Company Intelligence panel.
 *
 * Surfaces recently-viewed companies, companies hiring in the user's field,
 * companies with graduate programs, and (when a resume industry is known)
 * companies matching it. Self-contained and fail-soft: if the CI base is
 * unavailable it renders nothing rather than breaking the dashboard.
 */

import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { CAREERS_ROUTES } from '../constants';
import { searchByFacet, searchCompanies, getCompanyById } from '../services/companyIntelligence';
import { listRecentCompanies } from '../services/companyIntelUser';
import type { CompanyIntel } from '../types/companyIntel';

function CompanyChips({ items }: { items: CompanyIntel[] }) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {items.map((c) => (
        <Link
          key={c.id}
          to={`${CAREERS_ROUTES.companyProfile}?id=${encodeURIComponent(c.id)}`}
          className="badge badge-gold"
          style={{ textDecoration: 'none' }}
        >
          {c.name}
        </Link>
      ))}
    </div>
  );
}

export function CompanyIntelPanel({ userId, industry }: { userId: string | null; industry?: string }) {
  const [recent, setRecent] = useState<CompanyIntel[]>([]);
  const [inField, setInField] = useState<CompanyIntel[]>([]);
  const [graduate, setGraduate] = useState<CompanyIntel[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [grad] = await Promise.all([searchByFacet('graduate', '', {}, 8)]);
        const field = industry ? await searchCompanies('', { industry }, 8) : await searchCompanies('', {}, 8);
        let recentCompanies: CompanyIntel[] = [];
        if (userId) {
          const rows = await listRecentCompanies(userId, 8).catch(() => []);
          const resolved = await Promise.all(rows.map((r) => getCompanyById(r.company_id)));
          recentCompanies = resolved.filter((c): c is CompanyIntel => c !== null);
        }
        if (!alive) return;
        setGraduate(grad);
        setInField(field);
        setRecent(recentCompanies);
        setReady(true);
      } catch {
        if (alive) setReady(false);
      }
    })();
    return () => { alive = false; };
  }, [userId, industry]);

  if (!ready || (inField.length === 0 && graduate.length === 0 && recent.length === 0)) return null;

  return (
    <div className="card" style={{ marginBottom: 16 }} aria-label="Company intelligence">
      <div className="panel-eyebrow" style={{ marginBottom: 10, display: 'flex', justifyContent: 'space-between' }}>
        <span>Company intelligence</span>
        <Link to={CAREERS_ROUTES.intelligence} style={{ fontWeight: 500 }}>Search all ↗</Link>
      </div>

      {recent.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="note" style={{ marginBottom: 6 }}>Recently viewed</div>
          <CompanyChips items={recent} />
        </div>
      )}

      {inField.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div className="note" style={{ marginBottom: 6 }}>
            {industry ? `Companies in ${industry}` : 'Companies hiring now'}
          </div>
          <CompanyChips items={inField} />
        </div>
      )}

      {graduate.length > 0 && (
        <div>
          <div className="note" style={{ marginBottom: 6 }}>With graduate programs</div>
          <CompanyChips items={graduate} />
        </div>
      )}
    </div>
  );
}
