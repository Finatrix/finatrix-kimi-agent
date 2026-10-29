/**
 * Keyboard focus walk, shared by scripts/design-audit.mjs and
 * e2e/design-floor.spec.ts so the audit and the regression guard measure the
 * same thing.
 *
 * It presses Tab until focus comes back round (or `max` stops) and checks each
 * stop against WCAG 2.2:
 *   - 2.4.7 Focus Visible: the element draws an outline or a box-shadow, or
 *     blurring it changes how it, its ::before / ::after or a child looks (a
 *     ring drawn on an inner pill, a border or fill change).
 *   - 2.4.11 Focus Not Obscured: the point at its centre belongs to the element,
 *     not to something on top of it such as a fixed tab bar or sticky header.
 */

/** Runs in the page after a Tab press; must not close over anything. */
async function focusStop() {
  const el = document.activeElement;
  if (!el || el === document.body || el === document.documentElement) return null;
  el.dataset.auditFocus ||= String(document.querySelectorAll('[data-audit-focus]').length);
  const frame = () => new Promise((r) => requestAnimationFrame(r));
  // Focus can start a smooth scroll and style transitions; measure where they end.
  // A smooth scroll can take a frame or two to start, so "settled" means the
  // element has not moved for 8 frames in a row.
  const settle = async () => {
    let last = '';
    for (let i = 0, still = 0; i < 240 && still < 8; i++) {
      const b = el.getBoundingClientRect();
      const at = `${b.top},${b.left}`;
      still = at === last ? still + 1 : 0;
      last = at;
      await frame();
    }
    const finite = el.getAnimations({ subtree: true }).filter((a) => Number.isFinite(a.effect?.getComputedTiming().endTime));
    await Promise.all(finite.map((a) => a.finished.catch(() => {})));
  };
  const cls = (e) => (e.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).join('.');
  const tag = (e) => e.tagName.toLowerCase() + (cls(e) ? '.' + cls(e) : '');
  const label = (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 28);
  await settle();
  const sized = el.getBoundingClientRect();
  const shown = sized.width > 1 && sized.height > 1 && el.checkVisibility();
  const cs = getComputedStyle(el);
  let indicator = !shown || (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 1 && !/,\s*0\)$/.test(cs.outlineColor)) || cs.boxShadow !== 'none';
  if (!indicator) {
    const look = () =>
      [el, ...el.querySelectorAll('*')]
        .slice(0, 12)
        .flatMap((e) => [getComputedStyle(e), getComputedStyle(e, '::before'), getComputedStyle(e, '::after')])
        .map((c) => [c.outlineStyle, c.outlineWidth, c.outlineColor, c.boxShadow, c.borderColor, c.backgroundColor, c.color, c.textDecorationLine].join(' '))
        .join('|');
    const focused = look();
    el.blur();
    await settle();
    indicator = look() !== focused;
    el.focus({ focusVisible: true });
    await settle();
  }
  let obscuredBy = '';
  if (shown) {
    const box = el.getBoundingClientRect();
    const x = box.left + box.width / 2;
    const y = box.top + box.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) obscuredBy = 'the edge of the viewport';
    else {
      const hit = document.elementFromPoint(x, y);
      const own = !hit || el.contains(hit) || hit.contains(el) || [...(el.labels ?? [])].some((l) => l.contains(hit));
      if (!own) obscuredBy = tag(hit.closest('nav, header, footer, aside, [role="dialog"]') ?? hit);
    }
  }
  return { id: el.dataset.auditFocus, name: `${tag(el)} "${label}"`, indicator, obscuredBy };
}

export async function walkFocus(page, max = 80) {
  const seen = new Set();
  const noRing = [];
  const obscured = [];
  for (let i = 0; i < max; i++) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(focusStop);
    if (!stop) continue;
    if (seen.has(stop.id)) break;
    seen.add(stop.id);
    if (!stop.indicator) noRing.push(stop.name);
    if (stop.obscuredBy) obscured.push(`${stop.name} under ${stop.obscuredBy}`);
  }
  return { stops: seen.size, noRing, obscured };
}
