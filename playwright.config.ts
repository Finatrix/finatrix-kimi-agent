import { defineConfig, devices } from '@playwright/test';

/**
 * True-browser E2E for the flows that unit tests can't fully prove: the Expense
 * Tracker add/persist/edit/delete/undo lifecycle in a real browser, including
 * localStorage persistence across a hard reload.
 *
 * Runs against a production build served by `vite preview` (auto-started below),
 * so it exercises the same bundle that ships. Kept OUT of the fast `npm test`
 * unit loop — run explicitly with `npm run test:e2e` (needs the Chromium and
 * WebKit binaries from `npx playwright install chromium webkit`).
 */
/** The WebKit-only spec — see the `projects` note below. */
const IOS_SPEC = /ios-webkit\.spec\.ts/;
// Run the shared create/edit/delete, persistence, validation, navigation and
// market-selection journeys in WebKit too. Layout-only checks cannot catch
// engine-specific failures in the flows people use to save their records.
const IOS_SHARED_FLOWS = /(?:expense|networth|smart-entry|auth-navigation|seven-markets|sitewide-automation|finance-upgrade|command-palette|export-downloads|dialog-inert|compatibility-import|compact-tools)\.spec\.ts/;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://localhost:4319',
    trace: 'on-first-retry',
  },
  projects: [
    // Chromium covers the website and, through Pixel 7 emulation, the Android
    // app's engine. `ios-webkit.spec.ts` is excluded from both: its assertions
    // are about WebKit's own layout and parsing, so running them on Chromium
    // would report a pass that means nothing.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: IOS_SPEC },
    // Chromium-engine mobile emulation (Pixel 7) so one browser binary covers
    // desktop + narrow viewport.
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testIgnore: IOS_SPEC },
    // The iOS app renders in WKWebView, and the defects that matter there —
    // safe-area insets, WebKit text metrics, WebKit date and number parsing —
    // are invisible in Chromium by construction. This is the only engine in the
    // toolchain that can answer for them; each spec sets its own iPhone device
    // descriptor, so no project-level viewport is pinned here.
    // The device here sets the ENGINE (webkit) for the project; each describe in
    // the spec overrides the viewport for the phone it is checking. Playwright
    // refuses a browser-type change inside a describe, so it has to be pinned at
    // this level.
    { name: 'ios-webkit', testMatch: [IOS_SPEC, IOS_SHARED_FLOWS], use: { ...devices['iPhone 16 Pro'] } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4319 --strictPort',
    url: 'http://localhost:4319',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
