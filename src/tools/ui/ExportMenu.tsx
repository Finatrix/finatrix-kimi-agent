import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { track } from '../../lib/analytics';

type ExportAction = () => void | boolean | Promise<void | boolean>;

/**
 * Small "Export ▾" menu offering CSV / Excel / PDF.
 *
 * Also the single place `report_exported` is emitted. Four pages render this
 * component (reports ×2, budget, expenses); instrumenting each of their handlers
 * instead would be four chances to forget one, and an export metric that is
 * quietly missing a surface is worse than none — it reads as a real number.
 */
export function ExportMenu({
  onCsv,
  onXlsx,
  onPdf,
  onJson,
  label = 'Export',
  /**
   * Which surface the export came from, for analytics. Optional so existing
   * call sites keep working; when omitted the event still counts the export,
   * it just cannot attribute it.
   */
  source = 'unknown',
}: {
  onCsv: ExportAction;
  onXlsx: ExportAction;
  onPdf: ExportAction;
  /**
   * Optional fourth format. Careers exports raw JSON alongside the three
   * spreadsheet/report formats; the finance tools do not, so the row only
   * renders where a handler is supplied.
   */
  onJson?: ExportAction;
  label?: string;
  source?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const running = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      triggerRef.current?.focus();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (kind: 'csv' | 'xlsx' | 'pdf' | 'json', fn: ExportAction) => async () => {
    if (running.current) return;
    running.current = true;
    setOpen(false);
    setError(null);
    let ok = true;
    let canceled = false;
    try {
      setBusy(true);
      canceled = await fn() === false;
    } catch {
      // A failed export is the interesting half of this metric: these formats
      // are produced by lazily loaded generators (jsPDF, xlsx) that can fail to
      // load on a poor connection, and the user simply sees nothing download.
      ok = false;
      setError('The export could not be created. Please try again.');
    } finally {
      running.current = false;
      setBusy(false);
      requestAnimationFrame(() => triggerRef.current?.focus());
      if (!canceled) track('report_exported', { kind, where: source, ok });
    }
  };

  const focusItem = (edge: 'first' | 'last') => {
    const items = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
    items?.[edge === 'first' ? 0 : items.length - 1]?.focus();
  };

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
    if (!items.length) return;
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      focusItem(event.key === 'Home' ? 'first' : 'last');
    } else if (event.key === 'Tab') {
      // Restore the trigger before the browser advances to the next control.
      triggerRef.current?.focus();
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        ref={triggerRef}
        type="button"
        className="btn btn-ghost btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
          event.preventDefault();
          const edge = event.key === 'ArrowUp' ? 'last' : 'first';
          setOpen(true);
          requestAnimationFrame(() => focusItem(edge));
        }}
      >
        {busy ? 'Exporting…' : `${label} ▾`}
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`${label} formats`}
          onKeyDown={onMenuKeyDown}
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 168, zIndex: 40,
            background: 'var(--card-solid)', border: '1px solid var(--hair)', borderRadius: 12,
            boxShadow: 'var(--shadow)', overflow: 'hidden', padding: 4,
          }}
        >
          <MenuItem onClick={run('csv', onCsv)}>Download CSV</MenuItem>
          <MenuItem onClick={run('xlsx', onXlsx)}>Download Excel (.xlsx)</MenuItem>
          <MenuItem onClick={run('pdf', onPdf)}>Download PDF</MenuItem>
          {onJson && <MenuItem onClick={run('json', onJson)}>Download JSON</MenuItem>}
        </div>
      )}
      {error && <p className="note" role="alert">{error}</p>}
    </div>
  );
}

function MenuItem({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 8,
        background: 'transparent', border: 'none', color: 'var(--ink)', fontSize: 13, cursor: 'pointer',
        fontFamily: 'inherit',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,.06)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
    >
      {children}
    </button>
  );
}
