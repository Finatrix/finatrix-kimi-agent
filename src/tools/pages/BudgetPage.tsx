import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCurrency } from '../CurrencyContext';
import { getJSON, setJSON, onLocalWrite } from '../lib/storage';
import { currentMonth, monthLabel, nextMonthUnclamped, prevMonth } from '../lib/month';
import { MonthNav } from '../ui/MonthNav';
import { PageHead, ToolFoot } from '../ui/common';
import { Icon } from '../ui/Icon';
import { ExportMenu } from '../ui/ExportMenu';
import { DragHandle, MoveButtons } from '../ui/reorder';
import { useReorder } from '../../hooks/useReorder';
import { exportBudgetCsv, exportBudgetXlsx, exportBudgetPdf, type BudgetExport } from '../lib/exporters';
import {
  computeBudget, mergedCats, loadCustomCats, saveCustomCats, newCustomCatKey,
  cloneMonthData, emptyMonthData,
  type BudgetVals, type BudgetStore, type BudgetCat, type CatResult, type CatKey, type CustomCats,
} from '../lib/budget';
import {
  applyCatPrefs, applyIncomeConfig, loadCatPrefs, saveCatPrefs, loadIncome, saveIncome,
  newIncomeKey, orderSection, reorderSubset, seedIncomeAmounts, toggleKey, totalIncome,
  withSectionOrder, forgetKey,
  type CatPrefs, type IncomeConfig, type IncomeSource,
} from '../lib/budgetCats';
import { budgetFillPct, budgetTone, TONE_COLOR, TONE_FILL, TONE_LABEL } from '../lib/budgetStatus';
import { SECTION_COLOR, SECTION_FILL } from '../lib/sectionColors';
import { BudgetSuggestions } from '../ui/BudgetSuggestions';
import { AskAiButton } from '../ui/AskAiButton';
import { loadExpenses, type ExpenseItem } from '../lib/expense';
import { BUDGET_SUGGESTIONS_ENABLED } from '../lib/featureFlags';
import { track } from '../../lib/analytics';

const SECTIONS: CatKey[] = ['needs', 'wants', 'save'];

/** Seeded income for a month that has never been opened (unchanged default). */
const DEFAULT_INCOME = '50000';

export default function BudgetPage() {
  const { cfmt, sym, code } = useCurrency();
  const allRef = useRef<BudgetStore>(getJSON<BudgetStore>('fx_bb_data', {}));
  const [month, setMonth] = useState(currentMonth());
  const [incomeAmt, setIncomeAmt] = useState<Record<string, number>>({});
  const [needsPct, setNeedsPct] = useState('50');
  const [wantsPct, setWantsPct] = useState('30');
  const [savePct, setSavePct] = useState('20');
  const [vals, setVals] = useState<BudgetVals>({});
  const [custom, setCustom] = useState<CustomCats>(loadCustomCats);
  const [prefs, setPrefs] = useState<CatPrefs>(loadCatPrefs);
  const [incomeCfg, setIncomeCfg] = useState<IncomeConfig>(loadIncome);
  /** Organise mode: reveals reorder / hide / archive controls without cluttering the default view. */
  const [manage, setManage] = useState(false);
  /** True while a month exists only as an intention — the planner is shown instead of the editor. */
  const [pendingStart, setPendingStart] = useState(false);
  const [notice, setNotice] = useState('');
  const [, forceMonths] = useState(0);
  const loaded = useRef(false);
  /**
   * Logged spending, read only to power the suggestions card. Budget Builder
   * never writes it; the Expense Tracker owns this key, and the `fx:write`
   * subscription keeps the two views agreeing without a reload.
   *
   * With the suggestions card switched off there is no consumer, so neither the
   * initial read nor the subscription happens — a disabled section should cost
   * the page nothing.
   */
  const [spend, setSpend] = useState<ExpenseItem[]>(
    () => (BUDGET_SUGGESTIONS_ENABLED ? loadExpenses() : []),
  );

  useEffect(() => {
    if (!BUDGET_SUGGESTIONS_ENABLED) return;
    return onLocalWrite((key) => {
      if (key === 'fx_expenses') setSpend(loadExpenses());
    });
  }, []);

  const cats = useMemo(() => mergedCats(custom), [custom]);
  const view = useMemo(() => applyCatPrefs(cats, prefs), [cats, prefs]);
  const incomeView = useMemo(() => applyIncomeConfig(incomeCfg), [incomeCfg]);
  const income = totalIncome(incomeAmt, incomeView.active);

  /** Announce structural changes (reorder / hide / archive) to assistive tech. */
  const say = useCallback((msg: string) => setNotice(msg), []);

  const loadMonth = useCallback((m: string) => {
    const d = allRef.current[m];
    // Load every saved amount (built-in + custom category keys) verbatim.
    const next: BudgetVals = {};
    if (d?.vals) Object.keys(d.vals).forEach((k) => { next[k] = Number(d.vals[k]) || 0; });
    setVals(next);
    setIncomeAmt(seedIncomeAmounts(d?.inc, d ? d.income : DEFAULT_INCOME));
    setNeedsPct(d && d.n !== '' && d.n != null ? d.n : '50');
    setWantsPct(d && d.w !== '' && d.w != null ? d.w : '30');
    setSavePct(d && d.s !== '' && d.s != null ? d.s : '20');
  }, []);

  // Initial load: seed current month from saved data (or defaults).
  useEffect(() => {
    loadMonth(currentMonth());
    loaded.current = true;
    forceMonths((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-persist the month being edited (mirrors bbUpdate → bbSave). A month
  // still waiting for a start choice is never written, so navigating to next
  // month doesn't silently create an empty budget.
  useEffect(() => {
    if (!loaded.current || pendingStart) return;
    allRef.current[month] = {
      vals: { ...vals },
      income: String(income),
      n: needsPct, w: wantsPct, s: savePct,
      inc: { ...incomeAmt },
    };
    setJSON('fx_bb_data', allRef.current);
  }, [income, incomeAmt, needsPct, wantsPct, savePct, vals, month, pendingStart]);

  const switchMonth = useCallback((target: string) => {
    // The current month is already synced into allRef by the persist effect.
    const started = Object.prototype.hasOwnProperty.call(allRef.current, target);
    setPendingStart(!started && target !== currentMonth());
    setMonth(target);
    loadMonth(target);
    forceMonths((n) => n + 1);
  }, [loadMonth]);

  /**
   * Follow the calendar. When the month rolls over while the tab is open, a
   * user sitting on what used to be "this month" is moved onto the new one —
   * but someone who navigated elsewhere is left exactly where they were.
   */
  const bootMonth = useRef(currentMonth());
  useEffect(() => {
    const check = () => {
      const cur = currentMonth();
      if (cur === bootMonth.current) return;
      const was = bootMonth.current;
      bootMonth.current = cur;
      if (month === was) switchMonth(cur);
    };
    document.addEventListener('visibilitychange', check);
    window.addEventListener('focus', check);
    return () => {
      document.removeEventListener('visibilitychange', check);
      window.removeEventListener('focus', check);
    };
  }, [month, switchMonth]);

  const r = computeBudget(
    { incomeRaw: income, needsRaw: needsPct, wantsRaw: wantsPct, saveRaw: savePct, vals },
    view.active,
  );

  /**
   * Budget Builder has no submit button — it recomputes on every keystroke — so
   * "completed" has to be derived from state rather than from an action. The
   * signal is an income plus at least one allocated category: that is the point
   * at which the split on screen describes the visitor's own money instead of
   * the seeded defaults.
   *
   * Fired at most once per mount. Without the ref this would emit on every
   * render of a filled-in budget and drown out every other event in the table.
   */
  const completed = useRef(false);
  useEffect(() => {
    if (completed.current || !loaded.current) return;
    const allocated = Object.values(vals).some((v) => Number(v) > 0);
    if (income > 0 && allocated) {
      completed.current = true;
      track('tool_completed', { tool: 'budget' });
    }
  }, [income, vals]);

  /* ── Category persistence ─────────────────────────────────────────────── */
  const updateCustom = (next: CustomCats) => { setCustom(next); saveCustomCats(next); };
  const updatePrefs = (next: CatPrefs) => { setPrefs(next); saveCatPrefs(next); };

  const addCat = (section: CatKey) => {
    const k = newCustomCatKey();
    updateCustom({ ...custom, [section]: [...custom[section], { k, ic: 'other', l: 'New category', custom: true }] });
    say(`New category added to ${section === 'save' ? 'Savings' : section}.`);
  };
  const renameCat = (section: CatKey, k: string, l: string) =>
    updateCustom({ ...custom, [section]: custom[section].map((c) => (c.k === k ? { ...c, l } : c)) });
  const removeCat = (section: CatKey, k: string, name: string) => {
    updateCustom({ ...custom, [section]: custom[section].filter((c) => c.k !== k) });
    updatePrefs(forgetKey(prefs, k));
    setVals((v) => { const n = { ...v }; delete n[k]; return n; });
    say(`${name} deleted.`);
  };

  /** Full ordered key list for a section (visible + hidden) — what order persists. */
  const sectionKeys = useCallback(
    (section: CatKey) => orderSection(cats[section], prefs.order[section]).map((c) => c.k),
    [cats, prefs.order],
  );

  const moveCat = (section: CatKey, name: string) => (from: number, to: number) => {
    const full = sectionKeys(section);
    // Only non-archived rows are on screen, so the move applies to that subset
    // while archived categories stay pinned to their stored positions.
    const next = reorderSubset(full, (k) => !prefs.archived.includes(k), from, to);
    if (next === full) return;
    updatePrefs(withSectionOrder(prefs, section, next));
    say(`${name} moved to position ${to + 1}.`);
  };

  const toggleHidden = (k: string, name: string) => {
    const hiding = !prefs.hidden.includes(k);
    updatePrefs({ ...prefs, hidden: toggleKey(prefs.hidden, k) });
    say(hiding ? `${name} hidden. It still counts toward your totals.` : `${name} shown again.`);
  };
  const toggleArchived = (k: string, name: string) => {
    const archiving = !prefs.archived.includes(k);
    updatePrefs({
      ...prefs,
      archived: toggleKey(prefs.archived, k),
      hidden: archiving ? prefs.hidden.filter((x) => x !== k) : prefs.hidden,
    });
    say(archiving
      ? `${name} archived. Its amounts are kept but no longer counted.`
      : `${name} restored and counting again.`);
  };

  /* ── Income persistence ───────────────────────────────────────────────── */
  const updateIncomeCfg = (next: IncomeConfig) => { setIncomeCfg(next); saveIncome(next); };

  const addIncomeSource = () => {
    updateIncomeCfg({
      ...incomeCfg,
      sources: [...incomeCfg.sources, { k: newIncomeKey(), l: 'New income source', ic: 'dollar', custom: true }],
    });
    say('New income source added.');
  };
  const renameIncomeSource = (k: string, l: string) =>
    updateIncomeCfg({ ...incomeCfg, sources: incomeCfg.sources.map((s) => (s.k === k ? { ...s, l } : s)) });
  const removeIncomeSource = (k: string, name: string) => {
    updateIncomeCfg({
      ...incomeCfg,
      sources: incomeCfg.sources.filter((s) => s.k !== k),
      hidden: incomeCfg.hidden.filter((x) => x !== k),
      archived: incomeCfg.archived.filter((x) => x !== k),
    });
    setIncomeAmt((a) => { const n = { ...a }; delete n[k]; return n; });
    say(`${name} deleted.`);
  };
  const moveIncomeSource = (name: string) => (from: number, to: number) => {
    const full = incomeCfg.sources.map((s) => s.k);
    const next = reorderSubset(full, (k) => !incomeCfg.archived.includes(k), from, to);
    if (next === full) return;
    const byKey = new Map(incomeCfg.sources.map((s) => [s.k, s]));
    updateIncomeCfg({ ...incomeCfg, sources: next.map((k) => byKey.get(k)!) });
    say(`${name} moved to position ${to + 1}.`);
  };
  const toggleIncomeHidden = (k: string, name: string) => {
    const hiding = !incomeCfg.hidden.includes(k);
    updateIncomeCfg({ ...incomeCfg, hidden: toggleKey(incomeCfg.hidden, k) });
    say(hiding ? `${name} hidden. It still counts toward income.` : `${name} shown again.`);
  };
  const toggleIncomeArchived = (k: string, name: string) => {
    const archiving = !incomeCfg.archived.includes(k);
    updateIncomeCfg({
      ...incomeCfg,
      archived: toggleKey(incomeCfg.archived, k),
      hidden: archiving ? incomeCfg.hidden.filter((x) => x !== k) : incomeCfg.hidden,
    });
    say(archiving ? `${name} archived and no longer counted.` : `${name} restored and counting again.`);
  };

  /* ── Month planning ───────────────────────────────────────────────────── */
  const cur = currentMonth();
  const nextM = nextMonthUnclamped(cur);
  const monthSet = new Set(Object.keys(allRef.current));
  monthSet.add(cur);
  if (pendingStart) monthSet.add(month);
  const months = [...monthSet].sort();

  /** Never overwrite: a start choice only ever writes a month that has none. */
  const startMonth = (mode: 'current' | 'previous' | 'empty') => {
    const source = mode === 'current' ? allRef.current[cur]
      : mode === 'previous' ? allRef.current[prevMonth(month)]
        : undefined;
    const data = mode === 'empty' ? emptyMonthData() : cloneMonthData(source);
    allRef.current[month] = data;
    setJSON('fx_bb_data', allRef.current);
    setPendingStart(false);
    loadMonth(month);
    forceMonths((n) => n + 1);
    say(mode === 'empty'
      ? `${monthLabel(month)} started from scratch.`
      : `${monthLabel(month)} created from ${mode === 'current' ? monthLabel(cur) : monthLabel(prevMonth(month))}.`);
  };

  const setVal = (k: string, raw: string) =>
    setVals((v) => ({ ...v, [k]: Math.max(0, Number(raw) || 0) }));
  /**
   * The one path by which a suggestion becomes a budget. It is only ever
   * reached from an explicit Accept/Apply press on that category's row.
   */
  const applySuggestion = useCallback((k: string, amount: number) => {
    setVals((v) => ({ ...v, [k]: Math.max(0, amount) }));
  }, []);
  const setIncomeVal = (k: string, raw: string) =>
    setIncomeAmt((v) => ({ ...v, [k]: Math.max(0, Number(raw) || 0) }));

  const buildExport = (): BudgetExport => ({
    monthLabel: monthLabel(month),
    currency: code,
    income: r.income,
    incomeRows: incomeView.active
      .map((s) => ({ label: s.l, amount: incomeAmt[s.k] || 0 }))
      .filter((row) => row.amount > 0),
    needs: { pct: r.nPct, limit: r.nL, actual: r.nT },
    wants: { pct: r.wPct, limit: r.wL, actual: r.wT },
    save: { pct: r.sPct, limit: r.sL, actual: r.sT },
    rows: [
      ...view.active.needs.map((c) => ({ group: 'Needs', label: c.l, amount: vals[c.k] || 0 })),
      ...view.active.wants.map((c) => ({ group: 'Wants', label: c.l, amount: vals[c.k] || 0 })),
      ...view.active.save.map((c) => ({ group: 'Savings', label: c.l, amount: vals[c.k] || 0 })),
    ],
    spent: r.spent, free: r.free, pos: r.pos, savePct: r.savePct, allocatedPct: r.allocatedPct,
    tips: r.tips.map((t) => `${t[1]}: ${t[2]}`),
  });

  const sectionLabel: Record<CatKey, string> = {
    needs: `Needs · ${r.nPct}%`,
    wants: `Wants · ${r.wPct}%`,
    save: `Savings & investments · ${r.sPct}%`,
  };

  return (
    <div className="fx-page">
      <style>{BUDGET_STYLES}</style>

      <PageHead
        chip="Budget Builder"
        chipColor="var(--blue)"
        chipBg="rgba(0,113,227,.1)"
        icon="budget"
        title="The 50/30/20 rule, made effortless."
      >
        Add every income you receive, then plan what you spend. We'll show you exactly
        where you stand against the classic Needs / Wants / Savings split — this month or the next.
      </PageHead>

      {/* One polite live region for every structural change on the page. */}
      <div role="status" aria-live="polite" className="fx-sr-only">{notice}</div>

      <div className="bb-monthbar">
        <div className="fx-seg" role="group" aria-label="Budget period">
          <button type="button" className={month === cur ? 'on' : ''} aria-pressed={month === cur}
            onClick={() => switchMonth(cur)}>This month</button>
          <button type="button" className={month === nextM ? 'on' : ''} aria-pressed={month === nextM}
            onClick={() => switchMonth(nextM)}>Next month</button>
        </div>
        <ExportMenu
          source="budget"
          label="Export budget"
          onCsv={() => exportBudgetCsv(buildExport())}
          onXlsx={() => exportBudgetXlsx(buildExport())}
          onPdf={() => exportBudgetPdf(buildExport())}
        />
      </div>

      <div style={{ marginBottom: 14 }}>
        <MonthNav
          activeMonth={month}
          months={months}
          onSwitch={switchMonth}
          pastNote="Viewing past month"
          pastColor="var(--gold)"
          maxMonth={nextM}
          futureNote="Planning ahead"
          futureColor="var(--blue)"
        />
      </div>

      {pendingStart ? (
        <StartMonthCard
          month={month}
          hasCurrent={!!allRef.current[cur] && month !== cur}
          // Planning next month makes "previous" and "current" the same month —
          // offering both would be two buttons that do the identical thing.
          hasPrevious={!!allRef.current[prevMonth(month)] && prevMonth(month) !== cur}
          previousLabel={monthLabel(prevMonth(month))}
          currentLabel={monthLabel(cur)}
          onStart={startMonth}
        />
      ) : (
        <>
          <IncomeCard
            sources={manage ? incomeView.active : incomeView.visible}
            archived={incomeView.archived}
            hiddenKeys={incomeCfg.hidden}
            amounts={incomeAmt}
            total={income}
            manage={manage}
            cfmt={cfmt}
            sym={sym}
            onToggleManage={() => setManage((m) => !m)}
            onAmount={setIncomeVal}
            onAdd={addIncomeSource}
            onRename={renameIncomeSource}
            onRemove={removeIncomeSource}
            onMove={moveIncomeSource}
            onHide={toggleIncomeHidden}
            onArchive={toggleIncomeArchived}
          />

          <div className="card">
            <div className="bb-cardhd">
              <div className="bb-cardtitle">Your budget split</div>
              <span className="pill pill-mute">Recommended: 50 / 30 / 20</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              <PctInput label="Needs %" color="var(--blue)" value={needsPct} onChange={setNeedsPct} id="bb-pct-needs" />
              <PctInput label="Wants %" color="var(--wants)" value={wantsPct} onChange={setWantsPct} id="bb-pct-wants" />
              <PctInput label="Save %" color="var(--green)" value={savePct} onChange={setSavePct} id="bb-pct-save" />
            </div>
            {r.splitWarn && (
              <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 8 }}>Percentages must add up to 100%</div>
            )}
            <div className="seg-bar">
              <div className="seg" style={{ width: `${r.nPctV}%`, background: SECTION_FILL.needs }} />
              <div className="seg" style={{ width: `${r.wPctV}%`, background: SECTION_FILL.wants }} />
              <div className="seg" style={{ width: `${r.sPctV}%`, background: SECTION_FILL.save }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink2)' }}>
              <span>Needs <b>{cfmt(r.nL)}</b></span>
              <span>Wants <b>{cfmt(r.wL)}</b></span>
              <span>Save <b>{cfmt(r.sL)}</b></span>
            </div>
          </div>

          {/* Recommendations from logged spending. Renders nothing until there
              is history to argue from, and never writes a value on its own.
              Temporarily switched off — see BUDGET_SUGGESTIONS_ENABLED. */}
          {BUDGET_SUGGESTIONS_ENABLED && (
            <BudgetSuggestions
              items={spend}
              cats={view.active}
              vals={vals}
              month={month}
              cfmt={cfmt}
              sym={sym}
              onApply={applySuggestion}
              onAnnounce={say}
            />
          )}

          {SECTIONS.map((section) => (
            <CategoryCard
              key={section}
              catKey={section}
              label={sectionLabel[section]}
              color={SECTION_COLOR[section]}
              items={manage ? view.active[section] : view.visible[section]}
              res={r.cats[section]}
              vals={vals}
              setVal={setVal}
              cfmt={cfmt}
              sym={sym}
              manage={manage}
              hiddenKeys={prefs.hidden}
              hiddenCount={view.hidden.filter((c) => c.section === section).length}
              archived={view.archived.filter((c) => c.section === section)}
              onToggleManage={() => setManage((m) => !m)}
              onAdd={() => addCat(section)}
              onRename={renameCat}
              onRemove={removeCat}
              onMove={moveCat}
              onHide={toggleHidden}
              onArchive={toggleArchived}
            />
          ))}

          <div
            className="card result-hero-anim"
            style={{ background: r.pos ? 'rgba(29,125,70,.05)' : 'rgba(215,0,21,.04)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 15, fontWeight: 600 }}>{r.pos ? 'Unallocated' : 'Over budget by'}</div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.02em', color: r.pos ? 'var(--green)' : 'var(--red)' }}>
                {cfmt(Math.abs(r.free))}
              </div>
            </div>
            <div className="note" style={{ marginTop: 6 }}>
              Allocated {cfmt(r.spent)} of {cfmt(r.income)} ({r.allocatedPct}%) · Actual savings rate:{' '}
              <b style={{ color: 'var(--ink)' }}>{r.savePct}%</b>
            </div>
            {/* The plan is the obvious thing to ask about once you can see how
                it landed, so the question lives next to the verdict. */}
            <div style={{ marginTop: 10 }}>
              <AskAiButton focus={{ kind: 'budget' }} size="md" />
            </div>
          </div>

          {r.tips.length > 0 && (
            <div className="card">
              <div className="bb-cardtitle" style={{ marginBottom: 12 }}>Insights</div>
              {r.tips.map((t, i) => (
                <div className={`tip tip-${t[0]}`} key={i}>
                  <b>{t[1]}</b>
                  {t[2]}
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <ToolFoot>
        Built with care by <b>FinatriX</b> · Educational tool, not financial advice
      </ToolFoot>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Month planning
   ═══════════════════════════════════════════════════════════════════════════ */

function StartMonthCard({
  month, hasCurrent, hasPrevious, currentLabel, previousLabel, onStart,
}: {
  month: string;
  hasCurrent: boolean;
  hasPrevious: boolean;
  currentLabel: string;
  previousLabel: string;
  onStart: (mode: 'current' | 'previous' | 'empty') => void;
}) {
  const options: Array<{ mode: 'current' | 'previous' | 'empty'; title: string; desc: string; show: boolean }> = [
    {
      mode: 'current', show: hasCurrent,
      title: `Duplicate ${currentLabel}`,
      desc: 'Copy this month’s income and allocations as a starting point.',
    },
    {
      mode: 'previous', show: hasPrevious,
      title: `Duplicate ${previousLabel}`,
      desc: 'Copy the month before this one — useful for a repeating plan.',
    },
    { mode: 'empty', show: true, title: 'Start empty', desc: 'A blank 50 / 30 / 20 plan with nothing filled in.' },
  ];

  return (
    <div className="card">
      <div className="bb-cardtitle is-section" style={{ marginBottom: 4 }}>Plan {monthLabel(month)}</div>
      <p className="note" style={{ marginBottom: 14 }}>
        Nothing is budgeted for this month yet. Choose how to start — your other months stay exactly as they are.
      </p>
      <div role="group" aria-label={`How to start ${monthLabel(month)}`}>
        {options.filter((o) => o.show).map((o) => (
          <button key={o.mode} type="button" className="opt-card bb-opt" onClick={() => onStart(o.mode)}>
            <span className="ol">{o.title}</span>
            <span className="od">{o.desc}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Income
   ═══════════════════════════════════════════════════════════════════════════ */

function IncomeCard({
  sources, archived, hiddenKeys, amounts, total, manage, cfmt, sym,
  onToggleManage, onAmount, onAdd, onRename, onRemove, onMove, onHide, onArchive,
}: {
  sources: IncomeSource[];
  archived: IncomeSource[];
  hiddenKeys: string[];
  amounts: Record<string, number>;
  total: number;
  manage: boolean;
  cfmt: (n: number) => string;
  sym: string;
  onToggleManage: () => void;
  onAmount: (k: string, v: string) => void;
  onAdd: () => void;
  onRename: (k: string, l: string) => void;
  onRemove: (k: string, name: string) => void;
  onMove: (name: string) => (from: number, to: number) => void;
  onHide: (k: string, name: string) => void;
  onArchive: (k: string, name: string) => void;
}) {
  // The mover resolves the moved item's name itself, so drag and the keyboard
  // buttons announce the same thing without threading state through the drag.
  const move = useCallback((from: number, to: number) => {
    onMove(sources[from]?.l.trim() || 'Income source')(from, to);
  }, [sources, onMove]);
  const reorder = useReorder(move);

  return (
    <div className="card">
      <div className="bb-cardhd">
        <div>
          <div className="bb-cardtitle">Monthly income</div>
          <div className="note">Add every source you receive — salary, rent, dividends, anything.</div>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" aria-pressed={manage} onClick={onToggleManage}>
          {manage ? 'Done' : 'Organise'}
        </button>
      </div>

      <div className="bb-total">
        <span className="bb-total-l">Monthly take-home income</span>
        <output className="bb-total-v" aria-label="Total monthly take-home income">{cfmt(total)}</output>
      </div>

      <div>
        {sources.map((s, i) => {
          const name = s.l.trim() || 'Untitled source';
          const hidden = hiddenKeys.includes(s.k);
          const amountId = `bb-inc-${s.k}`;
          return (
            <div
              key={s.k}
              className={`row-line bb-row${hidden ? ' is-hidden' : ''}${manage ? reorder.rowClass(i) : ''}`}
              {...(manage ? reorder.rowProps(i) : {})}
            >
              {manage && <DragHandle label={`Drag to reorder ${name}`} />}
              <span style={{ width: 24, textAlign: 'center', flexShrink: 0 }} aria-hidden="true">
                <Icon name={s.ic} size={17} />
              </span>
              {s.custom ? (
                <input
                  className="fi-sm bb-name"
                  type="text"
                  aria-label={`${name} — source name`}
                  value={s.l}
                  onChange={(e) => onRename(s.k, e.target.value)}
                />
              ) : (
                <label htmlFor={amountId} className="bb-label">{s.l}</label>
              )}
              {hidden && <span className="bb-badge">Hidden</span>}
              <input
                className="fi-sm"
                type="number" step="any"
                id={amountId}
                aria-label={`${name} amount (${sym})`}
                min={0}
                inputMode="decimal"
                placeholder="0"
                value={amounts[s.k] ? String(amounts[s.k]) : ''}
                onChange={(e) => onAmount(s.k, e.target.value)}
              />
              {manage && (
                <span className="bb-actions">
                  <MoveButtons index={i} count={sources.length} name={name} onMove={move} />
                  <RowAction label={hidden ? `Show ${name}` : `Hide ${name}`} onClick={() => onHide(s.k, name)}>
                    {hidden ? 'Show' : 'Hide'}
                  </RowAction>
                  <RowAction label={`Archive ${name}`} onClick={() => onArchive(s.k, name)}>Archive</RowAction>
                  {s.custom && (
                    <RowAction danger label={`Delete ${name}`} onClick={() => onRemove(s.k, name)}>Delete</RowAction>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" className="bb-add" onClick={onAdd}>+ Add income source</button>

      {archived.length > 0 && (
        <ArchivedList
          items={archived.map((s) => ({ k: s.k, l: s.l, ic: s.ic }))}
          onRestore={(k, name) => onArchive(k, name)}
          note="Archived sources keep their saved amounts but are not counted."
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Categories
   ═══════════════════════════════════════════════════════════════════════════ */

function CategoryCard({
  catKey, label, color, items, res, vals, setVal, cfmt, sym, manage, hiddenKeys, hiddenCount,
  archived, onToggleManage, onAdd, onRename, onRemove, onMove, onHide, onArchive,
}: {
  catKey: CatKey; label: string; color: string; items: BudgetCat[]; res: CatResult;
  vals: BudgetVals; setVal: (k: string, v: string) => void; cfmt: (n: number) => string; sym: string;
  manage: boolean; hiddenKeys: string[]; hiddenCount: number;
  archived: Array<BudgetCat & { section: CatKey }>;
  onToggleManage: () => void;
  onAdd: () => void;
  onRename: (section: CatKey, k: string, l: string) => void;
  onRemove: (section: CatKey, k: string, name: string) => void;
  onMove: (section: CatKey, name: string) => (from: number, to: number) => void;
  onHide: (k: string, name: string) => void;
  onArchive: (k: string, name: string) => void;
}) {
  const move = useCallback((from: number, to: number) => {
    onMove(catKey, items[from]?.l.trim() || 'Category')(from, to);
  }, [items, catKey, onMove]);
  const reorder = useReorder(move);

  const tone = budgetTone(res.limit, res.total);
  const pill =
    res.limit <= 0
      ? { cls: 'pill pill-mute', text: 'No budget' }
      : res.total === 0
        ? { cls: 'pill pill-mute', text: 'Not filled' }
        : tone === 'over'
          ? { cls: 'pill pill-bad', text: `Over by ${cfmt(res.overBy)}` }
          : { cls: 'pill', text: TONE_LABEL[tone] };
  const pillStyle = res.limit > 0 && res.total > 0 && tone !== 'over'
    ? { background: `color-mix(in srgb, ${TONE_COLOR[tone]} 14%, transparent)`, color: TONE_COLOR[tone] }
    : undefined;

  const fill = budgetFillPct(res.limit, res.total);
  const barColor = TONE_FILL[tone];

  return (
    <div className="card">
      <div className="bb-cardhd">
        <div className="bb-cardtitle is-section" style={{ color }}>{label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={pill.cls} style={pillStyle}>{pill.text}</span>
          <button type="button" className="btn btn-ghost btn-sm" aria-pressed={manage} onClick={onToggleManage}>
            {manage ? 'Done' : 'Organise'}
          </button>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--ink2)', marginBottom: 5 }}>
        <span>{cfmt(res.total)} used</span>
        <span>limit {cfmt(res.limit)}</span>
      </div>
      {/* `aria-valuetext` says what the value IS; `aria-label` says what the
          bar is FOR. A progressbar with only the former is announced as a bare
          figure with no subject — "₹0 of ₹25,000, On track" with nothing
          saying which group that describes. WCAG 4.1.2, and caught by axe. */}
      <div
        className="bar"
        role="progressbar"
        aria-label={`${label} budget`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(fill)}
        aria-valuetext={`${cfmt(res.total)} of ${cfmt(res.limit)} — ${TONE_LABEL[tone]}`}
      >
        <div className="bar-fill" style={{ width: `${fill}%`, background: barColor }} />
      </div>
      <div className="hr" />

      {!manage && hiddenCount > 0 && (
        <p className="note" style={{ marginBottom: 8 }}>
          {hiddenCount} hidden {hiddenCount === 1 ? 'category is' : 'categories are'} still counted — choose
          {' '}<b>Organise</b> to see them.
        </p>
      )}

      <div>
        {items.map((c, i) => {
          // Every amount field needs its own accessible name: the visible
          // category label sits in a sibling node (or, for custom rows, in an
          // editable input), so without this the whole column was announced as
          // a row of unnamed spinbuttons.
          const amountId = `bb-amt-${catKey}-${c.k}`;
          const name = c.l.trim() || 'Untitled category';
          const hidden = hiddenKeys.includes(c.k);
          return (
            <div
              className={`row-line bb-row${hidden ? ' is-hidden' : ''}${manage ? reorder.rowClass(i) : ''}`}
              key={c.k}
              data-cat={catKey}
              {...(manage ? reorder.rowProps(i) : {})}
            >
              {manage && <DragHandle label={`Drag to reorder ${name}`} />}
              <div style={{ fontSize: 18, width: 28, textAlign: 'center', flexShrink: 0 }} aria-hidden="true">
                <Icon name={c.ic} size={18} />
              </div>
              {c.custom ? (
                <input
                  className="fi-sm bb-name"
                  type="text"
                  aria-label={`${name} — category name`}
                  value={c.l}
                  onChange={(e) => onRename(catKey, c.k, e.target.value)}
                />
              ) : (
                // A real label, so tapping the category name focuses its amount.
                <label htmlFor={amountId} className="bb-label">{c.l}</label>
              )}
              {hidden && <span className="bb-badge">Hidden</span>}
              <input
                className="fi-sm"
                type="number" step="any"
                id={amountId}
                aria-label={`${name} amount (${sym})`}
                min={0}
                inputMode="decimal"
                placeholder="0"
                value={vals[c.k] ? String(vals[c.k]) : ''}
                onChange={(e) => setVal(c.k, e.target.value)}
              />
              {manage && (
                <span className="bb-actions">
                  <MoveButtons index={i} count={items.length} name={name} onMove={move} />
                  <RowAction label={hidden ? `Show ${name}` : `Hide ${name}`} onClick={() => onHide(c.k, name)}>
                    {hidden ? 'Show' : 'Hide'}
                  </RowAction>
                  <RowAction label={`Archive ${name}`} onClick={() => onArchive(c.k, name)}>Archive</RowAction>
                  {c.custom && (
                    <RowAction danger label={`Delete ${name}`} onClick={() => onRemove(catKey, c.k, name)}>Delete</RowAction>
                  )}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <button type="button" className="bb-add" onClick={onAdd}>+ Add Category</button>

      {archived.length > 0 && (
        <ArchivedList
          items={archived}
          onRestore={(k, name) => onArchive(k, name)}
          note="Archived categories keep their saved amounts but are not counted."
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Shared bits
   ═══════════════════════════════════════════════════════════════════════════ */

function RowAction({
  label, onClick, danger, children,
}: {
  label: string; onClick: () => void; danger?: boolean; children: React.ReactNode;
}) {
  return (
    <button type="button" className={`bb-act${danger ? ' danger' : ''}`} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

function ArchivedList({
  items, onRestore, note,
}: {
  items: Array<{ k: string; l: string; ic: BudgetCat['ic'] }>;
  onRestore: (k: string, name: string) => void;
  note: string;
}) {
  return (
    <details className="bb-archived">
      <summary>Archived ({items.length})</summary>
      <p className="note" style={{ margin: '6px 0 8px' }}>{note}</p>
      {items.map((c) => {
        const name = c.l.trim() || 'Untitled';
        return (
          <div className="bb-arow" key={c.k}>
            <Icon name={c.ic} size={15} style={{ color: 'var(--ink3)' }} />
            <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
            <button type="button" className="bb-act" aria-label={`Restore ${name}`} onClick={() => onRestore(c.k, name)}>
              Restore
            </button>
          </div>
        );
      })}
    </details>
  );
}

function PctInput({ label, color, value, onChange, id }: {
  label: string; color: string; value: string; onChange: (v: string) => void; id: string;
}) {
  return (
    <div>
      <label className="fl" htmlFor={id} style={{ color }}>{label}</label>
      <input
        className="fi bb-pct"
        type="number" step="any"
        id={id}
        value={value}
        min={0}
        max={100}
        inputMode="numeric"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

const BUDGET_STYLES = `
.fx-tools .fx-sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;}
.fx-tools .bb-monthbar{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;flex-wrap:wrap;}
/* .fx-seg and .bb-cardhd now live in tools.css — they are rendered by
   BudgetSuggestions and BudgetTimeline as well as by this page, so defining
   them in one page's <style> tag made two components depend on a third's
   markup being mounted. */
/* Monthly take-home income is the figure every other number on this page is
   derived from, but it was painted with the same 12px secondary label as the
   individual source rows below it and a fill borrowed from the page canvas —
   which on light paper left it a near-invisible 4/255 step against the card.
   It now reuses the system's existing summary-metric treatment (.metric's
   uppercase label, its 26px value and its 3px gold rail) so it reads as the
   card's conclusion without becoming a new kind of object. The row layout is
   unchanged. */
.fx-tools .bb-total{position:relative;overflow:hidden;display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:14px 16px 14px 18px;margin-bottom:12px;background:var(--well);border:1px solid var(--well-border);
  border-radius:var(--ctl-r-lg);}
.fx-tools .bb-total::before{content:"";position:absolute;left:0;top:0;height:100%;width:3px;background:var(--gold);opacity:.9;}
.fx-tools .bb-total-l{font-size:11.5px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink2);}
.fx-tools .bb-total-v{font-size:26px;font-weight:700;letter-spacing:-.02em;line-height:1.05;color:var(--ink);
  font-variant-numeric:tabular-nums;}
/* The three ratio fields. They were .fi with four inline style overrides,
   which left them 49px tall and carrying the full-strength .fi fill — the
   heaviest controls on the page once the amount inputs were lightened, and a
   9px-taller rung than everything beside them. Same md rung and the same rest
   weight as the amount fields they are read against; the 18/700 figure stays,
   because the ratio is the point of the card. */
/* Only what actually differs from the shared field base: the md rung's
   geometry and a display-weight figure. Everything this used to restate by
   hand — rest background and border, hover, tabular figures, spin-button
   hiding, the cancelled focus lift — now comes from the shared .fi / .fi-sm
   base in tools.css, which is where it always belonged.
   --ctl-r-sm, not .fi's --ctl-r-md: on the md rung this field is the same
   height as the amount inputs it is read against, and two 40px fields with a
   2px radius difference read as a mistake rather than as a distinction. */
.fx-tools .bb-pct{height:var(--ctl-h-md);min-height:0;padding:0 12px;border-radius:var(--ctl-r-sm);
  text-align:center;font-size:18px;font-weight:700;letter-spacing:-.01em;}
.fx-tools .bb-row{gap:10px;}
.fx-tools .bb-row.is-hidden{opacity:.6;}
.fx-tools .bb-row.is-dragging{opacity:.4;}
.fx-tools .bb-row.is-over{box-shadow:inset 0 2px 0 0 var(--gold);}
.fx-tools .bb-label{flex:1;min-width:0;font-size:14px;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fx-tools .bb-name{flex:1;width:auto;min-width:0;text-align:left;}
.fx-tools .bb-badge{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:var(--ink3);
  background:var(--well);border-radius:var(--ctl-pill);padding:3px 8px;flex-shrink:0;}
.fx-tools .bb-actions{display:inline-flex;align-items:center;gap:4px;flex-shrink:0;flex-wrap:wrap;}
/* Row actions and the move arrows share the xs rung and the xs radius; they
   were 28px/8px and 26px/7px respectively, close enough to look like a
   mistake rather than a distinction. */
.fx-tools .bb-act{display:inline-flex;align-items:center;justify-content:center;min-height:var(--ctl-h-xs);padding:0 10px;
  border-radius:var(--ctl-r-xs);border:var(--ctl-bw) solid var(--hair2);background:var(--card);color:var(--ink2);
  font-size:11.5px;font-weight:600;font-family:inherit;cursor:pointer;
  transition:background-color var(--ctl-trans),color var(--ctl-trans),border-color var(--ctl-trans);}
.fx-tools .bb-act:hover{background:var(--fill-06);color:var(--ink);}
.fx-tools .bb-act.danger{color:var(--red);border-color:color-mix(in srgb,var(--red) 35%,transparent);}
.fx-tools .bb-act.danger:hover{background:color-mix(in srgb,var(--red) 10%,transparent);}
.fx-tools .fx-grip{display:inline-flex;align-items:center;color:var(--ink3);cursor:grab;flex-shrink:0;}
.fx-tools .fx-grip:active{cursor:grabbing;}
.fx-tools .fx-move{display:inline-flex;gap:2px;}
.fx-tools .fx-move-btn{display:inline-flex;align-items:center;justify-content:center;width:var(--ctl-h-xs);height:var(--ctl-h-xs);
  border-radius:var(--ctl-r-xs);border:var(--ctl-bw) solid var(--hair2);background:var(--card);color:var(--ink2);cursor:pointer;
  transition:background-color var(--ctl-trans),color var(--ctl-trans),border-color var(--ctl-trans);}
.fx-tools .fx-move-btn:hover:not(:disabled){background:var(--fill-06);color:var(--ink);}
.fx-tools .fx-move-btn:disabled{opacity:.35;cursor:default;}
.fx-tools .bb-add{margin-top:14px;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:var(--ctl-h-sm);
  background:transparent;border:var(--ctl-bw) dashed var(--hair);border-radius:var(--ctl-pill);padding:0 16px;color:var(--ink2);
  font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;
  transition:border-color var(--ctl-trans),color var(--ctl-trans),background-color var(--ctl-trans);}
.fx-tools .bb-add:hover{border-color:var(--gold);color:var(--ink);background:var(--gold-bg);}
.fx-tools .bb-archived{margin-top:14px;}
.fx-tools .bb-archived > summary{font-size:12px;color:var(--ink3);cursor:pointer;font-weight:600;}
.fx-tools .bb-arow{display:flex;align-items:center;gap:9px;padding:7px 0;font-size:13px;color:var(--ink2);border-bottom:1px solid var(--hair2);}
.fx-tools .bb-arow:last-child{border-bottom:none;}
.fx-tools .bb-opt{display:block;width:100%;text-align:left;font-family:inherit;color:inherit;}
.fx-tools .bb-opt .ol{display:block;font-size:15px;font-weight:600;}
.fx-tools .bb-opt .od{display:block;font-size:12px;color:var(--ink2);margin-top:2px;}
@media(max-width:560px){
  .fx-tools .bb-actions{width:100%;justify-content:flex-end;margin-top:6px;}
  .fx-tools .bb-row{flex-wrap:wrap;}
}
@media (prefers-reduced-motion:reduce){
  .fx-tools .bb-act,.fx-tools .fx-move-btn,.fx-tools .bb-add{transition:none;}
}
`;
