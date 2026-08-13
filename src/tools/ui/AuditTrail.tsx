/**
 * Change history for the Expense Tracker.
 *
 * Reads the append-only log in lib/expenseAudit.ts and shows it as a
 * chronological record: what changed, when, and — for an edit — from what to
 * what. Nothing here writes to the ledger; the only mutation it offers is
 * erasing the history itself.
 *
 * The list is ordered by when the CHANGE was made, never by the date on the
 * transaction. Those are different questions, and conflating them is what makes
 * most "activity" screens useless: a spend backdated to last month is a thing
 * that happened today.
 */
import { useMemo, useState } from 'react';
import { ymdLocal } from '../../lib/date';
import { Icon, type IconName } from './Icon';
import {
  AUDIT_ACTION_LABEL, AUDIT_FIELD_LABEL, MAX_AUDIT_ENTRIES,
  emptyAuditFilter, filterAudit, groupAuditByDay, groupAuditBatches, restorableFrom,
  type AuditAction, type AuditEntry, type AuditField, type AuditGroup, type AuditValue,
} from '../lib/expenseAudit';
import type { ExpenseItem } from '../lib/expense';

/** How many day-groups render before "Show earlier changes". */
const PAGE_SIZE = 8;

/**
 * Tone per action, applied to the badge and the chip.
 *
 * Deliberately not the budget tones: nothing here is good or bad news, it is a
 * record. Green/red only mark money arriving in or leaving the ledger.
 */
const ACTION_STYLE: Record<AuditAction, { icon: IconName; color: string }> = {
  add: { icon: 'plus', color: 'var(--green)' },
  edit: { icon: 'edit', color: 'var(--blue)' },
  delete: { icon: 'trash', color: 'var(--red)' },
  restore: { icon: 'refresh', color: 'var(--gold)' },
  duplicate: { icon: 'layers', color: 'var(--blue)' },
};

const FILTER_ORDER: AuditAction[] = ['add', 'edit', 'delete', 'restore', 'duplicate'];

interface Props {
  /** The whole log, newest first. */
  entries: AuditEntry[];
  /** The live ledger — decides which entries can still be opened. */
  items: ExpenseItem[];
  /** Resolves a stored category key to its display name (migration applied). */
  catLabel: (key: string) => string;
  cfmt: (n: number) => string;
  /** Reference date for the Today / Yesterday banding. */
  now: Date;
  /** Open a transaction that still exists. */
  onOpen: (item: ExpenseItem) => void;
  /** Put a deleted transaction back. Given the full record from the snapshot. */
  onRestore: (item: ExpenseItem) => void;
  onExport: () => void;
  onClear: () => void;
}

export default function AuditTrail({
  entries, items, catLabel, cfmt, now, onOpen, onRestore, onExport, onClear,
}: Props) {
  const [filter, setFilter] = useState(emptyAuditFilter);
  const [pages, setPages] = useState(1);
  const [confirmClear, setConfirmClear] = useState(false);

  const byId = useMemo(() => new Map(items.map((e) => [e.id, e])), [items]);

  const visible = useMemo(
    () => filterAudit(entries, filter, catLabel),
    [entries, filter, catLabel],
  );
  // Keyed on the calendar day, not the `now` object: the page rebuilds `now` on
  // every render, so depending on its identity would mean this memo never hit.
  // Only the day the banding is computed against actually matters.
  const dayKey = ymdLocal(now);
  const days = useMemo(
    () => groupAuditByDay(visible, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `dayKey` is the meaningful part of `now`
    [visible, dayKey],
  );
  const shown = days.slice(0, pages * PAGE_SIZE);

  const toggleAction = (a: AuditAction) => {
    setPages(1);
    setFilter((f) => {
      const actions = new Set(f.actions);
      if (actions.has(a)) actions.delete(a);
      else actions.add(a);
      return { ...f, actions };
    });
  };

  const setQuery = (query: string) => {
    setPages(1);
    setFilter((f) => ({ ...f, query }));
  };

  if (entries.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <Icon name="clock" size={40} style={{ color: 'var(--ink3)', marginBottom: 12 }} />
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No changes recorded yet</div>
        <p className="note" style={{ maxWidth: 360, margin: '0 auto' }}>
          From now on, every transaction you add, edit or delete is recorded here with
          the time you made the change — so you can always see what happened to your
          numbers, and when.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <style>{AUDIT_STYLES}</style>

      <div className="au-head">
        <h2 className="au-title">Change history</h2>
        <span className="au-count">{entries.length}</span>
        <div className="au-actions">
          <button type="button" className="au-btn" onClick={onExport}>Export CSV</button>
          <button
            type="button"
            className="au-btn danger"
            aria-expanded={confirmClear}
            onClick={() => setConfirmClear((v) => !v)}
          >
            Clear
          </button>
        </div>
      </div>
      <p className="note" style={{ marginBottom: 12 }}>
        Every add, edit and delete you make, newest first, in your local time. This is a
        record of your changes — it never affects a total, and clearing it leaves your
        transactions untouched.
      </p>

      {confirmClear && (
        <div className="au-confirm" role="group" aria-label="Confirm clearing the change history">
          <span>
            Erase all {entries.length} recorded changes? Your transactions are not affected,
            but the history itself cannot be recovered.
          </span>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button type="button" className="au-btn" onClick={() => setConfirmClear(false)}>Cancel</button>
            <button
              type="button"
              className="au-btn danger"
              onClick={() => { onClear(); setConfirmClear(false); setPages(1); }}
            >
              Clear history
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="au-filters">
        <label className="fl" htmlFor="au-search">Search changes</label>
        <input
          id="au-search"
          className="fi"
          type="search"
          placeholder="Merchant, note or category…"
          value={filter.query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="au-chiprow" role="group" aria-label="Filter by change type">
          {FILTER_ORDER.map((a) => {
            const on = filter.actions.has(a);
            return (
              <button
                key={a}
                type="button"
                className={`au-chip${on ? ' on' : ''}`}
                aria-pressed={on}
                onClick={() => toggleAction(a)}
              >
                <Icon name={ACTION_STYLE[a].icon} size={13} style={{ color: ACTION_STYLE[a].color }} />
                {AUDIT_ACTION_LABEL[a]}
              </button>
            );
          })}
        </div>
      </div>

      {/* Result count, announced so a filter change is not silent for a
          screen-reader user — the list below it has no other summary. */}
      <p className="note au-result" role="status">
        {visible.length === entries.length
          ? `${entries.length} change${entries.length === 1 ? '' : 's'} recorded`
          : `${visible.length} of ${entries.length} changes`}
      </p>

      {visible.length === 0 ? (
        <p className="note" style={{ padding: '18px 2px' }}>
          No changes match that filter.
        </p>
      ) : (
        shown.map((day) => (
          <section key={day.key} className="au-day">
            <h3 className="au-dayhd">{day.label}</h3>
            <ul className="au-list">
              {groupAuditBatches(day.entries).map((g) => (
                <AuditRow
                  key={g.key}
                  group={g}
                  live={byId}
                  catLabel={catLabel}
                  cfmt={cfmt}
                  onOpen={onOpen}
                  onRestore={onRestore}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {shown.length < days.length && (
        <button type="button" className="au-more" onClick={() => setPages((p) => p + 1)}>
          Show earlier changes
        </button>
      )}

      {entries.length >= MAX_AUDIT_ENTRIES && (
        <p className="note au-cap">
          The most recent {MAX_AUDIT_ENTRIES} changes are kept — anything older has been
          dropped. Export the CSV to keep a longer record.
        </p>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Rows
   ═══════════════════════════════════════════════════════════════════════════ */

function AuditRow({
  group, live, catLabel, cfmt, onOpen, onRestore,
}: {
  group: AuditGroup;
  live: Map<string, ExpenseItem>;
  catLabel: (key: string) => string;
  cfmt: (n: number) => string;
  onOpen: (item: ExpenseItem) => void;
  onRestore: (item: ExpenseItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const { action, entries } = group;
  const style = ACTION_STYLE[action];

  /** Every deletion in this group that can still be put back. */
  const restorable = entries
    .map(restorableFrom)
    .filter((it): it is ExpenseItem => !!it && !live.has(it.id));

  // A batch is summarised, then itemised on demand.
  if (entries.length > 1) {
    const listId = `au-batch-${group.key}`;
    return (
      <li className="au-item">
        <button
          type="button"
          className="au-row au-row-btn"
          aria-expanded={open}
          aria-controls={listId}
          onClick={() => setOpen((v) => !v)}
        >
          <Badge action={action} />
          <span className="au-main">
            <span className="au-label">
              <b style={{ color: style.color }}>{AUDIT_ACTION_LABEL[action]}</b>{' '}
              {entries.length} transactions
            </span>
            <span className="au-sub">
              {fmtTime(group.ts)} · {cfmt(group.total)} in total · tap to {open ? 'hide' : 'see'} each one
            </span>
          </span>
          <span className="au-caret" aria-hidden="true" data-open={open || undefined}>
            <Icon name="arrow-up" size={14} />
          </span>
        </button>
        {restorable.length > 0 && (
          <div className="au-restore-row">
            <button
              type="button"
              className="au-restore"
              onClick={() => restorable.forEach(onRestore)}
            >
              <Icon name="refresh" size={13} aria-hidden="true" />
              Restore {restorable.length === entries.length ? 'all' : `${restorable.length}`}
            </button>
          </div>
        )}
        {open && (
          <ul className="au-sublist" id={listId}>
            {entries.map((e) => (
              <li key={e.id}>
                <EntryBody
                  entry={e} live={live} catLabel={catLabel} cfmt={cfmt}
                  onOpen={onOpen} onRestore={onRestore} nested
                />
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li className="au-item">
      <EntryBody
        entry={entries[0]} live={live} catLabel={catLabel} cfmt={cfmt}
        onOpen={onOpen} onRestore={onRestore}
      />
    </li>
  );
}

/**
 * One recorded change.
 *
 * Rendered as a button when the transaction still exists, so the history is a
 * way back to the row rather than a dead end; as plain markup when it does not,
 * because a control that cannot act is worse than no control.
 */
function EntryBody({
  entry, live, catLabel, cfmt, onOpen, onRestore, nested = false,
}: {
  entry: AuditEntry;
  live: Map<string, ExpenseItem>;
  catLabel: (key: string) => string;
  cfmt: (n: number) => string;
  onOpen: (item: ExpenseItem) => void;
  onRestore: (item: ExpenseItem) => void;
  nested?: boolean;
}) {
  const style = ACTION_STYLE[entry.action];
  const item = live.get(entry.txId);
  const name = entry.label || catLabel(entry.category);
  const when = fmtTime(entry.ts);
  // Offered only when the whole record was kept AND the row is really gone:
  // restoring over a live transaction would duplicate it, and a restore built
  // from the display fields alone would silently drop tags and notes.
  const revive = !item ? restorableFrom(entry) : null;

  const body = (
    <>
      {!nested && <Badge action={entry.action} />}
      <span className="au-main">
        <span className="au-label">
          <b style={{ color: style.color }}>{AUDIT_ACTION_LABEL[entry.action]}</b> {name}
        </span>
        <span className="au-sub">
          {when} · {catLabel(entry.category)} · dated {fmtDay(entry.date)}
          {item ? '' : ' · no longer in your transactions'}
        </span>
        {entry.changes && entry.changes.length > 0 && (
          <span className="au-diffs">
            {entry.changes.map((c) => (
              <span key={c.field} className="au-diff">
                <span className="au-diff-f">{AUDIT_FIELD_LABEL[c.field]}</span>
                <span className="au-diff-b">{fmtValue(c.field, c.before, catLabel, cfmt)}</span>
                <span aria-hidden="true">→</span>
                <span className="au-diff-a">{fmtValue(c.field, c.after, catLabel, cfmt)}</span>
              </span>
            ))}
          </span>
        )}
      </span>
      <span className="au-amt">{cfmt(entry.amount)}</span>
    </>
  );

  if (!item) {
    return (
      <>
        <div className={rowClass(nested)}>{body}</div>
        {/* Restore sits outside the row rather than inside it: the row is not a
            control here, and a button nested in a non-interactive block keeps
            the deleted entry readable while still offering the one action that
            makes sense for it. Batch groups render their own bulk Restore, so
            this is suppressed there to avoid offering the same thing twice. */}
        {revive && !nested && (
          <div className="au-restore-row">
            <button
              type="button"
              className="au-restore"
              onClick={() => onRestore(revive)}
              aria-label={`Restore ${name}, ${cfmt(entry.amount)}`}
            >
              <Icon name="refresh" size={13} aria-hidden="true" />
              Restore
            </button>
          </div>
        )}
      </>
    );
  }

  return (
    <button
      type="button"
      className={`${rowClass(nested)} au-row-btn`}
      onClick={() => onOpen(item)}
      aria-label={`${AUDIT_ACTION_LABEL[entry.action]} ${name}, ${cfmt(entry.amount)}, at ${when}. Open this transaction.`}
    >
      {body}
    </button>
  );
}

function rowClass(nested: boolean): string {
  return nested ? 'au-row au-row-nested' : 'au-row';
}

function Badge({ action }: { action: AuditAction }) {
  const { icon, color } = ACTION_STYLE[action];
  return (
    <span
      className="au-badge"
      style={{ color, background: `color-mix(in srgb, ${color} 13%, transparent)` }}
      aria-hidden="true"
    >
      <Icon name={icon} size={14} />
    </span>
  );
}

/* ── Formatting ── */

function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

/** `2026-08-12` → `12 Aug`. Parsed as a local day, never as a UTC instant. */
function fmtDay(d: string): string {
  const dt = new Date(d + 'T00:00:00');
  if (isNaN(dt.getTime())) return d || '—';
  return dt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/** Render a recorded field value the way the field is shown everywhere else. */
function fmtValue(
  field: AuditField,
  v: AuditValue,
  catLabel: (key: string) => string,
  cfmt: (n: number) => string,
): string {
  if (field === 'recurring') return v ? 'Yes' : 'No';
  if (v == null || v === '') return '—';
  if (field === 'amount') return cfmt(Number(v));
  if (field === 'category') return catLabel(String(v));
  if (field === 'date') return fmtDay(String(v));
  return String(v);
}

/* ── Styles ── */

const AUDIT_STYLES = `
.fx-tools .au-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:2px;}
.fx-tools .au-title{font-size:14px;font-weight:700;margin:0;letter-spacing:0;}
.fx-tools .au-count{font-size:11px;font-weight:700;padding:2px 8px;border-radius:980px;
  background:var(--fill-06);color:var(--ink2);}
.fx-tools .au-actions{display:flex;gap:6px;margin-left:auto;}
.fx-tools .au-btn{padding:6px 12px;border-radius:9px;border:1px solid var(--hair2);background:var(--card);color:var(--ink);
  font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;
  transition:background-color var(--ctl-trans),border-color var(--ctl-trans);}
.fx-tools .au-btn:hover{background:var(--fill-06);}
.fx-tools .au-btn.danger{color:var(--red);border-color:color-mix(in srgb,var(--red) 40%,transparent);}
.fx-tools .au-confirm{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding:11px 13px;
  border-radius:12px;font-size:12.5px;color:var(--ink2);line-height:1.5;
  background:color-mix(in srgb,var(--red) 7%,transparent);
  border:1px solid color-mix(in srgb,var(--red) 30%,transparent);}
.fx-tools .au-confirm > span{flex:1;min-width:200px;}

.fx-tools .au-filters{background:var(--well);border:1px solid var(--well-border);border-radius:14px;padding:12px 14px;margin-bottom:8px;}
.fx-tools .au-chiprow{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px;}
.fx-tools .au-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 11px;border-radius:980px;border:1px solid var(--hair2);
  background:var(--card);color:var(--ink2);font-size:12px;font-weight:600;font-family:inherit;cursor:pointer;
  transition:background-color var(--ctl-trans),border-color var(--ctl-trans),color var(--ctl-trans);}
.fx-tools .au-chip:hover{border-color:var(--ink3);}
.fx-tools .au-chip.on{border-color:var(--ink);background:var(--hair);color:var(--ink);}
.fx-tools .au-result{margin:0 2px 4px;}

.fx-tools .au-day{margin-top:6px;}
.fx-tools .au-dayhd{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--ink3);
  margin:0;padding:12px 2px 4px;position:sticky;top:0;z-index:1;
  background:linear-gradient(var(--card),var(--card) 70%,transparent);}
.fx-tools .au-list,.fx-tools .au-sublist{list-style:none;margin:0;padding:0;}
.fx-tools .au-item{border-bottom:1px solid var(--hair2);}
.fx-tools .au-item:last-child{border-bottom:none;}

.fx-tools .au-row{display:flex;align-items:flex-start;gap:11px;width:100%;padding:11px 6px;
  text-align:left;color:inherit;font:inherit;background:none;border:none;border-radius:10px;}
.fx-tools .au-row-btn{cursor:pointer;transition:background-color var(--ctl-trans);}
.fx-tools .au-row-btn:hover{background:var(--fill-04);}
.fx-tools .au-row-nested{padding:8px 6px 8px 40px;}
.fx-tools .au-sublist{border-top:1px solid var(--hair2);margin-left:6px;}
.fx-tools .au-sublist > li + li{border-top:1px solid var(--hair2);}

.fx-tools .au-badge{flex:0 0 28px;height:28px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;margin-top:1px;}
.fx-tools .au-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}
.fx-tools .au-label{font-size:13px;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fx-tools .au-sub{font-size:11.5px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.fx-tools .au-amt{font-size:13px;font-weight:700;flex-shrink:0;margin-top:1px;font-variant-numeric:tabular-nums;}
.fx-tools .au-caret{flex-shrink:0;color:var(--ink3);margin-top:2px;display:inline-flex;
  transform:rotate(180deg);transition:transform var(--ctl-trans);}
.fx-tools .au-caret[data-open]{transform:rotate(0deg);}

.fx-tools .au-restore-row{padding:0 6px 10px 45px;}
.fx-tools .au-restore{display:inline-flex;align-items:center;gap:6px;padding:5px 11px;border-radius:980px;
  border:1px solid color-mix(in srgb,var(--gold) 45%,transparent);background:color-mix(in srgb,var(--gold) 10%,transparent);
  color:var(--ink);font-size:11.5px;font-weight:600;font-family:inherit;cursor:pointer;
  transition:background-color var(--ctl-trans),border-color var(--ctl-trans);}
.fx-tools .au-restore:hover{background:color-mix(in srgb,var(--gold) 18%,transparent);border-color:var(--gold);}

.fx-tools .au-diffs{display:flex;flex-direction:column;gap:3px;margin-top:5px;}
.fx-tools .au-diff{display:flex;align-items:baseline;flex-wrap:wrap;gap:6px;font-size:11.5px;color:var(--ink3);}
.fx-tools .au-diff-f{font-weight:700;color:var(--ink2);min-width:74px;}
.fx-tools .au-diff-b{text-decoration:line-through;opacity:.75;}
.fx-tools .au-diff-a{color:var(--ink);font-weight:600;}

.fx-tools .au-more{display:block;width:100%;margin-top:12px;padding:10px;border-radius:11px;border:1px solid var(--hair2);
  background:var(--card);color:var(--ink2);font-size:12.5px;font-weight:600;font-family:inherit;cursor:pointer;
  transition:background-color var(--ctl-trans),color var(--ctl-trans);}
.fx-tools .au-more:hover{background:var(--fill-06);color:var(--ink);}
.fx-tools .au-cap{margin-top:12px;}

@media (max-width:480px){
  .fx-tools .au-row-nested{padding-left:16px;}
  .fx-tools .au-restore-row{padding-left:21px;}
  .fx-tools .au-diff-f{min-width:0;}
  /* The meta line carries the time, so it wraps rather than truncating — a
     change history that hides "when" on a phone has hidden the point. */
  .fx-tools .au-sub{white-space:normal;}
}
@media (prefers-reduced-motion:reduce){
  .fx-tools .au-btn,.fx-tools .au-chip,.fx-tools .au-row-btn,.fx-tools .au-more,.fx-tools .au-caret{transition:none;}
}
`;
