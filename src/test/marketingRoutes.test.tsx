/**
 * Every public marketing/trust route renders through the real App, signed out,
 * with the heading and the FAQ its registry entry promises.
 *
 * "Signed out" is the whole point of several of these. The Careers pages in
 * particular used to sit behind an auth gate and a paywall, so the assertion
 * that matters is not just that they render — it is that they render WITHOUT
 * the gate, which is the regression that would quietly make the paid product
 * invisible to buyers again.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import App from '../App';
import { PUBLIC_PAGES, publicPageFor } from '../shared/publicPages';
import { CAREERS_FEATURES } from '../shared/careersFeatures';
import { CAREERS_ROUTES } from '../careers/constants';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <App />
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Registry pages that render through the marketing shell (not the legal one). */
const MARKETING = PUBLIC_PAGES.filter((p) => p.kind !== 'legal');

describe('public marketing routes', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  for (const page of MARKETING) {
    it(`renders ${page.path} with its registered heading`, async () => {
      renderAt(page.path);
      const h1 = await screen.findByRole('heading', { level: 1 });
      expect(h1).toHaveTextContent(page.heading!);
    });
  }

  it('shows the "last reviewed" date as a machine-readable time element', async () => {
    renderAt('/pricing');
    const stamp = await screen.findByText(/Last reviewed/i);
    const time = within(stamp).getByText('1 August 2026');
    expect(time.tagName).toBe('TIME');
    expect(time).toHaveAttribute('datetime', publicPageFor('/pricing')!.updated);
  });

  it('renders every FAQ question that the page also emits as structured data', async () => {
    renderAt('/faq');
    const faq = publicPageFor('/faq')!.faq!;
    for (const entry of faq) {
      expect(await screen.findByText(entry.q), entry.q).toBeInTheDocument();
    }
    // Answers are in the DOM even while collapsed — that is what makes the
    // FAQPage markup honest for a crawler that never expands anything.
    expect(await screen.findByText(faq[0].a)).toBeInTheDocument();
  });

  it('prices the plans from the shared constant', async () => {
    renderAt('/pricing');
    expect(await screen.findByText('₹199')).toBeInTheDocument();
    expect(await screen.findByText('₹999')).toBeInTheDocument();
    expect(await screen.findByText('₹2,499')).toBeInTheDocument();
  });

  it('links the Careers landing straight to pricing rather than a sign-up wall', async () => {
    renderAt('/careers');
    const links = await screen.findAllByRole('link', { name: /pricing/i });
    expect(links.length).toBeGreaterThan(0);
  });
});

describe('public Careers surface is not gated', () => {
  beforeEach(() => {
    localStorage.clear();
    cleanup();
  });

  for (const path of ['/careers', '/careers/features', '/careers/compare', '/careers/compare/linkedin']) {
    it(`${path} renders signed out with no auth or paywall gate`, async () => {
      renderAt(path);
      await screen.findByRole('heading', { level: 1 });
      expect(screen.queryByText(/Sign in to use Careers/i)).toBeNull();
      expect(screen.queryByText(/Unlock FinatriX Careers Pro/i)).toBeNull();
    });
  }

  it('404s an unknown comparison slug instead of falling back to the hub', async () => {
    renderAt('/careers/compare/not-a-real-rival');
    expect(await screen.findByText(/404|not found/i)).toBeInTheDocument();
  });

  it('only advertises features that are real Careers routes', () => {
    const routes = new Set<string>(Object.values(CAREERS_ROUTES));
    for (const f of CAREERS_FEATURES) {
      expect(routes.has(`/careers/${f.section}`), `${f.name} → /careers/${f.section}`).toBe(true);
    }
  });

  it('states a limit for every advertised feature', () => {
    for (const f of CAREERS_FEATURES) {
      expect(f.limit.length, f.name).toBeGreaterThan(30);
    }
  });
});
