import { useEffect, useRef, useState } from 'react';

/** Small "Export ▾" menu offering CSV / Excel / PDF. */
export function ExportMenu({
  onCsv,
  onXlsx,
  onPdf,
  label = 'Export',
}: {
  onCsv: () => void;
  onXlsx: () => void | Promise<void>;
  onPdf: () => void | Promise<void>;
  label?: string;
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

  const run = (fn: () => void | Promise<void>) => async () => {
    setOpen(false);
    try {
      setBusy(true);
      await fn();
    } finally {
      setBusy(false);
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
          <MenuItem onClick={run(onCsv)}>Download CSV</MenuItem>
          <MenuItem onClick={run(onXlsx)}>Download Excel (.xlsx)</MenuItem>
          <MenuItem onClick={run(onPdf)}>Download PDF</MenuItem>
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
