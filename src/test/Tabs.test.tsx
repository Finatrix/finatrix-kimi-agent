import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import { Tabs, type TabItem } from '../tools/ui/Tabs';

type K = 'a' | 'b' | 'c';
const ITEMS: ReadonlyArray<TabItem<K>> = [
  { key: 'a', label: 'Alpha' },
  { key: 'b', label: 'Beta' },
  { key: 'c', label: 'Gamma' },
];

function Harness({ variant, idBase }: { variant?: 'tools' | 'nav'; idBase?: string }) {
  const [active, setActive] = useState<K>('a');
  return <Tabs items={ITEMS} active={active} onChange={setActive} label="Test tabs" variant={variant} idBase={idBase} />;
}

describe('Tabs — accessible roving tablist', () => {
  beforeEach(cleanup);

  it('renders a tablist of buttons with correct selected state', () => {
    render(<Harness />);
    const tabs = screen.getAllByRole('tab');
    expect(tabs).toHaveLength(3);
    expect(tabs.every((t) => t.tagName === 'BUTTON')).toBe(true);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('uses a single roving tab stop (only the active tab is tabbable)', () => {
    render(<Harness />);
    const [a, b, c] = screen.getAllByRole('tab');
    expect(a).toHaveAttribute('tabindex', '0');
    expect(b).toHaveAttribute('tabindex', '-1');
    expect(c).toHaveAttribute('tabindex', '-1');
  });

  it('moves selection and focus with ArrowRight/ArrowLeft (wrapping)', () => {
    render(<Harness />);
    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    let tabs = screen.getAllByRole('tab');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(tabs[1]);

    // Wrap forward past the end.
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    fireEvent.keyDown(tablist, { key: 'ArrowRight' });
    tabs = screen.getAllByRole('tab');
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');

    // Wrap backward past the start.
    fireEvent.keyDown(tablist, { key: 'ArrowLeft' });
    tabs = screen.getAllByRole('tab');
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('jumps to first/last with Home/End', () => {
    render(<Harness />);
    const tablist = screen.getByRole('tablist');
    fireEvent.keyDown(tablist, { key: 'End' });
    expect(screen.getAllByRole('tab')[2]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tablist, { key: 'Home' });
    expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('wires aria-controls / id to panels when idBase is set, omits otherwise', () => {
    const { rerender } = render(<Harness idBase="x" />);
    let first = screen.getAllByRole('tab')[0];
    expect(first).toHaveAttribute('id', 'x-tab-a');
    expect(first).toHaveAttribute('aria-controls', 'x-panel-a');

    rerender(<Harness />);
    first = screen.getAllByRole('tab')[0];
    expect(first).not.toHaveAttribute('aria-controls');
  });

  it('applies the careers "nav" variant classes', () => {
    render(<Harness variant="nav" />);
    expect(screen.getByRole('tablist')).toHaveClass('nav');
    expect(screen.getAllByRole('tab')[0]).toHaveClass('on');
  });
});
