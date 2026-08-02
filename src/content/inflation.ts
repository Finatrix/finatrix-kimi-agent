/**
 * Editorial copy and article bodies for the Inflation topic.
 *
 * Every figure here is arithmetic the reader can redo. No claims about what
 * inflation currently is or will be — those belong to the RBI, and a page that
 * states a rate is describing one month. What is permanent is the relationship
 * between nominal, real and time, which is what these two articles teach.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'real-returns': {
    summary:
      'A real return is what is left after inflation, and it is the only return that tells you whether you can buy more than you could before. The approximation everyone uses — nominal minus inflation — is close enough at low rates and drifts as rates rise, because the correct relationship is multiplicative rather than additive. The consequence that matters is that a positive nominal return can be a negative real one: a savings account paying 3% while prices rise 6% loses about 2.8% of purchasing power a year, and does so invisibly, because the balance on the statement is going up the whole time.',
    keyPoints: [
      'Real return = (1 + nominal) ÷ (1 + inflation) − 1; subtraction is an approximation that drifts as rates rise.',
      'A positive nominal return can be a negative real one, which is why a growing balance is not evidence of progress.',
      'Compute the real return after tax, not before — tax is applied to the nominal gain, including the inflation part.',
      'Over long horizons small real differences dominate, because they compound while the nominal illusion does not.',
    ],
    faq: [
      {
        q: 'Why not just subtract inflation from the return?',
        a: 'Because the relationship is multiplicative. At low rates subtraction is a good approximation — 7% nominal less 3% inflation gives 4%, and the exact figure is about 3.9%. At higher rates the gap widens: 12% less 8% suggests 4%, and the exact figure is about 3.7%. Use subtraction for a quick check and the exact formula when the numbers matter.',
      },
      {
        q: 'Should I compute the real return before or after tax?',
        a: 'After tax, always, and the order matters: tax is levied on the nominal gain, including the part that merely compensated for inflation. So you are taxed on money that did not increase your purchasing power. At a high slab this can turn a positive pre-tax real return into a negative post-tax one, which is the single strongest argument for comparing investments on a post-tax basis.',
      },
      {
        q: 'Does inflation affect all my expenses equally?',
        a: 'No, and the headline index is an average across a basket that may not resemble yours. Education and healthcare have historically risen faster than general consumer prices in India; some goods have fallen. For long-horizon planning of a specific goal, using the general rate for education costs will under-provide. Use a higher assumption where the category warrants it.',
      },
    ],
    sections: [
      {
        id: 'the-formula',
        title: 'The relationship, exactly',
        blocks: [
          {
            kind: 'formula',
            label: 'Real return from nominal',
            expression: 'Real = (1 + nominal) ÷ (1 + inflation) − 1',
            where: [
              'nominal — the return actually earned, as a decimal.',
              'inflation — the rate at which the prices you face rose, as a decimal.',
              'The familiar "nominal − inflation" is the first-order approximation of this, and it overstates the real return.',
            ],
          },
          {
            kind: 'worked',
            title: 'Where the approximation drifts',
            rows: [
              { label: '7% nominal, 3% inflation — approximate', value: '4.00%' },
              { label: '7% nominal, 3% inflation — exact', value: '1.07 ÷ 1.03 − 1 = 3.88%' },
              { label: '12% nominal, 8% inflation — approximate', value: '4.00%' },
              { label: '12% nominal, 8% inflation — exact', value: '1.12 ÷ 1.08 − 1 = 3.70%' },
              { label: '4% nominal, 6% inflation — exact', value: '1.04 ÷ 1.06 − 1 = −1.89%' },
            ],
            conclusion:
              'The approximation is fine for a mental check and understates the damage at higher rates. The last row is the important one: a positive nominal return that is losing purchasing power every year.',
          },
        ],
      },
      {
        id: 'the-invisible-loss',
        title: 'Why the loss is invisible',
        blocks: [
          {
            kind: 'p',
            text: 'A savings account balance only ever goes up. Every statement confirms progress, and nothing in the account tells you that the same balance buys less than it did last year. That is the entire reason inflation is underweighted in household decisions — the counterfactual is not displayed anywhere.',
          },
          {
            kind: 'worked',
            title: '₹10 lakh in a savings account for ten years',
            rows: [
              { label: 'Nominal rate', value: '3.0% a year' },
              { label: 'Inflation assumed', value: '6.0% a year' },
              { label: 'Balance after 10 years', value: '₹10,00,000 × 1.03^10 ≈ ₹13,44,000' },
              { label: 'Real return per year', value: '1.03 ÷ 1.06 − 1 ≈ −2.83%' },
              { label: 'Purchasing power after 10 years', value: '₹10,00,000 × 0.9717^10 ≈ ₹7,51,000' },
            ],
            conclusion:
              'The balance grew by ₹3.44 lakh and the purchasing power fell by roughly ₹2.49 lakh. Both statements are true, and only the first one appears anywhere the account holder can see it.',
          },
          {
            kind: 'note',
            title: 'This is why an emergency fund is not an investment',
            text: 'Judged on real return, cash held for safety looks terrible, and that is the wrong test. It is insurance against having to sell an investment or borrow at card rates in a bad month — see [emergency fund size](/learn/saving/emergency-fund-size). The mistake is not holding cash; it is holding far more of it than the insurance requires.',
          },
        ],
      },
      {
        id: 'after-tax',
        title: 'Tax first, then inflation',
        blocks: [
          {
            kind: 'p',
            text: 'The order of operations matters and it is unfavourable. Tax is charged on the nominal gain, which includes the portion that only compensated you for inflation. You are therefore taxed on an increase in purchasing power you did not receive.',
          },
          {
            kind: 'worked',
            title: 'A deposit at a 30% slab, with 6% inflation',
            rows: [
              { label: 'Nominal rate', value: '7.5%' },
              { label: 'Post-tax nominal', value: '7.5% × (1 − 0.30) = 5.25%' },
              { label: 'Real, post-tax', value: '1.0525 ÷ 1.06 − 1 ≈ −0.71%' },
              { label: 'At a 5% slab instead', value: '7.5% × 0.95 = 7.125% → 1.07125 ÷ 1.06 − 1 ≈ +1.06%' },
            ],
            conclusion:
              'The same instrument at the same rate is mildly negative in real terms for one taxpayer and mildly positive for another. Whose money it is changes whether the investment works, which is the argument behind [post-tax comparison](/learn/tax/capital-gains-basics).',
          },
          {
            kind: 'tool',
            toolId: 'parksmart',
            text: 'ParkSmart ranks short-horizon options on what you keep after tax at the slab you enter, which is the first half of this calculation done for you.',
          },
        ],
      },
    ],
    sources: [
      {
        label: 'Reserve Bank of India — inflation and price statistics',
        url: 'https://www.rbi.org.in/Scripts/Statistics.aspx',
      },
    ],
  },

  'inflation-and-goals': {
    summary:
      'A goal set in today\'s money is already wrong for any date more than a couple of years away, and the error compounds. A ₹30 lakh education cost fifteen years out is not a ₹30 lakh problem — at 8% education inflation it is closer to ₹95 lakh, and a plan funded to the smaller figure lands about two-thirds short. The fix is one multiplication done before anything else: inflate the target to what it will cost at the date, then solve for the instalment against that number. The second half of the fix is choosing the right inflation rate, because education and healthcare have historically outpaced the general index by enough to matter over long horizons.',
    keyPoints: [
      'Inflate the target before solving for the instalment; solving first and adjusting later understates the requirement.',
      'Use a category-appropriate rate — education and healthcare have historically risen faster than the general index.',
      'The error grows with the horizon, so the goals most likely to be under-funded are the most important ones.',
      'Revisit annually: both the target and the assumption move, and a fifteen-year plan set once is a plan set wrong.',
    ],
    faq: [
      {
        q: 'What inflation rate should I use for a goal?',
        a: 'Match it to the category rather than using one rate for everything. General living costs take a general assumption; education and healthcare have historically risen faster and warrant a higher one; a specific durable good may warrant a lower one. Then run the calculation at two rates a couple of points apart, because the spread is more informative than either single answer.',
      },
      {
        q: 'Does inflation matter for a two-year goal?',
        a: 'Marginally. Over two years at 6%, a target rises about 12% — real, but small relative to the uncertainty in your own plans over that period. It becomes the dominant term somewhere around the five-to-seven-year mark and is the largest single factor in any goal beyond ten years.',
      },
      {
        q: 'Should the monthly contribution also rise?',
        a: 'Ideally yes, and it is the single most effective adjustment available. A fixed instalment loses purchasing power every year, so a flat contribution funds a shrinking real share of an inflating target. A step-up of even a modest percentage annually — matched to your own income growth — substantially lowers the starting instalment required.',
      },
    ],
    sections: [
      {
        id: 'the-multiplication',
        title: 'The one multiplication',
        blocks: [
          {
            kind: 'formula',
            label: 'Future cost of a goal',
            expression: 'Future cost = Today’s cost × (1 + i)^n',
            where: [
              'Today’s cost — what the thing would cost if you bought it now.',
              'i — the annual inflation rate for that category, as a decimal.',
              'n — years until you need it.',
            ],
          },
          {
            kind: 'worked',
            title: 'A university education, fifteen years out',
            rows: [
              { label: 'Cost today', value: '₹30,00,000' },
              { label: 'Education inflation assumed', value: '8% a year' },
              { label: 'Years', value: '15' },
              { label: 'Multiplier', value: '1.08^15 ≈ 3.172' },
              { label: 'Cost at the date', value: '≈ ₹95,16,000' },
              { label: 'Funding to ₹30 lakh instead', value: 'Covers roughly 32% of the actual cost' },
            ],
            conclusion:
              'A plan built on today\'s price funds under a third of the requirement. Nothing about the plan was careless except the missing multiplication, which is what makes this the most consequential single step in goal planning.',
          },
          {
            kind: 'p',
            text: 'Run the same numbers at 6% and the target is roughly ₹72 lakh. The gap between the two assumptions is ₹23 lakh, which is why the honest output is a range and why the assumption deserves to be stated wherever the figure is quoted.',
          },
        ],
      },
      {
        id: 'choosing-the-rate',
        title: 'Choosing the rate',
        blocks: [
          {
            kind: 'table',
            caption: 'Which assumption fits which goal',
            head: ['Goal', 'Rate to consider', 'Why'],
            rows: [
              ['General living costs in retirement', 'General consumer inflation', 'A broad basket resembles a broad basket'],
              ['Education', 'Higher than general', 'Fee inflation has historically outpaced the general index'],
              ['Healthcare provision', 'Higher than general', 'Medical cost inflation has run above the headline rate'],
              ['A property deposit', 'Property-specific, and location-dependent', 'Property does not track the consumer index at all'],
              ['A car or durable good', 'General or lower', 'Manufactured goods have often inflated slowly'],
            ],
            note: 'Directional guidance rather than rates. For current and historical figures, the RBI publishes the price statistics.',
          },
          {
            kind: 'warning',
            title: 'Do not use one rate for every goal',
            text: 'Applying a single general assumption across a plan under-provides for education and healthcare — the two goals where falling short has the least acceptable consequences — while over-providing for goals that inflate slowly. The correction costs nothing except doing it per goal.',
          },
        ],
      },
      {
        id: 'the-instalment',
        title: 'From an inflated target to a monthly figure',
        blocks: [
          {
            kind: 'p',
            text: 'Once the target is inflated, solving for the contribution is the standard annuity calculation — the same formula as [SIP maths](/learn/investing/sip-maths), rearranged for the payment. The important thing is the order: inflate first, then solve. Solving against today\'s cost and adding a margin afterwards systematically under-provides, because the margin people add is nothing like a threefold multiplier.',
          },
          {
            kind: 'p',
            text: 'Two adjustments reduce the instalment materially. A step-up contribution, which matches how income actually behaves and lowers the starting figure substantially. And subtracting anything already saved toward the goal before solving, which is easy to forget when the target has just tripled.',
          },
          {
            kind: 'tool',
            toolId: 'goals',
            text: 'The Reverse Goal Planner does exactly this sequence — it inflates the target to the horizon before solving for the instalment, and offers a 10% step-up option.',
          },
          {
            kind: 'p',
            text: 'The same discipline applies to the largest goal of all, where the horizon is longest and the multiplier therefore biggest — see [working out the retirement corpus you need](/learn/retirement/retirement-corpus).',
          },
          {
            kind: 'p',
            text: 'One more adjustment is worth making explicit, because leaving it out is the second most common error after skipping the inflation step entirely. When you inflate the target, you must use a NOMINAL return to grow the contributions toward it — or, equivalently, keep the target in today\'s money and use a real return. Mixing the two, by inflating the target and then also using a real return, double-counts inflation and produces a required instalment far larger than the goal actually needs.',
          },
          {
            kind: 'p',
            text: 'Either convention works and neither is more correct. What matters is being explicit about which one a given calculation is using, because the two produce very different-looking numbers from the same underlying plan — and a figure quoted without saying which convention produced it cannot be checked by anyone, including you a year later.',
          },
        ],
      },
    ],
    sources: [
      {
        label: 'Reserve Bank of India — price statistics',
        url: 'https://www.rbi.org.in/Scripts/Statistics.aspx',
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Inflation is the quiet term in every financial calculation, and leaving it out biases every long-horizon number in the same direction: optimistic. A savings balance that only ever rises looks like progress even while its purchasing power falls, and a goal priced in today\'s money looks affordable right up until the date arrives.',
      'Two calculations fix most of it. Converting a nominal return into a real one tells you whether an investment is actually gaining ground. Inflating a goal to what it will cost at its date tells you what you are really funding. Neither is difficult, both are routinely skipped, and the second one changes long-horizon targets by multiples rather than by percentages.',
      'These guides state no current inflation rate, because a page that does is describing one month and will be wrong for the rest of its life. The RBI publishes the figures; what is published here is the arithmetic those figures slot into, worked in full so you can redo it with whatever assumption you consider reasonable.',
    ],
    definitions: [
      {
        term: 'Nominal return',
        definition:
          'The return as quoted, before any adjustment for inflation. It is the number on the statement and the number in every advertisement, and on its own it does not say whether you can buy more than you could before.',
      },
      {
        term: 'Real return',
        definition:
          'Return after inflation: (1 + nominal) ÷ (1 + inflation) − 1. The only return that measures a change in purchasing power, and frequently negative on cash held in a savings account.',
      },
      {
        term: 'Purchasing power',
        definition:
          'What a sum of money can actually buy. It falls as prices rise even when the balance is growing, which is why a rising statement balance is not evidence that a saver is ahead.',
      },
      {
        term: 'Category inflation',
        definition:
          'The rate at which a specific category of cost has risen, as distinct from the headline index. Education and healthcare have historically outpaced general consumer inflation in India, which matters for exactly the goals where falling short is least acceptable.',
      },
    ],
    faq: [
      {
        q: 'How do I calculate a real return?',
        a: 'Divide one plus the nominal return by one plus inflation, then subtract one. Subtracting inflation from the nominal rate is a good approximation at low rates and increasingly optimistic as rates rise. Do it after tax rather than before, because tax is charged on the nominal gain including the part that only compensated for inflation.',
      },
      {
        q: 'Why does inflation matter so much for long-term goals?',
        a: 'Because it compounds. At 6% a year, costs roughly double in twelve years and triple in twenty. A goal fifteen or twenty years out priced in today\'s money is therefore under-funded by a multiple rather than by a margin, and the goals with the longest horizons are usually education and retirement — the two it is least acceptable to under-fund.',
      },
      {
        q: 'Is cash always a bad place to keep money?',
        a: 'No — it is a bad investment and a good insurance policy, and confusing the two is the error. Money that must be available within days has one job, and any return it earns is incidental. What is genuinely costly is holding far more cash than that job requires, because the excess is losing purchasing power every year in a way nothing on the statement reveals.',
      },
      {
        q: 'What inflation rate should I assume in planning?',
        a: 'One that suits the category, and then a second one a couple of points away to see how sensitive the answer is. General living costs, education and healthcare do not inflate at the same rate, and using a single assumption across a plan under-provides for two of them. Any single-number answer implies a confidence the assumption does not support.',
      },
    ],
  },
  articles,
};

export default content;
