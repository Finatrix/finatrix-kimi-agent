import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import ToolsLayout from '../tools/ToolsLayout';
import { meetsNeeds, planSteps } from '../tour/dom';
import { holeFor, layoutFor, placeCard, scrollDelta } from '../tour/geometry';
import { openTourHub } from '../tour/launch';
import { TOUR_OFFER_KEY, TOUR_OPTOUT_KEY, TOUR_PROGRESS_KEY, TOUR_TEST_OPT_IN_KEY, loadProgress } from '../tour/progress';
import TourRoot from '../tour/TourRoot';
import type { TourChapter, TourEnv, TourStep } from '../tour/types';
import { WALKTHROUGH_SEEN_KEY, WALKTHROUGH_TEST_OPT_IN_KEY } from '../walkthrough/gating';

/* ── Pure parts ─────────────────────────────────────────────────────── */

const ENV: TourEnv = { native: false, signedIn: false, hasData: false, wide: true };
const step = (id: string, extra: Partial<TourStep> = {}): TourStep => ({ id, target: `[data-tour="t-${id}"]`, title: `Step ${id}`, body: `Body ${id}.`, ...extra });

describe('tour engine — planning', () => {
  it('keeps only steps whose needs hold', () => {
    expect(meetsNeeds(['web', 'wide'], ENV)).toBe(true);
    expect(meetsNeeds(['native'], ENV)).toBe(false);
    expect(meetsNeeds(['data'], { ...ENV, hasData: true })).toBe(true);
    expect(meetsNeeds(['signedIn'], ENV)).toBe(false);
  });

  it('drops a step whose target is not on screen, unless a hook might create it', () => {
    const steps = [step('a'), step('b'), step('c', { before: () => {} }), step('d', { target: undefined }), step('e', { needs: ['native'] })];
    const plan = planSteps(steps, ENV, (sel) => sel.includes('t-a'));
    expect(plan.map((s) => s.id)).toEqual(['a', 'c', 'd']);
  });
});

describe('tour engine — placement maths', () => {
  it('chooses a sheet on phones, a side column on short landscape, floating otherwise', () => {
    expect(layoutFor(375, 667)).toBe('sheet');
    expect(layoutFor(320, 568)).toBe('sheet');
    expect(layoutFor(667, 375)).toBe('side');
    expect(layoutFor(1440, 900)).toBe('float');
  });

  it('pads the hole and keeps it on screen', () => {
    expect(holeFor({ x: 100, y: 100, w: 50, h: 20 }, 800, 600)).toEqual({ x: 92, y: 92, w: 66, h: 36 });
    const h = holeFor({ x: -40, y: 560, w: 900, h: 200 }, 800, 600);
    expect(h.x).toBeGreaterThanOrEqual(0);
    expect(h.x + h.w).toBeLessThanOrEqual(800);
    expect(h.y + h.h).toBeLessThanOrEqual(600);
  });

  it('scrolls only when the target is not already comfortably in view', () => {
    const region = { x: 0, y: 60, w: 800, h: 540 };
    expect(scrollDelta({ x: 0, y: 200, w: 100, h: 80 }, region)).toBe(0);
    expect(scrollDelta({ x: 0, y: 1400, w: 100, h: 80 }, region)).toBeGreaterThan(0);
    expect(scrollDelta({ x: 0, y: -300, w: 100, h: 80 }, region)).toBeLessThan(0);
    // Taller than the region: its top lands at the top of the region.
    expect(scrollDelta({ x: 0, y: 500, w: 100, h: 900 }, region)).toBe(500 - 76);
  });

  it('floats the card beside the target, falling back to a corner when nothing fits', () => {
    const card = { w: 300, h: 200 };
    expect(placeCard({ x: 100, y: 100, w: 200, h: 60 }, card, 1200, 800).side).toBe('bottom');
    expect(placeCard({ x: 100, y: 560, w: 200, h: 60 }, card, 1200, 800).side).toBe('top');
    expect(placeCard({ x: 10, y: 10, w: 600, h: 780 }, card, 1200, 800).side).toBe('right');
    const over = placeCard({ x: 0, y: 0, w: 1200, h: 800 }, card, 1200, 800);
    expect(over.side).toBe('over');
    expect(over.x + card.w).toBeLessThanOrEqual(1200);
    expect(placeCard(null, card, 1200, 800).side).toBe('over');
  });
});

/* ── The engine in a page ───────────────────────────────────────────── */

function Art() { return <svg aria-hidden="true" />; }

const CHAPTER: TourChapter = {
  id: 'demo',
  title: 'Demo tool',
  route: '/tools/demo',
  tagline: 'A tool for tests.',
  minutes: 1,
  icon: 'budget',
  intro: { eyebrow: 'Demo', headline: 'A demo intro.', body: 'For tests.', Art, orb: [{ at: 0, x: 10, y: 10, s: 1 }], duration: 100 },
  steps: [
    step('a', { hint: 'Press the button.' }),
    step('missing'),
    step('late', { before: () => {} }), // kept by the plan, never appears → dropped at its turn
    step('c'),
  ],
};

function DemoPage() {
  return (
    <div>
      <button type="button" data-tour="t-a">Real control A</button>
      <div data-tour="t-c">Real control C</div>
    </div>
  );
}

function renderTour(onClose = vi.fn(), request: Parameters<typeof TourRoot>[0]['request'] = { kind: 'chapter', id: 'demo', step: 'a' }) {
  render(
    <MemoryRouter initialEntries={['/tools/demo']}>
      <AuthProvider>
        <Routes>
          <Route path="/tools/demo" element={<DemoPage />} />
          <Route path="/tools/dashboard" element={<div>dashboard</div>} />
        </Routes>
        <TourRoot request={request} onClose={onClose} chapters={[CHAPTER]} />
      </AuthProvider>
    </MemoryRouter>,
  );
  return onClose;
}

const card = () => screen.findByRole('dialog', { name: /Step/ });

describe('tour engine — spotlight', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it('walks the real controls, skipping missing ones silently, and counts only what it shows', async () => {
    const onClose = renderTour();
    const d = await card();
    expect(d).toHaveAccessibleName('Step a');
    expect(d).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByText('Body a.')).toBeInTheDocument();
    // "missing" was dropped when planning; "late" is still counted until its turn.
    expect(d.textContent).toContain('/ 03');
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('button', { name: /^Next/ })));

    fireEvent.click(screen.getByRole('button', { name: /^Next/ }));
    // "late" never appears: after its wait it is dropped and C is shown, with
    // nothing announced about the skip.
    expect(await screen.findByRole('dialog', { name: 'Step c' }, { timeout: 4000 })).toBeInTheDocument();
    expect(screen.queryByText(/missing|late/i)).toBeNull();
    expect(screen.getByRole('dialog', { name: 'Step c' }).textContent).toContain('/ 02');

    const seen = loadProgress().seen;
    expect(Object.keys(seen).sort()).toEqual(['demo.a', 'demo.c']);

    // Last step: Finish closes (a single chapter not opened from the hub) and records it done.
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(loadProgress().done.demo).toBeTypeOf('number');
  }, 15000);

  it('keeps the page look-only until "Try it", then makes just that control usable', async () => {
    renderTour();
    await card();
    const control = screen.getByText('Real control A').closest('button')!;
    expect(control.closest('[inert]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try it' }));
    await waitFor(() => expect(control.closest('[inert]')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(control));
    expect(screen.getByRole('dialog', { name: 'Step a' })).toHaveAttribute('aria-modal', 'false');
    // Escape hands back to the card.
    fireEvent.keyDown(control, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Try it' })).toBeInTheDocument());
    expect(control.closest('[inert]')).not.toBeNull();
  });

  it('Android BACK (a synthetic Escape) steps back, and leaves from the first step', async () => {
    const onClose = renderTour(vi.fn(), { kind: 'chapter', id: 'demo', step: 'c' });
    const d = await screen.findByRole('dialog', { name: 'Step c' });
    fireEvent.keyDown(d, { key: 'Escape' });
    expect(await screen.findByRole('dialog', { name: 'Step a' }, { timeout: 4000 })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Step a' }), { key: 'Escape' });
    // From the first step, Back goes to the chapter's intro.
    expect(await screen.findByRole('dialog', { name: 'Demo tool tour' })).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  }, 15000);

  it('opens on the intro scene and goes to the steps from there', async () => {
    renderTour(vi.fn(), { kind: 'chapter', id: 'demo' });
    const intro = await screen.findByRole('dialog', { name: 'Demo tool tour' });
    expect(intro).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { level: 2, name: 'A demo intro.' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show me around/ }));
    expect(await card()).toHaveAccessibleName('Step a');
  });
});

describe('tour hub and offer', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it('lists chapters with progress, and a checklist of what has not been seen', async () => {
    localStorage.setItem(TOUR_PROGRESS_KEY, JSON.stringify({ v: 1, seen: { 'demo.a': 1 }, done: {} }));
    renderTour(vi.fn(), { kind: 'hub' });
    const hub = await screen.findByRole('dialog', { name: /Learn FinatriX/ });
    expect(hub).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: /Tour Demo tool.*1 of 4 seen/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Continue the tour/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Feature checklist' }));
    expect(screen.getByRole('button', { name: 'Show me: Step missing, in Demo tool' })).toBeInTheDocument();
    expect(screen.getByText('(seen)', { exact: false })).toBeInTheDocument();
    // The opt-out switch is reversible from here.
    const sw = screen.getByRole('switch', { name: 'Offer the tour on the dashboard' });
    expect(sw).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(sw);
    expect(localStorage.getItem(TOUR_OPTOUT_KEY)).toBe('1');
  });

  it('"Not now" snoozes; "Don\'t show this again" opts out; "Start the tour" starts it', async () => {
    let onClose = renderTour(vi.fn(), { kind: 'offer' });
    fireEvent.click(await screen.findByRole('button', { name: 'Not now' }));
    expect(onClose).toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem(TOUR_OFFER_KEY)!).snoozes).toBe(1);
    cleanup();

    onClose = renderTour(vi.fn(), { kind: 'offer' });
    fireEvent.click(await screen.findByRole('button', { name: 'Don’t show this again' }));
    expect(localStorage.getItem(TOUR_OPTOUT_KEY)).toBe('1');
    cleanup();

    renderTour(vi.fn(), { kind: 'offer' });
    fireEvent.click(await screen.findByRole('button', { name: 'Start the tour' }));
    expect(await screen.findByRole('dialog', { name: 'Demo tool tour' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(TOUR_OFFER_KEY)!).accepted).toBe(true);
    expect(loadProgress().startedAt).toBeTypeOf('number');
  });
});

/* ── Inside the real shell ──────────────────────────────────────────── */

function renderShell(entry: string | { pathname: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route path="/tools" element={<ToolsLayout />}>
            <Route path="dashboard" element={<div>dashboard-content</div>} />
            <Route path=":toolId" element={<div>tool-content</div>} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

describe('tour in the tools shell', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => cleanup());

  it('every page carries "Tour this page", and openTourHub() opens the hub', async () => {
    renderShell('/tools/dashboard');
    expect(await screen.findByRole('button', { name: 'Tour this page' })).toBeInTheDocument();
    act(() => openTourHub());
    expect(await screen.findByRole('dialog', { name: /Learn FinatriX/ })).toBeInTheDocument();
  });

  it('offers itself to a returning visitor (test opt-in) and never without it', async () => {
    localStorage.setItem(WALKTHROUGH_SEEN_KEY, '1');
    renderShell('/tools/dashboard');
    await screen.findByText('dashboard-content');
    await act(() => new Promise((r) => setTimeout(r, 2000)));
    expect(screen.queryByRole('region', { name: /quick tour/ })).toBeNull();
    cleanup();

    localStorage.setItem(TOUR_TEST_OPT_IN_KEY, '1');
    renderShell('/tools/dashboard');
    // An invitation in the page — never a dialog over it, and the page stays put.
    expect(await screen.findByRole('region', { name: /quick tour/ }, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByText('dashboard-content')).toBeInTheDocument();
  }, 15000);

  it('never stacks the offer on the first-run intro', async () => {
    localStorage.setItem(WALKTHROUGH_TEST_OPT_IN_KEY, '1');
    localStorage.setItem(TOUR_TEST_OPT_IN_KEY, '1');
    renderShell('/tools/dashboard');
    expect(await screen.findByRole('region', { name: 'New to FinatriX?' })).toBeInTheDocument();
    await act(() => new Promise((r) => setTimeout(r, 2200)));
    expect(screen.queryByRole('region', { name: /quick tour/ })).toBeNull();
  }, 15000);

  it('arriving from the landing page opens the hub instead of the first-run intro', async () => {
    localStorage.setItem(WALKTHROUGH_TEST_OPT_IN_KEY, '1');
    renderShell({ pathname: '/tools/dashboard', state: { fxTour: 'hub' } });
    expect(await screen.findByRole('dialog', { name: /Learn FinatriX/ })).toBeInTheDocument();
    await act(() => new Promise((r) => setTimeout(r, 200)));
    expect(screen.queryByRole('dialog', { name: 'Welcome to FinatriX' })).toBeNull();
  });
});
