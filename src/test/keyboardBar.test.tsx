import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import KeyboardBar from '../components/KeyboardBar';
import { AmountInput } from '../tools/ui/AmountInput';

function Harness() {
  const [value, setValue] = useState('3');
  return (
    <>
      <KeyboardBar />
      <label htmlFor="amt">Amount</label>
      <AmountInput id="amt" sym="₹" value={value} onChange={setValue} />
      <label htmlFor="plain">Note</label>
      <input id="plain" type="text" />
    </>
  );
}

function touchDevice(coarse: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: coarse && query.includes('coarse'), media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
    onchange: null, dispatchEvent: () => false,
  }));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('KeyboardBar', () => {
  it('stays away on a device with a real keyboard', () => {
    touchDevice(false);
    render(<Harness />);
    fireEvent.focusIn(screen.getByLabelText('Amount'));
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('offers the operators the decimal keypad lacks, and types them into the field', () => {
    touchDevice(true);
    render(<Harness />);
    const field = screen.getByLabelText('Amount') as HTMLInputElement;
    field.focus();
    fireEvent.focusIn(field);
    expect(screen.getByRole('toolbar', { name: 'Formula keys' })).toBeInTheDocument();
    field.setSelectionRange(1, 1);
    fireEvent.click(screen.getByRole('button', { name: 'Plus' }));
    expect(field).toHaveValue('3+');
    field.setSelectionRange(0, 0);
    fireEvent.click(screen.getByRole('button', { name: 'Equals' }));
    expect(field).toHaveValue('=3+');
  });

  it('puts the keyboard away with Done', () => {
    touchDevice(true);
    render(<Harness />);
    const field = screen.getByLabelText('Amount') as HTMLInputElement;
    field.focus();
    fireEvent.focusIn(field);
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(document.activeElement).not.toBe(field);
    expect(screen.queryByRole('toolbar')).toBeNull();
  });

  it('in a browser, leaves ordinary text fields to the browser', () => {
    touchDevice(true);
    render(<Harness />);
    fireEvent.focusIn(screen.getByLabelText('Note'));
    expect(screen.queryByRole('toolbar')).toBeNull();
  });
});

describe('KeyboardBar stacking', () => {
  it('is drawn above every sheet and panel, so a field inside a dialog still gets its keys', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const tokens = readFileSync(join(__dirname, '../styles/tokens.css'), 'utf8');
    const css = readFileSync(join(__dirname, '../index.css'), 'utf8');
    const token = (name: string) => Number(new RegExp(`--z-${name}:\\s*(\\d+)`).exec(tokens)?.[1]);
    const bar = Number(/\.fx-kbbar\.fx-scope\s*\{[^}]*?z-index:\s*(\d+)/.exec(css)?.[1]);
    expect(bar).toBeGreaterThan(token('modal'));
    expect(bar).toBeGreaterThan(token('panel'));
    expect(bar).toBeLessThan(token('toast'));
  });
});
