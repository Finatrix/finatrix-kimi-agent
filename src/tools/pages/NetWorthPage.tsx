import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PageHead, ToolFoot, MethodologyNote } from '../ui/common';
import { Icon } from '../ui/Icon';
import { MonthNav } from '../ui/MonthNav';
import { AmountInput } from '../ui/AmountInput';
import { useOptionalToast } from '../ui/Toast';
import { useCurrency } from '../CurrencyContext';
import { currentMonth, monthLabel } from '../lib/month';
import { onLocalWrite } from '../lib/storage';
import { csvBlob } from '../../lib/csv';
import { downloadBlob } from '../lib/exporters';
import { evaluateFormula } from '../lib/formula';
import { track } from '../../lib/analytics';
import {
  NET_WORTH_KEY, balanceAt, categoriesFor, categoryFor, changeBetween, computeNetWorth,
  exportRows, genAccountId, lastRecordedMonth, loadAccounts, monthsBetween, monthsWithData,
  netWorthSeries, saveAccounts, setBalance, staleAccounts,
  type AccountBalance, type AccountKind, type NetWorthAccount, type SeriesPoint,
} from '../lib/netWorth';

/**
 * Net Worth — what you own, minus what you owe, month by month.
 *
 * WHY IT EXISTS
 * -------------
 * Every other tool here answers a question about a month: what to budget, what
 * was spent, what to invest. Net worth is the only number that answers "is any
 * of this working?", and it is the one figure a person can watch for a decade.
 * FinatriX published guides about it and had nowhere to record it.
 *
 * WHAT IT DOES NOT DO
 * -------------------
 * It does not project, grow, discount or estimate anything. Every figure on
 * this page is a balance the user typed, or a sum of balances the user typed —
 * see the model in lib/netWorth.ts, which owns the arithmetic and the one rule
 * that needs explaining (balances carry forward until updated).
 */

const ASSET_COLOR = 'var(--green)';
const LIABILITY_COLOR = 'var(--orange)';

interface DraftAccount {
  name: string;
  kind: AccountKind;
  category: string;
  balance: string;
}

const EMPTY_DRAFT: DraftAccount = { name: '', kind: 'asset', category: 'cash', balance: '' };

export default function NetWorthPage() {
  const { cfmt, cfmtSh, sym } = useCurrency();
  const toast = useOptionalToast();
  const [accounts, setAccounts] = useState<NetWorthAccount[]>(loadAccounts);
  const [selMonth, setSelMonth] = useState(currentMonth);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<DraftAccount>(EMPTY_DRAFT);
  const [draftError, setDraftError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  // Follow writes from elsewhere — a cloud-sync pull on sign-in, or another tab.
  useEffect(() => {
    const off = onLocalWrite((key) => {
      if (key === NET_WORTH_KEY) setAccounts(loadAccounts());
    });
    const onStorage = (e: StorageEvent) => {
      if (e.key === NET_WORTH_KEY) setAccounts(loadAccounts());
    };
    window.addEventListener('storage', onStorage);
    return () => {
      off();
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const commit = useCallback((next: NetWorthAccount[]) => {
    setAccounts(next);
    saveAccounts(next);
  }, []);

  const months = useMemo(() => monthsWithData(accounts), [accounts]);
  const snapshot = useMemo(() => computeNetWorth(accounts, selMonth), [accounts, selMonth]);
  const series = useMemo(() => netWorthSeries(accounts, selMonth), [accounts, selMonth]);
  const stale = useMemo(() => staleAccounts(accounts, selMonth), [accounts, selMonth]);

  const prior = series.length > 1 ? series[series.length - 2] : null;
  const change = prior ? changeBetween(prior.net, snapshot.net) : null;

  /**
   * Accounts that did not exist yet in the month being viewed.
   *
   * They contribute nothing to any total — that is the model's rule and it is
   * the honest one — but they are still offered a field here, because the
   * alternative is that history can never be filled in: someone who starts in
   * August and wants their line to begin in April has no way to say what April
   * held. Entering a figure here backdates the account's first record.
   */
  const pending = useMemo(
    () => accounts.filter((a) => balanceAt(a, selMonth) === null),
    [accounts, selMonth],
  );

  const addAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const name = draft.name.trim();
    if (!name) {
      setDraftError('Give the account a name you will recognise later.');
      nameRef.current?.focus();
      return;
    }
    const parsed = draft.balance.trim() ? evaluateFormula(draft.balance.trim()) : null;
    if (draft.balance.trim() && !parsed?.ok) {
      setDraftError('That balance is not a number this can read.');
      return;
    }
    const value = Math.max(0, parsed?.ok ? parsed.value : 0);
    const account: NetWorthAccount = {
      id: genAccountId(),
      name,
      kind: draft.kind,
      category: draft.category,
      balances: { [selMonth]: value },
    };
    commit([...accounts, account]);
    setDraft({ ...EMPTY_DRAFT, kind: draft.kind, category: draft.category });
    setDraftError('');
    setAdding(false);
    track('tool_completed', { tool: 'networth', action: 'account_added' });
    toast?.notify(`${name} added`, 'ok');
  };

  const removeAccount = (id: string) => {
    const gone = accounts.find((a) => a.id === id);
    commit(accounts.filter((a) => a.id !== id));
    setConfirmDelete(null);
    if (gone) toast?.notify(`${gone.name} removed`, 'info');
  };

  const updateBalance = (id: string, raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) {
      commit(setBalance(accounts, id, selMonth, null));
      return;
    }
    const parsed = evaluateFormula(trimmed);
    if (!parsed.ok) return; // leave the field alone until it reads as a number
    commit(setBalance(accounts, id, selMonth, parsed.value));
  };

  const exportCsv = () => {
    downloadBlob(`finatrix-net-worth-${selMonth}.csv`, csvBlob(exportRows(accounts)));
    track('report_exported', { kind: 'csv', where: 'networth' });
  };

  const hasAccounts = accounts.length > 0;

  return (
    <div className="fx-page">
      <style>{STYLES}</style>
      {/* `--accent-text` rather than `--gold` for anything that is TEXT: the
          same brand gold deepens to a burnished tone on the light theme, where
          the flat gold does not clear AA against a tinted surface. */}
      <PageHead
        chip="Net Worth"
        chipColor="var(--accent-text)"
        chipBg="rgba(212,175,55,.12)"
        icon="trending"
        title="What you own, minus what you owe."
      >
        The one number that answers whether any of the rest is working. Record what you hold and
        what you owe, update it when it changes, and watch the line — nothing here is projected,
        estimated or grown on your behalf.
      </PageHead>

      {hasAccounts && (
        <div style={{ marginBottom: 14 }}>
          <MonthNav
            activeMonth={selMonth}
            months={months}
            onSwitch={setSelMonth}
            pastNote="Viewing an earlier month"
            pastColor="var(--gold)"
          />
        </div>
      )}

      {!hasAccounts ? (
        <EmptyState onStart={() => { setAdding(true); requestAnimationFrame(() => nameRef.current?.focus()); }} />
      ) : (
        <>
          <div className="nw-kpis">
            <Kpi
              label="Net worth"
              value={cfmt(snapshot.net)}
              accent="var(--accent-text)"
              foot={
                change
                  ? `${change.abs >= 0 ? '+' : '−'}${cfmtSh(Math.abs(change.abs))}${
                      change.pct === null ? '' : ` (${change.abs >= 0 ? '+' : '−'}${Math.abs(change.pct).toFixed(1)}%)`
                    } vs ${monthLabel(prior!.month)}`
                  : 'Your first recorded month'
              }
              tone={change ? (change.abs >= 0 ? 'up' : 'down') : 'flat'}
            />
            <Kpi label="Assets" value={cfmt(snapshot.assets)} accent={ASSET_COLOR} foot={`${snapshot.assetRows.length} account${snapshot.assetRows.length === 1 ? '' : 's'}`} />
            <Kpi
              label="Liabilities"
              value={cfmt(snapshot.liabilities)}
              accent={LIABILITY_COLOR}
              foot={snapshot.debtRatio === null ? 'No assets recorded yet' : `${snapshot.debtRatio.toFixed(0)}% of assets`}
            />
          </div>

          {series.length > 1 && <Trend series={series} cfmtSh={cfmtSh} cfmt={cfmt} />}

          {stale.length > 0 && (
            <p className="nw-stale" role="note">
              <Icon name="warn" size={15} aria-hidden="true" />
              <span>
                {stale.length === 1
                  ? `${stale[0].name} hasn’t been updated in ${monthsBetween(
                      lastRecordedMonth(stale[0], selMonth) ?? selMonth,
                      selMonth,
                    )} months.`
                  : `${stale.length} accounts haven’t been updated in three months or more.`}{' '}
                Their last recorded balance is what you are seeing.
              </span>
            </p>
          )}

          <div className="nw-sheet">
            <Side
              title="Assets"
              subtitle="What you own"
              color={ASSET_COLOR}
              rows={snapshot.assetRows}
              pending={pending.filter((a) => a.kind === 'asset')}
              categories={snapshot.assetCategories}
              total={snapshot.assets}
              month={selMonth}
              sym={sym}
              cfmt={cfmt}
              onBalance={updateBalance}
              onDelete={removeAccount}
              confirmId={confirmDelete}
              setConfirmId={setConfirmDelete}
            />
            <Side
              title="Liabilities"
              subtitle="What you owe"
              color={LIABILITY_COLOR}
              rows={snapshot.liabilityRows}
              pending={pending.filter((a) => a.kind === 'liability')}
              categories={snapshot.liabilityCategories}
              total={snapshot.liabilities}
              month={selMonth}
              sym={sym}
              cfmt={cfmt}
              onBalance={updateBalance}
              onDelete={removeAccount}
              confirmId={confirmDelete}
              setConfirmId={setConfirmDelete}
            />
          </div>

          <div className="nw-actions">
            {!adding && (
              <button type="button" className="btn btn-sm" onClick={() => { setAdding(true); requestAnimationFrame(() => nameRef.current?.focus()); }}>
                <Icon name="plus" size={15} style={{ marginRight: 6 }} aria-hidden="true" />
                Add an account
              </button>
            )}
            <button type="button" className="btn btn-ghost btn-sm" onClick={exportCsv}>Export CSV</button>
          </div>
        </>
      )}

      {adding && (
        <AddForm
          draft={draft}
          setDraft={setDraft}
          error={draftError}
          nameRef={nameRef}
          sym={sym}
          month={selMonth}
          onSubmit={addAccount}
          onCancel={() => { setAdding(false); setDraftError(''); }}
        />
      )}

      <MethodologyNote>
        Net worth is one subtraction: everything you own, minus everything you owe, on the month
        you are looking at. Balances carry forward — an account keeps its last recorded value until
        you enter a new one, so you only update what actually changed — and an account contributes
        nothing to any month before its first entry. Nothing is projected, no return is assumed and
        no figure is adjusted for inflation. If you did not type it, it is not on this page.
      </MethodologyNote>

      <ToolFoot>
        Stored on this device, and synced to your account when you are signed in. Educational —
        not investment advice.
      </ToolFoot>
    </div>
  );
}

function Kpi({ label, value, accent, foot, tone = 'flat' }: {
  label: string; value: string; accent: string; foot: string; tone?: 'up' | 'down' | 'flat';
}) {
  return (
    <div className="card nw-kpi">
      <div className="nw-kpi-label">{label}</div>
      <div className="nw-kpi-value" style={{ color: accent }}>{value}</div>
      <div className={`nw-kpi-foot tone-${tone}`}>{foot}</div>
    </div>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="card nw-empty">
      <Icon name="trending" size={28} aria-hidden="true" />
      <h2>Start with what you can see today</h2>
      <p>
        One bank balance is enough to begin. Add the rest as you find them — a deposit, a mutual
        fund, the loan outstanding on your last statement. The line only becomes useful once there
        are two months on it, so the sooner the first one exists, the better.
      </p>
      <button type="button" className="btn btn-sm" onClick={onStart}>
        <Icon name="plus" size={15} style={{ marginRight: 6 }} aria-hidden="true" />
        Add your first account
      </button>
    </div>
  );
}

/**
 * The trend line.
 *
 * Hand-drawn SVG rather than a chart library: it is one polyline, it inherits
 * the theme tokens directly, it adds nothing to the bundle, and — unlike a
 * canvas — the same markup can carry the accessible description. The table
 * below it is the non-visual equivalent, not a fallback.
 */
function Trend({ series, cfmt, cfmtSh }: {
  series: SeriesPoint[]; cfmt: (n: number) => string; cfmtSh: (n: number) => string;
}) {
  const W = 640;
  const H = 140;
  const PAD = 8;
  const values = series.map((p) => p.net);
  /**
   * The axis is scaled to the data, not anchored at zero — a net worth of ₹27
   * lakh plotted from zero is a flat line that hides the only thing the chart
   * is for. The trade is that a truncated axis can exaggerate a small move, so
   * both ends of the range are printed beside it rather than left implicit.
   */
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.12 || Math.max(Math.abs(hi) * 0.1, 1);
  const min = lo - pad;
  const max = hi + pad;
  const span = max - min || 1;
  const x = (i: number) => (series.length === 1 ? W / 2 : PAD + (i * (W - PAD * 2)) / (series.length - 1));
  const y = (v: number) => H - PAD - ((v - min) / span) * (H - PAD * 2);
  const points = series.map((p, i) => `${x(i).toFixed(1)},${y(p.net).toFixed(1)}`).join(' ');
  const crossesZero = min < 0 && max > 0;
  const zeroY = y(0);

  const first = series[0];
  const last = series[series.length - 1];
  const summary = `Net worth from ${monthLabel(first.month)} to ${monthLabel(last.month)}: ${cfmt(first.net)} to ${cfmt(last.net)}.`;

  return (
    <div className="card nw-trend">
      <div className="nw-trend-head">
        <h2>Trend</h2>
        <span>{series.length} months</span>
      </div>
      <div className="nw-trend-plot">
        <div className="nw-trend-axis" aria-hidden="true">
          <span>{cfmtSh(hi)}</span>
          <span>{cfmtSh(lo)}</span>
        </div>
        <svg viewBox={`0 0 ${W} ${H}`} className="nw-trend-svg" role="img" aria-label={summary} preserveAspectRatio="none">
          {crossesZero && (
            <line x1="0" y1={zeroY} x2={W} y2={zeroY} stroke="var(--hair)" strokeWidth="1" strokeDasharray="4 4" />
          )}
          <polyline points={points} fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <circle cx={x(series.length - 1)} cy={y(last.net)} r="3.5" fill="var(--gold)" />
        </svg>
      </div>
      <details className="nw-table-toggle">
        <summary>View as a table</summary>
        <table className="nw-table">
          <caption className="sr-only">Net worth by month</caption>
          <thead>
            <tr><th scope="col">Month</th><th scope="col">Assets</th><th scope="col">Liabilities</th><th scope="col">Net worth</th></tr>
          </thead>
          <tbody>
            {series.map((p) => (
              <tr key={p.month}>
                <th scope="row">{monthLabel(p.month)}</th>
                <td>{cfmtSh(p.assets)}</td>
                <td>{cfmtSh(p.liabilities)}</td>
                <td>{cfmtSh(p.net)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

function Side({
  title, subtitle, color, rows, pending, categories, total, month, sym, cfmt,
  onBalance, onDelete, confirmId, setConfirmId,
}: {
  title: string;
  subtitle: string;
  color: string;
  rows: AccountBalance[];
  /** Accounts with no balance recorded on or before this month. */
  pending: NetWorthAccount[];
  categories: { category: { k: string; l: string }; total: number; share: number }[];
  total: number;
  month: string;
  sym: string;
  cfmt: (n: number) => string;
  onBalance: (id: string, value: string) => void;
  onDelete: (id: string) => void;
  confirmId: string | null;
  setConfirmId: (id: string | null) => void;
}) {
  return (
    <section className="card nw-side" aria-labelledby={`nw-${title.toLowerCase()}`}>
      <div className="nw-side-head">
        <div>
          <h2 id={`nw-${title.toLowerCase()}`}>{title}</h2>
          <p>{subtitle}</p>
        </div>
        <div className="nw-side-total" style={{ color }}>{cfmt(total)}</div>
      </div>

      {categories.length > 0 && (
        <div className="nw-bar" role="img" aria-label={categories.map((c) => `${c.category.l} ${c.share.toFixed(0)} percent`).join(', ')}>
          {categories.map((c, i) => (
            <span key={c.category.k} style={{ width: `${c.share}%`, background: color, opacity: 1 - i * 0.16 }} />
          ))}
        </div>
      )}

      {rows.length === 0 && pending.length === 0 ? (
        <p className="nw-side-empty">Nothing recorded here yet.</p>
      ) : (
        <ul className="nw-rows">
          {rows.map((row) => (
            <Row
              key={row.account.id}
              row={row}
              month={month}
              sym={sym}
              onBalance={onBalance}
              onDelete={onDelete}
              confirming={confirmId === row.account.id}
              setConfirmId={setConfirmId}
            />
          ))}
        </ul>
      )}

      {pending.length > 0 && (
        <>
          <p className="nw-pending-head">{`Not recorded in ${monthLabel(month)}`}</p>
          <ul className="nw-rows nw-rows-pending">
            {pending.map((account) => (
              <Row
                key={account.id}
                row={{ account, balance: 0, recorded: month, current: false, share: 0 }}
                month={month}
                sym={sym}
                blank
                onBalance={onBalance}
                onDelete={onDelete}
                confirming={confirmId === account.id}
                setConfirmId={setConfirmId}
              />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function Row({ row, month, sym, blank = false, onBalance, onDelete, confirming, setConfirmId }: {
  row: AccountBalance;
  month: string;
  sym: string;
  /** The account has no balance here yet — show an empty field, not a zero. */
  blank?: boolean;
  onBalance: (id: string, value: string) => void;
  onDelete: (id: string) => void;
  confirming: boolean;
  setConfirmId: (id: string | null) => void;
}) {
  const { account, balance, current, recorded } = row;
  const category = categoryFor(account.category);

  /**
   * The field keeps the raw text the user typed, and re-seeds only when the
   * month changes — the documented "adjust state during render" pattern rather
   * than an effect, which would run a frame late and fight the keystroke.
   *
   * Deliberately NOT re-seeded from `balance`: every parseable keystroke
   * commits, so mirroring the committed value back would rewrite "12000+3" as
   * "12003" the moment it parsed, and a formula could never be finished.
   */
  const [text, setText] = useState(blank ? '' : String(balance));
  const [seedMonth, setSeedMonth] = useState(month);
  if (seedMonth !== month) {
    setSeedMonth(month);
    setText(blank ? '' : String(balance));
  }

  const fieldId = `nw-bal-${account.id}`;

  return (
    <li className="nw-row">
      <span className="nw-row-icon" aria-hidden="true">
        <Icon name={category?.ic ?? 'other'} size={16} />
      </span>
      <span className="nw-row-main">
        <span className="nw-row-name">{account.name}</span>
        <span className="nw-row-meta">
          {category?.l ?? 'Other'}
          {!current && !blank && ` · from ${monthLabel(recorded)}`}
        </span>
      </span>
      <span className="nw-row-field">
        <label className="sr-only" htmlFor={fieldId}>
          {`${account.name} balance for ${monthLabel(month)}`}
        </label>
        <AmountInput
          id={fieldId}
          className="fi-sm"
          value={text}
          onChange={(v) => { setText(v); onBalance(account.id, v); }}
          sym={sym}
          placeholder="0"
        />
      </span>
      {confirming ? (
        <span className="nw-row-confirm">
          <button type="button" className="nw-danger" onClick={() => onDelete(account.id)}>
            {`Delete ${account.name}`}
          </button>
          <button type="button" className="nw-quiet" onClick={() => setConfirmId(null)}>Cancel</button>
        </span>
      ) : (
        <button
          type="button"
          className="nw-row-del"
          onClick={() => setConfirmId(account.id)}
          aria-label={`Remove ${account.name}`}
        >
          <Icon name="trash" size={15} aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

function AddForm({ draft, setDraft, error, nameRef, sym, month, onSubmit, onCancel }: {
  draft: DraftAccount;
  setDraft: (d: DraftAccount) => void;
  error: string;
  nameRef: React.RefObject<HTMLInputElement | null>;
  sym: string;
  month: string;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}) {
  const categories = categoriesFor(draft.kind);
  return (
    <form className="card nw-add" onSubmit={onSubmit} noValidate>
      <h2>Add an account</h2>
      <div className="grid2">
        <div className="fg">
          <label className="fl" htmlFor="nw-name">What is it?</label>
          <input
            id="nw-name"
            ref={nameRef}
            className="fi"
            type="text"
            maxLength={48}
            placeholder="e.g. HDFC savings, Home loan"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            aria-invalid={!!error && !draft.name.trim()}
            aria-describedby={error ? 'nw-add-error' : undefined}
          />
        </div>
        <div className="fg">
          <label className="fl" htmlFor="nw-balance">{`Balance in ${monthLabel(month)}`}</label>
          <AmountInput
            id="nw-balance"
            value={draft.balance}
            onChange={(v) => setDraft({ ...draft, balance: v })}
            sym={sym}
            placeholder="0"
          />
        </div>
      </div>

      <fieldset className="nw-kind">
        <legend className="fl">Is it something you own, or something you owe?</legend>
        {(['asset', 'liability'] as const).map((kind) => (
          <label key={kind} className={`nw-kind-opt${draft.kind === kind ? ' on' : ''}`}>
            <input
              type="radio"
              name="nw-kind"
              value={kind}
              checked={draft.kind === kind}
              onChange={() => setDraft({ ...draft, kind, category: categoriesFor(kind)[0].k })}
            />
            {kind === 'asset' ? 'I own it' : 'I owe it'}
          </label>
        ))}
      </fieldset>

      <div className="fg">
        <label className="fl" htmlFor="nw-category">Category</label>
        <select
          id="nw-category"
          className="fs"
          value={draft.category}
          onChange={(e) => setDraft({ ...draft, category: e.target.value })}
        >
          {categories.map((c) => <option key={c.k} value={c.k}>{c.l}</option>)}
        </select>
      </div>

      {error && <p className="nw-error" id="nw-add-error" role="alert">{error}</p>}

      <div className="nw-actions">
        <button type="submit" className="btn btn-sm">Add account</button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

const STYLES = `
.fx-tools .nw-kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px;}
.fx-tools .nw-kpi{margin-bottom:0;padding:18px 20px;}
.fx-tools .nw-kpi-label{font-size:12px;color:var(--ink2);font-weight:600;}
.fx-tools .nw-kpi-value{font-size:26px;font-weight:700;letter-spacing:-.02em;margin-top:6px;}
.fx-tools .nw-kpi-foot{font-size:12px;color:var(--ink3);margin-top:5px;}
.fx-tools .nw-kpi-foot.tone-up{color:var(--green);}
.fx-tools .nw-kpi-foot.tone-down{color:var(--orange);}

.fx-tools .nw-trend-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-bottom:10px;}
.fx-tools .nw-trend-head h2{font-size:14px;font-weight:700;}
.fx-tools .nw-trend-head span{font-size:12px;color:var(--ink3);}
.fx-tools .nw-trend-plot{display:flex;gap:10px;align-items:stretch;}
.fx-tools .nw-trend-axis{display:flex;flex-direction:column;justify-content:space-between;
  font-size:11px;color:var(--ink3);flex:0 0 auto;padding:2px 0;font-variant-numeric:tabular-nums;}
.fx-tools .nw-trend-svg{width:100%;height:140px;display:block;flex:1 1 auto;min-width:0;}
.fx-tools .nw-table-toggle{margin-top:12px;}
.fx-tools .nw-table-toggle summary{font-size:12.5px;color:var(--ink2);cursor:pointer;}
.fx-tools .nw-table{width:100%;border-collapse:collapse;margin-top:10px;font-size:12.5px;}
.fx-tools .nw-table th,.fx-tools .nw-table td{text-align:right;padding:6px 8px;border-top:1px solid var(--hair2);}
.fx-tools .nw-table thead th,.fx-tools .nw-table tbody th{text-align:left;color:var(--ink2);font-weight:600;}

.fx-tools .nw-stale{display:flex;align-items:flex-start;gap:9px;font-size:12.5px;color:var(--ink2);
  background:var(--fill-03);border:1px solid var(--hair2);border-radius:12px;padding:11px 14px;margin-bottom:16px;line-height:1.5;}
.fx-tools .nw-stale svg{color:var(--orange);flex:0 0 auto;margin-top:1px;}

.fx-tools .nw-sheet{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start;}
.fx-tools .nw-side-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;}
.fx-tools .nw-side-head h2{font-size:14px;font-weight:700;}
.fx-tools .nw-side-head p{font-size:12px;color:var(--ink3);margin-top:2px;}
.fx-tools .nw-side-total{font-size:19px;font-weight:700;letter-spacing:-.01em;white-space:nowrap;}
.fx-tools .nw-bar{display:flex;height:7px;border-radius:980px;overflow:hidden;background:var(--hair2);margin-bottom:14px;}
.fx-tools .nw-bar span{display:block;}
.fx-tools .nw-side-empty{font-size:12.5px;color:var(--ink3);}
.fx-tools .nw-pending-head{font-size:11.5px;color:var(--ink3);margin:14px 0 2px;}
.fx-tools .nw-rows-pending .nw-row-name{color:var(--ink2);}
.fx-tools .nw-rows{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;}
.fx-tools .nw-row{display:flex;align-items:center;gap:10px;padding:9px 0;border-top:1px solid var(--hair2);flex-wrap:wrap;}
.fx-tools .nw-row:first-child{border-top:none;}
.fx-tools .nw-row-icon{color:var(--ink3);display:inline-flex;flex:0 0 auto;}
.fx-tools .nw-row-main{display:flex;flex-direction:column;min-width:0;flex:1 1 120px;}
.fx-tools .nw-row-name{font-size:13.5px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fx-tools .nw-row-meta{font-size:11.5px;color:var(--ink3);}
.fx-tools .nw-row-field{flex:0 0 132px;}
.fx-tools .nw-row-field .fi-sm{text-align:right;}
.fx-tools .nw-row-del{flex:0 0 auto;color:var(--ink3);background:none;border:0;cursor:pointer;
  min-width:32px;min-height:32px;display:inline-flex;align-items:center;justify-content:center;border-radius:8px;}
.fx-tools .nw-row-del:hover{color:var(--red);background:var(--fill-05);}
.fx-tools .nw-row-confirm{display:flex;gap:8px;flex-wrap:wrap;}
.fx-tools .nw-danger,.fx-tools .nw-quiet{font-size:12px;border-radius:8px;padding:6px 10px;min-height:32px;cursor:pointer;
  border:1px solid var(--hair2);background:var(--fill-04);}
.fx-tools .nw-danger{color:var(--red);border-color:color-mix(in srgb,var(--red) 40%,transparent);}
.fx-tools .nw-quiet{color:var(--ink2);}

.fx-tools .nw-empty{text-align:center;padding:36px 24px;}
.fx-tools .nw-empty svg{color:var(--gold);}
.fx-tools .nw-empty h2{font-size:18px;font-weight:700;margin:10px 0 8px;}
.fx-tools .nw-empty p{font-size:13.5px;color:var(--ink2);line-height:1.6;max-width:44ch;margin:0 auto 18px;}

.fx-tools .nw-add h2{font-size:15px;font-weight:700;margin-bottom:14px;}
.fx-tools .nw-kind{border:0;padding:0;margin:0 0 16px;display:flex;gap:8px;flex-wrap:wrap;}
.fx-tools .nw-kind legend{margin-bottom:7px;}
.fx-tools .nw-kind-opt{display:inline-flex;align-items:center;gap:7px;font-size:13px;color:var(--ink2);
  border:1px solid var(--hair2);border-radius:980px;padding:7px 14px;min-height:34px;cursor:pointer;}
.fx-tools .nw-kind-opt.on{color:var(--ink);border-color:var(--gold);background:var(--gold-bg);}
.fx-tools .nw-error{color:var(--red);font-size:12.5px;margin-bottom:12px;}
.fx-tools .nw-actions{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px;}

@media(max-width:760px){
  .fx-tools .nw-kpis{grid-template-columns:1fr;}
  .fx-tools .nw-sheet{grid-template-columns:1fr;}
}
`;
