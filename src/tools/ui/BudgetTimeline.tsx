import { useEffect, useMemo, useRef, useState } from 'react';
import Chart from 'chart.js/auto';
import { getChartTheme } from '../lib/chartTheme';
import { Icon } from './Icon';
import { AskAiButton } from './AskAiButton';
import { monthLabel } from '../lib/month';
import {
  computeTimeline, GRANULARITIES,
  type Granularity, type Timeline, type BudgetLookup,
} from '../lib/budgetTimeline';
import type { ExpenseItem } from '../lib/expense';

/**
 * Budget timeline — spending progression against the plan.
 *
 * Three lines, and each answers a different question:
 *   Spent      what has actually happened
 *   Budget     the even pace that finishes the period exactly on budget
 *   Projected  where today's rate lands you, drawn only across the days that
 *              have not happened yet
 *
 * Periods of unusually high spending are marked on the line *and* named in text
 * underneath, because a red dot on a canvas is invisible to anyone reading the
 * page with a screen reader — and a chart is the only place this information
 * appears.
 */

const GRANULARITY_LABEL: Record<Granularity, string> = {
  daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly',
};

const COLOR = {
  spent: '#E8833D',
  budget: '#0071e3',
  projected: '#9A9A94',
  anomaly: '#FF5A52',
};

export interface BudgetTimelineProps {
  items: ExpenseItem[];
  /** The month the daily/weekly views cover, and the last month of the yearly view. */
  month: string;
  /** Total budget for any given month — see lib/budgetTimeline.ts. */
  budgetOf: BudgetLookup;
  cfmt: (n: number) => string;
  /** Currency code; a change rebuilds the chart so axis labels reformat. */
  code: string;
  theme: string | undefined;
  now: Date;
}

export function BudgetTimeline({ items, month, budgetOf, cfmt, code, theme, now }: BudgetTimelineProps) {
  const [granularity, setGranularity] = useState<Granularity>('weekly');

  const timeline = useMemo(
    () => computeTimeline(items, month, granularity, budgetOf, now),
    [items, month, granularity, budgetOf, now],
  );

  const anomalies = timeline.points.filter((p) => p.isAnomaly);

  return (
    <div className="card">
      <style>{TIMELINE_STYLES}</style>

      <div className="bb-cardhd">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="bb-cardtitle">Budget timeline</span>
            <AskAiButton focus={{ kind: 'timeline', granularity }} />
          </div>
          <p className="note" style={{ marginTop: 3, marginBottom: 0 }}>
            {granularity === 'monthly'
              ? 'Cumulative spending across the last 12 months.'
              : `How ${monthLabel(month)} is adding up against your plan.`}
          </p>
        </div>
        <div className="fx-seg" role="group" aria-label="Timeline detail">
          {GRANULARITIES.map((g) => (
            <button
              key={g}
              type="button"
              className={granularity === g ? 'on' : ''}
              aria-pressed={granularity === g}
              onClick={() => setGranularity(g)}
            >
              {GRANULARITY_LABEL[g]}
            </button>
          ))}
        </div>
      </div>

      <TimelineChart timeline={timeline} cfmt={cfmt} code={code} theme={theme} />

      <div className="fx-tl-legend">
        <LegendKey color={COLOR.spent} label="Spent" />
        {timeline.totalBudget > 0 && <LegendKey color={COLOR.budget} label="Budget pace" dashed />}
        {timeline.inProgress && <LegendKey color={COLOR.projected} label="Projected" dashed />}
      </div>

      {/* The pacing verdict in words. A cumulative chart is easy to misread at a
          glance; this states the conclusion the chart is evidence for. */}
      {timeline.totalBudget > 0 && <PacingNote timeline={timeline} cfmt={cfmt} />}

      {anomalies.length > 0 && (
        <div className="fx-tl-anom">
          <Icon name="warn" size={14} style={{ color: COLOR.anomaly, flexShrink: 0 }} />
          <span>
            Unusually high spending in{' '}
            <b>{anomalies.map((p) => p.label).join(', ')}</b>
            {' — '}
            {anomalies.length === 1 ? 'this period is' : 'these periods are'} well above your
            {' '}usual pace for this timeline.
          </span>
        </div>
      )}
    </div>
  );
}

function LegendKey({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="fx-tl-key">
      <span
        className="fx-tl-swatch"
        aria-hidden="true"
        style={dashed
          ? { background: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 7px)` }
          : { background: color }}
      />
      {label}
    </span>
  );
}

function PacingNote({ timeline, cfmt }: { timeline: Timeline; cfmt: (n: number) => string }) {
  const last = timeline.points.filter((p) => !p.isFuture).at(-1);
  if (!last || last.budgetLine == null) return null;

  const ahead = last.cumulative - last.budgetLine;
  // On the final day there is nothing left to project: the forecast collapses
  // onto the actual, and "at this rate you'd finish…" would just restate the
  // sentence before it.
  const hasFuture = timeline.points.some((p) => p.isFuture);
  const projected = hasFuture ? timeline.projectedTotal : null;
  const overBy = projected != null ? projected - timeline.totalBudget : null;

  return (
    <p className="note fx-tl-note">
      {Math.abs(ahead) < 1
        ? 'Exactly on pace so far.'
        : ahead > 0
          ? <>You're <b style={{ color: 'var(--orange)' }}>{cfmt(ahead)} ahead</b> of an even pace.</>
          : <>You're <b style={{ color: 'var(--green)' }}>{cfmt(-ahead)} behind</b> an even pace — comfortably placed.</>}
      {overBy != null && timeline.totalBudget > 0 && (
        overBy > 0
          ? <> At this rate you'd finish about {cfmt(overBy)} over budget.</>
          : <> At this rate you'd finish about {cfmt(-overBy)} under budget.</>
      )}
    </p>
  );
}

/* ── Chart ── */

function TimelineChart({ timeline, cfmt, code, theme }: {
  timeline: Timeline; cfmt: (n: number) => string; code: string; theme: string | undefined;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  // `cfmt` is rebuilt on every CurrencyProvider render, so putting it in the
  // chart effect's deps would tear down and re-create the chart continuously.
  // The tooltip callbacks read it through a ref instead; the currency `code` is
  // what actually changes the formatting, and that IS in the deps.
  const fmtRef = useRef(cfmt);
  useEffect(() => { fmtRef.current = cfmt; });

  const { points, totalBudget, inProgress } = timeline;

  const datasets = useMemo(() => {
    const labels = points.map((p) => p.label);
    // Actual stops at today: drawing a flat cumulative line across days that
    // have not happened would read as "spent nothing", not "not yet".
    const spent = points.map((p) => (p.isFuture ? null : p.cumulative));
    const budget = totalBudget > 0 ? points.map((p) => p.budgetLine) : null;
    const projected = inProgress ? points.map((p) => p.projected) : null;
    return { labels, spent, budget, projected };
  }, [points, totalBudget, inProgress]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let ctx: CanvasRenderingContext2D | null = null;
    try { ctx = el.getContext('2d'); } catch { ctx = null; }
    if (!ctx) return;

    const ct = getChartTheme(theme === 'light' ? 'light' : 'dark');
    const anomalyFlags = points.map((p) => p.isAnomaly);

    chartRef.current = new Chart(el, {
      type: 'line',
      data: {
        labels: datasets.labels,
        datasets: [
          {
            label: 'Spent',
            data: datasets.spent,
            borderColor: COLOR.spent,
            backgroundColor: 'rgba(232,131,61,0.14)',
            borderWidth: 2,
            fill: true,
            tension: 0.25,
            spanGaps: false,
            // A spike gets a bigger, red point so the eye lands on it directly.
            pointRadius: (c) => (anomalyFlags[c.dataIndex] ? 5 : 0),
            pointHoverRadius: 5,
            pointBackgroundColor: (c) => (anomalyFlags[c.dataIndex] ? COLOR.anomaly : COLOR.spent),
            pointBorderColor: (c) => (anomalyFlags[c.dataIndex] ? COLOR.anomaly : COLOR.spent),
            order: 1,
          },
          ...(datasets.budget ? [{
            label: 'Budget pace',
            data: datasets.budget,
            borderColor: COLOR.budget,
            borderWidth: 1.8,
            borderDash: [6, 4],
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0,
            order: 2,
          }] : []),
          ...(datasets.projected ? [{
            label: 'Projected',
            data: datasets.projected,
            borderColor: COLOR.projected,
            borderWidth: 1.8,
            borderDash: [2, 4],
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0.25,
            order: 3,
          }] : []),
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 450 },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: ct.tooltipBg,
            borderColor: ct.tooltipBorder,
            borderWidth: 1,
            titleColor: ct.tooltipTitle,
            bodyColor: ct.tooltipBody,
            padding: 10,
            callbacks: {
              title: (c) => points[c[0].dataIndex]?.fullLabel ?? '',
              label: (c) => ` ${c.dataset.label}: ${fmtRef.current(Number(c.raw))}`,
              afterBody: (c) => {
                const p = points[c[0].dataIndex];
                if (!p || p.isFuture) return '';
                const lines = [
                  `This period: ${fmtRef.current(p.spent)} · ${p.txCount} transaction${p.txCount === 1 ? '' : 's'}`,
                ];
                if (p.cumulativePct != null) lines.push(`${Math.round(p.cumulativePct)}% of budget used`);
                if (p.isAnomaly) lines.push('Unusually high for this timeline');
                return lines;
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: ct.tick, font: { size: 10 }, maxRotation: 0, autoSkipPadding: 14 }, grid: { display: false } },
          y: {
            beginAtZero: true,
            ticks: { color: ct.tick, font: { size: 10 }, callback: (v) => fmtRef.current(v as number) },
            grid: { color: ct.grid },
          },
        },
      },
    });
    return () => { chartRef.current?.destroy(); chartRef.current = null; };
    // Rebuilt (not mutated) when the shape of the chart changes: adding or
    // removing the budget/projection series changes the dataset list itself.
  }, [code, theme, datasets, points]);

  // Text alternative, built from the same points the canvas is drawn from, so
  // the two can never describe different numbers (WCAG 1.1.1).
  const summary = useMemo(() => {
    const done = points.filter((p) => !p.isFuture);
    if (done.length === 0) return 'Budget timeline. Nothing has been spent in this period yet.';
    const series = done
      .map((p) => `${p.label} ${cfmt(p.cumulative)}${p.isAnomaly ? ' (unusually high)' : ''}`)
      .join(', ');
    const pace = totalBudget > 0 ? ` Budget for the period is ${cfmt(totalBudget)}.` : '';
    return `Line chart of cumulative spending: ${series}.${pace}`;
  }, [points, cfmt, totalBudget]);

  return (
    <div className="fx-tl-canvas">
      <canvas ref={ref} role="img" aria-label={summary} />
    </div>
  );
}

const TIMELINE_STYLES = `
/* Header row is .bb-cardhd (tools.css) — same object as every other card head. */
.fx-tools .fx-tl-canvas{position:relative;height:230px;}
@media(max-width:520px){.fx-tools .fx-tl-canvas{height:190px;}}
.fx-tools .fx-tl-legend{display:flex;gap:14px;flex-wrap:wrap;margin-top:12px;}
.fx-tools .fx-tl-key{display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--ink2);font-weight:600;}
.fx-tools .fx-tl-swatch{width:16px;height:3px;border-radius:2px;display:inline-block;}
.fx-tools .fx-tl-note{margin-top:10px;margin-bottom:0;line-height:1.55;}
.fx-tools .fx-tl-anom{display:flex;align-items:flex-start;gap:9px;margin-top:12px;padding:10px 12px;border-radius:11px;
  background:color-mix(in srgb,var(--red) 7%,transparent);border:1px solid color-mix(in srgb,var(--red) 22%,transparent);
  font-size:12px;color:var(--ink2);line-height:1.5;}
`;
