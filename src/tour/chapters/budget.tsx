import { useRef, type CSSProperties } from 'react';
import { d, socketed, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import type { IntroArtProps, OutputProps, TourChapter } from '../types';

/**
 * Chapter: Budget Builder — income in, split into Needs / Wants / Savings,
 * every category given a job, and a verdict on how well the plan is built.
 *
 * ILLUSTRATIVE FIGURES ONLY. The split below is the 50/30/20 guide written out
 * as literals (half, 30%, 20%), not multiplied by anything, and the plan score
 * is a picked example. Nothing here is computed by, or imported from,
 * lib/budget or lib/score.
 */
const EXAMPLE = {
  INR: { income: 80000, needs: 40000, wants: 24000, save: 16000, score: 86 },
  GENERIC: { income: 5000, needs: 2500, wants: 1500, save: 1000, score: 86 },
} as const;
const pick = (code: string) => (code === 'INR' ? EXAMPLE.INR : EXAMPLE.GENERIC);

/* ── Intro illustration: one income, split three ways ───────────────── */

/** Where the orb sits: in the income field, then on the verdict's check. */
const INCOME_SOCKET = { x: 44, y: 48 };
const VERDICT_SOCKET = { x: 40, y: 244 };

const COLUMNS = [
  { key: 'needs', label: 'Needs', pct: '50%', fill: 'tour-a-blue', stroke: 'tour-a-blue-s', x: 20, rows: [['Rent', 0.92], ['Groceries', 0.74], ['Bills', 0.58]] },
  { key: 'wants', label: 'Wants', pct: '30%', fill: 'tour-a-wants', stroke: 'tour-a-wants-s', x: 134, rows: [['Eating out', 0.8], ['Shopping', 0.56], ['Trips', 0.4]] },
  { key: 'save', label: 'Savings', pct: '20%', fill: 'tour-a-green', stroke: 'tour-a-green-s', x: 248, rows: [['Investing', 1], ['Emergency', 0.78], ['Goal', 0.6]] },
] as const;

export function BudgetArt({ clock, fmt, code }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  const ex = pick(code);
  const income = useCountUp(clock, 300, 1200, ex.income, fmt);
  const amounts = { needs: ex.needs, wants: ex.wants, save: ex.save };
  const top = 104;
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      <g className="wt-rise" style={d(60)}>
        <path d={socketed(20, 26, 320, 46, 16, INCOME_SOCKET.x, INCOME_SOCKET.y, 15)} fillRule="evenodd" className="wt-field" />
        <text data-fit={150} x={70} y={44} className="wt-t-sub">Take-home income</text>
        <text ref={income} data-fit={170} data-sample={fmt(ex.income)} x={70} y={63} className="tour-a-val">{fmt(ex.income)}</text>
        <text x={326} y={56} className="wt-t-pct" textAnchor="end">100%</text>
      </g>

      {/* The split: one line from the income to each envelope. */}
      {COLUMNS.map((c, i) => (
        <path
          key={c.key}
          d={`M180 72 C 180 88, ${c.x + 46} 84, ${c.x + 46} ${top}`}
          pathLength={1}
          className={`tour-a-line ${c.stroke} wt-draw`}
          style={{ ...d(900 + i * 90), ['--dur' as string]: '520ms' } as CSSProperties}
        />
      ))}

      {COLUMNS.map((c, i) => (
        <g key={c.key} className="wt-card-in" style={d(1150 + i * 120)}>
          <rect x={c.x} y={top} width={92} height={112} rx={13} className="wt-pill" />
          <text data-fit={44} x={c.x + 10} y={top + 19} className="wt-t-label">{c.label}</text>
          <text x={c.x + 83} y={top + 19} className="wt-t-pct" textAnchor="end">{c.pct}</text>
          <text data-fit={74} x={c.x + 10} y={top + 35} className="wt-t-sub">{fmt(amounts[c.key])}</text>
          {c.rows.map(([label, share], r) => {
            const y = top + 50 + r * 21;
            return (
              <g key={label}>
                <text data-fit={74} x={c.x + 10} y={y + 4} className="tour-a-tiny">{label}</text>
                <rect x={c.x + 10} y={y + 8} width={72} height={5} rx={2.5} className="tour-a-rail" />
                <rect
                  x={c.x + 10}
                  y={y + 8}
                  width={72 * share}
                  height={5}
                  rx={2.5}
                  className={`${c.fill} tour-a-fill`}
                  style={d(1450 + i * 120 + r * 110)}
                />
              </g>
            );
          })}
        </g>
      ))}

      <g className="wt-card-in" style={d(2350)}>
        <path d={socketed(20, 226, 320, 36, 13, VERDICT_SOCKET.x, VERDICT_SOCKET.y, 11)} fillRule="evenodd" className="wt-pill wt-pill-gold" />
        <text data-fit={110} x={60} y={248} className="wt-t-sub">Left to allocate</text>
        <text data-fit={40} x={176} y={249} className="wt-t-label">{fmt(0)}</text>
        <text data-fit={110} x={328} y={248} className="wt-t-gold" textAnchor="end">Plan score {ex.score}</text>
      </g>
      <path
        d={`M${VERDICT_SOCKET.x - 5} ${VERDICT_SOCKET.y + 0.5}l3.6 3.6 6.4-6.8`}
        pathLength={1}
        className="wt-glyph wt-draw"
        style={{ ...d(2750), ['--dur' as string]: '420ms' } as CSSProperties}
      />
    </svg>
  );
}

/* ── "What good looks like" ─────────────────────────────────────────── */

function BudgetGood({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>Take-home income</dt><dd>{fmt(ex.income)}</dd></div>
        <div><dt>Allocated</dt><dd>{fmt(ex.income)}</dd></div>
        <div><dt>Left to allocate</dt><dd>{fmt(0)}</dd></div>
      </dl>
      <div className="tour-out-bar" aria-hidden="true">
        <span style={{ width: '50%', background: 'var(--blue-fill)', ['--d' as string]: 100 } as CSSProperties} />
        <span style={{ width: '30%', background: 'var(--wants-fill)', ['--d' as string]: 250 } as CSSProperties} />
        <span style={{ width: '20%', background: 'var(--green-fill)', ['--d' as string]: 400 } as CSSProperties} />
      </div>
      <span className="tour-out-chip">Saving 20% · Plan score {ex.score} of 100</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const budget: TourChapter = {
  id: 'budget',
  title: 'Budget Builder',
  route: '/tools/budget',
  tagline: 'Give every part of your income a job, the 50/30/20 way.',
  minutes: 3,
  icon: 'budget',
  intro: {
    eyebrow: 'Plan the month',
    headline: 'Give every part of your income a job.',
    body: 'Add what comes in, split it between needs, wants and savings, then fill each category. The page tells you what is left and how well the plan is built.',
    Art: BudgetArt,
    orb: [
      { at: 0, x: INCOME_SOCKET.x, y: INCOME_SOCKET.y, s: 0.72 },
      { at: 2450, x: VERDICT_SOCKET.x, y: VERDICT_SOCKET.y, s: 0.54 },
    ],
    duration: 3200,
  },
  steps: [
    {
      id: 'period',
      target: '[data-tour="budget-period"]',
      title: 'This month or next',
      body: 'Plan the month you are in, or get ahead and plan next month before it starts. Every month keeps its own plan.',
      hint: 'Switch to Next month to see how a new month starts.',
      // Leave the page on this month, so the steps after this one have
      // something to point at.
      after: ({ click }) => { click('[data-tour="budget-period"] button:first-child[aria-pressed="false"]'); },
    },
    {
      id: 'months',
      target: '[data-tour="budget-months"]',
      title: 'Any month, past or ahead',
      body: 'Step through months with the arrows or the chips. Past months are your record, and you can plan up to a year ahead.',
    },
    {
      id: 'export',
      target: '[data-tour="budget-export"]',
      title: 'Export your plan',
      body: 'Download the month’s plan as CSV, Excel or a PDF report, to keep, print or share.',
    },
    {
      id: 'summary',
      target: '[data-tour="budget-summary"]',
      title: 'The three numbers that matter',
      body: 'Income, what you have allocated, and what is left or over. On a phone this strip stays in view while you edit.',
    },
    {
      id: 'start',
      target: '[data-tour="budget-start"]',
      title: 'Start a new month',
      body: 'A month you have not planned yet can copy an earlier month or start empty. Your other months stay exactly as they are.',
    },
    {
      id: 'income',
      target: '[data-tour="budget-income"]',
      title: 'Every income, added up',
      body: 'Add each source you receive, such as salary, rent or dividends. The take-home total is what every other figure on this page is built from.',
      hint: 'Type an amount next to one of the sources.',
    },
    {
      id: 'organise',
      target: '[data-tour="budget-organise"]',
      title: 'Organise rows',
      body: 'Reorder, hide or archive sources and categories, or add your own. Hidden rows still count; archived rows keep their amounts but stop counting.',
      hint: 'Press Organise to see the controls, then Done.',
      after: ({ click }) => { click('[data-tour="budget-organise"][aria-pressed="true"]'); },
    },
    {
      id: 'split',
      target: '[data-tour="budget-split"]',
      title: 'Your split',
      body: 'Start from 50/30/20: half for needs, 30% for wants, 20% for savings. Adjust the percentages to fit your life; together they must make 100.',
      hint: 'Change one percentage and watch the limits below update.',
    },
    {
      id: 'review',
      target: '[data-tour="budget-review"]',
      title: 'Smart budget review',
      body: 'Checks the month against the spending you have logged and previews any change with the same calculator. Nothing changes until you press Apply.',
    },
    {
      id: 'autobudget',
      target: '[data-tour="budget-autobudget"]',
      title: 'Build it from your history',
      body: 'You choose the income and the split; this divides each envelope across categories from what you actually spent in earlier months.',
      hint: 'Press Forecast to see a proposal. It only applies when you say so.',
    },
    {
      id: 'categories',
      target: '[data-tour="budget-categories"]',
      title: 'Categories in each envelope',
      body: 'Give each category an amount. The bar fills as you allocate, and the label says whether the section is on track or over its share.',
      hint: 'Enter an amount for one category.',
    },
    {
      id: 'verdict',
      target: '[data-tour="budget-verdict"]',
      title: 'Money with a job',
      body: 'What is still unallocated, or how far the plan runs over, plus your planned savings rate. Ask AI can explain the plan in plain words.',
    },
    {
      id: 'score',
      target: '[data-tour="budget-score"]',
      title: 'Plan score',
      body: 'Rates how well this plan is built, separately from how the month actually goes. The working shows exactly what lifts or lowers it.',
      hint: 'Press “Show the working”.',
    },
    {
      id: 'insights',
      target: '[data-tour="budget-insights"]',
      title: 'Insights',
      body: 'Short observations about this plan, written from your own split rather than a fixed rule.',
    },
    {
      id: 'explainer',
      target: '[data-tour="budget-explainer"]',
      title: 'What this means',
      body: 'A plain reading of your result, plus the inputs and assumptions it used and how it is calculated.',
      hint: 'Open “How this is calculated”.',
    },
    {
      id: 'wallet',
      target: '[data-tour="wallet-dock"]',
      title: 'Your wallet',
      body: 'What this year’s budgets have left over, always one tap away, for the “can I afford this?” moments.',
    },
    {
      id: 'education',
      target: '[data-tour="tool-education"]',
      title: 'Learn the method',
      body: 'Every public tool ends with its method, common questions and related guides, for when you want the why as well as the answer.',
    },
    {
      id: 'good',
      target: '[data-tour="budget-summary"]',
      title: 'What good looks like',
      body: 'All income has a job, needs fit inside their share, and saving is planned first rather than left over. This is an example, not a plan.',
      output: BudgetGood,
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default budget;
