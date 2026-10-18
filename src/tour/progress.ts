/**
 * What the tour remembers, all of it LOCAL-ONLY (registered in
 * tools/lib/settings.ts LOCAL_ONLY_KEYS, so "Reset all data" clears it and
 * cloud sync never carries it — a tour you took on your phone says nothing
 * about what you have seen on your laptop).
 *
 * Every read tolerates missing, blocked or corrupt storage and every write is
 * best-effort: the worst a storage failure can do is show the offer again.
 * Pure apart from the default storage accessors, so tests pass their own.
 */

/** JSON: which steps and chapters this device has seen. */
export const TOUR_PROGRESS_KEY = 'fx_tour_progress';
/** "1" — the person chose "Don't remind me again". */
export const TOUR_OPTOUT_KEY = 'fx_tour_optout';
/** JSON: the automatic offer's snooze state. */
export const TOUR_OFFER_KEY = 'fx_tour_offer';
/** Test-only opt-in: lets vitest / Playwright see the automatic offer on purpose. */
export const TOUR_TEST_OPT_IN_KEY = 'fx_tour_test';

/** Every user-data key the tour writes (what a reset must clear). */
export const TOUR_LOCAL_KEYS = [TOUR_PROGRESS_KEY, TOUR_OPTOUT_KEY, TOUR_OFFER_KEY] as const;

export interface TourProgress {
  v: 1;
  /** `${chapterId}.${stepId}` → when it was first shown (ms). */
  seen: Record<string, number>;
  /** chapterId → when it was last completed (ms). */
  done: Record<string, number>;
  /** First time any tour was started. Also stops the automatic offer. */
  startedAt?: number;
  /** The full tour reached its end. */
  finishedAt?: number;
  /** Where the person last was, for "Continue the tour". */
  last?: { chapter: string; step: string };
}

export interface OfferState {
  /** How many times the offer has been shown. */
  shown: number;
  /** How many times "Maybe later" (or a dismissal) was chosen. */
  snoozes: number;
  /** Not before this time (ms). */
  nextAt: number;
  /** "Yes, show me" — never offer again. */
  accepted?: boolean;
}

export interface Storage {
  read: (key: string) => string | null;
  write: (key: string, value: string) => void;
  remove: (key: string) => void;
}

export const browserStorage: Storage = {
  read: (key) => {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  write: (key, value) => {
    try { window.localStorage.setItem(key, value); } catch { /* blocked storage */ }
  },
  remove: (key) => {
    try { window.localStorage.removeItem(key); } catch { /* blocked storage */ }
  },
};

const EMPTY: TourProgress = { v: 1, seen: {}, done: {} };

function isRecordOfNumbers(value: unknown): value is Record<string, number> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.values(value as Record<string, unknown>).every((n) => typeof n === 'number' && Number.isFinite(n));
}

/** The stored progress, or an empty record when there is none or it is unreadable. */
export function loadProgress(s: Storage = browserStorage): TourProgress {
  try {
    const raw = s.read(TOUR_PROGRESS_KEY);
    if (!raw) return { ...EMPTY, seen: {}, done: {} };
    const p = JSON.parse(raw) as Partial<TourProgress>;
    return {
      v: 1,
      seen: isRecordOfNumbers(p.seen) ? { ...p.seen } : {},
      done: isRecordOfNumbers(p.done) ? { ...p.done } : {},
      startedAt: typeof p.startedAt === 'number' ? p.startedAt : undefined,
      finishedAt: typeof p.finishedAt === 'number' ? p.finishedAt : undefined,
      last: p.last && typeof p.last.chapter === 'string' && typeof p.last.step === 'string'
        ? { chapter: p.last.chapter, step: p.last.step } : undefined,
    };
  } catch {
    return { ...EMPTY, seen: {}, done: {} };
  }
}

export function saveProgress(p: TourProgress, s: Storage = browserStorage): void {
  try { s.write(TOUR_PROGRESS_KEY, JSON.stringify(p)); } catch { /* best effort */ }
}

export const stepKey = (chapter: string, step: string) => `${chapter}.${step}`;

/** Record that a tour started (first time only). */
export function markStarted(now: number, s: Storage = browserStorage): TourProgress {
  const p = loadProgress(s);
  if (p.startedAt == null) p.startedAt = now;
  saveProgress(p, s);
  return p;
}

/** Record a step as shown, and as the place to continue from. */
export function markSeen(chapter: string, step: string, now: number, s: Storage = browserStorage): TourProgress {
  const p = loadProgress(s);
  const k = stepKey(chapter, step);
  if (p.seen[k] == null) p.seen[k] = now;
  if (p.startedAt == null) p.startedAt = now;
  p.last = { chapter, step };
  saveProgress(p, s);
  return p;
}

export function markChapterDone(chapter: string, now: number, s: Storage = browserStorage): TourProgress {
  const p = loadProgress(s);
  p.done[chapter] = now;
  saveProgress(p, s);
  return p;
}

export function markFinished(now: number, s: Storage = browserStorage): TourProgress {
  const p = loadProgress(s);
  p.finishedAt = now;
  saveProgress(p, s);
  return p;
}

/** Forget what has been seen (the hub's "Reset tour progress"). Leaves the opt-out alone. */
export function resetProgress(s: Storage = browserStorage): void {
  s.remove(TOUR_PROGRESS_KEY);
}

export interface ChapterProgress { seen: number; total: number; done: boolean }

/** How much of one chapter has been seen, by step ids. */
export function chapterProgress(p: TourProgress, chapter: string, stepIds: readonly string[]): ChapterProgress {
  const seen = stepIds.filter((id) => p.seen[stepKey(chapter, id)] != null).length;
  return { seen, total: stepIds.length, done: p.done[chapter] != null };
}

/* ── Opt-out and the offer ─────────────────────────────────────────── */

export function isOptedOut(s: Storage = browserStorage): boolean {
  return s.read(TOUR_OPTOUT_KEY) === '1';
}

export function setOptOut(on: boolean, s: Storage = browserStorage): void {
  if (on) s.write(TOUR_OPTOUT_KEY, '1');
  else s.remove(TOUR_OPTOUT_KEY);
}

export function loadOffer(s: Storage = browserStorage): OfferState {
  try {
    const raw = s.read(TOUR_OFFER_KEY);
    if (!raw) return { shown: 0, snoozes: 0, nextAt: 0 };
    const o = JSON.parse(raw) as Partial<OfferState>;
    const num = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);
    return { shown: num(o.shown), snoozes: num(o.snoozes), nextAt: num(o.nextAt), accepted: o.accepted === true || undefined };
  } catch {
    return { shown: 0, snoozes: 0, nextAt: 0 };
  }
}

function saveOffer(o: OfferState, s: Storage): void {
  try { s.write(TOUR_OFFER_KEY, JSON.stringify(o)); } catch { /* best effort */ }
}

/** How long "Maybe later" holds the offer back. */
export const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
/**
 * The first offer plus at most two re-offers: the third "Maybe later" is
 * taken as a quiet no (the hub stays one tap away in Settings and the shell).
 */
export const MAX_SNOOZES = 3;

export function recordOfferShown(s: Storage = browserStorage): void {
  const o = loadOffer(s);
  saveOffer({ ...o, shown: o.shown + 1 }, s);
}

/** "Maybe later" — or dismissing the card without choosing. */
export function snoozeOffer(now: number, s: Storage = browserStorage): OfferState {
  const o = loadOffer(s);
  const next = { ...o, snoozes: o.snoozes + 1, nextAt: now + SNOOZE_MS };
  saveOffer(next, s);
  return next;
}

/** "Yes, show me". */
export function acceptOffer(s: Storage = browserStorage): void {
  saveOffer({ ...loadOffer(s), accepted: true }, s);
}
