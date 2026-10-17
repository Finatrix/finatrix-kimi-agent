/**
 * Who sees the first-run intro, and when.
 *
 * The intro exists for one person: someone opening the money tools for the
 * very first time, with nothing saved yet, at the front door (the dashboard).
 * Everyone else must never see it — a returning user who updates the app, a
 * deep link into a specific tool, a crawler, an end-to-end test run. Getting
 * this wrong in the "show" direction is far worse than in the "hide"
 * direction, so every check fails closed.
 *
 * Pure apart from the default readers, so the rules are tested directly
 * (src/test/walkthroughGating.test.ts).
 */

/** Local-only: set the moment the intro is shown, so it is never shown twice. */
export const WALKTHROUGH_SEEN_KEY = 'fx_walkthrough_seen';
/** Set by the /welcome setup flow (tools/lib/onboarding.ts). */
export const ONBOARDING_DONE_KEY = 'fx_onboarding_done';
/** Written when any tool is opened (ToolRoute) — proof of a returning user. */
const LAST_TOOL_KEY = 'fx_last_tool';
/**
 * Test-only opt-in. Lets an automated run (Playwright, vitest) see the intro on
 * purpose. It bypasses the automation checks and nothing else.
 */
export const WALKTHROUGH_TEST_OPT_IN_KEY = 'fx_walkthrough_test';

/** The app's entry screens. `/tools` redirects to the dashboard for new users. */
const ENTRY_PATHS = new Set(['/tools', '/tools/dashboard']);

/**
 * Crawlers, link previewers, prerenderers, audits and headless browsers. A
 * crawler that renders JavaScript would otherwise index a modal over the page.
 */
// `bot` only as its own word or followed by a version/suffix separator
// (Googlebot/2.1, AdsBot-Google), so a phone model such as "CUBOT X50" in an
// ordinary Android user agent is not mistaken for a crawler.
const AUTOMATED_UA = /\bbot\b|bot[/-]|crawl|spider|slurp|headless|prerender|lighthouse|pagespeed|inspectiontool|googleother|phantomjs|puppeteer|playwright|selenium|facebookexternalhit|embedly/i;

export interface ClientHints {
  userAgent?: string;
  webdriver?: boolean;
}

export function isAutomatedClient(hints: ClientHints | undefined): boolean {
  if (!hints) return true;
  if (hints.webdriver) return true;
  return AUTOMATED_UA.test(hints.userAgent ?? '');
}

export function isEntryPath(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  return ENTRY_PATHS.has(path);
}

export interface FirstRunInput {
  pathname: string;
  client: ClientHints | undefined;
  /** True under vitest. */
  testRun: boolean;
  /** Reads a storage key; must never throw (see `safeRead`). */
  read: (key: string) => string | null;
}

/**
 * Every check that needs nothing heavier than storage reads. When this says
 * yes, the caller still has to confirm the user has no saved data
 * (`hasAnyData`) before showing anything — that check is loaded lazily so the
 * shell does not carry the settings module for everyone.
 */
export function passesFirstRunPrecheck({ pathname, client, testRun, read }: FirstRunInput): boolean {
  const optedIn = read(WALKTHROUGH_TEST_OPT_IN_KEY) === '1';
  if (testRun && !optedIn) return false;
  if (isAutomatedClient(client) && !optedIn) return false;
  if (!isEntryPath(pathname)) return false;
  if (read(WALKTHROUGH_SEEN_KEY) != null) return false;
  if (read(ONBOARDING_DONE_KEY) != null) return false;
  if (read(LAST_TOOL_KEY) != null) return false;
  return true;
}

/** The full rule: precheck, then "has nothing saved". */
export function shouldAutoShowWalkthrough(input: FirstRunInput & { hasData: () => boolean }): boolean {
  if (!passesFirstRunPrecheck(input)) return false;
  try {
    return !input.hasData();
  } catch {
    return false;
  }
}

/** localStorage read that can never throw (private mode, blocked storage). */
export function safeRead(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Remember that the intro was shown. Never throws; a failed write is harmless. */
export function markWalkthroughSeen(): void {
  try {
    window.localStorage.setItem(WALKTHROUGH_SEEN_KEY, '1');
  } catch {
    /* storage blocked — at worst the intro shows again next session */
  }
}

export function currentClientHints(): ClientHints | undefined {
  try {
    return { userAgent: navigator.userAgent, webdriver: navigator.webdriver === true };
  } catch {
    return undefined;
  }
}
