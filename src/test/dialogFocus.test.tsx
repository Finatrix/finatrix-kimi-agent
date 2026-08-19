import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useRef, useState } from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useDialogFocus } from '../hooks/useDialogFocus';

/**
 * `aria-modal="true"` is an assertion to assistive technology that everything
 * outside the dialog is inert. The browser does not enforce it — Tab walks
 * straight out — so without a trap a keyboard or screen-reader user lands on
 * controls their AT has just been told do not exist. These assert the two
 * halves that make the assertion true: focus stays in, and focus comes back.
 */

/** jsdom does not schedule rAF on its own timing; drive it explicitly. */
function flushFrame() {
  act(() => {
    vi.advanceTimersByTime(20);
  });
}

function Harness({ withFocusable = true }: { withFocusable?: boolean }) {
  const [open, setOpen] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef<HTMLButtonElement>(null);
  useDialogFocus({ containerRef: cardRef, open, initialFocusRef: firstRef });

  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>Open</button>
      <button type="button">Behind the dialog</button>
      {open && (
        <div ref={cardRef} role="dialog" aria-modal="true" aria-label="Test dialog">
          {withFocusable ? (
            <>
              <button type="button" ref={firstRef}>Primary</button>
              <button type="button">Secondary</button>
              <button type="button" onClick={() => setOpen(false)}>Close</button>
            </>
          ) : (
            <p>Nothing focusable in here.</p>
          )}
        </div>
      )}
    </div>
  );
}

describe('useDialogFocus', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });
  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('moves focus into the dialog when it opens', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    flushFrame();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Primary' }));
  });

  it('wraps Tab from the last control back to the first', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    flushFrame();

    screen.getByRole('button', { name: 'Close' }).focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Primary' }));
  });

  it('wraps Shift+Tab from the first control back to the last', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    flushFrame();

    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close' }));
  });

  it('pulls focus back in if it has already escaped', () => {
    // A re-render that removes the focused node drops focus to <body>; a trap
    // that only checks first/last would never notice and would stop working.
    render(<Harness />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    flushFrame();

    screen.getByRole('button', { name: 'Behind the dialog' }).focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Primary' }));
  });

  it('returns focus to whatever opened it', () => {
    render(<Harness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    flushFrame();
    expect(document.activeElement).not.toBe(opener);

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(document.activeElement).toBe(opener);
  });

  it('holds focus on a dialog with nothing focusable inside it', () => {
    render(<Harness withFocusable={false} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open' }));
    flushFrame();

    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);
    // Tab must not escape to the page the dialog is covering.
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(dialog);
  });

  it('does nothing at all while closed', () => {
    render(<Harness />);
    const behind = screen.getByRole('button', { name: 'Behind the dialog' });
    behind.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(behind);
  });
});
