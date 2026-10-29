import { test, expect } from '@playwright/test';

/**
 * The design floors, as a regression guard. The full measurement lives in
 * scripts/design-audit.mjs (every surface, eight widths, both themes); this is
 * the cheap subset that runs on every push, on the pages people land on.
 *
 *   - no visible text under 11px
 *   - nothing wider than the screen
 *   - no `transition: all`
 *   - every :hover rule behind (hover: hover) and (pointer: fine)
 *   - no overshooting easing curve on anything currently on screen
 */
const PAGES = ['/', '/tools/dashboard', '/tools/expenses', '/tools/all', '/login'];

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('fx_walkthrough_seen', '1');
    localStorage.setItem('fx_tour_optout', '1');
  });
});

for (const path of PAGES) {
  test(`design floors hold on ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    const r = await page.evaluate(() => {
      const visible = (el: Element) => {
        if (!(el as HTMLElement).checkVisibility?.({ checkOpacity: true, checkVisibilityCSS: true })) return false;
        const b = el.getBoundingClientRect();
        return b.width > 1 && b.height > 1;
      };
      const small: string[] = [];
      const all: string[] = [];
      const overshoot: string[] = [];
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('svg')) continue;
        const cs = getComputedStyle(el);
        const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent!.trim());
        if (hasText && visible(el) && parseFloat(cs.fontSize) < 11) small.push(`${el.tagName} ${cs.fontSize} "${el.textContent!.trim().slice(0, 24)}"`);
        const durs = cs.transitionDuration.split(',').map((d) => parseFloat(d));
        if (/(^|,\s*)all(\s|,|$)/.test(cs.transitionProperty) && durs.some((d) => d > 0)) all.push(el.tagName + '.' + String(el.className).slice(0, 30));
        for (const tf of [cs.transitionTimingFunction, cs.animationTimingFunction]) {
          for (const m of tf.matchAll(/cubic-bezier\(([^)]+)\)/g)) {
            const [, y1, , y2] = m[1].split(',').map(Number);
            if (y1 > 1 || y2 > 1) overshoot.push(el.tagName + '.' + String(el.className).slice(0, 30));
          }
        }
      }
      const ungated: string[] = [];
      const walk = (rules: CSSRuleList, gated: boolean) => {
        for (const rule of rules) {
          if (rule instanceof CSSMediaRule) walk(rule.cssRules, gated || /hover\s*:\s*hover/.test(rule.conditionText));
          else if (rule instanceof CSSStyleRule && rule.selectorText.includes(':hover') && !gated) ungated.push(rule.selectorText.slice(0, 60));
          else if ('cssRules' in rule && !(rule instanceof CSSKeyframesRule)) walk((rule as CSSGroupingRule).cssRules, gated);
        }
      };
      for (const sheet of document.styleSheets) {
        try { walk(sheet.cssRules, false); } catch { /* cross-origin */ }
      }
      const doc = document.scrollingElement!;
      return { small, all, overshoot, ungated, overflow: doc.scrollWidth - doc.clientWidth };
    });
    expect(r.small, 'text under 11px').toEqual([]);
    expect(r.overflow, 'horizontal overflow (px)').toBeLessThanOrEqual(0);
    expect(r.all, 'transition: all').toEqual([]);
    expect(r.overshoot, 'overshooting easing').toEqual([]);
    expect(r.ungated, 'ungated :hover rules').toEqual([]);
  });
}
