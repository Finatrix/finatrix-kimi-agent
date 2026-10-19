import { useRef, type CSSProperties } from 'react';
import { arc, d, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import type { IntroArtProps, OutputProps, TourChapter } from '../types';

/**
 * Chapter: InvestMatch — six questions in, an illustrative allocation out,
 * with the horizon guard that keeps a short horizon from taking a long
 * horizon's risk.
 *
 * ILLUSTRATIVE FIGURES ONLY. The split, the horizon and the "could reach"
 * figure are literals picked to look like an ordinary moderate answer. None
 * is computed by, or imported from, lib/investmatch, so the tour can never
 * become a second implementation of its maths.
 *
 * The page is a question wizard, and its result exists only after the person
 * presses "Show the allocation" (which saves their answers), so the tour never
 * presses it for them. Steps about the result are planned only when the result
 * is already on screen — "Tour this page" from a result walks those instead —
 * and the closing step points at whichever of the two views is showing.
 */
const EXAMPLE = {
  INR: { monthly: 10000, years: 15, invested: 1800000, reach: 5000000, growth: 178 },
  GENERIC: { monthly: 500, years: 15, invested: 90000, reach: 160000, growth: 78 },
} as const;
const pick = (code: string) => (code === 'INR' ? EXAMPLE.INR : EXAMPLE.GENERIC);

/** The illustrative split: generic instrument classes, every market has them. */
const SPLIT = [
  { label: 'Equity index', pct: 45, css: 'var(--blue-fill)' },
  { label: 'Bonds', pct: 30, css: 'var(--green-fill)' },
  { label: 'Gold', pct: 15, css: 'var(--wants-fill)' },
  { label: 'Cash', pct: 10, css: 'var(--teal)' },
] as const;

/* ── Intro illustration: answers in, a split out ────────────────────── */

const DONUT = { cx: 92, cy: 138, r: 56 };
/** The orb starts as the seventh "answer" dot, then becomes the split's medallion. */
const ANSWER_ORB = { x: 232, y: 26 };
const DOT_X = (i: number) => 112 + i * 16;

/** Each class's share of the ring, start to end, with a small gap so each reads as its own. */
const ARCS = SPLIT.map((s, i) => {
  const a0 = SPLIT.slice(0, i).reduce((sum, x) => sum + x.pct, 0) * 3.6;
  const a1 = a0 + s.pct * 3.6;
  return { ...s, d: arc(DONUT.cx, DONUT.cy, DONUT.r, a0 + 2.5, a1 - 2.5), at: 1150 + i * 230 };
});

export function InvestMatchArt({ clock, fmt, code }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  const ex = pick(code);
  const reach = useCountUp(clock, 2300, 1100, ex.reach, fmt);
  const { cx, cy } = DONUT;
  const arcs = ARCS;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      {/* Six answers, one after another. */}
      <text data-fit={84} x={20} y={30} className="wt-t-sub wt-fade" style={d(40)}>Six questions</text>
      {Array.from({ length: 6 }, (_, i) => (
        <g key={i} className="wt-pop" style={d(140 + i * 110)}>
          <circle cx={DOT_X(i)} cy={26} r={6} className="wt-ok" />
        </g>
      ))}
      <path d={`M${DOT_X(5) + 9} 26H${ANSWER_ORB.x - 10}`} pathLength={1} className="tour-a-line tour-a-gold-s wt-draw" style={d(820)} />

      {/* The split: each class draws its share of the ring in turn. */}
      <circle cx={cx} cy={cy} r={DONUT.r} className="tour-a-track wt-fade" style={d(900)} />
      {arcs.map((a) => (
        <path
          key={a.label}
          d={a.d}
          pathLength={1}
          className="tour-a-ring wt-draw"
          style={{ ...d(a.at), stroke: a.css, ['--dur' as string]: '420ms' } as CSSProperties}
        />
      ))}
      <text data-fit={56} x={cx} y={cy + 4} className="wt-medal-num wt-pop" style={d(1100)} textAnchor="middle">{ex.years}</text>
      <text data-fit={56} x={cx} y={cy + 20} className="wt-medal-label wt-fade" style={d(1300)} textAnchor="middle">years</text>

      {/* The legend: label, share, and a bar that grows to it. */}
      {arcs.map((a, i) => {
        const y = 62 + i * 26;
        return (
          <g key={a.label} className="wt-slide-in" style={d(a.at + 60)}>
            <circle cx={182} cy={y - 4} r={4} style={{ fill: a.css }} />
            <text data-fit={110} x={192} y={y} className="wt-t-sub">{a.label}</text>
            <text x={340} y={y} className="wt-t-pct" textAnchor="end">{a.pct}%</text>
            <rect x={176} y={y + 6} width={164} height={4} rx={2} className="tour-a-rail" />
            <rect
              x={176}
              y={y + 6}
              width={164 * (a.pct / 45)}
              height={4}
              rx={2}
              className="tour-a-fill"
              style={{ ...d(a.at + 140), fill: a.css } as CSSProperties}
            />
          </g>
        );
      })}

      <g className="wt-card-in" style={d(2150)}>
        <rect x={176} y={168} width={164} height={64} rx={13} className="wt-pill wt-pill-gold" />
        <text data-fit={140} x={190} y={186} className="tour-a-tiny">Could reach, about</text>
        <text ref={reach} data-fit={140} data-sample={fmt(ex.reach)} x={190} y={208} className="tour-a-val">{fmt(ex.reach)}</text>
        <text data-fit={140} x={190} y={223} className="wt-t-sub">at an assumed return</text>
      </g>

      {/* The guard most tools skip: the horizon caps the risk. */}
      <g className="wt-pill-in" style={d(2650)}>
        <rect x={20} y={214} width={144} height={28} rx={14} className="wt-pill" />
        <circle cx={36} cy={228} r={7} className="wt-ok" />
        <path d="M32.6 228.3l2.4 2.4 4.4-4.6" className="wt-ok-check" />
        <text data-fit={102} x={50} y={232} className="wt-t-chip">Horizon checked</text>
      </g>
    </svg>
  );
}

/* ── "What good looks like" ─────────────────────────────────────────── */

function InvestMatchGood({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>{fmt(ex.monthly)} a month for</dt><dd>{ex.years} years</dd></div>
        <div><dt>You invest</dt><dd>{fmt(ex.invested)}</dd></div>
        <div><dt>Could reach, illustrated</dt><dd>{fmt(ex.reach)}</dd></div>
      </dl>
      <div className="tour-out-bar" aria-hidden="true">
        {SPLIT.map((s, i) => (
          <span key={s.label} style={{ width: `${s.pct}%`, background: s.css, ['--d' as string]: 100 + i * 150 } as CSSProperties} />
        ))}
      </div>
      <span className="tour-out-chip">Moderate split · {ex.growth}% growth assumed, not promised</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const investmatch: TourChapter = {
  id: 'investmatch',
  title: 'InvestMatch',
  route: '/tools/investmatch',
  tagline: 'Six questions, and the shape an allocation could take.',
  minutes: 3,
  icon: 'invest',
  intro: {
    eyebrow: 'Shape an allocation',
    headline: 'An allocation, illustrated.',
    body: 'Six short questions, then an illustrative split of a monthly amount, with the horizon checked first.',
    Art: InvestMatchArt,
    orb: [
      { at: 0, x: ANSWER_ORB.x, y: ANSWER_ORB.y, s: 0.34 },
      { at: 950, x: DONUT.cx, y: DONUT.cy, s: 1.9 },
    ],
    duration: 3300,
  },
  steps: [
    {
      id: 'region',
      target: '[data-tour="investmatch-region"]',
      title: 'Your country and currency',
      body: 'The country sets which instruments, return assumptions and inflation the illustration uses. The currency only changes how amounts display; nothing is converted.',
    },
    {
      id: 'mismatch',
      target: '[data-tour="market-mismatch"]',
      title: 'When rules and currency differ',
      body: 'Your display currency is not this country’s own, so limits and defaults are still quoted in the country’s currency. One press shows amounts in that currency instead.',
    },
    {
      id: 'saved',
      target: '[data-tour="investmatch-saved"]',
      title: 'Pick up where you left off',
      body: 'Answers you saved for this country and currency can be reviewed and reused. Check them first, because income and commitments change.',
    },
    {
      id: 'questions',
      target: '[data-tour="investmatch-questions"]',
      title: 'Six quick questions',
      body: 'Your age, income, monthly amount, risk appetite, time horizon and goal. Answers so far sit above the card as chips, so one tap takes you back to change any of them.',
      hint: 'Answer a question. A choice moves on by itself; for a number, press Enter or Next.',
    },
    {
      id: 'build',
      target: '[data-tour="investmatch-build"]',
      title: 'Build the illustration',
      body: 'Show the allocation checks every answer and never quietly changes one. Your answers are then saved on this device for next time.',
      hint: 'Press Next to the end, then Show the allocation. Tour this page then explains the result.',
    },
    {
      id: 'result',
      target: '[data-tour="investmatch-result"]',
      title: 'What it could grow to',
      body: 'An illustrative future value at an assumed yearly return, also given in today’s money. Below it: how much is your money and how much is growth.',
    },
    {
      id: 'scenarios',
      target: '[data-tour="investmatch-scenarios"]',
      title: 'Explore what changes it',
      body: 'Try 20% more or less each month, or another horizon, against your original illustration. The tip underneath suggests the next tool that fits your goal.',
      hint: 'Open the scenario explorer and pick a different horizon.',
    },
    {
      id: 'allocation',
      target: '[data-tour="investmatch-allocation"]',
      title: 'The illustrative split',
      body: 'How each month’s amount could divide across instrument classes, as a share and an amount. It describes a shape, never a product to buy.',
    },
    {
      id: 'insights',
      target: '[data-tour="investmatch-insights"]',
      title: 'What stands out',
      body: 'Short notes drawn from your answers, such as the share of income you invest, a horizon cap, or growth outpacing what you put in.',
    },
    {
      id: 'summary',
      target: '[data-tour="investmatch-summary"]',
      title: 'Your answers in one line',
      body: 'Monthly amount, the risk band applied, horizon and assumed return together, handy for comparing with a later run.',
    },
    {
      id: 'explainer',
      target: '[data-tour="investmatch-explainer"]',
      title: 'Why this split',
      body: 'A short horizon caps the split at a calmer risk band, and this says so when it happens. It also lists every input and assumption, and how the figure is worked out.',
      hint: 'Open “How this is calculated”.',
    },
    {
      id: 'recalc',
      target: '[data-tour="investmatch-recalc"]',
      title: 'Change an answer',
      body: 'Recalculate returns to the first question with your answers kept, so you can adjust one and compare.',
    },
    {
      id: 'sources',
      target: '[data-tour="investmatch-sources"]',
      title: 'Where the figures come from',
      body: 'The country’s figures and the month they were last reviewed. Open it for the sources and a way to change your market.',
    },
    {
      id: 'education',
      target: '[data-tour="tool-education"]',
      title: 'Learn the method',
      body: 'The page ends with the method, common questions and related guides, for when you want the why as well as the answer.',
    },
    {
      id: 'good',
      target: '[data-tour="investmatch-outcome"]',
      title: 'What good looks like',
      body: 'An amount you can keep up after essentials, a horizon long enough for the risk, and growth read as an assumption rather than a promise. This is an example, not advice.',
      output: InvestMatchGood,
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default investmatch;
