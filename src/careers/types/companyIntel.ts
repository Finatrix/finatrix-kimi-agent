/**
 * Phase 4.1 — Company Intelligence types.
 *
 * These mirror the `ci_*` reference tables (supabase/careers_phase4_1_schema.sql).
 * They describe structured company METADATA that enriches the existing job
 * search; they are never a source of live jobs. Row shapes are kept close to
 * the SQL so the loader is a thin cast, and an assembled `CompanyIntel`
 * aggregate is what the UI and search enrichment consume.
 */

// ─────────────────────────── raw reference rows ───────────────────────────

export interface CiCompanyRow {
  company_id: string;
  company_name: string;
  name_normalized: string;
  country_code: string;
  industry: string;
  sector: string;
  sub_sector: string;
  hq_city: string;
  hq_state: string;
  hq_country: string;
  official_website: string;
  company_size_band: string;
  ownership_type: string;
  listed_exchange: string;
  market_cap_category: string;
  freshers_friendly: boolean | null;
  graduate_friendly: boolean | null;
  intern_friendly: boolean | null;
  experienced_hiring: boolean | null;
  visa_sponsorship: string;
  work_modes: string;
  hiring_frequency: string;
  notice_period_preference: string;
  hiring_confidence_score: number | null;
  priority_tier: number | null;
  confidence_level: string;
  verification_status: string;
  last_verified_date: string | null;
  data_source: string;
  needs_review: boolean | null;
  notes: string;
}

export interface CiCareerPageRow {
  page_id: string;
  company_id: string;
  page_type: string;
  url: string;
  url_status: string;
  confidence_level: string;
  source: string;
}

export interface CiGraduateProgramRow {
  program_id: string;
  company_id: string;
  program_name: string;
  program_type: string;
  program_url: string;
  is_generic_record: boolean | null;
  confidence_level: string;
}

export interface CiInternshipRow {
  internship_id: string;
  company_id: string;
  internship_type: string;
  typical_season: string;
  internship_url: string;
  confidence_level: string;
}

export interface CiAtsRow {
  ats_record_id: string;
  company_id: string;
  detected_ats: string;
  detection_confidence: string;
  detection_method: string;
  detected_url: string;
  last_checked: string | null;
}

export interface CiLocationRow {
  location_id: string;
  company_id: string;
  city: string;
  state_region: string;
  country_code: string;
  is_headquarters: boolean | null;
}

export interface CiFunctionRow {
  function_id: string;
  company_id: string;
  function_name: string;
  hiring_active: string;
  confidence_level: string;
}

export type CiTagType = 'industry' | 'keyword' | 'role_taxonomy' | 'synonym' | string;

export interface CiTagRow {
  tag_id: string;
  company_id: string;
  tag_type: CiTagType;
  tag_value: string;
}

export interface CiOpportunitySourceRow {
  source_id: string;
  source_name: string;
  source_type: string;
  coverage_country: string;
  website_url: string;
  notes: string;
  data_source: string;
}

export interface CiCompanySourceRow {
  link_id: string;
  company_id: string;
  source_id: string;
  presence: string;
  listing_url: string;
  confidence_level: string;
}

export interface CiSalaryRow {
  salary_id: string;
  company_id: string;
  role_family: string;
  experience_level: string;
  currency: string;
  min_annual: number | null;
  max_annual: number | null;
  unit: string;
  basis: string;
  confidence_level: string;
}

/** The full raw dataset as loaded from Supabase (or a test fixture). */
export interface CiDataset {
  ci_companies: CiCompanyRow[];
  ci_career_pages: CiCareerPageRow[];
  ci_graduate_programs: CiGraduateProgramRow[];
  ci_internships: CiInternshipRow[];
  ci_ats_platforms: CiAtsRow[];
  ci_company_locations: CiLocationRow[];
  ci_company_functions: CiFunctionRow[];
  ci_company_tags: CiTagRow[];
  ci_opportunity_sources: CiOpportunitySourceRow[];
  ci_company_sources: CiCompanySourceRow[];
  ci_salary_intelligence: CiSalaryRow[];
}

// ─────────────────────────── assembled aggregate ───────────────────────────

export interface CompanySourceLink {
  source: CiOpportunitySourceRow;
  presence: string;
  listingUrl: string;
  confidence: string;
}

/**
 * One company with every relation resolved by id. Missing data is simply
 * absent (empty arrays / null) — never fabricated.
 */
export interface CompanyIntel {
  id: string;
  name: string;
  nameNormalized: string;
  industry: string;
  sector: string;
  subSector: string;
  country: string;
  hqCity: string;
  hqState: string;
  hqCountry: string;
  officialWebsite: string;
  sizeBand: string;
  ownershipType: string;
  listedExchange: string;
  marketCap: string;
  freshersFriendly: boolean | null;
  graduateFriendly: boolean | null;
  internFriendly: boolean | null;
  experiencedHiring: boolean | null;
  visaSponsorship: string;
  workModes: string[];
  hiringFrequency: string;
  noticePeriod: string;
  /** 0–100 hiring-confidence; the "Confidence Score" surfaced in the UI. */
  confidenceScore: number | null;
  priorityTier: number | null;
  confidenceLevel: string;
  verificationStatus: string;
  lastVerified: string | null;
  dataSource: string;
  notes: string;
  // relations
  careerPages: CiCareerPageRow[];
  graduatePrograms: CiGraduateProgramRow[];
  internships: CiInternshipRow[];
  ats: CiAtsRow[];
  locations: CiLocationRow[];
  departments: CiFunctionRow[];
  tags: CiTagRow[];
  aliases: string[];
  keywords: string[];
  sources: CompanySourceLink[];
  salary: CiSalaryRow[];
}

// ─────────────────────────── per-user rows ───────────────────────────

export interface CiSavedCompanyRow {
  id: string;
  user_id: string;
  company_id: string;
  favourite: boolean;
  created_at: string;
}

export interface CiRecentCompanyRow {
  id: string;
  user_id: string;
  company_id: string;
  viewed_at: string;
}

// ─────────────────────────── search facets ───────────────────────────

/** The multi-entity search modes layered on top of "Search Jobs". */
export type CompanySearchFacet =
  | 'company'
  | 'graduate'
  | 'internship'
  | 'department'
  | 'industry'
  | 'ats'
  | 'location'
  | 'tag'
  | 'source';

export interface CompanyFilters {
  industry?: string;
  department?: string;
  ats?: string;
  location?: string;
  sizeBand?: string;
  source?: string;
  tag?: string;
  graduateOnly?: boolean;
  internshipOnly?: boolean;
}

export interface CompanyMatchResult {
  company: CompanyIntel;
  /** How the match was made — for transparency, never fabricated. */
  via: 'exact' | 'normalized' | 'alias' | 'fuzzy';
  /** 0–1 match strength used for ranking ambiguous matches. */
  score: number;
}
