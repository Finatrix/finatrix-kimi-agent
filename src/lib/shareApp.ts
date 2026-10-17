import { APP_STORE_REVIEW_URL, APP_STORE_URL, BRAND_NAME, PLAY_STORE_URL } from '../shared/brand';
import { isIosApp, isNativeApp, PUBLIC_ORIGIN } from '../native/platform';

/**
 * Share FinatriX, and send people to rate it.
 *
 * Kept out of the website's critical path: the share plugin is imported only
 * inside the app, when someone taps Share.
 */

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

const SHARE_TITLE = `${BRAND_NAME}: budget and money plan`;
const SHARE_TEXT = 'I use FinatriX to plan my month: budget, spending and goals, with the working shown. No ads.';

/** The link worth sharing: the app's store page when in an app, else the website. */
export function shareUrl(): string {
  if (!isNativeApp()) return PUBLIC_ORIGIN;
  return isIosApp() ? APP_STORE_URL : PLAY_STORE_URL;
}

/** Where "Rate FinatriX" goes, or null in a browser where there is nothing to rate. */
export function rateUrl(): string | null {
  if (!isNativeApp()) return null;
  return isIosApp() ? APP_STORE_REVIEW_URL : PLAY_STORE_URL;
}

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function isAbort(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  return /abort|cancel/i.test(msg);
}

export async function shareApp(): Promise<ShareOutcome> {
  const url = shareUrl();
  try {
    if (isNativeApp()) {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: SHARE_TITLE, text: SHARE_TEXT, url, dialogTitle: 'Share FinatriX' });
      return 'shared';
    }
    if (typeof navigator.share === 'function') {
      await navigator.share({ title: SHARE_TITLE, text: SHARE_TEXT, url });
      return 'shared';
    }
  } catch (e) {
    if (isAbort(e)) return 'cancelled';
    // Any other failure falls through to copying the link.
  }
  return (await copyToClipboard(`${SHARE_TEXT} ${url}`)) ? 'copied' : 'failed';
}

export function rateApp(): void {
  const url = rateUrl();
  if (url) window.open(url, '_system');
}
