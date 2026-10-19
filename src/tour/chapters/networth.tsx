import { useEffect, useRef, type CSSProperties } from 'react';
import { d, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import { easeInOutCubic } from '../../walkthrough/motion';
import type { IntroArtProps, OutputProps, TourChapter, TourHookContext } from '../types';

/**
 * Chapter: Net Worth — what you own minus what you owe, recorded month by
 * month, with a smart review of which balances to check next.
 *
 * ILLUSTRATIVE FIGURES ONLY. Own, owe and net are picked literals (net is
 * written out, not subtracted here), and the trend is a hand-drawn shape.
 * Nothing is computed by, or imported from, lib/netWorth.
 */
const EXAMPLE = {
  INR: { own: 2850000, owe: 950000, net: 1900000, change: 42000 },
  GENERIC: { own: 190000, owe: 62000, net: 128000, change: 2800 },
} as const;
const pick = (code: string) => (code === 'INR' ? EXAMPLE.INR : EXAMPLE.GENERIC);

/* ── The add form opens on demand ───────────────────────────────────────
 * "Add an account" shows the form; the add step presses it for the reader and,
 * if the tour was what opened it, closes it again on the way out. Cancel only
 * hides the form, so anything typed during "Try it" is kept for later. */
const ADD = '[data-tour="networth-add"]';
const FORM = '[data-tour="networth-add-form"]';
let formOpenedByTour = false;

function openAddForm({ query, click }: TourHookContext): void {
  if (query(FORM)) return;
  formOpenedByTour = click(ADD);
}

function closeAddForm({ click }: TourHookContext): void {
  if (formOpenedByTour) click(`${FORM} .nw-actions .btn-ghost`);
  formOpenedByTour = false;
}

/* ── Intro illustration: own, minus owe, month after month ──────────── */

const TREND = [[30, 214], [90, 204], [150, 208], [210, 186], [270, 170], [330, 146]] as const;
const TREND_PATH = `M${TREND.map(([x, y]) => `${x} ${y}`).join(' L')}`;
const LINE_AT = 1250;
const LINE_DUR = 1300;
const LAST = TREND[TREND.length - 1];

export function NetWorthArt({ clock, orb, fmt, code }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  useFitSvgText(svgRef);
  const ex = pick(code);
  const own = useCountUp(clock, 250, 1000, ex.own, fmt);
  const owe = useCountUp(clock, 450, 1000, ex.owe, fmt);
  const net = useCountUp(clock, 2500, 1100, ex.net, fmt);

  // The orb walks the months: it rides the line's tip as it draws, then rests
  // on this month's point.
  useEffect(() => {
    const path = lineRef.current;
    let len = 0;
    try { len = path?.getTotalLength() ?? 0; } catch { len = 0; }
    if (!path || !len) {
      clock.at(LINE_AT, () => orb.move({ at: 0, x: LAST[0], y: LAST[1], s: 0.46 }));
      return;
    }
    clock.tween(LINE_AT, LINE_DUR, (p) => {
      const pt = path.getPointAtLength(p * len);
      orb.ride(pt.x, pt.y, 0.34 + 0.1 * p);
    }, easeInOutCubic);
    clock.at(LINE_AT + LINE_DUR + 20, () => orb.move({ at: 0, x: LAST[0], y: LAST[1], s: 0.46 }));
  }, [clock, orb]);

  const oweShare = ex.owe / ex.own; // a ratio of two literals, for the bar's length only
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      <g className="wt-rise" style={d(60)}>
        <rect x={20} y={28} width={146} height={50} rx={14} className="wt-pill" />
        <text data-fit={118} x={34} y={46} className="tour-a-tiny">You own</text>
        <text ref={own} data-fit={120} data-sample={fmt(ex.own)} x={34} y={67} className="tour-a-val">{fmt(ex.own)}</text>
      </g>
      <text x={180} y={58} className="wt-t-label wt-fade" style={d(300)} textAnchor="middle">−</text>
      <g className="wt-rise" style={d(220)}>
        <rect x={194} y={28} width={146} height={50} rx={14} className="wt-pill" />
        <text data-fit={118} x={208} y={46} className="tour-a-tiny">You owe</text>
        <text ref={owe} data-fit={120} data-sample={fmt(ex.owe)} x={208} y={67} className="tour-a-val">{fmt(ex.owe)}</text>
      </g>

      {/* The two sides as bars: what is owned, and the part of it owed. */}
      <rect x={20} y={88} width={320} height={7} rx={3.5} className="tour-a-rail wt-fade" style={d(500)} />
      <rect x={20} y={88} width={320} height={7} rx={3.5} className="tour-a-green tour-a-fill" style={d(650)} />
      <rect x={20} y={100} width={320} height={7} rx={3.5} className="tour-a-rail wt-fade" style={d(560)} />
      <rect x={20} y={100} width={320 * oweShare} height={7} rx={3.5} className="tour-a-fill" style={{ ...d(800), fill: 'var(--orange-fill)' }} />

      {[150, 190].map((y, i) => (
        <line key={y} x1={20} x2={340} y1={y} y2={y} className="wt-grid wt-fade" style={d(900 + i * 60)} />
      ))}
      <line x1={20} x2={340} y1={232} y2={232} className="wt-axis wt-grow-x" style={d(950)} />
      {TREND.map(([x, y], i) => (
        <circle key={x} cx={x} cy={y} r={3} className="wt-pop" style={{ ...d(LINE_AT + i * (LINE_DUR / 6)), fill: 'var(--gold)' }} />
      ))}
      <path ref={lineRef} d={TREND_PATH} pathLength={1} className="wt-curve wt-draw" style={{ ...d(LINE_AT), ['--dur' as string]: `${LINE_DUR}ms`, strokeLinejoin: 'round' } as CSSProperties} />
      <text data-fit={100} x={30} y={252} className="wt-t-sub wt-fade" style={d(1100)}>6 months ago</text>
      <text data-fit={80} x={330} y={252} className="wt-t-sub wt-fade" style={d(1200)} textAnchor="end">This month</text>

      <g className="wt-card-in" style={d(2400)}>
        <rect x={30} y={116} width={170} height={56} rx={14} className="wt-pill wt-pill-gold" />
        <text data-fit={140} x={44} y={135} className="wt-t-sub">Net worth this month</text>
        <text ref={net} data-fit={144} data-sample={fmt(ex.net)} x={44} y={161} className="wt-t-big">{fmt(ex.net)}</text>
      </g>
    </svg>
  );
}

/* ── "What good looks like" ─────────────────────────────────────────── */

function NetWorthGood({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>Assets</dt><dd>{fmt(ex.own)}</dd></div>
        <div><dt>Liabilities</dt><dd>{fmt(ex.owe)}</dd></div>
        <div><dt>Net worth</dt><dd>{fmt(ex.net)}</dd></div>
      </dl>
      <div className="tour-out-bar" aria-hidden="true">
        <span style={{ width: '67%', background: 'var(--green-fill)', ['--d' as string]: 100 } as CSSProperties} />
        <span style={{ width: '33%', background: 'var(--orange-fill)', ['--d' as string]: 250 } as CSSProperties} />
      </div>
      <span className="tour-out-chip">Every balance checked this month · +{fmt(ex.change)} on last month</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const GOOD_BODY = 'Every balance checked this month, debt shrinking against what you own, and a line drifting upward over several months. This is an example, not a target.';

const networth: TourChapter = {
  id: 'networth',
  title: 'Net Worth',
  route: '/tools/networth',
  tagline: 'What you own, minus what you owe, month by month.',
  minutes: 3,
  icon: 'trending',
  intro: {
    eyebrow: 'Track the big number',
    headline: 'Own, minus owe, every month.',
    body: 'Record what you hold and what you owe, update it when it changes, and watch one line. Nothing is projected or grown for you; every figure is one you entered.',
    Art: NetWorthArt,
    orb: [{ at: 0, x: TREND[0][0], y: TREND[0][1], s: 0.4 }],
    duration: 3500,
  },
  steps: [
    {
      id: 'head',
      target: '[data-tour="networth-head"]',
      title: 'Only what you entered',
      body: 'Every figure on this page is a balance you typed, or a sum of them. Nothing is projected, estimated or grown on your behalf.',
    },
    {
      id: 'empty',
      target: '[data-tour="networth-empty"]',
      title: 'Start with one balance',
      body: 'One bank balance is enough to begin, and you can add deposits, funds and loans as you find them. The line becomes useful from the second month.',
    },
    {
      id: 'months',
      target: '[data-tour="networth-months"]',
      title: 'Any month on the line',
      body: 'Step back to see how things stood or to fill in history. Balances carry forward until you update them, and an account not yet recorded can be backdated.',
    },
    {
      id: 'fx',
      target: '[data-tour="networth-fx"]',
      title: 'Several currencies, one total',
      body: 'Accounts held in other currencies are converted at dated mid-market rates, and the note says when those rates go stale. Set your own rate if you know a better one.',
      hint: 'Press “Set my own rates”.',
    },
    {
      id: 'kpis',
      target: '[data-tour="networth-kpis"]',
      title: 'Net worth at a glance',
      body: 'What you own minus what you owe, with the change against the month before. Liabilities also show as a share of your assets.',
    },
    {
      id: 'review',
      target: '[data-tour="networth-review"]',
      title: 'Smart balance review',
      body: 'Shows which balances still need checking this month, oldest first, and lets you confirm one unchanged after checking your statement. It also flags likely duplicates and explains what moved.',
    },
    {
      id: 'trend',
      target: '[data-tour="networth-trend"]',
      title: 'The line that matters',
      body: 'Net worth month by month, scaled to your own range with both ends printed. The same figures are there as a table.',
      hint: 'Open “View as a table”.',
    },
    {
      id: 'stale',
      target: '[data-tour="networth-stale"]',
      title: 'Balances getting old',
      body: 'Accounts not updated for three months or more are flagged, because their last recorded balance is still being counted.',
    },
    {
      id: 'sheet',
      target: '[data-tour="networth-sheet"]',
      title: 'What you own and owe',
      body: 'Each side has its total and a bar showing how it splits across categories, such as deposits, property or a home loan.',
    },
    {
      id: 'row',
      target: '[data-tour="networth-row"]',
      title: 'Update a balance',
      body: 'Type this month’s figure straight into the field. Older figures say which month they are from, and the bin asks before it removes anything.',
      hint: 'Change one balance and watch the totals move.',
    },
    {
      id: 'add',
      target: '[data-tour="networth-add-form"]',
      title: 'Add an account',
      body: 'Name it, enter this month’s balance (sums like 12000+3000 work), say whether you own or owe it and pick a category. “Held in” keeps an account in its own currency.',
      hint: 'Type a name and a balance, then press Add account.',
      before: openAddForm,
      after: closeAddForm,
    },
    {
      id: 'export',
      target: '[data-tour="networth-export"]',
      title: 'Keep a copy',
      body: 'Download every account and recorded balance as a CSV file, with the currency on each row, to keep or open in a spreadsheet.',
    },
    {
      id: 'explainer',
      target: '[data-tour="networth-explainer"]',
      title: 'What this means',
      body: 'A plain reading of the month and how it compares, plus the rules used: nothing is projected or adjusted for inflation, and unentered months carry forward.',
      hint: 'Open “How this is calculated”.',
    },
    {
      id: 'education',
      target: '[data-tour="tool-education"]',
      title: 'Learn the method',
      body: 'The page ends with the method, common questions and related guides, for when you want the why as well as the answer.',
    },
    {
      // Before the first account: the empty state's own example line.
      id: 'good-start',
      target: '[data-tour="networth-example"]',
      title: 'What good looks like',
      body: GOOD_BODY,
      output: NetWorthGood,
    },
    {
      id: 'good',
      target: '[data-tour="networth-kpis"]',
      title: 'What good looks like',
      body: GOOD_BODY,
      output: NetWorthGood,
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default networth;
