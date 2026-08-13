/**
 * One-line spend entry: "340 lunch yesterday upi".
 *
 * The parser (lib/quickAdd.ts) is pure; this is the surface that makes it
 * trustworthy. Two rules drive the design:
 *
 *  1. Nothing is saved that the user has not seen. Everything understood is
 *     echoed back as chips *before* submission, so a wrong guess is corrected
 *     in the line rather than discovered later in the ledger.
 *  2. It never replaces the form. A field it could not fill is simply not
 *     shown, and the structured form below remains the complete way to enter
 *     anything — this is a shortcut for the common case, not a new dialect
 *     the user has to learn.
 */
import { useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { parseQuickAdd, type QuickAddResult } from '../lib/quickAdd';
import { SECTION_COLOR } from '../lib/sectionColors';
import type { FlatCat } from './TransactionModal';

interface Props {
  cats: FlatCat[];
  cfmt: (n: number) => string;
  now: Date;
  /** Commit a parsed line. Returns false if it was rejected. */
  onAdd: (parsed: QuickAddResult) => boolean;
  /** Category used when the line names none — the form's current selection. */
  fallbackCategory: string;
}

export function QuickAddBar({ cats, cfmt, now, onAdd, fallbackCategory }: Props) {
  const [text, setText] = useState('');
  const [flash, setFlash] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validKeys = useMemo(() => new Set(cats.map((c) => c.k)), [cats]);
  // Parsed on every keystroke: the preview IS the feedback, and a parse of one
  // short line is far cheaper than the render it feeds.
  const parsed = useMemo(
    () => parseQuickAdd(text, now, validKeys),
    [text, now, validKeys],
  );

  const catKey = parsed.category || fallbackCategory;
  const cat = cats.find((c) => c.k === catKey);

  const submit = () => {
    if (!parsed.ok) return;
    if (!onAdd(parsed)) return;
    setText('');
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1100);
    inputRef.current?.focus();
  };

  return (
    <div className="fx-qa">
      <style>{QUICK_ADD_STYLES}</style>
      <label className="fl" htmlFor="fx-qa-input">
        Quick add
      </label>
      <div className="fx-qa-row">
        <Icon name="zap" size={15} className="fx-qa-icon" aria-hidden="true" />
        <input
          id="fx-qa-input"
          ref={inputRef}
          className="fi fx-qa-input"
          type="text"
          autoComplete="off"
          placeholder="340 lunch yesterday upi"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
            if (e.key === 'Escape') setText('');
          }}
          aria-describedby="fx-qa-help"
        />
        <button
          type="button"
          className={`btn btn-sm fx-qa-btn${flash ? ' is-ok' : ''}`}
          disabled={!parsed.ok}
          onClick={submit}
        >
          {flash ? 'Added ✓' : 'Add'}
        </button>
      </div>

      {/* One help line, replaced by the preview once there is something to
          preview. A permanent syntax legend would out-shout the field.

          Deliberately NOT a live region. It is wired to the input with
          aria-describedby, so a screen reader reads it on focus and on demand;
          as `role="status"` it would re-announce the whole preview on every
          keystroke, talking over the user as they type. */}
      <p id="fx-qa-help" className="note fx-qa-help">
        {text.trim() === '' ? (
          <>Type an amount and a few words — the date, category and payment method are picked up automatically.</>
        ) : parsed.ok ? (
          <span className="fx-qa-chips">
            <span className="fx-qa-chip fx-qa-amt">{cfmt(parsed.amount)}</span>
            {cat && (
              <span className="fx-qa-chip">
                <Icon name={cat.ic} size={12} style={{ color: SECTION_COLOR[cat.section] }} aria-hidden="true" />
                {cat.l}{parsed.category ? '' : ' (default)'}
              </span>
            )}
            <span className="fx-qa-chip">{fmtDay(parsed.date, now)}</span>
            {parsed.paymentMethod && <span className="fx-qa-chip">{parsed.paymentMethod}</span>}
            {parsed.tags?.map((t) => <span key={t} className="fx-qa-chip">#{t}</span>)}
            {parsed.note && <span className="fx-qa-chip fx-qa-note">“{parsed.note}”</span>}
          </span>
        ) : (
          <>Add an amount — “340 lunch” is enough.</>
        )}
      </p>
    </div>
  );
}

/** "Today"/"Yesterday" where that reads better than a date. */
function fmtDay(ymd: string, now: Date): string {
  const d = new Date(ymd + 'T00:00:00');
  if (isNaN(d.getTime())) return ymd;
  const dayMs = 24 * 60 * 60 * 1000;
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diff = Math.round((midnight - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / dayMs);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const QUICK_ADD_STYLES = `
.fx-tools .fx-qa{margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid var(--hair2);}
.fx-tools .fx-qa-row{display:flex;align-items:center;gap:8px;position:relative;}
.fx-tools .fx-qa-icon{position:absolute;left:12px;color:var(--gold);pointer-events:none;}
.fx-tools .fx-qa-input{flex:1;min-width:0;padding-left:34px;}
.fx-tools .fx-qa-btn{width:auto;min-width:86px;flex-shrink:0;transition:background-color .2s,transform .12s;}
.fx-tools .fx-qa-btn:disabled{opacity:.45;cursor:default;}
.fx-tools .fx-qa-btn:not(:disabled):active{transform:scale(.97);}
.fx-tools .fx-qa-btn.is-ok{background:var(--green);}
.fx-tools .fx-qa-help{margin:8px 0 0;min-height:20px;}
.fx-tools .fx-qa-chips{display:flex;flex-wrap:wrap;gap:5px;align-items:center;}
.fx-tools .fx-qa-chip{display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:980px;
  background:var(--fill-06);color:var(--ink2);font-size:11px;font-weight:600;
  animation:fxQaChip .18s ease both;}
.fx-tools .fx-qa-amt{background:color-mix(in srgb,var(--gold) 16%,transparent);color:var(--ink);}
.fx-tools .fx-qa-note{font-weight:500;font-style:italic;max-width:220px;overflow:hidden;
  text-overflow:ellipsis;white-space:nowrap;}
@keyframes fxQaChip{from{opacity:0;transform:translateY(-2px) scale(.96)}to{opacity:1;transform:none}}
@media (max-width:480px){
  .fx-tools .fx-qa-btn{min-width:0;padding-left:14px;padding-right:14px;}
  .fx-tools .fx-qa-note{max-width:140px;}
}
@media (prefers-reduced-motion:reduce){
  .fx-tools .fx-qa-chip{animation:none;}
  .fx-tools .fx-qa-btn{transition:none;}
}
`;
