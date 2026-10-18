import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactElement } from 'react';
import { createPortal } from 'react-dom';
import { BrandLogo } from '../components/BrandLogo';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useDialogFocus } from '../hooks/useDialogFocus';
import type { Haptic } from '../lib/haptics';
import type { OrbControl, OrbCue } from '../walkthrough/geometry';
import { SceneClock } from '../walkthrough/motion';
import { useOrbControl } from '../walkthrough/orb';
import type { IntroArtProps } from './types';
import '../walkthrough/walkthrough.css';
import './tour.css';

/**
 * A chapter's opening scene — the same film language as the first-run intro
 * (it reuses that stylesheet's root, ambient light, frame, gold orb, masked
 * word reveal and buttons), so the tour reads as the intro's sequel rather
 * than a second design.
 *
 * Full screen and opaque on purpose: while it plays, the tour navigates to
 * the chapter's page BEHIND it, so by the time "Show me around" is pressed
 * the real page is mounted and the spotlight can go straight to work.
 *
 * Also used, with different words and art, for the full tour's finale.
 */

export interface IntroSceneProps {
  /** Re-keys the scene so each chapter gets its own entrance. */
  sceneKey: string;
  eyebrow: string;
  /** 1-based position and count, shown as "02 / 13". */
  position: number;
  count: number;
  headline: string;
  body: string;
  /** Small line under the body, e.g. "About 2 minutes · 9 steps". */
  meta?: string;
  Art: (props: IntroArtProps) => ReactElement;
  orb: OrbCue[];
  duration: number;
  fmt: (n: number) => string;
  code: string;
  reduced: boolean;
  paused: boolean;
  haptic: (kind: Haptic) => void;
  primaryLabel: string;
  onPrimary: () => void;
  /** e.g. "Skip chapter"; omitted to hide. */
  secondaryLabel?: string;
  onSecondary?: () => void;
  onBack?: () => void;
  onExit: () => void;
  exitLabel?: string;
  /** Accessible name for the dialog. */
  label: string;
  /** Fading out over the spotlight that replaces it; no longer interactive. */
  leaving?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

export default function IntroScene(p: IntroSceneProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(!p.leaving);
  useDialogFocus({ containerRef: rootRef, open: !p.leaving, initialFocusRef: primaryRef });

  // The orb lives in the persistent frame, so from one chapter's scene to the
  // next it travels rather than reappearing.
  const orb = useOrbControl(trackRef, dotRef, p.reduced);

  // A new scene inside the same film: take focus back to its primary action.
  useEffect(() => {
    if (!p.leaving) primaryRef.current?.focus({ preventScroll: true });
  }, [p.sceneKey, p.leaving]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      // Android BACK (a synthetic Escape) steps back when there is somewhere
      // to go; a real Escape always leaves the tour.
      if (!e.nativeEvent.isTrusted && p.onBack) p.onBack();
      else p.onExit();
    } else if (e.key === 'ArrowRight' || e.key === 'PageDown') {
      e.preventDefault();
      p.onPrimary();
    } else if ((e.key === 'ArrowLeft' || e.key === 'PageUp') && p.onBack) {
      e.preventDefault();
      p.onBack();
    }
  };

  const words = p.headline.split(' ');

  return createPortal(
    <div
      ref={rootRef}
      className={`fx-tools fx-scope wt-root tour-intro${p.leaving ? ' is-leaving' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={p.label}
      aria-describedby="tour-intro-title"
      data-paused={p.paused ? '' : undefined}
      data-reduced={p.reduced ? '' : undefined}
      onKeyDown={onKeyDown}
    >
      <div className="wt-amb" aria-hidden="true">
        <div className="wt-amb-par">
          <span className="wt-blob wt-blob-1" />
          <span className="wt-blob wt-blob-2" />
          <span className="wt-blob wt-blob-3" />
        </div>
        <div className="wt-amb-grid" />
      </div>
      {!p.reduced && <div key={p.sceneKey} className="wt-sweep" aria-hidden="true" />}

      <header className="wt-top">
        <div className="wt-brand" aria-hidden="true">
          <BrandLogo size={24} />
          <span>Finatri<span className="wt-x">X</span></span>
        </div>
        <div className="wt-top-right">
          <span className="wt-count" aria-hidden="true">{pad(p.position)}<span> / {pad(p.count)}</span></span>
          <button type="button" className="wt-skip" onClick={p.onExit}>{p.exitLabel ?? 'Exit tour'}</button>
        </div>
      </header>

      <div className="wt-body">
        <div className="wt-layer tour-intro-layer">
          <div className="wt-frame tour-intro-frame" aria-hidden="true">
            <span className="wt-frame-tag">Example figures</span>
            <div ref={trackRef} className="wt-orb-track">
              <div ref={dotRef} className="wt-orb" />
            </div>
            <ArtLayer
              key={p.sceneKey}
              Art={p.Art}
              cues={p.orb}
              orb={orb}
              fmt={p.fmt}
              code={p.code}
              haptic={p.haptic}
              reduced={p.reduced}
              paused={p.paused}
            />
          </div>
          <div key={p.sceneKey} className="wt-copy wt-scene" data-phase="enter">
            <p className="wt-eyebrow wt-up" style={{ ['--d' as string]: 180 } as CSSProperties}>
              <span className="wt-eyebrow-n">{pad(p.position)}</span>
              {p.eyebrow}
            </p>
            <h2 className="wt-title" id="tour-intro-title">
              <span className="wt-sr-only">{p.headline}</span>
              <span aria-hidden="true">
                {words.map((w, i) => (
                  <span key={i}>
                    {i > 0 && ' '}
                    <span className="wt-word">
                      <span style={{ ['--d' as string]: 260 + i * 55 } as CSSProperties}>{w}</span>
                    </span>
                  </span>
                ))}
              </span>
            </h2>
            <p className="wt-lede wt-up" style={{ ['--d' as string]: 260 + words.length * 55 + 140 } as CSSProperties}>
              {p.body}
            </p>
            {p.meta && (
              <p className="tour-intro-meta wt-up" style={{ ['--d' as string]: 360 + words.length * 55 + 140 } as CSSProperties}>
                {p.meta}
              </p>
            )}
          </div>
        </div>
      </div>

      <footer className="wt-foot">
        <div className="wt-progress" aria-hidden="true">
          {Array.from({ length: p.count }, (_, i) => (
            <span
              key={i === p.position - 1 ? `on-${p.sceneKey}` : i}
              className={`wt-seg${i < p.position - 1 ? ' is-past' : i === p.position - 1 ? ' is-current' : ''}`}
              style={i === p.position - 1 ? ({ ['--dur' as string]: `${p.duration}ms` } as CSSProperties) : undefined}
            >
              <i />
            </span>
          ))}
        </div>
        <div className="wt-actions">
          {p.onBack ? (
            <button type="button" className="wt-btn wt-ghost" onClick={p.onBack}>Back</button>
          ) : (
            <span className="wt-btn-spacer" />
          )}
          <div className="wt-actions-main">
            {p.secondaryLabel && p.onSecondary && (
              <button type="button" className="wt-btn wt-ghost" onClick={p.onSecondary}>{p.secondaryLabel}</button>
            )}
            <button ref={primaryRef} type="button" className="wt-btn wt-primary" onClick={p.onPrimary}>
              <span>{p.primaryLabel}</span>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </footer>

      <p className="wt-sr" aria-live="polite" aria-atomic="true">
        {`${p.eyebrow}. ${p.headline} ${p.body}`}
      </p>
    </div>,
    document.body,
  );
}

/**
 * One scene's illustration and its timeline. Keyed by scene, so each chapter
 * gets a fresh clock and its own entrance, while the frame and orb around it
 * stay put.
 */
function ArtLayer({ Art, cues, orb, fmt, code, haptic, reduced, paused }: {
  Art: (props: IntroArtProps) => ReactElement;
  cues: OrbCue[];
  orb: OrbControl;
  fmt: (n: number) => string;
  code: string;
  haptic: (kind: Haptic) => void;
  reduced: boolean;
  paused: boolean;
}) {
  const [clock] = useState(() => new SceneClock(reduced));

  // Runs after the illustration's own effects have put their tasks on the
  // clock (children's effects run first), so everything starts on one beat.
  useEffect(() => {
    for (const cue of cues) clock.at(cue.at, () => orb.move(cue));
    return () => clock.dispose();
  }, [clock, orb, cues]);

  // Hidden tab: hold the timeline (CSS animations are held by `data-paused`).
  useEffect(() => {
    if (paused && !clock.instant) clock.pause();
    else clock.start();
  }, [clock, paused]);

  return (
    <div className="tour-intro-art">
      <Art clock={clock} orb={orb} fmt={fmt} code={code} haptic={haptic} />
    </div>
  );
}
