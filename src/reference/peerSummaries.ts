/** Published summary points, not distribution cells or percentile inputs.
 * Evidence locators and file hashes: docs/evidence/seven-markets-2026-09-12/manifest.json.
 * These historical snapshots remain dated; no inflation update is implied.
 */
import type { ReferenceMarket } from './types';

export interface PeerSummary {
  readonly id: string;
  readonly market: ReferenceMarket;
  readonly label: string;
  readonly value: number;
  readonly currency: string;
  readonly period: string;
  readonly unit: string;
  readonly population: string;
  readonly definition: string;
  readonly limitation: string;
  readonly sourceId: string;
  readonly sourceUrl: string;
  readonly sourceLabel: string;
  readonly locator: string;
  readonly attribution: string;
  readonly licenceUrl: string;
  readonly lastVerified: string;
  readonly negativeAllowed: boolean;
}

export const PEER_SUMMARIES: readonly PeerSummary[] = [
  {
    id: 'AU-SIH-2019-20-GROSS-MEDIAN', market: 'AU', label: 'Median weekly gross household income',
    value: 1786, currency: 'AUD', period: '2019–20', unit: 'per household per week',
    population: 'Households in Australian private dwellings, excluding very remote areas.',
    definition: 'Combined household income before income tax and Medicare deductions. Use the same weekly basis and 2019–20 dollars.',
    limitation: 'Historical survey of 15,011 households. Not a current salary benchmark or an age/city comparison. No inflation uplift has been applied.',
    sourceId: 'AUS-ABS-004', sourceUrl: 'https://www.abs.gov.au/statistics/economy/finance/household-income-and-wealth-australia/2019-20',
    sourceLabel: 'ABS — Household Income and Wealth, 2019–20', locator: 'Table 1a, median weekly gross household income, 2019–20 column',
    attribution: 'Source: Australian Bureau of Statistics. © Commonwealth of Australia. Published value reproduced without adjustment; CC BY 4.0.',
    licenceUrl: 'https://www.abs.gov.au/website-privacy-copyright-and-disclaimer', lastVerified: '2026-09-12', negativeAllowed: true,
  },
  {
    id: 'AU-SIH-2019-20-WEALTH-MEDIAN', market: 'AU', label: 'Median household net worth',
    value: 579200, currency: 'AUD', period: '2019–20', unit: 'per household',
    population: 'Households in Australian private dwellings, excluding very remote areas.',
    definition: 'All household assets less all liabilities, including property and superannuation. Use values on the same 2019–20 price basis.',
    limitation: 'Historical estimate; wealth is highly uneven. A national median does not describe your age, location or household needs.',
    sourceId: 'AUS-ABS-004', sourceUrl: 'https://www.abs.gov.au/statistics/economy/finance/household-income-and-wealth-australia/2019-20',
    sourceLabel: 'ABS — Household Income and Wealth, 2019–20', locator: 'Table 1b, median household net worth, 2019–20 column',
    attribution: 'Source: Australian Bureau of Statistics. © Commonwealth of Australia. Published value reproduced without adjustment; CC BY 4.0.',
    licenceUrl: 'https://www.abs.gov.au/website-privacy-copyright-and-disclaimer', lastVerified: '2026-09-12', negativeAllowed: true,
  },
  {
    id: 'SG-KHIT-2025-MARKET-MEDIAN', market: 'SG', label: 'Median monthly household market income',
    value: 12446, currency: 'SGD', period: '2025 (preliminary)', unit: 'per household per month',
    population: 'Resident households: the household reference person is a Singapore citizen or permanent resident. Includes non-employed households.',
    definition: 'Income before government transfers and taxes, including employment, one-twelfth of annual bonuses, employer CPF and non-employment income. This is not monthly take-home pay.',
    limitation: 'The 2025 report expands both income definition and household coverage. Do not compare personal salary or splice older work-income medians into this series.',
    sourceId: 'SG-DOS-005', sourceUrl: 'https://www.singstat.gov.sg/files/b0eafa31-0ac6-4684-b2cd-4a264ce8d820.pdf',
    sourceLabel: 'SingStat — Key Household Income Trends, 2025', locator: 'Printed page 6, paragraph 6 / Chart 1; glossary pages 18–19',
    attribution: 'Contains information from Key Household Income Trends, 2025, Singapore Department of Statistics, accessed 12 September 2026, under Singapore Open Data Licence v1.0. Value unchanged.',
    licenceUrl: 'https://data.gov.sg/open-data-licence', lastVerified: '2026-09-12', negativeAllowed: true,
  },
  {
    id: 'CN-NBS-2025-DISPOSABLE-MEDIAN', market: 'CN', label: 'Median annual per-capita disposable income',
    value: 36231, currency: 'CNY', period: '2025', unit: 'per person per year, household survey basis',
    population: 'Mainland China residents in the national household income and expenditure survey. Includes urban and rural residents.',
    definition: 'Household disposable income on a per-member basis across the full year; includes more than wage income. This is not a median employee salary.',
    limitation: 'National summary, not an age, city, hukou or occupation benchmark. Does not cover Hong Kong, Macau or Taiwan. No wealth distribution is inferred.',
    sourceId: 'CN-NBS-004', sourceUrl: 'https://www.stats.gov.cn/english/PressRelease/202601/t20260120_1962356.html',
    sourceLabel: 'NBS — Households’ Income and Consumption Expenditure in 2025', locator: 'Section I, second paragraph: nationwide median per-capita disposable income',
    attribution: 'Quoted from the website of the National Bureau of Statistics of China (www.stats.gov.cn). Published statistic unchanged.',
    licenceUrl: 'https://www.stats.gov.cn/english/nbs/200701/t20070104_59236.html', lastVerified: '2026-09-12', negativeAllowed: true,
  },
];

export function peerSummariesFor(market: ReferenceMarket): readonly PeerSummary[] {
  return PEER_SUMMARIES.filter((r) => r.market === market);
}
