/**
 * What a market is, as far as the money tools are concerned.
 *
 * A "market" is the jurisdiction whose instruments, tax shapes and peer
 * benchmarks a user should be measured against. It is NOT the same thing as a
 * display currency: someone can live in the UK and prefer to read totals in
 * INR, and someone in Dubai holds AED while comparing against UAE norms. So the
 * two settings are separate, the market only ever *seeds* the currency, and
 * either can be changed without disturbing the other.
 *
 * WHY PACKS RATHER THAN CONDITIONALS
 * ----------------------------------
 * Three tools — ParkSmart, InvestMatch and PeerCompare — were written around
 * Indian instruments (PPF, ELSS, 80TTA, SGBs) and Indian city benchmarks. Those
 * are not "India-flavoured labels" on a universal model; they are the model's
 * data. Making them market-aware by adding `if (market === 'US')` inside the
 * arithmetic would have meant editing parity-pinned compute functions for every
 * country added, which is precisely the change this codebase forbids.
 *
 * Instead the arithmetic stayed where it was and grew one optional parameter:
 * the pack. India's pack IS the original constants, re-exported, so the default
 * path is the code that shipped and the parity suites pass unchanged. Adding a
 * market is adding a data file.
 *
 * The three compute-layer shapes (`ParkInstruments`, `InvestAssumptions`,
 * `PeerBenchmarks`) are defined next to the functions that consume them and
 * extended here with the labels only the UI needs. One definition each — a pack
 * cannot satisfy the renderer and fail the calculator.
 *
 * ON THE NUMBERS
 * --------------
 * Every pack carries `asOf` and `sources`, and both are surfaced in the UI.
 * Interest rates move, benchmark surveys are published years apart, and a
 * savings figure with no date on it is a figure a reader cannot check. The
 * India pack shipped without provenance; adding the field means it now has to
 * state its own, which improves the original as much as it constrains the new.
 *
 * Pure data types. No React, no storage.
 */

import type { IconName } from '../../ui/Icon';
import type { ParkInstruments } from '../parksmart';
import type { InvestAssumptions, ImAnswers } from '../investmatch';
import type { GoalPreset, GoalPath } from '../goals';
import type { PeerBenchmarks, PeerInput } from '../peercompare';

/**
 * Markets the product has real, checkable data for.
 *
 * Each market has local context and explicitly scoped tool modes. Missing
 * yields use user-entered rates; published summaries do not require a
 * fabricated city/age grid. Neither mode falls back to another country.
 */
export type MarketId = 'IN' | 'US' | 'GB' | 'AE' | 'AU' | 'SG' | 'CN';

export const MARKET_IDS: readonly MarketId[] = ['IN', 'US', 'GB', 'AE', 'AU', 'SG', 'CN'];

/**
 * Where the user's chosen market is stored, and what it is when nothing is.
 *
 * Here rather than in `index.ts` because this module is the pack-free half of
 * the registry: reading which market someone picked costs nothing, while
 * `index.ts` pulls in all four packs (instrument sets, city tables, benchmark
 * grids). The landing hero needs the former and must not pay for the latter —
 * it is on the critical path of the site's most-visited URL. `index.ts`
 * re-exports both, so every existing importer is unchanged.
 */
export const MARKET_KEY = 'fx_market';

/** The default when nothing is stored and nothing can be detected. */
export const DEFAULT_MARKET: MarketId = 'IN';

export function isMarketId(v: unknown): v is MarketId {
  return typeof v === 'string' && (MARKET_IDS as readonly string[]).includes(v);
}

/** ParkSmart: the instruments, plus what the controls around them are called. */
export interface ParkPack extends ParkInstruments {
  /** No numeric market yields are supplied in this mode. Rates come from the user. */
  inputMode?: 'net-rates';
  /** Label for the marginal-rate control — "Income-tax slab" vs "Marginal tax rate". */
  rateLabel: string;
  /** The rate choices offered, as whole percentages, in display order. */
  rateOptions: readonly { value: number; label: string }[];
  /**
   * The one selected before the user chooses, as a whole percentage.
   *
   * Explicit rather than "the middle option": India's default was 20% and
   * picking the midpoint of its seven slabs would quietly move every first-time
   * ranking to 15%. It must be one of `rateOptions`; `markets.test.ts` checks.
   */
  defaultRate: number;
  /** Amounts offered as one-tap chips. Labels are formatted from the currency. */
  quickAmounts: readonly number[];
  /** One line describing what this market's returns are net of. */
  taxNote: string;
  /**
   * The closing caveats: what the rates are, which local tax quirks change the
   * ranking, and the one rule that outranks all of it (keep months of expenses
   * liquid). Market-specific because almost every sentence of it is.
   */
  keepInMind: string;
}

/** InvestMatch: the assumptions, plus the starting answers for this market. */
export interface InvestPack extends InvestAssumptions {
  defaults: ImAnswers;
  /**
   * What this market calls a recurring monthly investment. "SIP" is universal
   * in India and means nothing in Ohio; "standing order" is the British phrase
   * for the bank instruction rather than the investment itself.
   */
  monthlyTerm: string;
}

/** PeerCompare: the benchmarks, plus the control labels and starting answers. */
export interface PeerPack extends PeerBenchmarks {
  /** Published summaries never enter the legacy percentile engine. */
  mode?: 'published-context';
  /** Label for the location control — "City" vs "Metro area". */
  cityLabel: string;
  defaults: PeerInput;
  /**
   * Who the benchmark table describes. One sentence, specific enough that a
   * reader can decide whether it describes people like them.
   *
   * A percentile is a claim about a POPULATION, and until this field existed the
   * page showed one without ever saying which population — so "62nd percentile"
   * could equally have meant "of everyone in the country", "of FinatriX users"
   * or "of salaried people your age in cities like yours". Only the last is
   * true, and a comparison whose sample is unstated invites the reader to
   * assume the most flattering or the most alarming reading of it.
   */
  population: string;
  /**
   * How the figures were arrived at, and what status they have.
   *
   * Deliberately separate from the pack's `sources`, which describe the rates
   * and tax rules the OTHER tools use. India's `sources` name the RBI, AMFI and
   * the Income Tax Act — correct for ParkSmart, and none of them a source for a
   * table of median savings by age. Showing that list under a peer comparison
   * implied a provenance the numbers do not have.
   */
  basis: string;
}

/** Reverse Goal Planner: what people here save for, and at what scale. */
export interface GoalsPack {
  presets: readonly GoalPreset[];
  /** The three growth paths and the instruments each suggests. */
  paths: readonly GoalPath[];
  /** Long-run inflation used to gross a target up to future money, 0–1. */
  inflation: number;
  /** Below this the planner declines to answer, in the market's currency. */
  minTarget: number;
}

/**
 * Net Worth's market-specific labels.
 *
 * Overrides only — the category KEYS are permanent, because the whole value of
 * a net-worth history is comparing the same buckets across years. "EPF, PPF &
 * NPS" and "401(k) & IRA" are the same bucket wearing the local name.
 */
export interface NetWorthPack {
  labels: Readonly<Record<string, string>>;
}

export interface MarketPack {
  id: MarketId;
  /** Country name as a reader there would write it. */
  name: string;
  flag: string;
  /** ISO-3166-1 alpha-2, lowercase — job search, schema `contentLocation`. */
  country: string;
  /** The currency this market seeds when a user first picks it. */
  currency: string;
  /** BCP-47 tag for number formatting and `<html lang>`. */
  locale: string;
  /**
   * When this pack's rates and benchmarks were last reviewed, "YYYY-MM".
   * Rendered next to the figures. A stale date is information, not a bug.
   */
  asOf: string;
  /** Where the numbers come from, named so a reader can go and check. */
  sources: readonly string[];
  park: ParkPack;
  invest: InvestPack;
  peer: PeerPack;
  goals: GoalsPack;
  netWorth: NetWorthPack;
  icon: IconName;
  /** Explicit description of authored examples, distinct from measured statistics. */
  planningNote?: string;
}
