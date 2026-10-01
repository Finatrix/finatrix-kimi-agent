/**
 * What is known to be unresolved, and what the product does about it.
 *
 * TWO LISTS, TWO PURPOSES
 * -----------------------
 * `OPEN_GATES` are things the evidence does not yet support. Each names a
 * feature that stays switched off and the specific thing that would have to be
 * true to switch it on. They are not a backlog of nice-to-haves; they are the
 * reason particular numbers do not appear on screen, written down so that a
 * future developer finding an empty space knows whether it is a gap or a
 * decision.
 *
 * `CONFLICTS` are places where two sources disagree, or where the repository
 * and the imported research disagree. The rule when that happens is not to pick
 * the newer one and move on. It is to record both values, say which was
 * preferred and why, and state plainly whether any behaviour changed — because
 * the cases where nothing changed are the ones a reader is most likely to
 * assume were missed.
 *
 * WHY BOTH ARE CODE
 * -----------------
 * Written in a document, both lists rot within a release. Written as typed data
 * they are rendered in the developer report, checked by tests for dangling
 * source ids, and impossible to delete by accident. A gate that closes is a
 * one-line edit here with a test that notices.
 */

import type { ReferenceMarket } from './types';

export type GateStatus =
  | 'NO_VERIFIED_VALUE'
  | 'LATEST_NOT_VERIFIED'
  | 'REVIEW_DUE'
  | 'PARTIAL'
  | 'NOT_APPROVED'
  | 'NOT_INGESTED';

export interface OpenGate {
  readonly id: string;
  /** `null` where the gate applies to every market. */
  readonly market: ReferenceMarket | null;
  readonly area: string;
  readonly status: GateStatus;
  /** What FinatriX does today because of this gate. */
  readonly productBehaviour: string;
  /** What would have to be established before that behaviour may change. */
  readonly requiredToClose: string;
  readonly sourceIds: readonly string[];
}

export const OPEN_GATES: readonly OpenGate[] = [
  {
    id: 'G-01', market: 'AE', area: 'Deposit protection', status: 'NO_VERIFIED_VALUE',
    productBehaviour: 'ParkSmart shows no protection figure for the UAE and says the details need verification with the bank. It does not show zero, and it does not borrow another market’s cap.',
    requiredToClose: 'An operative scheme regulation naming the member institutions, the cap and its commencement date. The Central Bank law’s enabling provision is not sufficient.',
    sourceIds: ['UAE-CBUAE-001', 'UAE-CBUAE-002'],
  },
  {
    id: 'G-02', market: 'AE', area: 'Current inflation', status: 'LATEST_NOT_VERIFIED',
    productBehaviour: 'The UAE inflation observation is shown as a dated historical quarter and is never badged as the latest reading.',
    requiredToClose: 'The statistics authority’s current national CPI table. A forecast in a central-bank review is not an observation.',
    sourceIds: ['UAE-CBUAE-003'],
  },
  {
    id: 'G-03', market: 'IN', area: 'Inflation release cutoff', status: 'REVIEW_DUE',
    productBehaviour: 'India’s CPI observation renders as provisional July data with its review status visible.',
    requiredToClose: 'Confirmation of the August release and its publication date.',
    sourceIds: ['IND-NSO-001', 'IND-NSO-002'],
  },
  {
    id: 'G-04', market: 'AU', area: 'Superannuation caps and Medicare thresholds', status: 'PARTIAL',
    productBehaviour: 'No Australian contribution cap or Medicare threshold is stated anywhere in the product. Australia is available in the tools with user-entered cash rates and historical published peer summaries.',
    requiredToClose: 'Complete current-period tables from the tax office. Corroboration from a super fund is not the same as the authority’s own current-period table.',
    sourceIds: ['AUS-ATO-003', 'AUS-CSC-001', 'AUS-ATO-004'],
  },
  {
    id: 'G-05', market: null, area: 'Total-tax automation', status: 'NOT_APPROVED',
    productBehaviour: 'No tool computes a tax liability in any market. Where a tax figure is needed the user supplies their marginal rate or their actual take-home pay.',
    requiredToClose: 'Verified treatment of rebates, deductions, surcharges, social charges and applicability for whatever scope is promised. Rate bands alone are not enough, and this is deliberately not on the roadmap.',
    sourceIds: [],
  },
  {
    id: 'G-06', market: null, area: 'Peer statistics activation', status: 'NOT_INGESTED',
    productBehaviour: 'PeerCompare continues to use FinatriX’s own labelled benchmark grids with their stated populations. AU, SG and CN now display separately documented official summary points, not distribution cells. The existing four-market modeled-percentile interface remains unchanged; it must not be mistaken for a verified survey percentile.',
    requiredToClose: 'Licensed extraction of table cells or microdata, complete sample, weighting and precision metadata, and a statistical reviewer’s sign-off on a cell-level uncertainty policy.',
    sourceIds: [],
  },
  {
    id: 'G-07', market: 'CN', area: 'Deposit joint-account allocation', status: 'NO_VERIFIED_VALUE',
    productBehaviour: 'The Mainland China deposit record leaves joint-account treatment blank and the UI says so, rather than assuming equal shares.',
    requiredToClose: 'Authoritative treatment of per-owner allocation. Assuming equal shares would double the protection a couple believes they hold.',
    sourceIds: ['CN-MOJ-001'],
  },
  {
    id: 'G-08', market: 'SG', area: 'CPF contribution and allocation engine', status: 'PARTIAL',
    productBehaviour: 'No CPF contribution or allocation figure appears anywhere in the product. Singapore is available in the tools; CPF entitlements are not projected.',
    requiredToClose: 'The full status, low-wage and allocation tables with their transition conditions and rounding rules. One headline table is not a CPF engine, and no single percentage is right for every member.',
    sourceIds: ['SG-CPF-001', 'SG-CPF-002'],
  },
  {
    id: 'G-09', market: null, area: 'Formula parity', status: 'PARTIAL',
    productBehaviour: 'Closed for this change: no formula was touched, and the parity suites in src/test/parity ran unchanged and green. The gate stays listed because it reopens the moment any calculation change is proposed.',
    requiredToClose: 'Any future proposal to change a formula or scoring convention needs a parity analysis and explicit authorisation before implementation.',
    sourceIds: [],
  },
  {
    id: 'G-10', market: null, area: 'Evidence snapshots and licensing', status: 'PARTIAL',
    productBehaviour: 'Source records carry URLs, dates and a verification scope, but no archived snapshot or checksum. The separate peer-summary layer archives evidence and terms for its four published summary points. These do not enable distribution-level ranking.',
    requiredToClose: 'Archived copies of the exact source versions, confirmed redistribution terms, and evidence locators with checksums — required before any survey cell is republished.',
    sourceIds: [],
  },
];

export type ConflictResolution =
  /** The repository value was corrected to match better evidence. */
  | 'REPOSITORY_UPDATED'
  /** The repository value was kept; it is the better or more specific evidence. */
  | 'REPOSITORY_PREFERRED'
  /** Neither is clearly right. Nothing changed, and the disagreement is recorded. */
  | 'UNRESOLVED_NO_CHANGE';

export interface ReferenceConflict {
  readonly id: string;
  readonly market: ReferenceMarket | null;
  readonly subject: string;
  /** What the repository said before this change. */
  readonly repositoryValue: string;
  /** What the imported research says. */
  readonly packValue: string;
  readonly resolution: ConflictResolution;
  readonly reasoning: string;
  /** Whether any number a user sees moved. Almost always "no". */
  readonly calculationImpact: string;
  readonly sourceIds: readonly string[];
}

export const CONFLICTS: readonly ReferenceConflict[] = [
  {
    id: 'C-01',
    market: 'GB',
    subject: 'FSCS deposit protection limit',
    repositoryValue: '£85,000, stated in three instrument descriptions and once in the closing notes of the UK market pack.',
    packValue: '£120,000, effective 1 December 2025, from the FSCS’s own deposit-limit page.',
    resolution: 'REPOSITORY_UPDATED',
    reasoning:
      'The scheme operator publishing its own limit, with a commencement date, is the strongest possible evidence. The repository figure was the previous limit, left behind in prose where nothing could notice it had lapsed. The corrected value now lives in the deposit registry and the prose cites it, so the two cannot drift apart again.',
    calculationImpact:
      'None. The limit appeared only in descriptive text; it was never an operand. Post-tax returns, rankings and every parity fixture are byte-identical.',
    sourceIds: ['UK-FSCS-001', 'UK-FSCS-002'],
  },
  {
    id: 'C-02',
    market: 'IN',
    subject: 'The ₹12 lakh nil-tax point described as a zero-rate band',
    repositoryValue: 'The marginal-rate control offered “0% (income under ₹12L, new regime)”.',
    packValue:
      'The verified new-regime schedule has a 0% band to ₹4,00,000. The point at which no tax is payable is reached through a rebate with resident-eligibility conditions and marginal relief — not through a band.',
    resolution: 'REPOSITORY_UPDATED',
    reasoning:
      'Both statements produce the same choice for most salaried residents, so this is a mechanism error rather than an arithmetic one — but it is the mechanism that decides who it is true for, and the research flags it explicitly. The label now describes the nil-tax threshold without asserting a figure this layer cannot verify for the current tax year, and the methodology disclosure explains the rebate.',
    calculationImpact: 'None. The option’s value is 0% before and after; only its label changed.',
    sourceIds: ['IND-ITD-003', 'IND-ITD-004'],
  },
  {
    id: 'C-03',
    market: 'AE',
    subject: 'UAE bank deposits shown with the same principal-risk framing as insured deposits elsewhere',
    repositoryValue: 'UAE savings and term deposits carry the “None*” principal-risk marker used in markets where a statutory guarantee was verified.',
    packValue: 'No operative retail deposit guarantee, member scope, cap or commencement date could be verified for the UAE.',
    resolution: 'UNRESOLVED_NO_CHANGE',
    reasoning:
      'The risk marker describes institutional credit risk, which is a real and separate thing from insurance, so overwriting it would assert a different claim rather than a more accurate one — and the absence of verified evidence is not evidence of absence. The honest fix is additive: ParkSmart now carries a protection block that says, for the UAE specifically, that the details need verifying with the bank. Nothing was deleted and nothing was invented.',
    calculationImpact: 'None. No field was changed.',
    sourceIds: ['UAE-CBUAE-001', 'UAE-CBUAE-002'],
  },
  {
    id: 'C-04',
    market: 'GB',
    subject: 'Personal Savings Allowance taper',
    repositoryValue: '£1,000 at the basic rate, £500 at the higher rate, nil at the additional rate — modelled as a function of the marginal rate.',
    packValue: 'The research names the tax authority’s savings-interest page as a source but did not extract the allowance values.',
    resolution: 'REPOSITORY_PREFERRED',
    reasoning:
      'The repository is the more specific evidence here, and it is modelled properly rather than flattened to one figure — which is exactly the comparison the UK tool exists to make. Replacing a working, more detailed implementation with a gap in the imported pack would be a regression dressed as an integration.',
    calculationImpact: 'None. Deliberately untouched.',
    sourceIds: ['UK-HMRC-005'],
  },
  {
    id: 'C-05',
    market: null,
    subject: 'Long-run planning inflation versus the latest published CPI',
    repositoryValue: 'A planning assumption per market — 6% for India, 2.5% elsewhere — used to grow a goal stated in today’s money.',
    packValue: 'Published year-on-year CPI observations ranging from 0.8% to 4.45%, each for a single stated month.',
    resolution: 'REPOSITORY_PREFERRED',
    reasoning:
      'These are not competing answers to one question; they answer two different questions. A single month’s reading is an observation of the recent past and is far too volatile to plan a decade against, and the research is emphatic that a current print must never become a projection input. The planning assumption stays exactly where it is and the CPI observation renders beside it as context, so a reader can judge the assumption without the product silently adopting the print.',
    calculationImpact: 'None, by design. The two values are structurally prevented from meeting — a test asserts no calculator imports the observations module.',
    sourceIds: ['IND-NSO-001', 'AUS-ABS-001', 'US-BLS-001', 'UK-ONS-001', 'SG-MTI-001', 'CN-NBS-001', 'UAE-CBUAE-003'],
  },
  {
    id: 'C-06',
    market: null,
    subject: 'Months of expenses to keep accessible',
    repositoryValue: '“3–6 months” in most markets, and 6 months in the UAE on the grounds that there is no state safety net.',
    packValue: 'Australian regulator guidance of 3 months, with an explicit note that the familiar 3–6 range is an educational convention rather than a verified rule anywhere.',
    resolution: 'REPOSITORY_PREFERRED',
    reasoning:
      'The research classifies this as guidance from one country, not a global minimum, and says so in terms. The repository already presents it as a range rather than a threshold and already varies it by local circumstance, which is the more careful treatment of the two. It is recorded in the heuristic registry as government guidance with its origin market named, so nobody later mistakes it for a rule.',
    calculationImpact: 'None. Deliberately untouched.',
    sourceIds: ['AUS-ASIC-002'],
  },
];

export function gatesForMarket(market: ReferenceMarket): readonly OpenGate[] {
  return OPEN_GATES.filter((g) => g.market === market || g.market === null);
}

export function conflictsForMarket(market: ReferenceMarket): readonly ReferenceConflict[] {
  return CONFLICTS.filter((c) => c.market === market || c.market === null);
}
