import {
  Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState, type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router';
import Chart, { type Plugin } from 'chart.js/auto';
import { useTheme } from '../../context/ThemeContext';
import {
  getChartTheme, getSectionFills, type SectionSeriesKey,
} from '../lib/chartTheme';
import { useCurrency } from '../CurrencyContext';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon, type IconName } from '../ui/Icon';
import { MonthNav } from '../ui/MonthNav';
import { ExportMenu } from '../ui/ExportMenu';
import {
  exportExpenseCsv, exportExpenseXlsx, exportExpensePdf, exportAuditCsv,
  type ExpenseExport,
} from '../lib/exporters';
import { currentMonth, monthLabel, prevMonth } from '../lib/month';
import { getJSON, setJSON, onLocalWrite } from '../lib/storage';
import {
  loadExpenses, saveExpenses, etToday, etMonthsWithData, computeDashboard, genExpenseId,
  isSpendingCategory, migrateCategory,
  type ExpenseItem, type DashResult, type DashCategory, type BudgetWarning,
  type SectionSplit,
} from '../lib/expense';
import {
  loadAuditLog, recordAudit, clearAuditLog, auditEvent, auditEdit, newBatchId, historyFor,
  AUDIT_ACTION_LABEL, AUDIT_FIELD_LABEL,
  type AuditEntry,
} from '../lib/expenseAudit';
import AuditTrail from '../ui/AuditTrail';
import { QuickAddBar } from '../ui/QuickAddBar';
import type { QuickAddResult } from '../lib/quickAdd';
import { haptic } from '../../lib/haptics';
import { allCategories, SECTION_LABEL, type SectionedCats, type CatKey, type BudgetStore } from '../lib/budget';
import { loadCatView } from '../lib/budgetCats';
import { budgetFillPct, budgetTone, TONE_COLOR, TONE_FILL, TONE_LABEL } from '../lib/budgetStatus';
import { SECTION_COLOR, SECTION_FILL } from '../lib/sectionColors';
import { useOptionalToast } from '../ui/Toast';
import { AmountInput } from '../ui/AmountInput';
import { AskAiButton } from '../ui/AskAiButton';
import { BudgetTimeline } from '../ui/BudgetTimeline';
import { evaluateFormula } from '../lib/formula';
import TransactionModal from '../ui/TransactionModal';
import TransactionList, { type ExportKind, type TransactionListHandle } from '../ui/TransactionList';
import { Tabs, type TabItem } from '../ui/Tabs';
import {
  computeMonthlyTrend, computeCategoryComparison, computePaymentBreakdown,
  computeDailyHeatmap, detectRecurring, computeStreaks, generateInsights,
  computeAnalyticsSummary, computeMonthForecast, frequentCategoryKeys,
  type CatMeta, type MonthlyTrend, type SpendingInsight,
} from '../lib/expenseAnalytics';
import { track } from '../../lib/analytics';

/* ── Design tokens ── */

type Tab = 'overview' | 'analytics' | 'recurring' | 'history';

/**
 * How long a deleted transaction stays recoverable.
 *
 * The row leaves the list — and storage — the moment it is deleted, and Undo
 * puts the original object back verbatim rather than replaying a soft-delete
 * flag. That ordering matters: a pending deletion held only in memory is lost
 * if the tab closes mid-window, which would silently resurrect a transaction
 * the user believed was gone.
 */
const UNDO_WINDOW_MS = 10_000;

/**
 * The statement review sheet, loaded the first time someone opens it.
 *
 * It is a large surface — a parser suite, a review table, and pdf.js behind a
 * further dynamic import — and the overwhelming majority of visits to this page
 * are someone logging a coffee. Keeping it out of the Expense Tracker's chunk
 * means importing costs a moment when it is first used, and costs nothing at all
 * to everyone who never does.
 */
const StatementImport = lazy(() => import('../ui/StatementImport'));

const TAB_ITEMS: ReadonlyArray<TabItem<Tab>> = [
  { key: 'overview', label: 'Overview', icon: 'expense' },
  { key: 'analytics', label: 'Analytics', icon: 'trending' },
  { key: 'recurring', label: 'Recurring', icon: 'refresh' },
  { key: 'history', label: 'History', icon: 'clock' },
];

/** That month's Budget Builder plan — per-category allocations and total income. */
function readBudgetMonth(store: BudgetStore, m: string): { vals: Record<string, number>; income: number } {
  const d = store[m];
  return { vals: d?.vals || {}, income: Math.max(0, Number(d?.income) || 0) };
}

/* ═══════════════════════════════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════════════════════════════ */

export default function ExpensePage() {
  const { cfmt, sym, code } = useCurrency();
  const { theme } = useTheme();

  const { notify } = useOptionalToast();
  const [items, setItems] = useState<ExpenseItem[]>(() => loadExpenses());
  /** The change history. Written by `commit`, read only by the History tab. */
  const [audit, setAudit] = useState<AuditEntry[]>(() => loadAuditLog());
  const [selMonth, setSelMonth] = useState(currentMonth());
  // The user's own arrangement: archived categories are excluded everywhere,
  // so the picker, the totals and the reports always agree.
  const [cats, setCats] = useState<SectionedCats>(() => loadCatView().active);
  // The whole Budget Builder store, not just the selected month: the timeline's
  // twelve-month view paces against each month's own plan, and re-parsing the
  // store per month inside a render loop would be twelve JSON.parse calls.
  const [budgetStore, setBudgetStore] = useState<BudgetStore>(() => getJSON<BudgetStore>('fx_bb_data', {}));
  const [tab, setTab] = useState<Tab>('overview');
  /** Lets the warnings panel drive the transaction list without owning its filters. */
  const listApi = useRef<TransactionListHandle | null>(null);

  const flatCats = useMemo(() => allCategories(cats), [cats]);
  const [sel, setSel] = useState<string>(() => flatCats[0]?.k ?? '');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(etToday());
  const [note, setNote] = useState('');
  const [justAdded, setJustAdded] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Typing clears the rejection, so the error never outlives the problem. */
  const changeAmount = (v: string) => {
    setAmount(v);
    if (addError) setAddError(null);
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseItem | null>(null);
  // Multi-level undo: every deletion pushes its victims (not an array
  // snapshot — snapshots can't compose across several deletes). Undo pops
  // the most recent batch and re-inserts it, so a run of mistaken deletes
  // can be walked back one by one.
  const [importing, setImporting] = useState(false);
  const [undoStack, setUndoStack] = useState<{ victims: ExpenseItem[]; label: string }[]>([]);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumped on every delete/undo to restart the countdown bar. */
  const [armToken, setArmToken] = useState(0);

  const selKey = flatCats.some((c) => c.k === sel) ? sel : (flatCats[0]?.k ?? '');

  const catMeta = useMemo(() => {
    const m = new Map<string, CatMeta>();
    flatCats.forEach((c) => m.set(c.k, c));
    return m;
  }, [flatCats]);

  // Most-used categories, for the one-tap "Recent" shortcut in the add forms.
  const recentCatKeys = useMemo(
    () => frequentCategoryKeys(items, new Set(flatCats.map((c) => c.k)), 5),
    [items, flatCats]
  );

  useEffect(() => {
    const off = onLocalWrite((key) => {
      if (key === 'fx_bb_cats' || key === 'fx_bb_catprefs') setCats(loadCatView().active);
      if (key === 'fx_bb_data') setBudgetStore(getJSON<BudgetStore>('fx_bb_data', {}));
    });
    return off;
  }, []);

  const budget = useMemo(() => readBudgetMonth(budgetStore, selMonth), [budgetStore, selMonth]);

  /**
   * Total budget for any month, summed the same way `computeDashboard` sums it:
   * over the user's active categories only, so an archived category's stale
   * amount can never inflate the timeline's budget line.
   */
  const budgetTotalOf = useCallback(
    (m: string) => {
      const vals = budgetStore[m]?.vals ?? {};
      return flatCats.reduce((s, c) => s + Math.max(0, Number(vals[c.k]) || 0), 0);
    },
    [budgetStore, flatCats],
  );

  useEffect(() => () => {
    if (flashTimer.current) clearTimeout(flashTimer.current);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, []);

  const now = new Date();
  const r = computeDashboard(selMonth, items, cats, budget.vals, now, budget.income);
  const months = etMonthsWithData(items, currentMonth());

  const monthTx = useMemo(
    () => items.filter((e) => (e.date || '').slice(0, 7) === selMonth),
    [items, selMonth]
  );

  const switchMonth = (m: string) => setSelMonth(m);

  /**
   * The single write path for the ledger.
   *
   * `events` is required rather than optional so a future mutation cannot reach
   * storage without saying what it did — an audit trail with one unlogged code
   * path is an audit trail nobody can trust. Pass `[]` deliberately for a change
   * that genuinely records nothing (an edit that changed no field).
   */
  const commit = (next: ExpenseItem[], events: AuditEntry[]) => {
    setItems(next);
    saveExpenses(next);
    if (events.length) setAudit(recordAudit(events));
  };

  /**
   * Submitting with no amount used to return silently — no message, no focus
   * move, nothing announced — so the form looked broken. Every rejected
   * submission now names the reason, marks the field invalid and sends focus
   * back to it (the same contract TransactionModal already honoured).
   */
  const addExpense = () => {
    // The field accepts arithmetic, so the amount is parsed rather than cast.
    // A rejected formula names its own reason ("Check the brackets…") instead of
    // silently becoming 0 and reporting "enter an amount greater than 0".
    const parsed = evaluateFormula(amount);
    // Sign is preserved: a negative amount records a refund against the
    // category it reverses, so that category's total nets out correctly. Zero
    // is still rejected — it says nothing and still occupies the ledger.
    const amt = parsed.ok ? parsed.value : 0;
    if (!selKey) {
      setAddError('Add a category in Budget Builder before logging a spend.');
      return;
    }
    if (!parsed.ok && amount.trim()) {
      setAddError(parsed.error);
      haptic('warn');
      amountRef.current?.focus();
      return;
    }
    if (!amt) {
      setAddError('Enter an amount. Use a minus sign for a refund.');
      haptic('warn');
      amountRef.current?.focus();
      return;
    }
    setAddError(null);
    const d = date || etToday();
    const nowIso = new Date().toISOString();
    const item: ExpenseItem = { id: genExpenseId(), amount: amt, category: selKey, date: d, createdAt: nowIso, updatedAt: nowIso };
    if (note.trim()) item.note = note.trim();
    commit([item, ...items], [auditEvent('add', item)]);
    haptic('success');
    // A logged spend IS the completion for a tracker — there is no result
    // screen to reach, so counting result views would score this tool zero
    // forever.
    track('tool_completed', { tool: 'expenses' });
    setAmount('');
    setNote('');
    const expenseMonth = d.slice(0, 7);
    if (expenseMonth !== selMonth) switchMonth(expenseMonth);
    setJustAdded(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setJustAdded(false), 1200);
  };

  /**
   * Commit a parsed quick-add line.
   *
   * Goes through the same `commit` path and records the same `add` event as
   * every other entry route — the shortcut is in how the fields were filled,
   * never in what reaches the ledger. Returns false when the line had no
   * usable category, which is the one condition the parser cannot fix.
   */
  const addFromQuickAdd = (parsed: QuickAddResult): boolean => {
    const category = parsed.category || selKey;
    if (!category) {
      setAddError('Add a category in Budget Builder before logging a spend.');
      haptic('warn');
      return false;
    }
    const nowIso = new Date().toISOString();
    const item: ExpenseItem = {
      id: genExpenseId(),
      amount: parsed.amount,
      category,
      date: parsed.date,
      ...(parsed.note ? { note: parsed.note } : {}),
      ...(parsed.paymentMethod ? { paymentMethod: parsed.paymentMethod } : {}),
      ...(parsed.tags?.length ? { tags: parsed.tags } : {}),
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    commit([item, ...items], [auditEvent('add', item)]);
    track('tool_completed', { tool: 'expenses' });
    haptic('success');
    const m = parsed.date.slice(0, 7);
    if (m !== selMonth) switchMonth(m);
    return true;
  };

  const saveTransaction = (item: ExpenseItem) => {
    const before = items.find((e) => e.id === item.id);
    const next = before ? items.map((e) => (e.id === item.id ? item : e)) : [item, ...items];
    // An edit that moved nothing records nothing — `auditEdit` returns null and
    // the history stays a list of actual changes.
    const event = before ? auditEdit(before, item) : auditEvent('add', item);
    commit(next, event ? [event] : []);
    setModalOpen(false);
    setEditing(null);
    const m = item.date.slice(0, 7);
    if (m !== selMonth) switchMonth(m);
  };

  const duplicateTransaction = (src: ExpenseItem) => {
    const nowIso = new Date().toISOString();
    const copy: ExpenseItem = { ...src, id: genExpenseId(), date: etToday(), createdAt: nowIso, updatedAt: nowIso };
    delete copy.editCount;
    commit([copy, ...items], [auditEvent('duplicate', copy)]);
    setEditing(copy);
    setModalOpen(true);
    const m = copy.date.slice(0, 7);
    if (m !== selMonth) switchMonth(m);
  };

  /**
   * Reopen the undo window for another {@link UNDO_WINDOW_MS} past the latest
   * delete or undo. `armToken` restarts the countdown bar's CSS animation:
   * remounting the element is what replays it, and it keeps the visible timer
   * honest without a per-frame React timer.
   */
  const armUndoExpiry = () => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setArmToken((n) => n + 1);
    undoTimer.current = setTimeout(() => setUndoStack([]), UNDO_WINDOW_MS);
  };

  const pushUndo = (victims: ExpenseItem[], label: string) => {
    setUndoStack((s) => [...s.slice(-9), { victims, label }]); // last 10 deletes
    armUndoExpiry();
  };

  const deleteTransaction = (id: string) => {
    const victim = items.find((e) => e.id === id);
    if (!victim) return;
    commit(items.filter((e) => e.id !== id), [auditEvent('delete', victim)]);
    haptic('remove');
    setModalOpen(false);
    setEditing(null);
    pushUndo([victim], victim.note || victim.merchant || 'Transaction');
  };

  const undoDelete = () => {
    const top = undoStack[undoStack.length - 1];
    if (!top) return;
    // Re-insert, skipping ids that already exist (e.g. double-click on Undo).
    const existing = new Set(items.map((e) => e.id));
    const revived = top.victims.filter((v) => !existing.has(v.id));
    if (revived.length) {
      const batch = revived.length > 1 ? newBatchId() : undefined;
      commit([...revived, ...items], revived.map((v) => auditEvent('restore', v, { batch })));
      haptic('success');
    }
    const rest = undoStack.slice(0, -1);
    setUndoStack(rest);
    if (rest.length) {
      armUndoExpiry();
    } else if (undoTimer.current) {
      clearTimeout(undoTimer.current);
    }
  };

  const openEdit = (item: ExpenseItem) => { setEditing(item); setModalOpen(true); };
  const openAdd = () => { setEditing(null); setModalOpen(true); };

  /**
   * A spend handed over from the ⌘K palette as `?add=<line>`.
   *
   * The palette never writes a transaction; it forwards the words the user
   * typed to this page's own quick-add line, which previews them and commits
   * through the same path as anything typed here directly. The parameter is
   * consumed immediately (replaced out of the URL) so a refresh or a shared
   * link does not re-seed the field with a spend that was already logged.
   */
  const location = useLocation();
  const navigate = useNavigate();
  const [quickSeed, setQuickSeed] = useState<{ text: string; nonce: number } | null>(null);
  const seedNonce = useRef(0);
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (!params.has('add')) return;
    const text = params.get('add') ?? '';
    seedNonce.current += 1;
    setQuickSeed({ text, nonce: seedNonce.current });
    setTab('overview');
    params.delete('add');
    const q = params.toString();
    navigate({ pathname: location.pathname, search: q ? `?${q}` : '' }, { replace: true });
  }, [location.search, location.pathname, navigate]);

  /**
   * Take the user from an empty Analytics tab to the thing that fills it.
   *
   * Switches tab, then focuses the quick-add field on the next frame — the
   * Overview panel does not exist in the DOM until React has rendered it, so
   * focusing synchronously would find nothing and silently do nothing.
   */
  const startLogging = () => {
    setTab('overview');
    requestAnimationFrame(() => {
      const el = document.getElementById('fx-qa-input') as HTMLInputElement | null;
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus();
    });
  };

  /**
   * Put a deleted transaction back from its History entry.
   *
   * Long after the 10-second undo window has closed: the entry carries the
   * complete original record, so this returns the transaction exactly as it
   * was — tags, payment method and notes included — rather than a thinner copy
   * rebuilt from what the log happened to display. Restoring something that
   * already exists is a no-op, so a double tap cannot duplicate a row.
   */
  const restoreFromHistory = (item: ExpenseItem) => {
    if (items.some((e) => e.id === item.id)) return;
    commit([item, ...items], [auditEvent('restore', item)]);
    haptic('success');
    notify(`Restored “${item.merchant || item.note || 'transaction'}”.`, 'ok');
    const m = (item.date || '').slice(0, 7);
    if (m && m !== selMonth) switchMonth(m);
  };

  // Ctrl/Cmd+Z restores the most recent deletion while the undo window is
  // open. Skipped when typing so the browser's native text undo still works.
  useEffect(() => {
    if (!undoStack.length) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.key.toLowerCase() !== 'z') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      e.preventDefault();
      undoDelete();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- undoDelete reads current stack/items each render
  }, [undoStack, items]);

  /**
   * A batch id when — and only when — more than one row is touched. It is what
   * lets the history collapse "deleted 12 transactions" into one line while
   * still holding all twelve, so a bulk action is both scannable and itemised.
   */
  const batchIdFor = (n: number) => (n > 1 ? newBatchId() : undefined);

  const bulkDelete = (ids: string[]) => {
    if (ids.length === 0) return;
    const set = new Set(ids);
    const victims = items.filter((e) => set.has(e.id));
    if (!victims.length) return;
    const batch = batchIdFor(victims.length);
    commit(
      items.filter((e) => !set.has(e.id)),
      victims.map((v) => auditEvent('delete', v, { batch })),
    );
    haptic('remove');
    pushUndo(victims, `${victims.length} transaction${victims.length > 1 ? 's' : ''}`);
  };

  const bulkDuplicate = (ids: string[]) => {
    const set = new Set(ids);
    const nowIso = new Date().toISOString();
    const copies = items
      .filter((e) => set.has(e.id))
      .map((e) => { const c: ExpenseItem = { ...e, id: genExpenseId(), date: etToday(), createdAt: nowIso, updatedAt: nowIso }; delete c.editCount; return c; });
    if (!copies.length) return;
    const batch = batchIdFor(copies.length);
    commit([...copies, ...items], copies.map((c) => auditEvent('duplicate', c, { batch })));
  };

  /**
   * Land a reviewed statement in the ledger.
   *
   * Everything that decides *what* is imported already happened in the review
   * sheet; by the time rows arrive here they are ordinary transactions and take
   * the ordinary write path, audit trail included. Imports are recorded as
   * `add` events under one batch id, so the History tab shows "Added 143
   * transactions" as a single, expandable line rather than burying a week of
   * manual entries under one upload.
   */
  const importTransactions = (imported: ExpenseItem[]) => {
    if (!imported.length) return;
    const batch = batchIdFor(imported.length);
    commit([...imported, ...items], imported.map((it) => auditEvent('add', it, { batch })));
    haptic('success');
    notify(`Imported ${imported.length} transaction${imported.length > 1 ? 's' : ''}.`, 'ok');
    track('tool_completed', { tool: 'expenses' });
  };

  /**
   * Apply a change to many rows at once, recording the diff of each.
   *
   * `update` returns the new version of a row; rows it leaves untouched (an
   * identical field value) produce no entry, because `auditEdit` compares the
   * two versions rather than trusting that a write happened.
   */
  const bulkEdit = (ids: string[], update: (e: ExpenseItem, nowIso: string) => ExpenseItem) => {
    const set = new Set(ids);
    const nowIso = new Date().toISOString();
    const events: AuditEntry[] = [];
    const batch = batchIdFor(ids.length);
    const next = items.map((e) => {
      if (!set.has(e.id)) return e;
      const after = update(e, nowIso);
      const event = auditEdit(e, after, { batch });
      if (event) events.push(event);
      return after;
    });
    commit(next, events);
  };

  const bulkCategory = (ids: string[], catKey: string) => {
    bulkEdit(ids, (e, nowIso) => ({
      ...e, category: catKey, updatedAt: nowIso, editCount: (e.editCount ?? 0) + 1,
    }));
  };

  const bulkAddTags = (ids: string[], tags: string[]) => {
    if (tags.length === 0) return;
    bulkEdit(ids, (e, nowIso) => ({
      ...e,
      tags: Array.from(new Set([...(e.tags ?? []), ...tags])),
      updatedAt: nowIso,
      editCount: (e.editCount ?? 0) + 1,
    }));
  };

  const catLabel = (k: string) => flatCats.find((c) => c.k === k)?.l ?? k;

  /**
   * Category label for a key recorded in the past.
   *
   * The history holds raw keys, and a key written before the V4.1 taxonomy (or
   * before a category was renamed) will not be in `flatCats`. Resolving through
   * `migrateCategory` first is the same step `computeDashboard` takes, so an old
   * entry reads as "Groceries" rather than as the bare key `grocery`.
   */
  const auditCatLabel = useCallback(
    (k: string) => {
      const resolved = migrateCategory(k, new Set(flatCats.map((c) => c.k)));
      return flatCats.find((c) => c.k === resolved)?.l ?? k;
    },
    [flatCats],
  );

  /** The whole log, flattened for the CSV — never the filtered on-screen view. */
  const exportAudit = () => {
    exportAuditCsv(audit.map((e) => ({
      changedAt: new Date(e.ts).toLocaleString(),
      action: AUDIT_ACTION_LABEL[e.action],
      category: auditCatLabel(e.category),
      txDate: e.date,
      amount: e.amount,
      label: e.label,
      changes: (e.changes ?? [])
        .map((c) => `${AUDIT_FIELD_LABEL[c.field]}: ${c.before ?? '—'} → ${c.after ?? '—'}`)
        .join('; '),
    })));
    notify(`Exporting ${audit.length} recorded change${audit.length === 1 ? '' : 's'}…`, 'ok');
  };

  const clearAudit = () => {
    clearAuditLog();
    setAudit([]);
    notify('Change history cleared. Your transactions are untouched.', 'ok');
  };

  /**
   * Map transactions to export rows. Always the whole list it is handed, and
   * merchant stays in its own field — folding it into the note duplicated it in
   * any view that renders both.
   */
  const toExportRows = (list: ExpenseItem[]) => list.map((t) => ({
    date: t.date,
    category: catLabel(t.category),
    amount: t.amount,
    note: t.note || t.notes || '',
    ...(t.merchant ? { merchant: t.merchant } : {}),
    ...(t.paymentMethod ? { paymentMethod: t.paymentMethod } : {}),
  }));

  const runExport = (kind: ExportKind, payload: ExpenseExport) => {
    if (kind === 'csv') exportExpenseCsv(payload);
    else if (kind === 'xlsx') void exportExpenseXlsx(payload);
    else void exportExpensePdf(payload);
    notify(`Exporting ${payload.transactions.length} transaction${payload.transactions.length === 1 ? '' : 's'}…`, 'ok');
  };

  /**
   * Export an arbitrary selection (the list's "Export selected"). Built from
   * the passed items, not from anything the DOM rendered, so a selection that
   * spans several virtualised pages still exports in full.
   */
  const exportTransactions = (kind: ExportKind, list: ExpenseItem[], scopeLabel: string) => {
    if (list.length === 0) return;
    const byCat: Record<string, number> = {};
    list.forEach((t) => { byCat[t.category] = (byCat[t.category] || 0) + t.amount; });
    const total = list.reduce((s, t) => s + t.amount, 0);
    const sectionOf = (k: string) => flatCats.find((c) => c.k === k)?.section ?? null;
    runExport(kind, {
      monthLabel: `${monthLabel(selMonth)} (${scopeLabel})`,
      currency: code,
      totalSpent: total,
      dailyAvg: r.dailyAvg,
      txCount: list.length,
      budget: 0,
      daysInMonth: r.daysInMonth,
      breakdown: Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([k, v]) => ({
        label: catLabel(k),
        amount: v,
        pct: total > 0 ? Math.round((v / total) * 100) : 0,
        spending: isSpendingCategory({ k, section: sectionOf(k) }),
      })),
      transactions: toExportRows(list),
    });
  };

  /**
   * The month's report. `monthTx` is the complete set of transactions for the
   * selected month — never `r.recent` (an 8-row preview for the dashboard),
   * never the filtered/paginated view. Display concerns must not reach a report.
   */
  /**
   * The previous month, summarised for the PDF's comparison section.
   *
   * Keyed by the same display labels `breakdown` uses, so the two months line
   * up on the page even where a category key was migrated between them. Null
   * when the month before this one has nothing in it — a comparison against
   * zero is a chart of one bar and a "New" on every row.
   */
  const previousForExport = (): ExpenseExport['previous'] => {
    const pm = prevMonth(selMonth);
    const prevItems = items.filter((e) => (e.date || '').slice(0, 7) === pm);
    if (prevItems.length === 0) return undefined;
    const byCategory: Record<string, number> = {};
    prevItems.forEach((t) => {
      const label = catLabel(migrateCategory(t.category, new Set(flatCats.map((c) => c.k))));
      byCategory[label] = (byCategory[label] || 0) + t.amount;
    });
    return {
      label: monthLabel(pm),
      totalSpent: prevItems.reduce((s, t) => s + t.amount, 0),
      byCategory,
    };
  };

  const buildExport = (): ExpenseExport => ({
    monthLabel: monthLabel(selMonth),
    previous: previousForExport(),
    currency: code,
    totalSpent: r.monthlySpent,
    dailyAvg: r.dailyAvg,
    txCount: r.txCount,
    budget: r.monthlyBudget,
    income: r.income,
    monthlySavings: r.monthlySavings,
    netCashFlow: r.netCashFlow,
    budgetUsedPct: r.budgetUsedPct,
    daysInMonth: r.daysInMonth,
    daysRemaining: r.daysRemaining,
    categoryBudgets: r.categories
      .filter((c) => c.budget > 0 || c.spent > 0)
      .map((c) => ({ label: c.l, budget: c.budget, spent: c.spent })),
    breakdown: r.categories.filter((c) => c.spent > 0).sort((a, b) => b.spent - a.spent).map((c) => ({
      label: c.l,
      amount: c.spent,
      pct: r.monthlySpent > 0 ? Math.round((c.spent / r.monthlySpent) * 100) : 0,
      spending: isSpendingCategory(c),
    })),
    transactions: toExportRows(
      [...monthTx].sort((a, b) => (b.date || '').localeCompare(a.date || '')),
    ),
  });

  return (
    <div className="fx-page">
      <style>{TAB_STYLES}</style>

      <PageHead chip="Expense Manager" chipColor="var(--orange)" chipBg="rgba(194,65,12,.09)" icon="expense" title="Your money, tracked and understood.">
        Categories and budgets flow from Budget Builder — log a spend and watch your Needs, Wants and Savings update live. Explore analytics to discover spending patterns.
      </PageHead>

      {/* Tab bar — WAI-ARIA tablist with roving tabindex + arrow-key nav. */}
      <Tabs items={TAB_ITEMS} active={tab} onChange={setTab} idBase="fx-exp" label="Expense views" />

      {/* Month nav + export. Hidden on History, which is ordered by when a
          change was made rather than by the month a spend falls in: a month
          picker that changes nothing, beside an Export that would silently
          produce the month's expenses instead of the history, is two controls
          quietly lying about their scope. History carries its own export.

          The row wraps rather than overflowing. Neither the month nav nor the
          two buttons shrink below their content, so at 320px a third control in
          one line pushed the page 79px wider than the viewport — a horizontal
          scrollbar on the whole tool, not just this row. Giving the nav a
          flex-basis it cannot reach on a small screen makes the buttons drop to
          a second line instead, with no media query to keep in sync with the
          breakpoints in tools.css. */}
      {tab !== 'history' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <MonthNav activeMonth={selMonth} months={months} onSwitch={switchMonth} pastNote="Viewing past month" pastColor="var(--orange)" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            {/* Import sits beside Export because they are the same idea in two
                directions, and someone looking for one looks here for the other. */}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ gap: 6 }}
              onClick={() => setImporting(true)}
            >
              <Icon name="layers" size={15} />
              Import
            </button>
            <ExportMenu
              source="expenses"
              label="Export"
              onCsv={() => runExport('csv', buildExport())}
              onXlsx={() => runExport('xlsx', buildExport())}
              onPdf={() => runExport('pdf', buildExport())}
            />
          </div>
        </div>
      )}

      {importing && (
        <Suspense fallback={null}>
          <StatementImport
            cats={flatCats}
            existing={items}
            cfmt={cfmt}
            currencyCode={code}
            onImport={importTransactions}
            onClose={() => setImporting(false)}
          />
        </Suspense>
      )}

      {/* Tab panels — labelled by their tab; panels hold focusable content so
          they need no tabindex of their own (APG). */}
      <div role="tabpanel" id={`fx-exp-panel-${tab}`} aria-labelledby={`fx-exp-tab-${tab}`}>
        {tab === 'overview' && (
          <OverviewTab
            r={r} items={items} monthTx={monthTx} selMonth={selMonth} flatCats={flatCats}
            selKey={selKey} sel={sel} setSel={setSel} amount={amount} setAmount={changeAmount}
            recentCatKeys={recentCatKeys}
            addError={addError} amountRef={amountRef}
            date={date} setDate={setDate} note={note} setNote={setNote} justAdded={justAdded}
            cfmt={cfmt} sym={sym} now={now} catMeta={catMeta} monthlyBudget={r.monthlyBudget}
            addExpense={addExpense} addFromQuickAdd={addFromQuickAdd} quickSeed={quickSeed}
            openAdd={openAdd} openEdit={openEdit}
            duplicateTransaction={duplicateTransaction} deleteTransaction={deleteTransaction}
            bulkDelete={bulkDelete} bulkDuplicate={bulkDuplicate} bulkCategory={bulkCategory}
            bulkAddTags={bulkAddTags} exportTransactions={exportTransactions}
            code={code} theme={theme}
            listApi={listApi}
          />
        )}
        {tab === 'analytics' && (
          <AnalyticsTab
            items={items} selMonth={selMonth} catMeta={catMeta}
            cfmt={cfmt} code={code} theme={theme} now={now}
            monthlyBudget={r.monthlyBudget}
            budgetTotalOf={budgetTotalOf}
            onStartLogging={startLogging}
          />
        )}
        {tab === 'recurring' && (
          <RecurringTab
            items={items} catMeta={catMeta} cfmt={cfmt}
            onEdit={openEdit}
          />
        )}
        {tab === 'history' && (
          <AuditTrail
            entries={audit}
            items={items}
            catLabel={auditCatLabel}
            cfmt={cfmt}
            now={now}
            onOpen={openEdit}
            onRestore={restoreFromHistory}
            onExport={exportAudit}
            onClear={clearAudit}
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
          recentCats={recentCatKeys}
          history={editing ? historyFor(audit, editing.id) : []}
          cfmt={cfmt}
          onSave={saveTransaction}
          onClose={() => { setModalOpen(false); setEditing(null); }}
          onDelete={deleteTransaction}
          onDuplicate={duplicateTransaction}
        />
      )}

      {/* Portaled like the modal: a fixed toast must never sit under an
          ancestor that animates transform (it becomes its containing block). */}
      {undoStack.length > 0 && createPortal(
        <div className="fx-tools fx-scope fx-undo" role="status" aria-live="polite">
          <style>{UNDO_STYLES}</style>
          <div className="fx-undo-body">
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Deleted “{undoStack[undoStack.length - 1].label}”.
            </span>
            <kbd aria-hidden="true">{typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘Z' : 'Ctrl+Z'}</kbd>
            <button type="button" className="btn btn-sm" style={{ width: 'auto', padding: '7px 16px', flexShrink: 0 }} onClick={undoDelete}>
              Undo{undoStack.length > 1 ? ` (${undoStack.length})` : ''}
            </button>
          </div>
          {/* How long is left, shown rather than implied. Decorative: the text
              above already carries the message, and the countdown is restarted
              by remounting on `armToken`. */}
          <span
            key={armToken}
            className="fx-undo-tick"
            aria-hidden="true"
            style={{ animationDuration: `${UNDO_WINDOW_MS}ms` }}
          />
        </div>,
        document.body
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
  recentCatKeys: string[];
  amount: string; setAmount: (v: string) => void;
  /** Why the last submission was rejected — null when the form is clean. */
  addError: string | null;
  amountRef: RefObject<HTMLInputElement | null>;
  date: string; setDate: (v: string) => void;
  note: string; setNote: (v: string) => void;
  justAdded: boolean;
  cfmt: (n: number) => string; sym: string; now: Date;
  catMeta: Map<string, CatMeta>; monthlyBudget: number;
  addExpense: () => void;
  /** Commit a parsed one-line entry. False when it could not be logged. */
  addFromQuickAdd: (parsed: QuickAddResult) => boolean;
  /** A line handed over by the ⌘K palette, to be typed into the quick-add field. */
  quickSeed: { text: string; nonce: number } | null;
  openAdd: () => void; openEdit: (item: ExpenseItem) => void;
  duplicateTransaction: (item: ExpenseItem) => void; deleteTransaction: (id: string) => void;
  bulkDelete: (ids: string[]) => void; bulkDuplicate: (ids: string[]) => void;
  bulkCategory: (ids: string[], catKey: string) => void;
  bulkAddTags: (ids: string[], tags: string[]) => void;
  exportTransactions: (kind: ExportKind, items: ExpenseItem[], scopeLabel: string) => void;
  code: string; theme: string | undefined;
  /** Imperative handle to the transaction list (used by the warnings panel). */
  listApi: RefObject<TransactionListHandle | null>;
}

function OverviewTab({
  r, items, monthTx, selMonth, flatCats, selKey, setSel, recentCatKeys,
  amount, setAmount, addError, amountRef, date, setDate, note, setNote, justAdded,
  cfmt, sym, now, catMeta, monthlyBudget,
  addExpense, addFromQuickAdd, quickSeed, openAdd, openEdit, duplicateTransaction, deleteTransaction,
  bulkDelete, bulkDuplicate, bulkCategory, bulkAddTags, exportTransactions,
  code, listApi,
}: OverviewProps) {
  const insights = useMemo(
    () => generateInsights(items, selMonth, monthlyBudget, catMeta, now),
    [items, selMonth, monthlyBudget, catMeta, now]
  );

  const streaks = useMemo(() => computeStreaks(items, now), [items, now]);

  // Resolve the frequent-category keys to real categories for the quick-pick.
  const recentInline = useMemo(() => {
    const byKey = new Map(flatCats.map((c) => [c.k, c]));
    return recentCatKeys.map((k) => byKey.get(k)).filter((c): c is typeof flatCats[number] => !!c);
  }, [flatCats, recentCatKeys]);

  return (
    <>
      {/* KPI strip */}
      <div className="dash-grid" style={{ marginBottom: 12 }}>
        <Kpi v={cfmt(r.monthlyBudget)} l="Monthly budget" />
        <Kpi v={cfmt(r.monthlySpent)} l="Monthly spent" color="var(--orange)" />
        <Kpi
          v={cfmt(Math.abs(r.remaining))}
          l={r.remaining >= 0 ? 'Remaining budget' : 'Over budget by'}
          color={r.remaining >= 0 ? 'var(--green)' : 'var(--red)'}
        />
        <Kpi
          v={r.monthlyBudget > 0 ? `${Math.round(r.budgetUsedPct)}%` : '—'}
          l="Budget used"
          color={TONE_COLOR[r.tone]}
        />
      </div>

      {/* Month pacing & cash flow */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>
            {r.isCurrentMonth ? 'Pacing & cash flow' : 'Month summary'}
          </span>
          <AskAiButton focus={{ kind: 'overview' }} />
        </div>
        <div className="fx-metrics">
          <Metric
            label="Days remaining"
            value={r.isCurrentMonth ? String(r.daysRemaining) : '0'}
            note={r.isCurrentMonth ? `of ${r.daysInMonth} days` : 'Month complete'}
            accent="var(--blue)"
          />
          <Metric
            label="Daily safe spend"
            value={r.dailySafeSpend != null ? cfmt(r.dailySafeSpend) : '—'}
            note={r.dailySafeSpend == null
              ? (r.monthlyBudget > 0 ? 'Month complete' : 'Set a budget to see this')
              : r.daysRemaining === 0
                ? 'Left for today — the last day of the month'
                : 'Per day to stay inside budget'}
            accent={r.remaining >= 0 ? 'var(--green)' : 'var(--red)'}
          />
          <Metric
            label="Monthly savings"
            value={cfmt(r.monthlySavings)}
            note={r.income > 0
              ? `${Math.round((r.monthlySavings / r.income) * 100)}% of income`
              : 'Logged to savings categories'}
            accent="var(--green)"
          />
          <Metric
            label="Net cash flow"
            value={r.netCashFlow != null ? cfmt(r.netCashFlow) : '—'}
            note={r.netCashFlow == null
              ? 'Add income in Budget Builder'
              : r.netCashFlow >= 0 ? 'Income exceeds spending' : 'Spending exceeds income'}
            accent={(r.netCashFlow ?? 0) >= 0 ? 'var(--green)' : 'var(--red)'}
          />
        </div>
      </div>

      {/* Budget warnings — categories at or past 80% */}
      {r.warnings.length > 0 && (
        <WarningsCard warnings={r.warnings} cfmt={cfmt} onSelect={(k) => listApi.current?.focusCategory(k)} />
      )}

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
            const tone = budgetTone(s.budget, s.spent);
            const fill = budgetFillPct(s.budget, s.spent);
            return (
              <div key={s.section} className="well">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: SECTION_COLOR[s.section] }}>{s.label}</span>
                  <span className="note">{s.budget > 0 ? `${Math.round((s.spent / s.budget) * 100)}%` : '—'}</span>
                </div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{cfmt(s.spent)}</div>
                <div className="note" style={{ marginBottom: 8 }}>of {cfmt(s.budget)}</div>
                {/* `aria-valuetext` says what the value is; `aria-label` says
                    what the bar is for. Without the label a screen reader
                    announces three unattributed figures in a row. */}
                <div
                  className="bar"
                  role="progressbar"
                  aria-label={`${s.label} spending against budget`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={Math.round(fill)}
                  aria-valuetext={`${s.label}: ${cfmt(s.spent)} of ${cfmt(s.budget)} — ${TONE_LABEL[tone]}`}
                >
                  <div className="bar-fill" style={{ width: `${fill}%`, background: TONE_FILL[tone] }} />
                </div>
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

      {/* Add expense — a real form, so Enter submits and the browser exposes
          the field/validation relationships to assistive tech. */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Add an expense</div>

        {/* The one-line route, above the structured one. Fills the same fields
            through the same commit path — see QuickAddBar. */}
        {flatCats.length > 0 && (
          <QuickAddBar
            cats={flatCats}
            cfmt={cfmt}
            now={now}
            onAdd={addFromQuickAdd}
            fallbackCategory={selKey}
            seed={quickSeed ?? undefined}
          />
        )}

        <form onSubmit={(e) => { e.preventDefault(); addExpense(); }} noValidate>
        <div className="grid2">
          <div className="fg">
            <label className="fl" htmlFor="et-amount">Amount ({sym})</label>
            {/* Accepts arithmetic as well as a number — "120/4" is a valid way
                to say 30, and "=10+5+3" is the spreadsheet form of the same
                thing. The placeholder is what makes that discoverable.
                See ui/AmountInput.tsx. */}
            <AmountInput
              id="et-amount"
              inputRef={amountRef}
              sym={sym}
              placeholder="0  or  =10+5+3"
              required
              invalid={!!addError}
              errorId={addError ? 'et-add-err' : undefined}
              value={amount}
              onChange={setAmount}
            />
          </div>
          <div className="fg">
            <label className="fl" htmlFor="et-date">Date</label>
            <input className="fi" type="date" id="et-date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <label className="fl">Category (from Budget Builder)</label>
        {flatCats.length > 6 && recentInline.length >= 2 && (
          <div style={{ marginBottom: 10 }}>
            <div className="note" style={{ fontWeight: 700, marginBottom: 6 }}>Recent</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {recentInline.map((c) => (
                <button key={`et-recent-${c.k}`} type="button" onClick={() => setSel(c.k)}
                  aria-pressed={selKey === c.k} aria-label={`${c.l} (recent)`} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 160, padding: '7px 12px', borderRadius: 980,
                    border: `1.5px solid ${selKey === c.k ? 'var(--ink)' : 'var(--hair2)'}`, background: selKey === c.k ? 'var(--hair)' : 'var(--card)',
                    color: 'var(--ink)', cursor: 'pointer', fontSize: 12, fontWeight: 600, fontFamily: 'inherit', transition: 'all .15s',
                  }}>
                  <Icon name={c.ic} size={14} style={{ color: SECTION_COLOR[c.section] }} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.l}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(96px, 1fr))', gap: 7, marginBottom: 14 }}>
          {flatCats.map((c) => (
            <button key={c.k} type="button" onClick={() => setSel(c.k)} title={SECTION_LABEL[c.section]}
              aria-pressed={selKey === c.k} aria-label={`${c.l} (${SECTION_LABEL[c.section]})`} style={{
                padding: '10px 4px', borderRadius: 12, border: `1.5px solid ${selKey === c.k ? 'var(--ink)' : 'var(--hair2)'}`,
                background: selKey === c.k ? 'var(--hair)' : 'var(--card)', textAlign: 'center', cursor: 'pointer', transition: 'all .15s', fontFamily: 'inherit',
              }}>
              <span style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 22, marginBottom: 2 }}>
                <Icon name={c.ic} size={18} style={{ color: SECTION_COLOR[c.section] }} />
              </span>
              <span style={{ fontSize: 10, color: 'var(--ink2)', fontWeight: 600, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.l}</span>
            </button>
          ))}
        </div>
        <div className="fg">
          <label className="fl" htmlFor="et-note">Note (optional)</label>
          <input className="fi" type="text" id="et-note" placeholder="What was it for?" maxLength={60} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {addError && (
          <div
            id="et-add-err"
            role="alert"
            style={{ color: 'var(--red)', fontSize: 12.5, fontWeight: 600, marginBottom: 10 }}
          >
            {addError}
          </div>
        )}
        <button type="submit" className="btn" style={justAdded ? { background: 'var(--green)' } : undefined}>
          {justAdded ? 'Added ✓' : 'Add expense'}
        </button>
        {flatCats.length === 0 && <div className="note" style={{ marginTop: 8 }}>Add categories in Budget Builder to start tracking.</div>}
        </form>
      </div>

      {/* Per-category budget health */}
      <CategoryBudgetsCard
        categories={r.categories}
        cfmt={cfmt}
        monthText={monthLabel(selMonth)}
      />

      {/* Top categories */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>Top spending categories</div>
        <p className="note" style={{ marginBottom: 10 }}>
          Real spending only — savings, investments and transfers are excluded.
        </p>
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
                  <div className="bar bar-sm"><div className="bar-fill" style={{ width: `${(c.spent / max) * 100}%`, background: c.section ? SECTION_FILL[c.section] : 'var(--ink3)' }} /></div>
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
        apiRef={listApi}
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
  items, selMonth, catMeta, cfmt, code, theme, now, monthlyBudget, budgetTotalOf,
  onStartLogging,
}: {
  items: ExpenseItem[]; selMonth: string; catMeta: Map<string, CatMeta>;
  cfmt: (n: number) => string; code: string; theme: string | undefined; now: Date;
  monthlyBudget: number;
  /** Total budget for any month, used by the timeline's 12-month view. */
  budgetTotalOf: (month: string) => number;
  /** Send the user to the place they can actually act — the add form. */
  onStartLogging: () => void;
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
    return <AnalyticsPreview logged={0} onStart={onStartLogging} />;
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

      {/* Budget timeline — spending progression against the plan */}
      <BudgetTimeline
        items={items}
        month={selMonth}
        budgetOf={budgetTotalOf}
        cfmt={cfmt}
        code={code}
        theme={theme}
        now={now}
      />

      {/* 12-month spending trend */}
      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>12-month spending trend</div>
        <Trend12Chart trend={trend12} cfmt={cfmt} code={code} theme={theme} />
      </div>

      {/* Daily spending heatmap. The month follows the page's month picker, so
          current, previous and any custom month all render here. */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 2 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Daily spending — {monthLabel(selMonth)}</span>
          <AskAiButton focus={{ kind: 'heatmap' }} />
        </div>
        <p className="note" style={{ marginBottom: 12 }}>
          Darker means more spent. Select a day for its detail — use the month picker above to look at another month.
        </p>
        <Heatmap days={heatmap} cfmt={cfmt} monthText={monthLabel(selMonth)} />
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

/**
 * The Analytics tab before there is anything to analyse.
 *
 * "No data yet" is true and useless: it describes the gap without saying what
 * closing it buys, so the tab reads as broken rather than as empty. This shows
 * the actual shape of what each chart will become, names what unlocks when, and
 * puts the one action that helps — logging a spend — inside the empty state
 * instead of describing where to find it.
 *
 * The sample bars are explicitly labelled as an example and marked
 * `aria-hidden`: an illustration a screen reader announced as figures would be
 * indistinguishable from real data, which is the one thing this must never be.
 */
function AnalyticsPreview({ logged, onStart }: { logged: number; onStart: () => void }) {
  const milestones = [
    { at: 1, label: 'Payment methods & daily heatmap', icon: 'pie' as IconName },
    { at: 5, label: 'Top merchants and category mix', icon: 'briefcase' as IconName },
    { at: 10, label: 'Month-end forecast and pacing', icon: 'trending' as IconName },
    { at: 30, label: 'Recurring detection and month-on-month trends', icon: 'refresh' as IconName },
  ];

  return (
    <div className="card fx-apv">
      <style>{ANALYTICS_PREVIEW_STYLES}</style>

      <div className="fx-apv-head">
        <Icon name="trending" size={22} style={{ color: 'var(--gold)' }} />
        <div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Your analytics start here</div>
          <p className="note" style={{ margin: '3px 0 0' }}>
            Every spend you log adds to these. Nothing below is real yet — it is what this
            tab becomes once you start.
          </p>
        </div>
      </div>

      {/* A sample of the real chart, drawn from fixed values. */}
      <div className="fx-apv-chart" aria-hidden="true">
        {[38, 62, 45, 78, 55, 88].map((h, i) => (
          <span key={i} className="fx-apv-bar" style={{ height: `${h}%`, animationDelay: `${i * 70}ms` }} />
        ))}
      </div>
      <p className="note fx-apv-caption">Example only — a six-month trend, split into Needs, Wants and Savings.</p>

      <ul className="fx-apv-list">
        {milestones.map((m) => {
          const done = logged >= m.at;
          return (
            <li key={m.at} className={`fx-apv-item${done ? ' is-done' : ''}`}>
              <Icon
                name={done ? 'check' : m.icon}
                size={15}
                style={{ color: done ? 'var(--green)' : 'var(--ink3)', flexShrink: 0 }}
                aria-hidden="true"
              />
              <span className="fx-apv-label">{m.label}</span>
              <span className="fx-apv-at">
                {done ? 'Ready' : `${m.at} transaction${m.at === 1 ? '' : 's'}`}
              </span>
            </li>
          );
        })}
      </ul>

      <button type="button" className="btn btn-sm fx-apv-cta" onClick={onStart}>
        Log your first expense
      </button>
    </div>
  );
}

const ANALYTICS_PREVIEW_STYLES = `
.fx-tools .fx-apv-head{display:flex;gap:12px;align-items:flex-start;margin-bottom:16px;}
.fx-tools .fx-apv-chart{display:flex;align-items:flex-end;gap:8px;height:120px;padding:0 4px;
  border-bottom:1px solid var(--hair2);}
.fx-tools .fx-apv-bar{flex:1;border-radius:5px 5px 0 0;
  background:linear-gradient(180deg,color-mix(in srgb,var(--gold) 42%,transparent),color-mix(in srgb,var(--gold) 12%,transparent));
  border:1px solid color-mix(in srgb,var(--gold) 30%,transparent);border-bottom:none;
  transform-origin:bottom;animation:fxApvGrow .5s cubic-bezier(.2,.9,.3,1) both;}
@keyframes fxApvGrow{from{transform:scaleY(.05);opacity:0}to{transform:scaleY(1);opacity:1}}
.fx-tools .fx-apv-caption{margin:8px 0 16px;font-size:11px;}
.fx-tools .fx-apv-list{list-style:none;margin:0 0 16px;padding:0;display:grid;gap:2px;}
.fx-tools .fx-apv-item{display:flex;align-items:center;gap:10px;padding:9px 10px;border-radius:10px;
  background:var(--well);border:1px solid var(--well-border);}
.fx-tools .fx-apv-item.is-done{border-color:color-mix(in srgb,var(--green) 35%,transparent);}
.fx-tools .fx-apv-label{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:var(--ink2);}
.fx-tools .fx-apv-at{font-size:11px;font-weight:700;color:var(--ink3);flex-shrink:0;}
.fx-tools .fx-apv-item.is-done .fx-apv-at{color:var(--green);}
.fx-tools .fx-apv-cta{width:auto;min-width:180px;}
@media (max-width:480px){
  .fx-tools .fx-apv-chart{height:88px;}
  .fx-tools .fx-apv-cta{width:100%;}
}
@media (prefers-reduced-motion:reduce){.fx-tools .fx-apv-bar{animation:none;}}
`;

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

/** A labelled figure with a supporting line — the dashboard's secondary tier. */
function Metric({ label, value, note, accent }: { label: string; value: string; note: string; accent: string }) {
  return (
    <div className="fx-metric" style={{ ['--m-accent' as string]: accent }}>
      <div className="fx-metric-l">{label}</div>
      <div className="fx-metric-v">{value}</div>
      <div className="fx-metric-n">{note}</div>
    </div>
  );
}

/**
 * Categories that need attention. Each row is a button: pressing it filters the
 * transaction list to that category and scrolls to it, so "Food is at 92%"
 * leads straight to the transactions that made it 92%.
 */
function WarningsCard({
  warnings, cfmt, onSelect,
}: {
  warnings: BudgetWarning[];
  cfmt: (n: number) => string;
  onSelect: (k: string) => void;
}) {
  const over = warnings.filter((w) => w.tone === 'over').length;
  return (
    <div className="card fx-warn-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <Icon name="warn" size={16} style={{ color: over > 0 ? 'var(--red)' : 'var(--orange)' }} />
        <div style={{ fontSize: 14, fontWeight: 700 }}>Budget warnings</div>
        <span className="fx-warn-count">{warnings.length}</span>
      </div>
      <p className="note" style={{ marginBottom: 10 }}>
        {over > 0
          ? `${over} ${over === 1 ? 'category is' : 'categories are'} over budget, and others are approaching their limit.`
          : 'These categories are approaching their limit this month.'}
      </p>
      <ul className="fx-warn-list">
        {warnings.slice(0, 6).map((w) => {
          const color = TONE_COLOR[w.tone];
          const pct = Math.round(w.pct);
          return (
            <li key={w.k}>
              <button
                type="button"
                className="fx-warn-row"
                onClick={() => onSelect(w.k)}
                aria-label={`${w.label}: ${pct}% of budget used, ${cfmt(w.spent)} of ${cfmt(w.budget)}. Show these transactions.`}
              >
                <Icon name={w.ic} size={16} style={{ color, flexShrink: 0 }} />
                <span className="fx-warn-name">{w.label}</span>
                <span className="fx-warn-bar" aria-hidden="true">
                  <span style={{ width: `${budgetFillPct(w.budget, w.spent)}%`, background: color }} />
                </span>
                <span className="fx-warn-pct" style={{ color }}>{pct}%</span>
                <span className="fx-warn-tag" style={{ color }}>{TONE_LABEL[w.tone]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
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
        {/* An observation is only half an insight — this is the other half.
            Pulled left so the sparkle lines up with the body text above it. */}
        <div style={{ marginTop: 6, marginLeft: -10 }}>
          <AskAiButton
            focus={{ kind: 'insight', id: insight.id, title: insight.title, body: insight.body }}
          />
        </div>
      </div>
    </div>
  );
}

/* ── Category budgets, with a sort the user controls ── */

type CatSort = 'section' | 'spent' | 'budget' | 'over' | 'name';

const CAT_SORTS: ReadonlyArray<{ key: CatSort; label: string }> = [
  { key: 'spent', label: 'Most spent' },
  { key: 'section', label: 'Needs · Wants · Savings' },
  { key: 'over', label: 'Closest to limit' },
  { key: 'budget', label: 'Largest budget' },
  { key: 'name', label: 'Name (A–Z)' },
];

/** Display preference, not data — deliberately outside SYNC_KEYS. */
const CAT_SORT_KEY = 'fx_exp_catsort';

const SECTION_ORDER: Record<string, number> = { needs: 0, wants: 1, save: 2 };

function sortCategories(list: DashCategory[], sort: CatSort): DashCategory[] {
  const rows = [...list];
  switch (sort) {
    case 'name':
      return rows.sort((a, b) => a.l.localeCompare(b.l));
    case 'budget':
      return rows.sort((a, b) => b.budget - a.budget || b.spent - a.spent);
    case 'over':
      // A category with no budget has no "limit" to be close to, so it sorts
      // last rather than sharing 0% with a category that is genuinely untouched.
      return rows.sort((a, b) => {
        const ap = a.budget > 0 ? a.pct : -1;
        const bp = b.budget > 0 ? b.pct : -1;
        return bp - ap || b.spent - a.spent;
      });
    case 'section':
      return rows.sort((a, b) => {
        // Uncategorised spend has no section and belongs after all three,
        // not silently folded into Needs.
        const as = a.section ? SECTION_ORDER[a.section] : 3;
        const bs = b.section ? SECTION_ORDER[b.section] : 3;
        return as - bs || b.spent - a.spent;
      });
    case 'spent':
    default:
      return rows.sort((a, b) => b.spent - a.spent);
  }
}

/**
 * Per-category budget health.
 *
 * Sorting by section is the reason this exists: the card lists every category
 * the month touched, and "how are my Needs doing?" was unanswerable without
 * reading the whole list and remembering which key sat in which section. When
 * that sort is active the sections are labelled, because a grouped list with no
 * headings is just a differently-ordered list.
 */
function CategoryBudgetsCard({
  categories, cfmt, monthText,
}: {
  categories: DashCategory[];
  cfmt: (n: number) => string;
  monthText: string;
}) {
  const [sort, setSort] = useState<CatSort>(() => {
    const saved = getJSON<string>(CAT_SORT_KEY, 'spent');
    return CAT_SORTS.some((s) => s.key === saved) ? (saved as CatSort) : 'spent';
  });

  const changeSort = (next: CatSort) => {
    setSort(next);
    setJSON(CAT_SORT_KEY, next);
  };

  const shown = useMemo(
    () => sortCategories(categories.filter((c) => c.budget > 0 || c.spent > 0), sort),
    [categories, sort],
  );

  // Section headings are only meaningful — and only honest — under the section
  // sort; anywhere else the same heading would sit above a non-contiguous run.
  let lastSection: string | null | undefined;

  return (
    <div className="card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Category budgets</div>
        {shown.length > 1 && (
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
            <label className="note" htmlFor="fx-catsort" style={{ fontWeight: 600 }}>Sort</label>
            <select
              id="fx-catsort"
              className="fs"
              style={{ width: 'auto', minWidth: 150, height: 34, fontSize: 12 }}
              value={sort}
              onChange={(e) => changeSort(e.target.value as CatSort)}
            >
              {CAT_SORTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        )}
      </div>
      {shown.length === 0 ? (
        <div className="note">No budgets or spending yet for {monthText}.</div>
      ) : (
        shown.map((c) => {
          const heading = sort === 'section' && c.section !== lastSection
            ? (lastSection = c.section, c.section)
            : null;
          return (
            <div key={c.k}>
              {sort === 'section' && heading !== null && (
                <div
                  className="note"
                  style={{
                    fontWeight: 700, marginTop: 10, marginBottom: 2,
                    color: c.section ? SECTION_COLOR[c.section] : 'var(--ink3)',
                    textTransform: 'uppercase', letterSpacing: '.04em', fontSize: 10.5,
                  }}
                >
                  {c.section ? SECTION_LABEL[c.section] : 'Uncategorised'}
                </div>
              )}
              <CategoryRow c={c} cfmt={cfmt} />
            </div>
          );
        })
      )}
    </div>
  );
}

function CategoryRow({ c, cfmt }: { c: DashCategory; cfmt: (n: number) => string }) {
  // One tone drives the pill, the bar and the exported status — see budgetStatus.ts.
  const color = TONE_COLOR[c.tone];
  const fill = budgetFillPct(c.budget, c.spent);
  return (
    <div style={{ padding: '9px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 5 }}>
        <Icon name={c.ic} size={16} style={{ color: c.section ? SECTION_COLOR[c.section] : 'var(--ink2)' }} />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600 }}>{c.l}</span>
        {/* Icon-only: a labelled pill on every category row would shout over
            the figures it sits beside. The accessible name still names it. */}
        <AskAiButton focus={{ kind: 'category', key: c.k, label: c.l }} iconOnly />
        <span className="pill" style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color, fontSize: 10 }}>
          {TONE_LABEL[c.tone]}
        </span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--ink2)', marginBottom: 4 }}>
        <span>{cfmt(c.spent)} spent</span>
        {c.budget > 0 ? <span>{cfmt(Math.abs(c.remaining))} {c.remaining >= 0 ? 'left' : 'over'} · budget {cfmt(c.budget)}</span> : <span>no budget set</span>}
      </div>
      <div
        className="bar"
        style={{ height: 6 }}
        role="progressbar"
        aria-label={`${c.l} spending against budget`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill)}
        aria-valuetext={c.budget > 0
          ? `${cfmt(c.spent)} of ${cfmt(c.budget)} — ${TONE_LABEL[c.tone]}`
          : `${cfmt(c.spent)} spent, no budget set`}
      >
        <div className="bar-fill" style={{ width: `${fill}%`, background: color }} />
      </div>
    </div>
  );
}

/* ── Charts ── */

/* ══════════════════════════════════════════════════════════════════════════
   Stacked trend charts

   Both trend charts show the same thing at different ranges, so the segment
   construction, the in-bar labels and the text alternative live here once
   rather than twice.
   ══════════════════════════════════════════════════════════════════════════ */

/** The shape both `TrendPoint` and `MonthlyTrend` already satisfy. */
interface StackablePoint {
  label: string;
  spent: number;
  split: SectionSplit;
}

/** Bottom-to-top segment order, matching the Needs · Wants · Savings card. */
const SECTION_SERIES: readonly { key: SectionSeriesKey; label: string }[] = [
  { key: 'needs', label: SECTION_LABEL.needs },
  { key: 'wants', label: SECTION_LABEL.wants },
  { key: 'save', label: SECTION_LABEL.save },
  { key: 'unassigned', label: 'Unassigned' },
];

/**
 * Opacity of a segment's fill. The bar this replaced was a translucent wash
 * under a full-strength 1px outline, which is what let the card's own glow show
 * through and gave it the glass look — the section colours inherit exactly that
 * treatment rather than flattening into three opaque blocks.
 */
const SEGMENT_FILL_ALPHA = 0.55;

/**
 * `#rrggbb` → `#rrggbbaa`. Canvas understands 8-digit hex, so this needs no
 * colour parsing. Anything not a plain 6-digit hex (a token that resolved to
 * `rgb()`, say) is handed back untouched and simply stays opaque.
 */
function withAlpha(color: string, alpha: number): string {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return color;
  return color + Math.round(alpha * 255).toString(16).padStart(2, '0');
}

/**
 * A corner can only be as round as its segment is tall.
 *
 * Chart.js clamps `borderRadius` to half the bar, which quietly turns a short
 * segment into a pill — and a stack of pills reads as loose chips rather than
 * one bar. That is what the card looked like on a phone, where the plot is
 * ~90px tall and a month's Needs slice can be under 20px. Capping at a third of
 * the segment keeps it a bar at every size, and leaves the desktop bars (100px+
 * tall) at the full radius they already had.
 */
function cappedRadius(base: number, chart: Chart, value: number): number {
  const y = chart.scales?.y;
  if (!y || value <= 0) return 0;
  const height = Math.abs(y.getPixelForValue(0) - y.getPixelForValue(value));
  return Math.max(0, Math.min(base, Math.floor(height / 3)));
}

/**
 * One dataset per section.
 *
 * `unassigned` is dropped unless it carries something — it is the rare case
 * (spend on a category that was since deleted), and an always-present empty
 * series would put a fourth entry in every legend for nothing.
 *
 * Corners are rounded on the outside of the stack only: the topmost and
 * bottommost segments that actually carry a value for that month. Rounding
 * every segment would put a notch at each internal boundary and break the
 * single-bar silhouette; skipping it entirely would square off a bar that was
 * round before.
 */
function buildSectionDatasets(points: StackablePoint[], radius: number, scope: Element | null) {
  const fills = getSectionFills(scope);
  const series = SECTION_SERIES.filter(
    (s) => s.key !== 'unassigned' || points.some((p) => p.split.unassigned > 0),
  );
  /** Indices into `series` of the lowest and highest non-empty segment. */
  const ends = points.map((p) => {
    const filled = series.map((s, i) => (p.split[s.key] > 0 ? i : -1)).filter((i) => i >= 0);
    return { first: filled[0] ?? -1, last: filled[filled.length - 1] ?? -1 };
  });

  return series.map((s, seriesIndex) => ({
    label: s.label,
    data: points.map((p) => p.split[s.key]),
    backgroundColor: withAlpha(fills[s.key], SEGMENT_FILL_ALPHA),
    borderColor: fills[s.key],
    borderWidth: 1,
    // Draw all four sides, so each section reads as its own pane of glass
    // instead of the bottom edge being dropped as Chart.js does by default.
    borderSkipped: false as const,
    // Chart.js leaves 28% of each slot empty by default. Reclaiming most of it
    // is what lets a figure fit inside a bar on a phone, where six months of a
    // ~250px plot otherwise gives each bar about 33px to work with.
    categoryPercentage: 0.9,
    barPercentage: 0.94,
    borderRadius: (ctx: { dataIndex: number; chart: Chart }) => {
      const end = ends[ctx.dataIndex];
      const r = cappedRadius(radius, ctx.chart, points[ctx.dataIndex]?.split[s.key] ?? 0);
      const top = end?.last === seriesIndex ? r : 0;
      const bottom = end?.first === seriesIndex ? r : 0;
      return { topLeft: top, topRight: top, bottomLeft: bottom, bottomRight: bottom };
    },
    stack: 'spend',
  }));
}

/**
 * Minimum segment box, in px, that can hold a label without it spilling.
 *
 * The text is 10px, but the box also carries a 1px border and a rounded corner
 * that eats into the ends, so a 15px segment fits the glyphs and still reads as
 * crowded. 20 is the point where the figure sits inside its own colour.
 */
const LABEL_MIN_HEIGHT = 20;
const LABEL_SIDE_PADDING = 6;

/**
 * Draws each segment's amount inside the segment.
 *
 * Chart.js has no built-in data labels, and `chartjs-plugin-datalabels` is a
 * dependency for the one feature used here — this is the public plugin API
 * instead.
 *
 * Takes the SHORT formatter: a bar is about 35px wide at six months in a card,
 * where "₹22,125" cannot fit but "₹22K" can. The exact figure is a hover away
 * in the tooltip and is always in the text alternative, so the in-bar label is
 * there to make the split legible at a glance, not to be the record.
 *
 * Segments still too short or too narrow are skipped rather than allowed to
 * spill across a boundary — on a phone a small Wants segment is routinely that
 * thin, and an unreadable overlap is worse than a figure shown elsewhere.
 */
function segmentLabels(fmt: (n: number) => string, ink: string): Plugin<'bar'> {
  return {
    id: 'fxSegmentLabels',
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      ctx.save();
      ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
      ctx.fillStyle = ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        meta.data.forEach((el, i) => {
          const value = Number(ds.data[i]) || 0;
          if (value <= 0) return;
          const bar = el as unknown as { x: number; y: number; base: number; width: number };
          const height = Math.abs(bar.base - bar.y);
          if (height < LABEL_MIN_HEIGHT) return;
          const text = fmt(value);
          if (ctx.measureText(text).width + LABEL_SIDE_PADDING > bar.width) return;
          ctx.fillText(text, bar.x, (bar.y + bar.base) / 2);
        });
      });
      ctx.restore();
    },
  };
}

/**
 * Text alternative for the stacked chart.
 *
 * A bare <canvas> is an empty element to a screen reader, and this chart is the
 * only place the month-by-month split appears — without this the information
 * does not exist for a non-visual user (WCAG 1.1.1). Built from the same points
 * the canvas is given, so the two can never describe different numbers.
 */
function stackedTrendSummary(points: StackablePoint[], cfmt: (n: number) => string): string {
  if (points.length === 0) return 'Spending trend chart. No spending recorded yet.';
  const described = points.map((p) => {
    if (p.spent <= 0) return `${p.label} nothing`;
    const parts = SECTION_SERIES.filter((s) => p.split[s.key] > 0).map(
      (s) => `${s.label} ${cfmt(p.split[s.key])}`,
    );
    return `${p.label} ${cfmt(p.spent)} total (${parts.join(', ')})`;
  });
  return `Stacked bar chart of spending by month, split into Needs, Wants and Savings: ${described.join('; ')}.`;
}

/** Tooltip callbacks shared by both charts: per-section value plus the total. */
function stackedTooltipCallbacks(points: StackablePoint[], cfmt: (n: number) => string) {
  return {
    label: (c: { dataset: { label?: string }; raw: unknown }) =>
      ` ${c.dataset.label}: ${cfmt(c.raw as number)}`,
    footer: (items: { dataIndex: number }[]) => {
      const p = points[items[0]?.dataIndex ?? 0];
      return p ? `Total ${cfmt(p.spent)}` : '';
    },
  };
}

function TrendChart({ trend, cfmt, code }: { trend: DashResult['trend']; cfmt: (n: number) => string; code: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const { theme } = useTheme();
  const { cfmtSh } = useCurrency();
  const labels = useMemo(() => trend.map((t) => t.label), [trend]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = el.getContext('2d'); } catch { ctx = null; }
    if (!ctx) return;
    const ct = getChartTheme(theme);
    chartRef.current = new Chart(el, {
      type: 'bar',
      data: { labels, datasets: buildSectionDatasets(trend, 6, el) },
      plugins: [segmentLabels(cfmtSh, ct.onSection)],
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 450 },
        plugins: {
          legend: { display: true, position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'rect', padding: 12, boxWidth: 8, boxHeight: 8, font: { size: 11 }, color: ct.tick } },
          tooltip: { backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, borderWidth: 1, titleColor: ct.tooltipTitle, bodyColor: ct.tooltipBody, footerColor: ct.tooltipTitle, callbacks: stackedTooltipCallbacks(trend, cfmt) },
        },
        scales: {
          x: { stacked: true, ticks: { color: ct.tick, font: { size: 10 } }, grid: { display: false } },
          y: { stacked: true, ticks: { color: ct.tick, font: { size: 10 }, maxTicksLimit: 6, callback: (v) => cfmtSh(v as number) }, grid: { color: ct.grid } },
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
    ch.data.datasets = buildSectionDatasets(trend, 6, ref.current);
    if (ch.options.plugins?.tooltip) {
      ch.options.plugins.tooltip.callbacks = stackedTooltipCallbacks(trend, cfmt);
    }
    ch.update();
  }, [labels, trend, cfmt]);

  const summary = useMemo(() => stackedTrendSummary(trend, cfmt), [trend, cfmt]);

  return (
    <div className="fx-trend-canvas">
      <canvas ref={ref} role="img" aria-label={summary} />
    </div>
  );
}

function Trend12Chart({ trend, cfmt, code, theme }: { trend: MonthlyTrend[]; cfmt: (n: number) => string; code: string; theme: string | undefined }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const { cfmtSh } = useCurrency();
  const labels = useMemo(() => trend.map((t) => t.label), [trend]);
  const avgData = useMemo(() => {
    const avg = trend.length > 0 ? trend.reduce((s, t) => s + t.spent, 0) / trend.length : 0;
    return trend.map(() => avg);
  }, [trend]);

  /**
   * Stacked segments plus the average line. The line is built here rather than
   * in `buildSectionDatasets` because it is this chart's own idea, and it must
   * stay out of the `spend` stack or it would be added to the bar height.
   *
   * Its colour was `var(--gold)`, which canvas cannot resolve — the line has
   * been painting as default black in both themes. It gets the literal token
   * value now.
   *
   * A callback rather than a memo because the section fills are read off the
   * live canvas, which does not exist yet on the first render.
   */
  const buildDatasets = useCallback((scope: Element | null) => [
    ...buildSectionDatasets(trend, 5, scope).map((d) => ({ ...d, order: 2 })),
    {
      label: 'Average', data: avgData, type: 'line' as const, borderColor: '#E3B341',
      borderWidth: 2, borderDash: [6, 3], pointRadius: 0, fill: false, order: 1,
    },
  ], [trend, avgData]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = el.getContext('2d'); } catch { ctx = null; }
    if (!ctx) return;
    const ct = getChartTheme(theme === 'light' ? 'light' : 'dark');
    chartRef.current = new Chart(el, {
      type: 'bar',
      data: { labels, datasets: buildDatasets(el) },
      plugins: [segmentLabels(cfmtSh, ct.onSection)],
      options: {
        responsive: true, maintainAspectRatio: false, animation: { duration: 500 },
        plugins: {
          legend: { display: true, position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'rect', padding: 12, boxWidth: 8, boxHeight: 8, font: { size: 11 }, color: ct.tick } },
          tooltip: { backgroundColor: ct.tooltipBg, borderColor: ct.tooltipBorder, borderWidth: 1, titleColor: ct.tooltipTitle, bodyColor: ct.tooltipBody, footerColor: ct.tooltipTitle, callbacks: stackedTooltipCallbacks(trend, cfmt) },
        },
        scales: {
          x: { stacked: true, ticks: { color: ct.tick, font: { size: 10 } }, grid: { display: false } },
          y: { stacked: true, ticks: { color: ct.tick, font: { size: 10 }, maxTicksLimit: 6, callback: (v) => cfmtSh(v as number) }, grid: { color: ct.grid } },
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
    ch.data.datasets = buildDatasets(ref.current);
    if (ch.options.plugins?.tooltip) {
      ch.options.plugins.tooltip.callbacks = stackedTooltipCallbacks(trend, cfmt);
    }
    ch.update();
  }, [labels, buildDatasets, trend, cfmt]);

  // Text alternative for the same reason as TrendChart above. The average line
  // is called out explicitly because it is a second dataset a sighted user can
  // read straight off the chart.
  const summary = useMemo(() => {
    if (trend.length === 0) return 'Monthly spending chart. No spending recorded yet.';
    return `Across ${trend.length} months, average ${cfmt(avgData[0] ?? 0)}. `
      + stackedTrendSummary(trend, cfmt);
  }, [trend, avgData, cfmt]);

  return (
    <div className="fx-trend-canvas">
      <canvas ref={ref} role="img" aria-label={summary} />
    </div>
  );
}

/* ── Daily heatmap ── */

const DOW_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * Intensity ceiling for a day's swatch.
 *
 * The day number sits on top of the swatch, and `var(--ink)` is a light colour
 * in the dark theme. Alpha-compositing the orange above ~0.58 over a dark card
 * lifts the background enough that light text drops under 4.5:1 — so the scale
 * stops there rather than trading legibility for saturation. Under 0.58 the
 * range is still a ~5× ratio, which reads clearly as "darker means more".
 */
const HEATMAP_MAX_ALPHA = 0.55;
const HEATMAP_MIN_ALPHA = 0.12;

/**
 * Calendar-style spending intensity for the selected month.
 *
 * Every day is a real button, so the detail is reachable by keyboard and
 * announced by a screen reader — a `<div title>` is neither. The detail lands in
 * a fixed readout under the grid rather than in a floating tooltip: the grid
 * scrolls horizontally on narrow screens, and anything absolutely positioned
 * inside a scroll container is clipped the moment it needs to escape upward.
 * The readout also survives a tap, which a hover tooltip does not.
 */
function Heatmap({ days, cfmt, monthText }: {
  days: ReturnType<typeof computeDailyHeatmap>;
  cfmt: (n: number) => string;
  monthText: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const maxAmt = Math.max(...days.map((d) => d.amount), 1);
  const maxWeek = days.length > 0 ? Math.max(...days.map((d) => d.week)) : 0;
  const shown = days.find((d) => d.date === active) ?? null;
  const busiest = days.reduce<typeof days[number] | null>(
    (best, d) => (d.amount > (best?.amount ?? 0) ? d : best), null);

  return (
    <div className="fx-hm">
      <style>{HEATMAP_STYLES}</style>

      <div className="fx-hm-scroll">
        <div
          className="fx-hm-grid"
          role="group"
          aria-label={`Daily spending for ${monthText}`}
          style={{ gridTemplateColumns: `32px repeat(${maxWeek + 1}, 1fr)` }}
        >
          {DOW_LABELS.map((d, i) => (
            <div key={d} className="fx-hm-dow" style={{ gridColumn: 1, gridRow: i + 1 }} aria-hidden="true">{d}</div>
          ))}
          {days.map((d) => {
            const alpha = d.amount > 0
              ? HEATMAP_MIN_ALPHA + (d.amount / maxAmt) * (HEATMAP_MAX_ALPHA - HEATMAP_MIN_ALPHA)
              : 0;
            const dayNum = parseInt(d.date.split('-')[2], 10);
            return (
              <button
                key={d.date}
                type="button"
                className={`fx-hm-cell${active === d.date ? ' is-active' : ''}`}
                style={{
                  gridColumn: d.week + 2,
                  gridRow: d.dow + 1,
                  background: d.amount > 0 ? `rgba(232, 131, 61, ${alpha})` : 'var(--fill-04)',
                }}
                title={`${dayNum} ${monthText}: ${cfmt(d.amount)}, ${d.txCount} transaction${d.txCount === 1 ? '' : 's'}`}
                aria-label={`${dayNum} ${monthText}: ${cfmt(d.amount)}, ${d.txCount} transaction${d.txCount === 1 ? '' : 's'}`}
                aria-pressed={active === d.date}
                onMouseEnter={() => setActive(d.date)}
                onMouseLeave={() => setActive((cur) => (cur === d.date ? null : cur))}
                onFocus={() => setActive(d.date)}
                onBlur={() => setActive((cur) => (cur === d.date ? null : cur))}
                onClick={() => setActive((cur) => (cur === d.date ? null : d.date))}
              >
                {dayNum}
              </button>
            );
          })}
        </div>
      </div>

      <div className="fx-hm-foot">
        {/* The readout is not a live region: it updates on every cell the pointer
            crosses, and announcing each one would bury the cell the user
            actually landed on. The button's own label carries that. */}
        <p className="fx-hm-read">
          {shown
            ? <>
                <b>{parseInt(shown.date.split('-')[2], 10)} {monthText}</b> · {cfmt(shown.amount)}
                {' · '}{shown.txCount} transaction{shown.txCount === 1 ? '' : 's'}
              </>
            : busiest && busiest.amount > 0
              ? <>Busiest day: <b>{parseInt(busiest.date.split('-')[2], 10)} {monthText}</b> · {cfmt(busiest.amount)}</>
              : <>No spending logged this month.</>}
        </p>
        <div className="fx-hm-legend" aria-hidden="true">
          <span>Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((v) => (
            <span
              key={v}
              className="fx-hm-swatch"
              style={{
                background: v === 0
                  ? 'var(--fill-04)'
                  : `rgba(232,131,61,${HEATMAP_MIN_ALPHA + v * (HEATMAP_MAX_ALPHA - HEATMAP_MIN_ALPHA)})`,
              }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  );
}

const HEATMAP_STYLES = `
.fx-tools .fx-hm-scroll{overflow-x:auto;}
.fx-tools .fx-hm-grid{display:grid;gap:3px;min-width:280px;}
.fx-tools .fx-hm-dow{font-size:10px;color:var(--ink3);display:flex;align-items:center;font-weight:600;}
.fx-tools .fx-hm-cell{aspect-ratio:1;min-height:28px;border-radius:5px;border:1px solid transparent;padding:0;
  display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:600;font-family:inherit;
  color:var(--ink);cursor:pointer;transition:border-color .12s,transform .12s;}
.fx-tools .fx-hm-cell:hover{border-color:var(--hair);}
.fx-tools .fx-hm-cell.is-active{border-color:var(--gold);}
.fx-tools .fx-hm-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:10px;flex-wrap:wrap;}
.fx-tools .fx-hm-read{font-size:12px;color:var(--ink2);margin:0;min-height:18px;}
.fx-tools .fx-hm-legend{display:flex;align-items:center;gap:5px;font-size:10px;color:var(--ink3);margin-left:auto;}
.fx-tools .fx-hm-swatch{width:12px;height:12px;border-radius:3px;display:inline-block;}
@media (prefers-reduced-motion:reduce){.fx-tools .fx-hm-cell{transition:none;}}
`;

/* ── Helpers ── */

function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/* ── Undo toast styles ── */

const UNDO_STYLES = `
.fx-undo{position:fixed;left:50%;bottom:calc(22px + var(--fx-bottomnav-h,0px) + env(safe-area-inset-bottom));transform:translateX(-50%);
  z-index:var(--z-undo);border-radius:14px;overflow:hidden;
  background:var(--card-solid,#1c1c1f);border:1px solid var(--hair2);color:var(--ink);
  box-shadow:0 20px 50px -18px rgba(0,0,0,.7);font-size:13px;max-width:calc(100vw - 32px);
  animation:fxUndoIn .28s cubic-bezier(.34,1.3,.5,1) both;}
.fx-undo-body{display:flex;align-items:center;gap:14px;padding:12px 14px 12px 18px;}
@keyframes fxUndoIn{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}
.fx-undo kbd{font-family:'Geist Mono',ui-monospace,monospace;font-size:10.5px;color:var(--ink3);
  border:1px solid var(--hair2);border-radius:5px;padding:1px 5px;}
.fx-undo-tick{display:block;height:3px;background:var(--gold);transform-origin:left center;
  animation-name:fxUndoTick;animation-timing-function:linear;animation-fill-mode:forwards;}
@keyframes fxUndoTick{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@media (prefers-reduced-motion:reduce){
  .fx-undo{animation:none;}
  /* The global reduce rule collapses every animation to ~0ms, which would show
     the bar as already expired. Hiding it is honest; the toast's own dismissal
     still tells the user when the window closes. */
  .fx-undo-tick{display:none;}
}
`;

/* ── Tab styles ── */

const TAB_STYLES = `
.fx-tabs{display:flex;gap:4px;margin-bottom:14px;background:var(--well);border-radius:14px;padding:4px;border:1px solid var(--well-border);}
.fx-tab{display:inline-flex;align-items:center;gap:7px;padding:10px 16px;border-radius:11px;border:none;background:transparent;
  color:var(--ink2);font-size:13px;font-weight:600;font-family:inherit;cursor:pointer;flex:1;justify-content:center;
  transition:background-color var(--ctl-trans),color var(--ctl-trans),box-shadow var(--ctl-trans);}
.fx-tab:hover{color:var(--ink);background:var(--fill-04);}
.fx-tab.active{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(0,0,0,.08);}
/* Four tabs have to share a phone's width. Each gives up padding, then its
   icon, before the bar is allowed to grow — and the bar scrolls rather than
   pushing the page wider, because the exact text width depends on a font this
   stylesheet cannot measure. The page must never scroll sideways. */
@media (max-width:480px){
  .fx-tabs{overflow-x:auto;scrollbar-width:none;-ms-overflow-style:none;}
  .fx-tabs::-webkit-scrollbar{display:none;}
  .fx-tab{padding:9px 6px;font-size:11.5px;gap:4px;min-width:0;white-space:nowrap;}
}
@media (max-width:400px){.fx-tab svg{display:none;}}
.fx-streak{display:inline-flex;align-items:center;gap:7px;padding:8px 14px;border-radius:10px;
  background:var(--well);border:1px solid var(--well-border);font-size:12px;font-weight:600;color:var(--ink2);}

/* Secondary metric tier — pacing & cash flow */
.fx-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;}
.fx-metric{position:relative;background:var(--well);border:1px solid var(--well-border);border-radius:13px;padding:13px 14px 13px 16px;overflow:hidden;}
.fx-metric::before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--m-accent,var(--gold));}
.fx-metric-l{font-size:11px;font-weight:600;letter-spacing:.03em;text-transform:uppercase;color:var(--ink3);}
.fx-metric-v{font-size:20px;font-weight:700;letter-spacing:-.02em;margin-top:5px;color:var(--ink);}
.fx-metric-n{font-size:11.5px;color:var(--ink2);margin-top:3px;line-height:1.45;}

/* Budget warnings */
.fx-warn-card{border-color:color-mix(in srgb,var(--orange) 30%,var(--hair2));}
.fx-warn-count{font-size:11px;font-weight:700;padding:2px 8px;border-radius:980px;
  background:color-mix(in srgb,var(--orange) 14%,transparent);color:var(--orange);}
.fx-warn-list{list-style:none;margin:0;padding:0;display:grid;gap:4px;}
.fx-warn-row{display:flex;align-items:center;gap:10px;width:100%;padding:9px 10px;border-radius:11px;border:1px solid transparent;
  background:transparent;color:inherit;font-family:inherit;cursor:pointer;text-align:left;transition:background .15s,border-color .15s;}
.fx-warn-row:hover{background:var(--fill-04);border-color:var(--hair2);}
.fx-warn-name{flex:1;min-width:0;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fx-warn-bar{flex:0 0 82px;height:6px;border-radius:6px;background:var(--well);overflow:hidden;display:block;}
.fx-warn-bar > span{display:block;height:100%;border-radius:6px;}
.fx-warn-pct{font-size:12.5px;font-weight:700;flex-shrink:0;width:38px;text-align:right;}
.fx-warn-tag{font-size:10.5px;font-weight:700;flex-shrink:0;width:74px;text-align:right;}
@media(max-width:480px){
  .fx-warn-bar{display:none;}
  .fx-warn-tag{display:none;}
}
@media (prefers-reduced-motion:reduce){.fx-warn-row{transition:none;}}
`;
