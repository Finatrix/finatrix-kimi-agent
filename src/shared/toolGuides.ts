/**
 * Long-form educational content for each calculator: what it is for, how to use
 * it, how it computes its answer, and where its limits are.
 *
 * This is the "methodology and helpful explanation" layer the launch review
 * asked for, and it exists for three audiences at once — a first-time visitor
 * who needs to know what to type in, a returning user checking an assumption,
 * and an AI answer engine deciding whether this page is worth citing when
 * someone asks how a step-up SIP is calculated. All three are served by the same
 * honest description, which is why there is one copy of it rather than a
 * user-facing version and an SEO version.
 *
 * `method` is written against `src/tools/lib/*` — the rates, tax treatment and
 * formulas named here are the ones the code runs. Those formulas are frozen and
 * parity-tested (see `src/test/parity/`), so this copy describes a contract, not
 * an implementation detail that may move. If a formula ever legitimately
 * changes, this text changes with it.
 *
 * NOT imported by `src/lib/seo.ts` — deliberately. `seo.ts` is eager on the
 * landing critical path and this module is only ever needed by a lazily-loaded
 * tool route or the Help Centre. The per-tool FAQ, which `seo.ts` does need,
 * lives in the smaller `toolFaq.ts` for exactly that reason.
 */

import type { ToolId } from './routes';

/**
 * A worked example: named inputs, then the conclusion drawn from them.
 *
 * Mirrors the `worked` block in the article vocabulary deliberately. A reader
 * who arrives on a calculator from a search result and one who arrives from a
 * guide should meet the same shape of explanation, and reusing the shape means
 * the two surfaces cannot drift into different house styles.
 */
export interface WorkedExample {
  title: string;
  rows: readonly { label: string; value: string }[];
  conclusion: string;
}

export interface ToolGuide {
  /** What question the tool answers, in one sentence a stranger would understand. */
  purpose: string;
  /** How to get a useful answer out of it. Ordered. */
  steps: readonly string[];
  /** How the number is actually produced. The methodology section. */
  method: readonly string[];
  /**
   * One example carried end to end: what was entered, what came out, and what it
   * means. A calculator with no worked example asks a first-time visitor to
   * guess what a plausible input looks like, which is the point at which most
   * of them leave.
   */
  worked: WorkedExample;
  /**
   * The mistakes people actually make with THIS tool — not generic advice.
   *
   * Distinct from `limits`, and the distinction matters: a limit is something
   * the tool does not do, while a mistake is something the reader does that
   * makes the answer wrong. The first is a disclaimer, the second is help.
   */
  mistakes: readonly string[];
  /** What it assumes, and what it deliberately does not do. */
  limits: readonly string[];
  /**
   * Sibling tools worth visiting next, most relevant first.
   *
   * Hand-picked rather than "every other tool": a related-links block that lists
   * every sibling on every tool page is a footer, not a recommendation, and
   * search engines read it as one too.
   */
  related: readonly ToolId[];
}

export const TOOL_GUIDES: Record<ToolId, ToolGuide> = {
  budget: {
    purpose:
      'Splits your monthly take-home income across needs, wants and savings using the 50/30/20 frame, so you can see which of the three your real spending overshoots.',
    steps: [
      'Enter your monthly take-home pay — the amount that actually reaches your bank account, not your CTC.',
      'Fill in what you currently spend in each category. Estimates are fine; the pattern matters more than the precision.',
      'Add any category the built-in list is missing — the split is recalculated around it.',
      'Compare your actual split against 50/30/20 and look at the largest single gap first.',
    ],
    method: [
      'Take-home income is divided 50% needs, 30% wants, 20% savings to produce the target for each group.',
      'Your entered spending is summed per group and compared against that target, so the output is a gap per group rather than a single score.',
      'Categories are fixed to one of the three groups, which is what keeps the comparison stable when you add your own.',
    ],
    worked: {
      title: 'A ₹80,000 take-home month',
      rows: [
        { label: 'Needs target (50%)', value: '₹40,000' },
        { label: 'Wants target (30%)', value: '₹24,000' },
        { label: 'Savings target (20%)', value: '₹16,000' },
        { label: 'Actual needs entered', value: '₹48,000 — rent alone is ₹28,000' },
        { label: 'Actual wants entered', value: '₹20,000' },
        { label: 'Actual savings', value: '₹12,000' },
      ],
      conclusion:
        'Needs overshoot by ₹8,000 and savings undershoot by ₹4,000. The gap is housing, not groceries — so the lever is rent, flatmates or income, and the useful response is to hold the savings share and let needs and wants trade against each other.',
    },
    mistakes: [
      'Entering CTC instead of take-home. It inflates all three targets at once and makes the split look achievable when it is not.',
      'Putting the whole EMI in needs. Only the contractual minimum is a need; anything above it is savings, because it increases net worth.',
      'Leaving out annual bills. Insurance, festivals and school fees do not appear in a typical month and are what break the budget four times a year.',
      'Treating a needs share above 50% in a metro as a discipline failure. It is usually structural, and attacking food spending will not fix a rent problem.',
    ],
    limits: [
      'It works from figures you enter. Nothing is imported from a bank, so the split is only as good as your inputs.',
      '50/30/20 is a heuristic, not a rule. In high-rent metros a needs share above 50% is structural rather than a failure of discipline.',
      'It budgets a typical month. Annual lumps — insurance premiums, festival spending, travel — need spreading across twelve months yourself.',
    ],
    related: ['expenses', 'goals', 'peercompare'],
  },

  expenses: {
    purpose:
      'Logs what you actually spend, categorises it, and shows the monthly pattern behind the total — the input every other decision on this site depends on.',
    steps: [
      'Log expenses as they happen, or in one sitting at the end of the week. Both work; consistency is what matters.',
      'Let each entry pick up a category — the frequently-used ones surface first as you build history.',
      'Read the month view for the pattern, not the total. The recurring category that surprises you is the finding.',
      'Export to a spreadsheet, or feed the totals into Budget Builder to see them against a 50/30/20 target.',
    ],
    method: [
      'Every entry is stored against a calendar day in your own local time, so a late-evening expense lands on the day you actually spent it.',
      'Category totals are summed per calendar month, and past entries keep their original category even after you rename or reorganise your categories.',
      'Nothing is inferred or auto-categorised from a bank feed, because there is no bank feed.',
    ],
    worked: {
      title: 'What four weeks of honest logging usually shows',
      rows: [
        { label: 'Expected food delivery spend', value: '~₹4,000 a month' },
        { label: 'Actual, logged', value: '₹11,200 across 34 orders' },
        { label: 'Largest single order', value: '₹890' },
        { label: 'Median order', value: '₹310' },
        { label: 'Subscriptions found', value: '7, of which 3 unused' },
      ],
      conclusion:
        'The finding is frequency, not size — no individual order was extravagant and there were thirty-four of them. That is a different problem from an expensive habit and it has a different fix, which is why reading the log by recurring category beats reading it by largest transaction.',
    },
    mistakes: [
      'Skipping cash and UPI. That is precisely where the underestimate lives, because no statement exists to remind you.',
      'Changing behaviour during the measurement month. It destroys the only baseline you will get, and the baseline is the point.',
      'Categorising too finely. Twenty categories collapse into guesswork; six or eight are enough to find the problem.',
      'Judging the exercise in week one. The first week is always incomplete — the data starts saying something at week four.',
    ],
    limits: [
      'Manual entry means missed expenses stay missed. A week of complete logging beats a month of partial logging.',
      'There is no bank or UPI connection, by design — the trade for that is that nothing here can read your accounts.',
      'It records what happened. It does not judge it, and it does not set limits for you.',
    ],
    related: ['budget', 'peercompare', 'goals'],
  },

  investmatch: {
    purpose:
      'Turns a short risk-and-horizon questionnaire into an illustrative portfolio allocation, and projects how a monthly SIP into it could grow.',
    steps: [
      'Answer the questions honestly rather than aspirationally — a risk answer you would abandon in a bad quarter is worse than a conservative one.',
      'Enter the monthly amount you can genuinely sustain, not the one you hope to reach.',
      'Read the allocation as asset categories and weights, and the projection as an illustration of the arithmetic.',
      'Change the horizon and watch the allocation move. That relationship is the thing worth taking away.',
    ],
    method: [
      'Your answers produce a risk profile, which maps to an allocation across asset categories.',
      'The horizon can downgrade that allocation: a short goal reduces the equity weight regardless of stated appetite, because volatility that is survivable over fifteen years is not survivable over two.',
      'Growth is projected as an annuity-due monthly SIP at the modelled long-run return for the allocation, and is also shown adjusted for inflation.',
    ],
    worked: {
      title: 'The same risk answers, two different horizons',
      rows: [
        { label: 'Stated risk appetite', value: 'High, in both runs' },
        { label: 'Monthly amount', value: '₹20,000' },
        { label: 'Run A — horizon', value: '18 years' },
        { label: 'Run A — allocation', value: 'Equity-heavy; the horizon supports the volatility' },
        { label: 'Run B — horizon', value: '3 years' },
        { label: 'Run B — allocation', value: 'Substantially de-risked, despite the same stated appetite' },
      ],
      conclusion:
        'One input changed and the allocation moved a long way. That relationship is the thing worth taking from the tool: appetite is what you feel in a calm month, horizon is a fact, and a short horizon overrides a high appetite every time.',
    },
    mistakes: [
      'Answering the risk questions aspirationally. An appetite you would abandon in a bad quarter produces an allocation you will sell at the bottom.',
      'Entering the amount you hope to invest rather than the one you can sustain every month for the whole horizon.',
      'Reading the projection as a forecast. It is one arithmetic path at one assumed rate — change the rate and see how far the answer moves.',
      'Using it before an emergency fund exists. The first real emergency then gets funded by selling this portfolio at whatever price the week offers.',
    ],
    limits: [
      'It is educational, not advice, and it is not a recommendation to buy anything. No specific fund or product is named or suggested.',
      'Returns are long-run illustrative assumptions for an asset mix, not forecasts. Real returns vary widely, in both directions.',
      'It knows only what you typed. It has no view of your debts, dependants, insurance, job security or existing portfolio.',
    ],
    related: ['goals', 'parksmart', 'lifemap'],
  },

  parksmart: {
    purpose:
      'Ranks the places to keep short-term idle cash by what you actually keep after tax, for the amount and horizon you enter.',
    steps: [
      'Enter the amount and how long before you need it back.',
      'Set your income-tax slab — it changes the ranking more than the headline rates do.',
      'Read the post-tax column, not the rate column.',
      'Check the liquidity note on the winner: an option you cannot exit when you need to is not the winner.',
    ],
    method: [
      'Each option carries a representative category rate, shown on the page, and gross return is computed for your amount and horizon.',
      'Tax is then applied by instrument type: interest from savings accounts, deposits, T-bills and debt funds is taxed at your slab; arbitrage funds are taxed as equity, at 20% short-term or 12.5% long-term above the exemption; savings-account interest gets the 80TTA exemption pro-rated to the holding period.',
      'Options are ranked on the post-tax figure, with a minimum sensible holding period enforced per instrument so nothing is recommended for a horizon it does not suit.',
    ],
    worked: {
      title: 'Why the tax slab reorders the list',
      rows: [
        { label: 'Amount', value: '₹5,00,000' },
        { label: 'Horizon', value: '9 months' },
        { label: 'Option A — interest-bearing', value: '7.5% gross, taxed at slab' },
        { label: 'Option B — equity-taxed', value: '7.5% gross, taxed as equity' },
        { label: 'At a 5% slab', value: 'A keeps ~7.1%; B keeps ~6.6% → A wins' },
        { label: 'At a 30% slab', value: 'A keeps ~5.3%; B keeps ~6.6% → B wins' },
      ],
      conclusion:
        'Identical headline rates, and the ranking reverses on the slab alone. This is why ParkSmart asks for your slab before it ranks anything, and why the post-tax column is the one to read.',
    },
    mistakes: [
      'Comparing the rate column instead of the post-tax column. At a high slab the tax treatment moves the ranking more than a full point of headline rate.',
      'Ignoring the liquidity note on the winner. An option you cannot exit on the day you need it is not the winner, whatever it returns.',
      'Assuming the 80TTA exemption applies. It is an old-regime provision; under the new regime treat savings interest as taxed at slab.',
      'Entering a horizon longer than the money is genuinely free for. Breaking a deposit early costs a rate penalty the comparison did not include.',
    ],
    limits: [
      'Rates are representative category figures for comparison, not live quotes. Confirm the current rate before moving money.',
      'The 80TTA exemption applies under the old tax regime; if you are on the new regime, treat that option as taxed at slab.',
      'Credit and duration risk are described per option but are not modelled as a probability. "Very low risk" is not "no risk".',
    ],
    related: ['goals', 'investmatch', 'budget'],
  },

  peercompare: {
    purpose:
      'Puts your income, savings rate, expenses, emergency buffer and debt service next to published national benchmarks and standard planning guidelines, so the numbers have a scale.',
    steps: [
      'Enter your income, city and the figures the tool asks for, including your total monthly EMIs.',
      'Read each measure against its own benchmark — an overall verdict is less useful than one weak measure.',
      'Check the label under each card: published figure, derived from your inputs, or planning guideline. They carry different weight.',
      'Start with the largest gap. It is usually the emergency buffer or the savings rate.',
      'Come back after a few months rather than a few days; these measures move slowly by nature.',
    ],
    method: [
      'Income is compared against the PLFS all-India average monthly earnings for regular wage/salaried workers — the midpoint of the separately published figures for men and women. It is national: MoSPI publishes no breakdown by age or city.',
      'Your savings rate is compared against the RBI’s net household financial savings as a share of gross national disposable income, a national-accounts aggregate net of new household borrowing.',
      'The expense benchmark is worked out from your OWN income — the share left after saving at the national rate — then scaled by a cost-of-living index for your city. It is not a claim about what anyone else there spends.',
      'The emergency-fund and debt-service benchmarks are standard planning guidelines, labelled as such rather than presented as measurements.',
      'Each measure becomes a 0–100 comparison index, where 50 is level with the benchmark. It is not a percentile, and no ranking against other people is implied.',
    ],
    worked: {
      title: 'Why the debt question changed',
      rows: [
        { label: 'Income', value: '₹1,66,667 a month (₹20 lakh a year)' },
        { label: 'Home loan outstanding', value: '₹40,00,000' },
        { label: 'Monthly EMI', value: '₹50,000' },
        { label: 'Old reading', value: 'Debt ÷ annual income = 200% → "Heavy debt load"' },
        { label: 'Correct reading', value: 'EMI ÷ monthly income = 30% → comfortably inside the 36% guideline' },
      ],
      conclusion:
        'The tool used to divide total outstanding debt by annual income, call it "debt-to-income" and warn above 40% — which is the conventional threshold for the entirely different monthly-payment ratio. Every borrower with a mortgage tripped it and was told to clear loans before investing. The debt-service ratio asks for your EMIs instead, which is what the guideline was always stated against.',
    },
    mistakes: [
      'Reading the overall index instead of the weakest measure. One thin emergency buffer is more actionable than an average that looks fine.',
      'Reading the income benchmark as a target for your role. It is a national average across every occupation and location in India.',
      'Checking it monthly. These measures move slowly; a few months apart is the useful interval, and weekly checking measures noise.',
      'Leaving the EMI field at zero when you do have loans. The debt-service measure is the one thing on the page a lender would also compute.',
    ],
    limits: [
      'Only two of the five benchmarks are published figures. The expense benchmark is derived from your own income, and two are planning conventions — the card under each one says which.',
      'There is no age or city benchmark for income, savings or net worth, because no official Indian series publishes one. The tool does not invent a substitute.',
      'The income figure covers regular wage/salaried workers only, who are about a quarter of Indian employment. It is not an average across all earners.',
      'It knows nothing about dependants, health, caregiving or where you started, all of which legitimately change what "good" looks like.',
    ],
    related: ['budget', 'expenses', 'lifemap'],
  },

  goals: {
    purpose:
      'Starts from the goal instead of the instalment: enter a target and a horizon, and it works backwards to the monthly SIP that reaches it.',
    steps: [
      'Enter the target in today’s money, and the number of years you have.',
      'Turn on inflation adjustment for anything more than a few years out — otherwise the target is systematically under-funded.',
      'Add anything you have already saved towards it; the required instalment drops accordingly.',
      'Compare the three return paths, and consider the step-up option if your income is rising.',
    ],
    method: [
      'The required contribution is solved from the annuity-due future-value formula for the target, horizon and the modelled return of each path.',
      'Three paths are shown — aggressive, moderate and conservative — each with its own long-run assumed return and the instrument categories that mix implies.',
      'The step-up figure raises the contribution 10% each year and is solved by simulating the whole schedule and binary-searching for the starting instalment that lands on the target.',
      'With inflation adjustment on, the target is grown to what it will cost at the end of the horizon before any of the above runs.',
    ],
    worked: {
      title: 'What the inflation toggle does to a 15-year goal',
      rows: [
        { label: 'Target in today’s money', value: '₹30,00,000' },
        { label: 'Horizon', value: '15 years' },
        { label: 'Inflation adjustment', value: 'Off' },
        { label: 'Instalment solved', value: 'Against ₹30,00,000' },
        { label: 'Inflation adjustment', value: 'On, at 6%' },
        { label: 'Target becomes', value: '₹30,00,000 × 1.06^15 ≈ ₹71,90,000' },
      ],
      conclusion:
        'The same goal, priced correctly, needs well over twice the instalment. Leaving the adjustment off does not make the goal cheaper — it funds about 42% of it and discovers the shortfall in year fifteen.',
    },
    mistakes: [
      'Leaving inflation adjustment off for anything more than a couple of years out. It systematically under-funds the goal, always in the same direction.',
      'Forgetting to enter what is already saved toward the goal, which makes the required instalment look larger than it is.',
      'Choosing the aggressive path because it produces the smallest instalment. The path is an assumption about returns, not a lever you control.',
      'Planning several goals independently when they compete for the same monthly surplus — the tool solves one goal at a time and will not flag the conflict.',
    ],
    limits: [
      'Returns are illustrative long-run assumptions per path, not forecasts, and a real sequence of returns will not be smooth.',
      'It assumes you keep contributing every month for the whole horizon. Interruptions are the most common reason real goals miss.',
      'It plans one goal at a time. Several goals competing for the same monthly surplus need a priority decision this tool does not make for you.',
    ],
    related: ['investmatch', 'lifemap', 'budget'],
  },

  lifemap: {
    purpose:
      'Simulates income, investments, debt and the major life decisions across decades, so you can see how much one choice today moves your net worth at 60.',
    steps: [
      'Set your starting position — age, income, career field and what you have now.',
      'Pick the life goals that are genuinely yours; each one has a cost and a timing the simulation respects.',
      'Read the curve and the financial-health score together, not the final number alone.',
      'Change one input, re-run, and compare. The difference between two runs is the output worth trusting.',
    ],
    method: [
      'Income grows from your starting salary at a rate set by career field, with milestone stages across the working life.',
      'Investable surplus compounds at the modelled return, while debts amortise, and each life decision applies its cost at the age you place it.',
      'A financial-health score is derived at each stage from the resulting position, so the curve is readable as more than a single balance.',
    ],
    worked: {
      title: 'Reading the difference between two runs, not either one',
      rows: [
        { label: 'Starting age', value: '30' },
        { label: 'Run A', value: 'Baseline — current income, current savings rate' },
        { label: 'Run B', value: 'Identical, except each raise is split 50/50 from age 30' },
        { label: 'What to compare', value: 'The gap between the two curves at 60' },
        { label: 'What not to compare', value: 'Either final number against a real-world expectation' },
      ],
      conclusion:
        'The output worth trusting is the difference, because both runs share every assumption. One curve read alone is a forty-year forecast, which nothing can produce honestly; two curves read against each other isolate the single decision you changed.',
    },
    mistakes: [
      'Reading the final number as a prediction. It is one path under stated assumptions — its value is comparative.',
      'Changing several inputs between runs, which makes the difference uninterpretable. Change one thing at a time.',
      'Selecting every life goal on offer. The simulation respects each cost and date, and a scenario nobody intends to live tells you nothing.',
      'Ignoring the financial-health score in favour of the balance. A high balance reached through a fragile position is not the same outcome.',
    ],
    limits: [
      'A forty-year projection is not a forecast and is not offered as one. Its value is comparative — scenario against scenario.',
      'It cannot model a career break, a health event, a market crash at the wrong moment, or an inheritance. Real lives contain all four.',
      'Career growth multipliers are modelled averages for a field. Individual outcomes inside any field vary far more than the gap between fields.',
    ],
    related: ['goals', 'investmatch', 'peercompare'],
  },
  networth: {
    purpose:
      'Records what you own and what you owe, month by month, so the single number underneath every other decision — assets minus liabilities — stops being a guess.',
    steps: [
      'Add the accounts you can see today. One bank balance is a legitimate start; the rest can arrive over weeks.',
      'For anything you owe, enter the outstanding amount from your latest statement — the balance, not the EMI.',
      'Come back once a month and update only what actually moved. Everything else carries forward.',
      'Read the trend rather than the total. The direction over six months is the finding; the figure on any one day is not.',
    ],
    method: [
      'Net worth is one subtraction: the sum of all asset balances minus the sum of all liability balances, for the month you are looking at.',
      'Balances carry forward. An account holds its most recently recorded value until you enter a new one, so a month you skipped does not read as a collapse.',
      'An account contributes nothing to any month before its first recorded balance — a loan taken in March does not reach back and reduce February.',
      'Liabilities are stored as positive amounts owed and subtracted, so a sign error cannot quietly invert the answer.',
      'Nothing is projected, grown or inflation-adjusted. There is no market data feed and no bank connection: every figure is one you entered.',
    ],
    worked: {
      title: 'A first month, four accounts',
      rows: [
        { label: 'Salary account', value: '₹1,40,000' },
        { label: 'Equity mutual funds', value: '₹6,20,000' },
        { label: 'EPF balance', value: '₹4,10,000' },
        { label: 'Home loan outstanding', value: '₹32,00,000' },
        { label: 'Flat, conservatively valued', value: '₹48,00,000' },
        { label: 'Net worth', value: '₹27,70,000' },
      ],
      conclusion:
        'Assets of ₹59,70,000 against liabilities of ₹32,00,000. Debt is 54% of assets, which is ordinary for a recent home purchase — and the number worth watching is not the ₹27.7 lakh but how the two sides move apart over the next twenty-four months.',
    },
    mistakes: [
      'Counting the home loan but not the home, or the reverse. One of them alone is not a half-answer, it is a wrong one.',
      'Valuing property or gold at what you hope it is worth. An optimistic valuation moves your net worth without anything having happened.',
      'Recording the EMI instead of the outstanding balance. The EMI is a monthly payment; the balance is the debt.',
      'Updating everything every month. You do not need to — carry-forward exists so you only touch what changed, and re-entering unchanged figures is how people stop doing this by month three.',
      'Reading a single month. Net worth is a slow measure; a market dip or a bonus makes any one reading unrepresentative.',
    ],
    limits: [
      'Every balance is entered by hand. There is no bank connection and no market feed, so the figure is exactly as current as your last update.',
      'It values nothing for you. Property, gold, unlisted shares and vehicles are worth whatever you decide to record.',
      'It does not project. There is no assumed return, no repayment schedule and no retirement date here — LifeMap is where that modelling lives.',
      'It is a stock, not a flow. Net worth says what you hold, not what you earn or spend; Budget Builder and the Expense Tracker cover that side.',
    ],
    related: ['lifemap', 'goals', 'expenses'],
  },
};
