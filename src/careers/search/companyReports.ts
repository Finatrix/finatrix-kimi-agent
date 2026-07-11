/**
 * Phase 4.1 — Company Intelligence reporting.
 *
 * Pure, deterministic aggregation of the user's applications enriched with
 * Company Intelligence: applications by company, ATS, industry, location, plus
 * graduate/internship application counts. Reusable by any Reports surface and
 * fully unit-testable (no Supabase, no React). Missing CI data is bucketed as
 * "Unknown" rather than fabricated.
 */

import { matchCompany, type CompanyIndex } from './companyMatch';

/** Minimal application shape needed for reporting (a subset of ApplicationRow). */
export interface ReportableApplication {
  company_name: string;
  location?: string;
}

export interface CompanyReports {
  total: number;
  matched: number;
  byCompany: Record<string, number>;
  byAts: Record<string, number>;
  byIndustry: Record<string, number>;
  byLocation: Record<string, number>;
  graduateApplications: number;
  internshipApplications: number;
}

function bump(rec: Record<string, number>, key: string): void {
  if (!key) return;
  rec[key] = (rec[key] ?? 0) + 1;
}

/**
 * Build all company-intelligence report rollups from a list of applications.
 * Each application is matched to a CI company; unmatched ones still count in
 * totals and byCompany (by their raw name) but not in CI-derived breakdowns.
 */
export function buildCompanyReports(
  applications: ReportableApplication[],
  index: CompanyIndex
): CompanyReports {
  const reports: CompanyReports = {
    total: applications.length,
    matched: 0,
    byCompany: {},
    byAts: {},
    byIndustry: {},
    byLocation: {},
    graduateApplications: 0,
    internshipApplications: 0,
  };

  for (const app of applications) {
    const match = matchCompany(app.company_name, index);
    const intel = match?.company ?? null;
    bump(reports.byCompany, intel?.name || app.company_name || 'Unknown');
    if (app.location) bump(reports.byLocation, app.location);

    if (!intel) continue;
    reports.matched++;
    if (intel.industry) bump(reports.byIndustry, intel.industry);
    const ats = intel.ats.find((a) => a.detected_ats && a.detected_ats !== 'Unknown');
    bump(reports.byAts, ats?.detected_ats || 'Unknown');
    if (!app.location && intel.hqCity) bump(reports.byLocation, intel.hqCity);
    if (intel.graduateFriendly || intel.graduatePrograms.length > 0) reports.graduateApplications++;
    if (intel.internFriendly || intel.internships.length > 0) reports.internshipApplications++;
  }
  return reports;
}

/** Sort a rollup into descending [label, count] pairs for display. */
export function topEntries(rec: Record<string, number>, limit = 10): [string, number][] {
  return Object.entries(rec).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit);
}
