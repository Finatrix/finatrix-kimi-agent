/**
 * Where a result leads.
 *
 * Every calculator on this site ends in a number, and a number on its own is
 * where most personal-finance tools stop. The product this one is trying to be
 * — Understand → Calculate → Plan → Track — only holds together if the answer
 * names the next move: a budget gap is an expenses question, a net-worth figure
 * is a LifeMap input, a goal contribution is something the dashboard should be
 * tracking from now on.
 *
 * The relationships are declared HERE rather than inside each page for the same
 * reason `TOOL_GUIDES[id].related` is: eight pages each holding their own idea
 * of what comes next drift, and no test can see it happen. This registry is
 * pure data, so `nextSteps.test.ts` can assert every `href` is a route the app
 * really serves and that no tool sends the reader back to itself.
 *
 * WHAT THIS IS NOT
 * ----------------
 * Not a funnel. Two or three entries per tool, each with a reason a reader would
 * recognise as true, and nothing here is gated behind an account. A tool that
 * has no honest next step should have an empty list rather than a manufactured
 * one — "you might also like" is the shape this deliberately avoids.
 *
 * Pure data. No DOM, no React.
 */

import type { ToolId } from './routes';

export interface NextStep {
  /** A route this app really serves. Asserted by the test. */
  href: string;
  /** The link's own words — an action, not a product name. */
  label: string;
  /** Why this follows from the result just shown. One sentence. */
  reason: string;
}

/**
 * The educational reading of a result, and where it leads.
 *
 * `meaning` is the "what this means" line every result screen shows above its
 * next steps: interpretation, never instruction. `actions` are things a reader
 * could go and check or think about — they stay on the page and are deliberately
 * phrased as questions and observations rather than directives, because the
 * moment they read as "do this with your money" the product has crossed from
 * education into advice it is not licensed to give.
 */
export interface ToolOutcome {
  /** Educational next steps. Read on the page; no link, no commitment. */
  actions: readonly string[];
  /** Where to continue inside FinatriX. Ordered, most relevant first. */
  next: readonly NextStep[];
}

const DASHBOARD: NextStep = {
  href: '/tools/dashboard',
  label: 'See it on your dashboard',
  reason: 'Your saved figures roll up into one view of the month, so you can watch this change.',
};

export const TOOL_OUTCOMES: Record<ToolId, ToolOutcome> = {
  budget: {
    actions: [
      'Compare the split against a month you have actually recorded — a target you have never tested is a guess.',
      'Look at the largest single gap first. One structural line (rent, an EMI, a commute) usually explains more of it than every small category combined.',
      'Check whether annual bills — insurance, festivals, school fees — are spread across twelve months or waiting to break one.',
    ],
    next: [
      {
        href: '/tools/expenses',
        label: 'Record what you actually spent',
        reason: 'The budget is a plan. Expenses is the evidence that tells you whether the plan held.',
      },
      {
        href: '/tools/goals',
        label: 'Turn the savings share into a target',
        reason: 'The 20% line is a number without a purpose until a goal is attached to it.',
      },
      DASHBOARD,
    ],
  },

  expenses: {
    actions: [
      'Look at the categories that repeat rather than the largest single entry — a recurring payment costs twelve times what it appears to.',
      'Check the gap between what you planned and what you recorded. The direction of that gap matters more than its size in any one month.',
      'Note anything you had forgotten you were paying for. That is usually the most useful thing a first month of tracking produces.',
    ],
    next: [
      {
        href: '/tools/budget',
        label: 'Set the plan against what you found',
        reason: 'A budget built from a month you have measured is the one you are able to keep.',
      },
      {
        href: '/tools/goals',
        label: 'Point the surplus at something',
        reason: 'Money left over with no destination is the money that quietly disappears next month.',
      },
      DASHBOARD,
    ],
  },

  goals: {
    actions: [
      'Check the contribution against what your budget says is actually free each month, not against what you hope is free.',
      'Try a longer deadline before a higher return. Time is the input you control; the return path is the one you do not.',
      'Note which return path each figure assumes. The lowest monthly contribution is the one carrying the most market risk.',
    ],
    next: [
      {
        href: '/tools/budget',
        label: 'Check the contribution fits the month',
        reason: 'A goal only works if the monthly amount survives contact with your other commitments.',
      },
      {
        href: '/tools/lifemap',
        label: 'See the goal inside a whole life',
        reason: 'LifeMap places this goal next to everything else you are saving for, decade by decade.',
      },
      DASHBOARD,
    ],
  },

  investmatch: {
    actions: [
      'Treat the split as an illustration of what a given risk appetite tends to look like, not as a portfolio to buy.',
      'Check the horizon you entered against the money you might need sooner. Anything needed within three years usually does not belong in a growth allocation at all.',
      'Compare the assumed return against what the instruments in your market have actually delivered, and read the assumption date.',
    ],
    next: [
      {
        href: '/tools/goals',
        label: 'Attach the monthly amount to a goal',
        reason: 'An allocation answers "how"; a goal is what tells you how much and by when.',
      },
      {
        href: '/tools/parksmart',
        label: 'Compare homes for the short-term part',
        reason: 'Money you may need within a year or two is a different question from a long-run allocation.',
      },
      DASHBOARD,
    ],
  },

  parksmart: {
    actions: [
      'Check how much of this you might genuinely need at short notice before weighing anything that locks the money up.',
      'Read the post-tax column rather than the headline rate — the ranking changes with your tax rate, not with the advertised return.',
      'Confirm the current rate with the provider. These are indicative averages carrying a review date, not quotes.',
    ],
    next: [
      {
        href: '/tools/budget',
        label: 'Work out how many months this covers',
        reason: 'Whether cash should be liquid depends on your monthly outgoings, which the budget already holds.',
      },
      {
        href: '/tools/networth',
        label: 'Record it on your balance sheet',
        reason: 'Cash parked somewhere still counts as an asset — Net Worth is where it stops being invisible.',
      },
      DASHBOARD,
    ],
  },

  peercompare: {
    actions: [
      'Treat an illustrative benchmark score as a model output. It does not measure your statistical rank or how many people have more or less.',
      'Check the reference definition, currency, age band and location before interpreting a comparison.',
      'Review your actual income, spending, assets and debts. A difference from a reference does not establish what you need or what to change.',
    ],
    next: [
      {
        href: '/tools/budget',
        label: 'Understand your monthly cash flow',
        reason: 'A budget puts your own income, expenses and commitments together.',
      },
      {
        href: '/tools/networth',
        label: 'Track your own trend instead',
        reason: 'Compare your recorded assets and debts over time using consistent definitions.',
      },
      DASHBOARD,
    ],
  },

  lifemap: {
    actions: [
      'Treat every figure beyond today as a projection, not a forecast. It shows what the assumptions imply, not what will happen.',
      'Change one assumption at a time and watch which one moves the line most. That is the lever worth your attention.',
      'Check the early years rather than the endpoint. Compounding makes distant totals dramatic and the near years decisive.',
    ],
    next: [
      {
        href: '/tools/goals',
        label: 'Cost one of these decisions properly',
        reason: 'The goal planner turns a milestone on the timeline into a monthly figure you can test.',
      },
      {
        href: '/tools/networth',
        label: 'Start the balance sheet this projects from',
        reason: 'The simulation begins from what you own today; recording it makes every later year less of a guess.',
      },
      DASHBOARD,
    ],
  },

  networth: {
    actions: [
      'Watch the direction across months rather than the absolute figure. The trend is the signal; a single month is noise.',
      'Check that debts are recorded at their outstanding balance rather than the original amount borrowed.',
      'Note which assets you could actually reach this week. Net worth counts illiquid things at full value, and a month does not.',
    ],
    next: [
      {
        href: '/tools/lifemap',
        label: 'Project this forward',
        reason: 'LifeMap takes today’s balance sheet as its starting point and carries it to retirement.',
      },
      {
        href: '/tools/goals',
        label: 'Count what you already have towards a goal',
        reason: 'Existing assets reduce the monthly contribution a target needs — often by more than expected.',
      },
      DASHBOARD,
    ],
  },
};

/** The outcome block for a tool, or null when it has none. */
export function outcomeFor(id: string): ToolOutcome | null {
  return (TOOL_OUTCOMES as Record<string, ToolOutcome | undefined>)[id] ?? null;
}
