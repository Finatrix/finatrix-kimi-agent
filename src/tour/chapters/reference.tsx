import { useRef, type CSSProperties } from 'react';
import { d, socketed, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import type { IntroArtProps, OutputProps, TourChapter } from '../types';

/**
 * Chapter: Reference data — the published rules and statistics behind the
 * market-specific answers, each with its source, the date it took effect, the
 * date it was last checked, and the gaps left deliberately empty.
 *
 * ILLUSTRATIVE FIGURES ONLY. The "cover" amount below is a round literal that
 * shows what a dated, sourced figure looks like. It is not read from
 * src/reference and must never be mistaken for a market's actual limit.
 */
const EXAMPLE = {
  INR: { cover: 500000 },
  GENERIC: { cover: 250000 },
} as const;
const pick = (code: string) => (code === 'INR' ? EXAMPLE.INR : EXAMPLE.GENERIC);

/* ── Intro illustration: a figure, traced back to its source ─────────── */

/** The orb is the source's seal: the authority every figure points back to. */
const SEAL = { x: 290, y: 100 };
const MARKETS = ['IN', 'AU', 'US', 'GB', 'AE', 'SG', 'CN'] as const;
const ROWS = ['Applies from', 'Last checked', 'What it excludes'] as const;

export function ReferenceArt({ clock, fmt, code }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  const ex = pick(code);
  const cover = useCountUp(clock, 700, 1100, ex.cover, fmt);
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      {/* Seven markets, one being read. */}
      {MARKETS.map((m, i) => (
        <g key={m} className="wt-pop" style={d(60 + i * 70)}>
          <rect x={20 + i * 46} y={30} width={40} height={20} rx={10} className={i === 0 ? 'wt-pill wt-pill-gold' : 'wt-pill'} />
          <text x={40 + i * 46} y={44} className={i === 0 ? 'wt-t-gold' : 'wt-t-sub'} textAnchor="middle">{m}</text>
        </g>
      ))}

      {/* The figure, with the dates that make it trustworthy. */}
      <g className="wt-card-in" style={d(500)}>
        <rect x={20} y={58} width={204} height={114} rx={14} className="wt-pill" />
        <text data-fit={180} x={34} y={78} className="tour-a-tiny">Deposit cover · example</text>
        <text ref={cover} data-fit={180} data-sample={fmt(ex.cover)} x={34} y={101} className="wt-t-amt">{fmt(ex.cover)}</text>
        {ROWS.map((label, i) => (
          <g key={label}>
            <text data-fit={140} x={34} y={127 + i * 18} className="wt-t-row">{label}</text>
            <g className="wt-pop" style={d(1300 + i * 160)}>
              <circle cx={204} cy={123 + i * 18} r={7} className="wt-ok" />
              <path d={`M${200.6} ${123.4 + i * 18}l2.4 2.4 4.2-4.4`} className="wt-ok-check" />
            </g>
          </g>
        ))}
      </g>

      {/* The thread back to the authority. */}
      <path
        d={`M224 100 C 244 100, 250 ${SEAL.y}, ${SEAL.x - 22} ${SEAL.y}`}
        pathLength={1}
        className="tour-a-line tour-a-gold-s wt-draw"
        style={{ ...d(1100), ['--dur' as string]: '600ms' } as CSSProperties}
      />
      <g className="wt-card-in" style={d(300)}>
        <path d={socketed(240, 58, 100, 114, 14, SEAL.x, SEAL.y, 21)} fillRule="evenodd" className="wt-pill wt-pill-gold" />
        <text data-fit={84} x={SEAL.x} y={144} className="wt-t-label" textAnchor="middle">Official</text>
        <text data-fit={84} x={SEAL.x} y={160} className="wt-t-sub" textAnchor="middle">source, linked</text>
      </g>
      <path
        d={`M${SEAL.x - 7} ${SEAL.y + 0.5}l5 5 9.5-10`}
        pathLength={1}
        className="wt-glyph wt-draw"
        style={{ ...d(1700), ['--dur' as string]: '420ms' } as CSSProperties}
      />

      {/* Freshness: checked, and when it is due another look. */}
      <g className="wt-fade" style={d(1900)}>
        <text data-fit={120} x={20} y={191} className="tour-a-tiny">Checked</text>
        <text data-fit={120} x={340} y={191} className="tour-a-tiny" textAnchor="end">Review due</text>
        <rect x={20} y={197} width={320} height={6} rx={3} className="tour-a-rail" />
      </g>
      <rect x={20} y={197} width={128} height={6} rx={3} className="tour-a-fill" style={{ ...d(2050), fill: 'var(--gold)' }} />
      <circle cx={148} cy={200} r={9} className="wt-ripple" style={d(2700)} />

      {/* The honest gap: no evidence, so no number. */}
      <g className="wt-rise" style={d(2500)}>
        <rect x={20} y={220} width={320} height={36} rx={12} className="wt-target" />
        <text data-fit={120} x={34} y={243} className="wt-t-label">Not verified</text>
        <text data-fit={160} x={326} y={243} className="wt-t-sub" textAnchor="end">no figure, never a zero</text>
      </g>
    </svg>
  );
}

/* ── "What good looks like" ─────────────────────────────────────────── */

function ReferenceGood({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>Example figure</dt><dd>{fmt(ex.cover)}</dd></div>
        <div><dt>Source</dt><dd>The authority, linked</dd></div>
        <div><dt>Applies from</dt><dd>Dated</dd></div>
        <div><dt>Last checked</dt><dd>Within its review</dd></div>
      </dl>
      <span className="tour-out-chip">Sourced · dated · gaps stated</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const reference: TourChapter = {
  id: 'reference',
  title: 'Reference data',
  route: '/tools/reference',
  tagline: 'Where the numbers come from, with dates and sources.',
  minutes: 3,
  icon: 'bills',
  intro: {
    eyebrow: 'Reference data',
    headline: 'Every number, traced to its source.',
    body: 'The published rules and statistics behind each market’s answers, with the date each took effect, when it was last checked, and the gaps we have not filled.',
    Art: ReferenceArt,
    orb: [{ at: 0, x: SEAL.x, y: SEAL.y, s: 0.95 }],
    duration: 3000,
  },
  steps: [
    {
      id: 'picker',
      target: '[data-tour="reference-picker"]',
      title: 'Read any market',
      body: 'Pick any of the seven markets to read its rules. This only changes what the page shows; your tools stay on the market set in Settings.',
      hint: 'Choose another market and watch every section change.',
    },
    {
      id: 'status',
      target: '[data-tour="reference-status"]',
      title: 'What the tools use',
      body: 'Whether the tools are localised for this market and where to choose it. Tax and statutory retirement sums stay outside the tools on purpose.',
    },
    {
      id: 'finder',
      target: '[data-tour="reference-finder"]',
      title: 'Find and check a source',
      body: 'Search the official sources for this market, or show only those due for review. Dates are checked on your device; nothing new is fetched.',
      hint: 'Open the search and tick “Only sources due for review”.',
    },
    {
      id: 'deposit',
      target: '[data-tour="reference-deposit"]',
      title: 'Deposit protection',
      body: 'The protected limit, who runs the scheme, what is eligible or excluded, and how joint accounts count. Where nothing was verified, no figure is shown rather than a zero.',
    },
    {
      id: 'sources',
      target: '[data-tour="reference-sources"]',
      title: 'Every figure has a source',
      body: 'Each section links to the authority it came from, opening in a new tab. Read the source before acting on any figure.',
    },
    {
      id: 'inflation',
      target: '[data-tour="reference-inflation"]',
      title: 'Published inflation',
      body: 'The latest verified year-on-year reading and the period it covers. It is an observation, not the steadier long-run rate the Goal Planner and LifeMap plan with.',
    },
    {
      id: 'tax',
      target: '[data-tour="reference-tax"]',
      title: 'Income tax bands',
      body: 'Marginal rate bands for reference, with what they leave out. FinatriX never works out a tax bill; a tool that needs tax asks for your marginal rate instead.',
    },
    {
      id: 'retirement',
      target: '[data-tour="reference-retirement"]',
      title: 'Retirement schemes',
      body: 'The main schemes, what you would have to supply to model them, and what FinatriX deliberately does not model.',
    },
    {
      id: 'peer',
      target: '[data-tour="reference-peer"]',
      title: 'Peer statistics',
      body: 'The surveys behind PeerCompare and their limits. A median says which side of the middle you are on; none of these can rank you as a percentile.',
    },
    {
      id: 'gates',
      target: '[data-tour="reference-gates"]',
      title: 'Deliberately switched off',
      body: 'Features held back because the evidence does not support them yet, and what it would take to turn each one on.',
    },
    {
      id: 'topic',
      target: '[data-tour="reference-topic"]',
      title: 'Focus on one topic',
      body: 'Narrow the page to a single topic, such as income tax, when you know what you are looking for.',
      hint: 'Pick a topic, then switch back to all topics.',
    },
    {
      id: 'checks',
      target: '[data-tour="reference-checks"]',
      title: 'How we check our work',
      body: 'Every figure was extracted by hand from the linked source on the date shown. The link explains our editorial standards.',
    },
    {
      id: 'good',
      target: '[data-tour="reference-picker"]',
      title: 'What good looks like',
      body: 'A figure you can trust carries its source, the date it applies from and when it was last checked, and a gap is named rather than filled. This is an example, not a real limit.',
      output: ReferenceGood,
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default reference;
