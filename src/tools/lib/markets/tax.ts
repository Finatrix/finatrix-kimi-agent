/**
 * How a parked-cash return is taxed — expressed as data rather than as a
 * jurisdiction-specific `if`.
 *
 * WHY THIS EXISTS
 * ---------------
 * ParkSmart's original `psTax` hard-coded three Indian treatments: taxed at
 * slab, taxed at slab after the 80TTA allowance, and equity capital gains with
 * a pro-rated LTCG exemption. Every one of those is a *shape* that other
 * jurisdictions also have — the UK's Personal Savings Allowance is an allowance
 * against the marginal rate exactly as 80TTA is, a Cash ISA is an exemption,
 * and the UAE's answer for a resident individual is "no tax at all".
 *
 * So the shapes live here as `TaxTreatment` records and each market supplies its
 * own map of them. Adding a market is adding data; it never means editing the
 * arithmetic that prices someone's savings.
 *
 * PARITY
 * ------
 * `netAfterTax` is written so that the three Indian treatments in
 * `markets/in.ts` reproduce `psTax` **operation for operation**, in the same
 * order, so the floating-point result is bit-identical rather than merely close.
 * `parksmart.parity.test.ts` compiles the original `psTax` out of the archived
 * tools-app.html and asserts exactly that across the full grid — if this file
 * ever drifts, that test fails rather than a user's post-tax figure quietly
 * changing. Read the branch comments as a contract, not as commentary.
 *
 * Pure. No storage, no DOM, no market imports (so a market pack may import it).
 */

export interface TaxTreatment {
  /**
   * Annual amount of the return that is exempt before tax applies, in the
   * market's own currency, pro-rated by holding period. India's 80TTA
   * (₹10,000) and the UK's Personal Savings Allowance (£1,000 at the basic
   * rate) are both this shape.
   *
   * Absent and zero are DIFFERENT: absent takes the plain `gross * (1 - rate)`
   * path, which is the one `psTax` uses for its `'slab'` kind and must stay
   * arithmetically identical to it.
   */
  allowance?: number;
  /**
   * An allowance that depends on the taxpayer's own rate. Supersedes
   * `allowance` when present.
   *
   * The UK's Personal Savings Allowance is the motivating case: £1,000 at the
   * basic rate, £500 at the higher rate and nothing at all at the additional
   * rate. Modelling that as a flat £1,000 would overstate the post-tax return
   * for exactly the people with the most at stake.
   *
   * No Indian treatment uses this, so the parity path never reaches it.
   */
  allowanceFor?: (marginalRate: number) => number;
  /**
   * The rate above the allowance, 0–1. Omitted means "the user's own marginal
   * rate", which is the common case for interest income.
   */
  rate?: number;
  /** Nothing is taxed: a Cash ISA, Premium Bonds, a UAE resident's deposit. */
  exempt?: boolean;
  /**
   * Capital-gains shape: a short-term flat rate, and a long-term rate with its
   * own pro-rated exemption once the holding period reaches `months`.
   */
  gains?: {
    months: number;
    allowance: number;
    rate: number;
    shortRate: number;
  };
}

/**
 * Post-tax return on `gross`, earned over `months`, for a taxpayer whose
 * marginal rate is `marginalRate` (0–1).
 *
 * The branch order is load-bearing — see the parity note at the top of the file.
 */
export function netAfterTax(
  treatment: TaxTreatment,
  gross: number,
  months: number,
  marginalRate: number,
): number {
  if (treatment.exempt) return gross;

  // Capital-gains shape. Mirrors psTax's `opt.tax === 'equity'` branch.
  if (treatment.gains) {
    const g = treatment.gains;
    if (months >= g.months) {
      const exempt = g.allowance * (months / 12);
      const taxable = Math.max(0, gross - exempt);
      return gross - taxable * g.rate;
    }
    return gross * (1 - g.shortRate);
  }

  const rate = treatment.rate ?? marginalRate;
  const allowance = treatment.allowanceFor
    ? treatment.allowanceFor(marginalRate)
    : treatment.allowance;

  // No allowance — the plain slab path. Written as a single multiplication
  // because that is what psTax does; `gross - gross * rate` is NOT always the
  // same float.
  if (!allowance) return gross * (1 - rate);

  // Allowance path. Mirrors psTax's `'slab80tta'` branch exactly.
  const exempt = allowance * (months / 12);
  const taxable = Math.max(0, gross - exempt);
  return gross - taxable * rate;
}
