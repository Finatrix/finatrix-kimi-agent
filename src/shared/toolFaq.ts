/**
 * Per-calculator FAQ — the questions each tool page really renders, and the
 * source of its `FAQPage` structured data.
 *
 * Split out from `marketing/toolGuides.ts` (the longer methodology copy) on
 * purpose, and it is the only half of the tool content `src/lib/seo.ts` imports.
 * `seo.ts` is eager on the landing path; the guides are only ever needed by a
 * lazily-loaded tool route. Keeping them in separate modules makes that split
 * deterministic instead of dependent on how the bundler happens to shake one
 * unused export out of a shared chunk.
 *
 * The calculator pages are the primary organic-acquisition surface, and
 * these answers are what an AI answer engine quotes when someone asks how a
 * 50/30/20 split or a step-up SIP works. Every answer is written against what
 * the tool actually computes — the rates, tax treatment and assumptions here are
 * read out of `src/tools/lib/*`, not invented for the page.
 */

import type { ToolId } from './routes';
import type { FaqEntry } from './publicPages';

export const TOOL_FAQ: Record<ToolId, readonly FaqEntry[]> = {
  budget: [
    {
      q: 'What is the 50/30/20 budget rule?',
      a: 'It splits your take-home income three ways: 50% to needs (rent, groceries, utilities, transport, insurance), 30% to wants (eating out, shopping, subscriptions) and 20% to savings and investments. It is a starting frame for a conversation about priorities, not a law — the useful part is seeing which of the three your actual spending overshoots.',
    },
    {
      q: 'Should I use my gross or take-home salary?',
      a: 'Take-home — the amount that actually reaches your bank account after tax and deductions. Budgeting from gross salary overstates every category by whatever you never see, which is precisely the mistake the split is meant to expose.',
    },
    {
      q: 'What if my rent alone is more than 50% of my income?',
      a: 'That is common in Mumbai, Bengaluru and Delhi NCR, and it does not mean you are doing it wrong. Treat 50/30/20 as a diagnostic: if needs are structurally over 50%, the lever is usually housing or income, not the discretionary spending most budgets attack first.',
    },
  ],
  expenses: [
    {
      q: 'Do I have to connect my bank account?',
      a: 'No. FinatriX has no bank connection at all — you log spending yourself. That is slower than automatic import, and it is also why nothing here has read access to your accounts and why the tracker works with no account at all.',
    },
    {
      q: 'Where is my expense data stored?',
      a: 'In your own browser while you are signed out, so it never leaves your device. Sign in and it syncs to your account, isolated at the database level so no other account can read it. You can export everything to a spreadsheet or delete it at any time.',
    },
    {
      q: 'How much detail should I log to get something useful?',
      a: 'Two to four weeks of everything is enough to see the pattern. Most people find the useful discovery is not the large planned expenses they already know about, but a recurring category — food delivery, subscriptions, transport — that is two or three times what they would have guessed.',
    },
  ],
  investmatch: [
    {
      q: 'Is the allocation InvestMatch shows a recommendation?',
      a: 'No. It is an illustrative allocation matched to the risk tolerance and horizon you entered, shown to explain how those two inputs change a portfolio. It is not advice, is not personalised to your full circumstances, and names asset categories rather than specific funds.',
    },
    {
      q: 'Why did my allocation get more conservative than my risk answer?',
      a: 'Because horizon overrides appetite. A high risk tolerance with a two-year goal still gets a downgraded equity weight — the volatility that is survivable over fifteen years is not survivable over two, and a tool that ignored that would be flattering rather than useful.',
    },
    {
      q: 'What return assumptions does it use?',
      a: 'Each modelled path carries its own long-run assumed return, shown on the page beside the allocation, and growth is projected as a monthly SIP. These are illustrative long-run figures for the asset mix, not a forecast, and actual returns will differ — often substantially, and in both directions.',
    },
  ],
  parksmart: [
    {
      q: 'Where should I park money I need in three months?',
      a: 'ParkSmart compares savings accounts, liquid and overnight funds, money-market and ultra-short funds, fixed deposits, T-bills, arbitrage funds and sweep-in FDs on a post-tax basis for the horizon you enter. For very short horizons the ranking usually turns on liquidity and tax treatment rather than headline rate.',
    },
    {
      q: 'Why does the best option change with my tax slab?',
      a: 'Because these instruments are taxed differently. Interest from savings accounts, FDs and debt funds is taxed at your slab, while arbitrage funds are taxed as equity. At a 30% slab that gap can outweigh a higher headline rate entirely — which is the whole point of comparing post-tax rather than gross.',
    },
    {
      q: 'Are the rates in ParkSmart live?',
      a: 'No. They are representative category rates, shown on each option, and are used to compare instruments against each other rather than to quote a product. Always check the current rate with the provider before moving money.',
    },
  ],
  peercompare: [
    {
      q: 'Who am I being compared against?',
      a: 'Published national figures, not other users and not a model of your age group. Income is compared against the PLFS all-India average monthly earnings for regular wage/salaried workers, and your savings rate against the RBI’s net household financial savings rate. Nobody else’s data is read to produce your comparison, and each figure is shown with its publisher and period on the page.',
    },
    {
      q: 'Why is there no benchmark for my age or city?',
      a: 'Because nobody publishes one. MoSPI does not release earnings broken down by age, and no official Indian series reports household savings, investments or net worth by age bracket and city tier. PeerCompare previously showed such a grid; it was invented, and it has been removed rather than re-decorated. Cost of living still adjusts the expense guideline, which is the one thing a cost index actually measures.',
    },
    {
      q: 'Is the score a percentile?',
      a: 'No. It is a 0–100 comparison index across the five measures, where 50 means you are level with the benchmark. A percentile would need a distribution of real people to rank you within, and there is none behind this tool. It was labelled a percentile before, which was wrong.',
    },
    {
      q: 'What should I do if I am below the benchmark?',
      a: 'Treat it as a prompt, not a verdict. The income benchmark in particular is a national average across every occupation and location, so it says nothing about what your role should pay. The useful reading is which single measure — savings rate, emergency buffer, debt service — is furthest from its benchmark, because that is usually the one worth attention first.',
    },
  ],
  goals: [
    {
      q: 'How much should I invest monthly to reach a goal?',
      a: 'Enter the target in today’s money and the number of years, and the planner works backwards to the monthly SIP required — the reverse of what most calculators do. It solves the annuity-due formula for the contribution, across three modelled return paths so you can see how the answer moves with risk.',
    },
    {
      q: 'What is a step-up SIP and should I use one?',
      a: 'A step-up SIP raises your contribution by a fixed percentage each year, here 10%, on the assumption your income rises too. It lowers the starting instalment substantially for the same target. It suits a rising income and is the wrong choice if your contribution has to stay flat.',
    },
    {
      q: 'Should I adjust my goal for inflation?',
      a: 'Yes, for anything more than a few years away. The planner has an inflation toggle that grows your target to what it will actually cost by the time you get there. A 10-year goal priced in today’s rupees is systematically under-funded, and by a wide margin.',
    },
  ],
  lifemap: [
    {
      q: 'What does LifeMap actually simulate?',
      a: 'A whole financial life: income growth by career track, investments, debt, and the major decisions — home, marriage, children, further study, a business — laid out across decades, with the resulting net worth and financial-health score at each stage.',
    },
    {
      q: 'How accurate is a forty-year projection?',
      a: 'As a forecast, not accurate at all, and it is not offered as one. Its value is comparative: the difference between two scenarios is far more robust than either absolute number, so use it to see how much one decision moves the curve rather than to predict a balance in 2066.',
    },
    {
      q: 'Why does my career field change the projection so much?',
      a: 'Because income growth rate compounds for longer than any other input in the model. Over decades, a difference in the rate at which earnings rise dominates differences in savings rate or return — which is the single most useful thing this simulation shows.',
    },
  ],
  networth: [
    {
      q: 'What counts as net worth?',
      a: 'Everything you own valued at what it is worth today — bank balances, deposits, mutual funds and stocks, EPF, PPF and NPS, property, gold — minus everything you owe: home loan, vehicle loan, education loan, personal loan and any credit-card balance you are carrying. The answer is a single number at a single point in time, and it can legitimately be negative early in a career.',
    },
    {
      q: 'How often should I update it?',
      a: 'Once a month is plenty, and once a quarter still works. Balances carry forward here, so you only re-enter what actually changed — a salary account and a loan outstanding move every month, a property valuation does not. The tracker tells you when something has not been touched in three months, because a stale balance quietly makes the whole figure wrong.',
    },
    {
      q: 'Should I include my house and my home loan?',
      a: 'Include both or neither, never one of them. Counting the loan without the property makes your position look far worse than it is; counting the property without the loan makes it look far better. If you do include property, use a conservative, honest number — the price a buyer would pay this year, not what you hope it becomes.',
    },
    {
      q: 'Does FinatriX value my investments automatically?',
      a: 'No. There is no market data feed and no bank connection here — every balance on the page is one you entered yourself. That is slower than an app that logs into your accounts, and it is also why nothing here has read access to them.',
    },
  ],
};
