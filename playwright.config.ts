import { defineConfig, devices } from '@playwright/test';

/**
 * True-browser E2E for the flows that unit tests can't fully prove: the Expense
 * Tracker add/persist/edit/delete/undo lifecycle in a real browser, including
 * localStorage persistence across a hard reload.
 *
 * Runs against a production build served by `vite preview` (auto-started below),
 * so it exercises the same bundle that ships. Kept OUT of the fast `npm test`
 * unit loop — run explicitly with `npm run test:e2e` (needs the Chromium binary
 * from `npx playwright install chromium`).
 */
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
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Chromium-engine mobile emulation (Pixel 7) so a single browser binary
    // covers desktop + narrow viewport — no separate WebKit download needed.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4319 --strictPort',
    url: 'http://localhost:4319',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
