import { useRef, type CSSProperties } from 'react';
import { arc, d, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import type { IntroArtProps, OutputProps, TourChapter } from '../types';

/**
 * Chapter: the Dashboard — the front door, plus the shell controls every page
 * shares (search, notifications, navigation, the AI helper, these tours).
 *
 * ILLUSTRATIVE FIGURES ONLY. Every number below is a literal picked to look
 * like a calm, ordinary month. None is computed by, or imported from, a
 * calculator, so the tour can never become a second implementation of a
 * formula. Rupee figures for INR, a generic set for every other currency.
 */
const EXAMPLE = {
  INR: { income: 80000, spending: 52000, left: 28000, rate: 20, score: 72 },
  GENERIC: { income: 5000, spending: 3250, left: 1750, rate: 20, score: 72 },
} as const;
const pick = (code: string) => (code === 'INR' ? EXAMPLE.INR : EXAMPLE.GENERIC);

/* ── Intro illustration: a month, assembling itself ─────────────────── */

const DIAL = { cx: 84, cy: 116, r: 56 };
const whole = (n: number) => String(Math.round(n));

export function DashboardArt({ clock, fmt, code }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  const ex = pick(code);
  const score = useCountUp(clock, 300, 1300, ex.score, whole);
  const income = useCountUp(clock, 700, 1100, ex.income, fmt);
  const spending = useCountUp(clock, 820, 1100, ex.spending, fmt);
  const left = useCountUp(clock, 940, 1100, ex.left, fmt);
  const pct = (n: number) => `${Math.round(n)}%`;
  const rate = useCountUp(clock, 1060, 900, ex.rate, pct);
  const { cx, cy, r } = DIAL;
  const tiles = [
    { label: 'Income', ref: income, sample: fmt(ex.income), x: 164, y: 34, delay: 600 },
    { label: 'Saving', ref: rate, sample: pct(ex.rate), x: 260, y: 34, delay: 720 },
    { label: 'Spending', ref: spending, sample: fmt(ex.spending), x: 164, y: 98, delay: 840 },
    { label: 'Left over', ref: left, sample: fmt(ex.left), x: 260, y: 98, delay: 960 },
  ];
  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      <circle cx={cx} cy={cy} r={r} className="tour-a-track wt-fade" style={d(80)} />
      <path
        d={arc(cx, cy, r, 0, (ex.score / 100) * 360)}
        pathLength={1}
        className="tour-a-ring tour-a-gold-s wt-draw"
        style={{ ...d(300), ['--dur' as string]: '1300ms' } as CSSProperties}
      />
      {/* The score sits on the gold orb: the orb is the dial's medallion. */}
      <text ref={score} data-fit={60} data-sample="100" x={cx} y={cy + 6} className="wt-medal-num wt-pop" style={d(300)} textAnchor="middle">{ex.score}</text>
      <text x={cx} y={cy + 24} className="wt-medal-label wt-fade" style={d(700)} textAnchor="middle">of 100</text>
      <text data-fit={150} x={cx} y={cy + r + 24} className="wt-t-sub wt-fade" style={d(900)} textAnchor="middle">Educational score</text>

      {tiles.map((t) => (
        <g key={t.label} className="wt-slide-in" style={d(t.delay)}>
          <rect x={t.x} y={t.y} width={88} height={56} rx={12} className="wt-pill" />
          <text data-fit={70} x={t.x + 10} y={t.y + 20} className="tour-a-tiny">{t.label}</text>
          <text ref={t.ref} data-fit={70} data-sample={t.sample} x={t.x + 10} y={t.y + 42} className="tour-a-val">{t.sample}</text>
        </g>
      ))}

      <g className="wt-card-in" style={d(1700)}>
        <rect x={164} y={166} width={184} height={42} rx={13} className="wt-pill wt-pill-gold" />
        <text data-fit={140} x={178} y={184} className="tour-a-tiny">Recommended next</text>
        <text data-fit={140} x={178} y={199} className="wt-t-label">Review last month</text>
        <path d="M326 187h10M331 182l5 5-5 5" className="tour-a-line tour-a-gold-s wt-draw" pathLength={1} style={d(2000)} />
      </g>

      {[0, 1, 2].map((i) => (
        <g key={i} className="wt-pop" style={d(2200 + i * 140)}>
          <circle cx={176 + i * 26} cy={238} r={10} className="wt-ok" />
          <path d={`M${171 + i * 26} ${238.5}l3.4 3.4 6-6.4`} className="wt-ok-check" />
        </g>
      ))}
      <text data-fit={110} x={238} y={242} className="wt-t-sub wt-fade" style={d(2600)}>Milestones earned</text>
    </svg>
  );
}

/* ── "What good looks like" ─────────────────────────────────────────── */

function DashboardGood({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <div className="tour-out-grid">
        <div className="tour-out-tile"><span>Budgeted income</span><b>{fmt(ex.income)}</b></div>
        <div className="tour-out-tile"><span>Planned saving</span><b>{ex.rate}%</b></div>
        <div className="tour-out-tile"><span>Recorded spending</span><b>{fmt(ex.spending)}</b></div>
        <div className="tour-out-tile"><span>Income less spending</span><b>{fmt(ex.left)}</b></div>
      </div>
      <span className="tour-out-chip">Month reviewed · one change noted</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const dashboard: TourChapter = {
  id: 'dashboard',
  title: 'Dashboard',
  route: '/tools/dashboard',
  tagline: 'Your month at a glance, and the controls every page shares.',
  minutes: 3,
  icon: 'pie',
  intro: {
    eyebrow: 'Dashboard',
    headline: 'Everything, on one calm page.',
    body: 'The dashboard gathers what you have recorded across every tool, so you can see where the month stands and pick one sensible next step.',
    Art: DashboardArt,
    orb: [{ at: 0, x: DIAL.cx, y: DIAL.cy, s: 2.2 }],
    duration: 2800,
  },
  steps: [
    {
      id: 'hero',
      target: '[data-tour="dashboard-hero"]',
      title: 'Your month at a glance',
      body: 'Your front door: this month’s headline figures and an educational score, worked out on this device from what you have recorded.',
    },
    {
      id: 'score',
      target: '[data-tour="dashboard-score"]',
      title: 'How the score works',
      body: 'The score averages the areas you have set up: saving, spending, goals and investing. It is a learning aid that moves with your inputs, not a credit score.',
      hint: 'Open it and read what each part measures.',
    },
    {
      id: 'kpis',
      target: '[data-tour="dashboard-kpis"]',
      title: 'Key figures, or your first step',
      body: 'With a budget and some spending recorded, your four key figures live here. Until then, this is where you set up your month in a couple of minutes.',
    },
    {
      id: 'reminders',
      target: '[data-tour="dashboard-reminders"]',
      title: 'Gentle reminders',
      body: 'Up to three short notifications a day, including an evening nudge to log spending. Entirely optional, and you can change them in Settings.',
      needs: ['web'],
    },
    {
      id: 'navigator',
      target: '[data-tour="dashboard-navigator"]',
      title: 'Your next useful step',
      body: 'FinatriX checks which tools have saved inputs and which records may need a look, and offers to pick up where you left off.',
      hint: 'Open “Find a tool or inspect saved data” and search for a tool.',
    },
    {
      id: 'guide',
      target: '[data-tour="dashboard-guide"]',
      title: 'Three good first steps',
      body: 'Set up your month, add some spending, then plan one goal. Each step ticks off as you go, and the chat helper can walk you through them.',
    },
    {
      id: 'journey',
      target: '[data-tour="dashboard-journey"]',
      title: 'Every tool in one row',
      body: 'Open this to see all the tools, which ones you have started, and the one worth doing next.',
      hint: 'Expand it and find the tool marked “do next”.',
    },
    {
      id: 'cards',
      target: '[data-tour="dashboard-cards"]',
      title: 'One card per tool',
      body: 'Each card summarises a tool from your own records: plan, spending, goals, investing, net worth and the long view. Its link takes you straight in.',
      needs: ['data'],
    },
    {
      id: 'review',
      target: '[data-tour="dashboard-review"]',
      title: 'Monthly review',
      body: 'Compare a month’s recorded spending with the month before, then write down one change for next month. Small, regular reviews are what make a budget stick.',
      before: ({ reveal }) => { reveal('[data-tour="dashboard-review"]'); },
    },
    {
      id: 'recurring',
      target: '[data-tour="dashboard-recurring"]',
      title: 'Recurring payments',
      body: 'Payments that seem to repeat each month are listed here. Confirm the ones you recognise and dismiss coincidences, so the monthly total stays honest.',
      before: ({ reveal }) => { reveal('[data-tour="dashboard-recurring"]'); },
    },
    {
      id: 'emergency',
      target: '[data-tour="dashboard-emergency"]',
      title: 'Emergency fund',
      body: 'Enter your essential monthly costs and the months of cover you want, and see the target, the gap and roughly how long it takes to fill.',
      hint: 'Type your monthly essentials and watch the target appear.',
      before: ({ reveal }) => { reveal('[data-tour="dashboard-emergency"]'); },
    },
    {
      id: 'customise',
      target: '[data-tour="dashboard-customise"]',
      title: 'Make it yours',
      body: 'Choose which sections appear and in what order. Your layout is saved on this device, and hidden sections can always come back.',
      hint: 'Press Customise, then hide or move a section.',
      needs: ['data'],
    },
    {
      id: 'recommended',
      target: '[data-tour="dashboard-recommended"]',
      title: 'Suggestions and recent activity',
      body: 'Suggestions come from gaps in your own records, and recent activity takes you straight back to whatever you last changed.',
    },
    {
      id: 'milestones',
      target: '[data-tour="dashboard-milestones"]',
      title: 'Milestones',
      body: 'Small markers for habits worth keeping, like a first budget or a reviewed month. They are encouragement, not a grade.',
    },
    {
      id: 'insights',
      target: '[data-tour="dashboard-insights"]',
      title: 'Personalised insights',
      body: 'Plain-language observations from your figures, each marked as fine, worth a look, or worth a caution.',
    },
    {
      id: 'upcoming',
      target: '[data-tour="dashboard-upcoming"]',
      title: 'Coming up',
      body: 'Bills, investments and goal dates due in the next 30 days, pulled from your Calendar so nothing sneaks up on you.',
    },
    {
      id: 'reports',
      target: '[data-tour="dashboard-reports"]',
      title: 'Reports to keep',
      body: 'Export your budget and expenses as CSV, Excel or PDF whenever you want a copy outside the app.',
    },
    {
      id: 'search',
      target: '[data-tour="shell-search"]',
      title: 'Search everything',
      body: 'Jump to any tool, guide or setting by typing its name, or type a spend like “340 lunch upi” to log it. On a keyboard, press Ctrl K (⌘K on a Mac).',
    },
    {
      id: 'notifications',
      target: '[data-tour="shell-notifications"]',
      title: 'Notifications',
      body: 'Alerts worked out from your own records collect here, such as an upcoming bill or a month that ran over. They are calculated on this device.',
    },
    {
      id: 'market',
      target: '[data-tour="shell-market"]',
      title: 'Currency and market rules',
      body: 'The market sets which country’s rules the tools read; the currency beside it sets how amounts display. They are separate settings, so check both.',
      needs: ['wide'],
    },
    {
      id: 'nav',
      target: '[data-tour="shell-nav"]',
      title: 'Move between tools',
      body: 'Every tool is one tap away here. On a phone, More opens the full list, Settings and your currency.',
    },
    {
      id: 'ai',
      target: '[data-tour="shell-ai"]',
      title: 'Ask FinatriX AI',
      body: 'Ask about your own figures in plain words. It is optional, asks before anything is sent, and explains rather than decides for you.',
    },
    {
      id: 'tour',
      target: '[data-tour="shell-tour"]',
      title: 'A tour on every page',
      body: 'Press this on any page for a short tour of just that page. The full tutorial also lives in Settings.',
    },
    {
      id: 'trust',
      target: '[data-tour="dashboard-trust"]',
      title: 'Private by default',
      body: 'Your figures are calculated on this device. These are educational tools, not financial advice, and the links here explain how we check our work.',
    },
    {
      id: 'good',
      target: '[data-tour="dashboard-kpis"]',
      title: 'What good looks like',
      body: 'A month you can account for: income known, spending recorded, something set aside and a little left over. This is an example, not a plan.',
      output: DashboardGood,
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default dashboard;
