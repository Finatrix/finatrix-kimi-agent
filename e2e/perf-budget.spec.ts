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

/**
 * Transfer budget for images on the same first paint.
 *
 * This exists because the JS budget above had a blind spot exactly the size of
 * the worst asset on the site. `BrandLogo` pointed at the 1520x1520, ~182 kB
 * source PNG and rendered it at 22-52 CSS px on the landing nav and hero, the
 * tools and careers shells, and onboarding — a bigger transfer than the React
 * chunk, and roughly a third of the whole landing critical path. A JS-only
 * guard reported "within budget" the entire time.
 *
 * Now ~21 kB (a 5 kB and a 16 kB pre-scaled variant, selected by srcset). The
 * cap leaves generous headroom for a legitimate new image while failing loudly
 * if a full-resolution asset is dropped onto the critical path again.
 */
const INITIAL_IMAGE_BUDGET_KB = 80;

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

test('landing page images stay within the performance budget', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  const images = await page.evaluate(() =>
    performance
      .getEntriesByType('resource')
      .filter((r) => (r as PerformanceResourceTiming).initiatorType === 'img'
        || /\.(png|jpe?g|gif|webp|avif|svg)(\?|$)/.test(r.name))
      .map((r) => ({
        name: new URL(r.name).pathname,
        bytes: (r as PerformanceResourceTiming).encodedBodySize || 0,
      }))
  );

  // Without this the whole assertion is vacuous: an empty resource list sums to
  // zero and sails under any cap, so a selector that stopped matching would read
  // as a pass.
  expect(images.length, 'expected the landing page to load at least one image').toBeGreaterThan(0);

  const totalKb = Math.round(images.reduce((sum, i) => sum + i.bytes, 0) / 1024);
  const breakdown = images
    .map((i) => `${i.name} ${Math.round(i.bytes / 1024)} KB`)
    .join(', ');

  expect(
    totalKb,
    `landing images were ${totalKb} KB (budget ${INITIAL_IMAGE_BUDGET_KB} KB) — ${breakdown}`,
  ).toBeLessThanOrEqual(INITIAL_IMAGE_BUDGET_KB);
});

/**
 * The specific regression, pinned separately from the aggregate budget.
 *
 * A total-bytes cap can be satisfied while still shipping one absurdly
 * oversized image, and the failure message would not say which. This asserts
 * the property that actually matters: nothing on the landing critical path is
 * served at a resolution wildly beyond the box it is painted into.
 */
test('no landing image is served far larger than it is displayed', async ({ page }) => {
  await page.goto('/', { waitUntil: 'networkidle' });

  const { examined, oversized } = await page.evaluate(() => {
    const rendered = [...document.querySelectorAll('img')]
      .filter((img) => img.naturalWidth > 0 && img.clientWidth > 0);
    return {
      examined: rendered.length,
      oversized: rendered
        // 3x the CSS box covers every real display density; beyond that the
        // extra pixels are decoded and thrown away.
        .filter((img) => img.naturalWidth > img.clientWidth * 3)
        .map((img) => `${new URL(img.currentSrc).pathname}: ${img.naturalWidth}px natural vs ${img.clientWidth}px displayed`),
    };
  });

  // Same reason as the budget test: an empty list of rendered images would make
  // `oversized` trivially empty and the assertion meaningless.
  expect(examined, 'expected at least one rendered image to check').toBeGreaterThan(0);
  expect(oversized, `oversized images on the critical path: ${oversized.join('; ')}`).toEqual([]);
});
