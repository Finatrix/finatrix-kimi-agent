import { test, expect } from '@playwright/test';

/**
 * Performance budget for the landing page's critical path.
 *
 * The app is route-code-split with all heavy vendors (pdf/xlsx/tesseract/
 * mammoth/chart.js) lazy-loaded, so first paint pulls only the entry + react +
 * supabase (~146 KB gzipped at the time of writing). This guard fails CI if the
 * initial JS transfer regresses past a headroom budget — e.g. if a heavy lib
 * accidentally lands in the eager path. Measured from the real production build
 * served by `vite preview` (see playwright.config webServer).
 */

// Gzipped transfer budget for all JS loaded on the landing route's first paint.
const INITIAL_JS_BUDGET_KB = 185;

test('landing page initial JS stays within the performance budget', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  const initialJsBytes = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((r) => /\.js(\?|$)/.test(r.name))
      .reduce((sum, r) => sum + ((r as PerformanceResourceTiming).encodedBodySize || 0), 0)
  );

  const kb = Math.round(initialJsBytes / 1024);
  expect(kb, `initial JS was ${kb} KB (budget ${INITIAL_JS_BUDGET_KB} KB)`).toBeLessThanOrEqual(
    INITIAL_JS_BUDGET_KB
  );
});
