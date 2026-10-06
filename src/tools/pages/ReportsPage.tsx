import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { PageHead, ToolFoot, MethodologyNote } from '../ui/common';
import { Icon } from '../ui/Icon';
import { ExportMenu } from '../ui/ExportMenu';
import { MonthNav } from '../ui/MonthNav';
import { useToast } from '../ui/Toast';
import { onLocalWrite } from '../lib/storage';
import { currentMonth, monthLabel } from '../lib/month';
import { type ExportFormat, type ReportId } from '../lib/reports';
import { exportReviewedReports, readReportReview, reportPeriods } from '../lib/reportsSmartReview';

export default function ReportsPage() {
  const { notify } = useToast();
  const [revision, setRevision] = useState(0);
  const [selMonth, setSelMonth] = useState(currentMonth());
  const [selected, setSelected] = useState<ReportId[]>(['budget', 'expenses']);
  useEffect(() => {
    const relevant = (key: string | null) => key === null || key === 'fx_expenses' || key === 'fx_currency' || key.startsWith('fx_bb_');
    const off = onLocalWrite((key) => { if (relevant(key)) setRevision((value) => value + 1); });
    const refresh = (event: StorageEvent) => { if (relevant(event.key)) setRevision((value) => value + 1); };
    window.addEventListener('storage', refresh);
    return () => { off(); window.removeEventListener('storage', refresh); };
  }, []);

  const { review, periods } = useMemo(() => ({ review: readReportReview(selMonth), periods: reportPeriods(), revision }), [selMonth, revision]);
  const { reports } = review;
  const { months, latestComplete } = periods;
  const availableCount = reports.filter((r) => r.available).length;
  const anyAvailable = availableCount > 0;
  const selectedCount = reports.filter((r) => r.available && selected.includes(r.id)).length;

  const doExport = (id: ReportId, format: ExportFormat, title: string) => async () => {
    try {
      const ok = await exportReviewedReports(readReportReview(selMonth), [id], format);
      if (ok) notify(`${title} exported (${format.toUpperCase()})`, 'ok');
      return ok > 0;
    } catch {
      notify(`Couldn't generate ${title.toLowerCase()}. Please try again.`, 'error');
      return false;
    }
  };

  const doExportAll = (format: ExportFormat) => async () => {
    try {
      const n = await exportReviewedReports(readReportReview(selMonth), selected, format);
      if (n > 0) notify(`Exported ${n} report${n === 1 ? '' : 's'} (${format.toUpperCase()})`, 'ok');
      return n > 0;
    } catch {
      notify("Couldn't export reports. Please try again.", 'error');
      return false;
    }
  };

  return (
    <div className="fx-page">
      <PageHead chip="Reports" chipColor="var(--gold)" chipBg="rgba(212,175,55,.1)" icon="layers" title="Your finances, ready to share.">
        Export your saved budget and expense records to CSV, Excel or PDF.
        Reports use the same calculations as their source tools and the exact month you select.
      </PageHead>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <MonthNav activeMonth={selMonth} months={months} onSwitch={setSelMonth} pastNote="Viewing past month" pastColor="var(--gold)" />
        </div>
        {selectedCount > 0 && (
          <ExportMenu
            source="reports-all"
            label={`Export selected (${selectedCount})`}
            onCsv={doExportAll('csv')}
            onXlsx={doExportAll('xlsx')}
            onPdf={doExportAll('pdf')}
          />
        )}
      </div>

      {/* The same facts as before, as a checklist rather than a paragraph:
          status first, one line per finding, then what each format is for. */}
      <section className="card fx-report-prep" aria-label="Smart report preparation">
        <div className="fx-report-prep-head">
          <h2>Smart report preparation</h2>
          <span className={`pill ${availableCount === 2 ? 'pill-ok' : 'pill-mute'}`}>{availableCount} of 2 reports ready for {monthLabel(selMonth)}</span>
        </div>
        {latestComplete && latestComplete !== selMonth && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelMonth(latestComplete)}>Use latest month with both sources: {monthLabel(latestComplete)}</button>}
        <ul className="fx-checklist">
          {review.transactionCount > 0 && <li className="is-ok">{review.transactionCount} transactions dated {review.firstDate} to {review.lastDate}. This is recorded activity; missing days do not prove there was no spending.</li>}
          {review.budget && <li className="is-ok">Budget preview: {review.budget.currency} {review.budget.spent.toLocaleString()} allocated; {review.budget.free.toLocaleString()} left from recorded income.</li>}
          {review.checks.length > 0
            ? review.checks.map((check) => <li key={check.message} className="is-warn">{check.message}{' '}<Link to={check.href}>Review source</Link></li>)
            : <li className={anyAvailable ? 'is-ok' : 'is-none'}>{anyAvailable ? 'No issues found in the available saved amounts, dates and budget split. Completeness still depends on what you entered.' : 'Save a budget or transactions for this month to prepare a report.'}</li>}
        </ul>
        <div className="fx-format-grid" aria-label="What each format is for">
          <div><b>PDF</b><span>A readable summary</span></div>
          <div><b>Excel</b><span>For analysis</span></div>
          <div><b>CSV</b><span>For another tool</span></div>
        </div>
        <p className="note">Readiness updates as your saved data changes. Every export is checked again before it is generated.</p>
      </section>

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
                  <>
                  <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, minHeight: 44 }}>
                    <input type="checkbox" checked={selected.includes(r.id)} onChange={() => setSelected((ids) => ids.includes(r.id) ? ids.filter((id) => id !== r.id) : [...ids, r.id])} />
                    Include {r.title.toLowerCase()}
                  </label>
                  <ExportMenu
                    source="reports-single"
                    label="Export"
                    onCsv={doExport(r.id, 'csv', r.title)}
                    onXlsx={doExport(r.id, 'xlsx', r.title)}
                    onPdf={doExport(r.id, 'pdf', r.title)}
                  />
                  </>
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
        its source tool. A budget from another month is never substituted. Generation happens entirely
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
