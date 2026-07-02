import { useEffect, useRef, useState } from 'react';
import { useCurrency } from '../CurrencyContext';
import { useToast } from '../ui/Toast';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { MonthNav } from '../ui/MonthNav';
import { currentMonth, monthLabel } from '../lib/month';
import {
  ET_CATS, computeExpense, loadExpenses, saveExpenses, etToday,
  etGetBudgetForMonth, etSetBudgetForMonth, etMonthsWithData,
  type ExpenseItem,
} from '../lib/expense';
import { ExportMenu } from '../ui/ExportMenu';
import { exportExpenseCsv, exportExpenseXlsx, exportExpensePdf, type ExpenseExport } from '../lib/exporters';

const CAT_ENTRIES = Object.entries(ET_CATS);

export default function ExpensePage() {
  const { cfmt, sym, code } = useCurrency();
  const { notify } = useToast();

  const [items, setItems] = useState<ExpenseItem[]>(() => loadExpenses());
  const [selMonth, setSelMonth] = useState(currentMonth());
  const [budget, setBudget] = useState(() => etGetBudgetForMonth(currentMonth(), currentMonth()));
  const [sel, setSel] = useState('food');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(etToday());
  const [note, setNote] = useState('');
  const [tab, setTab] = useState<'bd' | 'hi'>('bd');
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState('');
  const [justAdded, setJustAdded] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const now = new Date();
  const r = computeExpense(selMonth, items, budget, now);
  const months = etMonthsWithData(items, currentMonth());

  const switchMonth = (m: string) => {
    setSelMonth(m);
    setBudget(etGetBudgetForMonth(m, currentMonth()));
    setEditingBudget(false);
  };

  const addExpense = () => {
    const amt = Math.max(0, Number(amount) || 0);
    if (!amt) return;
    const d = date || etToday();
    const trimmed = note.trim();
    const next: ExpenseItem[] = [
      { id: Date.now(), amount: amt, category: ET_CATS[sel] ? sel : 'other', date: d, note: trimmed },
      ...items,
    ];
    setItems(next);
    saveExpenses(next);
    setAmount('');
    setNote('');
    const expenseMonth = d.slice(0, 7);
    if (expenseMonth !== selMonth) {
      setSelMonth(expenseMonth);
      setBudget(etGetBudgetForMonth(expenseMonth, currentMonth()));
    }
    setJustAdded(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setJustAdded(false), 1200);
  };

  const delExpense = (id: number) => {
    const next = items.filter((e) => e.id !== id);
    setItems(next);
    saveExpenses(next);
  };

  const saveBudget = () => {
    const v = Math.max(0, Number(budgetInput) || 0);
    setBudget(v);
    etSetBudgetForMonth(selMonth, v);
    setEditingBudget(false);
    notify(
      v > 0 ? `Budget set to ${cfmt(v)} for ${monthLabel(selMonth)}` : `Budget removed for ${monthLabel(selMonth)}`,
      'ok'
    );
  };

  const startEditBudget = () => {
    setBudgetInput(budget > 0 ? String(budget) : '');
    setEditingBudget(true);
  };

  const buildExport = (): ExpenseExport => ({
    monthLabel: monthLabel(selMonth),
    currency: code,
    totalSpent: r.tMonth,
    dailyAvg: r.avgDay,
    txCount: r.txCount,
    budget,
    breakdown: r.breakdown.map((b) => ({ label: (ET_CATS[b.k] || ET_CATS.other).l, amount: b.total, pct: b.pct })),
    transactions: r.history.map((t) => ({
      date: t.date, category: (ET_CATS[t.category] || ET_CATS.other).l, amount: t.amount, note: t.note || '',
    })),
  });

  return (
    <div className="fx-page">
      <PageHead chip="Expense Tracker" chipColor="var(--orange)" chipBg="rgba(194,65,12,.09)" icon="expense" title="Track every rupee. Privately.">
        Log an expense in three taps and watch your patterns emerge. Your data is private — kept on
        your device as a guest, or saved securely to your account when you sign in.
      </PageHead>

      <div style={{ marginBottom: 14 }}>
        <MonthNav activeMonth={selMonth} months={months} onSwitch={switchMonth} pastNote="Viewing past month" pastColor="var(--orange)" />
      </div>

      {/* Stats */}
      <div className="grid3" style={{ marginBottom: 16 }}>
        {r.isCurrentMonth ? (
          <>
            <StatCell v={cfmt(r.tToday)} l="Today" color="var(--orange)" />
            <StatCell v={cfmt(r.tMonth)} l="This month" />
            <StatCell v={cfmt(r.avgDay)} l="Daily avg" color="var(--ink2)" />
          </>
        ) : (
          <>
            <StatCell v={cfmt(r.tMonth)} l="Total spent" />
            <StatCell v={cfmt(r.avgDay)} l="Daily avg" color="var(--ink2)" />
            <StatCell v={String(r.txCount)} l="Transactions" color="var(--blue)" />
          </>
        )}
      </div>

      {/* Budget */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700 }}>Monthly budget</div>
          <div>
            {editingBudget ? (
              <div className="et-budget-form">
                <input
                  className="fi-sm" type="number" step="any" min={0} inputMode="decimal" style={{ width: 130 }}
                  aria-label="Monthly budget" placeholder="0" autoFocus value={budgetInput}
                  onChange={(e) => setBudgetInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); saveBudget(); }
                    else if (e.key === 'Escape') setEditingBudget(false);
                  }}
                />
                <button className="btn btn-sm" style={{ width: 'auto' }} onClick={saveBudget}>Save</button>
                <button className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={() => setEditingBudget(false)}>Cancel</button>
              </div>
            ) : (
              <button className="btn btn-ghost btn-sm" onClick={startEditBudget}>{budget > 0 ? 'Edit' : 'Set budget'}</button>
            )}
          </div>
        </div>
        <BudgetContent r={r} cfmt={cfmt} selMonth={selMonth} />
      </div>

      {/* Add expense */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Add an expense</div>
        <div className="grid2">
          <div className="fg">
            <label className="fl" htmlFor="et-amount">Amount ({sym})</label>
            <input className="fi" type="number" step="any" id="et-amount" placeholder="0" min={0} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="et-date">Date</label>
            <input className="fi" type="date" id="et-date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <label className="fl">Category</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7, marginBottom: 14 }}>
          {CAT_ENTRIES.map(([k, v]) => (
            <div
              key={k}
              onClick={() => setSel(k)}
              style={{
                padding: '11px 4px', borderRadius: 12,
                border: `1.5px solid ${sel === k ? 'var(--ink)' : 'var(--hair2)'}`,
                background: sel === k ? 'var(--hair)' : 'var(--card)',
                textAlign: 'center', cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 24, marginBottom: 2 }}>
                <Icon name={v.ic} size={20} style={{ color: v.c }} />
              </span>
              <span style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 600, marginTop: 3, display: 'block' }}>{v.l}</span>
            </div>
          ))}
        </div>
        <div className="fg">
          <label className="fl" htmlFor="et-note">Note (optional)</label>
          <input className="fi" type="text" id="et-note" placeholder="What was it for?" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <button className="btn" onClick={addExpense} style={justAdded ? { background: 'var(--green)' } : undefined}>
          {justAdded ? 'Added ✓' : 'Add expense'}
        </button>
      </div>

      {/* Tabs + export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ display: 'flex', gap: 6, flex: 1, background: 'var(--hair2)', borderRadius: 980, padding: 4 }}>
          <Tab label="Breakdown" active={tab === 'bd'} onClick={() => setTab('bd')} />
          <Tab label="History" active={tab === 'hi'} onClick={() => setTab('hi')} />
        </div>
        <ExportMenu
          label="Export"
          onCsv={() => exportExpenseCsv(buildExport())}
          onXlsx={() => exportExpenseXlsx(buildExport())}
          onPdf={() => exportExpensePdf(buildExport())}
        />
      </div>

      {tab === 'bd' ? (
        <Breakdown r={r} selMonth={selMonth} cfmt={cfmt} />
      ) : (
        <History r={r} selMonth={selMonth} cfmt={cfmt} onDelete={delExpense} />
      )}

      <ToolFoot>
        Educational tools — not financial advice · <a href="/privacy" target="_top">Privacy</a> ·{' '}
        <a href="/terms" target="_top">Terms</a> ·{' '}
        <a href="mailto:finatrix.hub@gmail.com">Contact</a> · Built with care by <b>FinatriX</b>
      </ToolFoot>
    </div>
  );
}

function StatCell({ v, l, color }: { v: string; l: string; color?: string }) {
  return (
    <div className="stat-cell">
      <div className="v" style={color ? { color } : undefined}>{v}</div>
      <div className="l">{l}</div>
    </div>
  );
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1, padding: 9, textAlign: 'center', borderRadius: 980, fontSize: 13, fontWeight: 600, cursor: 'pointer',
        ...(active
          ? { background: 'var(--card)', boxShadow: '0 1px 4px rgba(0,0,0,.08)' }
          : { color: 'var(--ink2)' }),
      }}
    >
      {label}
    </div>
  );
}

function BudgetContent({ r, cfmt, selMonth }: { r: ReturnType<typeof computeExpense>; cfmt: (n: number) => string; selMonth: string }) {
  const b = r.budget;
  if (!b) {
    return <div className="note">No budget set for {monthLabel(selMonth)}. Tap "Set budget" to add one.</div>;
  }
  const fillColor = b.over ? 'var(--red)' : b.usedPct > 80 ? 'var(--gold)' : 'var(--green)';
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink2)', marginBottom: 5 }}>
        <span>{cfmt(r.tMonth)} spent</span>
        <span>of {cfmt(b.budget)}</span>
      </div>
      <div className="bar"><div className="bar-fill" style={{ width: `${b.usedPct}%`, background: fillColor }} /></div>
      <div className="note" style={{ marginTop: 7 }}>
        {b.over ? (
          <>Over budget by <b style={{ color: 'var(--red)' }}>{cfmt(b.overBy)}</b></>
        ) : r.isCurrentMonth ? (
          <>
            {cfmt(b.left)} left
            {b.daysLeft > 0 ? (
              <> · that's <b>{cfmt(b.perDay)}/day</b> for {b.daysLeft} more days</>
            ) : (
              <> · last day of the month</>
            )}
          </>
        ) : (
          <>{cfmt(b.left)} unspent this month</>
        )}
      </div>
    </>
  );
}

function Breakdown({ r, selMonth, cfmt }: { r: ReturnType<typeof computeExpense>; selMonth: string; cfmt: (n: number) => string }) {
  if (!r.breakdown.length) {
    return (
      <div className="card" style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 14, padding: '40px 20px' }}>
        No expenses logged for {monthLabel(selMonth)}.
        {r.isCurrentMonth && <><br />Add your first one above.</>}
      </div>
    );
  }
  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{monthLabel(selMonth)} by category</div>
      {r.breakdown.map((row) => {
        const c = ET_CATS[row.k] || ET_CATS.other;
        return (
          <div key={row.k} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 0' }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: `${c.c}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={c.ic} size={17} style={{ color: c.c }} />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                <span style={{ fontWeight: 600 }}>{c.l}</span>
                <span style={{ color: 'var(--ink2)' }}>{row.pct}%</span>
              </div>
              <div className="bar" style={{ height: 6 }}>
                <div className="bar-fill" style={{ width: `${row.barPct}%`, background: c.c }} />
              </div>
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, minWidth: 70, textAlign: 'right' }}>{cfmt(row.total)}</div>
          </div>
        );
      })}
    </div>
  );
}

function History({ r, selMonth, cfmt, onDelete }: {
  r: ReturnType<typeof computeExpense>; selMonth: string; cfmt: (n: number) => string;
  onDelete: (id: number) => void;
}) {
  if (!r.history.length) {
    return (
      <div className="card" style={{ textAlign: 'center', color: 'var(--ink3)', fontSize: 14, padding: '40px 20px' }}>
        No expenses for {monthLabel(selMonth)}.
      </div>
    );
  }
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          {monthLabel(selMonth)} ({r.history.length}
          {r.totalCount > r.history.length && <> · <span style={{ color: 'var(--ink3)' }}>{r.totalCount} total</span></>})
        </div>
      </div>
      {r.history.map((e) => {
        const c = ET_CATS[e.category] || ET_CATS.other;
        return (
          <div className="row-line" key={e.id}>
            <div style={{ width: 40, height: 40, borderRadius: 11, background: `${c.c}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Icon name={c.ic} size={18} style={{ color: c.c }} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.note || c.l}</div>
              <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{e.date} · {c.l}</div>
            </div>
            <div style={{ fontSize: 15, fontWeight: 700 }}>{cfmt(e.amount)}</div>
            {r.isCurrentMonth && (
              <button onClick={() => onDelete(e.id)} aria-label="Delete" style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 17, padding: '4px 7px', borderRadius: 8 }}>✕</button>
            )}
          </div>
        );
      })}
    </div>
  );
}
