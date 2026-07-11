/**
 * Phase 4.1 — Company Intelligence store & query layer.
 *
 * Loads the global `ci_*` reference tables once, assembles them into
 * `CompanyIntel` aggregates keyed by persistent id, builds match indexes, and
 * exposes read APIs used by search enrichment, company profiles, filters,
 * dashboard and reports. The dataset (804 companies) is tiny, so it is fetched
 * once and memoized in-memory; expensive index building happens a single time.
 *
 * Tests inject a fixture via `__setCiDatasetForTests`, so nothing here needs a
 * live backend to be verified.
 */

import { supabase } from '../../lib/supabase';
import { mapSupabaseError } from '../utils/errors';
import {
  buildCompanyIndex,
  matchCompany,
  normalizeCompanyName,
  type CompanyIndex,
} from '../search/companyMatch';
import type {
  CiDataset,
  CompanyFilters,
  CompanyIntel,
  CompanyMatchResult,
  CompanySearchFacet,
  CompanySourceLink,
  CiCompanyRow,
} from '../types/companyIntel';

// ─────────────────────────── loading ───────────────────────────

const REFERENCE_TABLES = [
  'ci_companies', 'ci_career_pages', 'ci_graduate_programs', 'ci_internships',
  'ci_ats_platforms', 'ci_company_locations', 'ci_company_functions',
  'ci_company_tags', 'ci_opportunity_sources', 'ci_company_sources',
  'ci_salary_intelligence',
] as const;

/** Supabase caps a single select at 1000 rows; page through larger tables. */
async function fetchAll<T>(table: string): Promise<T[]> {
  const PAGE = 1000;
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1);
    if (error) throw mapSupabaseError(error, `Loading ${table}`);
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) break;
  }
  return rows;
}

let injected: CiDataset | null = null;
let datasetPromise: Promise<CiDataset> | null = null;

async function loadDataset(): Promise<CiDataset> {
  if (injected) return injected;
  const [
    ci_companies, ci_career_pages, ci_graduate_programs, ci_internships,
    ci_ats_platforms, ci_company_locations, ci_company_functions,
    ci_company_tags, ci_opportunity_sources, ci_company_sources,
    ci_salary_intelligence,
  ] = await Promise.all(REFERENCE_TABLES.map((t) => fetchAll<never>(t)));
  return {
    ci_companies, ci_career_pages, ci_graduate_programs, ci_internships,
    ci_ats_platforms, ci_company_locations, ci_company_functions,
    ci_company_tags, ci_opportunity_sources, ci_company_sources,
    ci_salary_intelligence,
  } as unknown as CiDataset;
}

// ─────────────────────────── assembly ───────────────────────────

export interface CompanyIntelStore {
  companies: CompanyIntel[];
  byId: Map<string, CompanyIntel>;
  index: CompanyIndex;
  industries: string[];
  departments: string[];
  atsPlatforms: string[];
  locations: string[];
  sources: { id: string; name: string }[];
  tags: string[];
  sizeBands: string[];
}

/** Paged result envelope — total is the full match count for pagination UIs. */
export interface PagedCompanies {
  results: CompanyIntel[];
  total: number;
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}

function toBool(v: boolean | null): boolean | null {
  return v;
}

function assemble(ds: CiDataset): CompanyIntelStore {
  const careerPages = groupBy(ds.ci_career_pages, (r) => r.company_id);
  const grads = groupBy(ds.ci_graduate_programs, (r) => r.company_id);
  const interns = groupBy(ds.ci_internships, (r) => r.company_id);
  const ats = groupBy(ds.ci_ats_platforms, (r) => r.company_id);
  const locs = groupBy(ds.ci_company_locations, (r) => r.company_id);
  const fns = groupBy(ds.ci_company_functions, (r) => r.company_id);
  const tags = groupBy(ds.ci_company_tags, (r) => r.company_id);
  const salary = groupBy(ds.ci_salary_intelligence, (r) => r.company_id);
  const srcLinks = groupBy(ds.ci_company_sources, (r) => r.company_id);
  const sourceById = new Map(ds.ci_opportunity_sources.map((s) => [s.source_id, s]));

  const companies: CompanyIntel[] = ds.ci_companies.map((c: CiCompanyRow) => {
    const companyTags = tags.get(c.company_id) ?? [];
    const aliases = companyTags.filter((t) => t.tag_type === 'synonym').map((t) => t.tag_value);
    const keywords = companyTags.filter((t) => t.tag_type === 'keyword').map((t) => t.tag_value);
    const sources: CompanySourceLink[] = (srcLinks.get(c.company_id) ?? [])
      .map((l) => {
        const source = sourceById.get(l.source_id);
        return source
          ? { source, presence: l.presence, listingUrl: l.listing_url, confidence: l.confidence_level }
          : null;
      })
      .filter((x): x is CompanySourceLink => x !== null);

    return {
      id: c.company_id,
      name: c.company_name,
      nameNormalized: c.name_normalized || normalizeCompanyName(c.company_name),
      industry: c.industry,
      sector: c.sector,
      subSector: c.sub_sector,
      country: c.country_code,
      hqCity: c.hq_city,
      hqState: c.hq_state,
      hqCountry: c.hq_country,
      officialWebsite: c.official_website,
      sizeBand: c.company_size_band,
      ownershipType: c.ownership_type,
      listedExchange: c.listed_exchange,
      marketCap: c.market_cap_category,
      freshersFriendly: toBool(c.freshers_friendly),
      graduateFriendly: toBool(c.graduate_friendly),
      internFriendly: toBool(c.intern_friendly),
      experiencedHiring: toBool(c.experienced_hiring),
      visaSponsorship: c.visa_sponsorship,
      workModes: (c.work_modes || '').split(';').map((s) => s.trim()).filter(Boolean),
      hiringFrequency: c.hiring_frequency,
      noticePeriod: c.notice_period_preference,
      confidenceScore: c.hiring_confidence_score,
      priorityTier: c.priority_tier,
      confidenceLevel: c.confidence_level,
      verificationStatus: c.verification_status,
      lastVerified: c.last_verified_date,
      dataSource: c.data_source,
      notes: c.notes,
      careerPages: careerPages.get(c.company_id) ?? [],
      graduatePrograms: grads.get(c.company_id) ?? [],
      internships: interns.get(c.company_id) ?? [],
      ats: (ats.get(c.company_id) ?? []).filter((a) => a.detected_ats && a.detected_ats !== 'Unknown'),
      locations: locs.get(c.company_id) ?? [],
      departments: fns.get(c.company_id) ?? [],
      tags: companyTags,
      aliases,
      keywords,
      sources,
      salary: salary.get(c.company_id) ?? [],
    };
  });

  const byId = new Map(companies.map((c) => [c.id, c]));
  const index = buildCompanyIndex(companies);

  const uniqSorted = (xs: string[]) =>
    [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));

  return {
    companies,
    byId,
    index,
    industries: uniqSorted(companies.map((c) => c.industry)),
    departments: uniqSorted(ds.ci_company_functions.map((f) => f.function_name)),
    atsPlatforms: uniqSorted(
      ds.ci_ats_platforms.map((a) => a.detected_ats).filter((a) => a && a !== 'Unknown')
    ),
    locations: uniqSorted(ds.ci_company_locations.map((l) => l.city)),
    sources: ds.ci_opportunity_sources
      .map((s) => ({ id: s.source_id, name: s.source_name }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    tags: uniqSorted(
      ds.ci_company_tags.filter((t) => t.tag_type === 'keyword').map((t) => t.tag_value)
    ),
    sizeBands: uniqSorted(companies.map((c) => c.sizeBand)),
  };
}

let storePromise: Promise<CompanyIntelStore> | null = null;

/** Memoized assembled store. Safe to call from many components concurrently. */
export function getCompanyStore(): Promise<CompanyIntelStore> {
  if (!storePromise) {
    datasetPromise = datasetPromise ?? loadDataset();
    storePromise = datasetPromise.then(assemble).catch((e) => {
      // Reset so a transient failure can be retried on next call.
      storePromise = null;
      datasetPromise = null;
      throw e;
    });
  }
  return storePromise;
}

/** Test seam — inject a fixture dataset and reset memoization. */
export function __setCiDatasetForTests(ds: CiDataset | null): void {
  injected = ds;
  storePromise = null;
  datasetPromise = null;
}

// ─────────────────────────── queries ───────────────────────────

export async function matchEmployer(employer: string): Promise<CompanyMatchResult | null> {
  const store = await getCompanyStore();
  return matchCompany(employer, store.index);
}

export async function getCompanyById(id: string): Promise<CompanyIntel | null> {
  const store = await getCompanyStore();
  return store.byId.get(id) ?? null;
}

function applyFilters(companies: CompanyIntel[], f: CompanyFilters): CompanyIntel[] {
  return companies.filter((c) => {
    if (f.industry && c.industry !== f.industry) return false;
    if (f.sizeBand && c.sizeBand !== f.sizeBand) return false;
    if (f.graduateOnly && !c.graduateFriendly && c.graduatePrograms.length === 0) return false;
    if (f.internshipOnly && !c.internFriendly && c.internships.length === 0) return false;
    if (f.department && !c.departments.some((d) => d.function_name === f.department)) return false;
    if (f.ats && !c.ats.some((a) => a.detected_ats === f.ats)) return false;
    if (f.location && !c.locations.some((l) => matchesLocation(l.city, l.state_region, f.location!))
        && !matchesLocation(c.hqCity, c.hqState, f.location)) return false;
    if (f.source && !c.sources.some((s) => s.source.source_id === f.source)) return false;
    if (f.tag && !c.tags.some((t) => t.tag_value.toLowerCase() === f.tag!.toLowerCase())) return false;
    return true;
  });
}

function matchesLocation(city: string, region: string, needle: string): boolean {
  const n = needle.toLowerCase().trim();
  return city.toLowerCase().includes(n) || region.toLowerCase().includes(n);
}

/** Ordered full match set for a free-text company search (no slicing). */
function rankedCompanyMatches(store: CompanyIntelStore, query: string, filters: CompanyFilters): CompanyIntel[] {
  const q = query.trim().toLowerCase();
  const pool = applyFilters(store.companies, filters);
  if (q) {
    return pool
      .map((c) => ({ c, s: companyTextScore(c, q) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s || rankCompany(b.c) - rankCompany(a.c))
      .map((x) => x.c);
  }
  return [...pool].sort((a, b) => rankCompany(b) - rankCompany(a));
}

/**
 * Free-text company search across name, aliases, industry, keywords, city.
 * Paginated so latency and payload stay flat as the dataset grows to 10k+.
 */
export async function searchCompaniesPaged(
  query: string,
  filters: CompanyFilters = {},
  page: { limit?: number; offset?: number } = {}
): Promise<PagedCompanies> {
  const store = await getCompanyStore();
  const all = rankedCompanyMatches(store, query, filters);
  const offset = Math.max(0, page.offset ?? 0);
  const limit = page.limit ?? 50;
  return { results: all.slice(offset, offset + limit), total: all.length };
}

/** Convenience: first page of company matches. */
export async function searchCompanies(
  query: string,
  filters: CompanyFilters = {},
  limit = 50
): Promise<CompanyIntel[]> {
  return (await searchCompaniesPaged(query, filters, { limit })).results;
}

/** Higher = more prominent (confidence, then lower tier). Deterministic. */
export function rankCompany(c: CompanyIntel): number {
  const conf = c.confidenceScore ?? 0;
  const tier = c.priorityTier ?? 9;
  return conf * 10 - tier;
}

function companyTextScore(c: CompanyIntel, q: string): number {
  const name = c.name.toLowerCase();
  if (name === q) return 100;
  if (name.startsWith(q)) return 80;
  if (name.includes(q)) return 60;
  if (c.aliases.some((a) => a.toLowerCase().includes(q))) return 55;
  if (c.industry.toLowerCase().includes(q) || c.sector.toLowerCase().includes(q)) return 30;
  if (c.hqCity.toLowerCase().includes(q)) return 25;
  if (c.keywords.some((k) => k.toLowerCase().includes(q))) return 20;
  if (c.departments.some((d) => d.function_name.toLowerCase().includes(q))) return 15;
  return 0;
}

/** Faceted search (paged): the new "Search by …" modes, one code path. */
export async function searchByFacetPaged(
  facet: CompanySearchFacet,
  query: string,
  filters: CompanyFilters = {},
  page: { limit?: number; offset?: number } = {}
): Promise<PagedCompanies> {
  const store = await getCompanyStore();
  const q = query.trim().toLowerCase();
  const has = (c: CompanyIntel): boolean => {
    switch (facet) {
      case 'company': return !q || companyTextScore(c, q) > 0;
      case 'graduate':
        return (c.graduateFriendly === true || c.graduatePrograms.length > 0) &&
          (!q || c.graduatePrograms.some((g) => g.program_name.toLowerCase().includes(q)) ||
            companyTextScore(c, q) > 0);
      case 'internship':
        return (c.internFriendly === true || c.internships.length > 0) &&
          (!q || c.internships.some((i) => i.internship_type.toLowerCase().includes(q) ||
            i.typical_season.toLowerCase().includes(q)) || companyTextScore(c, q) > 0);
      case 'department':
        return c.departments.some((d) => !q || d.function_name.toLowerCase().includes(q));
      case 'industry':
        return !q || c.industry.toLowerCase().includes(q) || c.sector.toLowerCase().includes(q);
      case 'ats':
        return c.ats.some((a) => !q || a.detected_ats.toLowerCase().includes(q));
      case 'location':
        return !q || c.locations.some((l) => matchesLocation(l.city, l.state_region, q)) ||
          matchesLocation(c.hqCity, c.hqState, q);
      case 'tag':
        return c.tags.some((t) => !q || t.tag_value.toLowerCase().includes(q));
      case 'source':
        return c.sources.some((s) => !q || s.source.source_name.toLowerCase().includes(q) ||
          s.source.source_id.toLowerCase() === q);
      default: return false;
    }
  };
  const all = applyFilters(store.companies, filters)
    .filter(has)
    .sort((a, b) => rankCompany(b) - rankCompany(a));
  const offset = Math.max(0, page.offset ?? 0);
  const limit = page.limit ?? 50;
  return { results: all.slice(offset, offset + limit), total: all.length };
}

/** Convenience: first page of a faceted search. */
export async function searchByFacet(
  facet: CompanySearchFacet,
  query: string,
  filters: CompanyFilters = {},
  limit = 50
): Promise<CompanyIntel[]> {
  return (await searchByFacetPaged(facet, query, filters, { limit })).results;
}

/** Companies related to a given one — same industry/sector, ranked, excluding self. */
export async function relatedCompanies(company: CompanyIntel, limit = 6): Promise<CompanyIntel[]> {
  const store = await getCompanyStore();
  return store.companies
    .filter((c) => c.id !== company.id &&
      (c.industry === company.industry || c.sector === company.sector))
    .sort((a, b) => {
      const aScore = (a.industry === company.industry ? 2 : 0) + (a.sector === company.sector ? 1 : 0);
      const bScore = (b.industry === company.industry ? 2 : 0) + (b.sector === company.sector ? 1 : 0);
      return bScore - aScore || rankCompany(b) - rankCompany(a);
    })
    .slice(0, limit);
}
