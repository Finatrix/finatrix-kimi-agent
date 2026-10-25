/**
 * Careers navigation and dialog focus containment.
 *
 * Pins the six-area structure: every place in Careers is an area or a tab of
 * one, every former page address lands on its new home with its query intact,
 * the area tabs behave as WAI-ARIA tabs, and a modal dialog contains Tab.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { useState } from 'react';
import { CAREERS_HIDDEN_SECTIONS, CAREERS_NAV, CAREERS_ROUTES, careersAreaFor } from '../careers/constants';
import { CareersRedirect } from '../careers/areas/CareersRedirect';
import { Tabs } from '../careers/ui/primitives';
import { ModalShell } from '../careers/components/states';

afterEach(cleanup);

const AREA_PATHS = new Set<string>([...CAREERS_NAV.map((n) => n.href), CAREERS_ROUTES.settings, CAREERS_ROUTES.admin, CAREERS_ROUTES.companyProfile]);

describe('Careers information architecture', () => {
  it('has six areas, in the order a job search runs', () => {
    expect(CAREERS_NAV.map((n) => n.name)).toEqual(['Home', 'Resume', 'Jobs', 'Applications', 'Interviews', 'Companies']);
  });

  it('puts every other place inside an area, Settings or Admin', () => {
    for (const s of CAREERS_HIDDEN_SECTIONS) {
      expect(AREA_PATHS.has(s.href.split('?')[0]!)).toBe(true);
    }
  });

  it('names no place twice', () => {
    const names = [...CAREERS_NAV, ...CAREERS_HIDDEN_SECTIONS].map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('knows which area a path belongs to', () => {
    expect(careersAreaFor('/careers/jobs').name).toBe('Jobs');
    expect(careersAreaFor('/careers/companies/profile').id).toBe('companies');
    expect(careersAreaFor('/careers/settings').name).toBe('Settings');
    expect(careersAreaFor('/careers/unknown').id).toBe('dashboard');
  });
});

describe('CareersRedirect', () => {
  function Where() {
    const { pathname, search } = useLocation();
    return <p>at {pathname + search}</p>;
  }
  const go = (from: string, to: string) =>
    render(
      <MemoryRouter initialEntries={[from]}>
        <Routes>
          <Route path="/careers/old" element={<CareersRedirect to={to} />} />
          <Route path="*" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );

  it('keeps the query the old link carried', () => {
    go('/careers/old?checkout=success', CAREERS_ROUTES.billing);
    expect(screen.getByText('at /careers/settings?checkout=success&tab=plan')).toBeInTheDocument();
  });

  it("lets the destination's tab win over a stale one", () => {
    go('/careers/old?tab=nonsense&id=42', CAREERS_ROUTES.companyProfile);
    expect(screen.getByText('at /careers/companies/profile?tab=nonsense&id=42')).toBeInTheDocument();
    cleanup();
    go('/careers/old?tab=nonsense', CAREERS_ROUTES.offers);
    expect(screen.getByText('at /careers/applications?tab=offers')).toBeInTheDocument();
  });
});

describe('Area tabs', () => {
  function Fixture() {
    const [active, setActive] = useState<'a' | 'b' | 'c'>('a');
    return (
      <Tabs
        label="Views"
        active={active}
        onChange={setActive}
        items={[
          { key: 'a', label: 'Alpha' },
          { key: 'b', label: 'Beta', count: 3 },
          { key: 'c', label: 'Gamma' },
        ]}
      />
    );
  }

  it('exposes a tablist with one selected tab in the Tab order', () => {
    render(<Fixture />);
    expect(screen.getByRole('tablist', { name: 'Views' })).toBeInTheDocument();
    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(tabs.map((t) => t.tabIndex)).toEqual([0, -1, -1]);
  });

  it('moves with the arrow keys, Home and End, wrapping at the ends', () => {
    render(<Fixture />);
    const list = screen.getByRole('tablist');
    fireEvent.keyDown(list, { key: 'ArrowLeft' });
    expect(screen.getByRole('tab', { name: 'Gamma' })).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'Gamma' }));
    fireEvent.keyDown(list, { key: 'Home' });
    expect(screen.getByRole('tab', { name: 'Alpha' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(list, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /Beta/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(list, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Gamma' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('ModalShell focus containment', () => {
  function Fixture() {
    return (
      <>
        <button type="button">outside before</button>
        <ModalShell label="Test dialog" onClose={() => {}}>
          <button type="button">first</button>
          <button type="button">second</button>
          <button type="button">last</button>
        </ModalShell>
        <button type="button">outside after</button>
      </>
    );
  }
  const btn = (name: string) => screen.getByRole('button', { name });

  it('cycles Tab from the last control back to the first', () => {
    render(<Fixture />);
    btn('last').focus();
    fireEvent.keyDown(btn('last'), { key: 'Tab' });
    expect(btn('first')).toHaveFocus();
  });

  it('cycles Shift+Tab from the first control back to the last', () => {
    render(<Fixture />);
    btn('first').focus();
    fireEvent.keyDown(btn('first'), { key: 'Tab', shiftKey: true });
    expect(btn('last')).toHaveFocus();
  });

  it('pulls focus back in when it has escaped behind the backdrop', () => {
    render(<Fixture />);
    // However focus got out there — a stray programmatic focus, a browser
    // quirk — the next Tab belongs to the dialog, not to the inert page.
    btn('outside after').focus();
    fireEvent.keyDown(btn('outside after'), { key: 'Tab' });
    expect(btn('first')).toHaveFocus();
  });

  it('leaves the interior alone so native Tab still walks the controls', () => {
    render(<Fixture />);
    btn('first').focus();
    // Not a boundary: the handler must not hijack this, or Tab inside a dialog
    // would skip every control between the first and the last.
    const evt = fireEvent.keyDown(btn('first'), { key: 'Tab' });
    expect(evt).toBe(true); // not defaultPrevented
    expect(btn('first')).toHaveFocus();
  });

  it('still closes on Escape', () => {
    let closed = false;
    render(
      <ModalShell label="Closable" onClose={() => { closed = true; }}>
        <button type="button">only</button>
      </ModalShell>
    );
    fireEvent.keyDown(screen.getByRole('button', { name: 'only' }), { key: 'Escape' });
    expect(closed).toBe(true);
  });
});
