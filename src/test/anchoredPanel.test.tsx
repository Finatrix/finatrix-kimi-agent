import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useAnchoredPanelWidth } from '../hooks/useAnchoredPanelWidth';
import { useState } from 'react';

/**
 * The notification panel's width, which was a real defect on a phone.
 *
 * `.bell-panel` is anchored with `right: 0` and sized `min(92vw, 360px)`, but
 * the bell is not at the right edge of the screen — it comes before the theme
 * toggle and the account menu. On a 375px screen the bell's right edge lands at
 * ~235px, so a 345px panel hung off it started 110px off the LEFT of the
 * screen: the heading, the icons and the left half of every message were
 * simply not there.
 *
 * These are the geometry rules, exercised through the hook that fixes it. The
 * measurement is the thing worth pinning: the components are two thin wrappers
 * around it, and jsdom has no layout of its own to test against.
 */

/** A phone-width header with the anchor 140px in from the right edge. */
function stubLayout(viewport: number, anchorRight: number) {
  const originalWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
  const originalRect = Element.prototype.getBoundingClientRect;
  Object.defineProperty(window, 'innerWidth', { value: viewport, configurable: true });
  Element.prototype.getBoundingClientRect = function rect() {
    return { right: anchorRight, left: 0, top: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0,
      toJSON: () => ({}) } as DOMRect;
  };
  // Both are global: restoring them is what keeps this file from deciding how
  // layout works for whatever runs next.
  return () => {
    if (originalWidth) Object.defineProperty(window, 'innerWidth', originalWidth);
    Element.prototype.getBoundingClientRect = originalRect;
  };
}

function Harness() {
  const [open, setOpen] = useState(false);
  const { anchorRef, panelStyle, measurePanel } = useAnchoredPanelWidth<HTMLDivElement>(open);
  return (
    <div ref={anchorRef}>
      <button type="button" onClick={() => { measurePanel(); setOpen((o) => !o); }}>Toggle</button>
      {open && <div data-testid="panel" style={panelStyle}>panel</div>}
    </div>
  );
}

const panelStyle = () => screen.getByTestId('panel').getAttribute('style') ?? '';

afterEach(cleanup);

describe('a right-anchored panel stays on the screen', () => {
  it('lets the panel hang past the anchor on a phone, so it can use the whole width', () => {
    const restore = stubLayout(375, 235);
    render(<Harness />);
    fireEvent.click(screen.getByText('Toggle'));

    // 375 − 10 − 235 = 130px of unused room to the right of the bell.
    expect(panelStyle()).toContain('right: -130px');
    // …which leaves the panel the full width of the screen, less both margins.
    expect(panelStyle()).toContain('max-width: 355px');
    restore();
  });

  it('leaves a desktop panel aligned to its anchor, where the alignment means something', () => {
    const restore = stubLayout(1280, 1080);
    render(<Harness />);
    fireEvent.click(screen.getByText('Toggle'));

    expect(panelStyle()).not.toContain('right');
    // Room to spare, so the clamp is above the stylesheet's own 360px and the
    // stylesheet is still what decides the width.
    expect(panelStyle()).toContain('max-width: 1070px');
    restore();
  });

  /**
   * A viewport of zero is not a very narrow screen — it is a document that is
   * not being laid out (a hidden tab, a headless capture). Measuring it once
   * produced `max-width: 173px` on a desktop panel, which is the failure this
   * guards: fiction is worse than no measurement at all.
   */
  it('measures nothing when there is no viewport to measure', () => {
    const restore = stubLayout(0, 183);
    render(<Harness />);
    fireEvent.click(screen.getByText('Toggle'));

    expect(panelStyle()).toBe('');
    restore();
  });

  it('sets nothing when the anchor leaves no room, rather than a negative width', () => {
    const restore = stubLayout(375, 4);
    render(<Harness />);
    fireEvent.click(screen.getByText('Toggle'));

    // The shift alone would carry it to the screen edge; the point is only that
    // no impossible number reaches the DOM.
    expect(panelStyle()).not.toContain('max-width: -');
    restore();
  });
});
