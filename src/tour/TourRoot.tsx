import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { haptic as fireHaptic, type Haptic } from '../lib/haptics';
import { isNativeApp } from '../native/platform';
import { useOptionalCurrency } from '../tools/CurrencyContext';
import { hasAnyData } from '../tools/lib/settings';
import { money } from '../walkthrough/examples';
import { usePageVisible, useReducedMotion } from '../walkthrough/motion';
import { CHAPTERS, chapterById, chapterForPath } from './chapters';
import { findShown, hookContext, planSteps, waitForShown } from './dom';
import { FinaleArt } from './FinaleArt';
import IntroScene from './IntroScene';
import { TOUR_OPEN_ATTR, type TourRequest } from './launch';
import {
  acceptOffer, loadProgress, markChapterDone, markFinished, markSeen, markStarted, setOptOut, snoozeOffer,
} from './progress';
import Spotlight from './Spotlight';
import TourHub from './TourHub';
import TourOffer from './TourOffer';
import type { TourChapter, TourEnv, TourStep } from './types';
import './tour.css';

/**
 * The tour's conductor. One instance per request (TourGate re-keys it), and
 * it decides what is on screen:
 *
 *   offer ──yes──▶ run ◀──── hub
 *                  │
 *     intro ─▶ steps ─▶ (next chapter's intro …) ─▶ finale
 *
 * A run is a queue of chapter ids — every chapter for the full tour, one for
 * "Tour this page". Each chapter plays its intro scene full screen while the
 * tour navigates to the chapter's page behind it, then walks the page's real
 * controls with the spotlight. Nothing here writes user data: progress lives
 * in the tour's own local-only keys (./progress).
 */

interface Run {
  queue: string[];
  ci: number;
  phase: 'intro' | 'steps';
  /** Where the steps phase starts: a step id, or the last step (coming back). */
  startAt?: string | 'last';
  /** Opened from the hub — finishing or skipping a single chapter returns there. */
  fromHub: boolean;
}

type View =
  | { kind: 'hub' }
  | { kind: 'offer' }
  | { kind: 'run'; run: Run }
  | { kind: 'finale' };

interface Props {
  request: TourRequest;
  onClose: () => void;
  /** Test seam: the chapter list (defaults to the registry). */
  chapters?: readonly TourChapter[];
}

function initialView(request: TourRequest, chapters: readonly TourChapter[]): View {
  switch (request.kind) {
    case 'hub': return { kind: 'hub' };
    case 'offer': return { kind: 'offer' };
    case 'full': {
      const ids = chapters.map((c) => c.id);
      const from = request.from ? Math.max(0, ids.indexOf(request.from)) : 0;
      return { kind: 'run', run: { queue: ids, ci: from, phase: 'intro', fromHub: false } };
    }
    case 'chapter': {
      const c = chapterById(request.id, chapters);
      if (!c) return { kind: 'hub' };
      return { kind: 'run', run: { queue: [c.id], ci: 0, phase: request.step ? 'steps' : 'intro', startAt: request.step, fromHub: false } };
    }
    case 'page': {
      const c = chapterForPath(request.path, chapters);
      return c ? { kind: 'run', run: { queue: [c.id], ci: 0, phase: 'intro', fromHub: false } } : { kind: 'hub' };
    }
  }
}

const INTRO_LEAVE_MS = 380;

export default function TourRoot({ request, onClose, chapters = CHAPTERS }: Props) {
  const [view, setView] = useState<View>(() => initialView(request, chapters));
  /** The intro scene still fading out over the spotlight that replaced it. */
  const [leavingIntro, setLeavingIntro] = useState<string | null>(null);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const reduced = useReducedMotion();
  const paused = !usePageVisible();
  const currency = useOptionalCurrency();
  const code = currency?.code ?? 'INR';
  const sym = currency?.sym ?? '₹';
  const fmt = useCallback((n: number) => money(n, code, sym), [code, sym]);
  const haptic = useCallback((kind: Haptic) => { if (isNativeApp()) fireHaptic(kind); }, []);

  // Mark the document while the tour is up, and give focus back on the way out.
  const returnFocus = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    returnFocus.current = document.activeElement as HTMLElement | null;
    document.documentElement.setAttribute(TOUR_OPEN_ATTR, '');
    return () => {
      document.documentElement.removeAttribute(TOUR_OPEN_ATTR);
      const el = returnFocus.current;
      requestAnimationFrame(() => {
        if (el && el.isConnected && !el.closest('[inert]')) el.focus({ preventScroll: true });
        else document.getElementById('main')?.focus({ preventScroll: true });
      });
    };
  }, []);

  const env = useMemo<TourEnv>(() => {
    let data = false;
    try { data = hasAnyData(); } catch { data = false; }
    return {
      native: isNativeApp(),
      signedIn: !!user,
      hasData: data,
      wide: typeof window !== 'undefined' && window.innerWidth >= 768,
    };
    // Re-read per chapter: a chapter later in the tour may follow one where
    // the person saved something.
  }, [user, view.kind === 'run' ? view.run.ci : -1]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Run navigation ───────────────────────────────────────────────── */

  const run = view.kind === 'run' ? view.run : null;
  const chapter = run ? chapterById(run.queue[run.ci], chapters) ?? null : null;

  const startRun = useCallback((r: Run) => {
    markStarted(Date.now());
    setView({ kind: 'run', run: r });
  }, []);

  const finishChapter = useCallback((r: Run, how: 'done' | 'skipped') => {
    const id = r.queue[r.ci];
    if (how === 'done') { markChapterDone(id, Date.now()); haptic('success'); }
    if (r.ci + 1 < r.queue.length) {
      setView({ kind: 'run', run: { ...r, ci: r.ci + 1, phase: 'intro', startAt: undefined } });
      return;
    }
    if (r.queue.length > 1) {
      if (how === 'done' || r.queue.every((q) => loadProgress().done[q] != null)) markFinished(Date.now());
      setView({ kind: 'finale' });
      return;
    }
    if (r.fromHub) setView({ kind: 'hub' });
    else onClose();
  }, [haptic, onClose]);

  // Each chapter's page loads behind its intro.
  useEffect(() => {
    if (!run || !chapter) return;
    if (run.phase === 'intro' && pathname !== chapter.route) navigate(chapter.route);
  }, [run, chapter, pathname, navigate]);

  const showSteps = useCallback((r: Run, startAt?: string | 'last') => {
    setLeavingIntro(r.queue[r.ci]);
    setView({ kind: 'run', run: { ...r, phase: 'steps', startAt } });
  }, []);

  useEffect(() => {
    if (!leavingIntro) return;
    const t = window.setTimeout(() => setLeavingIntro(null), reduced ? 0 : INTRO_LEAVE_MS);
    return () => window.clearTimeout(t);
  }, [leavingIntro, reduced]);

  /* ── Views ────────────────────────────────────────────────────────── */

  const position = (id: string) => Math.max(0, chapters.findIndex((c) => c.id === id)) + 1;

  if (view.kind === 'offer') {
    // The offer is for this page's chapter — a couple of minutes — not the
    // whole tutorial; the rest is a tap away under All tools › Guided tours.
    const here = chapterForPath(pathname, chapters) ?? chapters[0];
    return (
      <TourOffer
        minutes={here.minutes}
        pageName={here.id === 'dashboard' ? 'your dashboard' : `the ${here.title}`}
        onYes={() => {
          acceptOffer();
          startRun({ queue: [here.id], ci: 0, phase: 'intro', fromHub: false });
        }}
        onLater={() => { snoozeOffer(Date.now()); onClose(); }}
        onNever={() => { setOptOut(true); onClose(); }}
      />
    );
  }

  if (view.kind === 'hub') {
    return (
      <TourHub
        chapters={chapters}
        reduced={reduced}
        paused={paused}
        onClose={onClose}
        onStartFull={(from) => {
          const ids = chapters.map((c) => c.id);
          startRun({ queue: ids, ci: from ? Math.max(0, ids.indexOf(from)) : 0, phase: 'intro', fromHub: true });
        }}
        onStartChapter={(id, step) => startRun({ queue: [id], ci: 0, phase: step ? 'steps' : 'intro', startAt: step, fromHub: true })}
      />
    );
  }

  if (view.kind === 'finale') {
    const p = loadProgress();
    const total = chapters.reduce((n, c) => n + c.steps.length, 0);
    const seen = chapters.reduce((n, c) => n + c.steps.filter((s) => p.seen[`${c.id}.${s.id}`] != null).length, 0);
    return (
      <IntroScene
        sceneKey="finale"
        label="Tour complete"
        eyebrow="Tour complete"
        position={chapters.length}
        count={chapters.length}
        headline="That is the whole toolkit."
        body={`You have seen ${seen} of ${total} features. Everything stays one tap away: the tutorial hub lists what you have not tried yet.`}
        Art={FinaleArt}
        orb={[{ at: 0, x: 180, y: 128, s: 1.6 }]}
        duration={2200}
        fmt={fmt}
        code={code}
        reduced={reduced}
        paused={paused}
        haptic={haptic}
        primaryLabel="Start using FinatriX"
        onPrimary={onClose}
        secondaryLabel="Open the tutorial hub"
        onSecondary={() => setView({ kind: 'hub' })}
        onExit={onClose}
        exitLabel="Close"
      />
    );
  }

  if (!run || !chapter) return null;

  const isFull = run.queue.length > 1;
  const nextChapter = run.ci + 1 < run.queue.length ? chapterById(run.queue[run.ci + 1], chapters) : undefined;
  const introProps = {
    sceneKey: chapter.id,
    label: `${chapter.title} tour`,
    eyebrow: chapter.intro.eyebrow,
    position: position(chapter.id),
    count: chapters.length,
    headline: chapter.intro.headline,
    body: chapter.intro.body,
    meta: `${chapter.title} · about ${chapter.minutes} min · ${chapter.steps.length} steps`,
    Art: chapter.intro.Art,
    orb: chapter.intro.orb,
    duration: chapter.intro.duration,
    fmt,
    code,
    reduced,
    paused,
    haptic,
    primaryLabel: 'Show me around',
    onExit: onClose,
  };

  return (
    <>
      {run.phase === 'intro' && (
        <IntroScene
          {...introProps}
          onPrimary={() => showSteps(run, run.startAt)}
          secondaryLabel={isFull ? 'Skip chapter' : undefined}
          onSecondary={isFull ? () => finishChapter(run, 'skipped') : undefined}
          onBack={run.ci > 0 ? () => setView({ kind: 'run', run: { ...run, ci: run.ci - 1, phase: 'steps', startAt: 'last' } }) : undefined}
        />
      )}
      {run.phase === 'steps' && leavingIntro === chapter.id && (
        <IntroScene {...introProps} leaving onPrimary={() => {}} />
      )}
      {run.phase === 'steps' && (
        <StepRunner
          key={`${run.ci}:${chapter.id}`}
          chapter={chapter}
          env={env}
          startAt={run.startAt}
          nextLabel={nextChapter ? 'Next chapter' : isFull ? 'Finish tour' : 'Finish'}
          reduced={reduced}
          paused={paused}
          fmt={fmt}
          code={code}
          haptic={haptic}
          onDone={() => finishChapter(run, 'done')}
          onBackToIntro={() => setView({ kind: 'run', run: { ...run, phase: 'intro', startAt: undefined } })}
          onSkipChapter={() => finishChapter(run, 'skipped')}
          onExit={onClose}
        />
      )}
    </>
  );
}

/* ── The steps of one chapter ──────────────────────────────────────── */

interface StepRunnerProps {
  chapter: TourChapter;
  env: TourEnv;
  startAt?: string | 'last';
  nextLabel: string;
  reduced: boolean;
  paused: boolean;
  fmt: (n: number) => string;
  code: string;
  haptic: (kind: Haptic) => void;
  onDone: () => void;
  onBackToIntro: () => void;
  onSkipChapter: () => void;
  onExit: () => void;
}

/** How long the first step waits for a freshly navigated page to mount. */
const FIRST_WAIT_MS = 4000;
/** How long any later step waits for its target before it is skipped. */
const STEP_WAIT_MS = 1200;

function StepRunner(p: StepRunnerProps) {
  const { chapter, env } = p;
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const plan = useRef<TourStep[] | null>(null);
  /** The step on screen, with a snapshot of the plan it belongs to (the plan shrinks as missing steps drop out). */
  const [cur, setCur] = useState<{ i: number; el: HTMLElement | null; steps: TourStep[] } | null>(null);
  const token = useRef(0);
  const expectedRoute = useRef(chapter.route);
  const navigating = useRef(false);
  /** A step has been shown: later waits are short (the page is already up). */
  const shownOnce = useRef(false);
  const ctx = useMemo(() => hookContext(env), [env]);
  const latest = useRef(p);
  /** The router's path (not window.location, which a memory router never moves). */
  const pathRef = useRef(pathname);
  useLayoutEffect(() => { latest.current = p; pathRef.current = pathname; });

  /** Show plan[i], walking in `dir` past steps whose target never appears. */
  const go = useCallback(async (start: number, dir: 1 | -1) => {
    const my = ++token.current;
    const steps = plan.current;
    if (!steps) return;
    let i = start;
    let first = !shownOnce.current;
    while (i >= 0 && i < steps.length) {
      const step = steps[i];
      const route = step.route ?? chapter.route;
      expectedRoute.current = route;
      if (pathRef.current !== route) {
        navigating.current = true;
        navigate(route);
        first = true;
      }
      try { await step.before?.(ctx); } catch { /* a failed hook never blocks the tour */ }
      if (my !== token.current) return;
      const el = step.target ? await waitForShown(step.target, first ? FIRST_WAIT_MS : STEP_WAIT_MS) : null;
      if (my !== token.current) return;
      navigating.current = false;
      if (step.target && !el) {
        // Not on screen here (a feature this person does not have yet, or one
        // hidden at this width): drop it quietly and keep walking.
        steps.splice(i, 1);
        if (dir < 0) i -= 1;
        first = false;
        continue;
      }
      shownOnce.current = true;
      markSeen(chapter.id, step.id, Date.now());
      latest.current.haptic('select');
      setCur({ i, el, steps: [...steps] });
      return;
    }
    if (i < 0) latest.current.onBackToIntro();
    else latest.current.onDone();
  }, [chapter, ctx, navigate]);

  // Plan once the page is there: wait for the first plain target so a lazy
  // route has mounted, then keep the steps that apply on this screen.
  useEffect(() => {
    let live = true;
    (async () => {
      if (pathRef.current !== chapter.route) {
        navigating.current = true;
        navigate(chapter.route);
      }
      const probe = chapter.steps.find((s) => s.target && !s.before && !s.route);
      if (probe?.target) await waitForShown(probe.target, FIRST_WAIT_MS);
      if (!live) return;
      navigating.current = false;
      plan.current = planSteps(chapter.steps, env, (sel) => !!findShown(sel));
      const steps = plan.current;
      const at = latest.current.startAt;
      const start = at === 'last' ? steps.length - 1 : at ? Math.max(0, steps.findIndex((s) => s.id === at)) : 0;
      void go(start, at === 'last' ? -1 : 1);
    })();
    return () => { live = false; token.current += 1; };
    // Planning happens once per chapter run.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving the page the step lives on (Try it on a link, the system Back
  // gesture) ends the tour; progress so far is kept.
  useEffect(() => {
    if (!cur || navigating.current) return;
    if (pathname !== expectedRoute.current) latest.current.onExit();
  }, [pathname, cur]);

  const leave = useCallback(async (then: () => void) => {
    const step = cur ? cur.steps[cur.i] : null;
    try { await step?.after?.(ctx); } catch { /* ignore */ }
    then();
  }, [cur, ctx]);

  if (!cur) return null;
  const { steps } = cur;
  const step = steps[cur.i];
  if (!step) return null;
  const isLast = cur.i === steps.length - 1;

  return (
    <Spotlight
      chapter={chapter}
      step={step}
      target={cur.el}
      index={cur.i}
      total={steps.length}
      isLast={isLast}
      nextLabel={isLast ? p.nextLabel : 'Next'}
      reduced={p.reduced}
      paused={p.paused}
      fmt={p.fmt}
      code={p.code}
      haptic={() => p.haptic('select')}
      onNext={() => void leave(() => {
        if (isLast) p.onDone();
        else void go(cur.i + 1, 1);
      })}
      onBack={() => void leave(() => {
        if (cur.i === 0) p.onBackToIntro();
        else void go(cur.i - 1, -1);
      })}
      onSkipChapter={() => void leave(p.onSkipChapter)}
      onExit={() => void leave(p.onExit)}
    />
  );
}
