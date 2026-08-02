/**
 * Article bodies for the Saving topic.
 *
 * The tax treatment described in `where-to-park-short-term-cash` is the same
 * treatment `src/tools/lib` applies in ParkSmart — slab rate on interest income,
 * equity rates on arbitrage funds, 80TTA pro-rated under the old regime. If one
 * ever changes, both change together, because a guide that explains a rule the
 * calculator does not apply is worse than no guide.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'emergency-fund-size': {
    summary:
      'Size an emergency fund in months of essential expenses, not as a share of income. Three to six months suits a salaried earner with a stable role and no dependants. Six to twelve is the right range for a single-income household, a freelancer or anyone whose sector is not hiring — because the number is really a bet on how long it would take to replace your income, and that varies far more than spending does. Essential expenses means what continues in a bad month: rent, food, utilities, EMIs, insurance, school fees. Discretionary spending stops on its own and should not be funded.',
    keyPoints: [
      'The multiplier is a replacement-time estimate. Ask how long a role like yours takes to refill, then fund that.',
      'Size it on essential expenses only — including discretionary spending inflates the target by a third or more for no benefit.',
      'A second earner in the household is worth roughly halving the target; a sole earner with dependants roughly doubles it.',
      'Build to three months before investing beyond an employer match, then continue the fund and investing in parallel.',
    ],
    faq: [
      {
        q: 'Is three months of expenses enough for an emergency fund?',
        a:
          'For a salaried professional in a hiring market, with no dependants and a second earner in the household, three months is a reasonable floor. For a sole earner, a freelancer, a commission-based role, or anyone in a sector with a freeze, three months is thin — six to twelve reflects how long replacing that income realistically takes. The multiplier is a statement about your job market, not a universal number.',
      },
      {
        q: 'Should an emergency fund include my insurance premiums?',
        a:
          'Yes. Health and term insurance premiums are among the most important expenses to keep paying during a period without income, because lapsing cover at exactly the moment your finances are fragile is how a difficult few months becomes a permanent setback. Count them in essential expenses.',
      },
      {
        q: 'What counts as an emergency?',
        a:
          'A loss of income, a medical event, an urgent home or vehicle repair that cannot wait, or an unavoidable family obligation. A planned expense you did not save for is not an emergency, and neither is an investment opportunity. Defining this in advance is what stops the fund being spent on something that was merely urgent-feeling.',
      },
    ],
    sections: [
      {
        id: 'what-the-number-means',
        title: 'What the number actually represents',
        blocks: [
          {
            kind: 'p',
            text: 'An emergency fund is usually quoted as "three to six months of expenses", which hides the reasoning and therefore makes the number impossible to adapt. What the multiplier really encodes is a bet on **replacement time** — how long it would take you to restore your income after losing it.',
          },
          {
            kind: 'p',
            text: 'Stated that way the range stops being arbitrary. A software engineer in a hiring market and a specialist in a sector with a freeze do not have the same replacement time, so they should not have the same fund, no matter how similar their salaries are.',
          },
          {
            kind: 'note',
            title: 'It is insurance, not an investment',
            text: 'Judged as an investment an emergency fund looks poor — low return, taxed at slab, losing to inflation. Judged as what it is, it is protection against selling investments at a bad price or borrowing at 36–42% during the worst month of your year. That is the comparison it should be held to.',
          },
        ],
      },
      {
        id: 'sizing-it',
        title: 'Sizing it: essential expenses, then a multiplier',
        blocks: [
          {
            kind: 'p',
            text: 'The base is essential monthly expenses, not total spending and not income. Discretionary spending stops on its own during a genuine emergency, so funding it inflates the target by a third or more and delays the point at which the fund is finished.',
          },
          {
            kind: 'list',
            items: [
              '**Include:** rent or home-loan EMI, utilities and connectivity, groceries, transport, health and term insurance premiums, school fees, other loan EMIs, essential medication, dependant support.',
              '**Exclude:** eating out, subscriptions, travel, shopping, gym, discretionary upgrades — everything that would genuinely pause.',
            ],
          },
          {
            kind: 'p',
            text: 'Then apply a multiplier based on how quickly your income could be replaced, and how many incomes the household has.',
          },
          {
            kind: 'table',
            caption: 'Suggested multiplier by situation',
            head: ['Situation', 'Months of essential expenses'],
            rows: [
              ['Two earners, both salaried, stable sectors', '3'],
              ['Single earner, salaried, no dependants', '4–6'],
              ['Single earner with dependants', '6–9'],
              ['Freelance, contract, or commission-based income', '9–12'],
              ['Sector in a hiring freeze, or a specialised role with few employers', '9–12'],
              ['Own a business with variable drawings', '12'],
            ],
            note: 'A judgement framework, not a regulation. Move within it based on how long people in your role actually take to find the next one.',
          },
          {
            kind: 'worked',
            title: 'A single earner with dependants, ₹80,000 take-home',
            rows: [
              { label: 'Rent', value: '₹28,000' },
              { label: 'Utilities, groceries, transport', value: '₹15,000' },
              { label: 'Insurance premiums', value: '₹2,500' },
              { label: 'Loan EMIs', value: '₹6,000' },
              { label: 'School fees', value: '₹4,500' },
              { label: 'Essential expenses', value: '₹56,000 per month' },
              { label: 'Target at 6 months', value: '₹3,36,000' },
              { label: 'Target at 9 months', value: '₹5,04,000' },
            ],
            conclusion:
              'Note that total spending is ₹80,000 but the base is ₹56,000. Sizing on total spending would have set a target ₹1,44,000 higher at six months — roughly three extra months of saving for protection that was never needed.',
          },
          {
            kind: 'tool',
            toolId: 'budget',
            text: 'Separate your needs from your wants first — the needs total is the base this calculation runs on.',
          },
        ],
      },
      {
        id: 'building-it',
        title: 'Building it without stalling everything else',
        blocks: [
          {
            kind: 'p',
            text: 'The full target is intimidating and does not have to be reached before anything else begins. The protection is not linear — the first month of cover removes far more risk than the sixth.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              'Get to one month of essential expenses as fast as possible, ahead of any new investment. This is the buffer that stops a card balance forming.',
              'Continue to three months, still ahead of investing beyond an employer retirement match.',
              'From three months onward, build the fund and invest in parallel. Waiting until month nine to start investing costs more in compounding than the extra cover is worth.',
              'Re-check the base annually, and whenever rent, an EMI or a dependant changes. The multiplier is stable; the expenses underneath it are not.',
            ],
          },
          {
            kind: 'warning',
            title: 'Define what counts before you need to decide',
            text: 'A loss of income, a medical event, an urgent repair that cannot wait, an unavoidable family obligation. A planned expense you did not save for is not an emergency, and neither is an investment opportunity. Writing this down in advance is what keeps the fund intact for the thing it was built for.',
          },
        ],
      },
      {
        id: 'where-it-lives',
        title: 'Where it should sit',
        blocks: [
          {
            kind: 'p',
            text: 'Availability outranks return completely here, but that does not mean a savings account for the whole balance. Splitting it captures most of the available return while keeping the part you might need tonight genuinely instant.',
          },
          {
            kind: 'list',
            items: [
              '**About one month** in a savings account — instant, no decision, no settlement delay.',
              '**The rest** in a liquid or overnight fund, or a sweep-in fixed deposit. Settlement is typically one working day and there is no penalty for taking it out.',
            ],
          },
          {
            kind: 'p',
            text: 'What to avoid is anything with a lock-in or an exit penalty, and anything that can be down 20% in the month you need it. The full post-tax comparison of the short-term options is in [where to park short-term cash](/learn/saving/where-to-park-short-term-cash).',
          },
        ],
      },
    ],
  },

  'where-to-park-short-term-cash': {
    summary:
      'For short-term money the ranking turns on tax treatment and liquidity far more often than on headline rate. Interest from savings accounts, fixed deposits, T-bills and debt funds is added to your income and taxed at your slab, so at a 30% slab a nominally attractive 7% becomes about 4.8%. Arbitrage funds are taxed as equity, which at a high slab can outweigh a lower gross rate entirely. The right question is never "which pays most" but "which pays most after my tax, and can I get it back on the day I need it".',
    keyPoints: [
      'Compare post-tax, always. At a 30% slab the tax treatment moves the ranking more than a full percentage point of headline rate does.',
      'Match the instrument to the date: instant-access money and money with a known date three years out have different right answers.',
      'A rate you cannot exit is not a rate. Check the penalty for early withdrawal before comparing anything.',
      'The 80TTA exemption on savings-account interest applies under the old tax regime only — under the new regime, treat it as taxed at slab.',
    ],
    faq: [
      {
        q: 'Where should I keep money I need in six months?',
        a:
          'Somewhere that settles within a working day and carries no exit penalty — typically a savings account for the portion you might need instantly, and a liquid or overnight fund or a sweep-in fixed deposit for the rest. At a six-month horizon the difference between the best and worst sensible option is small in rupees; the difference between accessible and locked is not.',
      },
      {
        q: 'Are liquid funds safe?',
        a:
          'They carry low but non-zero risk. They hold very short-maturity debt, so interest-rate risk is minimal, but credit risk exists and has caused losses in Indian debt funds before. They are not deposit-insured the way a bank balance is up to ₹5 lakh. "Very low risk" is the honest description; "no risk" is not.',
      },
      {
        q: 'Why does my tax slab change which option is best?',
        a:
          'Because these instruments are taxed under different rules rather than at different rates on the same base. Interest income is taxed at your slab, while arbitrage funds are taxed as equity — 20% short-term or 12.5% long-term above the exemption. At a 5% slab the gap barely matters; at 30% it can reverse the entire ranking.',
      },
    ],
    sections: [
      {
        id: 'the-real-question',
        title: 'The question is post-tax, not headline rate',
        blocks: [
          {
            kind: 'p',
            text: 'Short-term cash products are advertised on their gross rate, which is the one number that does not determine what you keep. Interest income in India is added to your total income and taxed at your slab; equity-taxed products are taxed under a different regime entirely. At a high slab that difference is larger than any realistic gap in headline rates.',
          },
          {
            kind: 'formula',
            label: 'Post-tax return on interest income',
            expression: 'post-tax rate = gross rate × (1 − effective slab rate)',
            where: [
              'Effective slab rate includes the 4% health and education cess: a 30% slab is 31.2% effective.',
              'This applies to savings accounts, fixed deposits, recurring deposits, T-bills and debt mutual funds.',
            ],
          },
          {
            kind: 'worked',
            title: 'The same 7% gross, at three slabs',
            rows: [
              { label: '5% slab (5.2% effective)', value: '7% × 0.948 = 6.64%' },
              { label: '20% slab (20.8% effective)', value: '7% × 0.792 = 5.54%' },
              { label: '30% slab (31.2% effective)', value: '7% × 0.688 = 4.82%' },
            ],
            conclusion:
              'A 1.8 percentage-point spread on one identical product, created entirely by tax. No comparison that ignores this is telling you anything useful.',
          },
        ],
      },
      {
        id: 'the-options',
        title: 'The options, and what each is actually for',
        blocks: [
          {
            kind: 'table',
            caption: 'Short-term parking options by access, risk and tax treatment',
            head: ['Option', 'Access', 'Main risk', 'Taxed as'],
            rows: [
              ['Savings account', 'Instant', 'Inflation', 'Interest — at slab'],
              ['Sweep-in fixed deposit', 'Instant, partial break', 'Rate penalty on early break', 'Interest — at slab'],
              ['Overnight fund', '1 working day', 'Very low', 'Interest — at slab'],
              ['Liquid fund', '1 working day', 'Low credit risk', 'Interest — at slab'],
              ['Money-market / ultra-short fund', '1 working day', 'Credit and mild rate risk', 'Interest — at slab'],
              ['Fixed deposit (term)', 'Penalty to break', 'Rate penalty; inflation over long terms', 'Interest — at slab'],
              ['Treasury bill', 'Tradeable, or hold to maturity', 'Effectively none on default', 'Interest — at slab'],
              ['Arbitrage fund', '2–3 working days', 'Low; return varies with market spreads', 'Equity — 20% short-term, 12.5% long-term'],
            ],
            note: 'Category descriptions, not product recommendations. No specific fund, bank or scheme is named anywhere on FinatriX.',
          },
          {
            kind: 'p',
            text: 'The last row is the one that changes rankings. Because arbitrage funds are taxed as equity rather than at slab, a 30%-slab taxpayer can keep more from a lower gross rate there than from a higher one on a deposit. At a 5% slab the same choice is close to irrelevant.',
          },
          {
            kind: 'note',
            title: 'The 80TTA exemption',
            text: 'Up to ₹10,000 of savings-account interest is exempt in a financial year — but only under the old tax regime. Under the new regime it does not apply, so treat savings-account interest as fully taxed at slab. ParkSmart pro-rates this to your holding period rather than assuming a full year.',
          },
        ],
      },
      {
        id: 'matching-horizon',
        title: 'Matching the option to the date',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Might need it this week** — savings account. Any return is a bonus; the job is availability.',
              '**One to six months** — liquid or overnight fund, or a sweep-in FD. Settlement in a working day, no penalty, meaningfully better than a savings rate.',
              '**Six months to two years, date known** — a fixed deposit maturing near the date, or a money-market fund. Certainty is worth more here than the last few basis points.',
              '**Two to three years, some flexibility** — an arbitrage fund becomes worth considering at a high slab, once its long-term equity treatment applies.',
              '**More than three years** — this is no longer short-term cash. It belongs in an [asset allocation](/learn/investing/asset-allocation-basics) rather than a parking product, because at that horizon inflation is the dominant risk.',
            ],
          },
          {
            kind: 'warning',
            title: 'Liquidity is a feature you pay for, and should',
            text: 'A rate you cannot access when you need it is not a rate. Before comparing anything, check the exit penalty and the settlement time. An emergency fund in a five-year deposit is a common and expensive version of this mistake.',
          },
          {
            kind: 'tool',
            toolId: 'parksmart',
            text: 'Enter your amount, horizon and tax slab to rank these options by what you actually keep after tax, with the minimum sensible holding period enforced per instrument.',
          },
        ],
      },
      {
        id: 'risk-honesty',
        title: 'What "low risk" leaves out',
        blocks: [
          {
            kind: 'p',
            text: 'Every option above is low risk relative to equity, and none of them is risk-free. Being precise about the differences matters more here than anywhere else on this site, because this is money you are counting on being there.',
          },
          {
            kind: 'list',
            items: [
              'Bank deposits are insured by the DICGC up to ₹5 lakh per depositor per bank, covering principal and interest together. Debt mutual funds carry no equivalent guarantee.',
              'Liquid and money-market funds hold short-maturity debt and carry credit risk. Indian debt funds have taken losses on downgrades before; "very low risk" is accurate and "no risk" is not.',
              'Arbitrage fund returns depend on the spread between spot and futures prices, which compresses in quiet markets. The tax treatment is dependable; the return is not fixed.',
              'A savings account is the only option with genuinely no capital risk, and it is also the one most likely to lose to inflation in real terms.',
            ],
          },
        ],
      },
    ],
    sources: [
      {
        label: 'Income Tax Department — deductions under section 80TTA',
        url: 'https://www.incometax.gov.in/iec/foportal/help/individual/return-applicable-1/deductions',
      },
      {
        label: 'DICGC — deposit insurance coverage',
        url: 'https://www.dicgc.org.in/FD_CoverageOfInsurance.html',
      },
    ],
  },

  'sinking-funds': {
    summary:
      'A sinking fund is a pot you add to monthly for an expense you know is coming but that does not arrive monthly — insurance renewals, festival spending, school fees, travel, the next phone. The arithmetic is trivial: total the annual amount and divide by twelve. What it changes is not how much you spend but when the money is set aside, and that turns a predictable bill from an emergency into a transfer. It is also the single most effective fix for the household that has an emergency fund and still finds itself using a credit card every March, because the problem there was never the size of the fund.',
    keyPoints: [
      'Sinking funds cover known, dated expenses; the emergency fund covers unknown, undated ones. Mixing them destroys both.',
      'The whole method is: list the annual bills, total them, divide by twelve, and treat the result as a fixed monthly cost.',
      'Most households find the total surprising — the number is usually one to two months of income spread across the year.',
      'Keep them somewhere that settles within a day; the money is spoken for and should not be exposed to a market.',
    ],
    faq: [
      {
        q: 'How is this different from an emergency fund?',
        a: 'By whether the expense is known. A sinking fund covers things you can name and date — the insurance renewal in August, the festival spending in October. An emergency fund covers the things you cannot: a job loss, a medical event, an urgent repair. Paying a known annual bill out of the emergency fund is the most common way that fund quietly stops existing.',
      },
      {
        q: 'Do I need a separate account for each one?',
        a: 'No, and separate accounts for eight categories is a good way to abandon the system. One account holding the total, with a simple record of what each portion is for, works perfectly well. Some people prefer two — one for the near-term items and one for the long-dated ones — but the bookkeeping matters far more than the number of accounts.',
      },
      {
        q: 'What if I cannot afford the full monthly amount?',
        a: 'Fund the non-negotiable items first — insurance premiums above all, because lapsing cover to save a premium is the worst available trade — and part-fund the discretionary ones. A partly funded travel pot still reduces the shortfall in the month the bill lands, which is the whole objective. The alternative is not saving the money; it is borrowing it later at a rate.',
      },
    ],
    sections: [
      {
        id: 'the-arithmetic',
        title: 'The arithmetic, which takes twenty minutes once',
        blocks: [
          {
            kind: 'p',
            text: 'Go through a year of statements and list every expense that did not occur monthly. Total it. Divide by twelve. That figure is a fixed monthly cost you have been paying all along without budgeting for it.',
          },
          {
            kind: 'worked',
            title: 'A household\'s annual lumps, converted',
            rows: [
              { label: 'Term and health insurance premiums', value: '₹42,000' },
              { label: 'Vehicle insurance and servicing', value: '₹18,000' },
              { label: 'Festival spending and gifts', value: '₹25,000' },
              { label: 'One trip', value: '₹35,000' },
              { label: 'Device replacement, amortised', value: '₹15,000' },
              { label: 'Annual total', value: '₹1,35,000' },
              { label: 'Monthly share', value: '₹11,250' },
            ],
            conclusion:
              'Over ₹11,000 a month of genuinely predictable cost that never appears in a typical month\'s budget. A household treating its budget as complete without this line is under-budgeting by that amount every month and discovering it four or five times a year.',
          },
          {
            kind: 'p',
            text: 'The figure is usually larger than people expect — commonly one to two months of income across a year. That is not a sign of overspending; it is a sign that the annual expenses were invisible, which is exactly the condition this fixes.',
          },
        ],
      },
      {
        id: 'the-separation',
        title: 'Why it must be separate from the emergency fund',
        blocks: [
          {
            kind: 'p',
            text: 'The emergency fund has one job — to be there when income stops or something breaks. Every rupee of it spent on something that was entirely predictable is a rupee not available for something that was not.',
          },
          {
            kind: 'p',
            text: 'In practice the two blur together because both are cash sitting in an account. The separation has to be bookkeeping rather than physical: a note of what portion of the balance is spoken for and by which bill. Without it, the emergency fund appears to be six months of expenses and is actually four, and the discovery happens at the worst possible time.',
          },
          {
            kind: 'p',
            text: 'The sizing question for the other fund is a genuinely different one — see [how big an emergency fund should be](/learn/saving/emergency-fund-size).',
          },
        ],
      },
      {
        id: 'where-to-keep-it',
        title: 'Where the money sits',
        blocks: [
          {
            kind: 'p',
            text: 'Sinking-fund money is spoken for and dated, which rules out anything that can be down when the bill arrives. It also sits for an average of six months, which is long enough that a savings account is not the only option.',
          },
          {
            kind: 'list',
            items: [
              '**Under three months to the bill:** a savings account or a sweep-in deposit. The return is irrelevant over that period; availability is not.',
              '**Three to twelve months:** a liquid or overnight fund, or a short fixed deposit timed to mature before the bill. Settles within a working day and beats a savings account.',
              '**Never equity.** A market that is down 20% the month the school fee is due converts a solved problem into a borrowed one.',
            ],
          },
          {
            kind: 'tool',
            toolId: 'parksmart',
            text: 'ParkSmart ranks the short-horizon options on what you keep after tax for a given amount and holding period, which is the relevant comparison for money with a date on it.',
          },
          {
            kind: 'p',
            text: 'The post-tax ranking between these options changes with your slab and your horizon, which is covered in detail in [where to park short-term cash](/learn/saving/where-to-park-short-term-cash).',
          },
          {
            kind: 'p',
            text: 'One refinement is worth the extra five minutes. Sort the list by the month the bill falls due and fund the nearest ones first, rather than spreading the monthly contribution evenly across every category. A March insurance renewal needs to be fully funded by February; a December trip has ten more months to accumulate. Funding in date order means the pot is never short for the bill that is actually next, which is the failure that matters — an underfunded travel pot in month three is an inconvenience, and an underfunded premium is a lapse in cover.',
          },
          {
            kind: 'p',
            text: 'It is also worth deciding in advance what happens to a surplus. Some years the vehicle needs no repair and the festival budget goes unspent, and the honest options are to roll it forward against next year\'s total or to move it into the emergency fund. What should not happen is that it quietly returns to general spending, because then the following year starts from zero again and the whole exercise has to be repeated rather than compounding into a steadily larger buffer.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Almost every savings question collapses into two: how much should be set aside, and where should it live in the meantime. They get conflated constantly, which is how people end up with an emergency fund locked in a five-year deposit, or a house deposit sitting in a savings account losing to inflation for a decade.',
      'The sorting rule is time. Money you might need this month has exactly one job — to be there — and any return it earns is a bonus. Money with a date on it three years out can accept some volatility in exchange for beating inflation. Money you will not touch for fifteen years should not be in a savings product at all.',
      'The emergency fund is the part people get wrong most often, and it is worth being precise about: it is not an investment, it is insurance against having to sell an investment or borrow at 40% during a bad month. Judged as an investment it looks terrible. Judged as insurance it is the cheapest you will ever buy.',
    ],
    definitions: [
      {
        term: 'Emergency fund',
        definition:
          'Cash held specifically to cover essential expenses through a loss of income or an unplanned bill, without selling investments or borrowing. Sized in months of expenses, not as a percentage of income.',
      },
      {
        term: 'Liquidity',
        definition:
          'How quickly money can be turned into spendable rupees without a penalty. A savings account is instant; a liquid fund is one working day; a fixed deposit is instant with a rate penalty; a locked-in tax-saving instrument is not liquid at all.',
      },
      {
        term: 'Real return',
        definition:
          'Return after inflation. A savings account paying 3% while inflation runs at 5.5% has a real return of about −2.5%: the balance grows and the purchasing power shrinks. Every horizon decision is really a real-return decision.',
      },
      {
        term: 'Post-tax return',
        definition:
          'What you keep after tax on the gain. Interest from savings accounts, deposits and debt funds is added to income and taxed at your slab; equity and arbitrage funds are taxed differently. Two products with the same headline rate can leave you with meaningfully different amounts.',
      },
    ],
    faq: [
      {
        q: 'How big should an emergency fund be in India?',
        a:
          'Three to six months of essential expenses for a salaried earner with a stable job and no dependants; six to twelve for a single-income household, a freelancer, a commission-based earner, or anyone in a sector with a hiring freeze. Size it on essential expenses — rent, food, utilities, EMIs, insurance, school fees — not on total spending, because discretionary spending is the first thing that stops.',
      },
      {
        q: 'Where should I keep my emergency fund?',
        a:
          'Split it. Keep about one month of expenses in a savings account for instant access, and the rest in a liquid or overnight fund or a sweep-in fixed deposit, which return more and still settle within a working day. What matters is that reaching it takes hours, not weeks, and costs no penalty worth avoiding.',
      },
      {
        q: 'Should I invest or build an emergency fund first?',
        a:
          'The fund first, up to about three months of expenses, then build the rest alongside investing. Without it, the first genuine emergency is funded by selling investments at whatever price the market offers that week, or by a credit card at 36–42% a year. Both cost far more than the return the fund gives up.',
      },
      {
        q: 'Is a fixed deposit a good place to save?',
        a:
          'For a defined goal one to three years away, yes — the return is certain and the date is known, which is exactly what a near-term goal needs. For an emergency fund it is second-best to a liquid fund because breaking one early costs a rate penalty. For a fifteen-year goal it is a poor choice: the post-tax return rarely beats inflation by enough to matter.',
      },
    ],
  },
  articles,
};

export default content;
