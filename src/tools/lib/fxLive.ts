/**
 * Fetching live exchange rates, at most once a day.
 *
 * The app asks its own Worker (`worker/fxLatest.ts`), never the rate source
 * directly: the CSP's `connect-src` would block the source, and the Worker is
 * where bad data is screened out and the source's daily limit is respected.
 *
 * A successful check is remembered by local calendar day, so the app asks once
 * a day however often it is opened. A failed check is not remembered, so the
 * next open tries again; until one succeeds, the last saved rates stay in use
 * with their own date on show (see `ratesAsOf` in fx.ts).
 */
import { ymdLocal } from '../../lib/date';
import { isNativeApp, PUBLIC_ORIGIN } from '../../native/platform';
import { FX_FEED_PATH, parseFeed } from '../../shared/fxFeed';
import { loadLiveRates, saveLiveRates } from './fx';

/**
 * Where the feed is. In the browser that is this site, same origin. The apps
 * load their pages from a bundle on the device, where a relative path would
 * never reach the Worker, so they ask the public site by name.
 */
export function feedUrl(): string {
  return isNativeApp() ? `${PUBLIC_ORIGIN}${FX_FEED_PATH}` : FX_FEED_PATH;
}

/**
 * `skipped`: already checked today. `updated`: newer rates were saved.
 * `unchanged`: the check worked but there was nothing newer. `failed`: offline,
 * or the answer was unusable; the saved rates stay as they were.
 */
export type RefreshResult = 'skipped' | 'updated' | 'unchanged' | 'failed';

export interface RefreshOptions {
  now?: Date;
  fetchImpl?: typeof fetch;
}

let inFlight: Promise<RefreshResult> | null = null;

/** Check for today's rates unless this device already has. Never throws. */
export function refreshLiveRates({ now = new Date(), fetchImpl }: RefreshOptions = {}): Promise<RefreshResult> {
  const today = ymdLocal(now);
  if (loadLiveRates()?.checkedOn === today) return Promise.resolve('skipped');
  // Two screens asking at once share one request.
  if (inFlight) return inFlight;
  const doFetch = fetchImpl ?? (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
  if (!doFetch) return Promise.resolve('failed');

  const check = async (): Promise<RefreshResult> => {
    try {
      const res = await doFetch(feedUrl(), { headers: { Accept: 'application/json' } });
      if (!res.ok) return 'failed';
      const feed = parseFeed(await res.json());
      if (!feed) return 'failed';

      // Read again: another tab may have saved while this request was out.
      const saved = loadLiveRates();
      // Never step backwards. An edge location can still be serving yesterday's
      // table after this device has seen today's.
      if (saved && feed.asOf < saved.asOf) {
        saveLiveRates({ ...saved, checkedOn: today });
        return 'unchanged';
      }
      const changed = !saved || feed.asOf !== saved.asOf;
      saveLiveRates({
        asOf: feed.asOf,
        source: feed.source,
        // A code this answer lacked keeps the rate this device already had.
        rates: { ...(saved?.rates ?? {}), ...feed.rates },
        checkedOn: today,
      });
      return changed ? 'updated' : 'unchanged';
    } catch {
      return 'failed';
    }
  };
  // Cleared in a later microtask, so even a fetch that throws synchronously
  // cannot leave a settled promise parked here for the rest of the session.
  const pending = check().finally(() => { inFlight = null; });
  inFlight = pending;
  return pending;
}
