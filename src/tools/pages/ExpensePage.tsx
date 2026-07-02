import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { useCurrency } from '../CurrencyContext';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { MonthNav } from '../ui/MonthNav';
import { ExportMenu } from '../ui/ExportMenu';
import { exportExpenseCsv, exportExpenseXlsx, exportExpensePdf, type ExpenseExport } from '../lib/exporters';
import { currentMonth, monthLabel } from '../lib/month';
import { getJSON } from '../lib/storage';
import { onLocalWrite } from '../lib/storage';
import {
  loadExpenses, saveExpenses, etToday, etMonthsWithData, computeDashboard,
  type ExpenseItem, type DashResult, type DashCategory, type CatHealth,
} from '../lib/expense';
import {
  mergedCats, loadCustomCats, allCategories, SECTION_LABEL,
  type SectionedCats, type CatKey, type BudgetStore,
} from '../lib/budget';

const HEALTH_COLOR: Record<CatHealth, string> = {
  within: 'var(--green)', near: 'var(--gold)', over: 'var(--red)', none: 'var(--ink3)',
};
const HEALTH_LABEL: Record<CatHealth, string> = {
  within: 'Within budget', near: 'Near limit', over: 'Over budget', none: 'No budget',
};
const SECTION_COLOR: Record<CatKey, string> = { needs: 'var(--blue)', wants: 'var(--gold)', save: 'var(--green)' };

function readBudgetVals(m: string): Record<string, number> {
  return getJSON<BudgetStore>('fx_bb_data', {})[m]?.vals || {};
}

export default function ExpensePage() {
  const { cfmt, sym, code } = useCurrency();

  const [items, setItems] = useState<ExpenseItem[]>(() => loadExpenses());
  const [selMonth, setSelMonth] = useState(currentMonth());
  const [cats, setCats] = useState<SectionedCats>(() => mergedCats(loadCustomCats()));
  const [budgetVals, setBudgetVals] = useState<Record<string, number>>(() => readBudgetVals(currentMonth()));

  const flatCats = useMemo(() => allCategories(cats), [cats]);
  const [sel, setSel] = useState<string>(() => flatCats[0]?.k ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(etToday());
  const [note, setNote] = useState('');
  const [justAdded, setJustAdded] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Effective selection stays valid as categories change (no setState-in-effect).
  const selKey = flatCats.some((c) => c.k === sel) ? sel : (flatCats[0]?.k ?? '');

  // Live sync from Budget Builder (categories + allocations).
  useEffect(() => {
    const off = onLocalWrite((key) => {
      if (key === 'fx_bb_cats') setCats(mergedCats(loadCustomCats()));
      if (key === 'fx_bb_data') setBudgetVals(readBudgetVals(selMonth));
    });
    return off;
  }, [selMonth]);

  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);

  const now = new Date();
  const r = computeDashboard(selMonth, items, cats, budgetVals, now);
  const months = etMonthsWithData(items, currentMonth());

  const switchMonth = (m: string) => {
    setSelMonth(m);
    setBudgetVals(readBudgetVals(m));
  };

  const addExpense = () => {
    const amt = Math.max(0, Number(amount) || 0);
    if (!amt || !selKey) return;
    const d = date || etToday();
    const next: ExpenseItem[] = [{ id: Date.now(), amount: amt, category: selKey, date: d, note: note.trim() }, ...items];
    setItems(next);
    saveExpenses(next);
    setAmount('');
    setNote('');
    const expenseMonth = d.slice(0, 7);
    if (expenseMonth !== selMonth) switchMonth(expenseMonth);
    setJustAdded(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setJustAdded(false), 1200);
  };

  const delExpense = (id: number) => {
    const next = items.filter((e) => e.id !== id);
    setItems(next);
    saveExpenses(next);
  };

  const buildExport = (): ExpenseExport => ({
    monthLabel: monthLabel(selMonth),
    currency: code,
    totalSpent: r.monthlySpent,
    dailyAvg: r.dailyAvg,
    txCount: r.txCount,
    budget: r.monthlyBudget,
    breakdown: r.categories.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent).map((c) => ({
      label: c.l, amount: c.spent, pct: r.monthlySpent > 0 ? Math.round((c.spent / r.monthlySpent) * 100) : 0,
    })),
    transactions: r.recent.map((t) => ({
      date: t.date, category: flatCats.find((c) => c.k === t.category)?.l ?? t.category, amount: t.amount, note: t.note || '',
    })),
  });

  return (
    <div className="fx-page">
      <PageHead chip="Expense Tracker" chipColor="var(--orange)" chipBg="rgba(194,65,12,.09)" icon="expense" title="Your budget, tracked live.">
        Categories and budgets flow straight from your Budget Builder — log a spend and watch your
        Needs, Wants and Savings update in real time.
      </PageHead>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <MonthNav activeMonth={selMonth} months={months} onSwitch={switchMonth} pastNote="Viewing past month" pastColor="var(--orange)" />
        </div>
        <ExportMenu label="Export" onCsv={() => exportExpenseCsv(buildExport())} onXlsx={() => exportExpenseXlsx(buildExport())} onPdf={() => exportExpensePdf(buildExport())} />
      </div>

      {/* KPI strip */}
      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <Kpi v={cfmt(r.monthlyBudget)} l="Monthly budget" />
        <Kpi v={cfmt(r.monthlySpent)} l="Monthly spent" color="var(--orange)" />
        <Kpi v={cfmt(r.remaining)} l="Remaining" color={r.remaining >= 0 ? 'var(--green)' : 'var(--red)'} />
        <Kpi v={r.monthlyBudget > 0 ? `${Math.round(r.healthPct)}%` : '—'} l={HEALTH_LABEL[r.health]} color={HEALTH_COLOR[r.health]} />
      </div>

      {/* Needs / Wants / Savings */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Needs · Wants · Savings</div>
        <div className="grid3">
          {r.sections.map((s) => {
            const pct = s.budget > 0 ? Math.min((s.spent / s.budget) * 100, 100) : 0;
            const over = s.spent > s.budget && s.budget > 0;
            return (
              <div key={s.section} style={{ background: 'var(--bg)', borderRadius: 14, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: SECTION_COLOR[s.section] }}>{s.label}</span>
                  <span className="note">{s.budget > 0 ? `${Math.round((s.spent / s.budget) * 100)}%` : '—'}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{cfmt(s.spent)}</div>
                <div className="note" style={{ marginBottom: 8 }}>of {cfmt(s.budget)}</div>
                <div className="bar"><div className="bar-fill" style={{ width: `${pct}%`, background: over ? 'var(--red)' : SECTION_COLOR[s.section] }} /></div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Monthly trend */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Monthly trend</div>
        <TrendChart trend={r.trend} cfmt={cfmt} code={code} />
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
        <label className="fl">Category (from Budget Builder)</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 7, marginBottom: 14 }}>
          {flatCats.map((c) => (
            <div key={c.k} onClick={() => setSel(c.k)} title={SECTION_LABEL[c.section]} style={{
              padding: '10px 4px', borderRadius: 12, border: `1.5px solid ${selKey === c.k ? 'var(--ink)' : 'var(--hair2)'}`,
              background: selKey === c.k ? 'var(--hair)' : 'var(--card)', textAlign: 'center', cursor: 'pointer', transition: 'all .15s',
            }}>
              <span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 22, marginBottom: 2 }}>
                <Icon name={c.ic} size={18} style={{ color: SECTION_COLOR[c.section] }} />
              </span>
              <span style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.l}</span>
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
        {flatCats.length === 0 && <div className="note" style={{ marginTop: 8 }}>Add categories in Budget Builder to start tracking.</div>}
      </div>

      {/* Per-category budget health */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Category budgets</div>
        {r.categories.filter((c) => c.budget > 0 || c.spent > 0).length === 0 ? (
          <div className="note">No budgets or spending yet for {monthLabel(selMonth)}.</div>
        ) : (
          r.categories.filter((c) => c.budget > 0 || c.spent > 0).sort((a, b) => b.spent - a.spent).map((c) => (
            <CategoryRow key={c.k} c={c} cfmt={cfmt} />
          ))
        )}
      </div>

      {/* Top categories + Recent */}
      <div className="grid2">
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Top categories</div>
          {r.topCategories.length === 0 ? (
            <div className="note">No spending logged yet.</div>
          ) : (
            r.topCategories.map((c) => {
              const max = r.topCategories[0].spent || 1;
              return (
                <div key={c.k} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                  <Icon name={c.ic} size={16} style={{ color: c.section ? SECTION_COLOR[c.section] : 'var(--ink2)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                      <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.l}</span>
                      <span style={{ fontWeight: 700 }}>{cfmt(c.spent)}</span>
                    </div>
                    <div className="bar" style={{ height: 5 }}><div className="bar-fill" style={{ width: `${(c.spent / max) * 100}%`, background: c.section ? SECTION_COLOR[c.section] : 'var(--ink3)' }} /></div>
                  </div>
                </div>
              );
            })
          )}
        </div>
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Recent expenses</div>
          {r.recent.length === 0 ? (
            <div className="note">Nothing logged for {monthLabel(selMonth)} yet.</div>
          ) : (
            r.recent.map((e) => {
              const c = flatCats.find((x) => x.k === e.category);
              return (
                <div className="row-line" key={e.id}>
                  <Icon name={c?.ic ?? 'other'} size={16} style={{ color: c?.section ? SECTION_COLOR[c.section] : 'var(--ink2)' }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.note || c?.l || 'Uncategorised'}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)' }}>{e.date} · {c?.l ?? 'Uncategorised'}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{cfmt(e.amount)}</div>
                  {r.isCurrentMonth && (
                    <button onClick={() => delExpense(e.id)} aria-label="Delete" style={{ background: 'none', border: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 15, padding: '4px 6px', borderRadius: 8 }}>✕</button>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      <ToolFoot>
        Educational tools — not financial advice · <a href="/privacy" target="_top">Privacy</a> ·{' '}
        <a href="/terms" target="_top">Terms</a> · Built with care by <b>FinatriX</b>
      </ToolFoot>
    </div>
  );
}

function Kpi({ v, l, color }: { v: string; l: string; color?: string }) {
  return <div className="stat-cell"><div className="v" style={color ? { color } : undefined}>{v}</div><div className="l">{l}</div></div>;
}

function CategoryRow({ c, cfmt }: { c: DashCategory; cfmt: (n: number) => string }) {
  const pct = c.budget > 0 ? Math.min((c.spent / c.budget) * 100, 100) : 0;
  return (
    <div style={{ padding: '9px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
        <Icon name={c.ic} size={16} style={{ color: c.section ? SECTION_COLOR[c.section] : 'var(--ink2)' }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{c.l}</span>
        <span className="pill" style={{ background: `${HEALTH_COLOR[c.health]}22`, color: HEALTH_COLOR[c.health], fontSize: 10 }}>{HEALTH_LABEL[c.health]}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink2)', marginBottom: 4 }}>
        <span>{cfmt(c.spent)} spent</span>
        {c.budget > 0 ? <span>{cfmt(Math.abs(c.remaining))} {c.remaining >= 0 ? 'left' : 'over'} · budget {cfmt(c.budget)}</span> : <span>no budget set</span>}
      </div>
      <div className="bar" style={{ height: 6 }}><div className="bar-fill" style={{ width: `${pct}%`, background: HEALTH_COLOR[c.health] === 'var(--ink3)' ? 'var(--ink3)' : HEALTH_COLOR[c.health] }} /></div>
    </div>
  );
}

function TrendChart({ trend, cfmt, code }: { trend: DashResult['trend']; cfmt: (n: number) => string; code: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const labels = useMemo(() => trend.map((t) => t.label), [trend]);
  const data = useMemo(() => trend.map((t) => t.spent), [trend]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = el.getContext('2d'); } catch { ctx = null; } // jsdom has no canvas
    if (!ctx) return;
    chartRef.current = new Chart(el, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Spent', data, backgroundColor: 'rgba(232,131,61,0.55)', borderColor: '#E8833D', borderWidth: 1, borderRadius: 6 }] },
      options: {
        responsive: true, animation: { duration: 450 },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: '#15151A', borderColor: '#26262B', borderWidth: 1, titleColor: '#F5F5F0', bodyColor: '#9A9A94', callbacks: { label: (c) => ' ' + cfmt(c.raw as number) } } },
        scales: {
          x: { ticks: { color: '#9A9A94', font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: '#9A9A94', font: { size: 10 }, callback: (v) => cfmt(v as number) }, grid: { color: 'rgba(255,255,255,.06)' } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    const ch = chartRef.current;
    if (!ch) return;
    ch.data.labels = labels;
    ch.data.datasets[0].data = data;
    ch.update();
  }, [labels, data]);

  return <canvas ref={ref} height={150} />;
}
