import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../context/AuthContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useCurrency } from '../CurrencyContext';
import { Icon } from './Icon';
import { Markdown } from './Markdown';
import { currentMonth } from '../lib/month';
import { getJSON } from '../lib/storage';
import { loadExpenses } from '../lib/expense';
import { loadCatView } from '../lib/budgetCats';
import { type BudgetStore } from '../lib/budget';
import { ask, askForMonthlyReview, type AskResult } from '../ai/assistant';
import { describeFocus, type AiFocus, type FocusDescription } from '../ai/focus';
import { track } from '../../lib/analytics';
import { SUGGESTED_PROMPTS, MAX_QUESTION_CHARS } from '../ai/prompts';
import {
  loadHistory, saveHistory, clearHistory, pruneOtherUsers, newMessageId,
  type ChatMessage,
} from '../ai/history';
import type { AiChart } from '../ai/validate';

/**
 * FinatriX AI — the conversation surface.
 *
 * Lazily imported: this module, the markdown renderer and the prompt/validation
 * layer are only fetched when someone actually opens the assistant, so the cost
 * of the feature is zero for everyone who does not use it.
 *
 * The data is read fresh on every question rather than captured at mount. The
 * panel stays open while the user logs a transaction behind it, and answering
 * from a stale snapshot would be confidently wrong — the one failure mode this
 * feature cannot afford.
 */

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

/** The review is a document, not a chat turn — it gets its own entry point. */
const REVIEW_PROMPT = 'Create a monthly review';

export interface AiPanelProps {
  id: string;
  onClose: () => void;
  /** What the user was looking at when they opened it; null for the plain FAB. */
  focus?: AiFocus | null;
  /**
   * Bumped by the provider on every open. Pressing a second ✨ button while the
   * panel is already open changes `focus` but not the mount, so the panel needs
   * a signal that a *new* open happened in order to re-prime its subject line.
   */
  openedAt?: number;
}

export default function AiPanel({ id, onClose, focus = null, openedAt = 0 }: AiPanelProps) {
  const { user, configured } = useAuth();
  const { code } = useCurrency();
  const uid = user?.id ?? '';

  // The subject the panel is pointed at. Tracked as state keyed on `openedAt`
  // so a fresh open re-primes it, while asking a question inside the panel does
  // not silently change what the header says the conversation is about.
  const [primedAt, setPrimedAt] = useState(-1);
  const [subject, setSubject] = useState<FocusDescription | null>(null);
  // Whether the subject's starting questions are still waiting to be offered.
  // An empty transcript shows them in the empty state; a returning user with
  // history would otherwise get a subject line and no questions, and be left to
  // type out "compare Groceries to previous months" by hand — which is the one
  // thing opening from a figure is supposed to save them from.
  const [primerOpen, setPrimerOpen] = useState(false);
  if (primedAt !== openedAt) {
    setPrimedAt(openedAt);
    const next = focus ? describeFocus(focus) : null;
    setSubject(next);
    setPrimerOpen(next !== null);
  }

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  // Which account `messages` was loaded for. Reconciled during render rather
  // than in an effect: an effect would paint one frame of the previous user's
  // conversation before replacing it, and that frame is somebody else's data.
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  if (loadedFor !== uid) {
    setLoadedFor(uid);
    setMessages(uid ? loadHistory(uid) : []);
  }

  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();

  useBodyScrollLock(true);

  // Drop every other account's transcript from this device. A storage write, so
  // it belongs in an effect; the load itself happens during render above.
  useEffect(() => {
    if (uid) pruneOtherUsers(uid);
  }, [uid]);

  // Focus the composer on open; hand focus back to the trigger on close.
  // A signed-out visitor has a disabled composer, which cannot take focus — so
  // focus falls to the dialog itself rather than being left on <body>, where a
  // screen reader would never enter the dialog at all.
  useEffect(() => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => {
      const input = inputRef.current;
      if (input && !input.disabled) input.focus();
      else cardRef.current?.focus();
    }, 40);
    return () => {
      clearTimeout(t);
      lastFocused.current?.focus?.();
    };
  }, []);

  // Escape closes; Tab is trapped inside the dialog.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        if (confirmClear) { setConfirmClear(false); return; }
        onClose();
        return;
      }
      if (ev.key !== 'Tab') return;
      const nodes = cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!nodes || nodes.length === 0) return;
      const list = Array.from(nodes).filter((n) => n.offsetParent !== null || n === document.activeElement);
      if (list.length === 0) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement;
      if (ev.shiftKey && active === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && active === last) { ev.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, confirmClear]);

  // Keep the newest turn in view as the conversation grows. `primerOpen` counts:
  // priming an existing conversation appends the new subject's questions, and
  // they are worthless sitting below the fold.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, busy, primerOpen]);

  const persist = useCallback((next: ChatMessage[]) => {
    setMessages(next);
    if (uid) saveHistory(uid, next);
  }, [uid]);

  /** Everything the snapshot needs, read at the moment the question is asked. */
  const readData = useCallback(() => ({
    items: loadExpenses(),
    cats: loadCatView().active,
    budgetStore: getJSON<BudgetStore>('fx_bb_data', {}),
    month: currentMonth(),
    currency: code,
    now: new Date(),
  }), [code]);

  const send = useCallback(async (question: string, kind: 'chat' | 'review' = 'chat') => {
    const text = question.trim();
    if (!text || busy) return;

    const asked: ChatMessage = {
      id: newMessageId(), role: 'user', text, at: new Date().toISOString(),
    };
    const withQuestion = [...messages, asked];
    persist(withQuestion);
    setDraft('');
    setBusy(true);
    // The questions have served their purpose; leaving them under the answer
    // would offer the user the same four prompts they just picked from.
    setPrimerOpen(false);

    // Only successful turns become context — replaying an error message would
    // teach the model that failures are part of the conversation.
    const history = withQuestion
      .filter((m) => !m.failed)
      .slice(-7, -1)
      .map((m) => ({ role: m.role, text: m.text }));

    let result: AskResult;
    try {
      const data = readData();
      result = kind === 'review'
        ? await askForMonthlyReview(data)
        : await ask({ ...data, question: text, history, focus });
    } catch {
      result = {
        ok: false,
        retryable: true,
        message: 'Something went wrong reaching FinatriX AI. Please try again.',
      };
    }

    const reply: ChatMessage = result.ok
      ? {
          id: newMessageId(), role: 'assistant', text: result.answer,
          at: new Date().toISOString(), model: result.model,
          chart: result.chart, followUps: result.followUps,
          // Stored with the turn, not recomputed on render: it describes the
          // evidence as it stood when the answer was given, and a transaction
          // logged afterwards must not silently upgrade an old answer's badge.
          confidence: result.confidence,
          ...(subject ? { focusTitle: subject.title } : {}),
        }
      : {
          id: newMessageId(), role: 'assistant', text: result.message,
          at: new Date().toISOString(), failed: true,
        };

    // One event per completed turn, carrying only the SHAPE of the exchange:
    // whether it was a chat question or a monthly review, what subject the
    // panel was focused on, and whether the model answered.
    //
    // `where` is `AiFocus['kind']` — 'budget', 'category', 'transaction' and so
    // on — which is an enum this codebase defines, never anything the user
    // typed. The focus object also carries labels and ids (a category name, a
    // transaction id); those are deliberately not read here, and would be
    // dropped by the prop allowlist even if they were.
    track('ai_message_sent', { kind, where: focus?.kind ?? 'none', ok: result.ok });

    persist([...withQuestion, reply]);
    setBusy(false);
    inputRef.current?.focus();
  }, [busy, messages, persist, readData, focus, subject]);

  const doClear = () => {
    if (uid) clearHistory(uid);
    setMessages([]);
    setConfirmClear(false);
    inputRef.current?.focus();
  };

  const signedOut = !uid;
  const canSend = !busy && !signedOut && draft.trim().length > 0;

  const body = (
    <div className="fx-tools fx-scope fx-ai-shell">
      <style>{PANEL_STYLES}</style>
      <div className="fx-ai-backdrop" onClick={onClose} aria-hidden="true" />

      <div
        className="fx-ai-card"
        ref={cardRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        id={id}
        tabIndex={-1}
      >
        <header className="fx-ai-head">
          <div className="fx-ai-title">
            {/* The same mark the launcher and every ✨ trigger use — the panel
                is the thing they open, so a different glyph here read as a
                different feature. */}
            <span className="fx-ai-mark" aria-hidden="true">
              <Icon name="sparkle" size={15} />
            </span>
            {/* When the panel was opened from a figure, the subject line names
                that figure — the user should never have to re-describe what
                they were just looking at. */}
            <div>
              <h2 id={titleId}>{subject ? subject.title : 'FinatriX AI'}</h2>
              <p>{subject ? subject.subtitle : 'Answers from your own budget and spending'}</p>
            </div>
          </div>
          <div className="fx-ai-headbtns">
            {messages.length > 0 && !confirmClear && (
              <button type="button" className="fx-ai-ghost" onClick={() => setConfirmClear(true)}>
                Clear
              </button>
            )}
            {confirmClear && (
              <>
                <button type="button" className="fx-ai-ghost danger" onClick={doClear}>
                  Delete history
                </button>
                <button type="button" className="fx-ai-ghost" onClick={() => setConfirmClear(false)}>
                  Keep
                </button>
              </>
            )}
            <button type="button" className="fx-ai-ghost" onClick={onClose} aria-label="Close FinatriX AI">
              {/* Inline rather than from the sprite: the icon set has no close
                  glyph, and adding one to a shared sprite for a single caller
                  costs every page that renders it. */}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>
        </header>

        <div className="fx-ai-log" ref={listRef} role="log" aria-live="polite" aria-label="Conversation">
          {messages.length === 0 && (
            <EmptyState
              signedOut={signedOut}
              configured={configured}
              subject={subject}
              onPick={(q) => void send(q)}
              onReview={() => void send(REVIEW_PROMPT, 'review')}
            />
          )}

          {messages.map((m) => (
            <Turn key={m.id} message={m} onFollowUp={(q) => void send(q)} busy={busy} />
          ))}

          {/* An existing conversation, newly pointed at something. The empty
              state already offers these when there is no transcript, so this
              covers the other case rather than duplicating it. */}
          {primerOpen && subject && messages.length > 0 && !busy && (
            <div className="fx-ai-primer">
              <p className="fx-ai-primer-head">
                <Icon name="sparkle" size={13} aria-hidden="true" />
                About {subject.title}
              </p>
              <div className="fx-ai-chips">
                {subject.prompts.map((p) => (
                  <button key={p} type="button" className="fx-ai-chip" onClick={() => void send(p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {busy && (
            <div className="fx-ai-turn assistant">
              <div className="fx-ai-bubble" role="status">
                <span className="fx-ai-dots" aria-hidden="true"><i /><i /><i /></span>
                Reading your figures…
              </div>
            </div>
          )}
        </div>

        <form
          className="fx-ai-composer"
          onSubmit={(e) => { e.preventDefault(); void send(draft); }}
        >
          <label className="fx-sr-only" htmlFor={`${id}-input`}>Ask FinatriX AI about your money</label>
          <textarea
            id={`${id}-input`}
            ref={inputRef}
            rows={1}
            maxLength={MAX_QUESTION_CHARS}
            placeholder={signedOut ? 'Sign in to ask about your money' : 'Ask about your budget or spending…'}
            value={draft}
            disabled={signedOut}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter sends, Shift+Enter is a newline — the convention every
              // chat surface uses, so nobody has to learn it here.
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send(draft);
              }
            }}
          />
          <button type="submit" className="fx-ai-send" disabled={!canSend} aria-label="Send question">
            <Icon name="arrow-up" size={17} />
          </button>
        </form>

        <p className="fx-ai-foot">
          Educational only, not financial advice. FinatriX AI reads the data in your own account and
          nothing else.
        </p>
      </div>
    </div>
  );

  // Portaled to <body>: a fixed overlay must never sit under an ancestor that
  // animates transform, which would become its containing block.
  return createPortal(body, document.body);
}

/* ── Pieces ── */

function EmptyState({ signedOut, configured, subject, onPick, onReview }: {
  signedOut: boolean;
  configured: boolean;
  /** Set when the panel was opened from a figure rather than from the FAB. */
  subject: FocusDescription | null;
  onPick: (q: string) => void;
  onReview: () => void;
}) {
  if (signedOut) {
    return (
      <div className="fx-ai-empty">
        <p className="fx-ai-lead">Sign in to use FinatriX AI.</p>
        <p className="note">
          {configured
            ? 'The assistant only ever reads the data in your own account, so it needs to know who you are.'
            : 'This build has no backend configured, so the assistant is unavailable here.'}
        </p>
      </div>
    );
  }
  // Opened from a figure: offer the questions worth asking about *that*, so the
  // user never has to work out how to phrase a question about a heatmap. The
  // generic prompts and the review would only bury them.
  const prompts = subject ? subject.prompts : SUGGESTED_PROMPTS;

  return (
    <div className="fx-ai-empty">
      <p className="fx-ai-lead">{subject ? 'What would you like to know?' : 'Ask anything about your money.'}</p>
      <p className="note">
        Every figure comes from what you have logged — if something is not in your data,
        FinatriX AI will say so rather than guess.
      </p>
      {!subject && (
        <button type="button" className="fx-ai-review" onClick={onReview}>
          <Icon name="pie" size={15} aria-hidden="true" />
          Create a monthly review
        </button>
      )}
      <div className="fx-ai-chips">
        {prompts.map((p) => (
          <button key={p} type="button" className="fx-ai-chip" onClick={() => onPick(p)}>
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}

function Turn({ message, onFollowUp, busy }: {
  message: ChatMessage;
  onFollowUp: (q: string) => void;
  busy: boolean;
}) {
  if (message.role === 'user') {
    return (
      <div className="fx-ai-turn user">
        <div className="fx-ai-bubble">{message.text}</div>
      </div>
    );
  }
  return (
    <div className="fx-ai-turn assistant">
      <div className={`fx-ai-bubble${message.failed ? ' is-bad' : ''}`}>
        {message.failed ? <p>{message.text}</p> : <Markdown text={message.text} />}
        {message.chart && <ChartBars chart={message.chart} />}
        {/* How much data the answer stood on. Measured from the snapshot before
            the model was called — never the model's own opinion of itself. The
            basis is spelled out because "Low confidence" without a reason is
            just a hedge. */}
        {message.confidence && (
          <p className={`fx-ai-conf is-${message.confidence.level}`}>
            <span>{message.confidence.label}</span> · {message.confidence.basis}
          </p>
        )}
      </div>
      {!!message.followUps?.length && (
        <div className="fx-ai-chips">
          {message.followUps.map((f) => (
            <button key={f} type="button" className="fx-ai-chip" disabled={busy} onClick={() => onFollowUp(f)}>
              {f}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The optional chart, drawn as labelled bars rather than on a canvas.
 *
 * A handful of comparable values does not need a charting library, and a DOM
 * bar list is readable by a screen reader, selectable, and printable — none of
 * which a `<canvas>` is. It also keeps Chart.js out of the lazy AI chunk.
 */
function ChartBars({ chart }: { chart: AiChart }) {
  const max = Math.max(...chart.points.map((p) => p.value), 1);
  const fmt = (v: number) =>
    chart.unit === 'percent' ? `${Math.round(v)}%` : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  return (
    <figure className="fx-ai-chart">
      {chart.title && <figcaption>{chart.title}</figcaption>}
      <dl>
        {chart.points.map((p) => (
          <div key={p.label} className="fx-ai-chart-row">
            <dt>{p.label}</dt>
            <dd>
              <span className="fx-ai-chart-bar" aria-hidden="true">
                <span style={{ width: `${(p.value / max) * 100}%` }} />
              </span>
              <span className="fx-ai-chart-v">{fmt(p.value)}</span>
            </dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}

const PANEL_STYLES = `
.fx-ai-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:var(--z-panel);
  animation:fxAiFade .2s ease both;backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);}
@keyframes fxAiFade{from{opacity:0}to{opacity:1}}
.fx-ai-card{position:fixed;z-index:calc(var(--z-panel) + 1);display:flex;flex-direction:column;
  background:var(--card-solid,#15151A);border:1px solid var(--hair);color:var(--ink);
  box-shadow:0 30px 80px -24px rgba(0,0,0,.75);animation:fxAiIn .26s cubic-bezier(.34,1.15,.5,1) both;}
@keyframes fxAiIn{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}

/* Mobile-first: a sheet that stops short of the status bar. */
.fx-ai-card{left:0;right:0;bottom:0;top:8vh;border-radius:18px 18px 0 0;}
@media(min-width:768px){
  .fx-ai-card{left:auto;right:20px;bottom:20px;top:auto;width:min(430px,calc(100vw - 40px));
    height:min(660px,calc(100dvh - 40px));border-radius:18px;}
}

.fx-ai-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;
  padding:14px 14px 12px 16px;border-bottom:1px solid var(--hair2);flex-shrink:0;}
.fx-ai-title{display:flex;align-items:center;gap:10px;min-width:0;}
.fx-ai-mark{width:28px;height:28px;border-radius:9px;display:flex;align-items:center;justify-content:center;
  background:var(--gold-bg);color:var(--gold);flex-shrink:0;}
.fx-ai-title h2{font-size:14.5px;font-weight:700;margin:0;letter-spacing:-.01em;}
.fx-ai-title p{font-size:11.5px;color:var(--ink3);margin:2px 0 0;}
.fx-ai-headbtns{display:flex;align-items:center;gap:4px;flex-shrink:0;}
.fx-ai-ghost{display:inline-flex;align-items:center;justify-content:center;gap:5px;min-height:30px;padding:5px 10px;
  border-radius:9px;border:1px solid transparent;background:transparent;color:var(--ink2);
  font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;transition:background .15s,color .15s;}
.fx-ai-ghost:hover{background:var(--fill-06);color:var(--ink);}
.fx-ai-ghost.danger{color:var(--red);}

.fx-ai-log{flex:1;overflow-y:auto;padding:14px 16px;display:flex;flex-direction:column;gap:12px;
  overscroll-behavior:contain;-webkit-overflow-scrolling:touch;}
.fx-ai-turn{display:flex;flex-direction:column;gap:8px;max-width:100%;}
.fx-ai-turn.user{align-items:flex-end;}
.fx-ai-bubble{max-width:92%;padding:10px 13px;border-radius:14px;font-size:13.5px;line-height:1.6;
  background:var(--well);border:1px solid var(--well-border);overflow-wrap:anywhere;}
.fx-ai-turn.user .fx-ai-bubble{background:var(--gold-bg);border-color:color-mix(in srgb,var(--gold) 28%,transparent);}
.fx-ai-bubble.is-bad{border-color:color-mix(in srgb,var(--red) 35%,transparent);color:var(--ink2);}
.fx-ai-bubble p{margin:0 0 8px;}
.fx-ai-bubble p:last-child{margin-bottom:0;}

.fx-ai-primer{border-top:1px dashed var(--hair2);padding-top:11px;margin-top:2px;}
.fx-ai-primer-head{display:flex;align-items:center;gap:6px;margin:0 0 8px;font-size:11px;font-weight:700;
  color:var(--ink2);text-transform:uppercase;letter-spacing:.04em;}
.fx-ai-primer-head svg{color:var(--gold);flex-shrink:0;}

.fx-ai-empty{padding:6px 0;}
.fx-ai-lead{font-size:15px;font-weight:700;margin:0 0 6px;}
.fx-ai-empty .note{margin-bottom:12px;line-height:1.55;}
.fx-ai-review{display:inline-flex;align-items:center;gap:7px;padding:9px 14px;margin-bottom:12px;border-radius:980px;
  border:1px solid #B8962E;background:var(--gold);color:#1a1400;font-size:12.5px;font-weight:600;
  font-family:inherit;cursor:pointer;transition:background .15s;}
.fx-ai-review:hover{background:#E0BC4B;}
.fx-ai-chips{display:flex;flex-wrap:wrap;gap:6px;}
.fx-ai-chip{padding:7px 12px;border-radius:980px;border:1px solid var(--hair2);background:var(--card);
  color:var(--ink2);font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;text-align:left;
  transition:background .15s,color .15s,border-color .15s;}
.fx-ai-chip:hover:not(:disabled){background:var(--fill-06);color:var(--ink);border-color:var(--hair);}
.fx-ai-chip:disabled{opacity:.5;cursor:default;}

.fx-ai-dots{display:inline-flex;gap:3px;margin-right:7px;vertical-align:middle;}
.fx-ai-dots i{width:5px;height:5px;border-radius:50%;background:var(--gold);display:block;
  animation:fxAiBlink 1.1s infinite ease-in-out both;}
.fx-ai-dots i:nth-child(2){animation-delay:.16s;}
.fx-ai-dots i:nth-child(3){animation-delay:.32s;}
@keyframes fxAiBlink{0%,80%,100%{opacity:.25}40%{opacity:1}}

.fx-ai-composer{display:flex;align-items:flex-end;gap:8px;padding:10px 12px;border-top:1px solid var(--hair2);flex-shrink:0;}
.fx-ai-composer textarea{flex:1;min-height:42px;max-height:140px;resize:none;padding:11px 13px;border-radius:12px;
  background:var(--fill-04);border:1px solid var(--fill-13);color:var(--ink);font-size:15px;font-family:inherit;
  line-height:1.45;outline:none;transition:border-color .2s,background .2s;}
.fx-ai-composer textarea:focus{border-color:var(--gold);background:var(--fill-06);}
.fx-ai-composer textarea:disabled{opacity:.6;cursor:not-allowed;}
.fx-ai-send{flex-shrink:0;width:42px;height:42px;border-radius:12px;border:1px solid #B8962E;background:var(--gold);
  color:#1a1400;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:background .15s,opacity .15s;}
.fx-ai-send:disabled{opacity:.4;cursor:default;}
.fx-ai-foot{font-size:10.5px;color:var(--ink3);margin:0;padding:0 16px 12px;line-height:1.5;flex-shrink:0;}
.fx-ai-shell .fx-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}

/* Markdown inside a bubble */
.fx-md h3{font-size:13.5px;font-weight:700;margin:12px 0 6px;letter-spacing:-.01em;}
.fx-md h4{font-size:12.5px;font-weight:700;margin:10px 0 5px;color:var(--ink2);}
.fx-md > :first-child{margin-top:0;}
.fx-md ul,.fx-md ol{margin:0 0 8px;padding-left:19px;}
.fx-md li{margin-bottom:4px;}
.fx-md code{font-family:'Geist Mono',ui-monospace,monospace;font-size:12px;background:var(--fill-06);
  padding:1px 5px;border-radius:5px;}
.fx-md blockquote{margin:0 0 8px;padding-left:10px;border-left:2px solid var(--hair);color:var(--ink2);}
.fx-md hr{border:none;border-top:1px solid var(--hair2);margin:10px 0;}
.fx-md-tablewrap{overflow-x:auto;margin:0 0 8px;}
.fx-md table{border-collapse:collapse;width:100%;font-size:12px;}
.fx-md th,.fx-md td{text-align:left;padding:6px 9px;border-bottom:1px solid var(--hair2);white-space:nowrap;}
.fx-md th{font-weight:700;color:var(--ink2);font-size:11px;text-transform:uppercase;letter-spacing:.03em;}
.fx-md td{font-variant-numeric:tabular-nums;}

/* Evidence badge under an answer */
.fx-ai-conf{margin:10px 0 0;padding-top:8px;border-top:1px solid var(--hair2);
  font-size:11px;line-height:1.5;color:var(--ink3);}
.fx-ai-conf > span{font-weight:700;}
.fx-ai-conf.is-high > span{color:var(--green);}
.fx-ai-conf.is-medium > span{color:var(--gold);}
.fx-ai-conf.is-low > span{color:var(--orange);}

/* Assistant-supplied chart */
.fx-ai-chart{margin:10px 0 0;}
.fx-ai-chart figcaption{font-size:11px;font-weight:700;color:var(--ink2);margin-bottom:7px;
  text-transform:uppercase;letter-spacing:.03em;}
.fx-ai-chart dl{margin:0;display:grid;gap:6px;}
.fx-ai-chart-row{display:grid;grid-template-columns:minmax(64px,34%) 1fr;gap:9px;align-items:center;}
.fx-ai-chart dt{font-size:11.5px;color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fx-ai-chart dd{margin:0;display:flex;align-items:center;gap:8px;min-width:0;}
.fx-ai-chart-bar{flex:1;height:7px;border-radius:5px;background:var(--fill-06);overflow:hidden;min-width:20px;}
.fx-ai-chart-bar > span{display:block;height:100%;border-radius:5px;background:var(--gold);}
.fx-ai-chart-v{font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums;flex-shrink:0;}

@media (prefers-reduced-motion:reduce){
  .fx-ai-card,.fx-ai-backdrop{animation:none;}
  .fx-ai-dots i{animation:none;opacity:.7;}
}
`;
