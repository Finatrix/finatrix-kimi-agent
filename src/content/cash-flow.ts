/**
 * Editorial copy and article bodies for the Cash Flow topic.
 *
 * The distinction this topic exists to make — solvent versus liquid — is one
 * ordinary personal finance writing skips, and it is the difference between a
 * household that needs to earn more and one that needs to reschedule. Getting it
 * wrong sends people to the wrong solution for years.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'the-monthly-gap': {
    summary:
      'A household can be solvent — income comfortably exceeding expenses over a year — and still run out of money in the last week of most months. That is a liquidity problem rather than an income problem, and it has an entirely different solution. It happens because income arrives on one day while expenses are spread unevenly, with the large fixed ones clustered near the start of the cycle, so the buffer available in week four is what survived weeks one to three. The two fixes that work are a one-month float that permanently decouples spending from the salary date, and moving fixed payments so they land in a rhythm that matches when money is actually present.',
    keyPoints: [
      'Solvency is about the year; liquidity is about the week. A household can pass one test and fail the other every month.',
      'The last week is tight because the fixed costs at the start of the cycle consumed the buffer, not because income is inadequate.',
      'A one-month float breaks the dependency on the salary date permanently, and is the only fix that stays fixed.',
      'Moving payment dates costs nothing and often solves the problem on its own.',
    ],
    faq: [
      {
        q: 'How do I tell if this is a timing problem or an income problem?',
        a: 'Add up twelve months of income and twelve months of expenses, including the annual ones. If income exceeds expenses over the year but you are short in most months, it is timing. If it does not, it is income or spending, and rescheduling will not help. Doing this arithmetic first prevents a household spending years attacking the wrong problem.',
      },
      {
        q: 'What exactly is a float?',
        a: 'One month of expenses held in your current account and never spent down — so that this month is funded by money that arrived last month. It is not an emergency fund and should not be counted as one. Its only job is to break the link between the salary date and your ability to spend, which it does permanently once it exists.',
      },
      {
        q: 'How do I build a float when I am already short?',
        a: 'Slowly and from irregular money rather than from the monthly budget, which is already tight by definition. A bonus, a tax refund, a month with a fifth pay date, the proceeds of something sold. Building it in three or four instalments over a year is normal, and the benefit begins as soon as it is partially there.',
      },
    ],
    sections: [
      {
        id: 'solvent-vs-liquid',
        title: 'Solvent is not the same as liquid',
        blocks: [
          {
            kind: 'p',
            text: 'Solvency asks whether income exceeds expenses over a period long enough to include everything — a year. Liquidity asks whether money is available on the day it is needed. They are different questions with different answers and different solutions.',
          },
          {
            kind: 'table',
            caption: 'Four households, and what each actually needs',
            head: ['Solvent?', 'Liquid?', 'The situation', 'The fix'],
            rows: [
              ['Yes', 'Yes', 'Comfortable', 'Nothing'],
              ['Yes', 'No', 'Runs out in week four every month', 'A float, and rescheduled payment dates'],
              ['No', 'Yes', 'Feels fine, depleting slowly', 'Spending or income — and urgently'],
              ['No', 'No', 'In difficulty', 'Both, starting with the highest-rate debt'],
            ],
          },
          {
            kind: 'p',
            text: 'The second row is the common one and the most frequently misdiagnosed. It feels exactly like not earning enough — the experience is identical — and the household responds by trying to earn more or cut deeper, when the actual constraint is that the money arrives on the wrong day.',
          },
        ],
      },
      {
        id: 'why-week-four',
        title: 'Why the last week is always the tight one',
        blocks: [
          {
            kind: 'p',
            text: 'Salary arrives once. Expenses do not, and the largest ones cluster near the start of the cycle: rent, EMIs, insurance, school fees, subscriptions. What is left for the rest of the month is whatever survived them, and it is spent at a roughly constant rate.',
          },
          {
            kind: 'worked',
            title: 'A month, week by week',
            rows: [
              { label: 'Salary credited, day 1', value: '₹75,000' },
              { label: 'Rent, days 1–3', value: '−₹25,000' },
              { label: 'EMIs, days 2–5', value: '−₹14,000' },
              { label: 'Insurance and subscriptions, days 3–7', value: '−₹6,000' },
              { label: 'Balance entering week 2', value: '₹30,000' },
              { label: 'Weekly variable spending', value: '≈ ₹9,000' },
              { label: 'Balance entering week 4', value: '≈ ₹12,000' },
              { label: 'Week 4 needs', value: '₹9,000, plus anything unexpected' },
            ],
            conclusion:
              'The household is solvent — it ends the month positive — and it has almost no tolerance in week four. One unexpected ₹8,000 expense pushes it onto a card, which then makes next month tighter still. The problem is entirely one of sequence.',
          },
          {
            kind: 'note',
            title: 'This is where card balances start',
            text: 'Most revolving balances begin not with an extravagance but with a week-four shortfall that felt temporary. Once the balance revolves it costs [card rates](/learn/debt/credit-card-interest), and the payment competes with next month\'s week four. The timing problem becomes a debt problem quietly.',
          },
        ],
      },
      {
        id: 'the-two-fixes',
        title: 'The two fixes',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Build a one-month float.** Hold one month of expenses in the current account permanently, so that this month is funded by last month\'s salary. The gap disappears and does not come back, because the dependency it relied on is gone. Build it from irregular money, not from an already-tight monthly budget.',
              '**Reschedule the fixed payments.** Ask lenders to move EMI dates, move subscription renewals, split what can be split across the month. This costs nothing, takes an afternoon of phone calls and emails, and frequently solves the problem entirely on its own.',
            ],
          },
          {
            kind: 'p',
            text: 'Do the second one first because it is free and immediate, then build the float. A household with both is insulated from the sequencing problem permanently, which frees attention for the questions that actually change net worth.',
          },
          {
            kind: 'tool',
            toolId: 'expenses',
            text: 'The Expense Tracker records each entry against the calendar day it happened, which is what makes the within-month pattern visible — a monthly total cannot show you that week four is the problem.',
          },
          {
            kind: 'p',
            text: 'The other half of the timing problem is the expenses that do not arrive monthly at all, which is a separate and equally solvable issue — see [spreading annual bills](/learn/cash-flow/annual-lumps).',
          },
        ],
      },
    ],
  },

  'annual-lumps': {
    summary:
      'Annual and quarterly bills are the most predictable expenses a household has and the most likely to be experienced as emergencies. Insurance renewals, school fees, festival spending, vehicle servicing, professional subscriptions and travel typically total one to two months of income across a year, and because none of them appears in a typical month\'s budget, each one arrives as a shock and is frequently funded on a card. The fix is a twenty-minute exercise done once: list every non-monthly expense from a year of statements, total it, divide by twelve, and treat the result as a fixed monthly cost. The spending does not change; only the timing of when it is set aside does.',
    keyPoints: [
      'Non-monthly bills commonly total one to two months of income a year and appear in no monthly budget.',
      'The exercise is twenty minutes and produces a single number that makes the budget honest.',
      'Money set aside for a dated bill should not sit in a market — it has a date and no tolerance for a fall.',
      'This is separate from the emergency fund; paying a known bill from it is how emergency funds quietly disappear.',
    ],
    faq: [
      {
        q: 'How do I find all my annual expenses?',
        a: 'Go through twelve months of bank and card statements and mark anything that did not recur monthly. It is tedious and it is the only reliable method, because these are precisely the expenses memory omits. Most people find two or three they had genuinely forgotten, which is the point of using statements rather than recall.',
      },
      {
        q: 'Where should the money sit?',
        a: 'Somewhere that settles within a working day with no penalty: a savings account for bills within about three months, a liquid fund or a short deposit timed to mature for anything further out. Never in equity — the money has a date, and a market that is down the month a school fee is due converts a solved problem into a borrowed one.',
      },
      {
        q: 'What if a new annual expense appears?',
        a: 'Add it and recalculate the monthly figure. The list is not fixed for life; it changes as circumstances do. Reviewing it once a year — a good task for the same month each year — keeps the monthly number honest, and the review takes minutes once the initial list exists.',
      },
    ],
    sections: [
      {
        id: 'the-exercise',
        title: 'The twenty-minute exercise',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Open twelve months of statements.** Bank and every card. Twelve months, because anything shorter misses the annual items entirely — which are the ones you are looking for.',
              '**Mark every non-monthly outflow.** Insurance, fees, festivals, servicing, travel, professional memberships, device replacements, gifts.',
              '**Total it.** This is the number most people find surprising.',
              '**Divide by twelve.** That is a fixed monthly cost you have been paying all along without budgeting for it.',
              '**Add it to the budget as a line.** Not as a note — as a line with a transfer behind it.',
            ],
          },
          {
            kind: 'worked',
            title: 'A typical list, totalled',
            rows: [
              { label: 'Term and health insurance', value: '₹48,000' },
              { label: 'Vehicle insurance and servicing', value: '₹22,000' },
              { label: 'School fees, non-monthly portion', value: '₹40,000' },
              { label: 'Festival spending and gifts', value: '₹30,000' },
              { label: 'One trip', value: '₹40,000' },
              { label: 'Professional membership and devices', value: '₹20,000' },
              { label: 'Annual total', value: '₹2,00,000' },
              { label: 'Monthly share', value: '₹16,667' },
            ],
            conclusion:
              'On a ₹1,00,000 monthly take-home, that is a sixth of income which has never appeared in a monthly budget. A household treating its budget as complete without this line is under-budgeting by that amount every month and discovering it five or six times a year.',
          },
        ],
      },
      {
        id: 'why-it-feels-like-an-emergency',
        title: 'Why a predictable bill feels like an emergency',
        blocks: [
          {
            kind: 'p',
            text: 'An insurance renewal is known months in advance, appears in no monthly plan, and arrives against a budget with no room in it. The experience is identical to an unexpected expense even though nothing about it was unexpected.',
          },
          {
            kind: 'p',
            text: 'The consequences follow the same path each time: the bill is funded from the emergency fund or from a card. If from the fund, the fund is now smaller and nobody notices until a real emergency reveals it. If from a card, it is now costing [card rates](/learn/debt/credit-card-interest) and competing with the next month.',
          },
          {
            kind: 'warning',
            title: 'The emergency fund is not for this',
            text: 'Paying known, dated bills from the emergency fund is the most common way that fund quietly stops existing. Someone who believes they hold six months of expenses and has been paying insurance renewals out of it for two years holds considerably less than they think — and will find out at the worst moment.',
          },
        ],
      },
      {
        id: 'making-it-stick',
        title: 'Making it stick',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Automate the transfer.** One standing instruction on salary day into a separate account. A monthly decision to move money will not survive a busy month, and busy months are most of them.',
              '**One account, simple bookkeeping.** Eight separate accounts for eight categories is how this gets abandoned. One account holding the total, with a note of what portion belongs to which bill, is enough.',
              '**Fund the non-negotiable items first** if you cannot fund the whole thing yet — insurance above everything, because lapsing cover to save a premium is the worst trade available.',
              '**Review annually.** The list changes. Fifteen minutes a year keeps it honest.',
            ],
          },
          {
            kind: 'tool',
            toolId: 'budget',
            text: 'Add the monthly share as its own category in Budget Builder. It belongs in needs — these are expenses that continue in a bad month, which is the test.',
          },
          {
            kind: 'p',
            text: 'The mechanics of the pot itself, including where to hold it for different horizons, are in [sinking funds](/learn/saving/sinking-funds). Together with a [one-month float](/learn/cash-flow/the-monthly-gap), these two changes remove almost all of the timing volatility from a household\'s finances — which is a larger improvement in how money feels than most changes in income produce.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'A great many money problems that feel like income problems are timing problems, and the two need completely different solutions. A household whose income comfortably exceeds its annual expenses can still be short in the last week of most months, because income arrives on one day and expenses do not.',
      'The distinction is between solvency and liquidity. Solvency asks whether the year works; liquidity asks whether today does. Someone who is solvent but not liquid experiences exactly what someone with insufficient income experiences, and will usually respond by trying to earn more or cut deeper — neither of which addresses a sequencing problem.',
      'Two changes remove most of it. A one-month float, so this month is funded by last month\'s salary rather than by the credit arriving on the first. And a monthly provision for the annual bills that appear in no monthly budget and are therefore always a shock. Neither requires earning more or spending less, which is why they are the cheapest improvements available to most households.',
    ],
    definitions: [
      {
        term: 'Solvency',
        definition:
          'Income exceeding expenses over a full year, including the annual ones. A household can be solvent and still run out of money most months, which is why solvency alone is not a useful test of whether the finances work.',
      },
      {
        term: 'Liquidity',
        definition:
          'Having money available on the day it is needed. The constraint that actually bites in week four, and one that is independent of whether the year balances.',
      },
      {
        term: 'Float',
        definition:
          'One month of expenses held permanently in the current account, so that this month is funded by money that arrived last month. Not an emergency fund and not counted as one — its only job is to break the dependency on the salary date.',
      },
      {
        term: 'Annual lumps',
        definition:
          'Predictable expenses that do not recur monthly — insurance renewals, fees, festivals, servicing, travel. Typically one to two months of income across a year, absent from every monthly budget, and experienced as emergencies for exactly that reason.',
      },
    ],
    faq: [
      {
        q: 'Why do I run out of money before payday even though I earn enough?',
        a: 'Because the large fixed costs cluster at the start of the cycle and what is left has to last the rest of it. By week four the buffer is whatever survived rent, EMIs and insurance, and there is no tolerance for anything unexpected. This is a sequencing problem, and it persists at every income level until the sequence is changed.',
      },
      {
        q: 'What is the fastest fix?',
        a: 'Moving payment dates, because it costs nothing and can be done in an afternoon. Ask lenders to shift EMI dates, move subscription renewals, and spread the fixed outflows across the month rather than concentrating them in the first week. For many households this alone resolves it.',
      },
      {
        q: 'How much should a float be?',
        a: 'One month of typical expenses, held in the current account and never spent down. It is separate from the emergency fund and should not be counted toward it — one solves timing, the other solves shocks, and treating them as one pot means neither does its job when needed.',
      },
      {
        q: 'How do I stop annual bills surprising me?',
        a: 'List every non-monthly expense from twelve months of statements, total it, divide by twelve, and set that amount aside every month by standing instruction. The spending does not change; only the timing of when it is provided for does. Most households find the total is one to two months of income, which is why it has been destabilising every budget they have written.',
      },
    ],
  },
  articles,
};

export default content;
