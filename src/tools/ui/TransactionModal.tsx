import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useInertOutside } from '../../hooks/useInertOutside';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Icon, type IconName } from './Icon';
import { SECTION_LABEL, type CatKey } from '../lib/budget';
import { SECTION_COLOR } from '../lib/sectionColors';
import {
  PAYMENT_METHODS, etToday, genExpenseId, type ExpenseItem,
} from '../lib/expense';
import {
  AUDIT_ACTION_LABEL, AUDIT_FIELD_LABEL, type AuditEntry, type AuditField, type AuditValue,
} from '../lib/expenseAudit';
import { evaluateFormula, formulaSignedAmount } from '../lib/formula';
import { AmountInput } from './AmountInput';
import { suggestExpenseCategory } from '../lib/quickAdd';
import { validRecordDate } from '../lib/recordReview';
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
  learned?: ReadonlyMap<string, string>;
  /**
   * Today, `YYYY-MM-DD`. Anything after it is scheduled rather than spent, and
   * the date field says so — the one thing the page's old inline form had that
   * this sheet did not.
   */
  todayKey?: string;
  /** Last date a spend may be scheduled for — the month nav's own horizon. */
  scheduleLimit?: string;
  onSave: (item: ExpenseItem) => void;
  onClose: () => void;
  onDelete?: (id: string) => void;
  onDuplicate?: (item: ExpenseItem) => void;
  /** This transaction's own change history, newest first. Empty when unknown. */
  history?: AuditEntry[];
  /** Formats an amount in the active currency, for the history's diffs. */
  cfmt?: (n: number) => string;
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
  editing, cats, sym, defaultCat, recentCats = [], learned, todayKey, scheduleLimit,
  onSave, onClose, onDelete, onDuplicate, history = [], cfmt,
}: Props) {
  const isEdit = !!editing;
  const [draft, setDraft] = useState<Draft>(() => (editing ? draftFromItem(editing) : emptyDraft(defaultCat)));
  const [manualCategory, setManualCategory] = useState(!!editing);
  const suggestion = useMemo(() => suggestExpenseCategory(
    `${draft.merchant} ${draft.note}`, { categories: cats, learned },
  ), [draft.merchant, draft.note, cats, learned]);
  const selectedCategory = manualCategory ? draft.category : suggestion?.category ?? defaultCat;
  const categoryLabel = cats.find((c) => c.k === selectedCategory)?.l;
  const [errors, setErrors] = useState<{ amount?: string; category?: string; date?: string }>({});
  /** A date the user has pushed forward: a plan, not a record. */
  const scheduled = !!todayKey && draft.date > todayKey;
  const [submitted, setSubmitted] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const dateRef = useRef<HTMLInputElement>(null);
  const confirmRef = useRef<HTMLDivElement>(null);
  const cancelDeleteRef = useRef<HTMLButtonElement>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement>(null);
  useInertOutside(cardRef);
  useInertOutside(confirmRef, confirmDel);
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
    // Negative amounts are allowed and meaningful — that is how a refund is
    // recorded against the category it reverses. Only zero is rejected, because
    // a zero-value transaction says nothing and still occupies the ledger.
    if (!d.amount.trim()) e.amount = 'Enter an amount. Use a minus sign for a refund.';
    else if (!parsed.ok) e.amount = parsed.error;
    else if (parsed.value === 0) e.amount = 'Enter an amount other than 0.';
    if (!cats.some((c) => c.k === d.category)) e.category = 'Choose an active category.';
    if (!d.date) e.date = 'Pick a date.';
    else if (!validRecordDate(d.date)) e.date = 'Pick a valid calendar date.';
    else if (scheduleLimit && d.date > scheduleLimit) e.date = `Choose a date on or before ${scheduleLimit}.`;
    return e;
  }, [cats, scheduleLimit]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => {
    if (k === 'category') setManualCategory(true);
    setDraft((prev) => {
      const next = { ...prev, [k]: v };
      if (submitted) setErrors(validate(next));
      return next;
    });
  };

  const buildItem = useCallback((): ExpenseItem => {
    const tags = draft.tags.split(',').map((t) => t.trim()).filter(Boolean);
    const nowIso = new Date().toISOString();
    const created = editing?.createdAt ?? nowIso;
    const editCount = editing ? (editing.editCount ?? 0) + 1 : 0;
    return {
      id: editing ? editing.id : genExpenseId(),
      amount: formulaSignedAmount(draft.amount),
      category: selectedCategory,
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
  }, [draft, editing, selectedCategory]);

  const submit = useCallback(() => {
    setSubmitted(true);
    const e = validate({ ...draft, category: selectedCategory });
    setErrors(e);
    if (Object.keys(e).length > 0) {
      // Move focus to the first offending field for keyboard/AT users.
      if (e.amount) amountRef.current?.focus();
      else if (e.date) dateRef.current?.focus();
      return;
    }
    onSave(buildItem());
  }, [draft, selectedCategory, validate, onSave, buildItem]);

  // Body scroll lock — reference-counted, safe under overlapping overlays.
  // The parent mounts this component only while the modal is open.
  useBodyScrollLock(true);

  // Focus management: remember the opener, autofocus the amount once, restore
  // focus on close. Mount-only — this must never re-run while the user types.
  //
  // `useLayoutEffect`, and no timer. This used to focus from a 40ms
  // `setTimeout`, which is two bugs in one line. The opener button is gone by
  // the time the sheet paints, so for those 40ms `document.activeElement` was
  // `<body>` and anything typed was dropped on the floor — a window that is
  // short on a quiet machine and long on a busy phone, which is how it reached
  // users without ever failing CI. And a user who tapped straight into another
  // field inside the window had focus yanked back to the amount when the timer
  // finally fired, losing what they had typed there.
  //
  // Running before paint closes the window entirely: the first frame the user
  // can see is already a frame with the amount focused. `preventScroll` keeps
  // the entry animation (a translate on the sheet) from being interrupted by a
  // scroll-into-view; browsers that do not support the option ignore it and
  // still focus.
  useLayoutEffect(() => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    amountRef.current?.focus({ preventScroll: true });
    return () => { lastFocused.current?.focus?.(); };
  }, []);

  useLayoutEffect(() => {
    if (!confirmDel) return;
    const trigger = deleteTriggerRef.current;
    cancelDeleteRef.current?.focus({ preventScroll: true });
    return () => { if (trigger?.isConnected) trigger.focus({ preventScroll: true }); };
  }, [confirmDel]);

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
        if (!confirmDel) submit();
        return;
      }
      if (ev.key === 'Tab') {
        const container = confirmDel ? confirmRef.current : cardRef.current;
        const nodes = container?.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (!nodes || nodes.length === 0) return;
        const list = Array.from(nodes).filter((n) => !n.closest('[hidden], [inert], [aria-hidden="true"]')
          && (typeof n.checkVisibility !== 'function' || n.checkVisibility({ visibilityProperty: true })));
        if (list.length === 0) return;
        const first = list[0];
        const last = list[list.length - 1];
        const active = document.activeElement as HTMLElement;
        if (!container?.contains(active)) { ev.preventDefault(); (ev.shiftKey ? last : first).focus(); }
        else if (ev.shiftKey && active === first) { ev.preventDefault(); last.focus(); }
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
        /* Sticky to the card's EDGE, not to its padding: a sticky box stops at the
           scrollport inset by the card's bottom padding, which left an 18px
           strip under Save where the form scrolled visibly past. Pulling it
           down by that padding (and taking the padding back inside) closes it. */
        .fx-tx-footer{position:sticky;bottom:-18px;z-index:2;background:var(--card-solid,var(--card));
          margin:0 -22px -18px;padding:12px 22px 32px;border-top:1px solid var(--hair2);}
        .fx-tx-iconbtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:38px;padding:0 14px;
          border-radius:10px;border:1px solid var(--hair2);background:var(--fill-03);color:var(--ink);
          font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;transition:background .15s,border-color .15s;}
        .fx-tx-iconbtn:hover{background:var(--fill-06);}
        .fx-tx-danger{color:var(--red);}
        .fx-tx-danger:hover{border-color:var(--red);background:rgba(215,0,21,.08);}
        @media (max-width:560px){
          .fx-tx-overlay{padding:0;align-items:flex-end;}
          .fx-tx-card{max-width:none;max-height:94vh;border-radius:22px 22px 0 0;padding-bottom:calc(18px + var(--fx-safe-bottom));
            animation:fxTxSheet .3s cubic-bezier(.34,1.2,.5,1) both;}
          .fx-tx-footer{bottom:calc(-18px - var(--fx-safe-bottom));margin-bottom:calc(-18px - var(--fx-safe-bottom));
            padding-bottom:calc(32px + var(--fx-safe-bottom));}
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
                  what will be saved. The placeholder is the only place this is
                  advertised — the capability existed for months behind a bare
                  "0" and nothing on screen ever hinted at it.
                  See ui/AmountInput.tsx. */}
              <AmountInput
                id="tx-amount"
                inputRef={amountRef}
                sym={sym}
                placeholder="0  or  =10+5+3"
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
                ref={dateRef}
                className="fi"
                id="tx-date"
                type="date"
                value={draft.date}
                max={scheduleLimit}
                onChange={(e) => set('date', e.target.value)}
                aria-invalid={!!err('date')}
                aria-describedby={
                  err('date') ? 'tx-date-err' : scheduled ? 'tx-date-hint' : undefined
                }
              />
              {err('date') && <div className="fx-tx-err" id="tx-date-err" role="alert">{errors.date}</div>}
              {/* Only once the date actually IS in the future, so it reads as
                  confirmation of what just happened rather than as instructions
                  for a field most people fill in once. */}
              {!err('date') && scheduled && (
                <p id="tx-date-hint" className="note" style={{ marginTop: 5 }}>
                  Scheduled — it will be waiting on that date, not counted as spent today.
                </p>
              )}
            </div>
          </div>

          <div className="grid2">
            <div className="fg" style={{ marginBottom: 10 }}>
              <label className="fl" htmlFor="tx-merchant">Merchant</label>
              <input className="fi" id="tx-merchant" aria-describedby="tx-category-help" type="text" placeholder="e.g. Blue Bottle" maxLength={80}
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
            <input className="fi" id="tx-note" aria-describedby="tx-category-help" type="text" placeholder="What was it for?" maxLength={80}
              value={draft.note} onChange={(e) => set('note', e.target.value)} />
          </div>

          <fieldset style={{ border: 'none', padding: 0, margin: '0 0 12px' }}>
            <legend className="fl" style={{ padding: 0 }}>Category</legend>
            <p className="note" id="tx-category-help" role="status" style={{ marginBottom: 10 }}>
              {manualCategory ? 'Your category choice is kept when the name changes.'
                : suggestion ? `Auto-selected ${categoryLabel}${suggestion.source === 'history' ? ' from your saved history' : ' from the transaction name'}. You can change it.`
                : 'Type a merchant or description to suggest a category. Unrecognised names use your default; please review.'}
            </p>
            {manualCategory && <button type="button" className="fx-tx-recent" onClick={() => setManualCategory(false)}>
              Use automatic category
            </button>}
            {recent.length >= 2 && (
              <div style={{ marginBottom: 10 }}>
                <div className="note" style={{ fontWeight: 700, marginBottom: 6 }}>Recent</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {recent.map((c) => (
                    <button
                      key={`recent-${c.k}`}
                      type="button"
                      className="fx-tx-recent"
                      aria-pressed={selectedCategory === c.k}
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
                          aria-pressed={selectedCategory === c.k}
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

          {isEdit && history.length > 0 && (
            <TransactionHistory history={history} cats={cats} cfmt={cfmt} />
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
                  <button ref={deleteTriggerRef} type="button" className="fx-tx-iconbtn fx-tx-danger" onClick={() => setConfirmDel(true)}>
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
            ref={confirmRef}
            style={{ position: 'fixed', inset: 0, zIndex: 10, background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="tx-del-title"
          >
            <div className="card" style={{ maxWidth: 360, margin: 0, textAlign: 'center' }}>
              <div id="tx-del-title" style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Delete this transaction?</div>
              <p className="note" style={{ marginBottom: 16 }}>You can undo this for a few seconds afterwards.</p>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                <button ref={cancelDeleteRef} type="button" className="fx-tx-iconbtn" onClick={() => setConfirmDel(false)}>Cancel</button>
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

/**
 * This transaction's own change history.
 *
 * The line above already says *that* it was edited; this says *what* changed.
 * Collapsed by default — the common reason to open this sheet is to make a
 * change, not to audit one — and it never renders when the tracker has no
 * record, so a transaction from before the history existed simply shows
 * nothing rather than claiming it was never touched.
 */
function TransactionHistory({
  history, cats, cfmt,
}: {
  history: AuditEntry[];
  cats: FlatCat[];
  cfmt?: (n: number) => string;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  const money = cfmt ?? ((n: number) => String(n));
  const catLabel = (k: string) => cats.find((c) => c.k === k)?.l ?? k;

  const value = (field: AuditField, v: AuditValue): string => {
    if (field === 'recurring') return v ? 'Yes' : 'No';
    if (v == null || v === '') return '—';
    if (field === 'amount') return money(Number(v));
    if (field === 'category') return catLabel(String(v));
    return String(v);
  };

  return (
    <div style={{ marginBottom: 10, paddingTop: 10, borderTop: '1px solid var(--hair2)' }}>
      <button
        type="button"
        className="fx-tx-iconbtn"
        style={{ width: '100%', justifyContent: 'space-between', height: 34 }}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <Icon name="clock" size={14} style={{ color: 'var(--ink3)' }} />
          Change history ({history.length})
        </span>
        <span aria-hidden="true" style={{ color: 'var(--ink3)', fontSize: 11 }}>{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <ul id={listId} style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, display: 'grid', gap: 8 }}>
          {history.map((e) => (
            <li key={e.id} style={{ display: 'flex', gap: 9, alignItems: 'flex-start' }}>
              <span
                aria-hidden="true"
                style={{
                  width: 6, height: 6, borderRadius: '50%', marginTop: 6, flexShrink: 0,
                  background: e.action === 'delete' ? 'var(--red)'
                    : e.action === 'edit' ? 'var(--blue)' : 'var(--green)',
                }}
              />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600 }}>
                  {AUDIT_ACTION_LABEL[e.action]}
                  <span className="note" style={{ fontWeight: 500 }}> · {fmtStamp(new Date(e.ts).toISOString())}</span>
                </div>
                {e.changes?.map((c) => (
                  <div key={c.field} className="note" style={{ fontSize: 11.5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <b style={{ fontWeight: 600 }}>{AUDIT_FIELD_LABEL[c.field]}</b>
                    <s style={{ opacity: 0.75 }}>{value(c.field, c.before)}</s>
                    <span aria-hidden="true">→</span>
                    <span style={{ color: 'var(--ink)' }}>{value(c.field, c.after)}</span>
                  </div>
                ))}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
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
