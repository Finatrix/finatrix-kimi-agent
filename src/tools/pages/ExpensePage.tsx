import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { useTheme } from '../../context/ThemeContext';
import { getChartTheme } from '../lib/chartTheme';
import { useCurrency } from '../CurrencyContext';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon, type IconName } from '../ui/Icon';
import { MonthNav } from '../ui/MonthNav';
import { ExportMenu } from '../ui/ExportMenu';
import { exportExpenseCsv, exportExpenseXlsx, exportExpensePdf, type ExpenseExport } from '../lib/exporters';
import { currentMonth, monthLabel } from '../lib/month';
import { getJSON, onLocalWrite } from '../lib/storage';
import {
  loadExpenses, saveExpenses, etToday, etMonthsWithData, computeDashboard, genExpenseId,
  type ExpenseItem, type DashResult, type DashCategory, type CatHealth,
} from '../lib/expense';
import {
  mergedCats, loadCustomCats, allCategories, SECTION_LABEL,
  type SectionedCats, type CatKey, type BudgetStore,
} from '../lib/budget';
import TransactionModal from '../ui/TransactionModal';
import TransactionList, { type ExportKind } from '../ui/TransactionList';
import {
  computeMonthlyTrend, computeCategoryComparison, computePaymentBreakdown,
  computeDailyHeatmap, detectRecurring, computeStreaks, generateInsights,
  computeAnalyticsSummary, computeMonthForecast,
  type CatMeta, type MonthlyTrend, type SpendingInsight,
} from '../lib/expenseAnalytics';

/* ── Design tokens ── */
const HEALTH_COLOR: Record<CatHealth, string> = {
  within: 'var(--green)', near: 'var(--gold)', over: 'var(--red)', none: 'var(--ink3)',
};
const HEALTH_LABEL: Record<CatHealth, string> = {
  within: 'Within budget', near: 'Near limit', over: 'Over budget', none: 'No budget',
};
const SECTION_COLOR: Record<CatKey, string> = { needs: 'var(--blue)', wants: 'var(--gold)', save: 'var(--green)' };

type Tab = 'overview' | 'analytics' | 'recurring';

const TAB_ITEMS: Array<{ key: Tab; label: string; icon: IconName }> = [
  { key: 'overview', label: 'Overview', icon: 'expense' },
  { key: 'analytics', label: 'Analytics', icon: 'trending' },
  { key: 'recurring', label: 'Recurring', icon: 'refresh' },
];

function readBudgetVals(m: string): Record<string, number> {
  return getJSON<BudgetStore>('fx_bb_data', {})[m]?.vals || {};
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════════════════════════════ */

export default function ExpensePage() {
  const { cfmt, sym, code } = useCurrency();
  const { theme } = useTheme();

  const [items, setItems] = useState<ExpenseItem[]>(() => loadExpenses());
  const [selMonth, setSelMonth] = useState(currentMonth());
  const [cats, setCats] = useState<SectionedCats>(() => mergedCats(loadCustomCats()));
  const [budgetVals, setBudgetVals] = useState<Record<string, number>>(() => readBudgetVals(currentMonth()));
  const [tab, setTab] = useState<Tab>('overview');

  const flatCats = useMemo(() => allCategories(cats), [cats]);
  const [sel, setSel] = useState<string>(() => flatCats[0]?.k ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(etToday());
  const [note, setNote] = useState('');
  const [justAdded, setJustAdded] = useState(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  const [undo, setUndo] = useState<{ prev: ExpenseItem[]; label: string } | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const selKey = flatCats.some((c) => c.k === sel) ? sel : (flatCats[0]?.k ?? '');

  const catMeta = useMemo(() => {
    const m = new Map<string, CatMeta>();
    flatCats.forEach((c) => m.set(c.k, c));
    return m;
  }, [flatCats]);

  useEffect(() => {
    const off = onLocalWrite((key) => {
      if (key === 'fx_bb_cats') setCats(mergedCats(loadCustomCats()));
      if (key === 'fx_bb_data') setBudgetVals(readBudgetVals(selMonth));
    });
    return off;
  }, [selMonth]);

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const now = new Date();
  const r = computeDashboard(selMonth, items, cats, budgetVals, now);
  const months = etMonthsWithData(items, currentMonth());

  const monthTx = useMemo(
    () => items.filter((e) => (e.date || '').slice(0, 7) === selMonth),
    [items, selMonth]
  );

  const switchMonth = (m: string) => {
    setSelMonth(m);
    setBudgetVals(readBudgetVals(m));
  };

  const commit = (next: ExpenseItem[]) => {
    setItems(next);
    saveExpenses(next);
  };

  const addExpense = () => {
    const amt = Math.max(0, Number(amount) || 0);
    if (!amt || !selKey) return;
    const d = date || etToday();
    const nowIso = new Date().toISOString();
    const item: ExpenseItem = { id: genExpenseId(), amount: amt, category: selKey, date: d, createdAt: nowIso, updatedAt: nowIso };
    if (note.trim()) item.note = note.trim();
    commit([item, ...items]);
    setAmount('');
    setNote('');
    const expenseMonth = d.slice(0, 7);
    if (expenseMonth !== selMonth) switchMonth(expenseMonth);
    setJustAdded(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setJustAdded(false), 1200);
  };

  const saveTransaction = (item: ExpenseItem) => {
    const exists = items.some((e) => e.id === item.id);
    const next = exists ? items.map((e) => (e.id === item.id ? item : e)) : [item, ...items];
    commit(next);
    setModalOpen(false);
    setEditing(null);
    const m = item.date.slice(0, 7);
    if (m !== selMonth) switchMonth(m);
  };

  const duplicateTransaction = (src: ExpenseItem) => {
    const nowIso = new Date().toISOString();
    const copy: ExpenseItem = { ...src, id: genExpenseId(), date: etToday(), createdAt: nowIso, updatedAt: nowIso };
    delete copy.editCount;
    commit([copy, ...items]);
    setEditing(copy);
    setModalOpen(true);
    const m = copy.date.slice(0, 7);
    if (m !== selMonth) switchMonth(m);
  };

  const deleteTransaction = (id: string) => {
    const victim = items.find((e) => e.id === id);
    if (!victim) return;
    const prev = items;
    commit(items.filter((e) => e.id !== id));
    setModalOpen(false);
    setEditing(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ prev, label: victim.note || victim.merchant || 'Transaction' });
    undoTimer.current = setTimeout(() => setUndo(null), 7000);
  };

  const undoDelete = () => {
    if (!undo) return;
    if (undoTimer.current) clearTimeout(undoTimer.current);
    commit(undo.prev);
    setUndo(null);
  };

  const openEdit = (item: ExpenseItem) => { setEditing(item); setModalOpen(true); };
  const openAdd = () => { setEditing(null); setModalOpen(true); };

  const bulkDelete = (ids: string[]) => {
    if (ids.length === 0) return;
    const set = new Set(ids);
    const prev = items;
    const victims = items.filter((e) => set.has(e.id));
    commit(items.filter((e) => !set.has(e.id)));
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo({ prev, label: `${victims.length} transaction${victims.length > 1 ? 's' : ''}` });
    undoTimer.current = setTimeout(() => setUndo(null), 7000);
  };

  const bulkDuplicate = (ids: string[]) => {
    const set = new Set(ids);
    const nowIso = new Date().toISOString();
    const copies = items
      .filter((e) => set.has(e.id))
      .map((e) => { const c: ExpenseItem = { ...e, id: genExpenseId(), date: etToday(), createdAt: nowIso, updatedAt: nowIso }; delete c.editCount; return c; });
    if (copies.length) commit([...copies, ...items]);
  };

  const bulkCategory = (ids: string[], catKey: string) => {
    const set = new Set(ids);
    const nowIso = new Date().toISOString();
    commit(items.map((e) => (set.has(e.id) ? { ...e, category: catKey, updatedAt: nowIso, editCount: (e.editCount ?? 0) + 1 } : e)));
  };

  const bulkAddTags = (ids: string[], tags: string[]) => {
    if (tags.length === 0) return;
    const set = new Set(ids);
    const nowIso = new Date().toISOString();
    commit(items.map((e) => {
      if (!set.has(e.id)) return e;
      const merged = Array.from(new Set([...(e.tags ?? []), ...tags]));
      return { ...e, tags: merged, updatedAt: nowIso, editCount: (e.editCount ?? 0) + 1 };
    }));
  };

  const exportTransactions = (kind: ExportKind, list: ExpenseItem[], scopeLabel: string) => {
    if (list.length === 0) return;
    const label = `${monthLabel(selMonth)} (${scopeLabel})`;
    const byCat: Record<string, number> = {};
    list.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
    const total = list.reduce((s, t) => s + t.amount, 0);
    const payload: ExpenseExport = {
      monthLabel: label, currency: code, totalSpent: total, dailyAvg: r.dailyAvg, txCount: list.length, budget: 0,
      breakdown: Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
        label: flatCats.find((c) => c.k === k)?.l ?? k, amount: v, pct: total > 0 ? Math.round((v / total) * 100) : 0,
      })),
      transactions: list.map((t) => ({
        date: t.date, category: flatCats.find((c) => c.k === t.category)?.l ?? t.category, amount: t.amount,
        note: [t.merchant, t.note].filter(Boolean).join(' — ') || t.notes || '',
      })),
    };
    if (kind === 'csv') exportExpenseCsv(payload);
    else if (kind === 'xlsx') void exportExpenseXlsx(payload);
    else void exportExpensePdf(payload);
  };

  const buildExport = (): ExpenseExport => ({
    monthLabel: monthLabel(selMonth), currency: code, totalSpent: r.monthlySpent, dailyAvg: r.dailyAvg,
    txCount: r.txCount, budget: r.monthlyBudget,
    breakdown: r.categories.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent).map((c) => ({
      label: c.l, amount: c.spent, pct: r.monthlySpent > 0 ? Math.round((c.spent / r.monthlySpent) * 100) : 0,
    })),
    transactions: r.recent.map((t) => ({
      date: t.date, category: flatCats.find((c) => c.k === t.category)?.l ?? t.category, amount: t.amount, note: t.note || '',
    })),
  });

  return (
    <div className="fx-page">
      <style>{TAB_STYLES}</style>

      <PageHead chip="Expense Manager" chipColor="var(--orange)" chipBg="rgba(194,65,12,.09)" icon="expense" title="Your money, tracked and understood.">
        Categories and budgets flow from Budget Builder — log a spend and watch your Needs, Wants and Savings update live. Explore analytics to discover spending patterns.
      </PageHead>

      {/* Tab bar */}
      <div className="fx-tabs" role="tablist" aria-label="Expense views">
        {TAB_ITEMS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`fx-tab${tab === t.key ? ' active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            <Icon name={t.icon} size={15} />
            {t.label}
          </button>
        ))}
      </div>

      {/* Month nav + export */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <MonthNav activeMonth={selMonth} months={months} onSwitch={switchMonth} pastNote="Viewing past month" pastColor="var(--orange)" />
        </div>
        <ExportMenu label="Export" onCsv={() => exportExpenseCsv(buildExport())} onXlsx={() => exportExpenseXlsx(buildExport())} onPdf={() => exportExpensePdf(buildExport())} />
      </div>

      {/* Tab panels */}
      <div role="tabpanel" aria-label={TAB_ITEMS.find((t) => t.key === tab)?.label}>
        {tab === 'overview' && (
          <OverviewTab
            r={r} items={items} monthTx={monthTx} selMonth={selMonth} flatCats={flatCats}
            selKey={selKey} sel={sel} setSel={setSel} amount={amount} setAmount={setAmount}
            date={date} setDate={setDate} note={note} setNote={setNote} justAdded={justAdded}
            cfmt={cfmt} sym={sym} now={now} catMeta={catMeta} monthlyBudget={r.monthlyBudget}
            addExpense={addExpense} openAdd={openAdd} openEdit={openEdit}
            duplicateTransaction={duplicateTransaction} deleteTransaction={deleteTransaction}
            bulkDelete={bulkDelete} bulkDuplicate={bulkDuplicate} bulkCategory={bulkCategory}
            bulkAddTags={bulkAddTags} exportTransactions={exportTransactions}
            code={code} theme={theme}
          />
        )}
        {tab === 'analytics' && (
          <AnalyticsTab
            items={items} selMonth={selMonth} catMeta={catMeta}
            cfmt={cfmt} code={code} theme={theme} now={now}
            monthlyBudget={r.monthlyBudget}
          />
        )}
        {tab === 'recurring' && (
          <RecurringTab
            items={items} catMeta={catMeta} cfmt={cfmt}
            onEdit={openEdit}
          />
        )}
      </div>

      {modalOpen && (
        <TransactionModal
          key={editing?.id ?? 'add'}
          editing={editing}
          cats={flatCats}
          sym={sym}
          defaultCat={selKey}
          onSave={saveTransaction}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onDelete={deleteTransaction}
          onDuplicate={duplicateTransaction}
        />
      )}

      {undo && (
        <div className="fx-undo" role="status" aria-live="polite">
          <style>{`
            .fx-undo{position:fixed;left:50%;bottom:calc(22px + var(--fx-bottomnav-h,0px) + env(safe-area-inset-bottom));transform:translateX(-50%);
              z-index:320;display:flex;align-items:center;gap:14px;padding:12px 14px 12px 18px;border-radius:14px;
              background:var(--card-solid,#1c1c1f);border:1px solid var(--hair2);color:var(--ink);
              box-shadow:0 20px 50px -18px rgba(0,0,0,.7);font-size:13px;max-width:calc(100vw - 32px);
              animation:fxUndoIn .28s cubic-bezier(.34,1.3,.5,1) both;}
            @keyframes fxUndoIn{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}
            @media (prefers-reduced-motion:reduce){.fx-undo{animation:none;}}
          `}</style>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Deleted "{undo.label}".</span>
          <button type="button" className="btn btn-sm" style={{ width: 'auto', padding: '7px 16px' }} onClick={undoDelete}>Undo</button>
        </div>
      )}

      <ToolFoot>
        Educational tools — not financial advice · <a href="/privacy" target="_top">Privacy</a> ·{' '}
        <a href="/terms" target="_top">Terms</a> · Built with care by <b>FinatriX</b>
      </ToolFoot>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Overview Tab — preserves all existing features + adds insights & streaks
   ═══════════════════════════════════════════════════════════════════════════ */

interface OverviewProps {
  r: DashResult; items: ExpenseItem[]; monthTx: ExpenseItem[]; selMonth: string;
  flatCats: Array<{ k: string; l: string; ic: IconName; section: CatKey }>;
  selKey: string; sel: string; setSel: (k: string) => void;
  amount: string; setAmount: (v: string) => void;
  date: string; setDate: (v: string) => void;
  note: string; setNote: (v: string) => void;
  justAdded: boolean;
  cfmt: (n: number) => string; sym: string; now: Date;
  catMeta: Map<string, CatMeta>; monthlyBudget: number;
  addExpense: () => void; openAdd: () => void; openEdit: (item: ExpenseItem) => void;
  duplicateTransaction: (item: ExpenseItem) => void; deleteTransaction: (id: string) => void;
  bulkDelete: (ids: string[]) => void; bulkDuplicate: (ids: string[]) => void;
  bulkCategory: (ids: string[], catKey: string) => void;
  bulkAddTags: (ids: string[], tags: string[]) => void;
  exportTransactions: (kind: ExportKind, items: ExpenseItem[], scopeLabel: string) => void;
  code: string; theme: string | undefined;
}

function OverviewTab({
  r, items, monthTx, selMonth, flatCats, selKey, setSel,
  amount, setAmount, date, setDate, note, setNote, justAdded,
  cfmt, sym, now, catMeta, monthlyBudget,
  addExpense, openAdd, openEdit, duplicateTransaction, deleteTransaction,
  bulkDelete, bulkDuplicate, bulkCategory, bulkAddTags, exportTransactions,
  code,
}: OverviewProps) {
  const insights = useMemo(
    () => generateInsights(items, selMonth, monthlyBudget, catMeta, now),
    [items, selMonth, monthlyBudget, catMeta, now]
  );

  const streaks = useMemo(() => computeStreaks(items, now), [items, now]);

  return (
    <>
      {/* KPI strip */}
      <div className="dash-grid" style={{ marginBottom: 16 }}>
        <Kpi v={cfmt(r.monthlyBudget)} l="Monthly budget" />
        <Kpi v={cfmt(r.monthlySpent)} l="Monthly spent" color="var(--orange)" />
        <Kpi v={cfmt(r.remaining)} l="Remaining" color={r.remaining >= 0 ? 'var(--green)' : 'var(--red)'} />
        <Kpi v={r.monthlyBudget > 0 ? `${Math.round(r.healthPct)}%` : '—'} l={HEALTH_LABEL[r.health]} color={HEALTH_COLOR[r.health]} />
      </div>

      {/* Streaks */}
      {streaks.length > 0 && items.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {streaks.map((s) => (
            <div key={s.type} className="fx-streak">
              <Icon name={s.type === 'logging' ? 'zap' : 'sun'} size={14} style={{ color: s.current > 0 ? 'var(--gold)' : 'var(--ink3)' }} />
              <span>{s.label}</span>
            </div>
          ))}
        </div>
      )}

      {/* Spending insights */}
      {insights.length > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Spending insights</div>
          <div style={{ display: 'grid', gap: 8 }}>
            {insights.map((ins) => (
              <InsightCard key={ins.id} insight={ins} />
            ))}
          </div>
        </div>
      )}

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

      {/* Top categories */}
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

      {/* Transactions */}
      <TransactionList
        items={monthTx}
        hasAnyEver={items.length > 0}
        cats={flatCats}
        cfmt={cfmt}
        monthLabelText={monthLabel(selMonth)}
        now={now}
        onAdd={openAdd}
        onEdit={openEdit}
        onDuplicate={duplicateTransaction}
        onDelete={deleteTransaction}
        onBulkDelete={bulkDelete}
        onBulkDuplicate={bulkDuplicate}
        onBulkCategory={bulkCategory}
        onBulkAddTags={bulkAddTags}
        onExport={exportTransactions}
      />
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Analytics Tab
   ═══════════════════════════════════════════════════════════════════════════ */

function AnalyticsTab({
  items, selMonth, catMeta, cfmt, code, theme, now, monthlyBudget,
}: {
  items: ExpenseItem[]; selMonth: string; catMeta: Map<string, CatMeta>;
  cfmt: (n: number) => string; code: string; theme: string | undefined; now: Date;
  monthlyBudget: number;
}) {
  const forecast = useMemo(
    () => computeMonthForecast(items, selMonth, now, monthlyBudget),
    [items, selMonth, now, monthlyBudget]
  );
  const trend12 = useMemo(
    () => computeMonthlyTrend(items, selMonth, 12, catMeta),
    [items, selMonth, catMeta]
  );
  const categoryComparison = useMemo(
    () => computeCategoryComparison(items, selMonth, catMeta),
    [items, selMonth, catMeta]
  );
  const monthItems = useMemo(
    () => items.filter((e) => (e.date || '').startsWith(selMonth)),
    [items, selMonth]
  );
  const paymentBreakdown = useMemo(() => computePaymentBreakdown(monthItems), [monthItems]);
  const heatmap = useMemo(() => computeDailyHeatmap(items, selMonth), [items, selMonth]);
  const summary = useMemo(() => computeAnalyticsSummary(items, catMeta), [items, catMeta]);

  if (items.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <Icon name="trending" size={40} style={{ color: 'var(--ink3)', marginBottom: 12 }} />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No data yet</div>
        <p className="note" style={{ maxWidth: 320, margin: '0 auto' }}>
          Add some transactions on the Overview tab to see your spending analytics and patterns.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Summary stats */}
      <div className="dash-grid" style={{ marginBottom: 14 }}>
        <Kpi v={cfmt(summary.avgPerMonth)} l="Avg per month" />
        <Kpi v={cfmt(summary.avgPerTransaction)} l="Avg per transaction" />
        <Kpi v={String(summary.txCountAllTime)} l="Total transactions" />
        <Kpi v={`${summary.monthsTracked} mo`} l="Months tracked" />
      </div>

      {/* Month-end forecast (current month only) */}
      {forecast.isCurrentMonth && forecast.spentSoFar > 0 && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <Icon name="trending" size={16} style={{ color: forecast.overBudget ? 'var(--red)' : 'var(--gold)' }} />
            <div style={{ fontSize: 14, fontWeight: 700 }}>Month-end forecast</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', color: forecast.overBudget ? 'var(--red)' : 'var(--ink)' }}>{cfmt(forecast.projected)}</span>
            <span className="note" style={{ fontSize: 12 }}>
              projected · {cfmt(forecast.spentSoFar)} spent over {forecast.daysElapsed} of {forecast.daysInMonth} days
            </span>
          </div>
          {forecast.vsBudgetPct != null && (
            <div style={{ marginTop: 12 }}>
              <div className="bar" style={{ height: 7 }}>
                <div className="bar-fill" style={{ width: `${Math.min(100, forecast.vsBudgetPct)}%`, background: forecast.overBudget ? 'var(--red)' : 'var(--green)' }} />
              </div>
              <div className="note" style={{ fontSize: 11.5, marginTop: 6 }}>
                {forecast.overBudget
                  ? `On track to exceed your budget by ${cfmt(forecast.projected - monthlyBudget)} (${forecast.vsBudgetPct}%). Easing the daily pace keeps you within plan.`
                  : `Projected to use ${forecast.vsBudgetPct}% of your ${cfmt(monthlyBudget)} budget — comfortably on track.`}
              </div>
            </div>
          )}
        </div>
      )}

      {(summary.topMerchant || summary.topCategory) && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {summary.topMerchant && (
            <div className="fx-streak" style={{ flex: 1 }}>
              <Icon name="briefcase" size={14} style={{ color: 'var(--gold)' }} />
              <span>Top merchant: <b>{summary.topMerchant.name}</b> ({cfmt(summary.topMerchant.total)})</span>
            </div>
          )}
          {summary.topCategory && (
            <div className="fx-streak" style={{ flex: 1 }}>
              <Icon name="pie" size={14} style={{ color: 'var(--gold)' }} />
              <span>Top category: <b>{summary.topCategory.label}</b> ({cfmt(summary.topCategory.total)})</span>
            </div>
          )}
        </div>
      )}

      {/* 12-month spending trend */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>12-month spending trend</div>
        <Trend12Chart trend={trend12} cfmt={cfmt} code={code} theme={theme} />
      </div>

      {/* Daily spending heatmap */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Daily spending — {monthLabel(selMonth)}</div>
        <Heatmap days={heatmap} cfmt={cfmt} />
      </div>

      {/* Category comparison */}
      {categoryComparison.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Category changes vs last month</div>
          {categoryComparison.slice(0, 8).map((c) => (
            <div key={c.category} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--hair2)' }}>
              <Icon name={c.icon} size={16} style={{ color: c.section ? SECTION_COLOR[c.section] : 'var(--ink2)' }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</div>
                <div className="note" style={{ fontSize: 11 }}>{cfmt(c.currentMonth)} this month · {cfmt(c.previousMonth)} last month</div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <span style={{
                  fontSize: 12, fontWeight: 700,
                  color: c.direction === 'up' ? 'var(--red)' : c.direction === 'down' ? 'var(--green)' : c.direction === 'new' ? 'var(--blue)' : 'var(--ink3)',
                }}>
                  {c.direction === 'new' ? 'New' : c.direction === 'flat' ? '—' : `${c.direction === 'up' ? '↑' : '↓'} ${Math.abs(Math.round(c.changePct))}%`}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Payment method breakdown */}
      {paymentBreakdown.length > 0 && paymentBreakdown.some((p) => p.method !== 'Not specified') && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Payment methods — {monthLabel(selMonth)}</div>
          {paymentBreakdown.map((p) => (
            <div key={p.method} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 3 }}>
                  <span style={{ fontWeight: 600 }}>{p.method}</span>
                  <span style={{ fontWeight: 700 }}>{cfmt(p.total)}</span>
                </div>
                <div className="bar" style={{ height: 5 }}>
                  <div className="bar-fill" style={{ width: `${p.pct}%`, background: 'var(--gold)' }} />
                </div>
              </div>
              <span className="note" style={{ width: 40, textAlign: 'right', flexShrink: 0 }}>{Math.round(p.pct)}%</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Recurring Tab
   ═══════════════════════════════════════════════════════════════════════════ */

function RecurringTab({
  items, catMeta, cfmt, onEdit,
}: {
  items: ExpenseItem[]; catMeta: Map<string, CatMeta>;
  cfmt: (n: number) => string;
  onEdit: (item: ExpenseItem) => void;
}) {
  const patterns = useMemo(() => detectRecurring(items, catMeta), [items, catMeta]);
  const recurringItems = useMemo(() => items.filter((e) => e.recurring).sort((a, b) => b.date.localeCompare(a.date)), [items]);
  const totalMonthly = useMemo(() => patterns.reduce((s, p) => s + p.estimatedMonthly, 0), [patterns]);

  if (patterns.length === 0 && recurringItems.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <Icon name="refresh" size={40} style={{ color: 'var(--ink3)', marginBottom: 12 }} />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No recurring expenses detected</div>
        <p className="note" style={{ maxWidth: 340, margin: '0 auto' }}>
          Mark transactions as recurring when adding them, or log the same expense across multiple months for automatic detection.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Summary */}
      <div className="dash-grid" style={{ marginBottom: 14 }}>
        <Kpi v={cfmt(totalMonthly)} l="Est. monthly recurring" color="var(--orange)" />
        <Kpi v={String(patterns.length)} l="Recurring patterns" />
        <Kpi v={cfmt(totalMonthly * 12)} l="Est. annual recurring" />
      </div>

      {/* Detected patterns */}
      {patterns.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Detected patterns</div>
          {patterns.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < patterns.length - 1 ? '1px solid var(--hair2)' : 'none' }}>
              <div style={{
                width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'color-mix(in srgb, var(--gold) 12%, transparent)',
              }}>
                <Icon name={p.icon} size={17} style={{ color: 'var(--gold)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{p.merchant || p.label}</div>
                <div className="note" style={{ fontSize: 11 }}>
                  {p.label}{p.merchant ? ` · ${p.merchant}` : ''} · {p.monthsDetected} months detected
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{cfmt(p.estimatedMonthly)}</div>
                <div className="note" style={{ fontSize: 10 }}>/ month</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Explicitly marked recurring transactions */}
      {recurringItems.length > 0 && (
        <div className="card">
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>Marked as recurring ({recurringItems.length})</div>
          {recurringItems.slice(0, 20).map((e) => {
            const meta = catMeta.get(e.category);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => onEdit(e)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', width: '100%',
                  background: 'none', border: 'none', borderBottom: '1px solid var(--hair2)',
                  cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit', borderRadius: 6,
                }}
              >
                <Icon name={meta?.ic ?? 'other'} size={15} style={{ color: meta?.section ? SECTION_COLOR[meta.section] : 'var(--ink2)' }} />
                <span style={{ flex: 1, fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.merchant || e.note || meta?.l || 'Recurring'}
                </span>
                <span className="note" style={{ fontSize: 11 }}>{fmtDate(e.date)}</span>
                <span style={{ fontSize: 13, fontWeight: 700, flexShrink: 0 }}>{cfmt(e.amount)}</span>
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shared sub-components
   ═══════════════════════════════════════════════════════════════════════════ */

function Kpi({ v, l, color }: { v: string; l: string; color?: string }) {
  return <div className="stat-cell"><div className="v" style={color ? { color } : undefined}>{v}</div><div className="l">{l}</div></div>;
}

function InsightCard({ insight }: { insight: SpendingInsight }) {
  const toneColor: Record<string, string> = {
    ok: 'var(--green)', info: 'var(--blue)', warn: 'var(--orange)', tip: 'var(--gold)',
  };
  const color = toneColor[insight.tone] || 'var(--ink2)';
  return (
    <div style={{
      display: 'flex', gap: 12, padding: '10px 12px', borderRadius: 12,
      background: `color-mix(in srgb, ${color} 6%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 20%, transparent)`,
    }}>
      <Icon name={insight.icon} size={18} style={{ color, flexShrink: 0, marginTop: 1 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color, marginBottom: 2 }}>{insight.title}</div>
        <div style={{ fontSize: 12, color: 'var(--ink2)', lineHeight: 1.5 }}>{insight.body}</div>
      </div>
    </div>
  );
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

/* ── Charts ── */

function TrendChart({ trend, cfmt, code }: { trend: DashResult['trend']; cfmt: (n: number) => string; code: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const { theme } = useTheme();
  const labels = useMemo(() => trend.map((t) => t.label), [trend]);
  const data = useMemo(() => trend.map((t) => t.spent), [trend]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = el.getContext('2d'); } catch { ctx = null; }
    if (!ctx) return;
    const ct = getChartTheme(theme);
    chartRef.current = new Chart(el, {
      type: 'bar',
      data: { labels, datasets: [{ label: 'Spent', data, backgroundColor: 'rgba(232,131,61,0.55)', borderColor: '#E8833D', borderWidth: 1, borderRadius: 6 }] },
      options: {
        responsive: true, animation: { duration: 450 },
        plugins: { legend: { display: false }, tooltip: { backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, borderWidth: 1, titleColor: ct.tooltipTitle, bodyColor: ct.tooltipBody, callbacks: { label: (c) => ' ' + cfmt(c.raw as number) } } },
        scales: {
          x: { ticks: { color: ct.tick, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: ct.tick, font: { size: 10 }, callback: (v) => cfmt(v as number) }, grid: { color: ct.grid } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, theme]);

  useEffect(() => {
    const ch = chartRef.current;
    if (!ch) return;
    ch.data.labels = labels;
    ch.data.datasets[0].data = data;
    ch.update();
  }, [labels, data]);

  return <canvas ref={ref} height={150} />;
}

function Trend12Chart({ trend, cfmt, code, theme }: { trend: MonthlyTrend[]; cfmt: (n: number) => string; code: string; theme: string | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const labels = useMemo(() => trend.map((t) => t.label), [trend]);
  const data = useMemo(() => trend.map((t) => t.spent), [trend]);
  const avgData = useMemo(() => {
    const avg = trend.length > 0 ? trend.reduce((s, t) => s + t.spent, 0) / trend.length : 0;
    return trend.map(() => avg);
  }, [trend]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = el.getContext('2d'); } catch { ctx = null; }
    if (!ctx) return;
    const ct = getChartTheme(theme === 'light' ? 'light' : 'dark');
    chartRef.current = new Chart(el, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Spent', data, backgroundColor: 'rgba(232,131,61,0.6)', borderColor: '#E8833D', borderWidth: 1, borderRadius: 5, order: 2 },
          { label: 'Average', data: avgData, type: 'line', borderColor: 'var(--gold)', borderWidth: 2, borderDash: [6, 3], pointRadius: 0, fill: false, order: 1 },
        ],
      },
      options: {
        responsive: true, animation: { duration: 500 },
        plugins: {
          legend: { display: true, position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'rect', padding: 12, font: { size: 11 }, color: ct.tick } },
          tooltip: { backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, borderWidth: 1, titleColor: ct.tooltipTitle, bodyColor: ct.tooltipBody, callbacks: { label: (c) => ` ${c.dataset.label}: ${cfmt(c.raw as number)}` } },
        },
        scales: {
          x: { ticks: { color: ct.tick, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: ct.tick, font: { size: 10 }, callback: (v) => cfmt(v as number) }, grid: { color: ct.grid } },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, theme]);

  useEffect(() => {
    const ch = chartRef.current;
    if (!ch) return;
    ch.data.labels = labels;
    ch.data.datasets[0].data = data;
    ch.data.datasets[1].data = avgData;
    ch.update();
  }, [labels, data, avgData]);

  return <canvas ref={ref} height={180} />;
}

/* ── Daily heatmap ── */

function Heatmap({ days, cfmt }: { days: ReturnType<typeof computeDailyHeatmap>; cfmt: (n: number) => string }) {
  const maxAmt = Math.max(...days.map((d) => d.amount), 1);
  const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const maxWeek = days.length > 0 ? Math.max(...days.map((d) => d.week)) : 0;

  return (
    <div style={{ overflowX: 'auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `32px repeat(${maxWeek + 1}, 1fr)`, gap: 3, minWidth: 280 }}>
        {DOW_LABELS.map((d, i) => (
          <div key={d} style={{ gridColumn: 1, gridRow: i + 1, fontSize: 10, color: 'var(--ink3)', display: 'flex', alignItems: 'center', fontWeight: 600 }}>{d}</div>
        ))}
        {days.map((d) => {
          const intensity = d.amount > 0 ? Math.max(0.15, d.amount / maxAmt) : 0;
          const dayNum = parseInt(d.date.split('-')[2], 10);
          return (
            <div
              key={d.date}
              title={`${d.date}: ${cfmt(d.amount)} (${d.txCount} tx)`}
              aria-label={`${d.date}: ${cfmt(d.amount)}, ${d.txCount} transactions`}
              style={{
                gridColumn: d.week + 2,
                gridRow: d.dow + 1,
                aspectRatio: '1',
                borderRadius: 5,
                background: d.amount > 0
                  ? `rgba(232, 131, 61, ${intensity})`
                  : 'var(--fill-04)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: intensity > 0.5 ? '#fff' : 'var(--ink3)', fontWeight: 600,
                cursor: 'default', minHeight: 28,
              }}
            >
              {dayNum}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
        <span style={{ fontSize: 10, color: 'var(--ink3)' }}>Less</span>
        {[0, 0.2, 0.4, 0.6, 0.8, 1].map((v) => (
          <div key={v} style={{ width: 12, height: 12, borderRadius: 3, background: v === 0 ? 'var(--fill-04)' : `rgba(232,131,61,${v})` }} />
        ))}
        <span style={{ fontSize: 10, color: 'var(--ink3)' }}>More</span>
      </div>
    </div>
  );
}

/* ── Helpers ── */

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/* ── Tab styles ── */

const TAB_STYLES = `
.fx-tabs{display:flex;gap:4px;margin-bottom:14px;background:var(--bg);border-radius:14px;padding:4px;border:1px solid var(--hair2);}
.fx-tab{display:inline-flex;align-items:center;gap:7px;padding:10px 16px;border-radius:11px;border:none;background:transparent;
  color:var(--ink2);font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;transition:all .18s;flex:1;justify-content:center;}
.fx-tab:hover{color:var(--ink);background:var(--fill-04);}
.fx-tab.active{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.08);}
@media (max-width:480px){.fx-tab{padding:9px 10px;font-size:12px;gap:5px;}}
.fx-streak{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:10px;
  background:var(--bg);border:1px solid var(--hair2);font-size:12px;font-weight:600;color:var(--ink2);}
`;
