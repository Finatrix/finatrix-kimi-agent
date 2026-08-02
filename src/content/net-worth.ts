/**
 * Editorial copy and article bodies for the Net Worth topic.
 *
 * The second article deliberately refuses to publish net-worth benchmarks by
 * age. Every such table circulating online is derived from an unrepresentative
 * sample or from a rule of thumb someone invented, and the effect of reading one
 * is either false reassurance or unnecessary anxiety. What is publishable is the
 * SHAPE of a trajectory — why the first milestone is slowest — and an honest
 * account of the limits of comparison.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'calculate-net-worth': {
    summary:
      'Net worth is everything you own minus everything you owe, and the only difficulty is being honest about both sides. Assets are what could be converted to money — investments, retirement accounts, property at a realistic price, cash — and specifically not what you paid for something or what you feel it is worth. Liabilities are every outstanding balance in full, including the ones people leave out: the card balance being carried, a loan from family, and the full remaining principal on a home loan rather than this year\'s payments. Calculated honestly once a quarter, it is the only number that responds to every financial decision you make, which is what makes it worth the twenty minutes.',
    keyPoints: [
      'Value assets at what they would realise, not at purchase price and not at what you hope — a car is worth its resale value.',
      'Include retirement accounts as assets; they are yours, and omitting them understates the position substantially.',
      'Include every liability in full, especially the full outstanding principal on a home loan rather than a year of EMIs.',
      'Measure quarterly, not monthly — it moves slowly by nature, and monthly measurement invites reacting to noise.',
    ],
    faq: [
      {
        q: 'Should I include my home?',
        a: 'Include it at a realistic sale price and include the outstanding loan in full on the other side. What that produces is your equity in it, which is honest. The caveat worth remembering is that a home you live in cannot be spent — it improves the net worth figure without improving your ability to meet a cost — so a household whose net worth is almost entirely home equity is less liquid than the number suggests.',
      },
      {
        q: 'What about my car, jewellery and possessions?',
        a: 'Include a vehicle at resale value if it is worth enough to matter, and generally exclude everyday possessions. Jewellery is a judgement call: gold with genuine resale value counts, sentimental items realistically do not. The test is whether you would actually sell it and what you would receive — anything that fails both is decoration on the balance sheet.',
      },
      {
        q: 'How often should I calculate it?',
        a: 'Quarterly is right for most people. Monthly is too frequent — net worth moves slowly and monthly measurement mostly records market noise, which invites reacting to it. Annually is too infrequent to catch a trend early. Four data points a year is enough to see direction without encouraging tinkering.',
      },
    ],
    sections: [
      {
        id: 'the-two-sides',
        title: 'What goes on each side',
        blocks: [
          {
            kind: 'table',
            caption: 'Assets and liabilities, and how to value them',
            head: ['Side', 'Item', 'Value at'],
            rows: [
              ['Asset', 'Cash and bank balances', 'Face value'],
              ['Asset', 'Investments', 'Current market value'],
              ['Asset', 'Retirement accounts (EPF, NPS)', 'Current balance'],
              ['Asset', 'Property', 'Realistic sale price, not purchase price'],
              ['Asset', 'Vehicle', 'Resale value'],
              ['Liability', 'Home loan', 'Full outstanding principal'],
              ['Liability', 'Other loans', 'Full outstanding principal'],
              ['Liability', 'Credit card balance carried', 'Full amount'],
              ['Liability', 'Money owed to family', 'Full amount'],
            ],
          },
          {
            kind: 'p',
            text: 'The last row is the one most often omitted and it is a real liability. An informal loan with no paperwork and no interest is still money that has to be returned, and leaving it off flatters the figure by exactly the amount you owe.',
          },
          {
            kind: 'note',
            title: 'Retirement accounts are assets',
            text: 'EPF and NPS balances are yours and belong on the asset side, even though they are illiquid. Omitting them understates net worth substantially for most salaried people and — more importantly — hides the fact that they represent a large debt-like allocation, which is the point made in [EPF versus NPS](/learn/epf-nps/epf-vs-nps).',
          },
        ],
      },
      {
        id: 'flattering-it',
        title: 'The three ways people flatter the number',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Valuing property at what it should be worth.** A price nobody has offered is not a valuation. Use a conservative figure for a comparable sale, and if that feels uncomfortably low, that discomfort is information about how much of your position rests on the assumption.',
              '**Counting a car at purchase price.** A vehicle depreciates immediately and continuously. Value it at what someone would pay today, which for most cars is considerably less than the owner expects.',
              '**Leaving out the card balance.** A balance being carried is a liability at a very high rate. Excluding it because "it will be paid next month" overstates net worth by the amount and understates the urgency of the [payoff](/learn/debt/credit-card-interest).',
            ],
          },
          {
            kind: 'worked',
            title: 'The same household, flattered and honest',
            rows: [
              { label: 'Flattered — property at hoped price', value: '₹95,00,000' },
              { label: 'Honest — property at comparable sale', value: '₹82,00,000' },
              { label: 'Flattered — car at purchase price', value: '₹12,00,000' },
              { label: 'Honest — car at resale', value: '₹6,50,000' },
              { label: 'Flattered — card balance omitted', value: '₹0' },
              { label: 'Honest — card balance', value: '−₹1,40,000' },
              { label: 'Difference across three lines', value: '≈ ₹19,90,000' },
            ],
            conclusion:
              'Two figures for one household, twenty lakh apart, with nothing invented on either side. The honest one is the useful one, because it is the one against which a decision can be tested.',
          },
        ],
      },
      {
        id: 'what-it-tells-you',
        title: 'What the number is actually for',
        blocks: [
          {
            kind: 'p',
            text: 'Net worth is the only figure that responds to every financial decision you make. A raise absorbed by spending does not move it. A raise split and invested does. Debt repaid moves it exactly as saving does, which is why treating repayment above the minimum as saving is not a semantic point.',
          },
          {
            kind: 'p',
            text: 'What matters is the direction and the rate of change, not the level. A quarterly series over three years tells you whether the last three years worked, which is a question no other single number answers.',
          },
          {
            kind: 'p',
            text: 'One warning about the composition. A figure that is almost entirely home equity and retirement accounts is real and largely unavailable, which is a different position from the same figure held in liquid investments. Track the liquid portion separately — it is what determines whether a bad year is survivable.',
          },
          {
            kind: 'tool',
            toolId: 'lifemap',
            text: 'LifeMap projects net worth across a working life given a starting position and a set of decisions, which is useful for comparing two paths rather than for predicting either.',
          },
        ],
      },
    ],
  },

  'net-worth-milestones': {
    summary:
      'A net-worth trajectory has a recognisable shape: very slow at first, then accelerating, because early growth comes almost entirely from what you contribute while later growth comes increasingly from returns on what is already there. The first substantial milestone takes far longer than the second, and understanding that is what stops people concluding the plan has failed in year four. This guide deliberately publishes no benchmark table by age, because every one in circulation is either derived from an unrepresentative sample or invented — and the honest thing to say is that the comparison worth making is with your own trajectory rather than with a stranger\'s.',
    keyPoints: [
      'Early growth is almost entirely contributions; later growth is increasingly returns, which is why the curve steepens.',
      'The first milestone is the slowest and the most likely to be mistaken for evidence that the approach is not working.',
      'Savings rate dominates the outcome for the first decade; investment return only begins to dominate later.',
      'Compare against your own trajectory rather than against a benchmark, because the benchmarks in circulation are not measurements.',
    ],
    faq: [
      {
        q: 'What should my net worth be at my age?',
        a: 'There is no defensible answer, and the tables that claim one are either extrapolated from unrepresentative samples or simply invented. Your figure depends on when you started earning, what you started with, whether you support others, what you have studied, and where you live. The useful comparison is with your own trajectory: is it rising, and is the rate improving?',
      },
      {
        q: 'Why does progress feel so slow at first?',
        a: 'Because at the start it is almost entirely your contributions doing the work. Returns on a small balance are small in absolute terms, however good the percentage. The point at which annual returns begin to rival annual contributions is the inflection, and reaching it takes years — after which the curve steepens on its own.',
      },
      {
        q: 'Does a negative net worth mean I am doing badly?',
        a: 'Not necessarily. A recent graduate with an education loan and a professional in the first year of a home loan can both be negative and both be fine, because the liability was taken on against future earnings or an asset that is not being valued optimistically. What matters is the direction of travel and whether the debt is priced sensibly.',
      },
    ],
    sections: [
      {
        id: 'the-shape',
        title: 'Why the curve steepens',
        blocks: [
          {
            kind: 'p',
            text: 'Net worth grows from two sources: what you add, and what the existing balance earns. Early on the second is negligible, because a good percentage of a small number is a small number. Over time it grows until it exceeds the first, and from that point the curve changes character.',
          },
          {
            kind: 'worked',
            title: 'Contributions versus returns, ₹25,000 a month at 11%',
            rows: [
              { label: 'Year 1 — contributed', value: '₹3,00,000' },
              { label: 'Year 1 — returns', value: '≈ ₹18,000' },
              { label: 'Year 5 — balance', value: '≈ ₹19.8 lakh' },
              { label: 'Year 5 — annual returns', value: '≈ ₹2.0 lakh, still below contributions' },
              { label: 'Year 10 — balance', value: '≈ ₹54 lakh' },
              { label: 'Year 10 — annual returns', value: '≈ ₹5.4 lakh, now well above contributions' },
              { label: 'Year 20 — balance', value: '≈ ₹2.1 crore' },
              { label: 'Year 20 — annual returns', value: '≈ ₹21 lakh, seven times the contribution' },
            ],
            conclusion:
              'Same contribution throughout. In year one the returns are a rounding error; by year twenty they add seven times what you put in. Nothing about the strategy changed — only the balance the return applies to, which is why the early years feel like nothing is happening.',
          },
          {
            kind: 'p',
            text: 'This is the same arithmetic as [SIP maths](/learn/investing/sip-maths), read as a trajectory rather than as an ending balance. It is also the reason the most common time to abandon a plan is years three to five, when the effort has been sustained and the visible result is still mostly just the money you put in.',
          },
        ],
      },
      {
        id: 'what-dominates-when',
        title: 'What dominates the outcome, and when',
        blocks: [
          {
            kind: 'table',
            caption: 'Which lever matters most, by stage',
            head: ['Stage', 'Dominant factor', 'What to work on'],
            rows: [
              ['Years 0–5', 'Savings rate, overwhelmingly', 'Income and the amount contributed'],
              ['Years 5–12', 'Savings rate, with return beginning to matter', 'Both; keep contributing through falls'],
              ['Years 12+', 'Return and the accumulated base', 'Allocation, fees, and not interrupting'],
            ],
          },
          {
            kind: 'p',
            text: 'The practical implication for anyone in the first decade is that optimising the portfolio is displacement activity. Raising the savings rate by five percentage points does more than any plausible improvement in return, and it is entirely within your control — which the return is not.',
          },
          {
            kind: 'p',
            text: 'The single most reliable way to raise it over a career is to split each raise rather than absorb it, which is the argument in [lifestyle creep](/learn/behavioural-finance/lifestyle-creep).',
          },
        ],
      },
      {
        id: 'against-benchmarks',
        title: 'Why there is no benchmark table here',
        blocks: [
          {
            kind: 'p',
            text: 'Net-worth-by-age tables circulate widely and almost none of them is a measurement. They are typically extrapolated from a self-selecting survey, borrowed from another country\'s data, or derived from a rule of thumb someone invented and everyone else repeated.',
          },
          {
            kind: 'p',
            text: 'Reading one produces one of two useless outcomes: false reassurance if you are above it, or anxiety if you are below it — in both cases against a number that measures nothing. The variables that legitimately move a household\'s position are enormous: when you started earning, what you inherited or did not, dependants, education debt, city, and how many years of a career have actually happened.',
          },
          {
            kind: 'note',
            title: 'The comparison that is worth making',
            text: 'Your own figure, four quarters ago. Is it higher, and is the rate of increase improving? That comparison controls for every variable a benchmark cannot, and it is the only one that tells you whether what you are doing is working.',
          },
          {
            kind: 'tool',
            toolId: 'peercompare',
            text: 'Where a benchmark is genuinely useful is on the inputs rather than the total — a savings rate or an emergency buffer against a comparable bracket and city tier says something actionable that a net-worth total does not.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Net worth is everything you own minus everything you owe. It is the only single number that responds to every financial decision you make — a raise that was absorbed by spending does not move it, one that was split and invested does, and debt repaid moves it exactly as saving does.',
      'It is also the easiest number to flatter, and most people who calculate it do. Property valued at what it should be worth, a car at what it cost, a card balance omitted because it will be cleared next month. Each individually forgivable, and together they can move the figure by twenty lakh in a household with nothing unusual about it.',
      'This topic contains no net-worth-by-age table, deliberately. Every such table in circulation is derived from an unrepresentative sample or invented outright, and reading one produces either false reassurance or unnecessary anxiety against a number that measures nothing. What is worth understanding is the shape of a trajectory and why its first years feel like failure when they are not.',
    ],
    definitions: [
      {
        term: 'Net worth',
        definition:
          'Total assets less total liabilities, at realistic values on both sides. The only figure that captures the combined effect of earning, spending, saving, investing and borrowing, which is what makes it the one worth tracking over years.',
      },
      {
        term: 'Liquid net worth',
        definition:
          'The portion of net worth that could actually be converted to cash within days without a forced sale. Frequently much smaller than the headline figure, and the number that determines whether a bad year is survivable.',
      },
      {
        term: 'Realisable value',
        definition:
          'What an asset would actually fetch, as opposed to what was paid for it or what the owner believes it is worth. The valuation standard for an honest statement, and the one people most often abandon for property and vehicles.',
      },
      {
        term: 'The inflection point',
        definition:
          'The stage at which annual investment returns begin to exceed annual contributions. Before it, growth is mostly what you added; after it, growth is mostly what the balance earned — and the curve visibly steepens.',
      },
    ],
    faq: [
      {
        q: 'How do I calculate net worth?',
        a: 'List every asset at what it would realise — cash, investments, retirement accounts, property at a comparable sale price, a vehicle at resale value. List every liability in full, including the outstanding principal on loans, any card balance carried, and money owed informally. Subtract. Twenty minutes, once a quarter.',
      },
      {
        q: 'Should I include my house and my provident fund?',
        a: 'Yes to both, with the loan on the other side for the house. They are genuinely yours and omitting them understates the position substantially. What is worth tracking separately is how much of your net worth they represent, because both are illiquid — a figure that is almost entirely home equity and EPF is a real position and not an available one.',
      },
      {
        q: 'What is a good net worth for my age?',
        a: 'Not a question with a defensible answer, and the tables that offer one are not measurements. Whether your own figure rose over the last four quarters, and whether the rate of increase is improving, is a question with a real answer that controls for every circumstance a benchmark cannot.',
      },
      {
        q: 'Why does it barely move in the early years?',
        a: 'Because early growth is almost entirely your own contributions — returns on a small balance are small in absolute terms whatever the percentage. The inflection comes when annual returns begin to rival annual contributions, which takes several years. Years three to five feel like failure and are simply the flat part of a curve that steepens later.',
      },
    ],
  },
  articles,
};

export default content;
