/**
 * Careers navigation reachability.
 *
 * The defect this suite exists for: fourteen of the twenty-one Careers
 * sections were in no navigation surface at all. `CAREERS_HIDDEN_SECTIONS` was
 * "decluttered from primary navigation", which in practice meant reachable only
 * by typing the URL or by finding a list inside Settings. Among them were three
 * features sold by name on the pricing page — Offers and Network (Professional,
 * ₹999/mo) and Recruiters (Enterprise) — and Billing, the page where a
 * subscriber manages the subscription they are paying for.
 *
 * On a phone it was worse: `.fx-tools #mainNav` is `display:none` below 768px
 * and the Careers shell had no bottom bar, so the entire paid product was one
 * hamburger — whose drawer listed the seven primary sections and all eight FREE
 * money tools, and none of the fourteen.
 *
 * These tests assert the property rather than the markup: every routable
 * section is reachable from the shell, and the active one is announced.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { AuthProvider } from '../context/AuthContext';
import CareersLayout from '../careers/CareersLayout';
import {
  CAREERS_ALL_SECTIONS,
  CAREERS_NAV,
  CAREERS_ROUTES,
  CAREERS_SECONDARY_SECTIONS,
  CAREERS_SECTION_GROUPS,
  CAREERS_UNLISTED_SECTIONS,
} from '../careers/constants';

afterEach(cleanup);

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AuthProvider>
        <CareersLayout />
      </AuthProvider>
    </MemoryRouter>,
  );
}

/** Every href the rendered shell links to, from any of its navigation surfaces. */
function renderedHrefs(): string[] {
  return Array.from(document.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')!);
}

describe('the section registry is coherent', () => {
  it('gives every section a unique id and a real route', () => {
    const ids = CAREERS_ALL_SECTIONS.map((s) => s.id);
    expect(new Set(ids).size, 'duplicate section id').toBe(ids.length);
    for (const s of CAREERS_ALL_SECTIONS) {
      expect(s.href, s.id).toMatch(/^\/careers\//);
      expect(s.name.length, s.id).toBeGreaterThan(2);
    }
  });

  it('partitions sections into primary, secondary and unlisted with no overlap', () => {
    const primary = new Set<string>(CAREERS_NAV.map((s) => s.id));
    const secondary = new Set<string>(CAREERS_SECONDARY_SECTIONS.map((s) => s.id));
    const unlisted = new Set<string>(CAREERS_UNLISTED_SECTIONS.map((s) => s.id));
    for (const id of secondary) expect(primary.has(id), `${id} in both`).toBe(false);
    for (const id of unlisted) {
      expect(primary.has(id), `${id} in both`).toBe(false);
      expect(secondary.has(id), `${id} in both`).toBe(false);
    }
  });

  it('covers every route in CAREERS_ROUTES except the public landing page', () => {
    const registered = new Set(CAREERS_ALL_SECTIONS.map((s) => s.href));
    for (const [key, href] of Object.entries(CAREERS_ROUTES)) {
      if (key === 'root') continue; // the public marketing page, not a section
      expect(registered.has(href), `${key} (${href}) is in no navigation group`).toBe(true);
    }
  });

  /**
   * The regression, stated as a rule: a section may be absent from the primary
   * tab bar, but never from navigation altogether. Only the two deliberate
   * exceptions — a detail view and the RBAC-gated console — may be unlisted.
   */
  it('leaves nothing reachable by URL alone', () => {
    const listed = new Set<string>([
      ...CAREERS_NAV.map((s) => s.id),
      ...CAREERS_SECONDARY_SECTIONS.map((s) => s.id),
    ]);
    const unlistedIds = CAREERS_ALL_SECTIONS.filter((s) => !listed.has(s.id)).map((s) => s.id);
    expect(unlistedIds.sort()).toEqual(['admin', 'companyProfile']);
  });

  it('keeps the paid features named on the pricing page in navigation', () => {
    const listed = new Set<string>([
      ...CAREERS_NAV.map((s) => s.id),
      ...CAREERS_SECONDARY_SECTIONS.map((s) => s.id),
    ]);
    // Professional advertises "AI outreach drafting and offer analysis";
    // Enterprise advertises a "Recruiter and university portal".
    for (const id of ['offers', 'network', 'recruiters', 'billing']) {
      expect(listed.has(id), `${id} is sold but not navigable`).toBe(true);
    }
  });

  it('puts every secondary section in exactly one group', () => {
    const seen = new Map<string, number>();
    for (const g of CAREERS_SECTION_GROUPS) {
      for (const item of g.items) seen.set(item.id, (seen.get(item.id) ?? 0) + 1);
    }
    for (const [id, n] of seen) expect(n, `${id} appears in ${n} groups`).toBe(1);
    expect(seen.size).toBe(CAREERS_SECONDARY_SECTIONS.length);
  });
});

describe('the rendered shell reaches every section', () => {
  it('links every listed section from the mobile drawer', async () => {
    renderAt(CAREERS_ROUTES.dashboard);
    fireEvent.click(await screen.findByRole('button', { name: 'Open menu' }));

    const hrefs = new Set(renderedHrefs());
    for (const s of [...CAREERS_NAV, ...CAREERS_SECONDARY_SECTIONS]) {
      expect(hrefs.has(s.href), `${s.name} (${s.href}) is not in the drawer`).toBe(true);
    }
  });

  it('links every secondary section from the tab bar More menu', async () => {
    renderAt(CAREERS_ROUTES.dashboard);
    fireEvent.click(await screen.findByRole('button', { name: 'More' }));

    const menu = await screen.findByRole('group', { name: 'More Careers sections' });
    const hrefs = new Set(
      Array.from(menu.querySelectorAll('a[href]')).map((a) => a.getAttribute('href')!),
    );
    for (const s of CAREERS_SECONDARY_SECTIONS) {
      expect(hrefs.has(s.href), `${s.name} is not in the More menu`).toBe(true);
    }
  });

  it('labels each group inside the More menu', async () => {
    renderAt(CAREERS_ROUTES.dashboard);
    fireEvent.click(await screen.findByRole('button', { name: 'More' }));
    const menu = await screen.findByRole('group', { name: 'More Careers sections' });
    for (const g of CAREERS_SECTION_GROUPS) {
      expect(within(menu).getByText(g.label)).toBeInTheDocument();
    }
  });

  it('closes the More menu on Escape', async () => {
    renderAt(CAREERS_ROUTES.dashboard);
    const trigger = await screen.findByRole('button', { name: 'More' });
    fireEvent.click(trigger);
    expect(await screen.findByRole('group', { name: 'More Careers sections' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('group', { name: 'More Careers sections' })).not.toBeInTheDocument();
  });

  /** The Tools shell has had one since launch; the paid product had none. */
  it('gives Careers a mobile bottom navigation bar', async () => {
    renderAt(CAREERS_ROUTES.dashboard);
    const bar = await screen.findByRole('navigation', { name: 'Careers quick navigation' });
    expect(bar.className).toContain('fx-mobnav');
    expect(within(bar).getByRole('button', { name: /More Careers sections/ })).toBeInTheDocument();
  });
});

describe('the active section is announced, not just coloured', () => {
  it('marks the active primary tab with aria-current', async () => {
    renderAt(CAREERS_ROUTES.jobs);
    await screen.findAllByText('Job Search');
    const current = Array.from(document.querySelectorAll('[aria-current="page"]'));
    expect(current.length, 'nothing marked current').toBeGreaterThan(0);
    for (const el of current) {
      const href = el.getAttribute('href');
      if (href) expect(href).toBe(CAREERS_ROUTES.jobs);
    }
  });

  it('marks the More trigger active when a secondary section is open', async () => {
    renderAt(CAREERS_ROUTES.offers);
    const trigger = await screen.findByRole('button', { name: 'More' });
    expect(trigger.className).toContain('on');
  });
});
