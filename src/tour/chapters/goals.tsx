import { useCallback, useEffect, useRef, type CSSProperties } from 'react';
import { d, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import { easeInOutCubic } from '../../walkthrough/motion';
import type { IntroArtProps, OutputProps, TourChapter } from '../types';

/**
 * Chapter: the Reverse Goal Planner — a goal, a price in today's money and a
 * deadline in; the monthly amount each return path needs, worked backwards.
 *
 * ILLUSTRATIVE FIGURES ONLY. The goal, its inflated target and the three
 * monthly amounts are literals picked to look plausible side by side. None is
 * computed by, or imported from, lib/goals or a market pack.
 *
 * The plan appears only after "Show me the path" is pressed (which saves it
 * and dates it from today), so the tour never presses it for the person.
 * Steps about the plan are planned only when it is already on screen ("Tour
 * this page" from a plan), and the opening and closing steps point at
 * whichever of the two views is showing.
 */
const EXAMPLE = {
  INR: { goal: 'Home deposit', years: 5, target: 1340000, paths: [18100, 16200, 15300], stepStart: 12300 },
  GENERIC: { goal: 'Home deposit', years: 5, target: 68000, paths: [1000, 930, 870], stepStart: 760 },
} as const;
const pick = (code: string) => (code === 'INR' ? EXAMPLE.INR : EXAMPLE.GENERIC);

/* ── Intro illustration: three paths, one target ────────────────────── */

const CHART = { x0: 156, x1: 328, base: 206, top: 64 };
const PATHS = [
  { name: 'Conservative', color: 'var(--teal)', d: `M${CHART.x0} ${CHART.base} C 214 172, 274 114, ${CHART.x1} ${CHART.top}` },
  { name: 'Moderate', color: 'var(--gold)', d: `M${CHART.x0} ${CHART.base} C 226 192, 284 134, ${CHART.x1} ${CHART.top}` },
  { name: 'Aggressive', color: 'var(--orange)', d: `M${CHART.x0} ${CHART.base} C 240 204, 298 154, ${CHART.x1} ${CHART.top}` },
] as const;
const DRAW_AT = 900;
const DRAW_DUR = 1100;

export function GoalsArt({ clock, orb, fmt, code }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  const ex = pick(code);
  // Stable, so the count-ups below register their tweens once.
  const perMonth = useCallback((n: number) => `${fmt(n)}/mo`, [fmt]);
  const m0 = useCountUp(clock, 2050, 900, ex.paths[0], perMonth);
  const m1 = useCountUp(clock, 2150, 900, ex.paths[1], perMonth);
  const m2 = useCountUp(clock, 2250, 900, ex.paths[2], perMonth);
  const refs = [m0, m1, m2];
  const rideRef = useRef<SVGPathElement>(null);
  const { x0, x1, base, top } = CHART;

  // The orb rides the middle path's tip as it draws (same start, duration and
  // easing as the CSS stroke), then settles on the target.
  useEffect(() => {
    const path = rideRef.current;
    let len = 0;
    try { len = path?.getTotalLength() ?? 0; } catch { len = 0; }
    if (!path || !len) {
      clock.at(DRAW_AT, () => orb.move({ at: 0, x: x1, y: top, s: 0.5 }));
      return;
    }
    clock.tween(DRAW_AT + 120, DRAW_DUR, (p) => {
      const pt = path.getPointAtLength(p * len);
      orb.ride(pt.x, pt.y, 0.32 + 0.14 * p);
    }, easeInOutCubic);
    clock.at(DRAW_AT + 120 + DRAW_DUR + 20, () => orb.move({ at: 0, x: x1, y: top, s: 0.5 }));
  }, [clock, orb, x1, top]);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      {/* The goal and its deadline arrive before the answer. */}
      <line x1={x0} x2={x1 + 12} y1={base} y2={base} className="wt-axis wt-grow-x" style={d(80)} />
      <line x1={x0} x2={x1} y1={top} y2={top} className="wt-target wt-grow-x" style={d(220)} />
      <line x1={x1} x2={x1} y1={base} y2={top} className="wt-target wt-grow-y" style={d(420)} />
      <text data-fit={x1 - x0 + 14} x={x0} y={top - 12} className="wt-t-gold wt-fade" style={d(380)}>{ex.goal} · {fmt(ex.target)}</text>
      <text data-fit={70} x={x0} y={base + 20} className="wt-t-sub wt-fade" style={d(520)}>Today</text>
      <text data-fit={100} x={x1 + 12} y={base + 20} className="wt-t-sub wt-fade" style={d(640)} textAnchor="end">In {ex.years} years</text>

      {PATHS.map((p, i) => (
        <path
          key={p.name}
          ref={i === 1 ? rideRef : undefined}
          d={p.d}
          pathLength={1}
          className="tour-a-line wt-draw"
          style={{ ...d(DRAW_AT + i * 120), stroke: p.color, strokeWidth: 2.6, ['--dur' as string]: `${DRAW_DUR}ms` } as CSSProperties}
        />
      ))}
      <circle cx={x1} cy={top} r={12} className="wt-ripple" style={d(2200)} />

      {/* What each path asks of you each month. */}
      <text data-fit={120} x={20} y={58} className="wt-t-sub wt-fade" style={d(1700)}>Needed each month</text>
      {PATHS.map((p, i) => {
        const y = 70 + i * 48;
        return (
          <g key={p.name} className="wt-slide-in" style={d(1850 + i * 110)}>
            <rect x={20} y={y} width={120} height={40} rx={12} className="wt-pill" />
            <circle cx={32} cy={y + 12} r={4} style={{ fill: p.color }} />
            <text data-fit={92} x={41} y={y + 15} className="tour-a-tiny">{p.name}</text>
            <text ref={refs[i]} data-fit={104} data-sample={perMonth(ex.paths[i])} x={30} y={y + 32} className="wt-t-pct">{perMonth(ex.paths[i])}</text>
          </g>
        );
      })}

      <g className="wt-pill-in" style={d(2600)}>
        <rect x={20} y={218} width={120} height={26} rx={13} className="wt-pill wt-pill-gold" />
        <text data-fit={104} x={80} y={235} className="wt-t-chip" textAnchor="middle">or step up 10% a year</text>
      </g>
    </svg>
  );
}

/* ── "What good looks like" ─────────────────────────────────────────── */

function GoalsGood({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>{ex.goal}, in {ex.years} years</dt><dd>{fmt(ex.target)}</dd></div>
        <div><dt>Each month, moderate path</dt><dd>{fmt(ex.paths[1])}</dd></div>
        <div><dt>Or start at, stepping up 10%</dt><dd>{fmt(ex.stepStart)}</dd></div>
      </dl>
      <span className="tour-out-chip">Fits after bills and other goals · revisited yearly</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const goals: TourChapter = {
  id: 'goals',
  title: 'Goal Planner',
  route: '/tools/goals',
  tagline: 'Work back from a goal to a monthly amount.',
  minutes: 3,
  icon: 'goal',
  intro: {
    eyebrow: 'Plan a goal',
    headline: 'Work back from a goal.',
    body: 'Name a goal, its price today and a deadline. See what each return path needs every month.',
    Art: GoalsArt,
    orb: [{ at: 0, x: CHART.x0, y: CHART.base, s: 0.32 }],
    duration: 3000,
  },
  steps: [
    {
      id: 'plan',
      target: '[data-tour="goals-plan"]',
      title: 'Start from a goal',
      body: 'Pick a common goal or write your own, with what it costs today and when you want it. The planner works back to what to set aside each month.',
    },
    {
      id: 'mismatch',
      target: '[data-tour="market-mismatch"]',
      title: 'When rules and currency differ',
      body: 'Your display currency is not this country’s own, so the goal presets are still quoted in the country’s currency. One press shows amounts in that currency instead.',
    },
    {
      id: 'name',
      target: '[data-tour="goals-name"]',
      title: 'Name it',
      body: 'A short name labels the goal here, on your dashboard and on the calendar.',
      hint: 'Type a name for your goal.',
    },
    {
      id: 'target',
      target: '[data-tour="goals-target"]',
      title: 'Target in today’s money',
      body: 'What it would cost now; the planner can grow it for inflation. Sums such as 300000+50000 work too, and your figures stay on this device.',
    },
    {
      id: 'timing',
      target: '[data-tour="goals-timing"]',
      title: 'Deadline and head start',
      body: 'Whole years from 1 to 40, plus anything already saved for this goal, which then does part of the work.',
    },
    {
      id: 'inflation',
      target: '[data-tour="goals-inflation"]',
      title: 'Allow for inflation',
      body: 'Ticked, the target grows at this country’s assumed inflation, so you plan for what it will likely cost by the deadline.',
    },
    {
      id: 'submit',
      target: '[data-tour="goals-submit"]',
      title: 'Show me the path',
      body: 'Works out the monthly amount for each return path, then saves the plan on this device and dates it from today.',
      hint: 'Press Show me the path, then Tour this page to walk through your plan.',
    },
    {
      id: 'calendar',
      target: '[data-tour="goals-calendar"]',
      title: 'A plan that starts today',
      body: 'Calendar places the target date that many years from the day you generate the plan. Generating a new plan resets that start date.',
    },
    {
      id: 'path',
      target: '[data-tour="goals-path"]',
      title: 'One card per return path',
      body: 'Each path shows the monthly amount, a 10% yearly step-up start, your money against market gains and typical holdings. Journey milestones show progress year by year.',
    },
    {
      id: 'deadline',
      target: '[data-tour="goals-deadline"]',
      title: 'Find a deadline that fits',
      body: 'Enter what you can sustain each month to find the earliest whole-year deadline on each path, check the full step-up schedule, or export the plan as CSV.',
      hint: 'Open the deadline finder and enter a monthly limit.',
    },
    {
      id: 'compare',
      target: '[data-tour="goals-compare"]',
      title: 'Compare the trade-offs',
      body: 'Try another target, deadline or starting balance side by side, with the same assumptions. Your saved goal stays as it is.',
      hint: 'Open the scenario comparison and change the deadline.',
    },
    {
      id: 'caveats',
      target: '[data-tour="goals-caveats"]',
      title: 'Before you choose',
      body: 'What the step-up assumes and what inflation does to today’s price by the deadline. Check the amount against bills and other goals.',
    },
    {
      id: 'explainer',
      target: '[data-tour="goals-explainer"]',
      title: 'What this means',
      body: 'The range of monthly amounts across paths, and why the lowest carries the most market risk. It also lists every input and assumption used.',
      hint: 'Open “How this is calculated”.',
    },
    {
      id: 'reset',
      target: '[data-tour="goals-reset"]',
      title: 'Plan another goal',
      body: 'Back to the form with this goal’s figures kept, ready to adjust or replace.',
    },
    {
      id: 'sources',
      target: '[data-tour="goals-sources"]',
      title: 'Where the figures come from',
      body: 'This country’s figures and the month they were last reviewed. Open it for the sources and a way to change your market.',
    },
    {
      id: 'education',
      target: '[data-tour="tool-education"]',
      title: 'Learn the method',
      body: 'The page ends with the method, common questions and related guides, for when you want the why as well as the answer.',
    },
    {
      id: 'good',
      target: '[data-tour="goals-outcome"]',
      title: 'What good looks like',
      body: 'A target in future money, a deadline chosen on purpose, and a monthly amount that still fits after bills and other goals. This is an example, not a plan.',
      output: GoalsGood,
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default goals;
