import { useRef, type CSSProperties } from 'react';
import { d, socketed, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import type { IntroArtProps, OutputProps, TourChapter } from '../types';

/**
 * Chapter: Reports — the month's saved budget and expense records, checked,
 * then exported as PDF, Excel or CSV on the device.
 *
 * ILLUSTRATIVE FIGURES ONLY. Spent, planned and the transaction count are
 * picked literals; the bars are hand-sized. Nothing is computed by, or
 * imported from, lib/reports or lib/reportsSmartReview.
 */
const EXAMPLE = {
  INR: { planned: 80000, spent: 52000, transactions: 42 },
  GENERIC: { planned: 5000, spent: 3250, transactions: 42 },
} as const;
const pick = (code: string) => (code === 'INR' ? EXAMPLE.INR : EXAMPLE.GENERIC);

/* ── Intro illustration: checked, then exported ─────────────────────── */

const CHECKS = ['Budget saved', 'Expenses recorded', 'No issues found'];
const CHECK_X = 204;
const checkY = (i: number) => 48 + i * 34;
const EXPORT_SOCKET = { x: 210, y: 208 };
const BARS = [
  { x: 40, h: 42 }, { x: 64, h: 64 }, { x: 88, h: 30 }, { x: 112, h: 52 }, { x: 136, h: 38 },
];
const FORMATS = ['PDF', 'Excel', 'CSV'];
const whole = (n: number) => String(Math.round(n));

export function ReportsArt({ clock, fmt, code }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  const ex = pick(code);
  const spent = useCountUp(clock, 900, 1100, ex.spent, fmt);
  const count = useCountUp(clock, 1000, 1000, ex.transactions, whole);
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      {/* The report itself: a page that fills in. */}
      <g className="wt-rise" style={d(60)}>
        <rect x={24} y={28} width={146} height={210} rx={14} className="wt-pill" />
        <text data-fit={118} x={38} y={54} className="wt-t-label">Monthly report</text>
        <text data-fit={118} x={38} y={71} className="tour-a-tiny">Budget and spending</text>
      </g>
      <line x1={36} x2={158} y1={150} y2={150} className="wt-axis wt-grow-x" style={d(300)} />
      {BARS.map((b, i) => (
        <rect key={b.x} x={b.x} y={150 - b.h} width={14} height={b.h} rx={3} className="wt-bar" style={d(420 + i * 90)} />
      ))}
      <g className="wt-fade" style={d(850)}>
        <text data-fit={118} x={38} y={174} className="tour-a-tiny">Spent of {fmt(ex.planned)}</text>
        <text ref={spent} data-fit={118} data-sample={fmt(ex.spent)} x={38} y={195} className="tour-a-val">{fmt(ex.spent)}</text>
        <text ref={count} data-fit={22} data-sample={String(ex.transactions)} x={38} y={222} className="wt-t-sub" style={{ fill: 'var(--ink)', fontWeight: 600 }}>{ex.transactions}</text>
        <text data-fit={94} x={60} y={222} className="wt-t-sub">transactions</text>
      </g>

      {/* Checked first: each line ticks as the orb passes over it. */}
      {CHECKS.map((label, i) => (
        <g key={label} className="wt-slide-in" style={d(380 + i * 380)}>
          <rect x={190} y={checkY(i) - 14} width={150} height={28} rx={14} className="wt-pill" />
          <circle cx={CHECK_X} cy={checkY(i)} r={7} className="wt-ok wt-pop" style={d(700 + i * 380)} />
          <path d={`M${CHECK_X - 3.5} ${checkY(i) + 0.3}l2.4 2.4 4.4-4.6`} className="wt-ok-check wt-fade" style={d(760 + i * 380)} />
          <text data-fit={112} x={218} y={checkY(i) + 4} className="wt-t-chip">{label}</text>
        </g>
      ))}

      {/* Then the format: one page, three ways out. */}
      {FORMATS.map((f, i) => (
        <g key={f} className="wt-pop" style={d(1700 + i * 120)}>
          <rect x={190 + i * 52} y={144} width={46} height={26} rx={13} className={i === 0 ? 'wt-pill wt-pill-gold' : 'wt-pill'} />
          <text data-fit={36} x={213 + i * 52} y={161} className="wt-t-chip" textAnchor="middle">{f}</text>
        </g>
      ))}

      <g className="wt-card-in" style={d(2150)}>
        <path d={socketed(190, 188, 150, 40, 14, EXPORT_SOCKET.x, EXPORT_SOCKET.y, 11)} fillRule="evenodd" className="wt-pill wt-pill-gold" />
        <text data-fit={104} x={228} y={212} className="wt-t-chip">Export selected (2)</text>
      </g>
      <text data-fit={150} x={190} y={252} className="wt-t-sub wt-fade" style={d(2500)}>Made on this device</text>
      <path
        d={`M${EXPORT_SOCKET.x} ${EXPORT_SOCKET.y - 5}v9m-4-4 4 4 4-4`}
        pathLength={1}
        className="wt-glyph wt-draw"
        style={{ ...d(2750), ['--dur' as string]: '420ms' } as CSSProperties}
      />
    </svg>
  );
}

/* ── "What good looks like" ─────────────────────────────────────────── */

function ReportsGood({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>Budget report</dt><dd>Ready</dd></div>
        <div><dt>Expense report</dt><dd>{ex.transactions} transactions</dd></div>
        <div><dt>Spent of {fmt(ex.planned)} planned</dt><dd>{fmt(ex.spent)}</dd></div>
      </dl>
      <span className="tour-out-chip">2 of 2 ready · no issues found · PDF saved</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const reports: TourChapter = {
  id: 'reports',
  title: 'Reports',
  route: '/tools/reports',
  tagline: 'Check a month’s records, then export them as PDF, Excel or CSV.',
  minutes: 2,
  icon: 'layers',
  intro: {
    eyebrow: 'Keep a record',
    headline: 'Your month, on paper.',
    body: 'Reports turn your saved budget and expenses into a file you can keep or share. Each one is checked first, built on your device, and matches its source tool exactly.',
    Art: ReportsArt,
    orb: [
      { at: 0, x: CHECK_X, y: checkY(0), s: 0.36 },
      { at: 1080, x: CHECK_X, y: checkY(1), s: 0.36 },
      { at: 1460, x: CHECK_X, y: checkY(2), s: 0.36 },
      { at: 2300, x: EXPORT_SOCKET.x, y: EXPORT_SOCKET.y, s: 0.54 },
    ],
    duration: 3200,
  },
  steps: [
    {
      id: 'head',
      target: '[data-tour="reports-head"]',
      title: 'Your records, ready to keep',
      body: 'Export your saved budget and expense records as CSV, Excel or PDF. Reports use the same calculations as their source tools, for exactly the month you pick.',
    },
    {
      id: 'months',
      target: '[data-tour="reports-months"]',
      title: 'Pick the month',
      body: 'Step between months with the arrows or chips. A report only ever uses that month’s own budget; another month is never swapped in.',
    },
    {
      id: 'prep',
      target: '[data-tour="reports-prep"]',
      title: 'Smart report preparation',
      body: 'How many reports are ready, what was found, and anything worth a look with a link to its source. It can also jump to the latest month that has both.',
    },
    {
      id: 'formats',
      target: '[data-tour="reports-formats"]',
      title: 'Which format, when',
      body: 'PDF for a readable summary, Excel for your own analysis, and CSV for importing into another tool.',
    },
    {
      id: 'list',
      target: '[data-tour="reports-list"]',
      title: 'Choose what to include',
      body: 'Each report says what it covers and whether it is ready. Tick the ones to include, or press Set up to create the one that is missing.',
    },
    {
      id: 'export',
      target: '[data-tour="reports-export"]',
      title: 'Export one report',
      body: 'Download a single report in the format you need. Every export is checked again just before it is made.',
      hint: 'Press Export to see the three formats.',
    },
    {
      id: 'export-all',
      target: '[data-tour="reports-export-all"]',
      title: 'Export them together',
      body: 'Every ticked report in one go, in the format you choose. The count shows how many are included.',
    },
    {
      id: 'empty',
      target: '[data-tour="reports-empty"]',
      title: 'No reports yet',
      body: 'Set up a budget or log some expenses, and your reports appear here ready to export.',
    },
    {
      id: 'method',
      target: '[data-tour="reports-method"]',
      title: 'How reports are built',
      body: 'Built on your device with the same calculators the tools use, so every figure matches its source tool.',
      hint: 'Open “How these reports are generated”.',
    },
    {
      id: 'privacy',
      target: '[data-tour="reports-privacy"]',
      title: 'Made on your device',
      body: 'Reports contain only what you entered and download straight to your device. Nothing is uploaded to make them.',
    },
    {
      id: 'good',
      target: '[data-tour="reports-prep"]',
      title: 'What good looks like',
      body: 'Both reports ready for a finished month, no issues flagged, and a PDF saved somewhere you can find it. This is an example, not your data.',
      output: ReportsGood,
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default reports;
