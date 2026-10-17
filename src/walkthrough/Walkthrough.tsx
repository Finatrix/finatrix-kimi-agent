import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { BrandLogo } from '../components/BrandLogo';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { haptic as fireHaptic, type Haptic } from '../lib/haptics';
import { isNativeApp } from '../native/platform';
import { useOptionalCurrency } from '../tools/CurrencyContext';
import { exampleFor, money, type WalkthroughExample } from './examples';
import { markWalkthroughSeen } from './gating';
import { SceneClock, usePageVisible, useReducedMotion } from './motion';
import { ART_H, ART_W, type OrbControl, type OrbCue } from './geometry';
import { SCENES, type SceneDef } from './scenes';
import './walkthrough.css';

/**
 * The first-run intro: four full-screen scenes, tapped (or swiped, or arrowed)
 * through, handing off to the /welcome setup.
 *
 * Structure, back to front:
 *  - an ambient layer (drifting light, a faint grid) that shifts a little with
 *    each scene for depth;
 *  - a PERSISTENT layer holding the illustration frame and the gold orb. These
 *    never unmount, so as one scene wipes into the next the frame stays put
 *    and the orb travels — the donut's centre becomes the spend's category
 *    icon, then the tip of the goal line, then the privacy shield. That one
 *    object moving is what makes four slides read as one film;
 *  - the scene layers: the incoming one revealed by a slanted clip-path wipe
 *    with a gold light sweeping along its edge, the outgoing one receding;
 *  - the controls: Skip (always), Back, Next / the hand-off.
 *
 * Every illustration is `aria-hidden`; the heading and paragraph of each scene
 * carry its meaning as real text, and a polite live region announces each
 * step. Reduced motion gets the same scenes with every element in its final
 * place and instant scene changes.
 */

export type WalkthroughMode = 'first-run' | 'replay';

interface Props {
  mode: WalkthroughMode;
  /** Close and stay where the user is. */
  onClose: () => void;
  /** Close and go to the /welcome setup. */
  onSetup: () => void;
}

const LEAVE_MS = 720;
const pad = (n: number) => String(n).padStart(2, '0');

export default function Walkthrough({ mode, onClose, onSetup }: Props) {
  const [step, setStep] = useState(0);
  const [sceneKey, setSceneKey] = useState(0);
  const [leaving, setLeaving] = useState<{ index: number; key: number } | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);
  const reduced = useReducedMotion();
  const visible = usePageVisible();
  const paused = !visible;

  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const orbScale = useRef(0);
  const swipe = useRef<{ x: number; y: number; id: number } | null>(null);

  const currency = useOptionalCurrency();
  const code = currency?.code ?? 'INR';
  const sym = currency?.sym ?? '₹';
  const ex = useMemo(() => exampleFor(code), [code]);
  const fmt = useCallback((n: number) => money(n, code, sym), [code, sym]);
  // Native only: on the web a phone's vibration motor is a buzz, not a tick.
  // `haptic()` itself also stands down under reduced motion.
  const haptic = useCallback((kind: Haptic) => { if (isNativeApp()) fireHaptic(kind); }, []);

  useBodyScrollLock(true);
  useDialogFocus({ containerRef: rootRef, open: true, initialFocusRef: primaryRef });

  // Seen the moment it is shown — a reload halfway through must not replay it.
  useEffect(() => { markWalkthroughSeen(); }, []);

  // The outgoing scene is kept only for its exit.
  useEffect(() => {
    if (!leaving) return;
    const t = window.setTimeout(() => setLeaving(null), LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [leaving]);

  /* ── The orb ── */
  const orb = useMemo<OrbControl>(() => {
    const place = (x: number, y: number, riding: boolean) => {
      const track = trackRef.current;
      if (!track) return;
      track.classList.toggle('is-riding', riding);
      track.style.transform = `translate3d(${(x / ART_W) * 100}%, ${(y / ART_H) * 100}%, 0)`;
    };
    return {
      move: (cue: OrbCue) => {
        place(cue.x, cue.y, false);
        const dot = dotRef.current;
        const from = orbScale.current;
        const to = cue.s;
        if (!dot || from === to) return;
        orbScale.current = to;
        dot.style.transform = `scale(${to})`;
        if (reduced || typeof dot.animate !== 'function') return;
        // Squash and stretch: wider and flatter mid-flight, overshoot on landing.
        const mid = (from + to) / 2;
        dot.animate(
          [
            { transform: `scale(${from})` },
            { transform: `scale(${mid * 1.14}, ${mid * 0.88})`, offset: 0.42 },
            { transform: `scale(${to * 1.06})`, offset: 0.78 },
            { transform: `scale(${to})` },
          ],
          { duration: 860, easing: 'cubic-bezier(.3,.7,.2,1)' },
        );
      },
      ride: (x: number, y: number, s: number) => {
        place(x, y, true);
        const dot = dotRef.current;
        if (!dot) return;
        orbScale.current = s;
        dot.style.transform = `scale(${s})`;
      },
    };
  }, [reduced]);

  /* ── Navigation ── */
  const last = SCENES.length - 1;

  const go = useCallback((to: number) => {
    if (to < 0 || to > last || to === step) return;
    setDir(to > step ? 1 : -1);
    setLeaving(reduced ? null : { index: step, key: sceneKey });
    setSceneKey((k) => k + 1);
    setStep(to);
    haptic('select');
    const frame = frameRef.current;
    if (!reduced && frame && typeof frame.animate === 'function') {
      // A breath in the frame as the wipe passes — anticipation, then settle.
      frame.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(0.982)', offset: 0.32 }, { transform: 'scale(1)' }],
        { duration: 760, easing: 'cubic-bezier(.3,.7,.2,1)' },
      );
    }
    try { bodyRef.current?.scrollTo?.({ top: 0, behavior: 'instant' }); } catch { /* old engines */ }
  }, [haptic, last, reduced, sceneKey, step]);

  const next = useCallback(() => go(step + 1), [go, step]);
  const back = useCallback(() => go(step - 1), [go, step]);

  // Back unmounts on the first scene; if it had focus, hand focus to the
  // primary action rather than letting it fall to <body>.
  useEffect(() => {
    const root = rootRef.current;
    if (root && !root.contains(document.activeElement)) primaryRef.current?.focus();
  }, [step]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        // The Android BACK button reaches every overlay as a synthetic Escape
        // (native/bridge.ts closeTopOverlay). For BACK, step back first, and
        // close only from the first scene — the platform convention. A real
        // Escape key always skips.
        if (!e.nativeEvent.isTrusted && step > 0) back();
        else onClose();
        break;
      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        next();
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        back();
        break;
    }
  };

  // Swipe is a bonus for touch — the buttons and keys do everything it does.
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return;
    swipe.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy) * 1.3) return;
    if (dx < 0) next();
    else back();
  };

  const scene = SCENES[step];
  const isLast = step === last;
  const primaryLabel = !isLast ? 'Next' : mode === 'first-run' ? 'Set up my month' : 'Done';
  const onPrimary = !isLast ? next : mode === 'first-run' ? onSetup : onClose;

  const rootStyle = { ['--wt-step' as string]: step } as CSSProperties;

  return createPortal(
    <div
      ref={rootRef}
      className="fx-tools fx-scope wt-root"
      role="dialog"
      aria-modal="true"
      aria-label="Welcome to FinatriX"
      aria-describedby={`wt-title-${scene.id}`}
      data-dir={dir}
      data-paused={paused ? '' : undefined}
      data-reduced={reduced ? '' : undefined}
      style={rootStyle}
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
      {/* The light that rides the wipe's edge; re-keyed so each change replays it. */}
      {sceneKey > 0 && !reduced && <div key={sceneKey} className="wt-sweep" aria-hidden="true" />}

      <header className="wt-top">
        <div className="wt-brand" aria-hidden="true">
          <BrandLogo size={24} />
          <span>Finatri<span className="wt-x">X</span></span>
        </div>
        <div className="wt-top-right">
          <span className="wt-count" aria-hidden="true">{pad(step + 1)}<span> / {pad(SCENES.length)}</span></span>
          <button type="button" className="wt-skip" onClick={onClose}>
            Skip intro
          </button>
        </div>
      </header>

      <div
        ref={bodyRef}
        className="wt-body"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { swipe.current = null; }}
      >
        {/* Persistent: the frame and the orb outlive every scene. */}
        <div className="wt-layer wt-persist" aria-hidden="true">
          <div ref={frameRef} className="wt-frame">
            <span className="wt-frame-tag">Example figures</span>
            <div ref={trackRef} className="wt-orb-track">
              <div ref={dotRef} className="wt-orb" />
            </div>
          </div>
          <div className="wt-copy wt-copy-ghost" />
        </div>

        {leaving && (
          <SceneView
            key={leaving.key}
            scene={SCENES[leaving.index]}
            index={leaving.index}
            phase="leave"
            paused={paused}
            reduced={reduced}
            ex={ex}
            fmt={fmt}
            haptic={haptic}
            orb={orb}
          />
        )}
        <SceneView
          key={sceneKey}
          scene={scene}
          index={step}
          phase={sceneKey === 0 ? 'intro' : 'enter'}
          paused={paused}
          reduced={reduced}
          ex={ex}
          fmt={fmt}
          haptic={haptic}
          orb={orb}
        />
      </div>

      <footer className="wt-foot">
        <div className="wt-progress" aria-hidden="true">
          {SCENES.map((s, i) => (
            <span
              key={i === step ? `on-${sceneKey}` : s.id}
              className={`wt-seg${i < step ? ' is-past' : i === step ? ' is-current' : ''}`}
              style={i === step ? ({ ['--dur' as string]: `${s.duration}ms` } as CSSProperties) : undefined}
            >
              <i />
            </span>
          ))}
        </div>
        <div className="wt-actions">
          {step > 0 ? (
            <button type="button" className="wt-btn wt-ghost" onClick={back}>
              Back
            </button>
          ) : (
            <span className="wt-btn-spacer" />
          )}
          <div className="wt-actions-main">
            {isLast && (
              <button type="button" className="wt-btn wt-ghost" onClick={mode === 'first-run' ? onClose : onSetup}>
                {mode === 'first-run' ? 'Explore on my own' : 'Open setup'}
              </button>
            )}
            <button ref={primaryRef} type="button" className="wt-btn wt-primary" onClick={onPrimary}>
              <span>{primaryLabel}</span>
              {!isLast && (
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
                  <path d="M5 12h14M13 6l6 6-6 6" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </footer>

      <p className="wt-sr" aria-live="polite" aria-atomic="true">
        {`Step ${step + 1} of ${SCENES.length}. ${scene.title}`}
      </p>
    </div>,
    document.body,
  );
}

/* ── One scene ─────────────────────────────────────────────────────── */

interface SceneViewProps {
  scene: SceneDef;
  index: number;
  phase: 'intro' | 'enter' | 'leave';
  paused: boolean;
  reduced: boolean;
  ex: WalkthroughExample;
  fmt: (n: number) => string;
  haptic: (kind: Haptic) => void;
  orb: OrbControl;
}

function SceneView({ scene, index, phase, paused, reduced, ex, fmt, haptic, orb }: SceneViewProps) {
  const [clock] = useState(() => new SceneClock(reduced));
  // Once a scene starts leaving, its timeline must stop steering the orb —
  // the incoming scene owns it now.
  const live = useRef(true);
  const liveOrb = useMemo<OrbControl>(() => ({
    move: (cue) => { if (live.current) orb.move(cue); },
    ride: (x, y, s) => { if (live.current) orb.ride(x, y, s); },
  }), [orb]);

  useEffect(() => {
    live.current = phase !== 'leave';
  }, [phase]);

  // Runs after the illustration's own effects have put their tasks on the
  // clock (children's effects run first), so everything starts on one beat.
  useEffect(() => {
    for (const cue of scene.orb) clock.at(cue.at, () => liveOrb.move(cue));
    return () => clock.dispose();
  }, [clock, liveOrb, scene]);

  // Hidden tab: hold the timeline (CSS animations are held by `data-paused`).
  // The reduced-motion clock has nothing to animate, so it never waits.
  useEffect(() => {
    if (paused && !clock.instant) clock.pause();
    else clock.start();
  }, [clock, paused]);

  const leavingNow = phase === 'leave';
  const words = scene.title.split(' ');
  const base = phase === 'intro' ? 420 : 160;
  const { Art } = scene;

  return (
    <div
      className="wt-layer wt-scene"
      data-phase={phase}
      aria-hidden={leavingNow || undefined}
      inert={leavingNow || undefined}
    >
      <div className="wt-art-slot">
        <Art clock={clock} orb={liveOrb} ex={ex} fmt={fmt} haptic={haptic} />
      </div>
      <div className="wt-copy">
        <p className="wt-eyebrow wt-up" style={{ ['--d' as string]: base - 80 } as CSSProperties}>
          <span className="wt-eyebrow-n">{pad(index + 1)}</span>
          {scene.eyebrow}
        </p>
        <h2 className="wt-title" id={leavingNow ? undefined : `wt-title-${scene.id}`}>
          <span className="wt-sr-only">{scene.title}</span>
          <span aria-hidden="true">
            {words.map((w, i) => (
              <span key={i}>
                {i > 0 && ' '}
                <span className="wt-word">
                  <span style={{ ['--d' as string]: base + i * 55 } as CSSProperties}>{w}</span>
                </span>
              </span>
            ))}
          </span>
        </h2>
        <p className="wt-lede wt-up" style={{ ['--d' as string]: base + words.length * 55 + 140 } as CSSProperties}>
          {scene.body(ex)}
        </p>
      </div>
    </div>
  );
}
