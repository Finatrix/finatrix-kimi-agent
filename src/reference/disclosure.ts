/**
 * Turns the registries into something a disclosure panel can render.
 *
 * WHY THE VIEW MODEL LIVES HERE AND NOT IN THE COMPONENT
 * ------------------------------------------------------
 * Deciding which references a tool used, whether each is fresh enough to show,
 * how to describe the ones that are missing and which sources to cite is the
 * hardest and most consequential logic in this layer — and it is exactly the
 * logic that becomes untestable the moment it is written inside a React
 * component. So the component receives a finished list and renders it, and
 * every judgement it would otherwise have made is a pure function with a test.
 *
 * CURRENCY IS THE REFERENCE'S, NOT THE READER'S
 * ---------------------------------------------
 * FinatriX lets someone read their totals in one currency while comparing
 * against another market — a genuinely useful setting, and a trap here. The
 * FSCS limit is £120,000. It is not "£120,000 or the equivalent in rupees",
 * because the law is denominated in pounds and a converted figure would be a
 * number no source states and no rate is pinned to. So these values are always
 * formatted in the currency the rule is written in, regardless of display
 * preference. The one place a product's own convenience must lose to accuracy.
 */

import { compareToCap, depositProtectionFor } from './deposits';
import { evaluateFreshness, type FreshnessVerdict } from './freshness';
import { inflationFor, periodLabel } from './inflation';
import { referenceLimitsFor } from './methodology';
import { peerDatasetsFor } from './peerDatasets';
import { sourcesByIds } from './sources';
import { taxSchedulesFor } from './taxReference';
import type { ReferenceMarket, ReferenceSource, ValueTier } from './types';

export interface DisclosureItem {
  /** Stable key for React, and for a test to name a row. */
  readonly key: string;
  readonly label: string;
  /** Preformatted in the reference's own currency or unit. Null when absent. */
  readonly value: string | null;
  /** Shown when `value` is null — what to do instead of reading a number. */
  readonly absence: string | null;
  /** When the rule took effect, already in reading form. Null when unknown. */
  readonly effectiveFrom: string | null;
  readonly lastReviewed: string;
  readonly freshness: FreshnessVerdict;
  readonly tier: ValueTier;
  /** Conditions on the value. Always present; always worth reading. */
  readonly applicability: string;
  readonly sources: readonly ReferenceSource[];
}

export interface ReferenceDisclosure {
  readonly market: ReferenceMarket;
  readonly items: readonly DisclosureItem[];
  /** Limitations that come from the data rather than from the arithmetic. */
  readonly limits: readonly string[];
  /** True when at least one item needs the reader's attention. */
  readonly hasWarning: boolean;
}

/** `"2025-12-01"` → `"1 December 2025"`. */
function dayLabel(iso: string | null): string | null {
  if (!iso) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Money in the reference's own currency, without decimals.
 *
 * `Intl` is asked for the currency's own symbol and grouping, so ₹5,00,000
 * groups the Indian way and £120,000 the British way — the figure a reader
 * would recognise from the authority's own page rather than a reformatted one.
 */
function moneyLabel(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency', currency, maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    // An unknown currency code must not take a disclosure panel down.
    return `${currency} ${Math.round(amount).toLocaleString()}`;
  }
}

/**
 * Everything a tool should disclose about the reference data behind its result.
 *
 * `amount` is optional and only used to say how a figure sits against a
 * statutory cap. Omitting it produces the same panel minus that one sentence,
 * which is what the methodology drawer wants before a user has entered anything.
 */
export function referenceDisclosureFor(
  toolId: string,
  market: ReferenceMarket,
  options: {
    readonly amount?: number;
    /** The currency `amount` is in. Without it, no comparison is attempted. */
    readonly amountCurrency?: string;
    readonly now?: Date;
  } = {},
): ReferenceDisclosure {
  const now = options.now ?? new Date();
  const items: DisclosureItem[] = [];

  if (toolId === 'parksmart') {
    const deposit = depositProtectionFor(market);
    if (deposit) {
      const freshness = evaluateFreshness(deposit, now);
      const comparison =
        options.amount === undefined || options.amountCurrency === undefined
          ? null
          : compareToCap(market, options.amount, options.amountCurrency);
      const headroom =
        comparison?.kind === 'above'
          ? ` The amount entered is above it — if it is held in one name at one institution, ${moneyLabel(comparison.excess, deposit.currency)} sits beyond the limit.`
          : comparison?.kind === 'within'
            ? ' The amount entered is within it, for a single holder at a single institution.'
            : comparison?.kind === 'not-comparable'
              ? ` Your amounts are shown in ${comparison.amountCurrency} and this limit is set in ${comparison.currency}, so the two are not compared here.`
              : '';
      items.push({
        key: 'deposit',
        label: `Deposit protection (${deposit.authority})`,
        value: deposit.limit === null ? null : moneyLabel(deposit.limit, deposit.currency),
        absence: deposit.limit === null ? 'Protection details need verification with your bank.' : null,
        effectiveFrom: dayLabel(deposit.effectiveDate),
        lastReviewed: deposit.lastVerified,
        freshness,
        tier: 'REFERENCE',
        applicability: `${deposit.aggregation}${headroom} ${deposit.applicability}`.trim(),
        sources: sourcesByIds(deposit.sourceIds),
      });
    }

    // The tax schedule, as context for the marginal rate the user picked. Never
    // applied to anything — see the header of `taxReference.ts`.
    for (const schedule of taxSchedulesFor(market)) {
      items.push({
        key: `tax-${schedule.id}`,
        label: `Income tax schedule — ${schedule.period}`,
        value: `${schedule.bands.length} bands, ${Math.round(schedule.bands[0].marginalRate * 100)}%–${Math.round(schedule.bands[schedule.bands.length - 1].marginalRate * 100)}%`,
        absence: null,
        effectiveFrom: dayLabel(schedule.effectiveDate),
        lastReviewed: schedule.lastVerified,
        freshness: evaluateFreshness({ quality: 'VERIFIED_CURRENT', reviewDue: '2026-12-12', lastVerified: schedule.lastVerified }, now),
        tier: 'REFERENCE',
        applicability: `${schedule.applicability} Excluded: ${schedule.excluded}`,
        sources: sourcesByIds(schedule.sourceIds),
      });
    }
  }

  if (toolId === 'goals' || toolId === 'lifemap') {
    const cpi = inflationFor(market);
    if (cpi) {
      const freshness = evaluateFreshness(cpi, now);
      items.push({
        key: 'cpi',
        label: `Published inflation — ${cpi.measure}`,
        value: `${cpi.observedYoY}% (${periodLabel(cpi.observationPeriod)})`,
        absence: null,
        effectiveFrom: null,
        lastReviewed: cpi.lastVerified,
        freshness,
        tier: 'REFERENCE',
        applicability: `Shown for comparison only. This is one month’s year-on-year reading, and the rate this tool plans with is a separate long-run assumption. ${cpi.notes}`,
        sources: sourcesByIds([cpi.sourceId]),
      });
    }
  }

  if (toolId === 'peercompare') {
    // Metadata about what a comparison of this kind can and cannot be, not a
    // second set of numbers competing with the tool's own benchmark grid.
    for (const dataset of peerDatasetsFor(market)) {
      items.push({
        key: `peer-${dataset.id}`,
        label: dataset.title ?? `${dataset.measure.toLowerCase()} distribution — none available`,
        value: dataset.title === null ? null : dataset.observationPeriod,
        absence: dataset.title === null ? 'No comparable published distribution was found for this market.' : null,
        effectiveFrom: null,
        lastReviewed: dataset.lastVerified,
        freshness: evaluateFreshness({ quality: 'VERIFIED_CURRENT', reviewDue: dataset.reviewDue, lastVerified: dataset.lastVerified }, now),
        tier: 'REFERENCE',
        applicability: dataset.limitations,
        sources: dataset.sourceId ? sourcesByIds([dataset.sourceId]) : [],
      });
    }
  }

  return {
    market,
    items,
    limits: referenceLimitsFor(toolId, market),
    hasWarning: items.some((i) => i.freshness.showsWarning || i.value === null),
  };
}
