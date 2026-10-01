import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render, cleanup, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useNavigate } from 'react-router';
import Reveal from '../components/Reveal';
import { useScrollRestoration } from '../hooks/useScrollRestoration';

/**
 * Where a navigation lands, and how it gets there.
 *
 * Everything here regressed at once when the app moved to `BrowserRouter` +
 * `<Routes>`: that pairing ships no scroll handling, so the viewport simply
 * kept its offset. Clicking "Pricing" from two thousand pixels down the landing
 * page opened /pricing two thousand pixels down. These are the three rules that
 * replaced it, plus the CSS contract they depend on.
 */

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), 'utf8');
}

/** jsdom has no layout, so the offset has to be stated rather than scrolled to. */
function setScrollY(y: number): void {
  Object.defineProperty(window, 'scrollY', { value: y, configurable: true, writable: true });
  window.dispatchEvent(new Event('scroll'));
}

/** Enough of a document height for a restore to consider the offset reachable. */
function setDocumentHeight(px: number): void {
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    value: px,
    configurable: true,
  });
}

/** Lets the restore's requestAnimationFrame loop run. */
async function frames(n = 4): Promise<void> {
  for (let i = 0; i < n; i += 1) {
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    });
  }
}

function Page({ label }: { label: string }) {
  return (
    <div>
      <h1>{label}</h1>
      <h2 id="deep-section">Deep section</h2>
    </div>
  );
}

let go: ((to: string | number) => void) | null = null;

function Harness({ initial = '/' }: { initial?: string }) {
  function Inner() {
    useScrollRestoration();
    const navigate = useNavigate();
    go = (to) => navigate(to as never);
    return (
      <Routes>
        <Route path="/" element={<Page label="home" />} />
        <Route path="/pricing" element={<Page label="pricing" />} />
      </Routes>
    );
  }
  return (
    <MemoryRouter initialEntries={[initial]}>
      <Inner />
    </MemoryRouter>
  );
}

describe('scroll flow', () => {
  let scrollTo: ReturnType<typeof vi.fn>;
  let scrollIntoView: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    scrollTo = vi.fn();
    window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
    scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
    setScrollY(0);
    setDocumentHeight(10000);
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    sessionStorage.clear();
  });

  afterEach(() => {
    cleanup();
    go = null;
  });

  it('starts a new page at the top, instantly', async () => {
    render(<Harness />);
    setScrollY(2000);
    scrollTo.mockClear();

    await act(async () => go?.('/pricing'));

    expect(scrollTo).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'instant' });
  });

  /**
   * Instant, not smooth. `html { scroll-behavior: smooth }` would otherwise
   * animate the full height of the outgoing page on every single link.
   */
  it('never animates a route change', async () => {
    render(<Harness />);
    scrollTo.mockClear();
    await act(async () => go?.('/pricing'));

    for (const call of scrollTo.mock.calls) {
      expect((call[0] as ScrollToOptions).behavior).not.toBe('smooth');
    }
  });

  it('returns to where an entry was left when going back', async () => {
    render(<Harness />);
    setScrollY(1400); // reading the landing page
    await act(async () => go?.('/pricing'));
    setScrollY(0);
    scrollTo.mockClear();

    await act(async () => go?.(-1));
    await frames();

    expect(scrollTo).toHaveBeenCalledWith({ top: 1400, left: 0, behavior: 'instant' });
  });

  it('scrolls a fragment target into view rather than to the top', async () => {
    render(<Harness />);
    scrollTo.mockClear();

    await act(async () => go?.('/pricing#deep-section'));
    await frames();

    expect(scrollIntoView).toHaveBeenCalledWith(
      expect.objectContaining({ block: 'start' })
    );
    expect(scrollTo).not.toHaveBeenCalled();
  });

  /**
   * WCAG 2.2 SC 2.3.3. The `scroll-behavior: auto !important` in index.css
   * cannot reach this: a `behavior` passed from script overrides the CSS, so
   * the media query has to be read here as well.
   */
  it('keeps the route usable when a section link has malformed percent encoding', async () => {
    expect(() => render(<Harness initial="/pricing#%E0%A4%A" />)).not.toThrow();
    await frames();
    expect(document.querySelector('h1')?.textContent).toBe('pricing');
  });

  it('does not animate a fragment jump under reduced motion', async () => {
    const real = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    try {
      render(<Harness />);
      await act(async () => go?.('/pricing#deep-section'));
      await frames();
      expect(scrollIntoView).toHaveBeenCalledWith(
        expect.objectContaining({ behavior: 'auto' })
      );
    } finally {
      window.matchMedia = real;
    }
  });

  /**
   * A restore waits for the lazily imported route to arrive, so it must also
   * stand down the moment the reader starts moving the page themselves.
   */
  it('abandons a pending restore as soon as the reader scrolls', async () => {
    render(<Harness />);
    setScrollY(1400);
    await act(async () => go?.('/pricing'));
    setScrollY(0);
    setDocumentHeight(100); // too short: the restore cannot land yet
    scrollTo.mockClear();

    await act(async () => go?.(-1));
    await act(async () => {
      window.dispatchEvent(new Event('wheel'));
    });
    setDocumentHeight(10000); // the page finally arrives — too late to matter
    await frames();

    expect(scrollTo).not.toHaveBeenCalled();
  });
});

describe('scroll offset (CSS contract)', () => {
  const index = read('src/index.css');
  const tokens = read('src/styles/tokens.css');

  it('scrolls smoothly for in-page targets', () => {
    expect(index).toMatch(/scroll-behavior:\s*smooth/);
  });

  /**
   * The public header is `position: fixed`, so without this every fragment link
   * on the site lands with its heading underneath the bar. Measured before the
   * token existed: #showcase came to rest at top: 0, under 57px of header.
   */
  it('stops fragment targets clear of the fixed header', () => {
    // Plus the status-bar inset, which is 0 in a browser tab and covers the
    // top of the page in the Android app and the installed iOS PWA.
    expect(index).toMatch(/scroll-padding-top:\s*calc\(var\(--scroll-offset\)\s*\+\s*var\(--fx-safe-top\)\)/);
    expect(tokens).toMatch(/--scroll-offset:\s*\d+px/);
  });

  /**
   * `scroll-padding` only does anything on the scroll container, so the offset
   * has to be one token on `html` rather than a `scroll-mt-*` per heading. Five
   * components used to carry their own guess and every other anchor had none.
   */
  it('keeps the offset in one place, not per-heading guesses', () => {
    for (const file of [
      'src/learn/Blocks.tsx',
      'src/marketing/ui.tsx',
      'src/components/LegalPage.tsx',
      'src/pages/careers/CareersFeatures.tsx',
      'src/tools/ui/ToolEducation.tsx',
    ]) {
      expect(read(file)).not.toMatch(/scroll-mt-/);
    }
  });

  /**
   * The shell has its own sticky stack — a 48px app bar, plus the tool tab bar
   * above the phone breakpoint — so it overrides the same token instead of
   * introducing a second mechanism.
   */
  it('lets the tools shell override the same token', () => {
    expect(read('src/tools/tools.css')).toMatch(/html:has\(\.fx-tools\)\s*\{\s*--scroll-offset:/);
  });
});

describe('scroll reveal', () => {
  afterEach(cleanup);

  /**
   * Callers stagger a grid with `delay={i * 60}`. Each item watches for its own
   * intersection, so an uncapped delay is not a stagger — it is dead time after
   * the element is already on screen. The tenth showcase card sat blank for
   * 480ms of delay plus a 700ms fade, in the same row as cards that had already
   * finished.
   */
  it('caps a stagger below the length of the animation it offsets', () => {
    const { container } = render(<Reveal delay={480}>card</Reveal>);
    const el = container.querySelector('.fx-reveal') as HTMLElement;
    expect(Number.parseInt(el.style.transitionDelay, 10)).toBeLessThanOrEqual(200);
  });

  it('passes a short stagger through untouched', () => {
    const { container } = render(<Reveal delay={60}>card</Reveal>);
    const el = container.querySelector('.fx-reveal') as HTMLElement;
    expect(el.style.transitionDelay).toBe('60ms');
  });
});
