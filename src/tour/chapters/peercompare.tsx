import { useRef, type CSSProperties } from 'react';
import { arc, d, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import type { IntroArtProps, OutputProps, TourChapter } from '../types';

/**
 * Chapter: PeerCompare — your own figures set beside a reference, as context.
 * Two shapes depending on the country: a benchmark model by age band and
 * location, or (where FinatriX has no model) dated official statistics you
 * compare a matching figure with. The steps cover both; each person sees the
 * ones their country's page actually has.
 *
 * ILLUSTRATIVE FIGURES ONLY. The score, the bars and the example figures are
 * literals. None is computed by, or imported from, lib/peercompare or the
 * reference data.
 *
 * The comparison appears only after the person presses compare, and the tour
 * never presses it for them. Steps about the result are planned only when the
 * result is already on screen ("Tour this page" from a result), and the
 * closing step points at whichever view is showing.
 */
const EXAMPLE = {
  INR: { yours: 180000, reference: 150000, difference: 30000 },
  GENERIC: { yours: 24000, reference: 20000, difference: 4000 },
} as const;
const pick = (code: string) => (code === 'INR' ? EXAMPLE.INR : EXAMPLE.GENERIC);
const SCORE = 64;

/* ── Intro illustration: your figures, the reference line ──────────── */

const RING = { cx: 84, cy: 112, r: 54 };
const ROWS = [
  { label: 'Income', share: 0.62 },
  { label: 'Savings', share: 0.44 },
  { label: 'Investments', share: 0.7 },
  { label: 'Debt', share: 0.38 },
  { label: 'Expenses', share: 0.56 },
] as const;
const BAR = { x: 164, w: 176 };
const REF_X = BAR.x + BAR.w / 2;
const whole = (n: number) => String(Math.round(n));

export function PeerCompareArt({ clock }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  const score = useCountUp(clock, 1700, 1100, SCORE, whole);
  const { cx, cy, r } = RING;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      {/* The reference arrives first: a line to read every figure against. */}
      <line x1={REF_X} x2={REF_X} y1={212} y2={47} className="wt-target wt-grow-y" style={d(150)} />
      <text data-fit={90} x={REF_X} y={36} className="tour-a-tiny wt-fade" style={d(300)} textAnchor="middle">Reference</text>

      {ROWS.map((row, i) => {
        const y = 48 + i * 34;
        return (
          <g key={row.label} className="wt-slide-in" style={d(420 + i * 110)}>
            <text data-fit={80} x={BAR.x} y={y + 10} className="wt-t-sub">{row.label}</text>
            <rect x={BAR.x} y={y + 16} width={BAR.w} height={6} rx={3} className="tour-a-rail" />
            <rect
              x={BAR.x}
              y={y + 16}
              width={BAR.w * row.share}
              height={6}
              rx={3}
              className="tour-a-fill"
              style={{ ...d(700 + i * 110), fill: 'var(--purple)' } as CSSProperties}
            />
          </g>
        );
      })}

      {/* Six model scores, averaged into one illustrative number. */}
      <circle cx={cx} cy={cy} r={r} className="tour-a-track wt-fade" style={d(1300)} />
      <path
        d={arc(cx, cy, r, 0, (SCORE / 100) * 360)}
        pathLength={1}
        className="tour-a-ring wt-draw"
        style={{ ...d(1700), stroke: 'var(--purple)', ['--dur' as string]: '1100ms' } as CSSProperties}
      />
      <text ref={score} data-fit={56} data-sample="100" x={cx} y={cy + 5} className="wt-medal-num wt-pop" style={d(1600)} textAnchor="middle">{SCORE}</text>
      <text data-fit={56} x={cx} y={cy + 21} className="wt-medal-label wt-fade" style={d(1800)} textAnchor="middle">of 100</text>
      <text data-fit={140} x={cx} y={cy + r + 26} className="wt-t-sub wt-fade" style={d(2000)} textAnchor="middle">Illustrative model score</text>

      <g className="wt-pill-in" style={d(2500)}>
        <rect x={20} y={228} width={128} height={28} rx={14} className="wt-pill" />
        <text data-fit={108} x={84} y={246} className="wt-t-chip" textAnchor="middle">Not a percentile</text>
      </g>
      <g className="wt-pill-in" style={d(2650)}>
        <rect x={BAR.x} y={228} width={BAR.w} height={28} rx={14} className="wt-pill wt-pill-gold" />
        <text data-fit={150} x={REF_X} y={246} className="wt-t-chip" textAnchor="middle">Context, not a target</text>
      </g>
    </svg>
  );
}

/* ── "What good looks like" ─────────────────────────────────────────── */

function PeerCompareGood({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>Your figure</dt><dd>{fmt(ex.yours)}</dd></div>
        <div><dt>Reference, same basis</dt><dd>{fmt(ex.reference)}</dd></div>
        <div><dt>Difference</dt><dd>{fmt(ex.difference)} above</dd></div>
      </dl>
      <span className="tour-out-chip">Same basis · read as context, not a target</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const peercompare: TourChapter = {
  id: 'peercompare',
  title: 'PeerCompare',
  route: '/tools/peercompare',
  tagline: 'Your figures beside a reference, as context.',
  minutes: 3,
  icon: 'peer',
  intro: {
    eyebrow: 'Put figures in context',
    headline: 'Where your figures sit.',
    body: 'Set your income, savings and debts beside a dated reference for people like you. It gives context, never a rank or a target to chase.',
    Art: PeerCompareArt,
    orb: [
      { at: 0, x: REF_X, y: 47, s: 0.3 },
      { at: 1350, x: RING.cx, y: RING.cy, s: 1.8 },
    ],
    duration: 3100,
  },
  steps: [
    {
      id: 'region',
      target: '[data-tour="peercompare-region"]',
      title: 'Your country and currency',
      body: 'The country decides how this page works: a benchmark model in some countries, published official figures in others. The currency only changes display; nothing is converted.',
    },
    {
      id: 'currency',
      target: '[data-tour="peercompare-currency"]',
      title: 'Match the benchmark currency',
      body: 'The references are in this country’s currency, so the comparison waits until you switch. Switching converts nothing, so restate your figures afterwards.',
    },
    {
      id: 'saved',
      target: '[data-tour="peercompare-saved"]',
      title: 'Review saved figures',
      body: 'Your last figures for this country and currency, one press away. Check them first, because they may be out of date.',
    },
    {
      id: 'profile',
      target: '[data-tour="peercompare-profile"]',
      title: 'Age band and location',
      body: 'References are picked by age band and location, because a sensible figure at 25 in a big city differs from one at 50 somewhere cheaper.',
      hint: 'Pick a different location.',
    },
    {
      id: 'figures',
      target: '[data-tour="peercompare-figures"]',
      title: 'Your own figures',
      body: 'Income, savings, investments, debt, savings rate and expenses. Money fields accept sums such as 30000+15000, and everything is kept on this device as you type.',
    },
    {
      id: 'check',
      target: '[data-tour="peercompare-check"]',
      title: 'Automatic consistency check',
      body: 'Compares income minus expenses with the savings rate you entered and flags a mismatch. Where it fits, one press uses the income-minus-expenses rate instead.',
    },
    {
      id: 'compare',
      target: '[data-tour="peercompare-compare"]',
      title: 'Show the comparison',
      body: 'Checks every figure, then sets each one beside its model reference. You get context, never a rank or a target.',
      hint: 'Press Show the comparison, then Tour this page to walk through the result.',
    },
    {
      id: 'result',
      target: '[data-tour="peercompare-result"]',
      title: 'An illustrative score',
      body: 'The rounded average of six model scores for your age band and location. It is not a percentile or a grade, and the page says so.',
    },
    {
      id: 'basis',
      target: '[data-tour="peercompare-basis"]',
      title: 'What you are compared with',
      body: 'The model, age band, location and review date behind every reference. Open it to read what a score of 50 does and does not mean.',
      hint: 'Press “Show the comparison basis”.',
    },
    {
      id: 'explore',
      target: '[data-tour="peercompare-explore"]',
      title: 'Try another location',
      body: 'See how one measure’s reference changes in another location, using the same model. The suggestion below points to the most useful next tool for your figures.',
      hint: 'Open the location explorer and pick another location.',
    },
    {
      id: 'metrics',
      target: '[data-tour="peercompare-metrics"]',
      title: 'Metric by metric',
      body: 'Each measure shows your figure beside its reference, and a bar whose middle tick is where you would match it. For expenses, lower scores higher.',
    },
    {
      id: 'stats',
      target: '[data-tour="peercompare-stats"]',
      title: 'Additional stats',
      body: 'Months of emergency cover, debt against yearly income, net worth and how much of your money is invested. Open it to see how each is worked out.',
    },
    {
      id: 'explainer',
      target: '[data-tour="peercompare-explainer"]',
      title: 'What this means',
      body: 'How the score is built and what it cannot tell you, plus every input and assumption it used.',
      hint: 'Open “How this is calculated”.',
    },
    {
      id: 'reset',
      target: '[data-tour="peercompare-reset"]',
      title: 'Compare again',
      body: 'Back to the form with your figures kept, so you can change one and compare.',
    },
    {
      id: 'reference',
      target: '[data-tour="peercompare-reference"]',
      title: 'A published figure',
      body: 'Choose an official statistic for this country and read its value, population, definition, limits and source. You can read it without entering anything.',
      hint: 'Pick a different published reference.',
    },
    {
      id: 'builder',
      target: '[data-tour="peercompare-builder"]',
      title: 'Build your figure from parts',
      body: 'Add up to ten components on the same basis, such as assets and debts, then use the total as your figure. Nothing missing is guessed.',
    },
    {
      id: 'checks',
      target: '[data-tour="peercompare-checks"]',
      title: 'Like for like',
      body: 'Three checks confirm your figure matches the population, definition and period. If any is uncertain, read the published figure as context instead.',
    },
    {
      id: 'match',
      target: '[data-tour="peercompare-match"]',
      title: 'Compare matching figures',
      body: 'Shows how far your figure sits above or below the published median, as a plain difference. You can then try a second figure on the same basis.',
    },
    {
      id: 'second',
      target: '[data-tour="peercompare-second"]',
      title: 'A second figure',
      body: 'Try another figure on the same checked basis and see it against both the median and your first entry.',
    },
    {
      id: 'next',
      target: '[data-tour="peercompare-next"]',
      title: 'Make it useful',
      body: 'A national figure cannot tell you what you need, so this points to the tool that works from your own budget or net worth.',
    },
    {
      id: 'method',
      target: '[data-tour="peercompare-method"]',
      title: 'How this is calculated',
      body: 'The method, the published sources and the limits of comparing with a national median, in one drawer.',
      hint: 'Open it and read the limits.',
    },
    {
      id: 'sources',
      target: '[data-tour="peercompare-sources"]',
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
      target: '[data-tour="peercompare-outcome"]',
      title: 'What good looks like',
      body: 'A figure compared on the same basis as its reference, read as context for your own plan rather than a target. This is an example, not advice.',
      output: PeerCompareGood,
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default peercompare;
