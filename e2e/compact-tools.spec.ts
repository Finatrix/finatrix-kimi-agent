import { test, expect, type Page } from '@playwright/test';

/**
 * Shorter tool pages and the Expense Tracker's floating "+", in a real engine.
 *
 * Unit tests can say a region has the `hidden` attribute; only a browser can
 * say it takes no space, that a fixed button really is on screen after a long
 * scroll, and that an open dialog really paints over it. Each of those was a
 * shipped bug somewhere in this product before, so each is measured here:
 *
 *   • The education block under every calculator is collapsed by default and,
 *     collapsed, is a few hundred pixels — it used to be 3,500–6,500px on a
 *     phone. Opening it grows the page; closing it gives the height back.
 *   • The disclosure works from the keyboard alone.
 *   • The "+" stays on screen while scrolling, does not overlap the AI
 *     launcher or the tab bar, opens the existing add sheet, is covered by
 *     that sheet while it is open, and gets focus back when it closes.
 *   • A spend saved through it appears in the list straight away.
 */

test.beforeEach(async ({ page }) => {
  // The timed "Save your progress" prompt would otherwise intercept a click
  // that lands after its delay; it has its own coverage.
  await page.addInitScript(() => localStorage.setItem('fx_login_prompt_seen', '1'));
});

const TOOLS = ['budget', 'expenses', 'investmatch', 'parksmart', 'peercompare', 'goals', 'lifemap', 'networth'] as const;

async function openTool(page: Page, id: string) {
  await page.goto(`/tools/${id}`);
  await page.locator('#about-this-tool').waitFor({ state: 'visible' });
}

/** The height of the education block (heading to disclaimer). */
function educationHeight(page: Page) {
  return page.locator('#about-this-tool').evaluate((h) => h.parentElement!.getBoundingClientRect().height);
}

test.describe('collapsed education on every calculator', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  for (const id of TOOLS) {
    test(`${id}: reference collapsed by default, and collapsed means no height`, async ({ page }) => {
      await openTool(page, id);
      const toggle = page.getByRole('button', { name: 'Show calculation, examples & FAQ' });
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByRole('heading', { name: 'How this is calculated', exact: true })).toBeHidden();

      const collapsed = await educationHeight(page);
      expect(collapsed, 'collapsed education block height').toBeLessThan(600);

      await toggle.click();
      await expect(page.getByRole('button', { name: 'Hide calculation, examples & FAQ' })).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('heading', { name: 'Frequently asked questions' })).toBeVisible();
      expect(await educationHeight(page)).toBeGreaterThan(collapsed + 1000);

      await page.getByRole('button', { name: 'Hide calculation, examples & FAQ' }).click();
      expect(Math.abs((await educationHeight(page)) - collapsed)).toBeLessThan(2);

      // Never wider than the phone.
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    });
  }

  test('the disclosure is operable from the keyboard alone', async ({ page }) => {
    await openTool(page, 'goals');
    const toggle = page.getByRole('button', { name: 'Show calculation, examples & FAQ' });
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Hide calculation, examples & FAQ' })).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: 'Show calculation, examples & FAQ' })).toHaveAttribute('aria-expanded', 'false');
  });

  test('a link to a section inside it opens it and lands there', async ({ page }) => {
    await page.goto('/tools/budget#methodology');
    await expect(page.getByRole('heading', { name: 'How this is calculated', exact: true })).toBeVisible();
    await expect.poll(() => page.locator('#methodology').evaluate((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 0 && r.top < innerHeight;
    })).toBe(true);
  });
});

test.describe('Expense Tracker floating add', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('stays on screen, clears the other docks, and adds through the existing sheet', async ({ page }) => {
    await page.goto('/tools/expenses');
    const fab = page.getByRole('button', { name: 'Add expense' });
    await expect(fab).toBeVisible();

    // Fixed to the viewport even at the very bottom of a long page.
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }));
    await expect(fab).toBeInViewport();

    const rect = (selector: string) => page.locator(selector).first().evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    });
    const plus = await rect('.fx-add-fab');
    const ai = await rect('.fx-ai-dock');
    const tabs = await rect('.fx-mobnav');
    const overlaps = (a: typeof plus, b: typeof plus) =>
      a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
    expect(overlaps(plus, ai), '+ overlaps the AI launcher').toBe(false);
    expect(overlaps(plus, tabs), '+ overlaps the tab bar').toBe(false);

    await fab.click();
    const dialog = page.getByRole('dialog', { name: 'Add a transaction' });
    await expect(dialog).toBeVisible();

    // The open sheet covers the button: whatever is painted at its centre is
    // part of the dialog's overlay, not the "+".
    const covered = await page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit && !hit.closest('.fx-add-dock');
    }, { x: (plus.left + plus.right) / 2, y: (plus.top + plus.bottom) / 2 });
    expect(covered, 'the dialog paints over the floating button').toBe(true);

    await dialog.getByLabel(/^Amount/).fill('412.75');
    await dialog.getByRole('button', { name: 'Add transaction' }).click();
    await expect(dialog).toBeHidden();
    await expect(fab).toBeFocused();

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fx_expenses') ?? '[]') as { amount: number }[]);
    expect(stored.map((e) => e.amount)).toContain(412.75);
    await expect(page.locator('body')).toContainText(/41[23]/);
  });

  test('cancel and Escape leave nothing behind and return focus', async ({ page }) => {
    await page.goto('/tools/expenses');
    const fab = page.getByRole('button', { name: 'Add expense' });
    await fab.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Add a transaction' });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(fab).toBeFocused();

    await fab.click();
    await dialog.getByLabel(/^Amount/).fill('50');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('fx_expenses') ?? '[]').length)).toBe(0);
  });
});
