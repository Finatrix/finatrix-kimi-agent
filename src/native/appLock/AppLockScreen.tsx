import { useEffect, useId, useRef, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { BrandLogo } from '../../components/BrandLogo';
import Button from '../../components/Button';
import { useDialogFocus } from '../../hooks/useDialogFocus';

interface AppLockScreenProps {
  /**
   * False while the app is only out of the foreground. Then this is a cover and
   * nothing more: no dialog, no focus move, so someone who comes straight back
   * finds their place, and their cursor, where they left them.
   */
  locked: boolean;
  /** The phone refused the last attempt (as opposed to the user cancelling it). */
  failed: boolean;
  onUnlock: () => void;
  /** BACK on Android. */
  onLeave: () => void;
}

/**
 * Laid out inline rather than with utility classes. The root carries
 * `.fx-tools.fx-scope` like every portal root, and tools.css is a route's
 * stylesheet: it can arrive after this screen is up, and its rules then outrank
 * a utility of equal weight. Nothing may be able to restyle the one element
 * whose whole job is to be opaque and on top, so its box is not up for grabs.
 *
 * The padding keeps the content clear of the notch and the home indicator, with
 * a floor where there are none.
 */
const COVER: CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 2147483000,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  margin: 0,
  background: 'var(--surface-base)',
  textAlign: 'center',
  paddingTop: 'max(24px, env(safe-area-inset-top))',
  paddingRight: 'max(24px, env(safe-area-inset-right))',
  paddingBottom: 'max(24px, env(safe-area-inset-bottom))',
  paddingLeft: 'max(24px, env(safe-area-inset-left))',
};

/**
 * What covers the app while it is veiled or locked.
 *
 * Portalled to `body`, so no ancestor's stacking context or transform can put
 * anything above it or leave a strip of the page showing.
 *
 * Opaque and unanimated on purpose: a cover that fades in shows what it is
 * covering while it does, so there is no motion here to reduce.
 */
export default function AppLockScreen({ locked, failed, onUnlock, onLeave }: AppLockScreenProps) {
  const titleId = useId();
  const descId = useId();
  const coverRef = useRef<HTMLDivElement>(null);
  const unlockRef = useRef<HTMLButtonElement>(null);

  // Makes the page behind inert, moves focus to Unlock, and puts focus back
  // where it was once the lock opens.
  useDialogFocus({ containerRef: coverRef, open: locked, initialFocusRef: unlockRef });

  // Nothing behind the lock may hear the keyboard. With a hardware keyboard the
  // app's shortcuts would otherwise open things underneath, and an overlay
  // opened there would make this screen inert in turn. Capture on `window` is
  // the first stop for every key, so it ends here. Enter and Space still press
  // the button: stopping an event does not cancel what the browser does next.
  useEffect(() => {
    if (!locked) return;
    const onKeyDown = (event: KeyboardEvent) => {
      event.stopImmediatePropagation();
      if (event.key === 'Escape') {
        // Android's BACK arrives as Escape on the topmost dialog (bridge.ts).
        event.preventDefault();
        onLeave();
      } else if (event.key === 'Tab') {
        // One control, so Tab has nowhere else to go.
        event.preventDefault();
        unlockRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [locked, onLeave]);

  return createPortal(
    <div
      ref={coverRef}
      className="fx-tools fx-scope fx-applock"
      style={COVER}
      data-phase={locked ? 'locked' : 'veiled'}
      {...(locked
        ? { role: 'dialog', 'aria-modal': true, 'aria-labelledby': titleId, 'aria-describedby': descId }
        : { 'aria-hidden': true })}
    >
      <BrandLogo size={64} />
      {locked && (
        <>
          <h2 id={titleId} className="mt-6 text-[21px] font-semibold tracking-[-0.01em] text-ink">
            FinatriX is locked
          </h2>
          <p id={descId} className="mt-2 max-w-[300px] text-[14px] leading-relaxed text-ink-2">
            Use your face, fingerprint or device passcode to open it.
          </p>
          <Button
            ref={unlockRef}
            variant="gold"
            onClick={onUnlock}
            className="mt-7 min-h-[48px] w-full max-w-[280px] rounded-full py-3.5 font-mono text-[12px] uppercase tracking-[0.1em]"
          >
            Unlock
          </Button>
          {/* Always in the tree, so a screen reader hears the text arrive. */}
          <p role="status" className="mt-4 min-h-[20px] text-[13px] text-ink-2">
            {failed ? 'That did not work. Try again.' : ''}
          </p>
        </>
      )}
    </div>,
    document.body,
  );
}
