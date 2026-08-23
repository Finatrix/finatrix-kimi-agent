import { test, expect, type Page } from '@playwright/test';
import { CONTENT_PATHS } from '../src/shared/content';
import { PUBLIC_PAGE_PATHS } from '../src/shared/publicPages';
import { TOOL_IDS } from '../src/shared/routes';
import { INDEXABLE } from '../src/lib/seo';

/**
 * A real browser visits every public URL and checks the things that only exist
 * once the page has actually rendered.
 *
 * The unit suites prove the registries agree with each other, and
 * `a11y-public.spec.ts` proves the rendered DOM satisfies WCAG. Neither can see
 * this class of defect:
 *
 *   • a console error or an unhandled rejection on a page that otherwise looks
 *     fine — the single most common symptom of a lazy chunk that failed to
 *     resolve, a null dereference in a rarely-hit branch, or a bad key;
 *   • a request that 404s (a share card, a font, a chunk) while the page still
 *     paints, which is invisible to every other test;
 *   • horizontal overflow at a phone width, which no assertion about markup can
 *     detect and which makes a page feel broken more than almost anything else;
 *   • the head the CLIENT ends up with after hydration and after the lazy copy
 *     chunk upgrades the JSON-LD — as opposed to the head the pure functions
 *     say it should have.
 *
 * Every URL is derived from the same registries the app and the sitemap read,
 * so a page added tomorrow is crawled on the commit that ships it.
 */

const ALL_PAGES = [
  '/',
  ...TOOL_IDS.map((id) => `/tools/${id}`),
  ...PUBLIC_PAGE_PATHS,
  ...CONTENT_PATHS,
];

/** Console errors and failed requests, collected for the life of one page. */
function watch(page: Page) {
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

test.describe('every public page, in a browser', () => {
  for (const path of ALL_PAGES) {
    test(`${path} renders clean`, async ({ page }) => {
      const { errors, failed } = watch(page);

      const response = await page.goto(path, { waitUntil: 'networkidle' });
      expect(response?.status(), `${path} HTTP status`).toBeLessThan(400);

      // One h1, present, non-empty. A page shell that rendered without its
      // content still has a nav and a footer, so the h1 is the real signal.
      const h1s = page.locator('main h1');
      await expect(h1s, `${path} must have exactly one h1`).toHaveCount(1);
      expect((await h1s.first().textContent())?.trim().length, `${path} h1 is empty`)
        .toBeGreaterThan(0);

      // The head, as the client actually ends up with it.
      const head = await page.evaluate(() => ({
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute('content') ?? '',
        canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? '',
        robots: document.querySelector('meta[name="robots"]')?.getAttribute('content') ?? '',
        ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content') ?? '',
        schema: document.getElementById('fx-route-schema')?.textContent ?? '',
      }));

      expect(head.title.length, `${path} title`).toBeGreaterThan(10);
      expect(head.description.length, `${path} description`).toBeGreaterThan(50);
      // Compared against INDEXABLE, not a copy of it. This assertion held the
      // literal 'index, follow' and went stale the moment the constant gained
      // its max-image-preview / max-snippet / max-video-preview directives —
      // the commit that added them updated seo.ts, seo.test.ts and index.html
      // and missed this file, which turned CI red on main for every one of the
      // 36 indexable pages and stayed that way.
      expect(head.robots, `${path} robots`).toBe(INDEXABLE);
      expect(head.canonical, `${path} canonical`).toBe(
        `https://finatrix.co${path === '/' ? '/' : path}`,
      );
      expect(head.ogImage, `${path} og:image`).toMatch(/^https:\/\/finatrix\.co\/images\/.+\?v=\d+$/);

      // The JSON-LD must parse and describe THIS url.
      expect(head.schema.length, `${path} has no structured data`).toBeGreaterThan(0);
      const graph = JSON.parse(head.schema)['@graph'] as Array<Record<string, unknown>>;
      expect(Array.isArray(graph) && graph.length > 0, `${path} empty @graph`).toBe(true);
      const webpage = graph.find((n) => String(n['@type']).includes('WebPage'));
      if (webpage) expect(webpage.url, `${path} WebPage url`).toBe(head.canonical);

      expect(errors, `${path} console errors:\n${errors.join('\n')}`).toEqual([]);
      expect(failed, `${path} failed requests:\n${failed.join('\n')}`).toEqual([]);
    });
  }
});

/**
 * Horizontal overflow at a phone width.
 *
 * `responsive-finance.spec.ts` already does this for the signed-in tool screens.
 * The public surface had no equivalent, and it is the half a visitor arrives on
 * from a search result — which is overwhelmingly on a phone. Wide tables in the
 * guides and the comparison pages are the specific risk: they are supposed to
 * scroll inside their own container rather than push the document sideways.
 */
test.describe('no horizontal overflow on a phone', () => {
  test.use({ viewport: { width: 360, height: 780 } });

  for (const path of ALL_PAGES) {
    test(`${path} fits 360px`, async ({ page }) => {
      await page.goto(path, { waitUntil: 'networkidle' });
      const overflow = await page.evaluate(() => {
        const doc = document.documentElement;
        if (doc.scrollWidth <= doc.clientWidth + 1) return null;
        // Name the widest offender so a failure is actionable rather than a
        // bare "something is too wide".
        let worst = { tag: '', cls: '', right: 0 };
        for (const el of Array.from(document.body.querySelectorAll<HTMLElement>('*'))) {
          const right = el.getBoundingClientRect().right;
          if (right > worst.right) {
            worst = { tag: el.tagName, cls: el.className?.toString().slice(0, 120) ?? '', right };
          }
        }
        return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, worst };
      });
      expect(overflow, `${path} overflows horizontally: ${JSON.stringify(overflow)}`).toBeNull();
    });
  }
});
