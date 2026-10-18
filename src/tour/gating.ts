import {
  ONBOARDING_DONE_KEY,
  WALKTHROUGH_SEEN_KEY,
  isAutomatedClient,
  isEntryPath,
  type ClientHints,
} from '../walkthrough/gating';
import {
  MAX_SNOOZES,
  TOUR_OFFER_KEY,
  TOUR_OPTOUT_KEY,
  TOUR_PROGRESS_KEY,
  TOUR_TEST_OPT_IN_KEY,
  loadOffer,
  loadProgress,
  type Storage,
} from './progress';

/**
 * Who is offered the tour automatically, and when.
 *
 * The offer is a polite card on the dashboard: "want a tour?". It must never
 * stack on the first-run intro (which comes first and does its own job), never
 * nag, never appear to a crawler or a test run, and never return once someone
 * has said no for good. Like the intro's gate, every check fails closed.
 *
 * Who qualifies, in plain words:
 *  - someone at the tools' front door (the dashboard entry), in a real browser;
 *  - who has met the product before: the intro was seen or skipped in an
 *    EARLIER session, or setup was finished, or a tool was opened, or there is
 *    saved data — which is also how existing users who update get it once;
 *  - who has not opted out, not already taken a tour, not accepted the offer,
 *    and is not inside a "Maybe later" window;
 *  - and who has not said "Maybe later" three times.
 *
 * Pure apart from storage, which callers inject.
 */

/** Written when any tool is opened (ToolRoute). */
const LAST_TOOL_KEY = 'fx_last_tool';

export interface OfferInput {
  /** The path the shell was entered on. */
  pathname: string;
  client: ClientHints | undefined;
  /** True under vitest. */
  testRun: boolean;
  /** Storage as it was when the shell mounted (before the intro marks itself seen). */
  storage: Pick<Storage, 'read'>;
  now: number;
}

/** Everything that needs nothing heavier than storage reads. */
export function passesOfferPrecheck({ pathname, client, testRun, storage, now }: OfferInput): boolean {
  const read = storage.read;
  const optedIn = read(TOUR_TEST_OPT_IN_KEY) === '1';
  if (testRun && !optedIn) return false;
  if (isAutomatedClient(client) && !optedIn) return false;
  if (!isEntryPath(pathname)) return false;
  if (read(TOUR_OPTOUT_KEY) === '1') return false;

  const progress = loadProgress({ read, write: () => {}, remove: () => {} });
  if (progress.startedAt != null) return false;
  const offer = loadOffer({ read, write: () => {}, remove: () => {} });
  if (offer.accepted) return false;
  if (offer.snoozes >= MAX_SNOOZES) return false;
  if (now < offer.nextAt) return false;
  return true;
}

/**
 * Has this person met FinatriX before (so the first-run intro is not about to
 * play, or already played in an earlier session)? Storage-only part.
 */
export function isReturningVisitor(read: (key: string) => string | null): boolean {
  return read(WALKTHROUGH_SEEN_KEY) != null || read(ONBOARDING_DONE_KEY) != null || read(LAST_TOOL_KEY) != null;
}

/** The full rule: precheck, then "returning visitor, or has saved data". */
export function shouldOfferTour(input: OfferInput & { hasData: () => boolean }): boolean {
  if (!passesOfferPrecheck(input)) return false;
  if (isReturningVisitor(input.storage.read)) return true;
  try {
    return input.hasData();
  } catch {
    return false;
  }
}

/** Keys this module reads, for documentation and tests. */
export const OFFER_KEYS = [TOUR_OPTOUT_KEY, TOUR_OFFER_KEY, TOUR_PROGRESS_KEY, TOUR_TEST_OPT_IN_KEY] as const;
