import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Icon } from './Icon';
import { useAskAi } from './AiAssistant';
import { focusAriaLabel } from '../ai/focus';
import type { FlatCat } from './TransactionModal';
import { PAYMENT_METHODS, migrateCategory, type ExpenseItem } from '../lib/expense';
import { SECTION_LABEL } from '../lib/budget';
import { SECTION_COLOR } from '../lib/sectionColors';
import { store } from '../lib/storage';
import {
  filterTransactions, sortTransactions, groupByTimeline, emptyFilters, countActiveFilters,
  SORT_OPTIONS, type TxFilters, type SortKey, type CatLabels,
} from '../lib/txfilter';


export type ExportKind = 'csv' | 'xlsx' | 'pdf';

/** How long a row spends animating out before it is actually removed. */
const REMOVE_MS = 220;

/**
 * Above this many rows a bulk delete asks first. Small deletes stay instant —
 * they are one keystroke from being undone — while "I just selected 200 rows"
 * gets a checkpoint before anything disappears.
 */
const CONFIRM_BULK_ABOVE = 3;

function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

interface Props {
  /** The selected month's transactions, in original (insertion) order. */
  items: ExpenseItem[];
  /** Whether the user has ANY transactions at all (drives empty-state copy). */
  hasAnyEver: boolean;
  cats: FlatCat[];
  cfmt: (n: number) => string;
  monthLabelText: string;
  now: Date;
  onAdd: () => void;
  onEdit: (item: ExpenseItem) => void;
  onDuplicate: (item: ExpenseItem) => void;
  onDelete: (id: string) => void;
  onBulkDelete: (ids: string[]) => void;
  onBulkDuplicate: (ids: string[]) => void;
  onBulkCategory: (ids: string[], catKey: string) => void;
  onBulkAddTags: (ids: string[], tags: string[]) => void;
  onExport: (kind: ExportKind, items: ExpenseItem[], scopeLabel: string) => void;
  /**
   * Lets the page drive the list imperatively — following a budget warning
   * filters to that category. An imperative handle keeps the filter state owned
   * by the list (where it belongs) instead of mirroring it into the page.
   */
  apiRef?: RefObject<TransactionListHandle | null>;
}

export interface TransactionListHandle {
  /** Filter to one category and bring the list into view. */
  focusCategory: (key: string) => void;
}

export default function TransactionList({
  items, hasAnyEver, cats, cfmt, monthLabelText, now,
  onAdd, onEdit, onDuplicate, onDelete,
  onBulkDelete, onBulkDuplicate, onBulkCategory, onBulkAddTags, onExport, apiRef,
}: Props) {
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<TxFilters>(emptyFilters());
  const [sort, setSort] = useState<SortKey>('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkPanel, setBulkPanel] = useState<'none' | 'category' | 'tags' | 'confirmDelete'>('none');
  /** Rows mid-exit. They stay mounted for the animation, then the parent removes them. */
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  const removeTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => removeTimers.current.forEach(clearTimeout), []);

  /**
   * Delete with an exit animation: the row shrinks away, then the parent state
   * changes. Reduced motion (and any environment without matchMedia) deletes
   * immediately — the animation is decoration, never a gate on the action.
   */
  const animateOut = useCallback((ids: string[], commit: () => void) => {
    if (ids.length === 0) return;
    if (prefersReducedMotion()) { commit(); return; }
    setRemoving((prev) => { const n = new Set(prev); ids.forEach((id) => n.add(id)); return n; });
    removeTimers.current.push(setTimeout(() => {
      setRemoving((prev) => { const n = new Set(prev); ids.forEach((id) => n.delete(id)); return n; });
      commit();
    }, REMOVE_MS));
  }, []);

  /* Follow a budget warning: filter to that category and bring the list into view. */
  const focusCategory = useCallback((key: string) => {
    setFilters({ ...emptyFilters(), categories: [key] });
    setQuery('');
    setShowFilters(true);
    rootRef.current?.scrollIntoView({
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
      block: 'start',
    });
  }, []);

  useEffect(() => {
    if (!apiRef) return;
    apiRef.current = { focusCategory };
    return () => { apiRef.current = null; };
  }, [apiRef, focusCategory]);

  const catLabels: CatLabels = useMemo(() => Object.fromEntries(cats.map((c) => [c.k, c.l])), [cats]);
  const catMeta = useMemo(() => new Map(cats.map((c) => [c.k, c])), [cats]);

  const effFilters = useMemo(() => ({ ...filters, query }), [filters, query]);
  const visible = useMemo(
    () => sortTransactions(filterTransactions(items, effFilters, catLabels), sort, catLabels),
    [items, effFilters, sort, catLabels]
  );
  const groups = useMemo(() => groupByTimeline(visible, now), [visible, now]);
  const activeFilterCount = countActiveFilters(filters);

  const exitSelect = () => { setSelectMode(false); setSelected(new Set()); setBulkPanel('none'); };
  const toggle = (id: string) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const startSelect = (id: string) => { setSelectMode(true); setSelected(new Set([id])); };
  const allVisibleSelected = visible.length > 0 && visible.every((e) => selected.has(e.id));
  const toggleAll = () =>
    setSelected(allVisibleSelected ? new Set() : new Set(visible.map((e) => e.id)));

  // Only currently-present items count — stale ids (from deletes) are ignored,
  // so no effect is needed to prune the selection set.
  const selectedItems = useMemo(() => items.filter((e) => selected.has(e.id)), [items, selected]);
  const selectedCount = selectedItems.length;

  const clearFilters = () => { setFilters(emptyFilters()); setQuery(''); };

  const usedPayments = useMemo(() => {
    const set = new Set(items.map((e) => e.paymentMethod).filter(Boolean) as string[]);
    return PAYMENT_METHODS.filter((m) => set.has(m));
  }, [items]);
  // Resolved through the same migration the filter and the dashboard use, so a
  // category holding only legacy-keyed rows still offers its filter chip.
  const usedCats = useMemo(() => {
    const validKeys = new Set(cats.map((c) => c.k));
    const present = new Set(items.map((e) => migrateCategory(e.category, validKeys)));
    return cats.filter((c) => present.has(c.k));
  }, [cats, items]);

  const deleteSelected = () => {
    const ids = selectedItems.map((e) => e.id);
    animateOut(ids, () => onBulkDelete(ids));
    exitSelect();
  };

  return (
    <div className="card" ref={rootRef}>
      <style>{TX_STYLES}</style>

      {/* An honest error state: private browsing (or a full quota) means edits
          live only until the tab closes, and the user deserves to know. */}
      {!store.persistent && (
        <div className="tx-warnbar" role="alert">
          <Icon name="warn" size={15} style={{ color: 'var(--orange)', flexShrink: 0 }} />
          <span>
            Storage is unavailable in this browser, so transactions won’t be saved after you close the tab.
            Export a copy before you leave.
          </span>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 14, fontWeight: 700 }}>
          Transactions
          <span className="note" style={{ fontWeight: 500, marginLeft: 8 }}>
            {visible.length === items.length ? `${items.length} in ${monthLabelText}` : `${visible.length} of ${items.length}`}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {items.length > 0 && (
            <button type="button" className="btn btn-ghost btn-sm" style={{ width: 'auto' }}
              onClick={() => (selectMode ? exitSelect() : setSelectMode(true))}>
              {selectMode ? 'Done' : 'Select'}
            </button>
          )}
          {cats.length > 0 && (
            <button type="button" className="btn btn-sm" style={{ width: 'auto' }} onClick={onAdd}>+ Add</button>
          )}
        </div>
      </div>

      {/* Search + sort + filter toggle */}
      {items.length > 0 && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 180 }}>
            <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink3)', pointerEvents: 'none' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            </span>
            <input
              className="fi" type="search" inputMode="search"
              placeholder="Search merchant, category, amount, note, date…"
              aria-label="Search transactions"
              aria-describedby="tx-search-hint"
              value={query} onChange={(e) => setQuery(e.target.value)}
              style={{ paddingLeft: 34, paddingTop: 10, paddingBottom: 10 }}
            />
            <span id="tx-search-hint" className="sr-only-lbl">
              Filters as you type across merchant, category, amount, notes, tags, payment method and date.
            </span>
          </div>
          <label className="fs-wrap">
            <span className="sr-only-lbl">Sort</span>
            <select className="fs" aria-label="Sort transactions" value={sort} onChange={(e) => setSort(e.target.value as SortKey)} style={{ width: 'auto', paddingTop: 10, paddingBottom: 10 }}>
              {SORT_OPTIONS.map((o) => <option key={o.k} value={o.k}>{o.label}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-ghost btn-sm" style={{ width: 'auto' }}
            aria-expanded={showFilters} onClick={() => setShowFilters((s) => !s)}>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </button>
        </div>
      )}

      {/* Filter panel */}
      {showFilters && items.length > 0 && (
        <div className="tx-filters" role="group" aria-label="Filter transactions">
          <div className="grid2">
            <div className="fg" style={{ margin: 0 }}>
              <label className="fl" htmlFor="tx-from">From date</label>
              <input className="fi" id="tx-from" type="date" value={filters.dateFrom} onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))} />
            </div>
            <div className="fg" style={{ margin: 0 }}>
              <label className="fl" htmlFor="tx-to">To date</label>
              <input className="fi" id="tx-to" type="date" value={filters.dateTo} onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))} />
            </div>
          </div>
          <div className="grid2" style={{ marginTop: 10 }}>
            <div className="fg" style={{ margin: 0 }}>
              <label className="fl" htmlFor="tx-min">Min amount</label>
              <input className="fi" id="tx-min" type="number" inputMode="decimal" min={0} placeholder="0" value={filters.amountMin ?? ''} onChange={(e) => setFilters((f) => ({ ...f, amountMin: e.target.value === '' ? null : Number(e.target.value) }))} />
            </div>
            <div className="fg" style={{ margin: 0 }}>
              <label className="fl" htmlFor="tx-max">Max amount</label>
              <input className="fi" id="tx-max" type="number" inputMode="decimal" min={0} placeholder="Any" value={filters.amountMax ?? ''} onChange={(e) => setFilters((f) => ({ ...f, amountMax: e.target.value === '' ? null : Number(e.target.value) }))} />
            </div>
          </div>

          {usedCats.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="fl">Category</div>
              <div className="tx-chiprow">
                {usedCats.map((c) => {
                  const on = filters.categories.includes(c.k);
                  return (
                    <button key={c.k} type="button" className={`tx-chip${on ? ' on' : ''}`} aria-pressed={on}
                      onClick={() => setFilters((f) => ({ ...f, categories: toggleIn(f.categories, c.k) }))}>
                      <Icon name={c.ic} size={13} style={{ color: SECTION_COLOR[c.section] }} /> {c.l}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {usedPayments.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <div className="fl">Payment method</div>
              <div className="tx-chiprow">
                {usedPayments.map((m) => {
                  const on = filters.paymentMethods.includes(m);
                  return (
                    <button key={m} type="button" className={`tx-chip${on ? ' on' : ''}`} aria-pressed={on}
                      onClick={() => setFilters((f) => ({ ...f, paymentMethods: toggleIn(f.paymentMethods, m) }))}>{m}</button>
                  );
                })}
              </div>
            </div>
          )}

          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <div>
              <div className="fl">Recurring</div>
              <div className="tx-seg" role="group" aria-label="Recurring filter">
                {(['any', 'recurring', 'one_off'] as const).map((v) => (
                  <button key={v} type="button" className={filters.recurring === v ? 'on' : ''} aria-pressed={filters.recurring === v}
                    onClick={() => setFilters((f) => ({ ...f, recurring: v }))}>
                    {v === 'any' ? 'All' : v === 'recurring' ? 'Recurring' : 'One-off'}
                  </button>
                ))}
              </div>
            </div>
            {activeFilterCount > 0 && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={clearFilters}>Clear filters</button>
            )}
          </div>
        </div>
      )}

      {/* Bulk toolbar */}
      {selectMode && (
        <div className="tx-bulk" role="toolbar" aria-label="Bulk actions">
          <label className="fx-checkrow" style={{ fontSize: 13, fontWeight: 600 }}>
            <input type="checkbox" className="fx-check" checked={allVisibleSelected} onChange={toggleAll} aria-label="Select all shown" />
            {selectedCount} selected
          </label>
          <div style={{ flex: 1 }} />
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button type="button" className="tx-bulkbtn" disabled={selectedCount === 0} onClick={() => onBulkDuplicate(selectedItems.map((e) => e.id))}>Duplicate</button>
            <button type="button" className="tx-bulkbtn" disabled={selectedCount === 0} onClick={() => setBulkPanel(bulkPanel === 'category' ? 'none' : 'category')} aria-expanded={bulkPanel === 'category'}>Category</button>
            <button type="button" className="tx-bulkbtn" disabled={selectedCount === 0} onClick={() => setBulkPanel(bulkPanel === 'tags' ? 'none' : 'tags')} aria-expanded={bulkPanel === 'tags'}>Add tags</button>
            <ExportInline disabled={selectedCount === 0} onExport={(k) => onExport(k, selectedItems, `${selectedCount}-selected`)} />
            <button
              type="button" className="tx-bulkbtn danger" disabled={selectedCount === 0}
              onClick={() => (selectedCount > CONFIRM_BULK_ABOVE ? setBulkPanel('confirmDelete') : deleteSelected())}
            >
              Delete
            </button>
          </div>
        </div>
      )}
      {selectMode && bulkPanel === 'confirmDelete' && (
        <div className="tx-subpanel tx-confirm" role="alertdialog" aria-labelledby="tx-bulk-confirm">
          <div id="tx-bulk-confirm" style={{ fontSize: 13.5, fontWeight: 600 }}>
            Delete {selectedCount} transactions?
          </div>
          <p className="note" style={{ margin: '4px 0 10px' }}>
            They’ll be removed from {monthLabelText}. You can undo this straight afterwards.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="tx-bulkbtn danger" onClick={deleteSelected}>
              Delete {selectedCount}
            </button>
            <button type="button" className="tx-bulkbtn" onClick={() => setBulkPanel('none')}>Cancel</button>
          </div>
        </div>
      )}
      {selectMode && bulkPanel === 'category' && (
        <BulkCategory cats={cats} onApply={(k) => { onBulkCategory(selectedItems.map((e) => e.id), k); setBulkPanel('none'); }} onCancel={() => setBulkPanel('none')} />
      )}
      {selectMode && bulkPanel === 'tags' && (
        <BulkTags onApply={(tags) => { onBulkAddTags(selectedItems.map((e) => e.id), tags); setBulkPanel('none'); }} onCancel={() => setBulkPanel('none')} />
      )}

      {/* List / empty states */}
      {items.length === 0 ? (
        <EmptyState hasAnyEver={hasAnyEver} monthLabelText={monthLabelText} canAdd={cats.length > 0} onAdd={onAdd} />
      ) : visible.length === 0 ? (
        <NoMatches onClear={clearFilters} />
      ) : (
        <div style={{ marginTop: selectMode ? 4 : 8 }}>
          {groups.map((g) => (
            <div key={g.key} style={{ marginBottom: 6 }}>
              <div className="tx-grouphd">{g.label}<span>{g.items.length}</span></div>
              {g.items.map((e) => (
                <TxRow
                  key={e.id} e={e} cat={catMeta.get(e.category)} cfmt={cfmt}
                  selectMode={selectMode} selected={selected.has(e.id)} removing={removing.has(e.id)}
                  onToggle={() => toggle(e.id)} onLongPress={() => startSelect(e.id)}
                  onEdit={() => onEdit(e)} onDuplicate={() => onDuplicate(e)}
                  onDelete={() => animateOut([e.id], () => onDelete(e.id))}
                />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function toggleIn(arr: string[], v: string): string[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

/* ─────────────────────────── Row ─────────────────────────── */
function TxRow({
  e, cat, cfmt, selectMode, selected, removing, onToggle, onLongPress, onEdit, onDuplicate, onDelete,
}: {
  e: ExpenseItem; cat: FlatCat | undefined; cfmt: (n: number) => string;
  selectMode: boolean; selected: boolean; removing: boolean; onToggle: () => void; onLongPress: () => void;
  onEdit: () => void; onDuplicate: () => void; onDelete: () => void;
}) {
  const color = cat ? SECTION_COLOR[cat.section] : 'var(--ink2)';
  const primary = e.merchant || e.note || cat?.l || 'Uncategorised';
  const initial = (e.merchant || cat?.l || '?').trim().charAt(0).toUpperCase();

  // Null outside the tools shell, and disabled until the cloud seed lands — in
  // either case the row simply has one fewer action rather than a dead button.
  const ai = useAskAi();
  const aiFocus = ai?.enabled
    ? ({ kind: 'transaction', id: e.id, label: primary } as const)
    : null;

  // Touch gesture handling: swipe left = delete, right = edit, long-press = select.
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const lp = useRef<ReturnType<typeof setTimeout> | null>(null);
  const moved = useRef(false);

  const clearLp = () => { if (lp.current) { clearTimeout(lp.current); lp.current = null; } };
  const onTouchStart = (ev: React.TouchEvent) => {
    const t = ev.touches[0];
    start.current = { x: t.clientX, y: t.clientY, t: Date.now() };
    moved.current = false;
    clearLp();
    lp.current = setTimeout(() => { if (!moved.current) { onLongPress(); if (navigator.vibrate) navigator.vibrate(10); } }, 500);
  };
  const onTouchMove = (ev: React.TouchEvent) => {
    if (!start.current) return;
    const t = ev.touches[0];
    const dX = t.clientX - start.current.x;
    const dY = t.clientY - start.current.y;
    if (Math.abs(dX) > 8 || Math.abs(dY) > 8) { moved.current = true; clearLp(); }
    if (Math.abs(dX) > Math.abs(dY)) setDx(Math.max(-96, Math.min(96, dX)));
  };
  const onTouchEnd = () => {
    clearLp();
    if (dx <= -60) onDelete();
    else if (dx >= 60) onEdit();
    setDx(0);
    start.current = null;
  };

  const reveal = dx < 0 ? 'del' : dx > 0 ? 'edit' : null;

  return (
    <div className={`tx-rowwrap${removing ? ' is-removing' : ''}`} aria-hidden={removing || undefined}>
      {reveal && (
        <div className={`tx-swipehint ${reveal}`} aria-hidden="true">
          {reveal === 'del' ? 'Delete' : 'Edit'}
        </div>
      )}
      <div
        className="tx-row"
        style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? 'none' : 'transform .2s' }}
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}
      >
        {selectMode && (
          <label className="fx-check-hit">
            <input type="checkbox" className="fx-check" checked={selected} onChange={onToggle}
              aria-label={`Select ${primary}`} />
          </label>
        )}
        <button
          type="button"
          className="tx-main"
          onClick={() => (selectMode ? onToggle() : onEdit())}
          aria-label={`${selectMode ? 'Toggle selection for' : 'Edit'} ${primary}, ${cfmt(e.amount)} on ${e.date}`}
        >
          <span className="tx-avatar" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)`, color }}>
            {e.merchant ? initial : <Icon name={cat?.ic ?? 'other'} size={16} style={{ color }} />}
          </span>
          <span className="tx-body">
            <span className="tx-line1">
              <span className="tx-primary">{primary}</span>
              {e.recurring && (
                <span className="tx-badge"><Icon name="refresh" size={10} /> Recurring</span>
              )}
            </span>
            <span className="tx-line2">
              <span className="tx-pill" style={{ color, borderColor: `color-mix(in srgb, ${color} 40%, transparent)` }}>{cat?.l ?? 'Uncategorised'}</span>
              {e.paymentMethod && <span className="tx-meta">{e.paymentMethod}</span>}
              <span className="tx-meta">{fmtDate(e.date)}</span>
            </span>
          </span>
          <span className="tx-amt">{cfmt(e.amount)}</span>
        </button>
        {!selectMode && (
          <div className="tx-actions">
            {/* Styled as a sibling of Edit and Delete rather than as an
                AskAiButton: this is a tight uniform icon group, and a pill with
                its own border would break the row. The gold sparkle still marks
                it as AI, and the accessible name comes from the same helper
                every other AI trigger uses. This group is hidden below 560px —
                the modal carries the mobile entry point. */}
            {aiFocus && (
              <RowAction label={focusAriaLabel(aiFocus)} onClick={() => ai?.open(aiFocus)}>
                <Icon name="sparkle" size={15} style={{ color: 'var(--gold)' }} />
              </RowAction>
            )}
            <RowAction label={`Edit ${primary}`} onClick={onEdit}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
            </RowAction>
            <RowAction label={`Duplicate ${primary}`} onClick={onDuplicate}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
            </RowAction>
            <RowAction label={`Delete ${primary}`} danger onClick={onDelete}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
            </RowAction>
          </div>
        )}
      </div>
    </div>
  );
}

function RowAction({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button type="button" className={`tx-act${danger ? ' danger' : ''}`} aria-label={label} title={label}
      onClick={(ev) => { ev.stopPropagation(); onClick(); }}>{children}</button>
  );
}

/* ─────────────────────── Bulk sub-panels ─────────────────────── */
function BulkCategory({ cats, onApply, onCancel }: { cats: FlatCat[]; onApply: (k: string) => void; onCancel: () => void }) {
  const [k, setK] = useState(cats[0]?.k ?? '');
  return (
    <div className="tx-subpanel">
      <label className="fl" htmlFor="bulk-cat" style={{ margin: 0 }}>Move selected to category</label>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <select className="fs" id="bulk-cat" value={k} onChange={(e) => setK(e.target.value)} style={{ flex: 1, minWidth: 160 }}>
          {cats.map((c) => <option key={c.k} value={c.k}>{c.l} · {SECTION_LABEL[c.section]}</option>)}
        </select>
        <button type="button" className="btn btn-sm" style={{ width: 'auto' }} disabled={!k} onClick={() => onApply(k)}>Apply</button>
        <button type="button" className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function BulkTags({ onApply, onCancel }: { onApply: (tags: string[]) => void; onCancel: () => void }) {
  const [v, setV] = useState('');
  const apply = () => {
    const tags = v.split(',').map((t) => t.trim()).filter(Boolean);
    if (tags.length) onApply(tags);
  };
  return (
    <div className="tx-subpanel">
      <label className="fl" htmlFor="bulk-tags" style={{ margin: 0 }}>Add tags to selected</label>
      <div style={{ display: 'flex', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
        <input className="fi" id="bulk-tags" style={{ flex: 1, minWidth: 160 }} placeholder="Comma separated, e.g. work, trip"
          value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }} />
        <button type="button" className="btn btn-sm" style={{ width: 'auto' }} onClick={apply}>Apply</button>
        <button type="button" className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function ExportInline({ onExport, disabled }: { onExport: (k: ExportKind) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="tx-bulkbtn" disabled={disabled} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Export ▾</button>
      {open && (
        <div role="menu" style={{ position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 170, zIndex: 40, background: 'var(--card-solid)', border: '1px solid var(--hair)', borderRadius: 12, boxShadow: 'var(--shadow)', overflow: 'hidden', padding: 4 }}>
          {(['csv', 'xlsx', 'pdf'] as ExportKind[]).map((k) => (
            <button key={k} role="menuitem" type="button" className="tx-menuitem" onClick={() => { setOpen(false); onExport(k); }}>
              {k === 'csv' ? 'Export CSV' : k === 'xlsx' ? 'Export Excel (.xlsx)' : 'Export PDF'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────── Empty states ─────────────────────── */
function EmptyState({ hasAnyEver, monthLabelText, canAdd, onAdd }: { hasAnyEver: boolean; monthLabelText: string; canAdd: boolean; onAdd: () => void }) {
  return (
    <div className="tx-empty">
      <ReceiptArt />
      <div className="tx-empty-title">{hasAnyEver ? `Nothing logged in ${monthLabelText}` : 'Start tracking your spending'}</div>
      <p className="tx-empty-copy">
        {hasAnyEver
          ? 'No transactions this month yet. Add one to see your budget health and insights update for this period.'
          : 'Add your first transaction to unlock spending insights, category breakdowns and your Financial Health Score.'}
      </p>
      {canAdd
        ? <button type="button" className="btn btn-sm" style={{ width: 'auto' }} onClick={onAdd}>+ Add your first transaction</button>
        : <p className="note">Add categories in Budget Builder to start tracking.</p>}
    </div>
  );
}

function NoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="tx-empty">
      <SearchArt />
      <div className="tx-empty-title">No matching transactions</div>
      <p className="tx-empty-copy">Try a different search term or loosen your filters to see more.</p>
      <button type="button" className="btn btn-ghost btn-sm" style={{ width: 'auto' }} onClick={onClear}>Clear search & filters</button>
    </div>
  );
}

function ReceiptArt() {
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" fill="none" aria-hidden="true">
      <rect x="18" y="10" width="36" height="52" rx="3" fill="color-mix(in srgb, var(--gold) 12%, transparent)" stroke="var(--gold)" strokeWidth="1.6" />
      <path d="M18 62l4-3 4 3 4-3 4 3 4-3 4 3 4-3 4 3V10H18z" fill="none" stroke="var(--gold)" strokeWidth="1.6" strokeLinejoin="round" />
      <line x1="25" y1="24" x2="47" y2="24" stroke="var(--ink3)" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="25" y1="32" x2="47" y2="32" stroke="var(--ink3)" strokeWidth="1.6" strokeLinecap="round" />
      <line x1="25" y1="40" x2="39" y2="40" stroke="var(--ink3)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
function SearchArt() {
  return (
    <svg width="66" height="66" viewBox="0 0 66 66" fill="none" aria-hidden="true">
      <circle cx="29" cy="29" r="18" fill="color-mix(in srgb, var(--ink) 5%, transparent)" stroke="var(--ink3)" strokeWidth="1.8" />
      <line x1="43" y1="43" x2="56" y2="56" stroke="var(--ink3)" strokeWidth="2.4" strokeLinecap="round" />
    </svg>
  );
}

/* ─────────────────────── helpers ─────────────────────── */
function fmtDate(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d;
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const TX_STYLES = `
.fx-tools .tx-filters{background:var(--well);border:1px solid var(--well-border);border-radius:14px;padding:14px;margin-bottom:10px;}
.fx-tools .tx-chiprow{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px;}
.fx-tools .tx-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:980px;border:1px solid var(--hair2);
  background:var(--card);color:var(--ink2);font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;
  transition:background-color var(--ctl-trans),border-color var(--ctl-trans),color var(--ctl-trans);}
.fx-tools .tx-chip:hover{border-color:var(--ink3);}
.fx-tools .tx-chip.on{border-color:var(--ink);background:var(--hair);color:var(--ink);}
.fx-tools .tx-seg{display:inline-flex;border:1px solid var(--hair2);border-radius:10px;overflow:hidden;margin-top:6px;}
.fx-tools .tx-seg button{padding:8px 14px;background:var(--card);border:none;border-right:1px solid var(--hair2);color:var(--ink2);
  font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;
  transition:background-color var(--ctl-trans),color var(--ctl-trans);}
.fx-tools .tx-seg button:last-child{border-right:none;}
.fx-tools .tx-seg button.on{background:var(--gold);color:#1a1400;}
.fx-tools .tx-bulk{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:var(--gold-bg,rgba(212,175,55,.1));
  border:1px solid color-mix(in srgb,var(--gold) 45%,transparent);border-radius:12px;padding:9px 12px;margin-bottom:10px;
  position:sticky;top:8px;z-index:var(--z-sticky);backdrop-filter:blur(8px);}
.fx-tools .tx-bulkbtn{padding:7px 12px;border-radius:9px;border:1px solid var(--hair2);background:var(--card);color:var(--ink);
  font-size:12.5px;font-weight:600;font-family:inherit;cursor:pointer;
  transition:background-color var(--ctl-trans),border-color var(--ctl-trans),color var(--ctl-trans),opacity var(--ctl-trans);}
.fx-tools .tx-bulkbtn:hover:not(:disabled){background:var(--fill-06);}
.fx-tools .tx-bulkbtn:disabled{opacity:.45;cursor:default;}
.fx-tools .tx-bulkbtn.danger{color:var(--red);border-color:color-mix(in srgb,var(--red) 40%,transparent);}
.fx-tools .tx-subpanel{background:var(--well);border:1px solid var(--well-border);border-radius:12px;padding:12px;margin-bottom:10px;}
.fx-tools .tx-menuitem{display:block;width:100%;text-align:left;padding:10px 12px;border-radius:8px;background:transparent;border:none;
  color:var(--ink);font-size:13px;cursor:pointer;font-family:inherit;}
.fx-tools .tx-menuitem:hover{background:var(--fill-06);}
.fx-tools .tx-grouphd{display:flex;align-items:center;justify-content:space-between;font-size:11px;font-weight:700;letter-spacing:.04em;
  text-transform:uppercase;color:var(--ink3);padding:12px 2px 4px;position:sticky;top:0;background:linear-gradient(var(--card),var(--card) 70%,transparent);}
.fx-tools .tx-grouphd span{font-weight:600;letter-spacing:0;}
.fx-tools .tx-rowwrap{position:relative;overflow:hidden;border-bottom:1px solid var(--hair2);}
.fx-tools .tx-rowwrap:last-child{border-bottom:none;}
/* Exit animation. The row is already excluded from the accessibility tree by
   aria-hidden, so this is purely a visual hand-off to the undo toast. */
.fx-tools .tx-rowwrap.is-removing{animation:fxTxOut 220ms cubic-bezier(.4,0,1,1) forwards;pointer-events:none;}
@keyframes fxTxOut{
  0%{opacity:1;transform:none;max-height:80px;}
  100%{opacity:0;transform:translateX(-24px);max-height:0;border-bottom-color:transparent;}
}
.fx-tools .tx-warnbar{display:flex;align-items:flex-start;gap:9px;padding:10px 12px;margin-bottom:12px;border-radius:11px;font-size:12.5px;
  line-height:1.5;color:var(--ink2);background:color-mix(in srgb,var(--orange) 8%,transparent);
  border:1px solid color-mix(in srgb,var(--orange) 26%,transparent);}
.fx-tools .tx-confirm{border-color:color-mix(in srgb,var(--red) 35%,transparent);}
.fx-tools .tx-swipehint{position:absolute;inset:0;display:flex;align-items:center;padding:0 18px;font-size:12px;font-weight:700;color:#fff;}
.fx-tools .tx-swipehint.del{justify-content:flex-end;background:var(--red);}
.fx-tools .tx-swipehint.edit{justify-content:flex-start;background:var(--blue);}
.fx-tools .tx-row{display:flex;align-items:center;gap:8px;padding:10px 2px;background:var(--card);position:relative;}
.fx-tools .tx-main{display:flex;align-items:center;gap:11px;flex:1;min-width:0;background:none;border:none;padding:2px 4px;margin:-2px -4px;
  border-radius:10px;cursor:pointer;text-align:left;color:inherit;font:inherit;}
.fx-tools .tx-main:hover{background:var(--fill-04);}
.fx-tools .tx-avatar{display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:50%;
  font-size:14px;font-weight:700;flex-shrink:0;}
.fx-tools .tx-body{flex:1;min-width:0;}
.fx-tools .tx-line1{display:flex;align-items:center;gap:6px;}
.fx-tools .tx-primary{font-size:13.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fx-tools .tx-badge{display:inline-flex;align-items:center;gap:3px;font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:980px;
  background:var(--well);color:var(--ink3);flex-shrink:0;text-transform:uppercase;letter-spacing:.03em;}
.fx-tools .tx-line2{display:flex;align-items:center;gap:8px;margin-top:3px;min-width:0;}
.fx-tools .tx-pill{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:980px;border:1px solid;white-space:nowrap;}
.fx-tools .tx-meta{font-size:11px;color:var(--ink3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.fx-tools .tx-amt{font-size:14px;font-weight:700;flex-shrink:0;padding-left:8px;}
.fx-tools .tx-actions{display:flex;align-items:center;gap:2px;flex-shrink:0;}
.fx-tools .tx-act{display:inline-flex;align-items:center;justify-content:center;width:32px;height:32px;background:none;border:none;
  border-radius:8px;cursor:pointer;color:var(--ink3);
  transition:background-color var(--ctl-trans),color var(--ctl-trans);}
.fx-tools .tx-act:hover{background:var(--fill-06);color:var(--ink);}
.fx-tools .tx-act.danger:hover{color:var(--red);}
.fx-tools .tx-empty{text-align:center;padding:30px 16px 22px;}
.fx-tools .tx-empty svg{margin:0 auto 14px;display:block;}
.fx-tools .tx-empty-title{font-size:15px;font-weight:700;margin-bottom:6px;}
.fx-tools .tx-empty-copy{font-size:13px;color:var(--ink2);line-height:1.6;max-width:340px;margin:0 auto 16px;}
.fx-tools .sr-only-lbl{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);}
.fx-tools .fs-wrap{display:inline-flex;}
@media (max-width:560px){
  .fx-tools .tx-actions{display:none;}
  .fx-tools .tx-amt{font-size:13.5px;}
}
@media (prefers-reduced-motion:reduce){
  .fx-tools .tx-row{transition:none !important;}
  .fx-tools .tx-rowwrap.is-removing{animation:none;display:none;}
}
`;
