import { useRef, type CSSProperties } from 'react';
import { d, socketed, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import type { IntroArtProps, OutputProps, TourChapter } from '../types';

/**
 * Chapter: ParkSmart — an amount, a duration and a tax rate in; every place
 * the money could sit, ranked by what it keeps after tax.
 *
 * ILLUSTRATIVE FIGURES ONLY. The option names, earnings and split below are
 * literals picked to look like an ordinary comparison. None is computed by,
 * or imported from, lib/parksmart or its market packs.
 *
 * The ranking appears only after "Compare the options" is pressed, and the
 * tour never presses it for the person (it would count as a completed run).
 * Steps about the result are planned only when the result is already on
 * screen — "Tour this page" from a result walks those instead — and the
 * closing step points at whichever of the two views is showing.
 */
const EXAMPLE = {
  INR: {
    amount: 200000,
    rows: [['Liquid fund', 6900, true], ['Fixed deposit', 6400, false], ['Sweep-in deposit', 5900, true], ['Savings account', 2400, true]],
    total: 500000, buffer: 150000, core: 350000,
  },
  GENERIC: {
    amount: 10000,
    rows: [['Money market fund', 210, true], ['Term deposit', 195, false], ['High-yield savings', 180, true], ['Current account', 10, true]],
    total: 20000, buffer: 6000, core: 14000,
  },
} as const;
const pick = (code: string) => (code === 'INR' ? EXAMPLE.INR : EXAMPLE.GENERIC);

/* ── Intro illustration: one amount, every option ranked ────────────── */

/** The orb waits in the amount field, then settles on the leader's rank badge. */
const FIELD_SOCKET = { x: 318, y: 41 };
const TOP = 80;
const ROW_H = 36;
const ROW_GAP = 8;
const LEADER_SOCKET = { x: 42, y: TOP + ROW_H / 2 };

export function ParkSmartArt({ clock, fmt, code }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  const ex = pick(code);
  const amount = useCountUp(clock, 250, 1000, ex.amount, fmt);
  const lead = useCountUp(clock, 1500, 900, ex.rows[0][1], fmt);
  const max = ex.rows[0][1];
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      <g className="wt-rise" style={d(60)}>
        <path d={socketed(20, 18, 320, 46, 16, FIELD_SOCKET.x, FIELD_SOCKET.y, 14)} fillRule="evenodd" className="wt-field" />
        <text data-fit={150} x={36} y={36} className="wt-t-sub">Amount to park</text>
        <text ref={amount} data-fit={150} data-sample={fmt(ex.amount)} x={36} y={55} className="tour-a-val">{fmt(ex.amount)}</text>
      </g>
      <g className="wt-pill-in" style={d(500)}>
        <rect x={196} y={29} width={98} height={24} rx={12} className="wt-pill" />
        <text data-fit={84} x={245} y={45} className="wt-t-chip" textAnchor="middle">3–6 months</text>
      </g>

      {ex.rows.map(([name, net, liquid], i) => {
        const y = TOP + i * (ROW_H + ROW_GAP);
        const leader = i === 0;
        return (
          <g key={name} className="wt-slide-in" style={d(700 + i * 120)}>
            {leader ? (
              <path d={socketed(20, y, 320, ROW_H, 12, LEADER_SOCKET.x, LEADER_SOCKET.y, 11)} fillRule="evenodd" className="wt-pill wt-pill-gold" />
            ) : (
              <>
                <rect x={20} y={y} width={320} height={ROW_H} rx={12} className="wt-row" />
                <circle cx={42} cy={y + ROW_H / 2} r={10} className="tour-a-rail" />
                <text x={42} y={y + ROW_H / 2 + 4} className="wt-t-pct" textAnchor="middle">{i + 1}</text>
              </>
            )}
            <text data-fit={150} x={62} y={y + 16} className={leader ? 'wt-t-label' : 'wt-t-chip'}>{name}</text>
            <rect x={62} y={y + 23} width={150} height={4} rx={2} className="tour-a-rail" />
            <rect
              x={62}
              y={y + 23}
              width={150 * (net / max)}
              height={4}
              rx={2}
              className="tour-a-fill"
              style={{ ...d(1000 + i * 120), fill: leader ? 'var(--teal)' : 'var(--fill-18)' } as CSSProperties}
            />
            <text
              ref={leader ? lead : undefined}
              data-fit={96}
              data-sample={fmt(net)}
              x={326}
              y={y + 16}
              className="wt-t-pct"
              textAnchor="end"
            >
              {fmt(net)}
            </text>
            <text data-fit={96} x={326} y={y + 29} className="tour-a-tiny" textAnchor="end">{liquid ? 'Liquid' : 'Locked'}</text>
          </g>
        );
      })}
      {/* The leader's number sits on the orb. */}
      <text x={LEADER_SOCKET.x} y={LEADER_SOCKET.y + 4.5} className="wt-medal-num wt-pop" style={{ ...d(1900), fontSize: 13 } as CSSProperties} textAnchor="middle">1</text>
      <circle cx={LEADER_SOCKET.x} cy={LEADER_SOCKET.y} r={13} className="wt-ripple" style={d(2050)} />

      <text data-fit={320} x={180} y={258} className="wt-t-sub wt-fade" style={d(2300)} textAnchor="middle">Ranked by what each keeps after tax</text>
    </svg>
  );
}

/* ── "What good looks like" ─────────────────────────────────────────── */

function ParkSmartGood({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>Kept reachable</dt><dd>{fmt(ex.buffer)}</dd></div>
        <div><dt>Left to earn more</dt><dd>{fmt(ex.core)}</dd></div>
        <div><dt>Total parked</dt><dd>{fmt(ex.total)}</dd></div>
      </dl>
      <div className="tour-out-bar" aria-hidden="true">
        <span style={{ width: '30%', background: 'var(--teal)', ['--d' as string]: 100 } as CSSProperties} />
        <span style={{ width: '70%', background: 'var(--gold)', ['--d' as string]: 250 } as CSSProperties} />
      </div>
      <span className="tour-out-chip">Buffer liquid · rest locked on purpose · rates rechecked</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const parksmart: TourChapter = {
  id: 'parksmart',
  title: 'ParkSmart',
  route: '/tools/parksmart',
  tagline: 'Where idle cash keeps the most, after tax.',
  minutes: 3,
  icon: 'bank',
  intro: {
    eyebrow: 'Park idle cash',
    headline: 'Idle money shouldn’t idle.',
    body: 'Enter an amount and how long it can sit. Every option is ranked by what it keeps after tax, with what you can reach quickly marked clearly.',
    Art: ParkSmartArt,
    orb: [
      { at: 0, x: FIELD_SOCKET.x, y: FIELD_SOCKET.y, s: 0.62 },
      { at: 1800, x: LEADER_SOCKET.x, y: LEADER_SOCKET.y, s: 0.5 },
    ],
    duration: 3000,
  },
  steps: [
    {
      id: 'region',
      target: '[data-tour="parksmart-region"]',
      title: 'Your country and currency',
      body: 'The country sets which options, tax rules and protection limits apply. The currency only changes how amounts display; nothing is converted.',
    },
    {
      id: 'mismatch',
      target: '[data-tour="market-mismatch"]',
      title: 'When rules and currency differ',
      body: 'Your display currency is not this country’s own, so limits and quick amounts are still quoted in the country’s currency. One press shows amounts in that currency instead.',
    },
    {
      id: 'saved',
      target: '[data-tour="parksmart-saved"]',
      title: 'Your saved amount',
      body: 'The amount and duration you last used for this country and currency, one press away. Rates are never saved, so check them again.',
    },
    {
      id: 'amount',
      target: '[data-tour="parksmart-amount"]',
      title: 'How much to park',
      body: 'Type the amount, or a quick sum such as 50000+25000. What you enter is kept on this device as you type.',
      hint: 'Type a different amount.',
    },
    {
      id: 'quick',
      target: '[data-tour="parksmart-quick"]',
      title: 'Quick amounts',
      body: 'Common amounts for this country, one tap each, so you can compare a few sizes quickly.',
    },
    {
      id: 'terms',
      target: '[data-tour="parksmart-terms"]',
      title: 'How long, and your tax',
      body: 'Pick how long the money can sit and, where interest is taxed, your tax rate. Both change what each option keeps, and so the order.',
      hint: 'Change the duration to under 1 month.',
    },
    {
      id: 'rates',
      target: '[data-tour="parksmart-rates"]',
      title: 'Your two options',
      body: 'Here you compare two options you already know. Enter each one’s yearly rate after tax and fees, and whether you can reach it without notice; a blank rate is never zero.',
    },
    {
      id: 'liquid',
      target: '[data-tour="parksmart-liquid"]',
      title: 'Only reachable options',
      body: 'Tick this to rank only options you can withdraw from quickly, which matters for emergency money. Liquid is not always instant, so check settlement times.',
    },
    {
      id: 'compare',
      target: '[data-tour="parksmart-compare"]',
      title: 'Compare the options',
      body: 'Ranks every eligible option by what it keeps after tax for your amount and time. The result also shows trade-offs, a split idea and protection limits.',
      hint: 'Press Compare the options, then Tour this page to walk through the ranking.',
    },
    {
      id: 'result',
      target: '[data-tour="parksmart-result"]',
      title: 'The leader, after tax',
      body: 'The option that keeps the most after tax, with its earnings, effective rate and risk label. It ranks returns, not which option suits you.',
    },
    {
      id: 'tradeoffs',
      target: '[data-tour="parksmart-tradeoffs"]',
      title: 'Make the trade-offs visible',
      body: 'Compare the leader with any other option, or see who leads if you need the money sooner. The note underneath shows what keeping it reachable would cost.',
      hint: 'Open the comparison tools and pick another option.',
    },
    {
      id: 'split',
      target: '[data-tour="parksmart-split"]',
      title: 'One way to split it',
      body: 'When the leader locks money up, this shows keeping 30% in the best liquid option instead. It trades a little return for being able to reach it.',
    },
    {
      id: 'ranking',
      target: '[data-tour="parksmart-ranking"]',
      title: 'Every option, ranked',
      body: 'All eligible options with their rates before and after tax, liquid or locked, and risk. Select a row to read what the option is and how it is protected.',
      hint: 'Select a row to open its description.',
    },
    {
      id: 'keep',
      target: '[data-tour="parksmart-keep"]',
      title: 'Keep in mind',
      body: 'This country’s caveats about these rates and tax rules, worth reading before you move any money.',
    },
    {
      id: 'protection',
      target: '[data-tour="parksmart-protection"]',
      title: 'Deposit protection',
      body: 'Whether your amount fits the country’s deposit protection for one person at one bank. Where no scheme could be verified, it says so instead of showing a number.',
    },
    {
      id: 'explainer',
      target: '[data-tour="parksmart-explainer"]',
      title: 'What this means',
      body: 'How much the leader’s edge is actually worth, plus every input and assumption and how the figures are worked out.',
      hint: 'Open “How this is calculated”.',
    },
    {
      id: 'reset',
      target: '[data-tour="parksmart-reset"]',
      title: 'Try a different amount',
      body: 'Back to the form with your entries kept, to compare another amount or duration.',
    },
    {
      id: 'sources',
      target: '[data-tour="parksmart-sources"]',
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
      target: '[data-tour="parksmart-outcome"]',
      title: 'What good looks like',
      body: 'Money you might need soon stays where you can reach it, and only money you can leave alone is locked up to earn more. This is an example, not advice.',
      output: ParkSmartGood,
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default parksmart;
