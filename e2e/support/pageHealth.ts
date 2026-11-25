import type { Page } from '@playwright/test';

/**
 * Console errors and failed requests, collected for the life of one page.
 *
 * Shared by `public-crawl.spec.ts` (every public URL, in CI) and
 * `release-smoke.spec.ts` (the bundle about to ship, at deploy time), so both
 * hold a page to the same definition of "clean".
 */
export function watch(page: Page) {
  const errors: string[] = [];
  const failed: string[] = [];

  /**
   * The one console error a deliberately credential-less build MUST produce.
   *
   * CI has no `.env` — it builds this bundle with FX_ALLOW_UNCONFIGURED_BUILD=1
   * (see .github/workflows/ci.yml), which is exactly the opt-out vite.config.ts
   * documents for "compile/behaviour check, not a deployable artifact". That
   * bundle then does the correct thing: src/lib/supabase.ts fails loud with
   * `[FinatriX] Supabase misconfigured: VITE_SUPABASE_URL is not set in this
   * build.` rather than silently shipping a dead client.
   *
   * Asserting zero console errors against a build we deliberately configured to
   * report one is self-contradictory, and it is why this job could never pass
   * on CI — every tools page failed on it, on every run, long before anyone
   * read the message. Ignored ONLY when the opt-out is actually set, so a
   * properly configured build that somehow logs this still fails: there, it
   * means the credentials really are missing, which is the bug this message
   * exists to catch.
   */
  const EXPECTED_IN_UNCONFIGURED_BUILD =
    process.env.FX_ALLOW_UNCONFIGURED_BUILD === '1'
      ? /^\[FinatriX\] Supabase misconfigured: VITE_SUPABASE_(URL|ANON_KEY) is not set in this build\.$/
      : /(?!)/; // matches nothing

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (EXPECTED_IN_UNCONFIGURED_BUILD.test(text)) return;
    // Vite's dev overlay and HMR chatter never reach production; the suite runs
    // against a production preview build, so anything here is real.
    errors.push(text);
  });
  page.on('pageerror', (err) => errors.push(`uncaught: ${err.message}`));
  page.on('requestfailed', (req) => {
    failed.push(`${req.method()} ${req.url()} — ${req.failure()?.errorText ?? 'failed'}`);
  });
  page.on('response', (res) => {
    if (res.status() >= 400) failed.push(`${res.status()} ${res.url()}`);
  });

  return { errors, failed };
}
