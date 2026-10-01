/**
 * Peer-comparison dataset registry — metadata, and deliberately no numbers.
 *
 * WHAT THIS IS FOR
 * ----------------
 * PeerCompare already ships benchmark grids inside each market pack. Those stay
 * exactly where they are and exactly as they are: they are hand-built from named
 * public statistics, interpolated onto the tool's age bands, and each pack
 * already states its own `population` and `basis`. Replacing working, labelled
 * data with half-ingested survey cells would be a downgrade.
 *
 * What was missing was the layer underneath: which published dataset a
 * comparison is ultimately standing on, what its observation period is, what
 * unit it counts, and whether it is fit to support the kind of claim the product
 * wants to make. That is what this file holds.
 *
 * NO BENCHMARK VALUE APPEARS HERE, AND THAT IS THE POINT
 * -----------------------------------------------------
 * The research pack catalogued nineteen candidate datasets and approved exactly
 * zero of them for percentile ranking. The reasons are not bureaucratic:
 *
 *   • A median tells you which side of the middle someone is on. It cannot
 *     produce a percentile. Neither can a quintile group mean, which is an
 *     average *within* a band and not the band's boundary.
 *   • Units differ in ways that look comparable and are not: a household, a
 *     family economic unit, a "consumer unit" and a person are four different
 *     denominators, and equivalised disposable income is not take-home pay.
 *   • Periods differ: an Indian debt-and-investment survey published in 2021
 *     values balance sheets as at mid-2018.
 *   • Two national sources carry live quality warnings — Great Britain's wealth
 *     survey had its accreditation suspended and excludes Northern Ireland.
 *   • Redistribution terms have not been confirmed for any of them. Public
 *     access is not a licence to republish cells.
 *
 * So `percentileEnabled` is false on every record, `valuesIngested` is false on
 * every record, and `remainingWork` says what would have to be true. When a
 * dataset is genuinely ready, that is a change to one record plus a test.
 *
 * THREE RECORDS DESCRIBE AN ABSENCE
 * ---------------------------------
 * The UAE, Mainland China and Singapore wealth gaps are recorded as datasets
 * with no dataset. Keeping a named record for "we looked and there is nothing
 * usable" is what stops the same search being repeated, and what lets the UI say
 * "a comparable reference is not available" for a specific reason.
 */

import type { ReferenceMarket } from './types';

export type DatasetUnit =
  | 'HOUSEHOLD'
  | 'FAMILY_ECONOMIC_UNIT'
  | 'CONSUMER_UNIT'
  | 'INDIVIDUAL'
  | 'EQUIVALISED_HOUSEHOLD'
  | 'AGGREGATE_SECTOR'
  | 'NONE';

export type DatasetMeasure = 'INCOME' | 'EXPENDITURE' | 'WEALTH' | 'EARNINGS' | 'NONE';

export interface PeerDataset {
  readonly id: string;
  readonly market: ReferenceMarket;
  /** Null on a gap record — there is no dataset to name. */
  readonly title: string | null;
  readonly publisher: string | null;
  readonly sourceId: string | null;
  readonly measure: DatasetMeasure;
  readonly unit: DatasetUnit;
  /** What period the data DESCRIBES, which is rarely when it was published. */
  readonly observationPeriod: string | null;
  readonly geography: string;
  readonly currency: string;
  /** Why this cannot be used as-is. Always populated. */
  readonly limitations: string;
  /** Always false in this version. */
  readonly valuesIngested: false;
  /** Always false in this version. */
  readonly percentileEnabled: false;
  /** What would have to be done before either flag could change. */
  readonly remainingWork: string;
  readonly lastVerified: string;
  readonly reviewDue: string;
}

export const PEER_DATASETS: readonly PeerDataset[] = [
  {
    id: 'IN-HCES-2023-24', market: 'IN',
    title: 'Household Consumption Expenditure Survey 2023–24 (Report 592)', publisher: 'NSO', sourceId: 'IND-NSO-003',
    measure: 'EXPENDITURE', unit: 'HOUSEHOLD', observationPeriod: 'August 2023 – July 2024',
    geography: 'India, states and union territories', currency: 'INR',
    limitations: 'Published per-person monthly consumption is expenditure, not income, and recall-period and free-item imputation variants change comparability.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Extract the fractile tables, confirm the imputation variant, and match FinatriX spending categories to the survey’s before any comparison is shown.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  {
    id: 'IN-AIDIS-2019', market: 'IN',
    title: 'All India Debt & Investment Survey, NSS 77th round', publisher: 'NSO', sourceId: 'IND-NSO-004',
    measure: 'WEALTH', unit: 'HOUSEHOLD', observationPeriod: 'Balance sheet as at 30 June 2018',
    geography: 'India', currency: 'INR',
    limitations: 'Published in 2021 but valued in 2018. Asset definitions differ from investable net worth.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Treat as historical context only. A present-day percentile cannot be derived from it at all.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  {
    id: 'IN-PLFS-2025', market: 'IN',
    title: 'Periodic Labour Force Survey Annual Report 2025 (revised)', publisher: 'NSO', sourceId: 'IND-NSO-005',
    measure: 'EARNINGS', unit: 'INDIVIDUAL', observationPeriod: 'Calendar 2025',
    geography: 'India', currency: 'INR',
    limitations: 'Worker earnings by employment status, on differing daily and 30-day bases. The self-employment average excludes zero and unreported earnings, so it is not household income.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Extract per-table sample sizes and denominators, and restrict any comparison to matching worker groups.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  {
    id: 'AU-SIH-2019-20', market: 'AU',
    title: 'Survey of Income and Housing / Household Income and Wealth', publisher: 'ABS', sourceId: 'AUS-ABS-002',
    measure: 'INCOME', unit: 'EQUIVALISED_HOUSEHOLD', observationPeriod: '2019–20',
    geography: 'Australia', currency: 'AUD',
    limitations: 'Fieldwork disrupted by bushfires and COVID. Equivalised income is not household cash income, and the period is now several years old.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Disclose the survey date prominently and match the equivalisation basis before comparing anything.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  {
    id: 'AU-HES-2015-16', market: 'AU',
    title: 'Household Expenditure Survey: Summary of Results', publisher: 'ABS', sourceId: 'AUS-ABS-003',
    measure: 'EXPENDITURE', unit: 'HOUSEHOLD', observationPeriod: '2015–16',
    geography: 'Australia', currency: 'AUD',
    limitations: 'A decade old. Neither the spending composition nor the prices describe a current cost of living.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Historical illustration only. Must never be presented as a current budget benchmark.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  {
    id: 'US-SCF-2022', market: 'US',
    title: 'Survey of Consumer Finances (2022)', publisher: 'Federal Reserve', sourceId: 'US-FED-001',
    measure: 'WEALTH', unit: 'FAMILY_ECONOMIC_UNIT', observationPeriod: '2022',
    geography: 'United States', currency: 'USD',
    limitations: 'The strongest wealth candidate found, and still not usable raw: the five implicates are multiple imputations of the same families, not five families, and replicate weights are required for any interval.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Extract with all implicates and replicate weights, agree a tie convention, and have a statistical reviewer approve a cell-level uncertainty policy.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  {
    id: 'US-CPS-2024', market: 'US',
    title: 'CPS Household Income table HINC-01 (2024 income)', publisher: 'US Census Bureau', sourceId: 'US-CENSUS-001',
    measure: 'INCOME', unit: 'HOUSEHOLD', observationPeriod: '2024 income / 2025 ASEC',
    geography: 'United States', currency: 'USD',
    limitations: 'Money income before taxes — not disposable income, and not comparable with take-home pay.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Pull sample sizes and weights from the technical documentation; refresh when the 2025 income release lands.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  {
    id: 'US-CE-2024', market: 'US',
    title: 'Consumer Expenditures in 2024', publisher: 'BLS', sourceId: 'US-BLS-002',
    measure: 'EXPENDITURE', unit: 'CONSUMER_UNIT', observationPeriod: '2024',
    geography: 'United States', currency: 'USD',
    limitations: 'A consumer unit is not a household, and pension contributions can count as spending here — so income minus expenditure is not savings.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Map the survey’s categories onto FinatriX’s before any category-level comparison.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  {
    id: 'GB-WAS-2020-22', market: 'GB',
    title: 'Household total wealth in Great Britain', publisher: 'ONS', sourceId: 'UK-ONS-002',
    measure: 'WEALTH', unit: 'HOUSEHOLD', observationPeriod: 'April 2020 – March 2022',
    geography: 'Great Britain — excludes Northern Ireland', currency: 'GBP',
    limitations: 'Accreditation suspended with granular quality concerns, and Great Britain is not the United Kingdom. Includes private pension valuations, unlike several other wealth surveys.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Granular ranks stay suppressed until the quality review concludes. Broad dated context only, with the coverage gap stated.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  {
    id: 'GB-LCF-2024-25', market: 'GB',
    title: 'Family spending in the UK', publisher: 'ONS', sourceId: 'UK-ONS-003',
    measure: 'EXPENDITURE', unit: 'HOUSEHOLD', observationPeriod: 'April 2024 – March 2025',
    geography: 'United Kingdom', currency: 'GBP',
    limitations: 'Small subgroup samples, and the equivalisation method changed in this release.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Review subgroup uncertainty and restrict to broad expenditure groups.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  {
    id: 'GB-HDI-2023-24', market: 'GB',
    title: 'Average household income, UK (FYE 2024)', publisher: 'ONS', sourceId: 'UK-ONS-005',
    measure: 'INCOME', unit: 'EQUIVALISED_HOUSEHOLD', observationPeriod: 'Financial year ending 2024',
    geography: 'United Kingdom', currency: 'GBP',
    limitations: 'Equivalised disposable income cannot be compared with raw household take-home pay without applying the same scale.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Verify the equivalisation scale and price year per table; refresh when FYE 2025 publishes.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  {
    id: 'SG-KHIT-2025', market: 'SG',
    title: 'Key Household Income Trends, 2025', publisher: 'Singapore Department of Statistics', sourceId: 'SG-DOS-001',
    measure: 'INCOME', unit: 'HOUSEHOLD', observationPeriod: '2025',
    geography: 'Singapore resident households', currency: 'SGD',
    limitations: 'The 2025 report introduces a market-income framing that cannot be spliced onto the older employed-household work-income series, and employer CPF treatment differs by table.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Settle which definition FinatriX compares against, and whether employer CPF is inside or outside it.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  {
    id: 'SG-HES-2023', market: 'SG',
    title: 'Key Indicators of the Household Expenditure Survey', publisher: 'Singapore Department of Statistics', sourceId: 'SG-DOS-002',
    measure: 'EXPENDITURE', unit: 'HOUSEHOLD', observationPeriod: '2023',
    geography: 'Singapore', currency: 'SGD',
    limitations: 'Income figures include employer CPF, so they cannot be set against take-home pay. Quintile means are not quintile boundaries.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Obtain the full release metadata; quintile means can never yield percentiles.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  {
    id: 'CN-INCOME-2025', market: 'CN',
    title: '2025 resident income and consumption expenditure', publisher: 'NBS', sourceId: 'CN-NBS-002',
    measure: 'INCOME', unit: 'HOUSEHOLD', observationPeriod: '2025',
    geography: 'Mainland China; regional releases are separate', currency: 'CNY',
    limitations: 'Per-capita household resources are not an individual salary, and half-year figures must not be compared with full-year ones.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'National or urban/rural context at most. No fine personal percentile is supportable.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  {
    id: 'AE-HIES-2024', market: 'AE',
    title: 'Household Income and Expenditure Survey 2024 (launch announcement)', publisher: 'FCSC / Ministry of Community Development', sourceId: 'UAE-FCSC-001',
    measure: 'INCOME', unit: 'HOUSEHOLD', observationPeriod: '2024 planned fieldwork',
    geography: 'United Arab Emirates', currency: 'AED',
    limitations: 'A survey launch is not survey results. The 19,000 figure is a target sample, not an achieved one, and no public national table, licence or weighting has been verified.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Blocked until released tables and population coverage exist and can be verified.',
    lastVerified: '2026-09-12', reviewDue: '2026-10-01',
  },
  // ---- Recorded absences. A named gap stops the same search being repeated. ----
  {
    id: 'AE-wealth-GAP', market: 'AE',
    title: null, publisher: null, sourceId: null,
    measure: 'WEALTH', unit: 'NONE', observationPeriod: null,
    geography: 'United Arab Emirates', currency: 'AED',
    limitations: 'No verified public national wealth distribution with usable table or microdata metadata was found.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Do not generate a wealth comparison for this market. Revisit if the statistics authority publishes a distribution.',
    lastVerified: '2026-09-12', reviewDue: '2026-12-12',
  },
  {
    id: 'CN-wealth-GAP', market: 'CN',
    title: null, publisher: null, sourceId: null,
    measure: 'WEALTH', unit: 'NONE', observationPeriod: null,
    geography: 'Mainland China', currency: 'CNY',
    limitations: 'Central-bank urban survey leads do not establish a current national household wealth distribution.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Do not generate a wealth comparison for this market.',
    lastVerified: '2026-09-12', reviewDue: '2026-12-12',
  },
  {
    id: 'SG-wealth-GAP', market: 'SG',
    title: null, publisher: null, sourceId: null,
    measure: 'WEALTH', unit: 'AGGREGATE_SECTOR', observationPeriod: null,
    geography: 'Singapore', currency: 'SGD',
    limitations: 'The household sector balance sheet is a macro aggregate. It contains no household-level distribution, and no personal percentile can be derived from it.',
    valuesIngested: false, percentileEnabled: false,
    remainingWork: 'Do not generate a wealth percentile for this market from sector accounts.',
    lastVerified: '2026-09-12', reviewDue: '2026-12-12',
  },
];

export function peerDatasetsFor(market: ReferenceMarket): readonly PeerDataset[] {
  return PEER_DATASETS.filter((d) => d.market === market);
}

/**
 * Whether a true percentile may be computed for this market.
 *
 * False everywhere, and it should stay false until a statistical reviewer signs
 * off a cell-level uncertainty policy. PeerCompare's existing output is a
 * comparison against a labelled benchmark grid with a stated population — which
 * is a different and more modest claim than a population percentile, and is why
 * that tool is unaffected by this returning false.
 */
export function canRankPercentile(_market: ReferenceMarket): false {
  void _market;
  return false;
}
