import { useEffect, useRef, useState } from 'react';
import { track } from '../../lib/analytics';

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
  label = 'Export',
  /**
   * Which surface the export came from, for analytics. Optional so existing
   * call sites keep working; when omitted the event still counts the export,
   * it just cannot attribute it.
   */
  source = 'unknown',
}: {
  onCsv: () => void;
  onXlsx: () => void | Promise<void>;
  onPdf: () => void | Promise<void>;
  label?: string;
  source?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const run = (kind: 'csv' | 'xlsx' | 'pdf', fn: () => void | Promise<void>) => async () => {
    setOpen(false);
    let ok = true;
    try {
      setBusy(true);
      await fn();
    } catch (err) {
      // A failed export is the interesting half of this metric: these formats
      // are produced by lazily loaded generators (jsPDF, xlsx) that can fail to
      // load on a poor connection, and the user simply sees nothing download.
      ok = false;
      throw err;
    } finally {
      setBusy(false);
      track('report_exported', { kind, where: source, ok });
    }
  };

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        type="button"
        className="btn btn-ghost btn-sm"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
      >
        {busy ? 'Exporting…' : `${label} ▾`}
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', minWidth: 168, zIndex: 40,
            background: 'var(--card-solid)', border: '1px solid var(--hair)', borderRadius: 12,
            boxShadow: 'var(--shadow)', overflow: 'hidden', padding: 4,
          }}
        >
          <MenuItem onClick={run('csv', onCsv)}>Download CSV</MenuItem>
          <MenuItem onClick={run('xlsx', onXlsx)}>Download Excel (.xlsx)</MenuItem>
          <MenuItem onClick={run('pdf', onPdf)}>Download PDF</MenuItem>
        </div>
      )}
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
