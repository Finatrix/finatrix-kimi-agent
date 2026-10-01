import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MobileDrawer } from '../components/MobileDrawer';
import { WalletDock } from '../tools/ui/WalletDock';
import { CurrencyProvider } from '../tools/CurrencyContext';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function DrawerHarness() {
  const [open, setOpen] = useState(false);
  return <>
    <button onClick={() => setOpen(true)}>Open navigation</button>
    <button>Behind drawer</button>
    <MobileDrawer id="drawer" label="Finance navigation" open={open} onClose={() => setOpen(false)}>
      <a href="/tools/budget">Budget</a>
      <a href="/tools/expenses">Expenses</a>
    </MobileDrawer>
  </>;
}

it('keeps keyboard navigation within the mobile drawer and restores its opener', () => {
  vi.useFakeTimers();
  render(<DrawerHarness />);
  const opener = screen.getByRole('button', { name: 'Open navigation' });
  opener.focus();
  fireEvent.click(opener);
  act(() => vi.advanceTimersByTime(20));
  expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus();
  fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
  expect(screen.getByRole('link', { name: 'Expenses' })).toHaveFocus();
  fireEvent.keyDown(window, { key: 'Tab' });
  expect(screen.getByRole('button', { name: 'Close menu' })).toHaveFocus();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(opener).toHaveFocus();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

it('leaves focus on the Wallet opener after closing', () => {
  vi.useFakeTimers();
  render(<CurrencyProvider><WalletDock month="2026-09" items={[]} budgetStore={{}} cats={{ needs: [], wants: [], save: [] }} /></CurrencyProvider>);
  const opener = screen.getByRole('button', { name: /^Wallet\./ });
  opener.focus();
  fireEvent.click(opener);
  act(() => vi.advanceTimersByTime(20));
  fireEvent.click(screen.getByRole('button', { name: 'Close wallet' }));
  expect(opener).toHaveFocus();
});
