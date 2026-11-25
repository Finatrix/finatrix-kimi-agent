import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { WalletDock } from '../tools/ui/WalletDock';
import { CurrencyProvider } from '../tools/CurrencyContext';

afterEach(() => { cleanup(); vi.useRealTimers(); });

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
