import { test, expect, type Page } from '@playwright/test';
import { TOOL_IDS } from '../src/shared/routes';

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

// Derived from the route registry rather than hand-listed, so a calculator
// added later is resized at every breakpoint on the commit that ships it.
const TOOLS = [
  '/tools',
  '/tools/dashboard',
  ...TOOL_IDS.map((id) => `/tools/${id}`),
  '/tools/reports',
  '/tools/calendar',
  '/tools/settings',
  // The reference page carries the only data tables under /tools. They scroll
  // inside their own container by design, and this is what proves the page
  // body does not scroll with them on a phone.
  '/tools/reference',
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

/**
 * The same audit, but for a viewport that CHANGES after the page has drawn.
 *
 * Every test above navigates at its target width, so nothing on the page has
 * ever been asked to get smaller. That misses a whole class of defect, and one
 * specific to this product: Chart.js paints to a `<canvas>` whose pixel width
 * it sets itself, and a canvas that does not shrink with its container is a
 * canvas that pushes the page sideways — the layout looks perfect at every
 * width you load it at and breaks on the one thing a phone does for free.
 *
 * Rotating a phone is exactly this. So is opening the keyboard, and so is
 * Stage Manager on iPad. 320px is the narrowest width the module supports, so
 * a wide-to-320 shrink is the strongest version of the check.
 */
const SHRINK_PAGES: { path: string; reveal?: (page: Page) => Promise<void> }[] = [
  { path: '/tools/dashboard' },
  { path: '/tools/expenses' },
  { path: '/tools/reports' },
  {
    // LifeMap draws nothing until a scenario is launched, so without this the
    // test would pass on a page that has no canvas on it — coverage that reads
    // green and proves nothing.
    path: '/tools/lifemap',
    reveal: async (page) => {
      await page.getByRole('button', { name: 'Own a home' }).click();
      await page.getByRole('button', { name: /Launch my LifeMap/ }).click();
      await page.locator('canvas').first().waitFor({ state: 'visible' });
    },
  },
];

for (const { path, reveal } of SHRINK_PAGES) {
  test(`${path} reflows without overflowing when the viewport shrinks after paint`, async ({ page }) => {
    await page.addInitScript(SEED);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(path);
    await page.locator('.fx-tools').first().waitFor({ state: 'visible' });
    await page.waitForLoadState('networkidle');
    await reveal?.(page);
    // Chart.js animates in; measuring mid-animation measures nothing.
    await page.waitForTimeout(600);

    await page.setViewportSize({ width: 320, height: 900 });
    // Chart.js resizes from a ResizeObserver, which lands a frame or more later.
    await page.waitForTimeout(1200);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth
    );
    expect(overflow, `${path} scrolls horizontally by ${overflow}px after shrinking to 320px`).toBeLessThanOrEqual(1);

    const wide = await overflowingElements(page, 320);
    expect(wide, `${path} has elements past the right edge after shrinking to 320px:\n  ${wide.join('\n  ')}`).toEqual([]);
  });
}
