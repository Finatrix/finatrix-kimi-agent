import { useRef, type CSSProperties } from 'react';
import { d, socketed, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import type { IntroArtProps, OutputProps, TourChapter } from '../types';

/**
 * Chapter: Calendar — the money month. Recurring bills, the investing SIP and
 * goal dates on one grid, worked out from what the reader already tracks.
 *
 * ILLUSTRATIVE FIGURES ONLY. Every amount and day below is a picked literal,
 * and the outflow total is written out, not added up here. Nothing is computed
 * by, or imported from, lib/calendar or lib/planningAutomation.
 */
const EXAMPLE = {
  INR: { rent: 18000, sip: 10000, power: 2400, goal: 120000, outflows: 30400 },
  GENERIC: { rent: 1200, sip: 500, power: 90, goal: 6000, outflows: 1790 },
} as const;
const pick = (code: string) => (code === 'INR' ? EXAMPLE.INR : EXAMPLE.GENERIC);

/* ── Intro illustration: a month that fills itself in ───────────────── */

const GRID = { x: 20, y: 50, cell: 22, gap: 4, offset: 3, days: 31 };
const pitch = GRID.cell + GRID.gap;
/** Top-left corner of a day's cell (1-based day; the month starts on the 4th column). */
function cellAt(day: number): { x: number; y: number } {
  const i = day - 1 + GRID.offset;
  return { x: GRID.x + (i % 7) * pitch, y: GRID.y + Math.floor(i / 7) * pitch };
}
const centre = (day: number) => {
  const { x, y } = cellAt(day);
  return { x: x + GRID.cell / 2, y: y + GRID.cell / 2 };
};

const TODAY = 9;
const BUSIEST = 3;
/** Days that carry an event, and the token colour of its dot. */
const EVENTS: { day: number; fill: string }[] = [
  { day: 3, fill: 'var(--orange-fill)' },
  { day: 5, fill: 'var(--blue-fill)' },
  { day: 12, fill: 'var(--orange-fill)' },
  { day: 26, fill: 'var(--green-fill)' },
];
const SUMMARY_SOCKET = { x: 40, y: 218 };
const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

export function CalendarArt({ clock, fmt, code }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  const ex = pick(code);
  const total = useCountUp(clock, 2500, 1100, ex.outflows, fmt);
  const rows = [
    { label: 'Rent', when: '3rd', amount: ex.rent, fill: 'var(--orange-fill)' },
    { label: 'Investing SIP', when: '5th', amount: ex.sip, fill: 'var(--blue-fill)' },
    { label: 'Goal date', when: '26th', amount: ex.goal, fill: 'var(--green-fill)' },
  ];
  const busiest = cellAt(BUSIEST);
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      <text data-fit={150} x={GRID.x} y={28} className="wt-t-label wt-fade" style={d(60)}>This month</text>
      {WEEKDAYS.map((w, i) => (
        <text key={i} data-fit={18} x={GRID.x + i * pitch + GRID.cell / 2} y={44} className="tour-a-tiny wt-fade" style={d(120 + i * 20)} textAnchor="middle">{w}</text>
      ))}
      {Array.from({ length: GRID.days }, (_, i) => i + 1).map((day) => {
        const { x, y } = cellAt(day);
        return (
          <rect
            key={day}
            x={x}
            y={y}
            width={GRID.cell}
            height={GRID.cell}
            rx={6}
            className={day === TODAY ? 'wt-pill wt-pill-gold wt-pop' : 'wt-pill wt-pop'}
            style={d(180 + day * 18)}
          />
        );
      })}
      {/* Events land on their days: one dot each, in the legend's colours. */}
      {EVENTS.map((e, i) => {
        const c = centre(e.day);
        return <circle key={e.day} cx={c.x} cy={c.y + 5} r={3} className="wt-pop" style={{ ...d(1050 + i * 160), fill: e.fill }} />;
      })}
      {/* The busiest day gets a ring once the orb arrives on it. */}
      <rect x={busiest.x - 3} y={busiest.y - 3} width={GRID.cell + 6} height={GRID.cell + 6} rx={8} className="wt-target wt-fade" style={d(1900)} />

      {rows.map((r, i) => (
        <g key={r.label} className="wt-slide-in" style={d(1250 + i * 160)}>
          <rect x={212} y={50 + i * 42} width={128} height={36} rx={11} className="wt-pill" />
          <circle cx={225} cy={63 + i * 42} r={3.5} style={{ fill: r.fill }} />
          <text data-fit={74} x={233} y={66 + i * 42} className="tour-a-tiny">{r.label}</text>
          <text data-fit={26} x={332} y={66 + i * 42} className="tour-a-tiny" textAnchor="end">{r.when}</text>
          <text data-fit={104} x={225} y={80 + i * 42} className="wt-t-row" style={{ fill: 'var(--ink)', fontWeight: 600 }}>{fmt(r.amount)}</text>
        </g>
      ))}

      <g className="wt-card-in" style={d(2350)}>
        <path d={socketed(20, 196, 320, 44, 14, SUMMARY_SOCKET.x, SUMMARY_SOCKET.y, 11)} fillRule="evenodd" className="wt-pill wt-pill-gold" />
        <text data-fit={136} x={60} y={222} className="wt-t-sub">Projected outflows</text>
        <text ref={total} data-fit={120} data-sample={fmt(ex.outflows)} x={328} y={223} className="tour-a-val" textAnchor="end">{fmt(ex.outflows)}</text>
      </g>
      <text data-fit={320} x={20} y={258} className="wt-t-sub wt-fade" style={d(2700)}>Goal targets are shown, not counted as outflows</text>
      <path
        d={`M${SUMMARY_SOCKET.x - 5} ${SUMMARY_SOCKET.y + 0.5}l3.6 3.6 6.4-6.8`}
        pathLength={1}
        className="wt-glyph wt-draw"
        style={{ ...d(2900), ['--dur' as string]: '420ms' } as CSSProperties}
      />
    </svg>
  );
}

/* ── "What good looks like" ─────────────────────────────────────────── */

function CalendarGood({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>3rd · Rent</dt><dd>{fmt(ex.rent)}</dd></div>
        <div><dt>5th · Investing SIP</dt><dd>{fmt(ex.sip)}</dd></div>
        <div><dt>12th · Electricity</dt><dd>{fmt(ex.power)}</dd></div>
        <div><dt>Projected outflows</dt><dd>{fmt(ex.outflows)}</dd></div>
      </dl>
      <span className="tour-out-chip">Busiest day known · exported to your calendar</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const calendar: TourChapter = {
  id: 'calendar',
  title: 'Calendar',
  route: '/tools/calendar',
  tagline: 'Bills, your SIP and goal dates on one month grid.',
  minutes: 2,
  icon: 'clock',
  intro: {
    eyebrow: 'See the month ahead',
    headline: 'Know what is due, before it lands.',
    body: 'Recurring bills, your investing SIP and goal dates appear on one grid, worked out from what you already track. You never type an event in by hand.',
    Art: CalendarArt,
    orb: [
      { at: 0, ...centre(TODAY), s: 0.5 },
      { at: 1600, ...centre(BUSIEST), s: 0.5 },
      { at: 2450, ...SUMMARY_SOCKET, s: 0.54 },
    ],
    duration: 3300,
  },
  steps: [
    {
      id: 'head',
      target: '[data-tour="calendar-head"]',
      title: 'Your money month',
      body: 'Bills, your investing SIP and goal dates, all worked out from what you already track. Nothing appears unless your own records support it.',
    },
    {
      id: 'months',
      target: '[data-tour="calendar-months"]',
      title: 'Move between months',
      body: 'Use the arrows or month chips to look a month back or several ahead, or open “Jump to another month” to pick any month.',
      hint: 'Press the next-month arrow.',
    },
    {
      id: 'legend',
      target: '[data-tour="calendar-legend"]',
      title: 'Three kinds of event',
      body: 'Orange for recurring bills, blue for your investing SIP and green for goal dates, with the month’s projected outflows beside them.',
    },
    {
      id: 'grid',
      target: '[data-tour="calendar-grid"]',
      title: 'Tap a day',
      body: 'Dots mark the days with events, and today is outlined in gold. Tap a day to list only its events; tap it again for the whole month.',
      hint: 'Tap a day with a dot.',
    },
    {
      id: 'assist',
      target: '[data-tour="calendar-assist"]',
      title: 'Plan around busy days',
      body: 'What is still due this month and the single largest outflow day, with a button to jump to it. These are estimates, so confirm real due dates with your provider.',
    },
    {
      id: 'investday',
      target: '[data-tour="calendar-investday"]',
      title: 'Choose your investing day',
      body: 'Set the day your monthly investing usually happens. Days 29 to 31 move to the last day of shorter months, and the choice changes this calendar only.',
    },
    {
      id: 'filters',
      target: '[data-tour="calendar-filters"]',
      title: 'Filter and search',
      body: 'Narrow the list by event type, search a title or source, or tick “Today and later only”. Clear filters brings the full month back.',
      hint: 'Type part of a bill’s name.',
    },
    {
      id: 'export',
      target: '[data-tour="calendar-export"]',
      title: 'Add to your own calendar',
      body: 'Download the events you can see as all-day entries in an .ics file, ready to import into your phone or computer calendar. Nothing is sent or scheduled for you.',
    },
    {
      id: 'events',
      target: '[data-tour="calendar-events"]',
      title: 'Every event, in a list',
      body: 'Each event shows its day, source and amount, and opens the tool it came from. Goal targets appear here but are not counted as outflows.',
    },
    {
      id: 'empty',
      target: '[data-tour="calendar-empty"]',
      title: 'Nothing scheduled yet',
      body: 'Log recurring expenses, save an investing plan or set a goal, and this calendar fills in by itself with no manual entry.',
    },
    {
      id: 'method',
      target: '[data-tour="calendar-method"]',
      title: 'How events are found',
      body: 'Bills are spotted from expenses that repeat across months and dated from your last real payment. SIP and goal dates come from your saved plans.',
      hint: 'Open “How these events are derived”.',
    },
    {
      id: 'good',
      target: '[data-tour="calendar-grid"]',
      title: 'What good looks like',
      body: 'Every regular payment visible before it lands, the busiest day known in advance and money ready for it. This is an example, not your data.',
      output: CalendarGood,
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default calendar;
