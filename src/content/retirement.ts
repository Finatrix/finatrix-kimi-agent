/**
 * Editorial copy and article bodies for the Retirement topic.
 *
 * The 4% rule is described as what it is — a finding from a specific study of a
 * specific market over a specific period — rather than as a law, and the article
 * is explicit about why it does not transfer cleanly to Indian inflation and tax.
 * Saying "use 3–3.5% instead" without saying why would be substituting one
 * unexamined number for another.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'retirement-corpus': {
    summary:
      'A retirement corpus is sized from the expenses it has to fund, not from a multiple of income. The sequence is: work out annual expenses in retirement in today\'s money, inflate them to what they will cost at the retirement date, subtract any income that will continue, then divide the remaining annual need by a sustainable withdrawal rate. The step that produces most of the shock is the inflation adjustment — at 6% a year, costs roughly triple over twenty years — and the step that produces most of the error is using current income rather than current expenses, which overstates the target for anyone with a decent savings rate and understates it for anyone without one.',
    keyPoints: [
      'Size the corpus on expenses, not income: you need to fund what you spend, not what you earn.',
      'Inflate the expense figure to the retirement date — at 6%, costs roughly triple over twenty years.',
      'Subtract continuing income such as rent or a pension before dividing, or you will over-save substantially.',
      'The corpus is the annual need divided by a withdrawal rate, so the rate assumption drives the whole answer.',
    ],
    faq: [
      {
        q: 'Why size it on expenses rather than income?',
        a: 'Because retirement funds spending, and spending is what you need to replace. Someone earning ₹20 lakh and spending ₹10 lakh needs to fund ₹10 lakh, not ₹20 lakh — the rest was going into the very savings that built the corpus. Using income as the base systematically over-targets for good savers and under-targets for people whose spending exceeds their income.',
      },
      {
        q: 'Do expenses really fall in retirement?',
        a: 'Some do and some rise, and the net effect is smaller than the popular "you will need 70% of your income" suggests. Commuting, work clothing, professional fees and the savings contributions themselves stop. Healthcare rises, often steeply, and discretionary spending frequently rises in the early years. Build the figure from your own categories rather than applying a percentage.',
      },
      {
        q: 'What inflation rate should I assume?',
        a: 'Something in the region of long-run consumer inflation for general expenses, and a higher figure for healthcare and education, which have historically risen faster. Whatever you choose, run the calculation at two rates a point or two apart. The spread between the answers is the honest output — a single number implies a precision the assumption does not support.',
      },
    ],
    sections: [
      {
        id: 'the-sequence',
        title: 'The four steps',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Annual expenses in today\'s money.** From your actual spending, adjusted for what stops and what starts. Not a percentage of income.',
              '**Inflate to the retirement date.** Multiply by (1 + inflation)^years. This is the step that produces the number people find hard to believe.',
              '**Subtract continuing income.** Rent, a pension, part-time work you genuinely intend to do. Only what you are confident of.',
              '**Divide by a withdrawal rate.** The remaining annual need divided by the rate you consider sustainable gives the corpus.',
            ],
          },
          {
            kind: 'formula',
            label: 'Retirement corpus',
            expression: 'Corpus = (E × (1 + i)^n − C) ÷ w',
            where: [
              'E — annual expenses in today\'s money.',
              'i — assumed annual inflation.',
              'n — years until retirement.',
              'C — annual income that continues in retirement, at that future date.',
              'w — the sustainable withdrawal rate, as a decimal.',
            ],
          },
        ],
      },
      {
        id: 'worked',
        title: 'Worked, with the inflation step visible',
        blocks: [
          {
            kind: 'worked',
            title: 'A household 20 years from retirement',
            rows: [
              { label: 'Current annual expenses', value: '₹9,00,000' },
              { label: 'Expenses that stop (commute, work costs)', value: '−₹90,000' },
              { label: 'Expenses that rise (healthcare provision)', value: '+₹1,20,000' },
              { label: 'Retirement expenses in today\'s money', value: '₹9,30,000' },
              { label: 'Inflated at 6% over 20 years', value: '₹9,30,000 × 3.207 ≈ ₹29,82,000' },
              { label: 'Continuing income (rent, at that date)', value: '−₹4,00,000' },
              { label: 'Annual need from the corpus', value: '≈ ₹25,82,000' },
              { label: 'At a 3.5% withdrawal rate', value: '₹25,82,000 ÷ 0.035 ≈ ₹7.4 crore' },
              { label: 'At a 4% withdrawal rate', value: '₹25,82,000 ÷ 0.04 ≈ ₹6.5 crore' },
            ],
            conclusion:
              'The inflation step tripled the requirement, and half a percentage point on the withdrawal rate moved the target by roughly ₹90 lakh. Both are assumptions, which is why the honest output is a range rather than a figure.',
          },
          {
            kind: 'note',
            title: 'The target moves every year',
            text: 'Because the calculation depends on inflation and on your own spending, both of which change, a corpus target is a working estimate to be revisited annually — not a number to be computed once at thirty and pursued for three decades.',
          },
        ],
      },
      {
        id: 'getting-there',
        title: 'From the target to a monthly figure',
        blocks: [
          {
            kind: 'p',
            text: 'A corpus target is only useful once it becomes a monthly contribution, and that conversion is the future-value annuity calculation in reverse — the same arithmetic as [SIP maths](/learn/investing/sip-maths), solved for the instalment instead of the balance.',
          },
          {
            kind: 'p',
            text: 'Two things reduce the required instalment more than any investment decision. Starting earlier, because the later years of compounding do a disproportionate share of the work. And a step-up, because a contribution that rises with income matches the way earnings actually behave and lowers the starting figure substantially.',
          },
          {
            kind: 'tool',
            toolId: 'goals',
            text: 'The Reverse Goal Planner solves for the monthly instalment a target and horizon require, with an inflation adjustment and a 10% step-up option — which is this calculation run backwards.',
          },
          {
            kind: 'p',
            text: 'Existing retirement accounts count toward the target and should be subtracted before solving. For most salaried households in India that means EPF, and increasingly NPS — see [EPF versus NPS](/learn/epf-nps/epf-vs-nps).',
          },
          {
            kind: 'p',
            text: 'The subtraction has to be done properly, which means projecting what those balances will be worth at the retirement date rather than using today\'s figure. An EPF balance twenty years from retirement will grow through both continued contributions and its own return, and treating it as static overstates the shortfall considerably — sometimes enough to make a household believe a target is unreachable when it is not. Grow the existing balance forward at a rate appropriate to what it is invested in, add the projected future contributions, and subtract the total.',
          },
          {
            kind: 'p',
            text: 'A final caution about the horizon. Retirement is not a date at which spending stops but the start of a period that may run thirty years or more, and a corpus sized for twenty years of withdrawals does not simply fall a third short of one sized for thirty — the arithmetic is worse than proportional, because the later years are funded by the compounding of what was not withdrawn earlier. Where the planning horizon is uncertain, err long.',
          },
        ],
      },
    ],
  },

  'withdrawal-rate': {
    summary:
      'The 4% rule comes from a study of historical US market returns and inflation, asking what initial withdrawal rate, raised annually with inflation, would have survived a thirty-year retirement in the worst historical case. It is a useful frame and it is not a law of nature. Three things make it a poor direct import to India: inflation has generally run higher, the asset return and volatility history is different and shorter, and interest income is taxed at slab, which reduces what a given withdrawal actually delivers. Most careful Indian planning uses something more conservative, and the more useful habit is to treat the rate as a variable to test rather than a constant to adopt.',
    keyPoints: [
      'The 4% rule is an empirical finding about one market\'s history, not a mathematical result that transfers.',
      'Higher inflation raises the required withdrawal every year, which is what exhausts a corpus faster.',
      'Tax on withdrawals matters: a 4% gross withdrawal taxed at slab is not 4% of spending power.',
      'Sequence of returns matters enormously — a poor first five years does damage a good average cannot undo.',
    ],
    faq: [
      {
        q: 'So what withdrawal rate should I use?',
        a: 'Run your plan at several — 3%, 3.5% and 4% — and look at how much the corpus target moves. That spread is the honest answer. Most careful Indian planning lands below 4% because of higher inflation and the tax treatment of withdrawals, but any single number presented as correct is overstating what is known.',
      },
      {
        q: 'What is sequence-of-returns risk?',
        a: 'The order of returns matters when you are withdrawing, even though it does not when you are only accumulating. A poor first five years means you are selling assets at low prices to fund living costs, permanently reducing the base that later recovery applies to. Two retirements with identical average returns can end very differently depending on which years were bad.',
      },
      {
        q: 'Can I withdraw more in good years?',
        a: 'Flexible withdrawal strategies — taking less after a poor year — do sustain higher average rates than a fixed rule, and that is well established. The requirement is that your spending genuinely can flex, which means the fixed portion of your expenses has to be comfortably below the reduced withdrawal. A strategy that requires flexibility you do not have is not a strategy.',
      },
    ],
    sections: [
      {
        id: 'where-it-comes-from',
        title: 'What the rule actually says',
        blocks: [
          {
            kind: 'p',
            text: 'The finding was: for a portfolio of US stocks and bonds over historical thirty-year periods, an initial withdrawal of about 4% of the starting balance, increased each year with inflation, would not have exhausted the portfolio even in the worst starting year observed.',
          },
          {
            kind: 'p',
            text: 'Every part of that sentence is a condition. A specific market, a specific asset mix, a thirty-year horizon, a historical period, and a worst-case rather than typical framing. It is a robust finding within its conditions and it makes no claim beyond them.',
          },
          {
            kind: 'warning',
            title: 'It is a historical observation, not a formula',
            text: 'There is no derivation that produces 4%. It is an empirical result, which means it carries the assumptions of the data it came from — and those assumptions are the part that does not travel.',
          },
        ],
      },
      {
        id: 'why-it-does-not-transfer',
        title: 'Why it does not import cleanly',
        blocks: [
          {
            kind: 'table',
            caption: 'The three differences that matter',
            head: ['Factor', 'Effect on a sustainable rate'],
            rows: [
              [
                'Higher long-run inflation',
                'Each year\'s withdrawal rises faster, so the corpus depletes faster even at the same return',
              ],
              [
                'Different return and volatility history',
                'A shorter and different data series; the worst historical case is a less settled question',
              ],
              [
                'Tax on withdrawals',
                'Interest income is taxed at slab, so a gross withdrawal delivers less spending than its face value',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'The tax point is the one most often omitted. If part of your retirement income is interest taxed at slab, a 4% gross withdrawal is meaningfully less than 4% of spending power — the same distinction that makes [post-tax comparison](/learn/tax/capital-gains-basics) the only honest one while accumulating.',
          },
          {
            kind: 'worked',
            title: 'What the rate does to the corpus required',
            rows: [
              { label: 'Annual need in retirement', value: '₹25,00,000' },
              { label: 'At 4%', value: '₹6.25 crore' },
              { label: 'At 3.5%', value: '₹7.14 crore' },
              { label: 'At 3%', value: '₹8.33 crore' },
              { label: 'Range across the assumption', value: 'Over ₹2 crore' },
            ],
            conclusion:
              'One assumption, a spread of ₹2 crore. This is why the rate deserves to be tested rather than adopted, and why a plan quoted to the nearest lakh is quoting precision it does not have.',
          },
        ],
      },
      {
        id: 'what-to-do',
        title: 'What to do instead of adopting a number',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Test a range.** Run 3%, 3.5% and 4%. Plan against the conservative end and treat the difference as headroom rather than as an error.',
              '**Separate fixed from flexible spending.** A flexible withdrawal strategy sustains a higher rate, and it only works if your fixed costs sit below the reduced level. Knowing that split is the prerequisite.',
              '**Hold two to three years of spending in low-volatility assets** as you approach retirement. This is the direct defence against sequence-of-returns risk: it means the first bad year is funded without selling equity.',
              '**Revisit annually.** A withdrawal rate is not set once. Adjusting after a poor year is what most flexible strategies rely on, and it is only possible if you are looking.',
            ],
          },
          {
            kind: 'p',
            text: 'The third point is the one that changes outcomes most and is least discussed. The allocation logic behind it is the same one that governs any near-dated goal — [horizon outranks risk appetite](/learn/investing/asset-allocation-basics), and in retirement the horizon on the next three years of spending is very short indeed.',
          },
          {
            kind: 'tool',
            toolId: 'lifemap',
            text: 'LifeMap runs the whole trajectory rather than a single rate, which makes it useful for comparing two withdrawal assumptions against each other rather than for predicting either.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Retirement planning is two numbers: how large the corpus has to be, and what proportion of it can be withdrawn each year without exhausting it. Everything else — asset allocation, product selection, account choice — is in service of those two, and both are more sensitive to their assumptions than most planning admits.',
      'The corpus number is built from expenses rather than income, which is the correction that most changes the answer. Someone who saves a third of their income needs to replace what they spend, not what they earn, and the difference is frequently a crore or more in the target.',
      'The withdrawal rate is where imported rules of thumb do the most damage. The 4% rule is a finding about historical US market data, and India differs on inflation, on return history and on the tax treatment of withdrawals. Rather than substituting a different single number, these guides treat the rate as a variable to test — because the spread across reasonable assumptions is the honest output.',
    ],
    definitions: [
      {
        term: 'Retirement corpus',
        definition:
          'The invested capital that funds retirement spending. Sized as the annual need at the retirement date divided by a sustainable withdrawal rate, which means both the inflation assumption and the rate assumption drive the answer.',
      },
      {
        term: 'Safe withdrawal rate',
        definition:
          'The proportion of the starting corpus withdrawn in year one, then raised annually with inflation, that would not exhaust the portfolio over the planning horizon. An empirical estimate under stated conditions, never a guarantee.',
      },
      {
        term: 'Sequence-of-returns risk',
        definition:
          'The risk that poor returns early in retirement force selling at low prices to fund living costs, permanently reducing the base that later recovery applies to. Irrelevant while accumulating and decisive once withdrawing.',
      },
      {
        term: 'Replacement ratio',
        definition:
          'Retirement income as a proportion of pre-retirement income. A widely quoted planning shortcut and a poor one, because it anchors on income when the thing being funded is expenditure.',
      },
    ],
    faq: [
      {
        q: 'How much do I need to retire?',
        a: 'Take your annual expenses in today\'s money, adjust for what stops and starts in retirement, inflate to your retirement date, subtract any continuing income, and divide by a withdrawal rate you consider sustainable. Every step is arithmetic; the two assumptions that matter are inflation and the withdrawal rate, and both deserve to be run at more than one value.',
      },
      {
        q: 'Is the 4% rule reliable in India?',
        a: 'It is a useful frame and a poor direct import. It came from historical US data with lower inflation, a different return series and different tax treatment of withdrawals. Most careful Indian planning uses something more conservative — but the more useful discipline is to run the plan at several rates and see how much the target moves, which is usually a great deal.',
      },
      {
        q: 'When should I start planning for retirement?',
        a: 'The corpus arithmetic is worth doing at any age, and the earlier it is done the smaller the required monthly contribution — dramatically so, because the final years of compounding do a disproportionate share of the work. Starting at forty is not too late; it simply requires a much larger instalment for the same target, which the calculation will show you.',
      },
      {
        q: 'Does EPF cover retirement on its own?',
        a: 'For most people, no, though it is a substantial foundation and should be counted before deciding what else is needed. Subtract the projected value of existing retirement accounts from the target and solve for the shortfall rather than treating the corpus as something you start from zero — see [EPF versus NPS](/learn/epf-nps/epf-vs-nps).',
      },
    ],
  },
  articles,
};

export default content;
