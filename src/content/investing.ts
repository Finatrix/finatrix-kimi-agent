/**
 * Article bodies for the Investing topic.
 *
 * Every figure in `sip-maths` is reproduced from the formulas in
 * `src/tools/lib/goals.ts` — `gpSip` (annuity due) and `gpStepUp` (a binary
 * search over a month-by-month simulation with a 10% annual step). Those
 * functions are parity-pinned, so the article and the calculator will always
 * agree; if you change a figure here, run it through them first.
 *
 * The modelled rates named below (14% / 12% / 8% for the aggressive, moderate
 * and conservative paths, and 6% for inflation adjustment) are the rates
 * `GP_PATHS` actually carries. They are illustrative long-run assumptions, and
 * the articles say so every time they are used.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'sip-maths': {
    summary:
      'A SIP projection is one formula: the future value of an annuity due, where a fixed instalment is invested at the start of each period and compounds at a monthly rate. Every SIP calculator on the internet, including ours, is running it. Knowing it does two useful things — it lets you check any figure a distributor or app quotes you, and it makes visible the part that matters most, which is that the result is far more sensitive to the number of years than to the size of the instalment.',
    keyPoints: [
      'Future value of a monthly SIP = P × [((1+i)^n − 1) / i] × (1+i), where i is the monthly rate and n the number of instalments.',
      'The monthly rate is the annual rate divided by twelve, which is the convention Indian SIP calculators use — not the twelfth root.',
      'Time dominates: ten years of contributions started now and then left alone beats twenty years started a decade later — on half the money in.',
      'A step-up SIP raises the instalment a fixed percentage each year. At 10% a year over a 15-year horizon it cuts the starting instalment by about 42%.',
    ],
    faq: [
      {
        q: 'How is SIP return calculated?',
        a:
          'With the future-value formula for an annuity due: each instalment compounds for the number of months remaining after it is invested, and the total is the sum of those. In closed form it is P × [((1+i)^n − 1) / i] × (1+i). The trailing (1+i) is what makes it an annuity due — it accounts for each instalment being invested at the start of the month rather than the end.',
      },
      {
        q: 'What is a step-up SIP and how much does it help?',
        a:
          'A step-up SIP raises the contribution by a fixed percentage each year — FinatriX models 10% — on the assumption that income rises too. Over a long horizon it lowers the starting instalment needed to reach a given target substantially, because the later, larger instalments do a disproportionate share of the work. It suits a rising income and is the wrong choice if your contribution has to stay flat.',
      },
      {
        q: 'Does a SIP guarantee a return?',
        a:
          'No. A SIP is a payment schedule and carries the full risk of whatever it invests in. An equity SIP can be down 30% or more in a bad year and can end a five-year period below the amount contributed. What it does reliably do is average your entry price and remove the timing decision — which is worth a great deal, but is not a guarantee.',
      },
    ],
    sections: [
      {
        id: 'the-formula',
        title: 'The formula',
        blocks: [
          {
            kind: 'p',
            text: 'A SIP projection is a single closed-form expression. Every SIP calculator you will find, including the one on this site, evaluates it — there is no proprietary model involved and nothing that requires trusting the tool.',
          },
          {
            kind: 'formula',
            label: 'Future value of a monthly SIP (annuity due)',
            expression: 'FV = P × [ ((1 + i)ⁿ − 1) ÷ i ] × (1 + i)',
            where: [
              'P — the monthly instalment.',
              'i — the monthly rate, taken as the annual rate ÷ 12. This is the convention Indian SIP calculators use; it is not the twelfth root of the annual rate, and the two differ slightly.',
              'n — the total number of instalments (years × 12).',
              'The trailing (1 + i) makes it an annuity due: each instalment is invested at the start of the month, so it earns one extra month of growth compared with an ordinary annuity.',
            ],
          },
          {
            kind: 'p',
            text: 'Rearranged for the instalment rather than the outcome, it answers the more useful question — what do I need to put in each month to reach a target?',
          },
          {
            kind: 'formula',
            label: 'Instalment required for a target',
            expression: 'P = (FV × i) ÷ [ ((1 + i)ⁿ − 1) × (1 + i) ]',
            where: ['This is exactly what the Reverse Goal Planner solves.'],
          },
        ],
      },
      {
        id: 'worked-through',
        title: 'Worked through, step by step',
        blocks: [
          {
            kind: 'p',
            text: '₹10,000 a month for 10 years at an assumed 12% a year.',
          },
          {
            kind: 'worked',
            title: '₹10,000 monthly, 120 instalments, 12% a year',
            rows: [
              { label: 'Monthly rate i', value: '0.12 ÷ 12 = 0.01' },
              { label: 'n', value: '10 × 12 = 120' },
              { label: '(1 + i)ⁿ', value: '1.01¹²⁰ = 3.30039' },
              { label: '((1.01¹²⁰ − 1) ÷ 0.01)', value: '230.039' },
              { label: '× P', value: '₹23,00,387' },
              { label: '× (1 + i)', value: '₹23,23,391' },
              { label: 'Total contributed', value: '₹12,00,000' },
            ],
            conclusion:
              'Growth of ₹11,23,391 on ₹12,00,000 contributed. You can reproduce every line of this on any calculator, which is the point of publishing it.',
          },
          {
            kind: 'note',
            title: 'Why the answer looks different elsewhere',
            text: 'Calculators disagree by small amounts for two reasons: whether they treat the instalment as paid at the start or the end of the month, and whether they take the monthly rate as annual ÷ 12 or as the twelfth root. Neither is wrong; they are different conventions. FinatriX uses start-of-month with annual ÷ 12 throughout.',
          },
        ],
      },
      {
        id: 'time-dominates',
        title: 'Why time dominates the instalment',
        blocks: [
          {
            kind: 'p',
            text: 'The formula has an exponent in it, and everything follows from that. The most direct way to see it is to compare two people who invest the same amount each month at the same rate, and differ only in when they do it.',
          },
          {
            kind: 'table',
            caption: 'Both invest ₹10,000 a month at 12%. Balance measured at year 30.',
            head: ['', 'Contributes', 'Total put in', 'Value at year 30'],
            rows: [
              ['Started immediately', 'Years 0–10, then stops and leaves it', '₹12,00,000', '₹2,53,07,659'],
              ['Waited ten years', 'Years 10–30, without missing a month', '₹24,00,000', '₹99,91,479'],
            ],
            note: 'Assumes 12% a year throughout, which no real market delivers smoothly. The comparison between the two is the robust part, not either absolute figure.',
          },
          {
            kind: 'p',
            text: 'The person who contributed half as much, and stopped twenty years earlier, ends with more than two and a half times as much. Nothing about their fund selection or their discipline differed — only the number of years their earliest instalments had to compound.',
          },
          {
            kind: 'warning',
            title: 'What this does not mean',
            text: 'It does not mean you have missed your chance if you are starting later. It means the highest-value action available is to start now rather than to spend months optimising which fund to start with. The cost of a six-month delay is larger than the difference between most reasonable choices.',
          },
        ],
      },
      {
        id: 'step-up',
        title: 'The step-up SIP, and how much it changes',
        blocks: [
          {
            kind: 'p',
            text: 'A step-up SIP raises the instalment by a fixed percentage each year on the assumption that your income rises too. FinatriX models 10% a year. There is no closed form for the instalment it requires, so the planner simulates the full schedule month by month and binary-searches for the starting instalment that lands on the target.',
          },
          {
            kind: 'worked',
            title: 'Reaching ₹1 crore in 15 years at 12%',
            rows: [
              { label: 'Flat SIP throughout', value: '₹19,819 per month' },
              { label: 'Step-up SIP, starting instalment', value: '₹11,516 per month' },
              { label: 'Reduction in the starting instalment', value: '≈ 42%' },
              { label: 'Instalment in the final year', value: '₹11,516 × 1.10¹⁴ = ₹43,732' },
            ],
            conclusion:
              'The step-up almost halves what you have to find in year one, and pays for it with much larger instalments later — by design, on the bet that your income grows faster than 10% is painful.',
          },
          {
            kind: 'p',
            text: 'That bet is the whole decision. If your income genuinely rises, a step-up is strictly better because it front-loads affordability into the years when money is tightest. If your contribution has to stay flat, the schedule will break in year six or seven, and a flat SIP you can actually maintain is the better plan.',
          },
          {
            kind: 'tool',
            toolId: 'goals',
            text: 'Enter a target and a horizon to see the required instalment across all three modelled return paths, with the step-up figure beside each.',
          },
        ],
      },
      {
        id: 'inflation',
        title: 'Adjusting the target for inflation',
        blocks: [
          {
            kind: 'p',
            text: 'A target expressed in today\'s rupees is not the amount you will need. A ₹1 crore goal fifteen years out has to be grown to what it will cost by then before the instalment is solved, or the plan is systematically under-funded from the first month.',
          },
          {
            kind: 'formula',
            label: 'Inflation-adjusted target',
            expression: 'target at maturity = target today × (1 + inflation)^years',
            where: ['FinatriX uses 6% for this adjustment, applied before the instalment is solved.'],
          },
          {
            kind: 'worked',
            title: 'What ₹1 crore in today\'s money costs in 15 years at 6%',
            rows: [
              { label: 'Target in today\'s rupees', value: '₹1,00,00,000' },
              { label: '1.06¹⁵', value: '2.39656' },
              { label: 'Target at maturity', value: '₹2,39,65,582' },
              { label: 'Flat SIP required at 12%', value: '₹47,496 per month, against ₹19,819 unadjusted' },
            ],
            conclusion:
              'The instalment more than doubles. This is the single largest correction most goal plans are missing, and it grows with the horizon — which is exactly the case where people are most confident their number is fine.',
          },
        ],
      },
      {
        id: 'what-it-cannot-tell-you',
        title: 'What the formula cannot tell you',
        blocks: [
          {
            kind: 'list',
            items: [
              'It assumes a constant rate. Real returns arrive in an order, and the order matters enormously near the end of a horizon, when the balance is largest.',
              'It assumes you never miss a month. Interrupted contributions are the most common reason real goals miss, and no formula models them.',
              'It says nothing about which assets deliver the rate you assumed. That is an [asset allocation question](/learn/investing/asset-allocation-basics), and it is where the risk actually lives.',
              'It ignores costs. An expense ratio of 1% a year removes a meaningful share of a 25-year outcome, and it is subtracted from the rate you plugged in.',
            ],
          },
          {
            kind: 'p',
            text: 'None of that makes the projection useless. It makes it a comparison tool rather than a prediction — the difference between two scenarios is far more trustworthy than either absolute figure, which is the same caution that applies to every projection on this site.',
          },
        ],
      },
    ],
  },

  'asset-allocation-basics': {
    summary:
      'Asset allocation is the division of a portfolio between categories — equity, debt, gold, cash — and it explains most of the variation in how a portfolio behaves, particularly how far it falls in a bad year. The decision that matters most is not how much risk you feel comfortable with but how long until you need the money. Volatility that is entirely survivable over fifteen years is not survivable over two, because a market that is down 30% when your deadline arrives leaves you selling at that price. That is why a well-built allocation reduces equity as a goal approaches, regardless of stated appetite.',
    keyPoints: [
      'Allocation drives most of the variation in outcomes; instrument selection within a category drives much less.',
      'Horizon should override stated risk appetite, because appetite is measured in a calm month and horizon is a fact.',
      'Rebalancing is what makes an allocation real — without it, a rising asset quietly takes over the portfolio and raises risk you never chose.',
      'An allocation you would abandon in a 30% drawdown is not your allocation; the one you would actually hold is.',
    ],
    faq: [
      {
        q: 'What is a good asset allocation?',
        a:
          'One matched to the horizon of the money and to a drawdown you would genuinely sit through. Long-horizon money can carry a high equity share because it has time to recover; money needed within two or three years should hold very little, whatever your appetite. There is no single correct split, which is why InvestMatch shows how the allocation moves as you change the horizon rather than naming one answer.',
      },
      {
        q: 'How often should I rebalance?',
        a:
          'Once a year, or when a category drifts more than about five percentage points from its target — whichever comes first. More frequent rebalancing adds cost and tax without a matching benefit. The purpose is not to improve return but to stop the portfolio silently becoming riskier than the one you chose.',
      },
      {
        q: 'Should my age determine my equity share?',
        a:
          'Only loosely. Rules like "100 minus your age in equity" are memorable and crude — they ignore the horizon of the specific goal, your job stability, and whether you have an emergency fund standing between a bad month and your portfolio. Allocate per goal and its date; age is a proxy for horizon, and the real thing is available.',
      },
    ],
    sections: [
      {
        id: 'what-it-is',
        title: 'What asset allocation is, and what it decides',
        blocks: [
          {
            kind: 'p',
            text: 'Asset allocation is how a portfolio is divided between categories — equity, debt, gold, cash. It is the decision made before any specific fund is chosen, and it accounts for far more of how the portfolio behaves than the choice within each category does.',
          },
          {
            kind: 'p',
            text: 'The clearest way to see this is through drawdown rather than return. A portfolio that is 80% equity and one that is 30% equity will both fall in a bad year, but not by amounts that any fund selection could reconcile. Allocation sets the size of the hole; selection adjusts its edges.',
          },
          {
            kind: 'table',
            caption: 'Illustrative behaviour of three allocations in a year when equity falls 35% and debt returns 6%',
            head: ['Allocation', 'Portfolio change', 'What that means on ₹20,00,000'],
            rows: [
              ['80% equity / 20% debt', '−26.8%', '−₹5,36,000'],
              ['50% equity / 50% debt', '−14.5%', '−₹2,90,000'],
              ['20% equity / 80% debt', '−2.2%', '−₹44,000'],
            ],
            note: 'Arithmetic on a stated scenario, not a forecast. A 35% equity fall is a real historical magnitude, not a worst case.',
          },
          {
            kind: 'p',
            text: 'The question that matters is not which row has the best long-run return — over decades the first one probably does. It is which row you would hold through without selling, because the return only accrues to someone still invested at the bottom.',
          },
        ],
      },
      {
        id: 'horizon-beats-appetite',
        title: 'Why horizon outranks risk appetite',
        blocks: [
          {
            kind: 'p',
            text: 'Risk appetite is measured by asking how you would feel about a fall. It is a genuine input and it is also measured in a calm month, by someone imagining a loss rather than experiencing one. Horizon is not a feeling — it is the date the money is needed, and it is knowable exactly.',
          },
          {
            kind: 'p',
            text: 'The reason horizon has to win is mechanical. If your goal is fifteen years out, a 35% fall is a paper loss you have time to recover from and, if you keep contributing, to buy into. If your goal is two years out, the same fall is realised: you sell at that price because the date has arrived.',
          },
          {
            kind: 'note',
            title: 'This is why InvestMatch downgrades on horizon',
            text: 'A high stated risk tolerance combined with a two-year horizon still produces a reduced equity weight. A tool that let appetite override the date would be flattering the user at exactly the point where the cost of being wrong is highest.',
          },
          {
            kind: 'table',
            caption: 'A reasonable starting point by horizon, before any personal adjustment',
            head: ['Time until the money is needed', 'Broad shape', 'Why'],
            rows: [
              ['Under 2 years', 'Cash and short-duration debt', 'No time to recover a fall. See [short-term parking](/learn/saving/where-to-park-short-term-cash).'],
              ['2–5 years', 'Debt-heavy, modest equity', 'Some inflation protection, limited exposure to a badly timed fall.'],
              ['5–10 years', 'Balanced', 'Long enough to absorb a normal cycle, short enough that a severe one still hurts.'],
              ['Over 10 years', 'Equity-heavy', 'Inflation is now the dominant risk, and volatility has time to average out.'],
            ],
            note: 'A starting point to adjust from, not an allocation to adopt. Nothing here is a recommendation to buy any product.',
          },
          {
            kind: 'tool',
            toolId: 'investmatch',
            text: 'Change the horizon and watch the allocation move while the risk answers stay the same. That relationship is the thing worth taking away.',
          },
        ],
      },
      {
        id: 'rebalancing',
        title: 'Rebalancing is what makes an allocation real',
        blocks: [
          {
            kind: 'p',
            text: 'An allocation that is never rebalanced stops being your allocation within a few years. The category that rose takes a larger share, which raises the portfolio\'s risk — silently, and always in the direction of whatever has recently done well.',
          },
          {
            kind: 'worked',
            title: 'A 60/40 portfolio left alone through a strong equity run',
            rows: [
              { label: 'Start', value: '₹6,00,000 equity / ₹4,00,000 debt — 60/40' },
              { label: 'Equity rises 60%, debt rises 12%', value: '₹9,60,000 / ₹4,48,000' },
              { label: 'New split', value: '68.2% / 31.8%' },
            ],
            conclusion:
              'Nobody chose to raise the equity share by eight points. It happened because the portfolio was left alone, and it happened at the point in the cycle when equity was most expensive.',
          },
          {
            kind: 'list',
            items: [
              'Rebalance once a year, or when a category drifts more than about five percentage points from target — whichever comes first.',
              'More frequent rebalancing adds transaction cost and realises tax without a matching benefit.',
              'Rebalancing with new contributions rather than by selling avoids both. Direct fresh money to whichever category is below target.',
              'The purpose is not to improve return. It is to stop the portfolio becoming riskier than the one you chose.',
            ],
          },
        ],
      },
      {
        id: 'per-goal',
        title: 'Allocate per goal, not per person',
        blocks: [
          {
            kind: 'p',
            text: 'Rules like "100 minus your age in equity" are memorable and crude. They use age as a proxy for horizon when the actual horizon is available, and they treat all of a person\'s money as one pool when in practice it is several with different dates.',
          },
          {
            kind: 'p',
            text: 'A 32-year-old saving for a house deposit in three years and for retirement in twenty-eight has two horizons, and one allocation cannot serve both. Splitting them is not complexity for its own sake — it is what prevents the house deposit being exposed to a market that does not care about your timeline.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              'List each goal with its amount and its date.',
              'Fund the [emergency fund](/learn/saving/emergency-fund-size) first. It is not a goal and it is not allocated — it sits outside the portfolio so the portfolio never has to be sold in a bad month.',
              'Set an allocation per goal from its horizon.',
              'Solve the instalment for each with the [SIP formula](/learn/investing/sip-maths), using the modelled return for that allocation.',
              'Step allocations down as each date approaches, rather than at a single retirement moment.',
            ],
          },
          {
            kind: 'tool',
            toolId: 'lifemap',
            text: 'See how the sequence of goals interacts across a whole career, rather than one goal at a time.',
          },
        ],
      },
    ],
  },

  'expense-ratios': {
    summary:
      'A fund\'s expense ratio is charged as an annual percentage of the money you hold, deducted daily from the net asset value rather than billed, which is why it is invisible and why it is underestimated. The effect compounds against you exactly as returns compound for you: on a long SIP, a difference of one percentage point in annual charges typically removes a mid-teens percentage of the final corpus. The reason it deserves attention out of proportion to its size is that it is the only input in the whole projection you actually control — you cannot choose your return, but you can choose what you pay for the attempt.',
    keyPoints: [
      'The charge is deducted from NAV daily, never invoiced, which is why it costs more attention than it receives.',
      'One percentage point over a twenty-year horizon typically removes a mid-teens share of the final corpus.',
      'Fees are the only variable in a projection you control; the return is an assumption and the horizon is a fact.',
      'A lower fee is not automatically better — compare like with like, because a different mandate is a different product.',
    ],
    faq: [
      {
        q: 'How is an expense ratio actually charged?',
        a: 'It is accrued daily against the fund\'s assets and reflected in the net asset value, so you never see a deduction on a statement. The return you observe is already net of it. That invisibility is the whole reason a fee that would be scrutinised if invoiced annually goes unexamined for years when it is embedded.',
      },
      {
        q: 'Is a cheaper fund always the better choice?',
        a: 'Only when the two funds are genuinely doing the same job. Comparing an index fund with an actively managed fund on fee alone ignores that they have different mandates and different expected behaviour. Within a category, where the mandate is comparable, the fee is one of the few differences that is knowable in advance rather than hoped for.',
      },
      {
        q: 'Does the fee matter for a short horizon?',
        a: 'Much less. One percentage point over two years is roughly two per cent of the balance — real, but small next to the variation in return over the same period. The fee dominates precisely where the return assumption is most uncertain, which is over decades, because the fee is the part of the calculation that is certain.',
      },
    ],
    sections: [
      {
        id: 'what-it-is',
        title: 'What the number means',
        blocks: [
          {
            kind: 'p',
            text: 'An expense ratio is the annual cost of running a fund, expressed as a percentage of the assets in it, covering management, administration and distribution. It is charged against the fund\'s assets rather than billed to you, and accrued daily.',
          },
          {
            kind: 'formula',
            label: 'What a fee costs a lump sum over n years',
            expression: 'Ending value = P × (1 + r − f)^n  versus  P × (1 + r)^n',
            where: [
              'P — the amount invested.',
              'r — the gross annual return before charges.',
              'f — the annual expense ratio.',
              'n — the number of years held.',
              'The gap between the two widens with n, because the fee is deducted from a balance that would otherwise have compounded.',
            ],
          },
          {
            kind: 'p',
            text: 'That last line is the whole point and the part that is counter-intuitive. The fee does not merely cost you the fee — it costs you every rupee that fee would have earned for the rest of the horizon, which is why a small annual number becomes a large terminal one.',
          },
        ],
      },
      {
        id: 'the-arithmetic',
        title: 'What one percentage point costs',
        blocks: [
          {
            kind: 'worked',
            title: 'A twenty-year horizon at an assumed 11% gross',
            rows: [
              { label: 'Amount invested', value: '₹10,00,000 lump sum' },
              { label: 'Horizon', value: '20 years' },
              { label: 'Gross return assumed', value: '11% a year' },
              { label: 'At 0.5% expense ratio', value: '₹10,00,000 × 1.105^20 ≈ ₹72.6 lakh' },
              { label: 'At 1.5% expense ratio', value: '₹10,00,000 × 1.095^20 ≈ ₹60.5 lakh' },
              { label: 'Difference', value: '≈ ₹12.1 lakh, or about 17% of the higher figure' },
            ],
            conclusion:
              'One percentage point of annual fee removed roughly a sixth of the outcome. Both figures are illustrative — the 11% is an assumption, not a forecast — but the ratio between them depends only on the fee difference and the horizon, and that part is arithmetic.',
          },
          {
            kind: 'note',
            title: 'The same effect runs in reverse on inflation',
            text: 'A fee reduces the return you keep in exactly the way inflation reduces what the result buys. Both are annual percentages compounding against a growing balance, and both are routinely left out of a mental projection — see [real versus nominal returns](/learn/inflation/real-returns).',
          },
        ],
      },
      {
        id: 'what-to-do',
        title: 'What to actually do with this',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Compare within a category, never across.** Two funds with the same mandate can be compared on fee. A cheaper fund with a different mandate is not a cheaper version of the same thing.',
              '**Check the direct option.** Where a fund offers direct and regular plans, the difference between them is distribution cost and nothing else. Whether that cost buys you advice you value is a real question; whether it changes the underlying portfolio is not.',
              '**Weight it by horizon.** For a two-year goal the fee is a rounding error. For a twenty-five-year one it is among the largest controllable variables in the whole plan.',
              '**Do not chase the last few basis points.** Below a point, the difference is smaller than the variation in tracking or in your own contribution consistency, and optimising it is displacement activity.',
            ],
          },
          {
            kind: 'p',
            text: 'The broader discipline is to be sceptical of every number in a projection and to know which ones are assumptions. The return is an assumption. The fee is a fact stated in the scheme document — and the [SIP formula](/learn/investing/sip-maths) shows exactly where in the arithmetic it lands.',
          },
          {
            kind: 'tool',
            toolId: 'goals',
            text: 'The Reverse Goal Planner solves for the instalment a target requires at a given assumed return — running it at two rates a percentage point apart shows the same effect from the contribution side.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Investing has a small amount of mathematics and a large amount of behaviour. The mathematics is genuinely simple — compounding, a monthly instalment, an assumed rate — and it is written out in full in these guides so that you can reproduce any figure yourself rather than trusting a calculator, including ours.',
      'The behaviour is where outcomes are actually decided. The difference between a portfolio held through a 30% drawdown and the same portfolio sold at the bottom is far larger than the difference between any two sensible asset allocations. That is why every allocation on this site is checked against your time horizon, not only your stated appetite for risk: appetite is what you feel in a calm month, horizon is a fact.',
      'Nothing on FinatriX is investment advice, and no specific fund, stock or product is ever named as a recommendation. These pages explain mechanisms — what a SIP is, how allocation changes an outcome, what an expense ratio costs over twenty years — so that you can evaluate a real product yourself or ask a registered adviser a better question.',
    ],
    definitions: [
      {
        term: 'SIP (Systematic Investment Plan)',
        definition:
          'A fixed amount invested at a fixed interval, usually monthly, into a mutual fund. It is a schedule, not an asset class — a SIP into an equity fund carries equity risk in full. Its advantage is that it removes the decision of when to invest, which is the decision people get most wrong.',
      },
      {
        term: 'Asset allocation',
        definition:
          'How money is divided between asset categories — equity, debt, gold, cash. It explains most of the variation in a portfolio\'s return and almost all of the variation in how much it falls in a bad year.',
      },
      {
        term: 'Compounding',
        definition:
          'Returns earning returns. Its effect is not linear: over a 25-year horizon at 11%, most of the final balance is growth on growth rather than on the money you contributed, which is why starting date matters more than instalment size.',
      },
      {
        term: 'Volatility and risk',
        definition:
          'Volatility is how much a value moves about. Risk is the chance of not having the money when you need it. Over a long horizon they diverge sharply: a volatile asset can be low-risk for a 20-year goal, and a stable one can be high-risk if it never beats inflation.',
      },
      {
        term: 'Expense ratio',
        definition:
          'The annual percentage a fund charges on assets. It looks trivial and compounds like everything else: 1% a year on a 25-year SIP typically removes a mid-teens percentage of the final corpus.',
      },
    ],
    faq: [
      {
        q: 'How much should I invest every month?',
        a:
          'Work backwards from the goal rather than forwards from what feels affordable. A target amount and a horizon determine the required monthly instalment through the future-value formula for a series of payments — the Reverse Goal Planner solves exactly this. The answer you can actually sustain every month for the whole horizon beats a larger one you abandon in month seven.',
      },
      {
        q: 'Is a SIP safe?',
        a:
          'A SIP is a payment schedule, not a safety feature. It carries whatever risk the underlying fund carries — an equity SIP can and does fall 30% or more in a bad year. What a SIP genuinely does is spread your entry price over time and remove the temptation to wait for a better moment, which historically costs more than it saves.',
      },
      {
        q: 'What return should I assume for planning?',
        a:
          'Use a long-run assumption for the asset mix and treat it as illustrative, not as a forecast. FinatriX models conservative, moderate and aggressive paths and shows the assumed rate for each on the page. Any single number is wrong; the value of the exercise is seeing how much the answer moves when the rate does.',
      },
      {
        q: 'Should my allocation change as the goal gets closer?',
        a:
          'Yes, and this is the mechanical part of investing that most reliably prevents damage. Volatility that is survivable over fifteen years is not survivable over two, so the equity share should fall as the date approaches regardless of how comfortable you feel. InvestMatch downgrades allocation on horizon for this reason, even when the stated risk appetite is high.',
      },
    ],
  },
  articles,
};

export default content;
