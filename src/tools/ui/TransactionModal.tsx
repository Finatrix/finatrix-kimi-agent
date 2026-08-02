import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Icon, type IconName } from './Icon';
import { SECTION_LABEL, type CatKey } from '../lib/budget';
import { SECTION_COLOR } from '../lib/sectionColors';
import {
  PAYMENT_METHODS, etToday, genExpenseId, type ExpenseItem,
} from '../lib/expense';
import { evaluateFormula, formulaAmount } from '../lib/formula';
import { AmountInput } from './AmountInput';
import { useAskAi } from './AiAssistant';


export interface FlatCat { k: string; l: string; ic: IconName; section: CatKey }

interface Props {
  /** The transaction being edited, or null when adding a new one. */
  editing: ExpenseItem | null;
  cats: FlatCat[];
  sym: string;
  /** Default category key for a fresh entry. */
  defaultCat: string;
  /** Most-used category keys (ordered) for the one-tap "Recent" shortcut. */
  recentCats?: string[];
  onSave: (item: ExpenseItem) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (item: ExpenseItem) => void;
}

interface Draft {
  amount: string;
  category: string;
  date: string;
  merchant: string;
  note: string;
  paymentMethod: string;
  tags: string;
  recurring: boolean;
  notes: string;
}

const emptyDraft = (defaultCat: string): Draft => ({
  amount: '', category: defaultCat, date: etToday(), merchant: '', note: '',
  paymentMethod: '', tags: '', recurring: false, notes: '',
});

function draftFromItem(it: ExpenseItem): Draft {
  return {
    amount: String(it.amount ?? ''),
    category: it.category,
    date: it.date || etToday(),
    merchant: it.merchant ?? '',
    note: it.note ?? '',
    paymentMethod: it.paymentMethod ?? '',
    tags: (it.tags ?? []).join(', '),
    recurring: !!it.recurring,
    notes: it.notes ?? '',
  };
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Premium, fully accessible add/edit sheet for a transaction.
 *
 * Interaction: opens as a centred dialog on desktop and a bottom sheet on
 * mobile, autofocuses the amount, traps focus, closes on Escape or backdrop
 * click, and saves on Cmd/Ctrl+Enter. Validation is inline and non-blocking.
 * Honours `prefers-reduced-motion`. Editing preserves the transaction id so no
 * duplicate record is ever created.
 *
 * The parent mounts this only while open (with a `key` per target), so the
 * draft is initialised once from props — no state-sync effect required.
 */
export default function TransactionModal({
  editing, cats, sym, defaultCat, recentCats = [], onSave, onClose, onDelete, onDuplicate,
}: Props) {
  const isEdit = !!editing;
  const [draft, setDraft] = useState<Draft>(() => (editing ? draftFromItem(editing) : emptyDraft(defaultCat)));
  const [errors, setErrors] = useState<{ amount?: string; category?: string; date?: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  // The mobile route to "ask about this transaction": below 560px the row's
  // action group is hidden and tapping a row opens this modal, so without an
  // entry here the feature would be desktop-only.
  const ai = useAskAi();
  const askAi = editing && ai?.enabled
    ? () => {
        // Close first. Two stacked modals trap focus in the wrong one, and the
        // assistant reads the stored transaction — not this unsaved draft — so
        // leaving the form open would show figures the answer is not about.
        onClose();
        ai.open({
          kind: 'transaction',
          id: editing.id,
          // Same fallback chain the row itself uses, so the subject line reads
          // the same whichever way the user got here — and a row with neither
          // merchant nor note is named by its category rather than "this
          // transaction".
          label: editing.merchant || editing.note
            || cats.find((c) => c.k === editing.category)?.l
            || 'this transaction',
        });
      }
    : null;

  const validate = useCallback((d: Draft) => {
    const e: typeof errors = {};
    // The amount field accepts arithmetic ("120/4"), so it is parsed rather than
    // cast; a malformed formula reports its own reason instead of collapsing
    // into the generic "greater than 0" message.
    const parsed = evaluateFormula(d.amount);
    if (!d.amount.trim()) e.amount = 'Enter an amount greater than 0.';
    else if (!parsed.ok) e.amount = parsed.error;
    else if (parsed.value <= 0) e.amount = 'Enter an amount greater than 0.';
    if (!d.category) e.category = 'Choose a category.';
    if (!d.date) e.date = 'Pick a date.';
    return e;
  }, []);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setDraft((prev) => {
      const next = { ...prev, [k]: v };
      if (submitted) setErrors(validate(next));
      return next;
    });

  const buildItem = useCallback((): ExpenseItem => {
    const tags = draft.tags.split(',').map((t) => t.trim()).filter(Boolean);
    const nowIso = new Date().toISOString();
    const created = editing?.createdAt ?? nowIso;
    const editCount = editing ? (editing.editCount ?? 0) + 1 : 0;
    return {
      id: editing ? editing.id : genExpenseId(),
      amount: formulaAmount(draft.amount),
      category: draft.category,
      date: draft.date,
      ...(draft.note.trim() ? { note: draft.note.trim() } : {}),
      ...(draft.merchant.trim() ? { merchant: draft.merchant.trim() } : {}),
      ...(draft.paymentMethod ? { paymentMethod: draft.paymentMethod } : {}),
      ...(tags.length ? { tags } : {}),
      ...(draft.recurring ? { recurring: true } : {}),
      ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
      createdAt: created,
      updatedAt: nowIso,
      ...(editCount > 0 ? { editCount } : {}),
    };
  }, [draft, editing]);

  const submit = useCallback(() => {
    setSubmitted(true);
    const e = validate(draft);
    setErrors(e);
    if (Object.keys(e).length > 0) {
      // Move focus to the first offending field for keyboard/AT users.
      if (e.amount) amountRef.current?.focus();
      return;
    }
    onSave(buildItem());
  }, [draft, validate, onSave, buildItem]);

  // Body scroll lock — reference-counted, safe under overlapping overlays.
  // The parent mounts this component only while the modal is open.
  useBodyScrollLock(true);

  // Focus management: remember the opener, autofocus the amount once, restore
  // focus on close. Mount-only — this must never re-run while the user types.
  useEffect(() => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => amountRef.current?.focus(), 40);
    return () => {
      clearTimeout(t);
      lastFocused.current?.focus?.();
    };
  }, []);

  // Escape / Cmd+Enter / focus trap. Kept separate from the focus effect:
  // `submit` changes identity on every draft keystroke, and when these lived
  // in one effect each keystroke re-ran the autofocus timer, stealing focus
  // from whichever field was being typed in.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.preventDefault();
        if (confirmDel) { setConfirmDel(false); return; }
        onClose();
        return;
      }
      if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') {
        ev.preventDefault();
        submit();
        return;
      }
      if (ev.key === 'Tab') {
        const nodes = cardRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (!nodes || nodes.length === 0) return;
        const list = Array.from(nodes).filter((n) => n.offsetParent !== null || n === document.activeElement);
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement as HTMLElement;
        if (ev.shiftKey && active === first) { ev.preventDefault(); last.focus(); }
        else if (!ev.shiftKey && active === last) { ev.preventDefault(); first.focus(); }
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose, submit, confirmDel]);

  const grouped = useMemo(() => {
    const g: Record<CatKey, FlatCat[]> = { needs: [], wants: [], save: [] };
    cats.forEach((c) => g[c.section].push(c));
    return g;
  }, [cats]);

  // Resolve the frequent-category keys to real categories, in rank order. Only
  // surfaced when there are enough categories that scanning the full grid is
  // slow — keeps the common case one tap without lengthening short lists.
  const recent = useMemo(() => {
    if (cats.length <= 6) return [];
    const byKey = new Map(cats.map((c) => [c.k, c]));
    return recentCats.map((k) => byKey.get(k)).filter((c): c is FlatCat => !!c).slice(0, 5);
  }, [cats, recentCats]);

  const err = (k: keyof typeof errors) => submitted && errors[k];

  // Portaled to <body> so no ancestor transform/filter (page-enter animations,
  // scroll reveals) can ever hijack the fixed overlay's containing block. The
  // .fx-tools wrapper re-establishes the tools' scoped styles and variables.
  return createPortal(
    <div className="fx-tools fx-scope">
    <div
      className="fx-tx-overlay"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <style>{`
        .fx-tx-overlay{position:fixed;inset:0;z-index:var(--z-modal);display:flex;align-items:center;justify-content:center;
          padding:20px;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
          animation:fxTxFade .2s ease both;}
        .fx-tx-card{position:relative;width:100%;max-width:560px;max-height:min(92vh,860px);overflow-y:auto;
          background:var(--card-solid,var(--card));border:1px solid var(--hair2);border-radius:22px;
          padding:22px 22px 18px;box-shadow:0 40px 90px -30px rgba(0,0,0,.7);
          animation:fxTxIn .32s cubic-bezier(.34,1.3,.5,1) both;}
        @keyframes fxTxFade{from{opacity:0}to{opacity:1}}
        @keyframes fxTxIn{from{opacity:0;transform:translateY(18px) scale(.97)}to{opacity:1;transform:none}}
        @keyframes fxTxSheet{from{transform:translateY(100%)}to{transform:none}}
        .fx-tx-catbtn{display:flex;flex-direction:column;align-items:center;gap:3px;padding:9px 4px;border-radius:12px;
          border:1.5px solid var(--hair2);background:var(--card);cursor:pointer;transition:border-color .15s,background .15s,transform .1s;}
        .fx-tx-catbtn:hover{border-color:var(--ink3);}
        .fx-tx-catbtn[aria-pressed="true"]{border-color:var(--ink);background:var(--hair);}
        .fx-tx-catbtn:active{transform:scale(.96);}
        .fx-tx-recent{display:inline-flex;align-items:center;gap:6px;max-width:150px;padding:7px 12px;border-radius:980px;
          border:1.5px solid var(--hair2);background:var(--card);color:var(--ink);cursor:pointer;font-size:12px;font-weight:600;
          font-family:inherit;transition:border-color .15s,background .15s;}
        .fx-tx-recent:hover{border-color:var(--ink3);}
        .fx-tx-recent[aria-pressed="true"]{border-color:var(--ink);background:var(--hair);}
        .fx-tx-err{color:var(--red);font-size:11.5px;margin-top:5px;font-weight:600;}
        .fx-tx-footer{position:sticky;bottom:0;z-index:2;background:var(--card-solid,var(--card));
          margin:0 -22px;padding:12px 22px 14px;border-top:1px solid var(--hair2);}
        .fx-tx-iconbtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:38px;padding:0 14px;
          border-radius:10px;border:1px solid var(--hair2);background:var(--fill-03);color:var(--ink);
          font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;transition:background .15s,border-color .15s;}
        .fx-tx-iconbtn:hover{background:var(--fill-06);}
        .fx-tx-danger{color:var(--red);}
        .fx-tx-danger:hover{border-color:var(--red);background:rgba(215,0,21,.08);}
        @media (max-width:560px){
          .fx-tx-overlay{padding:0;align-items:flex-end;}
          .fx-tx-card{max-width:none;max-height:94vh;border-radius:22px 22px 0 0;padding-bottom:calc(18px + env(safe-area-inset-bottom));
            animation:fxTxSheet .3s cubic-bezier(.34,1.2,.5,1) both;}
        }
        @media (prefers-reduced-motion:reduce){
          .fx-tx-overlay,.fx-tx-card{animation:none !important;}
        }
      `}</style>

      <div
        ref={cardRef}
        className="fx-tx-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
          <div>
            <h2 id={titleId} style={{ fontSize: 17, fontWeight: 700, margin: 0, letterSpacing: '-.01em' }}>
              {isEdit ? 'Edit transaction' : 'Add a transaction'}
            </h2>
            <p id={descId} className="note" style={{ margin: '4px 0 0' }}>
              {isEdit ? 'Your dashboard updates the moment you save.' : 'Log a spend — totals update instantly.'}
            </p>
          </div>
          <button type="button" className="fx-tx-iconbtn" onClick={onClose} aria-label="Close" style={{ width: 38, padding: 0 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        <form
          onSubmit={(e) => { e.preventDefault(); submit(); }}
          noValidate
        >
          <div className="grid2">
            <div className="fg" style={{ marginBottom: 10 }}>
              <label className="fl" htmlFor="tx-amount">Amount ({sym})</label>
              {/* Accepts arithmetic as well as a number, with a live preview of
                  what will be saved. See ui/AmountInput.tsx. */}
              <AmountInput
                id="tx-amount"
                inputRef={amountRef}
                sym={sym}
                value={draft.amount}
                onChange={(v) => set('amount', v)}
                invalid={!!err('amount')}
                errorId={err('amount') ? 'tx-amount-err' : undefined}
              />
              {err('amount') && <div className="fx-tx-err" id="tx-amount-err" role="alert">{errors.amount}</div>}
            </div>
            <div className="fg" style={{ marginBottom: 10 }}>
              <label className="fl" htmlFor="tx-date">Date</label>
              <input
                className="fi"
                id="tx-date"
                type="date"
                value={draft.date}
                onChange={(e) => set('date', e.target.value)}
                aria-invalid={!!err('date')}
                aria-describedby={err('date') ? 'tx-date-err' : undefined}
              />
              {err('date') && <div className="fx-tx-err" id="tx-date-err" role="alert">{errors.date}</div>}
            </div>
          </div>

          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
            <legend className="fl" style={{ padding: 0 }}>Category</legend>
            {recent.length >= 2 && (
              <div style={{ marginBottom: 10 }}>
                <div className="note" style={{ fontWeight: 700, marginBottom: 6 }}>Recent</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {recent.map((c) => (
                    <button
                      key={`recent-${c.k}`}
                      type="button"
                      className="fx-tx-recent"
                      aria-pressed={draft.category === c.k}
                      aria-label={`${c.l} (recent)`}
                      onClick={() => set('category', c.k)}
                    >
                      <Icon name={c.ic} size={14} style={{ color: SECTION_COLOR[c.section] }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.l}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {cats.length === 0 ? (
              <div className="note">Add categories in Budget Builder to start tracking.</div>
            ) : (
              (['needs', 'wants', 'save'] as CatKey[]).map((sec) =>
                grouped[sec].length === 0 ? null : (
                  <div key={sec} style={{ marginBottom: 8 }}>
                    <div className="note" style={{ fontWeight: 700, color: SECTION_COLOR[sec], marginBottom: 6 }}>
                      {SECTION_LABEL[sec]}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(88px, 1fr))', gap: 7 }}>
                      {grouped[sec].map((c) => (
                        <button
                          key={c.k}
                          type="button"
                          className="fx-tx-catbtn"
                          aria-pressed={draft.category === c.k}
                          aria-label={`${c.l} (${SECTION_LABEL[sec]})`}
                          onClick={() => set('category', c.k)}
                        >
                          <Icon name={c.ic} size={17} style={{ color: SECTION_COLOR[sec] }} />
                          <span style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>{c.l}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )
              )
            )}
            {err('category') && <div className="fx-tx-err" role="alert">{errors.category}</div>}
          </fieldset>

          <div className="grid2">
            <div className="fg" style={{ marginBottom: 10 }}>
              <label className="fl" htmlFor="tx-merchant">Merchant</label>
              <input className="fi" id="tx-merchant" type="text" placeholder="e.g. Blue Bottle" maxLength={80}
                value={draft.merchant} onChange={(e) => set('merchant', e.target.value)} />
            </div>
            <div className="fg" style={{ marginBottom: 10 }}>
              <label className="fl" htmlFor="tx-pay">Payment method</label>
              <select className="fs" id="tx-pay" value={draft.paymentMethod} onChange={(e) => set('paymentMethod', e.target.value)}>
                <option value="">Not set</option>
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div className="fg" style={{ marginBottom: 10 }}>
            <label className="fl" htmlFor="tx-note">Description</label>
            <input className="fi" id="tx-note" type="text" placeholder="What was it for?" maxLength={80}
              value={draft.note} onChange={(e) => set('note', e.target.value)} />
          </div>

          <div className="fg" style={{ marginBottom: 10 }}>
            <label className="fl" htmlFor="tx-tags">Tags</label>
            <input className="fi" id="tx-tags" type="text" placeholder="Comma separated, e.g. work, reimbursable"
              value={draft.tags} onChange={(e) => set('tags', e.target.value)} />
          </div>

          <div className="fg" style={{ marginBottom: 10 }}>
            <label className="fl" htmlFor="tx-notes">Notes</label>
            <textarea className="fi" id="tx-notes" rows={2} placeholder="Anything else worth remembering…"
              style={{ resize: 'vertical', minHeight: 44 }}
              value={draft.notes} onChange={(e) => set('notes', e.target.value)} />
          </div>

          <label className="fx-checkrow" style={{ padding: '6px 0 14px' }}>
            <input type="checkbox" className="fx-check" checked={draft.recurring}
              onChange={(e) => set('recurring', e.target.checked)} />
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600 }}>
              <Icon name="refresh" size={15} style={{ color: 'var(--ink2)' }} />
              Recurring transaction
            </span>
          </label>

          {isEdit && (editing?.createdAt || editing?.updatedAt) && (
            <div className="note" style={{ marginBottom: 10, paddingTop: 10, borderTop: '1px solid var(--hair2)', display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>
              {editing?.createdAt && <span>Added {fmtStamp(editing.createdAt)}</span>}
              {editing?.editCount ? <span>Edited {editing.editCount}×</span> : null}
              {editing?.updatedAt && editing.updatedAt !== editing.createdAt && <span>Last modified {fmtStamp(editing.updatedAt)}</span>}
            </div>
          )}

          {/* Actions — sticky so the primary action stays visible while the
              long form scrolls within the card. */}
          <div className="fx-tx-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {isEdit && (
                <>
                  {askAi && (
                    <button type="button" className="fx-tx-iconbtn" onClick={askAi}>
                      <Icon name="sparkle" size={14} style={{ color: 'var(--gold)' }} /> Ask AI
                    </button>
                  )}
                  <button type="button" className="fx-tx-iconbtn" onClick={() => onDuplicate?.(editing!)}>
                    <CopyIcon /> Duplicate
                  </button>
                  <button type="button" className="fx-tx-iconbtn fx-tx-danger" onClick={() => setConfirmDel(true)}>
                    <TrashIcon /> Delete
                  </button>
                </>
              )}
              <div style={{ flex: 1 }} />
              <button type="button" className="fx-tx-iconbtn" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-sm" style={{ width: 'auto', minWidth: 120 }}>
                {isEdit ? 'Save changes' : 'Add transaction'}
              </button>
            </div>
            <p className="note" style={{ margin: '8px 0 0', textAlign: 'right' }}>
              Tip: press <kbd>{navigatorMeta()}</kbd> + <kbd>Enter</kbd> to save, <kbd>Esc</kbd> to close.
            </p>
          </div>
        </form>

        {/* Delete confirmation (the only confirmation in the flow).
            position:fixed, not absolute — an absolute inset-0 overlay in a
            scrollable card anchors to the TOP of the scroll content, so it
            rendered off-screen whenever the card was scrolled down (which is
            the norm: Delete lives in the sticky footer). The modal is portaled
            to <body>, so fixed reliably covers the viewport. */}
        {confirmDel && (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 10, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="tx-del-title"
          >
            <div className="card" style={{ maxWidth: 360, margin: 0, textAlign: 'center' }}>
              <div id="tx-del-title" style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Delete this transaction?</div>
              <p className="note" style={{ marginBottom: 16 }}>You can undo this for a few seconds afterwards.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button type="button" className="fx-tx-iconbtn" onClick={() => setConfirmDel(false)} autoFocus>Cancel</button>
                <button
                  type="button"
                  className="btn btn-sm"
                  style={{ width: 'auto', minWidth: 100, background: 'var(--red)', color: '#fff', boxShadow: 'none' }}
                  onClick={() => { setConfirmDel(false); onDelete?.(editing!.id); }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </div>,
    document.body
  );
}

function fmtStamp(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) +
    ', ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function navigatorMeta(): string {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || '')) return '⌘';
  return 'Ctrl';
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  );
}
function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    </svg>
  );
}
