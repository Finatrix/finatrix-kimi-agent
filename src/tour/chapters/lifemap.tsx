import { useEffect, useRef, type CSSProperties } from 'react';
import { d, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import { easeInOutCubic } from '../../walkthrough/motion';
import type { IntroArtProps, OutputProps, TourChapter, TourHookContext } from '../types';

/**
 * Chapter: LifeMap — today's position carried to age 60 under two sets of
 * habits, with life decisions to switch on and off and a time slider.
 *
 * ILLUSTRATIVE FIGURES ONLY. The two curves are hand-drawn shapes and the gap
 * is a picked literal; nothing is computed by, or imported from, lib/lifemap.
 */
const EXAMPLE = {
  INR: { gap: 12000000, smart40: 9500000, impulsive40: 2100000, gap40: 7400000, surplus: 13000 },
  GENERIC: { gap: 900000, smart40: 620000, impulsive40: 140000, gap40: 480000, surplus: 900 },
} as const;
const pick = (code: string) => (code === 'INR' ? EXAMPLE.INR : EXAMPLE.GENERIC);

/* ── Two screens, one route ─────────────────────────────────────────────
 * LifeMap shows a setup form until "Launch my LifeMap" is pressed, then the
 * simulation, both at /tools/lifemap. Each step puts the page on the screen it
 * is about: form steps press "Edit profile" (which keeps every figure), and
 * simulation steps press Launch, which is disabled — so a click does nothing —
 * until the form is ready. Every step has one of these hooks, so the chapter is
 * the same whichever screen it starts on. */
const LAUNCH = '[data-tour="lifemap-launch"]';
const EDIT = '[data-tour="lifemap-edit"]';

function showForm({ query, click }: TourHookContext): void {
  if (query(EDIT)) click(EDIT);
}

function showSimulation({ query, click }: TourHookContext): void {
  const button = query(LAUNCH);
  if (button instanceof HTMLButtonElement && !button.disabled) click(LAUNCH);
}

/* ── Intro illustration: two lives, one income ──────────────────────── */

const AXIS = { x0: 28, x1: 320, base: 214 };
const SMART = `M${AXIS.x0} ${AXIS.base} C 140 208, 230 150, ${AXIS.x1} 58`;
const IMPULSIVE = `M${AXIS.x0} ${AXIS.base} C 150 212, 240 198, ${AXIS.x1} 170`;
const SMART_END = { x: AXIS.x1, y: 58 };
const CURVE_AT = 700;
const CURVE_DUR = 1500;
/** Milestones on the timeline: x positions of ages 25, 30, 35, 45 and 55 (22→60 across the axis). */
const MILESTONE_X = [25, 30, 35, 45, 55].map((age) => AXIS.x0 + ((age - 22) / 38) * (AXIS.x1 - AXIS.x0));

export function LifeMapArt({ clock, orb, fmt, code }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const smartRef = useRef<SVGPathElement>(null);
  useFitSvgText(svgRef);
  const ex = pick(code);
  const gap = useCountUp(clock, 2350, 1200, ex.gap, fmt);

  // The orb is the traveller: it rides the tip of the disciplined path as it
  // draws (same start, duration and easing as the stroke), then settles at 60.
  useEffect(() => {
    const path = smartRef.current;
    let len = 0;
    try { len = path?.getTotalLength() ?? 0; } catch { len = 0; }
    if (!path || !len) {
      clock.at(CURVE_AT, () => orb.move({ at: 0, x: SMART_END.x, y: SMART_END.y, s: 0.5 }));
      return;
    }
    clock.tween(CURVE_AT, CURVE_DUR, (p) => {
      const pt = path.getPointAtLength(p * len);
      orb.ride(pt.x, pt.y, 0.36 + 0.12 * p);
    }, easeInOutCubic);
    clock.at(CURVE_AT + CURVE_DUR + 20, () => orb.move({ at: 0, x: SMART_END.x, y: SMART_END.y, s: 0.5 }));
  }, [clock, orb]);

  const { x0, x1, base } = AXIS;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="tour-lm-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--gold)" stopOpacity="0.24" />
          <stop offset="1" stopColor="var(--gold)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[78, 124, 170].map((y, i) => (
        <line key={y} x1={x0} x2={x1 + 12} y1={y} y2={y} className="wt-grid wt-fade" style={d(60 + i * 60)} />
      ))}
      <line x1={x0} x2={x1 + 12} y1={base} y2={base} className="wt-axis wt-grow-x" style={d(80)} />
      {MILESTONE_X.map((x, i) => (
        <circle key={x} cx={x} cy={base} r={3.2} className="wt-pop" style={{ ...d(260 + i * 70), fill: 'var(--ink3)' }} />
      ))}
      <text data-fit={70} x={x0} y={base + 22} className="wt-t-sub wt-fade" style={d(300)}>Age 22</text>
      <text data-fit={70} x={x1} y={base + 22} className="wt-t-sub wt-fade" style={d(420)} textAnchor="end">Age 60</text>

      {/* The impulsive path draws first and flatter; the disciplined one
          follows from the same starting point and pulls away. */}
      <path
        d={IMPULSIVE}
        pathLength={1}
        className="tour-a-line wt-draw"
        style={{ ...d(CURVE_AT - 150), ['--dur' as string]: `${CURVE_DUR}ms`, stroke: 'var(--red-fill)', strokeWidth: 2.6 } as CSSProperties}
      />
      <path d={`${SMART} L ${x1} ${base} L ${x0} ${base} Z`} fill="url(#tour-lm-fill)" className="wt-fade" style={d(CURVE_AT + CURVE_DUR - 200)} />
      <path ref={smartRef} d={SMART} pathLength={1} className="wt-curve wt-draw" style={{ ...d(CURVE_AT), ['--dur' as string]: `${CURVE_DUR}ms` } as CSSProperties} />
      <circle cx={x1} cy={170} r={4} className="wt-pop" style={{ ...d(CURVE_AT + CURVE_DUR - 100), fill: 'var(--red-fill)' }} />

      {/* The gap between the two lives, measured at the far end. */}
      <line x1={x1 + 10} x2={x1 + 10} y1={70} y2={166} className="wt-target wt-grow-y" style={d(2250)} />
      <text data-fit={64} x={x1} y={44} className="wt-t-gold wt-fade" style={d(2100)} textAnchor="end">At 60</text>

      <g className="wt-card-in" style={d(2200)}>
        <rect x={40} y={60} width={176} height={64} rx={14} className="wt-pill wt-pill-gold" />
        <text data-fit={150} x={56} y={82} className="wt-t-sub">Gap between the two paths</text>
        <text ref={gap} data-fit={150} data-sample={fmt(ex.gap)} x={56} y={110} className="wt-t-big">{fmt(ex.gap)}</text>
      </g>
      <g className="wt-fade" style={d(1300)}>
        <circle cx={48} cy={142} r={4} style={{ fill: 'var(--gold)' }} />
        <text data-fit={64} x={58} y={146} className="wt-t-sub">Smart you</text>
        <circle cx={130} cy={142} r={4} style={{ fill: 'var(--red-fill)' }} />
        <text data-fit={74} x={140} y={146} className="wt-t-sub">Impulsive you</text>
      </g>
    </svg>
  );
}

/* ── "What good looks like" ─────────────────────────────────────────── */

function LifeMapGood({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>Monthly surplus</dt><dd>{fmt(ex.surplus)}</dd></div>
        <div><dt>Smart path at 40</dt><dd>{fmt(ex.smart40)}</dd></div>
        <div><dt>Impulsive path at 40</dt><dd>{fmt(ex.impulsive40)}</dd></div>
        <div><dt>Gap from habits</dt><dd>{fmt(ex.gap40)}</dd></div>
      </dl>
      <span className="tour-out-chip">4 decisions on · modelled, not forecast</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const lifemap: TourChapter = {
  id: 'lifemap',
  title: 'LifeMap',
  route: '/tools/lifemap',
  tagline: 'Travel to age 60 and see what today’s habits become.',
  minutes: 4,
  icon: 'lifemap',
  intro: {
    eyebrow: 'Plan a lifetime',
    headline: 'See where your habits lead.',
    body: 'Enter today’s position once, then travel to age 60 and switch life decisions on and off. Two paths show what the same income becomes under different habits.',
    Art: LifeMapArt,
    orb: [{ at: 0, x: AXIS.x0, y: AXIS.base, s: 0.4 }],
    duration: 3600,
  },
  steps: [
    {
      id: 'intro',
      target: '[data-tour="lifemap-intro"]',
      title: 'Before you start',
      body: 'LifeMap carries today’s position to age 60 under two sets of habits. The note says what it needs, why it helps and where your data stays.',
      hint: 'Open “What it does and where your data stays”.',
      before: showForm,
    },
    {
      id: 'prefill',
      target: '[data-tour="lifemap-prefill"]',
      title: 'Start from what you entered',
      body: 'One press fills income, spending, savings, investments and debt from your saved Budget, Expenses, Net Worth and InvestMatch figures. Filled fields say where they came from.',
      before: showForm,
    },
    {
      id: 'you',
      target: '[data-tour="lifemap-you"]',
      title: 'You, in four numbers',
      body: 'Your name, age (16 to 45), monthly income and monthly expenses. Money fields accept sums like 30000+5000, and estimates are fine.',
      hint: 'Type a sum into income and see the total appear.',
      before: showForm,
    },
    {
      id: 'money',
      target: '[data-tour="lifemap-money"]',
      title: 'What you hold and owe',
      body: 'Savings, the emergency fund inside them, investments, any monthly investing and loans, plus your career field. Count loan EMIs in expenses so nothing is counted twice.',
      before: showForm,
    },
    {
      id: 'goals',
      target: '[data-tour="lifemap-goals"]',
      title: 'Pick what matters',
      body: 'Tap any goals you care about, such as a home or being debt-free. They remind you what the numbers are for; the projection is built from the figures above.',
      hint: 'Tap a goal to switch it on or off.',
      before: showForm,
    },
    {
      id: 'market',
      target: '[data-tour="lifemap-market"]',
      title: 'Whose figures these are',
      body: 'Which market LifeMap is reading and when it was last reviewed, with the sources and a link to change market if it is not where you live.',
      before: showForm,
    },
    {
      id: 'launch',
      target: '[data-tour="lifemap-launch"]',
      title: 'Check, then launch',
      body: 'If an input needs a look, a short list says which, and the button waits until it is fixed. Press Next and the tour opens your simulation.',
      before: showForm,
    },
    {
      id: 'kpis',
      target: '[data-tour="lifemap-kpis"]',
      title: 'Today, then projected',
      body: 'Net worth starts as what you entered and becomes a labelled projection once you travel forward. Beside it: monthly surplus, a derived score and decisions switched on.',
      before: showSimulation,
    },
    {
      id: 'time',
      target: '[data-tour="lifemap-time"]',
      title: 'Travel through time',
      body: 'Drag the slider, or use the arrow keys, to any age up to 60. Milestones fill in as you pass them and every figure on the page follows.',
      hint: 'Move the slider to age 40.',
      before: showSimulation,
    },
    {
      id: 'chart',
      target: '[data-tour="lifemap-chart"]',
      title: 'Two paths, one income',
      body: 'Gold is the disciplined path and red the impulsive one, both built from the same surplus. Hover or tap the chart to read any year.',
      before: showSimulation,
    },
    {
      id: 'health',
      target: '[data-tour="lifemap-health"]',
      title: 'Score and health breakdown',
      body: 'A score out of 100 with a plain title, split into savings rate, investing, debt control, protection and income growth. It moves with the decisions you switch on.',
      before: showSimulation,
    },
    {
      id: 'decisions',
      target: '[data-tour="lifemap-decisions"]',
      title: 'Switch decisions on',
      body: 'Pick a group such as Invest or Avoid Traps, then tap a card to turn it on or off. Cards with a pencil ask for your own monthly amount first.',
      hint: 'Tap one decision and watch the chart move.',
      before: showSimulation,
    },
    {
      id: 'universe',
      target: '[data-tour="lifemap-universe"]',
      title: 'Smart you, impulsive you',
      body: 'The gap between the two paths at age 40, or later once you travel past it, with net worth, investments and debt left side by side.',
      before: showSimulation,
    },
    {
      id: 'assist',
      target: '[data-tour="lifemap-assist"]',
      title: 'Explore a scenario',
      body: 'Pin a scenario to compare against, find the first age a wealth target is reached, and see the largest untried changes. Each is a modelled what-if, not advice.',
      hint: 'Press “Show scenario checks”.',
      before: showSimulation,
    },
    {
      id: 'explainer',
      target: '[data-tour="lifemap-explainer"]',
      title: 'What this means',
      body: 'A plain reading of your gap, plus every input and assumption the model used, such as the growth rates and that inflation is not applied.',
      hint: 'Open “How this is calculated”.',
      before: showSimulation,
    },
    {
      id: 'edit',
      target: '[data-tour="lifemap-edit"]',
      title: 'Change anything',
      body: 'Go back to your profile at any time. Your figures are kept, so you can change one number and launch again.',
      before: showSimulation,
    },
    {
      id: 'education',
      target: '[data-tour="tool-education"]',
      title: 'Learn the method',
      body: 'The page ends with the method, common questions and related guides, for when you want the why as well as the answer.',
    },
    {
      id: 'good',
      target: '[data-tour="lifemap-universe"]',
      title: 'What good looks like',
      body: 'A steady monthly surplus, a few good habits switched on and a gap you understand. This is an example, not a forecast.',
      output: LifeMapGood,
      before: showSimulation,
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default lifemap;
