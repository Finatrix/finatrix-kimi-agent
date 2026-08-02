import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PageHead, ToolFoot, MethodologyNote } from '../ui/common';
import { Icon } from '../ui/Icon';
import { ExportMenu } from '../ui/ExportMenu';
import { MonthNav } from '../ui/MonthNav';
import { useToast } from '../ui/Toast';
import { getJSON } from '../lib/storage';
import { currentMonth } from '../lib/month';
import { loadExpenses, etMonthsWithData } from '../lib/expense';
import type { BudgetStore } from '../lib/budget';
import {
  listReports, exportReport, exportAllReports, hasAnyReport,
  type ExportFormat, type ReportId,
} from '../lib/reports';

/** Months (newest first) that have any expense or budget data saved. */
function useAvailableMonths(): string[] {
  return useMemo(() => {
    const set = new Set<string>();
    try { etMonthsWithData(loadExpenses(), currentMonth()).forEach((m) => set.add(m)); } catch { /* ignore */ }
    try { Object.keys(getJSON<BudgetStore>('fx_bb_data', {})).forEach((m) => set.add(m)); } catch { /* ignore */ }
    set.add(currentMonth());
    return Array.from(set).sort().reverse();
  }, []);
}

export default function ReportsPage() {
  const { notify } = useToast();
  const months = useAvailableMonths();
  const [selMonth, setSelMonth] = useState(currentMonth());

  const reports = useMemo(() => listReports(selMonth), [selMonth]);
  const anyAvailable = useMemo(() => hasAnyReport(selMonth), [selMonth]);
  const availableCount = reports.filter((r) => r.available).length;

  const doExport = (id: ReportId, format: ExportFormat, title: string) => async () => {
    try {
      const ok = await exportReport(id, format, selMonth);
      notify(ok ? `${title} downloaded (${format.toUpperCase()})` : `No data for ${title.toLowerCase()} yet`, ok ? 'ok' : 'info');
    } catch {
      notify(`Couldn't generate ${title.toLowerCase()}. Please try again.`, 'error');
    }
  };

  const doExportAll = (format: ExportFormat) => async () => {
    try {
      const n = await exportAllReports(format, selMonth);
      notify(n > 0 ? `Exported ${n} report${n === 1 ? '' : 's'} (${format.toUpperCase()})` : 'No reports available to export yet', n > 0 ? 'ok' : 'info');
    } catch {
      notify("Couldn't export reports. Please try again.", 'error');
    }
  };

  return (
    <div className="fx-page">
      <PageHead chip="Reports" chipColor="var(--gold)" chipBg="rgba(212,175,55,.1)" icon="layers" title="Your finances, ready to share.">
        Generate branded, on-brand reports from your own data — export any tool to CSV, Excel or PDF.
        Every figure matches its tool to the rupee; nothing here is estimated or invented.
      </PageHead>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <MonthNav activeMonth={selMonth} months={months} onSwitch={setSelMonth} pastNote="Viewing past month" pastColor="var(--gold)" />
        </div>
        {availableCount > 0 && (
          <ExportMenu
            source="reports-all"
            label={`Export all (${availableCount})`}
            onCsv={doExportAll('csv')}
            onXlsx={doExportAll('xlsx')}
            onPdf={doExportAll('pdf')}
          />
        )}
      </div>

      {!anyAvailable ? (
        <div className="card" style={{ textAlign: 'center', padding: '40px 20px' }}>
          <Icon name="layers" size={40} style={{ color: 'var(--ink3)', marginBottom: 12 }} />
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>No reports yet</div>
          <p className="note" style={{ maxWidth: 360, margin: '0 auto 16px' }}>
            Set up a budget or log some expenses, and your reports will appear here — ready to export in one tap.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/tools/budget" className="btn btn-sm" style={{ textDecoration: 'none' }}>Build a budget</Link>
            <Link to="/tools/expenses" className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>Track expenses</Link>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 12 }}>
          {reports.map((r) => (
            <div key={r.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
              <div
                aria-hidden="true"
                style={{
                  width: 42, height: 42, borderRadius: 12, flexShrink: 0, display: 'grid', placeItems: 'center',
                  background: `color-mix(in srgb, ${r.accent} 14%, transparent)`, color: r.accent,
                }}
              >
                <Icon name={r.id === 'budget' ? 'budget' : 'expense'} size={20} />
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>{r.title}</div>
                <div className="note" style={{ fontSize: 12, marginTop: 2 }}>{r.desc}</div>
                <div style={{ fontSize: 12, marginTop: 6, color: r.available ? 'var(--ink2)' : 'var(--ink3)' }}>
                  {r.available ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <Icon name="check" size={13} style={{ color: 'var(--green)' }} />{r.detail}
                    </span>
                  ) : r.detail}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {r.available ? (
                  <ExportMenu
                    source="reports-single"
                    label="Export"
                    onCsv={doExport(r.id, 'csv', r.title)}
                    onXlsx={doExport(r.id, 'xlsx', r.title)}
                    onPdf={doExport(r.id, 'pdf', r.title)}
                  />
                ) : (
                  <Link to={r.href} className="btn btn-ghost btn-sm" style={{ textDecoration: 'none' }}>Set up</Link>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <MethodologyNote summary="How these reports are generated">
        Reports are built from your saved tool state using the exact same calculators the tools use —
        <b> computeBudget</b> for budgets and <b>computeDashboard</b> for expenses — so every figure matches
        its tool to the rupee. Nothing is estimated, averaged or invented, and generation happens entirely
        on your device.
      </MethodologyNote>

      <div className="card" style={{ marginTop: 4, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <Icon name="shield" size={18} style={{ color: 'var(--gold)', flexShrink: 0, marginTop: 1 }} />
        <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.6 }}>
          Reports are generated on your device from data you entered. They contain only your own information and are
          never uploaded to create them. Files download straight to your device.
        </div>
      </div>

      <ToolFoot>
        Educational tools — not financial advice · <a href="/privacy" target="_top">Privacy</a> ·{' '}
        <a href="/terms" target="_top">Terms</a> · Built with care by <b>FinatriX</b>
      </ToolFoot>
    </div>
  );
}
