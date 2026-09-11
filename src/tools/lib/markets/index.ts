/**
 * The market registry: which markets exist, which one a user is in, and how
 * that answer is remembered.
 *
 * WHY DETECTION IS A DEFAULT AND NEVER A DECISION
 * -----------------------------------------------
 * The browser can tell us a locale and a time zone. Neither is a statement about
 * whose tax rules apply to someone: a laptop bought in India keeps `en-IN` after
 * its owner moves to Dubai, a VPN moves the time zone, and a UK citizen working
 * in New York genuinely has one foot in each. So detection only ever supplies
 * the FIRST value of a setting the user owns outright — once chosen, the stored
 * answer always wins and is never re-derived.
 *
 * The market is stored separately from the display currency on purpose. They
 * seed each other and then go their own way: picking a market suggests its
 * currency, but someone can compare against UK benchmarks while reading totals
 * in rupees, and overwriting their currency choice because they changed market
 * would be the product deciding it knows better.
 */

import { store } from '../storage';
import { IN_MARKET } from './in';
import { US_MARKET } from './us';
import { GB_MARKET } from './gb';
import { AE_MARKET } from './ae';
import { MARKET_IDS, type MarketId, type MarketPack } from './types';

export type { MarketId, MarketPack } from './types';
export { MARKET_IDS } from './types';

export const MARKETS: Readonly<Record<MarketId, MarketPack>> = {
  IN: IN_MARKET,
  US: US_MARKET,
  GB: GB_MARKET,
  AE: AE_MARKET,
};

/** In display order. India first — it is the default and the largest audience. */
export const MARKET_LIST: readonly MarketPack[] = MARKET_IDS.map((id) => MARKETS[id]);

export const MARKET_KEY = 'fx_market';

/** The default when nothing is stored and nothing can be detected. */
export const DEFAULT_MARKET: MarketId = 'IN';

export function isMarketId(v: unknown): v is MarketId {
  return typeof v === 'string' && (MARKET_IDS as readonly string[]).includes(v);
}

export function marketFor(id: unknown): MarketPack {
  return isMarketId(id) ? MARKETS[id] : MARKETS[DEFAULT_MARKET];
}

/**
 * Region → market, for the markets that have a pack.
 *
 * Deliberately not a guess for everyone else: someone in Germany is better
 * served by an honest "we do not have Germany yet, here is India's data and it
 * says so" than by being silently shown UK instruments because the UK is
 * geographically closer. Unmapped regions fall through to the default and the
 * settings screen invites them to choose.
 */
const REGION_TO_MARKET: Readonly<Record<string, MarketId>> = {
  IN: 'IN',
  US: 'US',
  GB: 'GB', UK: 'GB',
  AE: 'AE',
};

/** Time zones that identify a market unambiguously. */
const ZONE_TO_MARKET: Readonly<Record<string, MarketId>> = {
  'Asia/Kolkata': 'IN', 'Asia/Calcutta': 'IN',
  'Asia/Dubai': 'AE',
  'Europe/London': 'GB',
  'America/New_York': 'US', 'America/Chicago': 'US', 'America/Denver': 'US',
  'America/Los_Angeles': 'US', 'America/Phoenix': 'US', 'America/Anchorage': 'US',
  'Pacific/Honolulu': 'US', 'America/Detroit': 'US',
};

/**
 * Best guess at the user's market from the browser, or null when nothing points
 * anywhere. Never consults storage — `loadMarket` does that, and keeping the two
 * apart is what makes this testable.
 */
export function detectMarket(): MarketId | null {
  if (typeof navigator === 'undefined' && typeof Intl === 'undefined') return null;

  // 1. An explicit region subtag in the browser's language ("en-GB" → GB).
  try {
    const languages = navigator?.languages?.length ? navigator.languages : [navigator?.language];
    for (const tag of languages) {
      if (!tag) continue;
      const region = tag.split('-')[1]?.toUpperCase();
      if (region && REGION_TO_MARKET[region]) return REGION_TO_MARKET[region];
    }
  } catch {
    /* fall through to the time zone */
  }

  // 2. The IANA time zone, which survives a language set to plain "en".
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (zone && ZONE_TO_MARKET[zone]) return ZONE_TO_MARKET[zone];
  } catch {
    /* fall through */
  }

  return null;
}

/** What the user actually chose, or null if they never have. */
export function loadMarketChoice(): MarketId | null {
  const stored = store.raw(MARKET_KEY);
  return isMarketId(stored) ? stored : null;
}

/**
 * The market in force: the stored choice, else a detected one, else India.
 * Detection is not persisted — a guess that writes itself to storage is
 * indistinguishable from a decision the user made.
 */
export function loadMarket(): MarketId {
  return loadMarketChoice() ?? detectMarket() ?? DEFAULT_MARKET;
}

export function saveMarket(id: MarketId): void {
  if (isMarketId(id)) store.set(MARKET_KEY, id);
}
