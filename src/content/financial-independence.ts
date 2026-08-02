/**
 * Editorial copy and article bodies for the Financial Independence topic.
 *
 * Written without the movement's evangelism. FI arithmetic is genuinely useful
 * for anyone — it is the clearest demonstration that savings rate dominates
 * return — and the extreme version of it involves trade-offs that deserve to be
 * named rather than glossed. The savings-rate table is the centrepiece and is
 * derived rather than borrowed, so a reader can reproduce every row.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'fi-number': {
    summary:
      'A financial-independence number is annual expenses divided by a sustainable withdrawal rate — at 3.5%, roughly twenty-nine times what you spend in a year. The genuinely useful thing about the arithmetic is what it reveals about savings rate. Because a higher savings rate simultaneously raises what you invest and lowers what you need to fund, its effect on the timeline is far stronger than any plausible difference in investment return. Someone saving half their take-home reaches independence in roughly half the time of someone saving a fifth, at the same return — and that relationship holds regardless of the income level, which is what makes it worth understanding even for people with no intention of retiring early.',
    keyPoints: [
      'FI number = annual expenses ÷ withdrawal rate; at 3.5% that is roughly 29× annual spending.',
      'Savings rate does double duty — it raises contributions and lowers the target — which is why it dominates return.',
      'The timeline depends on the savings rate and barely at all on the income it is a percentage of.',
      'Spending less permanently lowers the target; earning more without spending less only raises the contribution.',
    ],
    faq: [
      {
        q: 'What multiple of expenses do I need?',
        a: 'The inverse of your assumed withdrawal rate: 25× at 4%, roughly 29× at 3.5%, and 33× at 3%. Which rate is appropriate is genuinely contested and depends on horizon, inflation and tax — see [safe withdrawal rates](/learn/retirement/withdrawal-rate), which explains why the widely quoted 4% does not import cleanly into an Indian context.',
      },
      {
        q: 'Does a higher salary get me there faster?',
        a: 'Only if the extra is saved rather than spent. The timeline is driven by the savings rate — the percentage — not the amount, because expenses set the target and the target moves with them. Two people at very different incomes saving the same proportion reach independence in a similar number of years; the higher earner simply arrives at a larger number.',
      },
      {
        q: 'Is this only relevant if I want to retire early?',
        a: 'No, and that framing puts most people off something genuinely useful. The same arithmetic answers "how many years of expenses do I have" and "what would it take to be able to leave a job I dislike". Independence is a spectrum: enough saved to survive six months of unemployment is a meaningful version of it, and it is reached long before the full number.',
      },
    ],
    sections: [
      {
        id: 'the-number',
        title: 'The number itself',
        blocks: [
          {
            kind: 'formula',
            label: 'Financial independence number',
            expression: 'FI number = Annual expenses ÷ Withdrawal rate',
            where: [
              'Annual expenses — what you actually spend in a year, not what you earn.',
              'Withdrawal rate — the proportion of the corpus you consider sustainable to draw annually.',
              'At 4% the multiple is 25×; at 3.5% it is about 29×; at 3% it is 33×.',
            ],
          },
          {
            kind: 'p',
            text: 'Note what the target depends on: your spending, and nothing else. Two people earning very different amounts but spending the same have the same FI number, which is the first counter-intuitive result and the one that reframes the whole exercise.',
          },
          {
            kind: 'worked',
            title: 'One household, three withdrawal assumptions',
            rows: [
              { label: 'Annual expenses', value: '₹12,00,000' },
              { label: 'At 4%', value: '₹3.00 crore' },
              { label: 'At 3.5%', value: '₹3.43 crore' },
              { label: 'At 3%', value: '₹4.00 crore' },
              { label: 'Spread across the assumption', value: '₹1 crore' },
            ],
            conclusion:
              'One assumption, a crore of difference. This is why any FI figure quoted without its withdrawal rate is not a number, and why planning against the conservative end and treating the difference as headroom is the sensible posture.',
          },
        ],
      },
      {
        id: 'savings-rate',
        title: 'Why savings rate dominates',
        blocks: [
          {
            kind: 'p',
            text: 'A savings rate does two things at once, and this is the mechanism that makes it more powerful than return. Raising it increases what you invest each year, and — because the FI number is a multiple of expenses — it simultaneously lowers the target you are aiming at. Return only affects one side of that.',
          },
          {
            kind: 'table',
            caption: 'Years to independence by savings rate, at 6% real return, starting from zero',
            head: ['Savings rate', 'Approximate years'],
            rows: [
              ['10%', '~51'],
              ['20%', '~37'],
              ['30%', '~28'],
              ['40%', '~22'],
              ['50%', '~17'],
              ['60%', '~12.5'],
              ['70%', '~8.5'],
            ],
            note: 'Derived from the annuity formula at a 6% real return with a 4% withdrawal rate, starting from zero. Change either assumption and every row moves — the shape of the relationship is the durable part.',
          },
          {
            kind: 'p',
            text: 'Read the middle of the table. Going from 20% to 40% roughly halves the timeline — a change of twenty percentage points removing fifteen years. No plausible improvement in investment return does anything comparable, and the savings rate is the variable you control.',
          },
          {
            kind: 'note',
            title: 'The income level is absent from the table',
            text: 'There is no income column because the timeline does not depend on one. That is genuinely useful information for someone on a modest salary, and genuinely uncomfortable for someone on a large one whose savings rate is low.',
          },
        ],
      },
      {
        id: 'the-caveats',
        title: 'What the arithmetic leaves out',
        blocks: [
          {
            kind: 'p',
            text: 'The table is clean and real life is not. Four things it does not model, all of which matter.',
          },
          {
            kind: 'list',
            items: [
              '**Expenses change.** Children, ageing parents, health. A target set on today\'s spending assumes a life that stays the same shape, and few do.',
              '**Income is not continuous.** Career breaks, illness, redundancy. A model of uninterrupted contributions is a model of an unusually smooth life.',
              '**Healthcare in India is largely privately funded.** A plan without a serious [health cover](/learn/insurance/health-cover-basics) provision is one large claim from being restarted.',
              '**Sequence of returns.** Reaching the number and immediately meeting a poor five years is a materially different outcome from the same average arriving in a different order.',
            ],
          },
          {
            kind: 'p',
            text: 'None of these invalidates the arithmetic. They argue for a buffer above the calculated number rather than for treating it as a finishing line — and for the milder, more achievable version of the idea in [Coast FI](/learn/financial-independence/coast-fi).',
          },
          {
            kind: 'tool',
            toolId: 'goals',
            text: 'The Reverse Goal Planner solves for the monthly instalment a target and horizon require, which is this calculation run from the other end.',
          },
        ],
      },
    ],
  },

  'coast-fi': {
    summary:
      'Coast FI is the point at which your existing invested balance, left completely alone, would grow to your full retirement number by the time you need it. It arrives far earlier than full independence — often fifteen years or more earlier — and it changes something real without requiring you to stop working: from that point, everything you earn only has to cover current living costs, because retirement is already funded. The arithmetic is a single division, and its value is psychological as much as financial. It converts an abstract, distant target into a nearer one that is genuinely achievable, and it makes a lower-paid or more interesting job affordable in a way the full number never does.',
    keyPoints: [
      'Coast FI = target corpus ÷ (1 + real return)^years remaining — a single calculation from numbers you already have.',
      'It arrives many years before full independence because compounding does the remaining work unassisted.',
      'Reaching it means new earnings only need to cover current expenses, which widens the range of acceptable jobs.',
      'It depends on genuinely not touching the balance, which is the assumption most likely to fail in practice.',
    ],
    faq: [
      {
        q: 'How is Coast FI different from full FI?',
        a: 'Full independence means your corpus can fund your expenses now. Coast FI means your corpus will fund your expenses at retirement age with no further contributions. The second is a much smaller number because compounding is given fifteen or twenty more years to work, and reaching it does not mean stopping work — it means retirement is no longer competing for your income.',
      },
      {
        q: 'What return should I assume?',
        a: 'A real return — after inflation — because the target is expressed in today\'s money. Assuming a nominal return against a target in today\'s rupees double-counts inflation and produces a figure that is far too flattering. Run it at two real rates a point or so apart, because the answer is sensitive to the assumption over long horizons.',
      },
      {
        q: 'Is it safe to actually stop contributing?',
        a: 'It is a calculation, not a guarantee, and it rests on the return assumption holding over decades. Most people who reach it continue contributing something, treating Coast FI as a floor rather than a stopping point. What it genuinely changes is optionality — the ability to take a lower-paid or more interesting role without the retirement plan collapsing.',
      },
    ],
    sections: [
      {
        id: 'the-calculation',
        title: 'The calculation',
        blocks: [
          {
            kind: 'formula',
            label: 'Coast FI balance',
            expression: 'Coast balance = Target corpus ÷ (1 + r)^n',
            where: [
              'Target corpus — your full FI number, in today\'s money.',
              'r — the assumed REAL annual return, after inflation.',
              'n — years until you would want the corpus available.',
            ],
          },
          {
            kind: 'worked',
            title: 'A 32-year-old with a ₹3 crore target at 60',
            rows: [
              { label: 'Target corpus (today\'s money)', value: '₹3,00,00,000' },
              { label: 'Years remaining', value: '28' },
              { label: 'Assumed real return', value: '6% a year' },
              { label: 'Divisor', value: '1.06^28 ≈ 5.112' },
              { label: 'Coast FI balance', value: '₹3,00,00,000 ÷ 5.112 ≈ ₹58.7 lakh' },
              { label: 'Full FI would require', value: '₹3,00,00,000' },
            ],
            conclusion:
              'Roughly ₹59 lakh versus ₹3 crore. Reaching a fifth of the target means the remaining four-fifths arrives without another rupee contributed — which is a genuinely different milestone from the one most people are aiming at.',
          },
          {
            kind: 'p',
            text: 'Run the same numbers at a 5% real return and the balance needed rises to about ₹76 lakh. The sensitivity to the assumption is significant over twenty-eight years, which is the standard caution about any long-horizon projection — see [real versus nominal returns](/learn/inflation/real-returns).',
          },
        ],
      },
      {
        id: 'what-it-changes',
        title: 'What it actually changes',
        blocks: [
          {
            kind: 'p',
            text: 'Reaching Coast FI does not change your bank balance or your monthly obligations. What it changes is which jobs are affordable, and that is a larger practical difference than it sounds.',
          },
          {
            kind: 'list',
            items: [
              '**A lower-paid role becomes viable.** If earnings only need to cover current expenses, a job that pays less but is better in other respects stops being a retirement decision.',
              '**A career break costs less.** Time out no longer sets the retirement plan back, only the current year.',
              '**The pressure changes character.** Retirement stops competing with everything else for the monthly surplus, and that surplus becomes available for nearer goals.',
              '**A downturn is less frightening.** The plan does not depend on contributions continuing through it, which is the specific fear that drives [selling at the bottom](/learn/behavioural-finance/selling-at-the-bottom).',
            ],
          },
          {
            kind: 'note',
            title: 'It is reached earlier than people expect',
            text: 'Because the divisor grows exponentially with years remaining, someone in their early thirties needs a fraction of the full target. The number is frequently in reach within a decade of starting seriously — which makes it a far more motivating milestone than a figure twenty-five years out.',
          },
        ],
      },
      {
        id: 'the-conditions',
        title: 'What it depends on',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Not touching the balance.** The whole calculation assumes the money compounds undisturbed for decades. A withdrawal at year eight resets it, and this is the assumption most likely to fail — which is an argument for a separate [emergency fund](/learn/saving/emergency-fund-size) so nothing forces the withdrawal.',
              '**The real return holding roughly.** Over twenty-eight years the assumption does a great deal of work. Recompute annually rather than treating the figure as settled.',
              '**Expenses not rising permanently.** The target is a multiple of spending, so a permanent increase in spending raises the target and pushes Coast FI back out. This is the [lifestyle creep](/learn/behavioural-finance/lifestyle-creep) mechanism working against a milestone you have already passed.',
              '**Allocation staying appropriate.** A real return of 6% implies a growth-oriented mix. Coasting in cash does not coast — see [asset allocation](/learn/investing/asset-allocation-basics).',
            ],
          },
          {
            kind: 'p',
            text: 'The honest summary is that Coast FI is a useful checkpoint rather than a finishing line. It tells you compounding has taken over the work, which is worth knowing — and most people who reach it keep contributing anyway, because the milestone changed how the money feels rather than what they do with it.',
          },
          {
            kind: 'tool',
            toolId: 'lifemap',
            text: 'LifeMap projects the whole trajectory, which is where a checkpoint like this becomes visible as a point on a curve rather than as a single calculation.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Financial independence means having enough invested that your expenses could be funded without working. The arithmetic behind it is short — annual expenses divided by a sustainable withdrawal rate — and it is worth understanding even if you have no intention of retiring early, because it demonstrates something about savings rate more clearly than anything else in personal finance.',
      'The demonstration is this: savings rate does double duty. Raising it increases what you invest and simultaneously lowers the target, because the target is a multiple of what you spend. Investment return only affects one side of that. The result is that the timeline to independence depends overwhelmingly on the proportion of income saved and barely at all on the income it is a proportion of.',
      'These guides avoid the evangelism the subject attracts. The full version involves trade-offs — years of high savings, a plan that assumes a smooth career and stable expenses, and a healthcare system that in India is largely privately funded — and those deserve naming rather than glossing. Coast FI, the milder version, is reached far sooner and changes more for most people.',
    ],
    definitions: [
      {
        term: 'FI number',
        definition:
          'The corpus at which invested assets could fund annual expenses indefinitely: annual expenses divided by a sustainable withdrawal rate. Depends on what you spend and not at all on what you earn, which is the result most people find surprising.',
      },
      {
        term: 'Savings rate',
        definition:
          'Savings and investments as a proportion of take-home income. The dominant variable in any independence timeline, because it raises contributions and lowers the target at the same time.',
      },
      {
        term: 'Coast FI',
        definition:
          'The balance that, left untouched, grows to the full target by the time it is needed. Reached many years before full independence, and it means new earnings only have to cover current expenses.',
      },
      {
        term: 'Real return',
        definition:
          'Return after inflation. The correct rate to use in any independence calculation, because the target is expressed in today\'s money — using a nominal rate against a today\'s-money target double-counts inflation and flatters the answer substantially.',
      },
    ],
    faq: [
      {
        q: 'How much do I need to be financially independent?',
        a: 'Annual expenses divided by the withdrawal rate you consider sustainable — 25× at 4%, roughly 29× at 3.5%, 33× at 3%. Which rate is appropriate is contested and depends on horizon, inflation and tax. Plan against the conservative end and treat the difference as headroom rather than as a target you have failed to hit.',
      },
      {
        q: 'Does this only work on a high income?',
        a: 'No, and the arithmetic says so explicitly: the timeline depends on the savings rate, not the income. A modest earner saving 40% reaches independence sooner than a high earner saving 10%. What a high income genuinely provides is the ability to reach a high savings rate more comfortably — which is a real advantage and a different claim.',
      },
      {
        q: 'Is extreme early retirement a good idea?',
        a: 'It is a decision with real trade-offs that deserve naming: years of high savings, a plan that assumes uninterrupted health and stable expenses, and in India a healthcare cost structure that is largely privately funded. The arithmetic is sound; the life it implies suits some people and not others. Coast FI captures much of the benefit with far fewer of the trade-offs.',
      },
      {
        q: 'What is the single highest-leverage thing I can do?',
        a: 'Raise the savings rate, and specifically by splitting each raise rather than absorbing it. Every percentage point does double duty — more invested and a lower target — which is why it dominates any plausible improvement in return, and why it is worth more attention than fund selection ever repays.',
      },
    ],
  },
  articles,
};

export default content;
