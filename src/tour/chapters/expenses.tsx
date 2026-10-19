import { useEffect, useRef, type CSSProperties } from 'react';
import { d, socketed, useCountUp } from '../../walkthrough/artKit';
import { useFitSvgText } from '../../walkthrough/fit';
import { ART_H, ART_W } from '../../walkthrough/geometry';
import { easeInOutCubic } from '../../walkthrough/motion';
import type { IntroArtProps, OutputProps, TourChapter, TourHookContext } from '../types';

/**
 * Chapter: Expense Tracker — log a spend in one line, then watch the month
 * explain itself: pacing against the plan, what is safe to spend, where the
 * money went, and every change on the record.
 *
 * ILLUSTRATIVE FIGURES ONLY. Every amount below is a literal picked to read as
 * an ordinary month that is roughly on pace (about half the budget used, about
 * half the month gone). None is computed by, or imported from, lib/expense,
 * lib/forecast or any other calculator, so the tour can never become a second
 * implementation of a formula.
 */
const EXAMPLE = {
  INR: {
    budget: 50000, spent: 26000, safe: 1600, top: 'Groceries',
    rows: [['Groceries', 2340, 'needs'], ['Fuel', 1800, 'needs'], ['Eating out', 640, 'wants']],
  },
  GENERIC: {
    budget: 3200, spent: 1700, safe: 100, top: 'Groceries',
    rows: [['Groceries', 64, 'needs'], ['Fuel', 45, 'needs'], ['Eating out', 18, 'wants']],
  },
} as const;
const pick = (code: string) => (code === 'INR' ? EXAMPLE.INR : EXAMPLE.GENERIC);

/** Switch the page to one of its four views, unless it is already there. */
const onTab = (tab: 'overview' | 'analytics' | 'recurring' | 'history') =>
  ({ click }: TourHookContext) => { click(`#fx-exp-tab-${tab}[aria-selected="false"]`); };

/* ── Intro illustration: a month of spending, understood ───────────── */

/** Where the orb sits: in the newest entry's icon, then on the verdict. */
const ENTRY_SOCKET = { x: 202, y: 64 };
const VERDICT_SOCKET = { x: 40, y: 248 };

/** Heatmap: a 30-day month starting on a Wednesday, 16 days in. */
const CELL = 17;
const GAP = 3;
const GRID_X = 29.5;
const GRID_Y = 50;
const FIRST_DOW = 2;
const TODAY = 16;
/** How much each elapsed day cost, 0–1 (illustrative). */
const HEAT = [0.2, 0.55, 0.1, 0.35, 0.9, 0.7, 0.15, 0.3, 0.25, 0.6, 0.12, 0.4, 1, 0.5, 0.2, 0.45];

/** The month's chart: the even budget pace, and spending so far. */
const CHART = { x0: 28, x1: 332, base: 224, top: 170 };
const TODAY_X = CHART.x0 + ((CHART.x1 - CHART.x0) * TODAY) / 30;
const SPEND = `M${CHART.x0} ${CHART.base} C 72 216, 124 208, ${TODAY_X} 196`;
const SPEND_AT = 1500;
const SPEND_DUR = 1000;

const SECTION_FILL: Record<string, string> = { needs: 'var(--blue-fill)', wants: 'var(--wants-fill)' };

export function ExpensesArt({ clock, orb, fmt, code }: IntroArtProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  useFitSvgText(svgRef);
  const ex = pick(code);
  const perDay = (n: number) => `${fmt(Math.round(n))} a day`;
  const safe = useCountUp(clock, 2700, 1000, ex.safe, perDay);
  const spendRef = useRef<SVGPathElement>(null);

  // The orb leaves the entry it arrived with and rides the spending line as it
  // draws — same start, duration and easing as the CSS stroke — so the spend
  // visibly becomes part of the month.
  useEffect(() => {
    const path = spendRef.current;
    let len = 0;
    try { len = path?.getTotalLength() ?? 0; } catch { len = 0; }
    if (!path || !len) {
      clock.at(SPEND_AT, () => orb.move({ at: 0, x: TODAY_X, y: 196, s: 0.36 }));
      return;
    }
    clock.tween(SPEND_AT, SPEND_DUR, (p) => {
      const pt = path.getPointAtLength(p * len);
      orb.ride(pt.x, pt.y, 0.4 - 0.06 * p);
    }, easeInOutCubic);
  }, [clock, orb]);

  return (
    <svg ref={svgRef} viewBox={`0 0 ${ART_W} ${ART_H}`} className="wt-art" aria-hidden="true" focusable="false">
      {/* The month so far, one square a day. Darker means more spent. */}
      <g className="wt-rise" style={d(60)}>
        <rect x={20} y={24} width={156} height={132} rx={14} className="wt-pill" />
        <text data-fit={136} x={30} y={41} className="tour-a-tiny">Daily spending</text>
      </g>
      {Array.from({ length: 30 }, (_, i) => {
        const slot = i + FIRST_DOW;
        const x = GRID_X + (slot % 7) * (CELL + GAP);
        const y = GRID_Y + Math.floor(slot / 7) * (CELL + GAP);
        const spent = i < TODAY;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={CELL}
            height={CELL}
            rx={4}
            className={spent ? 'wt-pop' : 'wt-fade'}
            style={{
              ...d(260 + i * 28),
              fill: spent ? 'var(--orange)' : 'var(--fill-04)',
              fillOpacity: spent ? 0.14 + HEAT[i] * 0.66 : 1,
              stroke: i === TODAY - 1 ? 'var(--gold)' : 'none',
              strokeWidth: 1.4,
            } as CSSProperties}
          />
        );
      })}

      {/* Today's entries, newest first. The orb arrives as the newest icon. */}
      <text data-fit={140} x={192} y={41} className="tour-a-tiny wt-fade" style={d(200)}>Logged today</text>
      {ex.rows.map(([label, amount, section], r) => {
        const y = 50 + r * 34;
        return (
          <g key={label} className="wt-push" style={d(420 + r * 110)}>
            {r === 0
              ? <path d={socketed(188, y, 152, 28, 10, ENTRY_SOCKET.x, ENTRY_SOCKET.y, 9)} fillRule="evenodd" className="wt-row" />
              : <rect x={188} y={y} width={152} height={28} rx={10} className="wt-row" />}
            {r > 0 && <circle cx={202} cy={y + 14} r={5} style={{ fill: SECTION_FILL[section] }} />}
            <text data-fit={62} x={216} y={y + 18} className="wt-t-row">{label}</text>
            <text data-fit={50} x={332} y={y + 18} className="wt-t-row" textAnchor="end">{fmt(amount)}</text>
          </g>
        );
      })}

      {/* Spending against the even pace that lands exactly on budget. */}
      <line x1={CHART.x0} x2={CHART.x1} y1={CHART.base} y2={CHART.base} className="wt-axis wt-grow-x" style={d(900)} />
      <path
        d={`M${CHART.x0} ${CHART.base} L ${CHART.x1} ${CHART.top}`}
        className="wt-target wt-fade"
        style={d(1050)}
      />
      <text data-fit={96} x={CHART.x1} y={CHART.top - 6} className="wt-t-gold wt-fade" style={d(1150)} textAnchor="end">Budget pace</text>
      <path
        ref={spendRef}
        d={SPEND}
        pathLength={1}
        className="wt-curve wt-draw"
        style={{ ...d(SPEND_AT), ['--dur' as string]: `${SPEND_DUR}ms`, stroke: 'var(--orange)' } as CSSProperties}
      />
      <path
        d={`M${TODAY_X} 196 L ${CHART.x1} ${CHART.top + 16}`}
        className="tour-a-line wt-fade"
        style={{ ...d(2550), stroke: 'var(--ink3)', strokeDasharray: '2 5' } as CSSProperties}
      />
      <text data-fit={60} x={TODAY_X} y={CHART.base - 4} className="tour-a-tiny wt-fade" style={d(2500)} textAnchor="middle">Today</text>

      {/* The answer the page exists to give. */}
      <g className="wt-card-in" style={d(2600)}>
        <path d={socketed(20, 232, 320, 32, 12, VERDICT_SOCKET.x, VERDICT_SOCKET.y, 11)} fillRule="evenodd" className="wt-pill wt-pill-gold" />
        <text data-fit={140} x={60} y={252} className="wt-t-sub">Safe to spend today</text>
        <text ref={safe} data-fit={120} data-sample={perDay(ex.safe)} x={328} y={253} className="wt-t-label" textAnchor="end">{perDay(ex.safe)}</text>
      </g>
    </svg>
  );
}

/* ── Outputs ────────────────────────────────────────────────────────── */

function ExpensesGood({ fmt, code }: OutputProps) {
  const ex = pick(code);
  return (
    <div>
      <dl className="tour-out-rows">
        <div><dt>Monthly budget</dt><dd>{fmt(ex.budget)}</dd></div>
        <div><dt>Spent, day 16 of 30</dt><dd>{fmt(ex.spent)}</dd></div>
        <div><dt>Daily safe spend</dt><dd>{fmt(ex.safe)}</dd></div>
      </dl>
      <div className="tour-out-bar" aria-hidden="true">
        <span style={{ width: '52%', background: 'var(--orange)', ['--d' as string]: 100 } as CSSProperties} />
      </div>
      <span className="tour-out-chip">On pace · most spent on {ex.top}</span>
    </div>
  );
}

/* ── The chapter ─────────────────────────────────────────────────────── */

const expenses: TourChapter = {
  id: 'expenses',
  title: 'Expense Tracker',
  route: '/tools/expenses',
  tagline: 'Log a spend in one line, and see what is safe to spend.',
  minutes: 5,
  icon: 'expense',
  intro: {
    eyebrow: 'Track the month',
    headline: 'Every spend, understood.',
    body: 'Log what you spend in a few words. The tracker files it against your Budget Builder plan and tells you how the month is pacing, where the money went and what is safe to spend today.',
    Art: ExpensesArt,
    orb: [
      { at: 0, x: ENTRY_SOCKET.x, y: ENTRY_SOCKET.y, s: 0.4 },
      { at: 2650, x: VERDICT_SOCKET.x, y: VERDICT_SOCKET.y, s: 0.5 },
    ],
    duration: 3700,
  },
  steps: [
    /* ── Overview: the month and getting money in ── */
    {
      id: 'months',
      before: onTab('overview'),
      target: '[data-tour="expenses-months"]',
      title: 'Pick the month',
      body: 'Step back through past months or up to a year ahead. Each month keeps the categories it was planned with in Budget Builder, so old records stay filed where they were.',
      hint: 'Press the previous-month arrow, then come back.',
    },
    {
      id: 'io',
      before: onTab('overview'),
      target: '[data-tour="expenses-io"]',
      title: 'Import and export',
      body: 'Import reads a CSV, Excel or PDF statement, or a screenshot, on this device and lets you review every row first. Export saves the month as CSV, Excel or a PDF report.',
    },
    {
      id: 'review',
      target: '[data-tour="expenses-review"]',
      title: 'Smart record review',
      body: 'Flags possible duplicates, odd dates or amounts, and category gaps in this month. They are hints only; open an entry to fix it or leave it as it is.',
    },
    {
      id: 'quickadd',
      before: onTab('overview'),
      target: '[data-tour="expenses-quickadd"]',
      title: 'Log it in one line',
      body: 'Type an amount and a few words. The date, category and payment method are picked up and shown as chips before you press Enter, and it learns from how you file things.',
      hint: 'Type “340 lunch yesterday upi” and read the chips. Esc clears it.',
    },
    {
      id: 'form',
      before: onTab('overview'),
      target: '[data-tour="expenses-form"]',
      title: 'The full form',
      body: 'Adds a merchant, payment method, tags, notes or a recurring mark, and accepts sums like =120/4. A future date schedules the spend; the + button in the corner opens this from any view.',
    },
    {
      id: 'kpis',
      before: onTab('overview'),
      target: '[data-tour="expenses-kpis"]',
      title: 'The month in four numbers',
      body: 'Your budget for the month, what you have spent, what is left or over, and the share used. The colour turns as a month gets close to its limit.',
    },
    {
      id: 'pacing',
      before: onTab('overview'),
      target: '[data-tour="expenses-pacing"]',
      title: 'Safe to spend each day',
      body: 'Daily safe spend divides what is left of your spending budget by the days remaining, today included, with savings left out. Net cash flow is your income less what you spent.',
    },
    {
      id: 'score',
      before: onTab('overview'),
      target: '[data-tour="expenses-score"]',
      title: 'Month score',
      body: 'How closely this month is following your plan, separate from how the plan itself is built. The switch hides any panel you do not want; its heading stays so you can bring it back.',
    },
    {
      id: 'bank',
      before: onTab('overview'),
      target: '[data-tour="expenses-bank"]',
      title: 'Check against the bank',
      body: 'Enter what the account held at the end of the month and see any gap between the bank and what you logged. The closing balance carries forward as next month’s opening.',
      hint: 'Switch the panel on, if it is off, and look at the two fields.',
    },
    {
      id: 'commitments',
      target: '[data-tour="expenses-commitments"]',
      title: 'Bills still to come',
      body: 'Recurring bills this month has not seen yet, worked out from your earlier months, and what stays free to spend once they are paid.',
    },
    {
      id: 'warnings',
      target: '[data-tour="expenses-warnings"]',
      title: 'Budget warnings',
      body: 'Categories at 80% of their budget or past it. Press one to filter the transactions below to exactly what made it that high.',
    },
    {
      id: 'insights',
      target: '[data-tour="expenses-insights"]',
      title: 'Spending insights',
      body: 'Short observations from this month’s figures, each with one thing you could do about it. Explain in more depth asks AI for the longer version.',
    },
    {
      id: 'sections',
      before: onTab('overview'),
      target: '[data-tour="expenses-sections"]',
      title: 'Needs, wants and savings',
      body: 'Each part of your plan against what you have spent in it. Below, a six-month trend splits the same way, and your top categories count real spending only.',
    },
    {
      id: 'catbudgets',
      before: onTab('overview'),
      target: '[data-tour="expenses-catbudgets"]',
      title: 'Every category’s budget',
      body: 'Spent, left and the budget for each category, with a status label. Sort by most spent, closest to limit, section or name; the sparkle asks AI about one.',
      hint: 'Choose “Closest to limit” in the Sort menu.',
    },
    {
      id: 'search',
      target: '[data-tour="expenses-search"]',
      title: 'Search, sort and filter',
      body: 'Search across merchants, categories, amounts, notes, tags and dates, and sort six ways. Filters narrow by date range, amount, category, payment method or recurring.',
      hint: 'Press Filters and pick a category chip.',
    },
    {
      id: 'select',
      target: '[data-tour="expenses-select"]',
      title: 'Change many at once',
      body: 'Select several transactions to move them to a category, add tags, duplicate, export or delete them together. On a phone, a long press starts selecting.',
    },
    {
      id: 'list',
      target: '[data-tour="expenses-list"]',
      title: 'Every transaction, grouped by day',
      body: 'Tap a row to edit it. On a computer the icons beside a row duplicate, delete or ask AI; on a phone, swipe left to delete or right to edit, and Undo brings a deletion back.',
      // The steps after this one live on other views; coming back here from
      // them needs the Overview view on screen again.
      before: onTab('overview'),
    },
    {
      id: 'explainer',
      target: '[data-tour="expenses-explainer"]',
      title: 'What this means',
      body: 'A plain reading of the month, plus the inputs and assumptions behind it. Savings and transfers are counted separately, never as spending.',
    },

    /* ── Analytics ── */
    {
      id: 'analytics',
      target: '[data-tour="expenses-analytics"]',
      title: 'Analytics',
      body: 'Your averages across every month you have tracked, plus your top merchant and category. Before your first spend, it shows what each chart will unlock as you log.',
      before: onTab('analytics'),
    },
    {
      id: 'forecast',
      target: '[data-tour="expenses-forecast"]',
      title: 'Month-end forecast',
      body: 'Where this month is likely to land, with every part shown: bills paid, day-to-day spending, one-offs and bills still to come. With history it gives a likely range too.',
      before: onTab('analytics'),
      needs: ['data'],
    },
    {
      id: 'timeline',
      target: '[data-tour="expenses-timeline"]',
      title: 'Budget timeline',
      body: 'Spending so far against the even pace that ends exactly on budget, and where today’s rate is heading. Switch between daily, weekly and a twelve-month view.',
      hint: 'Press Weekly, then Monthly.',
      before: onTab('analytics'),
      needs: ['data'],
    },
    {
      id: 'heatmap',
      target: '[data-tour="expenses-heatmap"]',
      title: 'Your busiest days',
      body: 'A calendar of the month where darker means more spent; select a day for its total. Further down: category changes against last month and payment methods.',
      hint: 'Select any day to read its total.',
      before: onTab('analytics'),
      needs: ['data'],
    },

    /* ── Recurring and History ── */
    {
      id: 'recurring',
      target: '[data-tour="expenses-recurring"]',
      title: 'Recurring payments',
      body: 'Payments that repeat across months are detected for you, alongside the ones you marked recurring, with an estimated monthly and yearly total.',
      before: onTab('recurring'),
    },
    {
      id: 'history',
      target: '[data-tour="expenses-history"]',
      title: 'A record of every change',
      body: 'Every add, edit and delete, newest first, searchable and filterable by type. A deleted transaction can be restored from here long after Undo has gone.',
      before: onTab('history'),
    },
    {
      id: 'shortcuts',
      title: 'Keyboard shortcuts',
      body: 'Enter logs the quick-add line, Ctrl or ⌘ Enter saves the full form and Esc closes it. Ctrl or ⌘ Z undoes a delete, and the arrow keys move between the four views.',
      needs: ['wide'],
    },
    {
      id: 'good',
      target: '[data-tour="expenses-kpis"]',
      title: 'What good looks like',
      body: 'Spending logged as it happens, roughly in step with the month, with a daily amount you can trust. This is an example, not a target.',
      output: ExpensesGood,
      before: onTab('overview'),
    },
  ],
};

// eslint-disable-next-line react-refresh/only-export-components -- a chapter is data plus its illustration
export default expenses;
