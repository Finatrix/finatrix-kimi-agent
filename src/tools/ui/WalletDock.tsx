import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { useCurrency } from '../CurrencyContext';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import { computeWallet, walletSummary, type WalletRow } from '../lib/wallet';
import { defaultFyStart, fyAllMonths, loadFyChoice, MONTH_NAMES, saveFyStart } from '../lib/fiscalYear';
import { SECTION_COLOR } from '../lib/sectionColors';
import { monthLabel } from '../lib/month';
import type { BudgetStore, CatKey, SectionedCats } from '../lib/budget';
import type { ExpenseItem } from '../lib/expense';

/**
 * The Wallet — a floating, always-reachable view of what the year's budgets
 * have left over.
 *
 * WHY FLOATING
 * ------------
 * The wallet answers a question you have *while doing something else*: "can I
 * afford this?" comes up in the middle of logging a spend or setting next
 * month's budget, not on a screen you navigate to on purpose. A card halfway
 * down one page would be read once and never again. So it lives as a dock —
 * bottom-left, mirroring the assistant's bottom-right — with the balance
 * visible on the button itself, so the answer is usually available without
 * opening anything at all.
 *
 * ACCESSIBILITY
 * -------------
 * The button carries the balance in its accessible name, not just as a visual,
 * so the headline figure is available to a screen reader without opening the
 * panel. The panel is a real modal dialog: focus is trapped and restored,
 * Escape closes, the body is scroll-locked, and every figure is a table row
 * with a header rather than a grid of unlabelled numbers.
 *
 * PORTALED, ALWAYS
 * ----------------
 * Rendered into `document.body` rather than in place. A `position: fixed`
 * element inside an ancestor with a `transform` is positioned against that
 * ancestor, not the viewport — and the tool pages animate their result cards.
 * The portal root re-applies `fx-tools fx-scope` because the colour tokens are
 * scoped to that class and a panel outside it renders with no palette at all.
 */

export interface WalletDockProps {
  items: readonly ExpenseItem[];
  cats: SectionedCats;
  budgetStore: BudgetStore;
  /** The month on screen. The wallet reports the financial year it falls in. */
  month: string;
}

const SECTION_TITLE: Record<CatKey, string> = {
  needs: 'Needs', wants: 'Wants', save: 'Savings & investments',
};

export function WalletDock({ items, cats, budgetStore, month }: WalletDockProps) {
  const { cfmt, code } = useCurrency();
  const [open, setOpen] = useState(false);
  /**
   * The user's CHOICE, not the effective month.
   *
   * Holding the choice and deriving the month means switching the display
   * currency moves the default with it — INR opens in April, AUD in July — while
   * an explicit choice survives the switch untouched. Deriving it also avoids
   * re-reading storage in an effect on every currency change.
   */
  const [fyChoice, setFyChoice] = useState<number | null>(loadFyChoice);
  const fyStart = fyChoice ?? defaultFyStart(code);
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  const wallet = useMemo(
    () => computeWallet({ month, fyStart, items, cats, budgetStore }),
    [month, fyStart, items, cats, budgetStore],
  );

  const close = useCallback(() => setOpen(false), []);
  useBodyScrollLock(open);
  useDialogFocus({ containerRef: panelRef, open });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  // Focus goes back to the trigger on close — `useDialogFocus` restores to
  // whatever had focus when the dialog opened, which is this button.
  useEffect(() => { if (!open) openerRef.current?.blur(); }, [open]);

  const balance = wallet.spendingBalance;
  const tone = wallet.empty ? 'none' : balance > 0 ? 'good' : balance < 0 ? 'bad' : 'level';
  const summary = walletSummary(wallet, cfmt);

  const chooseYear = (next: number) => { setFyChoice(next); saveFyStart(next); };

  return (
    <>
      {/* The DOCK is portaled too, not only the panel.
          A `position: fixed` element is positioned against the nearest ancestor
          with a transform, filter or containment — and the tool pages animate
          their result cards, so a dock rendered in place was pinned five
          thousand pixels down the document instead of to the corner of the
          screen. Measured on a phone, where it was completely unreachable. */}
      {createPortal(
        <div className="fx-tools fx-scope fx-wallet-dock">
          <style>{WALLET_STYLES}</style>
          <button
            ref={openerRef}
            type="button"
            className={`fx-wallet-fab is-${tone}`}
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-label={`Wallet. ${summary}`}
          >
            <Icon name="bank" size={17} />
            <span className="fx-wallet-fab-l">Wallet</span>
            <span className="fx-wallet-fab-v" aria-hidden="true">
              {wallet.empty ? '—' : `${balance < 0 ? '−' : ''}${cfmt(Math.abs(balance))}`}
            </span>
          </button>
        </div>,
        document.body,
      )}

      {open && createPortal(
        <div className="fx-tools fx-scope">
          <style>{WALLET_STYLES}</style>
          <div className="fx-wallet-backdrop" onClick={close} aria-hidden="true" />
          <div
            ref={panelRef}
            className="fx-wallet-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="fx-wallet-title"
            aria-describedby="fx-wallet-sum"
          >
            <div className="fx-wallet-hd">
              <div>
                <h2 id="fx-wallet-title" className="fx-wallet-title">Wallet</h2>
                <p className="fx-wallet-sub" title={wallet.yearRange}>
                  {wallet.yearLabel} · {wallet.yearRange}
                </p>
              </div>
              <button type="button" className="fx-wallet-x" onClick={close} aria-label="Close wallet">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>

            <div className="fx-wallet-body">
              <div className={`fx-wallet-hero is-${tone}`}>
                <span className="fx-wallet-hero-l">
                  {wallet.empty ? 'Nothing budgeted yet'
                    : balance >= 0 ? 'Banked so far this year' : 'Overdrawn so far this year'}
                </span>
                <output className="fx-wallet-hero-v">
                  {wallet.empty ? '—' : `${balance < 0 ? '−' : ''}${cfmt(Math.abs(balance))}`}
                </output>
                <p id="fx-wallet-sum" className="fx-wallet-hero-n">{summary}</p>
              </div>

              {!wallet.empty && (
                <>
                  <div className="fx-wallet-split">
                    <Stat label="Unspent budget" value={cfmt(wallet.banked)} accent="var(--green)"
                      note="Categories that came in under plan" />
                    <Stat label="Overspend" value={cfmt(wallet.overdrawn)} accent="var(--red)"
                      note="Categories that went past plan" />
                    <Stat
                      label={wallet.savingsBalance >= 0 ? 'Saved beyond plan' : 'Behind savings plan'}
                      value={cfmt(Math.abs(wallet.savingsBalance))}
                      accent={wallet.savingsBalance >= 0 ? 'var(--green)' : 'var(--gold)'}
                      note="Savings runs the other way up — more is better"
                    />
                  </div>

                  {/* The sign convention, said in words. A bare "−30" beside a
                      category is exactly the kind of ambiguity money must not
                      have, and no icon can carry this sentence. */}
                  <p className="fx-wallet-key">
                    A <b style={{ color: 'var(--green)' }}>positive</b> balance is budget you set aside and
                    did not need — you can spend it without breaking the plan. A{' '}
                    <b style={{ color: 'var(--red)' }}>negative</b> one is spending still to make up.
                  </p>

                  <WalletTable rows={wallet.rows} cfmt={cfmt} />

                  <p className="fx-wallet-foot">
                    Counting {wallet.monthsCounted.length} budgeted{' '}
                    {wallet.monthsCounted.length === 1 ? 'month' : 'months'}
                    {wallet.monthsCounted.length > 0 && (
                      <> — {monthLabel(wallet.monthsCounted[0])} to {monthLabel(wallet.monthsCounted[wallet.monthsCounted.length - 1])}</>
                    )}
                    . Months with no budget are skipped rather than counted as an overspend.
                  </p>
                </>
              )}

              {wallet.empty && (
                <p className="fx-wallet-foot">
                  The wallet adds up the difference between what you budget and what you spend, month by
                  month, across {wallet.yearLabel}. Set a budget in Budget Builder and it starts keeping
                  score. Months you never budgeted are skipped, never counted against you.
                </p>
              )}

              <FyPicker value={fyStart} onChange={chooseYear} month={month} />
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function Stat({ label, value, note, accent }: {
  label: string; value: string; note: string; accent: string;
}) {
  return (
    <div className="fx-wallet-stat" style={{ '--stat-accent': accent } as React.CSSProperties}>
      <span className="fx-wallet-stat-l">{label}</span>
      <span className="fx-wallet-stat-v">{value}</span>
      <span className="fx-wallet-stat-n">{note}</span>
    </div>
  );
}

/**
 * The per-category ledger.
 *
 * A real `<table>` with a caption and column headers, not a stack of divs: the
 * whole content is a numeric comparison across three columns, which is what
 * table semantics exist for. A screen reader announces "Eating Out, budgeted
 * 24,000, spent 26,400, balance minus 2,400" instead of nine loose figures.
 */
function WalletTable({ rows, cfmt }: { rows: WalletRow[]; cfmt: (n: number) => string }) {
  const grouped = (['needs', 'wants', 'save'] as CatKey[])
    .map((section) => ({ section, rows: rows.filter((r) => r.section === section) }))
    .filter((g) => g.rows.length > 0);

  if (grouped.length === 0) {
    return <p className="fx-wallet-foot">No category has a budget or a spend in this year yet.</p>;
  }

  return (
    <div className="fx-wallet-tablewrap">
      <table className="fx-wallet-table">
        <caption className="fx-sr-only">
          Budget, actual and carry-over balance for every category this financial year
        </caption>
        <thead>
          <tr>
            <th scope="col">Category</th>
            <th scope="col">Budgeted</th>
            <th scope="col">Actual</th>
            <th scope="col">Balance</th>
          </tr>
        </thead>
        {grouped.map((g) => (
          <tbody key={g.section}>
            <tr className="fx-wallet-grouprow">
              <th scope="colgroup" colSpan={4} style={{ color: SECTION_COLOR[g.section] }}>
                {SECTION_TITLE[g.section]}
              </th>
            </tr>
            {g.rows.map((r) => (
              <tr key={r.k}>
                <th scope="row">
                  <span className="fx-wallet-cat">
                    <Icon name={r.ic} size={15} style={{ color: SECTION_COLOR[r.section], flexShrink: 0 }} />
                    <span className="fx-wallet-catl">{r.label}</span>
                  </span>
                </th>
                <td>{cfmt(r.budgeted)}</td>
                <td>{cfmt(r.actual)}</td>
                <td
                  className="fx-wallet-bal"
                  style={{ color: r.balance > 0 ? 'var(--green)' : r.balance < 0 ? 'var(--red)' : 'var(--ink2)' }}
                >
                  {r.balance < 0 ? '−' : r.balance > 0 ? '+' : ''}{cfmt(Math.abs(r.balance))}
                </td>
              </tr>
            ))}
          </tbody>
        ))}
      </table>
    </div>
  );
}

/**
 * Which months the year runs over.
 *
 * Lives inside the wallet rather than in Settings because this is the only
 * screen whose numbers change when it moves — a setting is easiest to
 * understand next to the thing it alters.
 */
function FyPicker({ value, onChange, month }: {
  value: number; onChange: (m: number) => void; month: string;
}) {
  const months = fyAllMonths(month, value);
  return (
    <div className="fx-wallet-fy">
      <label className="fx-wallet-fy-l" htmlFor="fx-wallet-fy">Financial year starts in</label>
      <select
        id="fx-wallet-fy"
        className="fx-wallet-fy-s"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {MONTH_NAMES.slice(1).map((name, i) => (
          <option key={name} value={i + 1}>{name}</option>
        ))}
      </select>
      <span className="fx-wallet-fy-n">
        {months.length === 12 ? `${monthLabel(months[0])} to ${monthLabel(months[11])}` : ''}
      </span>
    </div>
  );
}

const WALLET_STYLES = `
.fx-tools .fx-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}

/* Dock — bottom LEFT, mirroring the assistant's bottom right, so the two never
   overlap and neither has to move when the other appears. */
.fx-tools.fx-wallet-dock,.fx-tools .fx-wallet-dock{position:fixed;left:16px;
  bottom:calc(18px + var(--fx-bottomnav-h,0px) + env(safe-area-inset-bottom));
  z-index:var(--z-fab);display:flex;}
.fx-tools .fx-wallet-fab{display:inline-flex;align-items:center;gap:9px;height:var(--ctl-h-lg);padding:0 16px;
  border-radius:var(--ctl-pill);border:var(--ctl-bw) solid var(--hair);background:var(--card-solid,var(--card));
  color:var(--ink);font-family:inherit;font-size:13px;font-weight:600;cursor:pointer;
  box-shadow:0 14px 34px -14px rgba(0,0,0,.55);max-width:min(70vw,320px);
  transition:box-shadow var(--ctl-trans),border-color var(--ctl-trans),transform var(--ctl-trans);
  animation:fxWalletIn 220ms var(--ease-out) backwards;
  -webkit-tap-highlight-color:transparent;touch-action:manipulation;}
.fx-tools .fx-wallet-fab:hover{border-color:var(--gold);box-shadow:0 18px 42px -14px rgba(0,0,0,.6);}
.fx-tools .fx-wallet-fab:active{transform:scale(.97);}
.fx-tools .fx-wallet-fab:focus-visible{outline:2px solid var(--gold);outline-offset:3px;}
.fx-tools .fx-wallet-fab-l{flex-shrink:0;}
.fx-tools .fx-wallet-fab-v{font-variant-numeric:tabular-nums;font-weight:700;letter-spacing:-.01em;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fx-tools .fx-wallet-fab.is-good .fx-wallet-fab-v{color:var(--green);}
.fx-tools .fx-wallet-fab.is-bad .fx-wallet-fab-v{color:var(--red);}
.fx-tools .fx-wallet-fab.is-level .fx-wallet-fab-v,
.fx-tools .fx-wallet-fab.is-none .fx-wallet-fab-v{color:var(--ink3);}
.fx-tools .fx-wallet-fab svg{color:var(--gold);flex-shrink:0;}
@keyframes fxWalletIn{from{opacity:0;transform:scale(.86);}to{opacity:1;transform:none;}}
/* Below the tablet breakpoint the label is dropped before the figure is: the
   number is the reason to look at it. */
@media(max-width:520px){
  .fx-tools.fx-wallet-dock,.fx-tools .fx-wallet-dock{left:12px;}
  .fx-tools .fx-wallet-fab{padding:0 13px;gap:7px;}
  .fx-tools .fx-wallet-fab-l{display:none;}
}

/* Panel */
.fx-tools .fx-wallet-backdrop{position:fixed;inset:0;z-index:var(--z-panel);background:rgba(0,0,0,.45);
  backdrop-filter:blur(3px);-webkit-backdrop-filter:blur(3px);animation:fxWalletFade 180ms ease both;}
.fx-tools .fx-wallet-panel{position:fixed;z-index:calc(var(--z-panel) + 1);
  left:50%;transform:translateX(-50%);bottom:0;width:min(680px,100vw);
  max-height:min(86dvh,760px);display:flex;flex-direction:column;
  background:var(--card-solid,var(--card));border:1px solid var(--hair);
  border-radius:20px 20px 0 0;box-shadow:0 -22px 70px -20px rgba(0,0,0,.7);
  animation:fxWalletUp 240ms cubic-bezier(.32,1.05,.5,1) both;}
@media(min-width:720px){
  .fx-tools .fx-wallet-panel{bottom:24px;border-radius:20px;}
}
@keyframes fxWalletFade{from{opacity:0}to{opacity:1}}
@keyframes fxWalletUp{from{opacity:0;transform:translate(-50%,26px)}to{opacity:1;transform:translate(-50%,0)}}

.fx-tools .fx-wallet-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;
  padding:18px 20px 12px;border-bottom:1px solid var(--hair2);flex-shrink:0;}
.fx-tools .fx-wallet-title{font-size:17px;font-weight:700;letter-spacing:-.02em;color:var(--ink);margin:0;}
.fx-tools .fx-wallet-sub{font-size:11.5px;color:var(--ink3);margin:3px 0 0;font-weight:600;}
.fx-tools .fx-wallet-x{display:inline-flex;align-items:center;justify-content:center;
  width:var(--ctl-h-sm);height:var(--ctl-h-sm);flex-shrink:0;border-radius:var(--ctl-r-sm);
  border:var(--ctl-bw) solid var(--hair2);background:var(--well);color:var(--ink2);cursor:pointer;}
.fx-tools .fx-wallet-x:hover{background:var(--fill-06);color:var(--ink);}

.fx-tools .fx-wallet-body{padding:16px 20px 22px;overflow-y:auto;-webkit-overflow-scrolling:touch;}

.fx-tools .fx-wallet-hero{position:relative;overflow:hidden;padding:16px 18px;border-radius:var(--ctl-r-lg);
  background:var(--well);border:1px solid var(--well-border);margin-bottom:14px;}
.fx-tools .fx-wallet-hero::before{content:"";position:absolute;left:0;top:0;height:100%;width:3px;background:var(--ink3);}
.fx-tools .fx-wallet-hero.is-good::before{background:var(--green);}
.fx-tools .fx-wallet-hero.is-bad::before{background:var(--red);}
.fx-tools .fx-wallet-hero-l{display:block;font-size:11.5px;font-weight:600;letter-spacing:.04em;
  text-transform:uppercase;color:var(--ink2);}
.fx-tools .fx-wallet-hero-v{display:block;font-size:32px;font-weight:700;letter-spacing:-.025em;line-height:1.1;
  margin-top:4px;color:var(--ink);font-variant-numeric:tabular-nums;}
.fx-tools .fx-wallet-hero.is-good .fx-wallet-hero-v{color:var(--green);}
.fx-tools .fx-wallet-hero.is-bad .fx-wallet-hero-v{color:var(--red);}
.fx-tools .fx-wallet-hero-n{font-size:12.5px;color:var(--ink2);line-height:1.5;margin:8px 0 0;}

.fx-tools .fx-wallet-split{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px;}
.fx-tools .fx-wallet-stat{padding:12px 14px;border-radius:var(--ctl-r-md);background:var(--well);
  border:1px solid var(--well-border);border-left:3px solid var(--stat-accent);}
.fx-tools .fx-wallet-stat-l{display:block;font-size:10.5px;font-weight:700;letter-spacing:.05em;
  text-transform:uppercase;color:var(--ink3);}
.fx-tools .fx-wallet-stat-v{display:block;font-size:19px;font-weight:700;letter-spacing:-.02em;margin-top:3px;
  color:var(--stat-accent);font-variant-numeric:tabular-nums;}
.fx-tools .fx-wallet-stat-n{display:block;font-size:11px;color:var(--ink3);margin-top:3px;line-height:1.4;}

.fx-tools .fx-wallet-key{font-size:12px;color:var(--ink2);line-height:1.6;margin:0 0 14px;
  padding:10px 12px;border-radius:var(--ctl-r-md);background:var(--fill-04);}

.fx-tools .fx-wallet-tablewrap{overflow-x:auto;-webkit-overflow-scrolling:touch;margin-bottom:12px;}
.fx-tools .fx-wallet-table{width:100%;border-collapse:collapse;font-size:12.5px;min-width:420px;}
.fx-tools .fx-wallet-table th,.fx-tools .fx-wallet-table td{text-align:right;padding:8px 10px;
  border-bottom:1px solid var(--hair2);font-variant-numeric:tabular-nums;}
.fx-tools .fx-wallet-table thead th{font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;
  color:var(--ink3);position:sticky;top:0;background:var(--card-solid,var(--card));}
.fx-tools .fx-wallet-table th:first-child,.fx-tools .fx-wallet-table tbody th{text-align:left;font-weight:500;color:var(--ink);}
.fx-tools .fx-wallet-grouprow th{text-align:left;font-size:11px;font-weight:700;letter-spacing:.04em;
  text-transform:uppercase;padding-top:14px;border-bottom:none;}
.fx-tools .fx-wallet-cat{display:inline-flex;align-items:center;gap:8px;min-width:0;}
.fx-tools .fx-wallet-catl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:180px;}
.fx-tools .fx-wallet-bal{font-weight:700;}

.fx-tools .fx-wallet-foot{font-size:11.5px;color:var(--ink3);line-height:1.6;margin:0 0 14px;}

.fx-tools .fx-wallet-fy{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:14px;
  border-top:1px solid var(--hair2);}
.fx-tools .fx-wallet-fy-l{font-size:12px;color:var(--ink2);font-weight:600;}
.fx-tools .fx-wallet-fy-s{min-height:var(--ctl-h-sm);padding:0 10px;border-radius:var(--ctl-r-sm);
  border:var(--ctl-bw) solid var(--hair2);background:var(--well);color:var(--ink);font-family:inherit;
  font-size:12px;font-weight:600;cursor:pointer;}
.fx-tools .fx-wallet-fy-n{font-size:11.5px;color:var(--ink3);}

@media (prefers-reduced-motion:reduce){
  .fx-tools .fx-wallet-fab,.fx-tools .fx-wallet-panel,.fx-tools .fx-wallet-backdrop{animation:none;transition:none;}
  .fx-tools .fx-wallet-fab:active{transform:none;}
}
@media print{.fx-tools.fx-wallet-dock,.fx-tools .fx-wallet-dock{display:none;}}
`;

export default WalletDock;
