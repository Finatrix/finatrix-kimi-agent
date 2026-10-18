import { useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { BrandLogo } from '../components/BrandLogo';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';
import { useDialogFocus } from '../hooks/useDialogFocus';
import { Icon } from '../tools/ui/Icon';
import { chapterProgress, isOptedOut, loadProgress, resetProgress, setOptOut, stepKey } from './progress';
import type { TourChapter } from './types';
import '../walkthrough/walkthrough.css';
import './tour.css';

/**
 * "Full tutorial" — every chapter, how much of it this device has seen, and a
 * feature checklist that says plainly what has not been tried yet.
 *
 * Same film language as the intro (its root, ambient light and type), so
 * opening the hub feels like opening the tour, not a settings screen.
 */
export default function TourHub({ chapters, reduced, paused, onClose, onStartFull, onStartChapter }: {
  chapters: readonly TourChapter[];
  reduced: boolean;
  paused: boolean;
  onClose: () => void;
  onStartFull: (from?: string) => void;
  onStartChapter: (id: string, step?: string) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<'chapters' | 'checklist'>('chapters');
  const [progress, setProgress] = useState(loadProgress);
  const [offerOn, setOfferOn] = useState(() => !isOptedOut());
  const [status, setStatus] = useState('');

  useBodyScrollLock(true);
  useDialogFocus({ containerRef: rootRef, open: true, initialFocusRef: primaryRef });

  const stats = useMemo(() => {
    const per = chapters.map((c) => ({ c, ...chapterProgress(progress, c.id, c.steps.map((s) => s.id)) }));
    const seen = per.reduce((n, x) => n + x.seen, 0);
    const total = per.reduce((n, x) => n + x.total, 0);
    const minutes = chapters.reduce((n, c) => n + c.minutes, 0);
    const firstOpen = per.find((x) => !x.done)?.c.id;
    return { per, seen, total, minutes, firstOpen, pct: total ? Math.round((seen / total) * 100) : 0 };
  }, [chapters, progress]);

  const started = stats.seen > 0;
  const allDone = stats.per.every((x) => x.done);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const R = 44;
  const title = 'Learn FinatriX, one tool at a time.';
  const words = title.split(' ');

  return createPortal(
    <div
      ref={rootRef}
      className="fx-tools fx-scope wt-root tour-hub"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-hub-title"
      data-reduced={reduced ? '' : undefined}
      data-paused={paused ? '' : undefined}
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

      <header className="wt-top">
        <div className="wt-brand" aria-hidden="true">
          <BrandLogo size={24} />
          <span>Finatri<span className="wt-x">X</span></span>
        </div>
        <button type="button" className="wt-skip" onClick={onClose}>Close</button>
      </header>

      <div className="tour-hub-scroll">
        <div className="tour-hub-inner">
          <section className="tour-hub-hero">
            <div>
              <p className="wt-eyebrow wt-up" style={{ ['--d' as string]: 60 } as CSSProperties}>Full tutorial</p>
              <h2 className="wt-title" id="tour-hub-title">
                <span className="wt-sr-only">{title}</span>
                <span aria-hidden="true">
                  {words.map((w, i) => (
                    <span key={i}>
                      {i > 0 && ' '}
                      <span className="wt-word"><span style={{ ['--d' as string]: 120 + i * 50 } as CSSProperties}>{w}</span></span>
                    </span>
                  ))}
                </span>
              </h2>
              <p className="wt-lede wt-up" style={{ ['--d' as string]: 420 } as CSSProperties}>
                Each chapter opens with a short scene of what the tool is for, then points at the real controls on the real page. About {stats.minutes} minutes for everything, and you can stop at any point.
              </p>
              <div className="tour-hub-actions wt-up" style={{ ['--d' as string]: 520 } as CSSProperties}>
                <button
                  ref={primaryRef}
                  type="button"
                  className="tour-btn tour-primary"
                  onClick={() => onStartFull(started && !allDone ? stats.firstOpen : undefined)}
                >
                  {started && !allDone ? 'Continue the tour' : 'Start the full tour'}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
                {started && !allDone && (
                  <button type="button" className="tour-btn tour-ghost" onClick={() => onStartFull()}>Start from the beginning</button>
                )}
              </div>
            </div>
            <div className="tour-hub-dial" role="img" aria-label={`${stats.pct}% explored: ${stats.seen} of ${stats.total} features seen`}>
              <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
                <circle cx="50" cy="50" r={R} className="tour-dial-track" />
                {stats.seen > 0 && (
                  <circle
                    cx="50" cy="50" r={R}
                    className="tour-dial-arc"
                    pathLength={1}
                    strokeDasharray={`${stats.seen / Math.max(1, stats.total)} 1`}
                  />
                )}
              </svg>
              <div className="tour-hub-dial-num" aria-hidden="true">
                <div><b>{stats.pct}%</b><span>explored</span></div>
              </div>
            </div>
          </section>

          <div className="tour-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={tab === 'chapters'} onClick={() => setTab('chapters')}>Chapters</button>
            <button type="button" aria-pressed={tab === 'checklist'} onClick={() => setTab('checklist')}>Feature checklist</button>
          </div>

          {tab === 'chapters' ? (
            <ul className="tour-chapters" aria-label="Chapters">
              {stats.per.map(({ c, seen, total, done }, i) => {
                const state = done ? 'Done' : seen > 0 ? `${seen} of ${total} seen` : 'Not started';
                return (
                  <li key={c.id} style={{ ['--d' as string]: 140 + i * 70 } as CSSProperties}>
                    <button
                      type="button"
                      className="tour-chapter"
                      onClick={() => onStartChapter(c.id)}
                      aria-label={`Tour ${c.title}. ${c.tagline} About ${c.minutes} minute${c.minutes === 1 ? '' : 's'}, ${total} steps. ${state}.`}
                    >
                      <span className="tour-chapter-top">
                        <span className="tour-chapter-ic" aria-hidden="true"><Icon name={c.icon} size={18} /></span>
                        <span className="tour-chapter-title">{c.title}</span>
                      </span>
                      <span className="tour-chapter-tag">{c.tagline}</span>
                      <span className="tour-chapter-bar" aria-hidden="true">
                        <span style={{ width: `${total ? (seen / total) * 100 : 0}%`, ['--d' as string]: 140 + i * 70 } as CSSProperties} />
                      </span>
                      <span className="tour-chapter-meta">
                        <span>~{c.minutes} min · {total} steps</span>
                        <span className={`tour-chapter-state${done ? ' is-done' : ''}`}>{state}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="tour-check">
              <p className="wt-lede" style={{ margin: 0 }}>
                Everything the tour covers, and what this device has already been shown. Pick anything unticked to see just that.
              </p>
              {stats.per.map(({ c, seen, total }, i) => (
                <section key={c.id} aria-labelledby={`tour-check-${c.id}`} style={{ ['--d' as string]: 60 + i * 60 } as CSSProperties}>
                  <h3 id={`tour-check-${c.id}`}>{c.title}<span>{seen} of {total}</span></h3>
                  <ul>
                    {c.steps.map((s) => {
                      const isSeen = progress.seen[stepKey(c.id, s.id)] != null;
                      return (
                        <li key={s.id} className={isSeen ? 'is-seen' : undefined}>
                          <span className="tour-check-mark" aria-hidden="true">
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                          </span>
                          <span className="tour-check-label">
                            {s.title}
                            <span className="tour-sr">{isSeen ? ' (seen)' : ' (not seen yet)'}</span>
                          </span>
                          <button
                            type="button"
                            className="tour-link"
                            onClick={() => onStartChapter(c.id, s.id)}
                            aria-label={`Show me: ${s.title}, in ${c.title}`}
                          >
                            {isSeen ? 'Again' : 'Show me'}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
              <div className="tour-check-foot">
                <label className="tour-switch-row">
                  <button
                    type="button"
                    role="switch"
                    className="tour-switch"
                    aria-checked={offerOn}
                    onClick={() => {
                      const next = !offerOn;
                      setOptOut(!next);
                      setOfferOn(next);
                      setStatus(next ? 'The dashboard may offer the tour again.' : 'The tour will not be offered again.');
                    }}
                  />
                  <span>Offer the tour on the dashboard</span>
                </label>
                <button
                  type="button"
                  className="tour-link"
                  onClick={() => {
                    resetProgress();
                    setProgress(loadProgress());
                    setStatus('Tour progress cleared on this device.');
                  }}
                >
                  Reset tour progress
                </button>
              </div>
            </div>
          )}
          <p className="tour-sr" role="status">{status}</p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
