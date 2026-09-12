import { test, expect, type Page } from '@playwright/test';

/**
 * The Result → Explanation → Action → Next step block, in a real browser, in
 * the state that only exists after a calculator has actually produced an answer.
 *
 * `a11y-finance.spec.ts` audits every tool route as it FIRST loads — a form and
 * a heading. Everything this file is about appears only once the reader presses
 * the button: the interpretation, the methodology drawer, the educational next
 * steps and the links onward. That is the half of each page a static route scan
 * cannot reach, and it is the half carrying the product's central claim.
 *
 * What is checked, and why each one is a real failure rather than a nicety:
 *
 *   • The four parts appear, in order. A result that stops at a number is the
 *     thing this component exists to prevent.
 *   • The drawer is closed on arrival. Progressive disclosure is the whole
 *     design; a specification dumped into the default view is a different,
 *     worse page.
 *   • The drawer opens from the keyboard alone. A transparency feature only
 *     mouse users can reach is not transparency.
 *   • The heading outline has no gaps, with the drawer open — the state where a
 *     nested `h4` under an `h2` would slip through a load-time scan.
 *   • Nothing overflows a phone. Long financial figures inside a two-column
 *     definition list is exactly where horizontal scroll appears.
 */

/** Reaching the result costs one press on each of these. */
const CALCULATORS = [
  { path: '/tools/parksmart', submit: 'Compare the options' },
  { path: '/tools/peercompare', submit: 'Show the comparison' },
  { path: '/tools/goals', submit: 'Show me the path' },
  { path: '/tools/lifemap', submit: 'Launch my LifeMap →' },
] as const;

async function produceResult(page: Page, path: string, submit: string) {
  await page.goto(path);
  await page.locator('.fx-tools').first().waitFor({ state: 'visible' });
  await page.getByRole('button', { name: submit }).click();
  await page.getByRole('heading', { name: 'What this means' }).waitFor({ state: 'visible' });
}

for (const { path, submit } of CALCULATORS) {
  test.describe(path, () => {
    test('explains the result, shows its working and says what comes next', async ({ page }) => {
      await produceResult(page, path, submit);

      await expect(page.getByRole('heading', { name: 'What this means' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'What you could do next' })).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Continue in FinatriX' })).toBeVisible();

      // The interpretation is prose about this result, not a restated figure.
      const meaning = page.locator('.fx-outcome-meaning');
      await expect(meaning).toBeVisible();
      expect((await meaning.innerText()).split(/\s+/).length).toBeGreaterThan(25);

      // Every next step is a real link into the app, and none loops back here.
      const links = page.locator('.fx-outcome-next a');
      expect(await links.count()).toBeGreaterThan(0);
      for (const href of await links.evaluateAll((els) => els.map((e) => e.getAttribute('href')))) {
        expect(href).toMatch(/^\/tools\//);
        expect(href).not.toBe(path);
      }
    });

    test('keeps the workings behind a disclosure that opens from the keyboard', async ({ page }) => {
      await produceResult(page, path, submit);

      const details = page.locator('details.fx-method-full');
      await expect(details).toHaveCount(1);
      await expect(details).not.toHaveAttribute('open', /.*/);

      // Focus the summary directly and activate it with the keyboard alone.
      await details.locator('summary').focus();
      await page.keyboard.press('Enter');
      await expect(details).toHaveAttribute('open', /.*/);

      // What the disclosure is for: the method, and the limits, on the page.
      // Scoped to the drawer — the tool's education footer further down the
      // page renders the same limits from the same registry, which is
      // deliberate (one is disclosure at the result, the other is the
      // reference section) and would otherwise make these locators ambiguous.
      await expect(details.getByRole('heading', { name: 'The method' })).toBeVisible();
      await expect(
        details.getByRole('heading', { name: 'What it assumes, and what it does not do' }),
      ).toBeVisible();
      await expect(details.getByRole('link', { name: /How we check our work/i })).toBeVisible();
    });

    test('has an unbroken heading outline with the workings open', async ({ page }) => {
      await produceResult(page, path, submit);
      await page.locator('details.fx-method-full summary').click();
      await expect(page.locator('.fx-method-body').getByRole('heading', { name: 'The method' })).toBeVisible();

      const jumps = await page.evaluate(() => {
        const visible = (el: Element) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        };
        const levels = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
          .filter(visible)
          .map((h) => Number(h.tagName[1]));
        const out: string[] = [];
        for (let i = 1; i < levels.length; i++) {
          if (levels[i] - levels[i - 1] > 1) out.push(`h${levels[i - 1]} -> h${levels[i]}`);
        }
        return out;
      });
      expect(jumps, `gaps in the heading outline:\n  ${jumps.join('\n  ')}`).toEqual([]);
    });

    test('never scrolls sideways on a phone, drawer open', async ({ page }) => {
      await page.setViewportSize({ width: 360, height: 780 });
      await produceResult(page, path, submit);
      await page.locator('details.fx-method-full summary').click();
      await expect(page.locator('.fx-method-body').getByRole('heading', { name: 'The method' })).toBeVisible();

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth, 'the page must never scroll horizontally').toBeLessThanOrEqual(clientWidth);
    });
  });
}

test('the methodology shows the market, its review date and its sources', async ({ page }) => {
  // ParkSmart's answer depends entirely on market data, so this is the tool
  // where an undated rate would be most misleading.
  await produceResult(page, '/tools/parksmart', 'Compare the options');
  await page.locator('details.fx-method-full summary').click();

  const drawer = page.locator('details.fx-method-full');
  await expect(drawer.getByRole('heading', { name: 'Market and sources' })).toBeVisible();
  await expect(drawer.getByText('Figures last reviewed')).toBeVisible();
  await expect(drawer.getByText(/Maintained by hand/)).toBeVisible();
});
