/**
 * Where a market-specific figure came from, when it took effect, when anyone
 * last checked it, and what it does not cover.
 *
 * TWO COMPONENTS, TWO JOBS
 * ------------------------
 * `ReferenceRows` is the detail, and it lives inside the "How this is
 * calculated" drawer — closed by default, because a result view that opens as a
 * specification is not a result view. It renders whatever the reference layer
 * says a tool used, including the entries that have no value, because "we do
 * not have a verified figure for your market" is one of the more useful things
 * this product can say.
 *
 * `DepositProtectionNote` is the exception that earns a place on the page
 * itself. Someone deciding where to park a large balance is making a decision
 * that the protection limit bears on directly — it is not background to the
 * answer, it is part of it — and burying it two clicks deep would be filing a
 * material fact under methodology.
 *
 * EVERYTHING IS CONDITIONAL, ON PURPOSE
 * -------------------------------------
 * The protection note never says an amount is insured. It cannot: cover depends
 * on the institution, the account type and how it is owned, and FinatriX knows
 * none of those. It says what the limit is, and — if the user's figure is above
 * it — that a balance held in one name at one institution would sit beyond it.
 * The conditional is not hedging; it is the difference between a true statement
 * and a false one.
 */

import { useMemo } from 'react';
import { compareToCap, depositProtectionFor } from '../../reference/deposits';
import { referenceDisclosureFor, type DisclosureItem } from '../../reference/disclosure';
import { verifiedLabel } from '../../reference/freshness';
import type { ReferenceMarket } from '../../reference/types';

/** A small state chip. Absent entirely when there is nothing to flag. */
function FreshnessChip({ item }: { item: DisclosureItem }) {
  if (!item.freshness.showsWarning) return null;
  const stale = item.freshness.state === 'STALE';
  return (
    <span
      className="fx-ref-chip"
      data-tone={stale ? 'stale' : 'due'}
      /* The chip is a visual shorthand for text that is already in the row, so
         it is announced as a label rather than left as a bare colour cue. */
      aria-label={stale ? 'This reference may be out of date' : 'This reference is due for review'}
    >
      {stale ? 'May be out of date' : 'Due for review'}
    </span>
  );
}

function Row({ item }: { item: DisclosureItem }) {
  return (
    <div className="fx-ref-row">
      <div className="fx-ref-head">
        <span className="fx-ref-label">{item.label}</span>
        {item.value !== null ? (
          <span className="fx-ref-value">{item.value}</span>
        ) : (
          <span className="fx-ref-value fx-ref-absent">Not available</span>
        )}
      </div>

      {item.absence && <p className="fx-ref-note fx-ref-absent-note">{item.absence}</p>}
      <p className="fx-ref-note">{item.applicability}</p>

      <div className="fx-ref-meta">
        {item.effectiveFrom && <span>Applies from {item.effectiveFrom}</span>}
        <span>Last reviewed {verifiedLabel(item.lastReviewed)}</span>
        <FreshnessChip item={item} />
      </div>

      {item.sources.length > 0 && (
        <ul className="fx-ref-sources">
          {item.sources.map((s) => (
            <li key={s.id}>
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="fx-method-link">
                {s.authority} — {s.title}
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The reference rows for a tool in a market, or nothing at all.
 *
 * Returning null for a tool with no market-specific data is deliberate: Net
 * Worth's answer depends on no external figure, and giving it an empty
 * "Reference data" heading would imply it had some and they were missing.
 */
export function ReferenceRows({
  toolId,
  market,
  amount,
  amountCurrency,
}: {
  toolId: string;
  market: ReferenceMarket;
  /** Lets the deposit row say how a figure sits against the cap. Optional. */
  amount?: number;
  /** The currency `amount` is in. Without it, no comparison is drawn. */
  amountCurrency?: string;
}) {
  const disclosure = useMemo(
    () => referenceDisclosureFor(toolId, market, { amount, amountCurrency }),
    [toolId, market, amount, amountCurrency],
  );
  if (disclosure.items.length === 0) return null;

  return (
    <div>
      <h3>Reference data used</h3>
      <div className="fx-ref-list">
        {disclosure.items.map((item) => (
          <Row key={item.key} item={item} />
        ))}
      </div>
    </div>
  );
}

/**
 * The protection line shown with a ParkSmart result.
 *
 * Three shapes, and the third is the one that matters: a market with no
 * verified scheme says so and shows no number, rather than showing zero or
 * quietly omitting the subject as though it had never come up.
 */
export function DepositProtectionNote({
  market,
  amount,
  amountCurrency,
}: {
  market: ReferenceMarket;
  amount: number;
  /**
   * The currency the reader's amounts are displayed in.
   *
   * Required, because FinatriX deliberately lets someone read totals in rupees
   * while comparing against UK rules — and comparing ₹700,000 with a £120,000
   * limit would produce a confident sentence out of two unrelated numbers.
   */
  amountCurrency: string;
}) {
  const record = depositProtectionFor(market);
  const comparison = compareToCap(market, amount, amountCurrency);
  if (!record) return null;

  const unverified = comparison.kind === 'unverified';
  const state =
    comparison.kind === 'unverified' ? 'unverified'
      : comparison.kind === 'above' ? 'above'
        : comparison.kind === 'not-comparable' ? 'not-comparable'
          : 'within';

  return (
    <aside className="card fx-protect" data-state={state} aria-label="Deposit protection">
      <div className="fx-protect-head">
        <span className="fx-protect-title">Deposit protection</span>
        {!unverified && comparison.kind !== 'no-record' && (
          <span className="fx-protect-limit">
            {new Intl.NumberFormat(undefined, {
              style: 'currency',
              currency: comparison.currency,
              maximumFractionDigits: 0,
            }).format(comparison.limit)}
          </span>
        )}
      </div>

      <p className="note fx-protect-body">
        {unverified ? (
          <>
            No operative retail guarantee scheme was verified for {record.authority}. That is a gap in
            what we could confirm, not a finding that deposits here are unprotected — ask your bank
            what protection your account carries.
          </>
        ) : comparison.kind === 'not-comparable' ? (
          <>
            {record.authority} protects up to this limit per eligible person, per institution. Your
            amounts are shown in {comparison.amountCurrency} and the limit is set in{' '}
            {comparison.currency}, so the two are not compared here — switch your display currency
            to {comparison.currency} in Settings if you want them side by side.
          </>
        ) : comparison.kind === 'above' ? (
          <>
            {record.authority} protects up to this limit per eligible person, per institution. The
            amount you entered is larger, so if it sits in one name at one institution, the
            difference would be outside the scheme. Spreading it, or checking which brands share an
            authorisation, is the usual response.
          </>
        ) : (
          <>
            {record.authority} protects up to this limit per eligible person, per institution — the
            amount you entered is within it for a single holder at a single institution.
          </>
        )}
      </p>

      <p className="note fx-protect-fine">
        {record.aggregation} Cover depends on the institution, the account type and how it is owned,
        so it is worth confirming rather than assuming.
        {record.effectiveDate && ` Current limit applies from ${verifiedLabel(record.effectiveDate)}.`}
      </p>
    </aside>
  );
}
