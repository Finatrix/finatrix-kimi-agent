import { test, expect, type Page } from '@playwright/test';
import { TOOL_IDS } from '../src/shared/routes';

/**
 * Accessibility floor for every Finance tool, checked against the real DOM.
 *
 * These are the invariants that stay true no matter what a page renders: every
 * control has an accessible name, every field has a label, ids are unique, the
 * heading outline has no gaps, and pointer targets clear the WCAG 2.2 (2.5.8)
 * 24px minimum. Component tests already cover behaviour per widget; this
 * catches the drift that only appears once a whole page is assembled.
 *
 * The exclusions below are deliberate and each one is a real exemption, not a
 * convenience — see the notes at each site.
 */

/**
 * Every Finance route, derived from the same registry the app and the sitemap
 * read. It was a hand-written list, which meant a new calculator was covered
 * only if whoever added it remembered this file — and the page nobody
 * remembered is the one most likely to carry a violation.
 */
const TOOLS = [
  '/tools',
  '/tools/dashboard',
  ...TOOL_IDS.map((id) => `/tools/${id}`),
  '/tools/reports',
  '/tools/calendar',
  '/tools/settings',
];

const SEED = () => {
  const now = new Date();
  const cm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  localStorage.setItem('fx_bb_data', JSON.stringify({
    [cm]: { income: '85000', n: '50', w: '30', s: '20', vals: { rent: 24000, groceries: 9000, stocks: 12000 } },
  }));
  localStorage.setItem('fx_expenses', JSON.stringify(
    ['rent', 'groceries', 'eating_out'].map((c, i) => ({
      id: `s${i}`, amount: 1200 + i * 900, category: c,
      date: `${cm}-0${i + 1}`, merchant: `Merchant ${i}`, paymentMethod: 'UPI',
    }))
  ));
};

interface Findings {
  unnamed: string[];
  unlabelledFields: string[];
  smallTargets: string[];
  dupIds: string[];
  headingJumps: string[];
  h1: number;
}

async function audit(page: Page): Promise<Findings> {
  return page.evaluate(() => {
    const sel = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}` +
      (typeof el.className === 'string' && el.className.trim()
        ? `.${el.className.trim().split(/\s+/).slice(0, 2).join('.')}` : '');

    const name = (el: Element): string => {
      const aria = el.getAttribute('aria-label');
      if (aria?.trim()) return aria.trim();
      const lb = el.getAttribute('aria-labelledby');
      if (lb) {
        const t = lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent ?? '').join(' ').trim();
        if (t) return t;
      }
      if (el.id) {
        const lab = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
        if (lab?.textContent?.trim()) return lab.textContent.trim();
      }
      if (el.closest('label')?.textContent?.trim()) return el.closest('label')!.textContent!.trim();
      const title = el.getAttribute('title');
      if (title?.trim()) return title.trim();
      return (el as HTMLElement).innerText?.trim() ?? '';
    };

    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    };
    /** Hidden from assistive tech via itself or any ancestor. */
    const ariaHidden = (el: Element) => !!el.closest('[aria-hidden="true"]');

    const interactive = Array.from(
      document.querySelectorAll('button, a[href], input, select, textarea, [role="button"], [role="tab"], [tabindex]:not([tabindex="-1"])')
    ).filter(visible).filter((el) => !ariaHidden(el));

    const unnamed = interactive.filter((el) => !name(el)).map(sel);

    /**
     * WCAG 2.2 AA (2.5.8) — 24x24 CSS px minimum. Two documented exemptions:
     *   • "Inline": a link whose size is constrained by the line-height of the
     *     surrounding text (breadcrumbs, footer links, links in prose).
     *   • The skip link, which is visually collapsed until focused and renders
     *     at full size once it is.
     * A checkbox inside a <label> is measured by the label, since clicking the
     * label is what activates it — that IS the target.
     */
    const targetOf = (el: Element): DOMRect => {
      if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'checkbox') {
        const lab = el.closest('label');
        if (lab) return lab.getBoundingClientRect();
      }
      return el.getBoundingClientRect();
    };
    /**
     * The "Inline" exception, tested structurally rather than by tag name: a
     * link is inline when its parent carries prose of its own around it, so
     * the link's height is dictated by the line-height of text it does not
     * control. That covers "Read our <Privacy Policy> and <Terms>." and the
     * breadcrumb/footer runs, without exempting a standalone link that merely
     * happens to sit in a <p>.
     */
    const inlineExempt = (el: Element) => {
      if (el.tagName !== 'A') return false;
      const parent = el.parentElement;
      if (!parent) return false;
      const own = (el as HTMLElement).innerText ?? '';
      const around = (parent.textContent ?? '').replace(own, '').trim();
      return around.length > 0;
    };

    const smallTargets = interactive
      .filter((el) => !inlineExempt(el))
      .filter((el) => !el.className.toString().includes('sr-only'))
      .filter((el) => {
        const r = targetOf(el);
        return r.width < 24 || r.height < 24;
      })
      .map((el) => {
        const r = targetOf(el);
        return `${sel(el)} ${Math.round(r.width)}x${Math.round(r.height)} "${name(el).slice(0, 30)}"`;
      });

    const dupIds = (() => {
      const seen = new Map<string, number>();
      for (const el of Array.from(document.querySelectorAll('[id]'))) {
        seen.set(el.id, (seen.get(el.id) ?? 0) + 1);
      }
      return Array.from(seen.entries()).filter(([, n]) => n > 1).map(([id, n]) => `${id} x${n}`);
    })();

    const unlabelledFields = Array.from(document.querySelectorAll('input, select, textarea'))
      .filter(visible)
      .filter((el) => !ariaHidden(el))
      .filter((el) => (el as HTMLInputElement).type !== 'hidden')
      .filter((el) => !name(el))
      .map(sel);

    const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6'))
      .filter(visible)
      .map((h) => Number(h.tagName[1]));
    const headingJumps: string[] = [];
    for (let i = 1; i < headings.length; i++) {
      if (headings[i] - headings[i - 1] > 1) headingJumps.push(`h${headings[i - 1]} -> h${headings[i]}`);
    }

    return {
      unnamed, smallTargets, dupIds, unlabelledFields, headingJumps,
      h1: headings.filter((n) => n === 1).length,
    };
  });
}

for (const path of TOOLS) {
  test(`${path} meets the Finance accessibility floor`, async ({ page }) => {
    await page.addInitScript(SEED);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(path);
    await page.locator('.fx-tools').first().waitFor({ state: 'visible' });
    await page.waitForLoadState('networkidle');

    const r = await audit(page);

    expect(r.unnamed, `controls with no accessible name:\n  ${r.unnamed.join('\n  ')}`).toEqual([]);
    expect(r.unlabelledFields, `form fields with no label:\n  ${r.unlabelledFields.join('\n  ')}`).toEqual([]);
    expect(r.dupIds, `duplicate ids (breaks label/aria references):\n  ${r.dupIds.join('\n  ')}`).toEqual([]);
    expect(r.smallTargets, `pointer targets under 24px (WCAG 2.2 2.5.8):\n  ${r.smallTargets.join('\n  ')}`).toEqual([]);
    expect(r.headingJumps, `gaps in the heading outline:\n  ${r.headingJumps.join('\n  ')}`).toEqual([]);
    expect(r.h1, 'each page needs exactly one h1').toBe(1);
  });
}
