/**
 * The statement review sheet.
 *
 * The promise this screen makes is that nothing reaches the ledger until the
 * user presses one button, so every affordance here is built around *checking*
 * rather than *accepting*: the amount and date the bank printed sit beside the
 * merchant and category we proposed, every proposal is labelled with where it
 * came from, and anything we are unsure about is flagged rather than quietly
 * ticked. The primary action states the count it is about to import.
 *
 * Rows the parser could not fully read, credits, and suspected duplicates all
 * arrive unticked. That is the safe direction to be wrong in: a transaction the
 * user has to tick back on is a small annoyance, a transaction that silently
 * double-counted their rent is a broken month.
 *
 * Long statements are paged rather than virtualised — a hundred rows at a time
 * keeps the first paint fast without pulling in a windowing dependency, and the
 * filter chips are how someone with four hundred rows actually navigates: they
 * want the twelve that need review, not row 214.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { Icon } from './Icon';
import type { FlatCat } from './TransactionModal';
import type { ExpenseItem } from '../lib/expense';
import { ACCEPT_ATTRIBUTE } from '../lib/import/extract';
import { needsReview, isImportable } from '../lib/import/status';
import { useStatementImport } from '../lib/import/useStatementImport';
import type { DraftRow, CategoryOrigin, ImportSummary } from '../lib/import/types';

interface Props {
  cats: FlatCat[];
  /** The existing ledger — duplicate detection compares against it. */
  existing: ExpenseItem[];
  /** Formats an amount in the active display currency. */
  cfmt: (n: number) => string;
  /** ISO code of the active display currency, for the mismatch warning. */
  currencyCode: string;
  onImport: (items: ExpenseItem[]) => void;
  onClose: () => void;
  /** False when the assistant should not be called at all. */
  aiEnabled?: boolean;
}

type Filter = 'all' | 'review' | 'duplicates' | 'credits';

const PAGE_SIZE = 100;

const ORIGIN_LABEL: Record<CategoryOrigin, string> = {
  learned: 'Your rule',
  rule: 'Matched',
  ai: 'AI',
  user: 'You set',
  none: 'Undecided',
};

export default function StatementImport({
  cats, existing, cfmt, currencyCode, onImport, onClose, aiEnabled = true,
}: Props) {
  const categories = useMemo(
    () => cats.map((c) => ({ key: c.k, label: c.l, section: c.section })),
    [cats],
  );

  const trip = useStatementImport({ categories, existing, aiEnabled });
  const {
    phase, message, fileName, drafts, summary, extraction,
    aiPhase, aiMessage, resumable, dateOrder, dateOrderAssumed, flipDateOrder,
    start, submitPassword, updateDraft, setAllIncluded, resume, discardResumable, confirm, reset,
  } = trip;

  const [filter, setFilter] = useState<Filter>('all');
  const [shown, setShown] = useState(PAGE_SIZE);
  const [password, setPassword] = useState('');
  const [dragging, setDragging] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descId = useId();

  useBodyScrollLock(true);

  // Remember the opener and restore focus on close, so a keyboard user is not
  // dropped at the top of the document.
  useEffect(() => {
    lastFocused.current = document.activeElement as HTMLElement | null;
    return () => { lastFocused.current?.focus?.(); };
  }, []);

  const close = useCallback(() => { reset(); onClose(); }, [reset, onClose]);

  // Escape closes; Tab is trapped inside the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab' || !cardRef.current) return;
      const focusable = cardRef.current.querySelectorAll<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [close]);

  const visible = useMemo(() => {
    switch (filter) {
      case 'review': return drafts.filter(needsReview);
      case 'duplicates': return drafts.filter((d) => d.duplicateOf || d.duplicateInBatch);
      case 'credits': return drafts.filter((d) => d.issues.includes('credit'));
      default: return drafts;
    }
  }, [drafts, filter]);

  // Switching filter resets the page depth: a narrower list should start at the
  // top rather than inheriting how far the user had scrolled through a wider
  // one. Done in the handler rather than an effect — it is a consequence of the
  // click, not of the state that follows it.
  const changeFilter = useCallback((next: Filter) => {
    setFilter(next);
    setShown(PAGE_SIZE);
  }, []);

  const onFile = useCallback((file: File | undefined | null) => {
    if (!file) return;
    setFilter('all');
    setShown(PAGE_SIZE);
    setPassword('');
    start(file);
  }, [start]);

  const doImport = useCallback(() => {
    const items = confirm();
    if (items.length) onImport(items);
    onClose();
  }, [confirm, onImport, onClose]);

  const currencyMismatch =
    extraction?.doc.currency && extraction.doc.currency !== currencyCode
      ? extraction.doc.currency
      : null;

  return createPortal(
    <div className="fx-tools fx-scope">
      <div className="fx-imp-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
        <style>{STYLES}</style>

        <div ref={cardRef} className="fx-imp-card" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={descId}>
          <header className="fx-imp-head">
            <div>
              <h2 id={titleId} className="fx-imp-title">Import a statement</h2>
              <p id={descId} className="fx-imp-sub">
                {phase === 'review'
                  ? `${fileName} · nothing is saved until you press Import`
                  : 'Read in this browser. Your file is never uploaded.'}
              </p>
            </div>
            <button type="button" className="fx-imp-btn fx-imp-icon" onClick={close} aria-label="Close import">✕</button>
          </header>

          <div className="fx-imp-body">
            {phase === 'idle' && (
              <IdlePane
                dragging={dragging}
                setDragging={setDragging}
                onFile={onFile}
                resumable={resumable}
                onResume={resume}
                onDiscard={discardResumable}
              />
            )}

            {phase === 'reading' && (
              <div className="fx-imp-state" role="status">
                <span className="fx-imp-spinner" aria-hidden="true" />
                <p className="fx-imp-state-title">Reading {fileName}…</p>
                <p className="fx-imp-note">Parsing dates, amounts and balances on this device.</p>
              </div>
            )}

            {phase === 'password' && (
              <form
                className="fx-imp-state"
                onSubmit={(e) => { e.preventDefault(); if (password) submitPassword(password); }}
              >
                <p className="fx-imp-state-title">This statement is password-protected</p>
                <p className="fx-imp-note" role="alert">{message}</p>
                <label className="fx-imp-label" htmlFor="fx-imp-pw">Statement password</label>
                <input
                  id="fx-imp-pw"
                  className="fx-imp-input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="off"
                  autoFocus
                />
                <p className="fx-imp-note">
                  Used once to unlock the file and never stored, logged or sent anywhere.
                </p>
                <div className="fx-imp-actions">
                  <button type="button" className="fx-imp-btn" onClick={close}>Cancel</button>
                  <button type="submit" className="fx-imp-btn fx-imp-primary" disabled={!password}>Unlock</button>
                </div>
              </form>
            )}

            {phase === 'error' && (
              <div className="fx-imp-state">
                <p className="fx-imp-state-title">We could not read that file</p>
                <p className="fx-imp-note" role="alert">{message}</p>
                <div className="fx-imp-actions">
                  <button type="button" className="fx-imp-btn" onClick={close}>Close</button>
                  <button type="button" className="fx-imp-btn fx-imp-primary" onClick={reset}>Choose another file</button>
                </div>
              </div>
            )}

            {phase === 'review' && (
              <>
                <SummaryBar summary={summary} cfmt={cfmt} />

                {extraction && <ReconcileBanner extraction={extraction} cfmt={cfmt} />}

                {dateOrderAssumed && (
                  <p className="fx-imp-banner" role="status">
                    <span>
                      Every date in this file could be read either way round, so we
                      used <b>{dateOrder === 'dmy' ? 'DD/MM' : 'MM/DD'}</b>. If that is
                      wrong, switch it here rather than fixing each row.
                    </span>
                    <button type="button" className="fx-imp-btn fx-imp-sm" onClick={flipDateOrder}>
                      Read as {dateOrder === 'dmy' ? 'MM/DD' : 'DD/MM'}
                    </button>
                  </p>
                )}

                {currencyMismatch && (
                  <p className="fx-imp-banner fx-imp-warn" role="status">
                    This statement is in {currencyMismatch}, but your tools are set to {currencyCode}.
                    Amounts are imported exactly as printed — no conversion is applied.
                  </p>
                )}

                {aiPhase === 'running' && (
                  <p className="fx-imp-banner" role="status">
                    <span className="fx-imp-spinner fx-imp-spinner-sm" aria-hidden="true" />
                    Naming and categorising the merchants we did not recognise…
                  </p>
                )}
                {aiPhase === 'failed' && (
                  <p className="fx-imp-banner fx-imp-warn" role="status">{aiMessage}</p>
                )}

                <div className="fx-imp-toolbar">
                  <div className="fx-imp-filters" role="group" aria-label="Filter rows">
                    <FilterChip active={filter === 'all'} onClick={() => changeFilter('all')} label="All" count={drafts.length} />
                    <FilterChip active={filter === 'review'} onClick={() => changeFilter('review')} label="Needs review" count={summary.needsReview} />
                    <FilterChip active={filter === 'duplicates'} onClick={() => changeFilter('duplicates')} label="Duplicates" count={summary.duplicates} />
                    <FilterChip active={filter === 'credits'} onClick={() => changeFilter('credits')} label="Money in" count={summary.credits} />
                  </div>
                  <div className="fx-imp-bulk">
                    <button type="button" className="fx-imp-btn fx-imp-sm" onClick={() => setAllIncluded(true)}>Select all</button>
                    <button type="button" className="fx-imp-btn fx-imp-sm" onClick={() => setAllIncluded(false)}>Clear</button>
                  </div>
                </div>

                {visible.length === 0 ? (
                  <p className="fx-imp-empty">No rows match this filter.</p>
                ) : (
                  <div className="fx-imp-scroll">
                    <table className="fx-imp-table">
                      <caption className="fx-imp-caption">
                        Transactions found in {fileName}. Tick the ones to import.
                      </caption>
                      <thead>
                        <tr>
                          <th scope="col" className="fx-imp-th-check"><span className="fx-imp-sr">Import</span></th>
                          <th scope="col">Date</th>
                          <th scope="col">Description</th>
                          <th scope="col">Category</th>
                          <th scope="col" className="fx-imp-num">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.slice(0, shown).map((draft) => (
                          <Row key={draft.id} draft={draft} cats={cats} cfmt={cfmt} onChange={updateDraft} />
                        ))}
                      </tbody>
                    </table>

                    {visible.length > shown && (
                      <button
                        type="button"
                        className="fx-imp-btn fx-imp-more"
                        onClick={() => setShown((n) => n + PAGE_SIZE)}
                      >
                        Show {Math.min(PAGE_SIZE, visible.length - shown)} more
                        <span className="fx-imp-note"> · {visible.length - shown} remaining</span>
                      </button>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {phase === 'review' && (
            <footer className="fx-imp-foot">
              <p className="fx-imp-note fx-imp-foot-note">
                Only merchant descriptions are sent for AI categorisation — never amounts,
                balances or account numbers.
              </p>
              <div className="fx-imp-actions">
                <button type="button" className="fx-imp-btn" onClick={close}>Cancel</button>
                <button
                  type="button"
                  className="fx-imp-btn fx-imp-primary"
                  onClick={doImport}
                  disabled={summary.selected === 0}
                >
                  {summary.selected === 0
                    ? 'Nothing selected'
                    : `Import ${summary.selected} transaction${summary.selected === 1 ? '' : 's'}`}
                </button>
              </div>
            </footer>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Panes ───────────────────────────────────────────────────────────── */

function IdlePane({
  dragging, setDragging, onFile, resumable, onResume, onDiscard,
}: {
  dragging: boolean;
  setDragging: (v: boolean) => void;
  onFile: (f: File | null | undefined) => void;
  resumable: { fileName: string; savedAt: string; count: number } | null;
  onResume: () => void;
  onDiscard: () => void;
}) {
  const inputId = useId();

  return (
    <div className="fx-imp-state">
      {resumable && (
        <div className="fx-imp-banner fx-imp-resume" role="status">
          <span>
            You have an unfinished review of <b>{resumable.fileName}</b> ({resumable.count} rows).
          </span>
          <span className="fx-imp-actions">
            <button type="button" className="fx-imp-btn fx-imp-sm" onClick={onDiscard}>Discard</button>
            <button type="button" className="fx-imp-btn fx-imp-sm fx-imp-primary" onClick={onResume}>Resume</button>
          </span>
        </div>
      )}

      <div
        className={`fx-imp-drop${dragging ? ' is-dragging' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFile(e.dataTransfer.files?.[0]); }}
      >
        <p className="fx-imp-state-title">Drop a bank or credit card statement</p>
        <p className="fx-imp-note">CSV or PDF · password-protected PDFs are supported</p>
        <label className="fx-imp-btn fx-imp-primary fx-imp-filebtn" htmlFor={inputId}>Choose a file</label>
        <input
          id={inputId}
          className="fx-imp-sr"
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ''; }}
        />
      </div>

      <ul className="fx-imp-points">
        <li>Your file is read in this browser and never uploaded.</li>
        <li>Amounts, dates and balances are read from the file itself — the assistant only names merchants and picks categories.</li>
        <li>Every row stays a draft until you review it and press Import.</li>
      </ul>
    </div>
  );
}

function SummaryBar({ summary, cfmt }: { summary: ImportSummary; cfmt: (n: number) => string }) {
  return (
    <dl className="fx-imp-stats">
      <div><dt>Found</dt><dd>{summary.found}</dd></div>
      <div><dt>Selected</dt><dd>{summary.selected}</dd></div>
      <div><dt>Needs review</dt><dd className={summary.needsReview ? 'fx-imp-amber' : ''}>{summary.needsReview}</dd></div>
      <div><dt>Duplicates</dt><dd className={summary.duplicates ? 'fx-imp-amber' : ''}>{summary.duplicates}</dd></div>
      <div><dt>Total selected</dt><dd>{cfmt(summary.total)}</dd></div>
    </dl>
  );
}

/**
 * The reconciliation result, in a sentence.
 *
 * This is the single most trust-bearing line on the screen: it says whether the
 * rows we extracted actually add up to the movement the bank's own balances
 * describe. When they do not, it says so plainly and by how much, because a
 * silent near-miss is exactly what makes a ledger wrong three months later.
 */
function ReconcileBanner({
  extraction, cfmt,
}: {
  extraction: NonNullable<ReturnType<typeof useStatementImport>['extraction']>;
  cfmt: (n: number) => string;
}) {
  const { reconciliation: r, doc, directionsAssumed } = extraction;

  if (!r.checked) {
    return (
      <p className="fx-imp-banner" role="status">
        {doc.rows.length} rows read. This statement has no balance column, so we could not
        cross-check the total — please skim the amounts before importing.
      </p>
    );
  }

  if (r.ok) {
    return (
      <p className="fx-imp-banner fx-imp-ok" role="status">
        ✓ Reconciled — all {doc.rows.length} rows match the statement’s own balances
        {directionsAssumed > 0 ? '.' : ', including which way each one moved.'}
      </p>
    );
  }

  return (
    <p className="fx-imp-banner fx-imp-warn" role="status">
      These rows do not reconcile with the statement’s balances — a difference of{' '}
      <b>{cfmt(Math.abs(r.difference))}</b>
      {r.breaks > 0 ? ` across ${r.breaks} row${r.breaks === 1 ? '' : 's'}` : ''}. Some
      transactions may be missing or misread. Please check before importing.
    </p>
  );
}

function FilterChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button type="button" className="fx-imp-chip" aria-pressed={active} onClick={onClick}>
      {label}<span className="fx-imp-chip-n">{count}</span>
    </button>
  );
}

/* ── Row ─────────────────────────────────────────────────────────────── */

function Row({
  draft, cats, cfmt, onChange,
}: {
  draft: DraftRow;
  cats: FlatCat[];
  cfmt: (n: number) => string;
  onChange: (id: string, patch: Partial<DraftRow>) => void;
}) {
  const cat = cats.find((c) => c.k === draft.category);
  const blocked = !isImportable(draft);
  const duplicate = Boolean(draft.duplicateOf || draft.duplicateInBatch);
  const credit = draft.issues.includes('credit');
  const label = draft.merchant || draft.source.description || 'Unnamed transaction';

  return (
    <tr className={needsReview(draft) ? 'fx-imp-row is-review' : 'fx-imp-row'}>
      <td className="fx-imp-th-check">
        <input
          type="checkbox"
          className="fx-imp-check"
          checked={draft.include}
          disabled={blocked}
          onChange={(e) => onChange(draft.id, { include: e.target.checked })}
          aria-label={`Import ${label}, ${cfmt(draft.amount)}`}
        />
      </td>

      <td className="fx-imp-date">
        <input
          type="date"
          className="fx-imp-input fx-imp-input-sm"
          value={draft.date}
          onChange={(e) => onChange(draft.id, { date: e.target.value })}
          aria-label={`Date for ${label}`}
        />
      </td>

      <td className="fx-imp-desc">
        <input
          className="fx-imp-input fx-imp-input-sm"
          value={draft.merchant}
          placeholder="Merchant"
          onChange={(e) => onChange(draft.id, { merchant: e.target.value })}
          aria-label={`Merchant for the transaction described as ${draft.source.description}`}
        />
        <span className="fx-imp-raw" title={draft.source.description}>{draft.source.description}</span>
        <span className="fx-imp-badges">
          <span className={`fx-imp-badge fx-imp-origin-${draft.origin}`}>
            {ORIGIN_LABEL[draft.origin]}
            {draft.confidence > 0 && draft.origin !== 'user' ? ` ${draft.confidence}%` : ''}
          </span>
          {duplicate && (
            <span className="fx-imp-badge fx-imp-badge-warn">
              {draft.duplicateOf ? 'Already in your ledger' : 'Repeated in this file'}
            </span>
          )}
          {credit && <span className="fx-imp-badge fx-imp-badge-info">Money in — not tracked here</span>}
          {draft.issues.includes('no-amount') && <span className="fx-imp-badge fx-imp-badge-warn">No amount found</span>}
          {draft.issues.includes('no-date') && <span className="fx-imp-badge fx-imp-badge-warn">No date found</span>}
        </span>
      </td>

      <td>
        <span className="fx-imp-catwrap">
          {cat && <Icon name={cat.ic} size={14} />}
          <select
            className="fx-imp-input fx-imp-input-sm fx-imp-select"
            value={draft.category}
            onChange={(e) => onChange(draft.id, { category: e.target.value })}
            aria-label={`Category for ${label}`}
          >
            <option value="">Choose…</option>
            {cats.map((c) => (
              <option key={c.k} value={c.k}>{c.l}</option>
            ))}
          </select>
        </span>
      </td>

      <td className={`fx-imp-num${draft.amount < 0 ? ' fx-imp-credit' : ''}`}>
        {cfmt(draft.amount)}
        {draft.source.balance !== null && (
          <span className="fx-imp-bal">bal {cfmt(draft.source.balance)}</span>
        )}
      </td>
    </tr>
  );
}

/* ── Styles ──────────────────────────────────────────────────────────── */

const STYLES = `
.fx-imp-overlay{position:fixed;inset:0;z-index:var(--z-modal);display:flex;align-items:center;justify-content:center;
  padding:20px;background:rgba(0,0,0,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);
  animation:fxImpFade .2s ease both;}
.fx-imp-card{display:flex;flex-direction:column;width:100%;max-width:1080px;max-height:min(92vh,900px);
  background:var(--card-solid,var(--card));border:1px solid var(--hair2);border-radius:22px;
  box-shadow:0 40px 90px -30px rgba(0,0,0,.7);animation:fxImpIn .3s cubic-bezier(.34,1.3,.5,1) both;overflow:hidden;}
@keyframes fxImpFade{from{opacity:0}to{opacity:1}}
@keyframes fxImpIn{from{opacity:0;transform:translateY(18px) scale(.98)}to{opacity:1;transform:none}}

.fx-imp-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;
  padding:20px 22px 14px;border-bottom:1px solid var(--hair2);}
.fx-imp-title{margin:0;font-size:18px;font-weight:700;letter-spacing:-.01em;}
.fx-imp-sub{margin:4px 0 0;font-size:12.5px;color:var(--ink3);}
.fx-imp-body{flex:1;min-height:0;overflow-y:auto;padding:16px 22px;}
.fx-imp-foot{border-top:1px solid var(--hair2);padding:12px 22px 14px;display:flex;align-items:center;
  justify-content:space-between;gap:14px;flex-wrap:wrap;background:var(--card-solid,var(--card));}
.fx-imp-foot-note{max-width:52ch;margin:0;}

.fx-imp-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:38px;padding:0 14px;
  border-radius:10px;border:1px solid var(--hair2);background:var(--fill-03);color:var(--ink);
  font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;transition:background .15s,border-color .15s;}
.fx-imp-btn:hover:not(:disabled){background:var(--fill-06);}
.fx-imp-btn:disabled{opacity:.5;cursor:not-allowed;}
.fx-imp-primary{background:var(--gold);border-color:var(--fab-border);color:#1a1608;}
.fx-imp-primary:hover:not(:disabled){background:var(--gold-2);}
.fx-imp-sm{height:30px;padding:0 10px;font-size:12px;}
.fx-imp-icon{width:38px;padding:0;flex-shrink:0;}
.fx-imp-actions{display:flex;gap:8px;align-items:center;}
.fx-imp-note{font-size:12px;color:var(--ink3);margin:0;}
.fx-imp-sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}

.fx-imp-state{display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;padding:22px 0;}
.fx-imp-state-title{margin:0;font-size:15px;font-weight:650;}
.fx-imp-label{font-size:12px;font-weight:600;color:var(--ink2);}
.fx-imp-input{height:38px;padding:0 10px;border-radius:10px;border:1px solid var(--hair2);
  background:var(--well);color:var(--ink);font-size:13px;font-family:inherit;width:100%;max-width:320px;}
.fx-imp-input:focus-visible{outline:none;border-color:var(--gold);box-shadow:var(--ring-gold);}
.fx-imp-input-sm{height:30px;font-size:12.5px;max-width:none;}
.fx-imp-select{cursor:pointer;}

.fx-imp-drop{width:100%;border:1.5px dashed var(--hair2);border-radius:16px;padding:34px 20px;
  display:flex;flex-direction:column;align-items:center;gap:8px;transition:border-color .15s,background .15s;}
.fx-imp-drop.is-dragging{border-color:var(--gold);background:var(--gold-bg);}
.fx-imp-filebtn{margin-top:8px;cursor:pointer;}
.fx-imp-points{margin:6px 0 0;padding:0;list-style:none;display:grid;gap:6px;text-align:left;max-width:64ch;
  font-size:12.5px;color:var(--ink3);}
.fx-imp-points li{position:relative;padding-left:16px;}
.fx-imp-points li::before{content:"";position:absolute;left:2px;top:7px;width:5px;height:5px;border-radius:50%;background:var(--ink3);}

.fx-imp-spinner{width:22px;height:22px;border-radius:50%;border:2px solid var(--hair2);border-top-color:var(--gold);
  animation:fxImpSpin .8s linear infinite;display:inline-block;}
.fx-imp-spinner-sm{width:13px;height:13px;border-width:1.5px;vertical-align:-2px;margin-right:6px;}
@keyframes fxImpSpin{to{transform:rotate(360deg)}}

.fx-imp-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(104px,1fr));gap:8px;margin:0 0 12px;}
.fx-imp-stats>div{background:var(--fill-03);border:1px solid var(--hair);border-radius:12px;padding:9px 11px;}
.fx-imp-stats dt{font-size:11px;color:var(--ink3);font-weight:600;}
.fx-imp-stats dd{margin:2px 0 0;font-size:17px;font-weight:700;letter-spacing:-.01em;
  font-variant-numeric:tabular-nums;}
.fx-imp-amber{color:var(--orange);}

.fx-imp-banner{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:space-between;
  font-size:12.5px;line-height:1.5;border:1px solid var(--hair2);background:var(--fill-03);
  border-radius:12px;padding:9px 12px;margin:0 0 10px;}
/* --green-fill / --orange-fill are the SOLID status colours, meant for bars and
   chips. Behind body text they read as a block of paint and drop the contrast of
   everything on top, so status surfaces are mixed down to a tint and carry their
   meaning in the border instead. Text keeps the theme's own ink colour, which is
   what keeps this legible in both themes. */
.fx-imp-ok{border-color:color-mix(in srgb,var(--green) 45%,transparent);
  background:color-mix(in srgb,var(--green) 12%,transparent);}
.fx-imp-warn{border-color:color-mix(in srgb,var(--orange) 50%,transparent);
  background:color-mix(in srgb,var(--orange) 12%,transparent);}
.fx-imp-resume{justify-content:space-between;}

.fx-imp-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px;}
.fx-imp-filters{display:flex;gap:6px;flex-wrap:wrap;}
.fx-imp-bulk{display:flex;gap:6px;}
.fx-imp-chip{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 11px;border-radius:980px;
  border:1.5px solid var(--hair2);background:var(--card);color:var(--ink);font-size:12px;font-weight:600;
  font-family:inherit;cursor:pointer;transition:border-color .15s,background .15s;}
.fx-imp-chip:hover{border-color:var(--ink3);}
.fx-imp-chip[aria-pressed="true"]{border-color:var(--ink);background:var(--hair);}
.fx-imp-chip-n{font-variant-numeric:tabular-nums;color:var(--ink3);}
.fx-imp-chip[aria-pressed="true"] .fx-imp-chip-n{color:var(--ink2);}

.fx-imp-scroll{overflow-x:auto;}
.fx-imp-table{width:100%;border-collapse:collapse;font-size:12.5px;}
.fx-imp-caption{text-align:left;font-size:12px;color:var(--ink3);padding-bottom:6px;}
.fx-imp-table th{text-align:left;font-size:11px;font-weight:650;color:var(--ink3);text-transform:uppercase;
  letter-spacing:.04em;padding:6px 8px;border-bottom:1px solid var(--hair2);position:sticky;top:0;
  background:var(--card-solid,var(--card));z-index:1;}
.fx-imp-table td{padding:7px 8px;border-bottom:1px solid var(--hair);vertical-align:top;}
/* A row needing attention is marked with a faint wash and an accent bar down its
   leading edge. The bar does the work: it survives a tint being invisible on a
   dense screen, and it does not sit behind the row's own inputs. */
.fx-imp-row.is-review{background:color-mix(in srgb,var(--orange) 8%,transparent);}
.fx-imp-row.is-review td:first-child{box-shadow:inset 3px 0 0 var(--orange);}
.fx-imp-th-check{width:34px;}
.fx-imp-check{width:16px;height:16px;accent-color:var(--gold);cursor:pointer;}
.fx-imp-check:focus-visible{outline:2px solid var(--gold);outline-offset:2px;}
.fx-imp-date{width:132px;}
.fx-imp-desc{min-width:230px;}
.fx-imp-raw{display:block;font-size:11px;color:var(--ink3);margin-top:3px;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;max-width:38ch;}
.fx-imp-badges{display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;}
.fx-imp-badge{font-size:10px;font-weight:650;padding:1px 6px;border-radius:980px;border:1px solid var(--hair2);
  color:var(--ink3);white-space:nowrap;}
.fx-imp-origin-learned,.fx-imp-origin-user{color:var(--green);border-color:color-mix(in srgb,var(--green) 40%,transparent);}
.fx-imp-origin-ai{color:var(--purple);border-color:color-mix(in srgb,var(--purple) 40%,transparent);}
.fx-imp-origin-none{color:var(--orange);border-color:color-mix(in srgb,var(--orange) 45%,transparent);}
.fx-imp-badge-warn{color:var(--orange);border-color:color-mix(in srgb,var(--orange) 45%,transparent);}
.fx-imp-badge-info{color:var(--blue);border-color:color-mix(in srgb,var(--blue) 40%,transparent);}
.fx-imp-catwrap{display:flex;align-items:center;gap:6px;min-width:150px;}
.fx-imp-num{text-align:right;font-variant-numeric:tabular-nums;font-weight:650;white-space:nowrap;}
.fx-imp-credit{color:var(--green);}
.fx-imp-bal{display:block;font-size:10.5px;color:var(--ink3);font-weight:500;margin-top:2px;}
.fx-imp-more{width:100%;margin-top:10px;}
.fx-imp-empty{text-align:center;color:var(--ink3);font-size:13px;padding:26px 0;}

@media (max-width:720px){
  .fx-imp-overlay{padding:0;align-items:flex-end;}
  .fx-imp-card{max-width:none;max-height:96vh;border-radius:20px 20px 0 0;}
  .fx-imp-body{padding:14px;}
  .fx-imp-head,.fx-imp-foot{padding-left:14px;padding-right:14px;}
  .fx-imp-foot{flex-direction:column;align-items:stretch;}
  .fx-imp-foot .fx-imp-actions{justify-content:flex-end;}
  .fx-imp-raw{max-width:26ch;}
}
@media (prefers-reduced-motion:reduce){
  .fx-imp-overlay,.fx-imp-card{animation:none !important;}
  .fx-imp-spinner{animation-duration:2s;}
}
`;
