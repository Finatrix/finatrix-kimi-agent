import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { CONTENT_PATHS } from '../src/shared/content';
import { PUBLIC_PAGE_PATHS } from '../src/shared/publicPages';
import { TOOL_IDS } from '../src/shared/routes';

/**
 * WCAG 2.2 AA on the public surface, checked by an actual rule engine.
 *
 * The pre-launch review's finding was precise: accessibility here was
 * "asserted, not axe-verified". The tools had a hand-rolled audit
 * (`a11y-finance.spec.ts`) covering the invariants that page-level assembly
 * tends to break — accessible names, labels, duplicate ids, heading gaps,
 * target size — and that audit is genuinely useful, but it can only check the
 * rules someone thought to write. It knows nothing about colour contrast, ARIA
 * attribute validity, landmark uniqueness, or the dozens of other conditions in
 * the WCAG rule set.
 *
 * This runs axe-core over every public URL, in light AND dark theme, at desktop
 * and mobile widths. These pages are the ones an anonymous visitor arrives on
 * from a search result, so they are both the most-seen surface and the one with
 * no signed-in state to hide behind.
 *
 * Violations fail the build. There is no allowlist of "known issues": one is
 * how a suite stops meaning anything, and every rule below is currently clean.
 */

/**
 * Every indexable URL, derived from the same registries the app and the sitemap
 * read rather than restated here.
 *
 * It was a hand-maintained list, which meant the suite's coverage silently
 * stopped growing the moment someone added a page and forgot this file — and a
 * page nobody remembered to add is exactly the page most likely to carry a
 * violation. Deriving it means a new guide, tool or marketing page is scanned on
 * the commit that ships it.
 */
const ALL_PAGES = [
  '/',
  ...TOOL_IDS.map((id) => `/tools/${id}`),
  ...PUBLIC_PAGE_PATHS,
  ...CONTENT_PATHS,
];

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

async function scan(page: Page, url: string) {
  // Reduced motion, so the scan sees the page's SETTLED state.
  //
  // Not a convenience: pages fade in behind an opacity transition, and axe
  // computes effective colour through ancestor opacity. Scanning mid-animation
  // reported contrast failures on elements that are perfectly legible once the
  // animation finishes — `.foot` measured 3.63:1 at opacity 0.607 and 5.0:1 at
  // rest. WCAG evaluates the resting state, so the alternative is a suite that
  // fails on whichever elements happened to still be fading, which is both
  // wrong and flaky.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(url, { waitUntil: 'networkidle' });
  // The heading is the signal that the lazy route chunk has actually rendered;
  // scanning a Suspense fallback would pass every rule and prove nothing.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  return new AxeBuilder({ page }).withTags(TAGS).analyze();
}

/** Readable failure output — axe's raw JSON is unusable in a CI log. */
function describe(results: Awaited<ReturnType<typeof scan>>): string {
  return results.violations
    .map((v) => {
      const where = v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ');
      return `[${v.impact}] ${v.id}: ${v.help}\n    at ${where}\n    ${v.helpUrl}`;
    })
    .join('\n');
}

for (const url of ALL_PAGES) {
  test(`${url} has no WCAG 2.2 AA violations`, async ({ page }) => {
    const results = await scan(page, url);
    expect(results.violations.length, `\n${describe(results)}\n`).toBe(0);
  });
}

/**
 * Dark is the default theme and light is a real, equally-supported mode, so a
 * contrast regression in either is a regression. Checked on the pages carrying
 * the most varied surfaces — cards, tables, muted footnotes, disclosure widgets
 * — rather than the whole set, because contrast is a property of the shared
 * token set and running the full matrix twice buys repetition, not coverage.
 * An article is in the list because the knowledge layer introduced surfaces the
 * rest of the site does not have: data tables, formula panels and asides.
 */
for (const theme of ['light', 'dark'] as const) {
  for (const url of ['/', '/pricing', '/careers/compare/linkedin', '/learn/investing/sip-maths']) {
    test(`${url} passes contrast in the ${theme} theme`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme });
      await page.addInitScript((t) => {
        // The shell's pre-paint boot script reads this, so setting it before
        // navigation avoids scanning a page mid-theme-swap.
        localStorage.setItem('fx_theme', t);
      }, theme);

      const results = await scan(page, url);
      const contrast = results.violations.filter((v) => v.id.includes('contrast'));
      expect(contrast.length, `\n${describe({ ...results, violations: contrast })}\n`).toBe(0);
    });
  }
}

/**
 * Keyboard reachability of the primary conversion path.
 *
 * A pricing page whose "Get Professional" button cannot be reached by keyboard
 * is not a contrast problem or a naming problem — it is a broken checkout, and
 * no static rule engine reports it.
 */
test('the pricing CTAs are keyboard reachable and distinctly named', async ({ page }) => {
  await page.goto('/pricing', { waitUntil: 'networkidle' });

  const ctas = page.getByRole('link', { name: /^Get / });
  const count = await ctas.count();
  expect(count, 'pricing must offer at least one self-serve plan CTA').toBeGreaterThan(0);

  // Each plan's call to action must say WHICH plan. Four identical "Get
  // started" links are indistinguishable to anyone listing the page's links,
  // which is how many screen-reader users navigate (WCAG 2.4.4).
  const names = await ctas.allInnerTexts();
  expect(new Set(names).size, `duplicate CTA names: ${names.join(', ')}`).toBe(count);

  for (let i = 0; i < count; i += 1) {
    await ctas.nth(i).focus();
    await expect(ctas.nth(i)).toBeFocused();
  }
});

/**
 * The billing-period control is a radio group, not a tab list, and must be
 * operable with the arrow keys that pattern promises.
 */
test('the billing period toggle is operable by keyboard', async ({ page }) => {
  await page.goto('/pricing', { waitUntil: 'networkidle' });

  const group = page.getByRole('radiogroup', { name: /billing period/i });
  await expect(group).toBeVisible();

  const monthly = group.getByRole('radio', { name: 'Monthly' });
  const yearly = group.getByRole('radio', { name: 'Yearly' });

  await monthly.focus();
  await expect(monthly).toHaveAttribute('aria-checked', 'true');

  await page.keyboard.press('ArrowRight');
  await expect(yearly).toHaveAttribute('aria-checked', 'true');
  await expect(yearly).toBeFocused();
  // Selection genuinely changed the prices, not just the control's own state.
  await expect(page.getByText('₹9,999')).toBeVisible();

  await page.keyboard.press('ArrowLeft');
  await expect(monthly).toHaveAttribute('aria-checked', 'true');
});

/**
 * Every FAQ answer must be in the DOM while collapsed.
 *
 * Two things depend on it: browser find-in-page, and the honesty of the
 * `FAQPage` structured data these pages emit — Google requires the marked-up
 * answer to be present on the page. A scripted accordion that mounts its answer
 * on click would break both, silently.
 */
test('FAQ answers are present in the DOM before being expanded', async ({ page }) => {
  await page.goto('/faq', { waitUntil: 'networkidle' });

  const details = page.locator('details');
  const count = await details.count();
  expect(count).toBeGreaterThan(8);

  for (let i = 0; i < count; i += 1) {
    await expect(details.nth(i)).not.toHaveAttribute('open', '');
    const answer = details.nth(i).locator('p');
    // Present and non-empty, though not visible — exactly what a crawler reads.
    expect((await answer.textContent())?.trim().length ?? 0).toBeGreaterThan(40);
  }

  // And still operable: a native <summary> toggles on Enter with no JS.
  await details.first().locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(details.first()).toHaveAttribute('open', '');
});
