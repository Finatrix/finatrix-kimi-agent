import { test, expect, type Page } from '@playwright/test';

/**
 * Responsive audit for the whole Finance module.
 *
 * The existing mobile spec proves one tab at one width. This walks every
 * Finance tool across the full breakpoint ladder and asserts the two failures
 * that actually break a layout: the page scrolling sideways, and an individual
 * element rendering wider than the viewport that contains it.
 *
 * Both checks are reported with the offending selectors, because "something
 * overflows at 320px" is not an actionable bug report — the point of running
 * this in a real browser is to name the element.
 *
 * Runs desktop-Chrome only (the `mobile` project pins its own Pixel 7
 * viewport, which would fight the per-width resizing this spec depends on).
 */
test.describe.configure({ mode: 'parallel' });

const WIDTHS = [320, 375, 390, 414, 768, 1024, 1280, 1440];

const TOOLS = [
  '/tools',
  '/tools/dashboard',
  '/tools/budget',
  '/tools/expenses',
  '/tools/investmatch',
  '/tools/parksmart',
  '/tools/peercompare',
  '/tools/goals',
  '/tools/lifemap',
  '/tools/reports',
  '/tools/calendar',
  '/tools/settings',
];

/** Seed enough real data that charts, bars and long labels actually render. */
const SEED = () => {
  const now = new Date();
  const cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  localStorage.setItem('fx_bb_data', JSON.stringify({
    [cm]: {
      income: '85000', n: '50', w: '30', s: '20',
      vals: { rent: 24000, groceries: 9000, transport: 4200, eating_out: 6500, stocks: 12000 },
    },
  }));
  localStorage.setItem('fx_expenses', JSON.stringify(
    ['rent', 'groceries', 'eating_out', 'transport', 'shopping', 'subscriptions'].map((c, i) => ({
      id: `seed-${i}`,
      amount: 1200 + i * 900,
      category: c,
      date: `${cm}-0${(i % 8) + 1}`,
      merchant: `A Deliberately Long Merchant Name ${i}`,
      paymentMethod: 'UPI',
      note: 'Long-ish note so text wrapping is exercised too',
    }))
  ));
};

/**
 * Elements wider than the viewport, excluding those an ancestor already
 * contains. "Contained" means any ancestor that clips or scrolls on the X
 * axis — `hidden` and `clip` matter as much as `auto`/`scroll` here: the
 * ambient background glow is a 64vh circle that deliberately overhangs the
 * viewport inside an `overflow:hidden` backdrop, and counting it as overflow
 * flags every page in the module while telling you nothing.
 */
async function overflowingElements(page: Page, width: number): Promise<string[]> {
  return page.evaluate((vw) => {
    const isContained = (el: Element) => {
      const o = getComputedStyle(el).overflowX;
      return o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip';
    };
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` +
      `${el.className && typeof el.className === 'string' ? `.${el.className.trim().split(/\s+/).slice(0, 3).join('.')}` : ''}`;

    const out: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      // Only flag things that actually stick out past the right edge.
      if (r.right <= vw + 1) continue;
      let p: Element | null = el.parentElement;
      let contained = false;
      while (p && p !== document.body) {
        if (isContained(p)) { contained = true; break; }
        p = p.parentElement;
      }
      if (!contained) out.push(`${describe(el)} (right=${Math.round(r.right)})`);
    }
    return Array.from(new Set(out)).slice(0, 8);
  }, width);
}

for (const path of TOOLS) {
  test(`${path} lays out cleanly at every breakpoint`, async ({ page }) => {
    await page.addInitScript(SEED);

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      // The tool pages are lazy chunks; wait for the shell to actually paint.
      await page.locator('.fx-tools').first().waitFor({ state: 'visible' });
      await page.waitForLoadState('networkidle');

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      );
      expect(overflow, `${path} @ ${width}px scrolls horizontally by ${overflow}px`).toBeLessThanOrEqual(1);

      const wide = await overflowingElements(page, width);
      expect(wide, `${path} @ ${width}px has elements past the right edge:\n  ${wide.join('\n  ')}`).toEqual([]);
    }
  });
}
