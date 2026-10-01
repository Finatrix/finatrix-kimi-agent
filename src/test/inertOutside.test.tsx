import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { inertOutside, useInertOutside } from '../hooks/useInertOutside';

/**
 * TalkBack walks the accessibility tree by swiping and Android's WebView does
 * not prune it for `aria-modal`, so the page behind an open dialog stayed
 * reachable (measured on the app). These pin what `inertOutside` hides and —
 * as importantly — what it must not: the dialog's own overlay, its backdrop
 * (which has to stay tappable) and live regions (which must still announce).
 */

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

function build() {
  document.body.innerHTML = `
    <div id="root"><header id="header"><button>Menu</button></header><main id="main">page</main></div>
    <div id="toasts" aria-live="polite"></div>
    <div id="shell">
      <div id="backdrop" aria-hidden="true"></div>
      <div id="card" role="dialog" aria-modal="true"><button>Inside</button></div>
    </div>
    <script id="script"></script>`;
  return (id: string) => document.getElementById(id)!;
}

describe('inertOutside', () => {
  it('makes the page behind the dialog inert and leaves the dialog live', () => {
    const $ = build();
    const restore = inertOutside($('card'));
    expect($('root').hasAttribute('inert')).toBe(true);
    expect($('card').hasAttribute('inert')).toBe(false);
    expect($('shell').hasAttribute('inert')).toBe(false);
    restore();
    expect($('root').hasAttribute('inert')).toBe(false);
  });

  it('keeps the backdrop tappable and live regions audible', () => {
    const $ = build();
    inertOutside($('card'));
    expect($('backdrop').hasAttribute('inert')).toBe(false);
    expect($('toasts').hasAttribute('inert')).toBe(false);
    expect($('script').hasAttribute('inert')).toBe(false);
  });

  it('restores only what it changed — content that was already inert stays so', () => {
    const $ = build();
    $('root').setAttribute('inert', '');
    const restore = inertOutside($('card'));
    restore();
    expect($('root').hasAttribute('inert')).toBe(true);
  });

  it('unwinds nested dialogs in order', () => {
    const $ = build();
    const confirm = document.createElement('div');
    const sibling = document.createElement('div');
    $('card').append(sibling, confirm);
    const outer = inertOutside($('card'));
    const inner = inertOutside(confirm);
    expect(sibling.hasAttribute('inert')).toBe(true);
    inner();
    expect(sibling.hasAttribute('inert')).toBe(false);
    expect($('root').hasAttribute('inert')).toBe(true);
    outer();
    expect($('root').hasAttribute('inert')).toBe(false);
  });
});

describe('useInertOutside', () => {
  function Harness({ onBackdrop }: { onBackdrop: () => void }) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);
    useInertOutside(ref, open);
    return (
      <>
        <main data-testid="page"><button onClick={() => setOpen(true)}>Open</button></main>
        {open && createPortal(
          <div>
            <div data-testid="backdrop" aria-hidden="true" onClick={onBackdrop} />
            <div ref={ref} role="dialog" aria-modal="true">
              <button onClick={() => setOpen(false)}>Close</button>
            </div>
          </div>,
          document.body,
        )}
      </>
    );
  }

  it('applies while open, keeps the backdrop working, and lifts on close', () => {
    const onBackdrop = vi.fn();
    const { container } = render(<Harness onBackdrop={onBackdrop} />);
    fireEvent.click(screen.getByText('Open'));
    expect(container.hasAttribute('inert')).toBe(true);
    fireEvent.click(screen.getByTestId('backdrop'));
    expect(onBackdrop).toHaveBeenCalled();
    fireEvent.click(screen.getByText('Close'));
    expect(container.hasAttribute('inert')).toBe(false);
  });
});

describe('useInertOutside and focus restoration', () => {
  /**
   * Dialogs give focus back to their opener in a passive-effect cleanup, and
   * `focus()` inside an inert subtree is ignored by real browsers (jsdom does
   * not model that, so the ORDER is what this pins): by the time any passive
   * cleanup runs, the page must already be live — even when the cleanup was
   * declared before the hook.
   */
  it('lifts inert before any passive cleanup runs, whatever the hook order', () => {
    const seen: boolean[] = [];
    function Dialog() {
      const ref = useRef<HTMLDivElement>(null);
      useEffect(() => () => {
        seen.push(document.querySelector('main')!.hasAttribute('inert'));
      }, []);
      useInertOutside(ref);
      return createPortal(<div ref={ref} role="dialog" aria-modal="true" />, document.body);
    }
    function Page() {
      const [open, setOpen] = useState(true);
      return <><main><button onClick={() => setOpen(false)}>Close</button></main>{open && <Dialog />}</>;
    }
    render(<Page />);
    expect(document.querySelector('main')!.closest('[inert]')).not.toBeNull();
    fireEvent.click(screen.getByText('Close'));
    expect(seen).toEqual([false]);
  });
});
