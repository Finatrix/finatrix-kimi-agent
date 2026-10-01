/**
 * Statutory deposit protection, per market.
 *
 * WHY THIS IS NOT A NUMBER IN A MARKET PACK
 * -----------------------------------------
 * It very nearly was. Three of the four shipped market packs already mentioned
 * a protection limit — inside the prose describing an instrument ("FSCS
 * protected to £85,000", "FDIC insured to $250K per depositor", "DICGC insured
 * to ₹5L"). Prose is the worst possible home for a legal threshold:
 *
 *   • It carries no effective date, so nothing can tell you whether it is
 *     current. The UK figure rose to £120,000 on 1 December 2025 and the
 *     product went on saying £85,000 in three separate strings, each of which
 *     had to be found by hand.
 *   • It carries no conditions, so "protected to £85,000" reads as a promise
 *     about a balance when the real rule is per eligible person, per authorised
 *     firm, and two brands can share one authorisation.
 *   • It cannot be queried, so nothing could warn a user whose entered amount
 *     sits above the cap.
 *
 * So the limit is a dated record with its conditions attached, the prose points
 * at it, and `deposits.test.ts` fails if the two ever disagree.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 * ----------------------------------
 * It does not compute coverage. Coverage depends on the institution (is it an
 * insured bank or a fund manager?), the ownership category (sole, joint, trust,
 * retirement), and how many other accounts the person holds under the same
 * authorisation — none of which FinatriX knows. `compareToCap` therefore
 * returns a *conditional* comparison: "if this is held at one institution in one
 * name, it is above the cap". That is a true statement about the number the
 * user typed. "₹2,00,000 of your savings is uninsured" would not be.
 *
 * THE UAE IS NOT ZERO
 * -------------------
 * The research found the enabling provision in the Central Bank law and no
 * operative retail scheme, member list, cap or commencement date. That is an
 * evidence gap, not a finding that UAE deposits are unprotected. Rendering it as
 * `0`, as "unlimited", or by quietly borrowing another country's figure would
 * each be a fabrication; the record carries `null` and the UI says the details
 * need verification. This is the single most important behaviour in this file.
 */

import type { ChangeImpact, DataQualityState, IsoDate, ReferenceMarket } from './types';

export interface DepositProtection {
  readonly market: ReferenceMarket;
  /** The scheme operator, as it names itself. */
  readonly authority: string;
  /** Per eligible person per institution. `null` means not established. */
  readonly limit: number | null;
  readonly currency: string;
  /** How balances are added up before the cap is applied. */
  readonly aggregation: string;
  readonly eligible: string;
  readonly exclusions: string;
  /**
   * Joint accounts, or `null` where the authority's text does not settle it.
   * Mainland China is `null` deliberately — the national regulation is silent
   * on per-owner allocation and guessing would double a stated protection.
   */
  readonly jointAccounts: string | null;
  readonly effectiveDate: IsoDate;
  readonly lastVerified: string;
  readonly reviewDue: string;
  readonly quality: DataQualityState;
  readonly changeImpact: ChangeImpact;
  readonly sourceIds: readonly string[];
  /** Conditions a reader must check before treating the cap as their cover. */
  readonly applicability: string;
}

export const DEPOSIT_PROTECTION: readonly DepositProtection[] = [
  {
    market: 'IN',
    authority: 'DICGC',
    limit: 500000,
    currency: 'INR',
    aggregation: 'Same depositor, same right and capacity, same insured bank across all its branches — principal plus interest together.',
    eligible: 'Savings, current, recurring and fixed deposits at covered banks.',
    exclusions: 'Deposits held outside India, government and interbank deposits, and excluded entities. Investments are not deposits.',
    jointAccounts: 'The same names in the same order aggregate as one claim; a different order or capacity is treated separately under DICGC rules — not under US-style joint-category logic.',
    effectiveDate: '2020-02-04',
    lastVerified: '2026-09-12',
    reviewDue: '2026-12-12',
    quality: 'VERIFIED_CURRENT',
    changeImpact: 'HIGH',
    sourceIds: ['IND-DICGC-001', 'IND-DICGC-002'],
    applicability: 'Cover applies only to registered insured banks. A bank’s deregistration date and any set-off against borrowings can change what is actually paid.',
  },
  {
    market: 'AU',
    authority: 'APRA (Financial Claims Scheme)',
    limit: 250000,
    currency: 'AUD',
    aggregation: 'Per account holder per Australian-incorporated ADI. Brands sharing one ADI are covered once between them.',
    eligible: 'Eligible Australian-dollar deposit accounts.',
    exclusions: 'Foreign-currency deposits and investments. A foreign bank’s branch is not an Australian-incorporated ADI.',
    jointAccounts: 'Each holder’s equal share combines with their own eligible balances at the same ADI.',
    effectiveDate: '2012-02-01',
    lastVerified: '2026-09-12',
    reviewDue: '2026-12-12',
    quality: 'VERIFIED_CURRENT',
    changeImpact: 'HIGH',
    sourceIds: ['AUS-APRA-001', 'AUS-APRA-002', 'AUS-APRA-003'],
    applicability: 'The scheme pays out only once it has been activated for a failed institution; eligibility of the institution and the account both have to hold.',
  },
  {
    market: 'US',
    authority: 'FDIC',
    limit: 250000,
    currency: 'USD',
    aggregation: 'Per depositor, per FDIC-insured bank, per ownership category — the categories stack, so one person can hold more than $250,000 covered at one bank.',
    eligible: 'Checking, savings, money-market deposit accounts and certificates of deposit.',
    exclusions: 'Securities, mutual funds, annuities, crypto and safe-deposit contents. Credit unions are NCUA territory and need checking separately.',
    jointAccounts: 'Each eligible co-owner’s share aggregates within the joint category, subject to the category’s own conditions.',
    effectiveDate: '2010-07-21',
    lastVerified: '2026-09-12',
    reviewDue: '2026-12-12',
    quality: 'VERIFIED_CURRENT',
    changeImpact: 'HIGH',
    sourceIds: ['US-FDIC-001', 'US-FDIC-002'],
    applicability: 'Trust and retirement categories cannot be inferred from what an account is nicknamed — the category is a legal characterisation of the account.',
  },
  {
    market: 'GB',
    authority: 'FSCS',
    limit: 120000,
    currency: 'GBP',
    aggregation: 'Per eligible person per authorised firm. Banking brands frequently share one authorisation, so two accounts at two names can be covered once.',
    eligible: 'Eligible deposits at UK-authorised banks, building societies and credit unions.',
    exclusions: 'Investments and ineligible deposits. E-money safeguarding is not deposit insurance.',
    jointAccounts: 'Each eligible holder has their own limit; check the split and any other accounts held at the same authorisation.',
    effectiveDate: '2025-12-01',
    lastVerified: '2026-09-12',
    reviewDue: '2026-12-12',
    quality: 'VERIFIED_CURRENT',
    changeImpact: 'HIGH',
    sourceIds: ['UK-FSCS-001', 'UK-FSCS-002'],
    applicability: 'Temporary high balances after a life event are a separate, time-limited protection with their own conditions — not a standing extension of this limit.',
  },
  {
    market: 'SG',
    authority: 'SDIC',
    limit: 100000,
    currency: 'SGD',
    aggregation: 'Per depositor per Deposit Insurance Scheme member.',
    eligible: 'Eligible Singapore-dollar savings, fixed and current deposits, and SRS monies.',
    exclusions: 'Foreign-currency deposits, structured deposits, unit trusts, shares and other investments.',
    jointAccounts: 'Equal shares unless the member’s records say otherwise; a holder’s share combines with their sole accounts.',
    effectiveDate: '2024-04-01',
    lastVerified: '2026-09-12',
    reviewDue: '2026-12-12',
    quality: 'VERIFIED_CURRENT',
    changeImpact: 'HIGH',
    sourceIds: ['SG-SDIC-001', 'SG-SDIC-002'],
    applicability: 'CPFIS and Retirement Sum Scheme monies, and trust or client accounts, aggregate under their own rules — the ordinary cap is not a universal per-account formula.',
  },
  {
    market: 'CN',
    authority: 'Deposit Insurance Regulations (State Council)',
    limit: 500000,
    currency: 'CNY',
    aggregation: 'Same depositor at the same insured institution; principal and interest are added together.',
    eligible: 'Insured renminbi and foreign-currency deposits at institutions inside Mainland China.',
    exclusions: 'Interbank deposits, deposits of the institution’s own senior managers, and the statutory exclusions. Branches of foreign banks and overseas branches are outside the scheme — which is not the same as a locally incorporated foreign-owned bank, which is inside it.',
    // Genuinely unsettled in the national text. Open gate G-07 in the research
    // pack. Left null rather than assumed, because assuming equal shares would
    // silently double the protection a couple believes they have.
    jointAccounts: null,
    effectiveDate: '2015-05-01',
    lastVerified: '2026-09-12',
    reviewDue: '2026-12-12',
    quality: 'VERIFIED_CURRENT',
    changeImpact: 'HIGH',
    sourceIds: ['CN-MOJ-001', 'CN-SPP-001'],
    applicability: 'Mainland China only. These rules do not reach Hong Kong, Macau or Taiwan, each of which has its own arrangements.',
  },
  {
    market: 'AE',
    authority: 'Central Bank of the UAE',
    // See the file header. `null` is the finding.
    limit: null,
    currency: 'AED',
    aggregation: 'No operative retail cap has been verified.',
    eligible: 'Not established.',
    exclusions: 'Not established.',
    jointAccounts: null,
    effectiveDate: null,
    lastVerified: '2026-09-12',
    reviewDue: '2026-12-12',
    quality: 'NO_AUTHORITATIVE_DEFAULT',
    changeImpact: 'HIGH',
    sourceIds: ['UAE-CBUAE-001', 'UAE-CBUAE-002'],
    applicability: 'The Central Bank law contains a provision enabling a deposits guarantee scheme. An enabling power is not a scheme, and the research did not establish an operative retail cap, member list or commencement date. Ask your bank what protection your specific account carries.',
  },
];

const BY_MARKET: ReadonlyMap<ReferenceMarket, DepositProtection> = new Map(
  DEPOSIT_PROTECTION.map((d) => [d.market, d]),
);

export function depositProtectionFor(market: ReferenceMarket): DepositProtection | undefined {
  return BY_MARKET.get(market);
}

/**
 * How an entered amount sits against the statutory cap.
 *
 * Every branch is conditional on facts FinatriX does not hold, and the copy
 * that renders this must keep them conditional. `above` means "above the cap
 * IF held in one name at one institution" — not "partly uninsured".
 */
export type CapComparison =
  | { readonly kind: 'no-record' }
  /** A scheme exists on paper but no usable cap was verified. UAE today. */
  | { readonly kind: 'unverified'; readonly authority: string; readonly why: string }
  /**
   * The limit is known, but the amount is denominated in something else — so
   * there is a figure to show and nothing to compare it with.
   */
  | {
      readonly kind: 'not-comparable';
      readonly limit: number;
      readonly currency: string;
      readonly authority: string;
      readonly amountCurrency: string;
    }
  | { readonly kind: 'within'; readonly limit: number; readonly currency: string; readonly authority: string }
  | {
      readonly kind: 'above';
      readonly limit: number;
      readonly currency: string;
      readonly authority: string;
      /** How much sits beyond the cap at a single institution. */
      readonly excess: number;
    };

/**
 * How an amount sits against the cap — or why it cannot be said.
 *
 * `amountCurrency` is required rather than optional, and that is the whole
 * point of this signature. FinatriX deliberately lets someone read their totals
 * in one currency while comparing against another market's rules, which means a
 * caller can very easily hold ₹700,000 and a £120,000 limit and produce the
 * sentence "this is above the limit" out of a comparison that never happened.
 * Making the currency an argument turns that from a bug somebody has to
 * remember into one the type system asks about.
 *
 * No conversion is attempted. A converted figure would depend on a rate with a
 * date, which is a second uncertain reference stacked under a legal threshold —
 * and the answer would still not be a fact about anybody's protection.
 */
export function compareToCap(
  market: ReferenceMarket,
  amount: number,
  amountCurrency: string,
): CapComparison {
  const record = BY_MARKET.get(market);
  if (!record) return { kind: 'no-record' };
  if (record.limit === null) {
    return { kind: 'unverified', authority: record.authority, why: record.applicability };
  }
  const { limit, currency, authority } = record;
  if (amountCurrency !== currency) {
    return { kind: 'not-comparable', limit, currency, authority, amountCurrency };
  }
  // Non-finite and negative amounts are a caller bug, not a coverage question;
  // treat them as "nothing to say" rather than inventing a comparison.
  if (!Number.isFinite(amount) || amount <= 0) return { kind: 'within', limit, currency, authority };
  return amount > limit
    ? { kind: 'above', limit, currency, authority, excess: amount - limit }
    : { kind: 'within', limit, currency, authority };
}
