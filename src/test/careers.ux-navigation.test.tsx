/**
 * UX pass — navigation reachability and dialog focus containment.
 *
 * These pin the two structural fixes:
 *  1. Every routable Careers section is reachable from the navigation itself,
 *     not only from a list buried inside Settings. The seven-pill focus
 *     decision stays; the rest live behind one grouped "More" disclosure.
 *  2. A modal dialog contains Tab. Escape and initial focus were already
 *     handled; Tab walked straight out into the page behind the backdrop.
 */

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, within, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import {
  CAREERS_HIDDEN_SECTIONS,
  CAREERS_MORE_IDS,
  CAREERS_NAV,
  CAREERS_SECTION_GROUPS,
} from '../careers/constants';
import { SectionMenu } from '../careers/components/SectionMenu';
import { ModalShell } from '../careers/components/states';

afterEach(cleanup);

describe('Careers information architecture', () => {
  it('keeps the primary tab bar at the seven-item focus decision', () => {
    expect(CAREERS_NAV).toHaveLength(7);
  });

  it('surfaces every hidden section that has no stronger entry point', () => {
    // upload         → primary action on the dashboard and Resume Library
    // profile        → entered from the dashboard's Career DNA card
    // admin          → RBAC-gated, rendered as its own pill for admins
    // companyProfile → a detail route, reached from a company, never from nav
    const ownEntryPoint = new Set(['upload', 'profile', 'admin', 'companyProfile']);
    const expected = CAREERS_HIDDEN_SECTIONS
      .map((s) => s.id)
      .filter((id) => !ownEntryPoint.has(id));

    expect([...CAREERS_MORE_IDS].sort()).toEqual([...expected].sort());
  });

  it('lists each section exactly once across the groups', () => {
    expect(new Set(CAREERS_MORE_IDS).size).toBe(CAREERS_MORE_IDS.length);
  });

  it('never repeats a primary tab inside the More menu', () => {
    const primary = new Set<string>(CAREERS_NAV.map((n) => n.id));
    for (const id of CAREERS_MORE_IDS) expect(primary.has(id)).toBe(false);
  });
});

describe('SectionMenu', () => {
  const renderMenu = (activeId = 'dashboard') =>
    render(
      <MemoryRouter>
        <SectionMenu activeId={activeId} />
      </MemoryRouter>
    );
  const trigger = () => screen.getByRole('button', { name: /more/i });

  it('is a collapsed disclosure until opened', () => {
    renderMenu();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('opens on click and exposes every section as a menu item', () => {
    renderMenu();
    fireEvent.click(trigger());

    const menu = screen.getByRole('menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    for (const group of CAREERS_SECTION_GROUPS) {
      for (const item of group.items) {
        expect(within(menu).getByRole('menuitem', { name: item.name })).toBeInTheDocument();
      }
    }
  });

  it('groups the items under labelled groups', () => {
    renderMenu();
    fireEvent.click(trigger());

    expect(screen.getAllByRole('group')).toHaveLength(CAREERS_SECTION_GROUPS.length);
    for (const g of CAREERS_SECTION_GROUPS) {
      expect(screen.getByRole('group', { name: g.name })).toBeInTheDocument();
    }
  });

  it('every menu item points at a real route', () => {
    renderMenu();
    fireEvent.click(trigger());

    for (const group of CAREERS_SECTION_GROUPS) {
      for (const item of group.items) {
        expect(screen.getByRole('menuitem', { name: item.name })).toHaveAttribute('href', item.href);
      }
    }
  });

  it('closes on Escape and returns focus to the trigger', () => {
    renderMenu();
    const t = trigger();
    fireEvent.click(t);
    expect(screen.getByRole('menu')).toBeInTheDocument();

    fireEvent.keyDown(t, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(t).toHaveFocus();
  });

  it('opens with ArrowDown and lands on the first item', async () => {
    renderMenu();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });

    const first = CAREERS_SECTION_GROUPS[0].items[0].name;
    await waitFor(() =>
      expect(screen.getByRole('menuitem', { name: first })).toHaveFocus()
    );
  });

  it('moves between items with the arrow keys', async () => {
    renderMenu();
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' });

    const [one, two] = CAREERS_SECTION_GROUPS[0].items;
    await waitFor(() => expect(screen.getByRole('menuitem', { name: one.name })).toHaveFocus());

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: two.name })).toHaveFocus();

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowUp' });
    expect(screen.getByRole('menuitem', { name: one.name })).toHaveFocus();
  });

  it('marks the trigger and the row as current when a menu section is open', () => {
    renderMenu('offers');
    // The pill reads as selected so the user is not left wondering which nav
    // item their current page belongs to.
    expect(trigger().className).toContain('on');

    fireEvent.click(trigger());
    expect(screen.getByRole('menuitem', { name: 'Offers' })).toHaveAttribute('aria-current', 'page');
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
