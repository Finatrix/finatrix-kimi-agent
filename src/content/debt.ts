/**
 * Editorial copy and article bodies for the Debt topic.
 *
 * Card interest rates are stated as a RANGE and described as a category figure
 * ("commonly quoted at around 3–3.5% a month") rather than as a fact about any
 * issuer, because they vary by card and change. The arithmetic — which is the
 * part that persuades — is shown in full so the reader can redo it with whatever
 * rate their own statement shows.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'avalanche-vs-snowball': {
    summary:
      'Two payoff orders compete once you have more than one debt. The avalanche pays the highest interest rate first and is mathematically optimal — it always costs less in total interest. The snowball pays the smallest balance first and finishes individual debts sooner, which produces visible progress and, for a lot of people, a higher chance of completing the plan at all. The honest recommendation is avalanche where the rate gap is wide, because the cost of the alternative is real money; snowball where the rates are similar, because then the difference in total interest is small and the difference in completion rate is not. Both beat paying minimums on everything.',
    keyPoints: [
      'Avalanche always costs less in interest; the only question is whether you will finish it.',
      'Where the highest and lowest rates are close, the avalanche saving is small and the psychological argument wins.',
      'A card at typical revolving rates outranks every other debt and almost every investment, so it comes first under either method.',
      'Both methods depend on the same mechanic: pay minimums everywhere, and direct all spare money at exactly one debt.',
    ],
    faq: [
      {
        q: 'Which method should I actually use?',
        a: 'Compare the highest and lowest rates you hold. If the gap is wide — a card at revolving rates alongside a home loan — use avalanche, because the cost of doing otherwise is substantial and the highest-rate debt is also usually painful enough to stay motivating. If every debt is within a few percentage points, use whichever you will finish, which for most people is the snowball.',
      },
      {
        q: 'Should I pay off debt or invest?',
        a: 'Compare the debt\'s rate against the return you could reasonably expect after tax, and note that the debt return is certain while the investment return is not. Clearing a card balance is a guaranteed return at the card\'s rate, which no portfolio reliably matches. For a low-rate secured loan the comparison is genuinely close — [prepay or invest](/learn/loans/prepay-or-invest) works through it.',
      },
      {
        q: 'Does consolidating debt help?',
        a: 'Only if the new rate is genuinely lower after fees, and only if the behaviour that created the balance has changed. Consolidation that lowers the monthly payment by extending the term usually increases total interest, and a consolidation loan that leaves the cards open frequently ends with both the loan and fresh card balances. Check the total cost over the full term, not the monthly figure.',
      },
    ],
    sections: [
      {
        id: 'the-two-orders',
        title: 'The two orders',
        blocks: [
          {
            kind: 'p',
            text: 'Both methods do the same thing mechanically: pay the minimum on everything, then send every spare rupee to one target debt. When that debt clears, its whole payment rolls into the next target. The methods differ only in how the target is chosen.',
          },
          {
            kind: 'table',
            caption: 'Avalanche and snowball, compared',
            head: ['', 'Avalanche', 'Snowball'],
            rows: [
              ['Target', 'Highest interest rate first', 'Smallest balance first'],
              ['Total interest paid', 'Lowest possible', 'Higher'],
              ['First debt cleared', 'Later', 'Sooner'],
              ['Argument for it', 'It costs less', 'It is more likely to be finished'],
            ],
          },
          {
            kind: 'p',
            text: 'The snowball is not a mathematical mistake made by people who cannot do arithmetic. It is a deliberate trade of some interest for a higher chance of completion, and whether that trade is good depends entirely on how much interest it costs — which is a number you can compute rather than argue about.',
          },
        ],
      },
      {
        id: 'worked',
        title: 'What the choice costs, worked',
        blocks: [
          {
            kind: 'worked',
            title: 'Three debts, ₹15,000 a month available above minimums',
            rows: [
              { label: 'Card', value: '₹80,000 at ~3.2% a month' },
              { label: 'Personal loan', value: '₹1,80,000 at ~15% a year' },
              { label: 'Consumer durable loan', value: '₹35,000 at ~12% a year' },
              { label: 'Avalanche order', value: 'Card → personal loan → durable loan' },
              { label: 'Snowball order', value: 'Durable loan → card → personal loan' },
              { label: 'The cost of the difference', value: 'Months of card interest at over 3% a month, on ₹80,000' },
            ],
            conclusion:
              'Here the rate gap is enormous — a card at roughly 3.2% a month is annualised well above 45%, against 12% for the smallest balance. Clearing the ₹35,000 first for the satisfaction costs several months of that. This is a case where avalanche is clearly right.',
          },
          {
            kind: 'p',
            text: 'Reverse the example — three debts at 13%, 14% and 15% — and the avalanche advantage shrinks to a rounding error over a year. At that point the method you will actually finish is the better method, and there is no arithmetic argument against choosing it.',
          },
          {
            kind: 'note',
            title: 'The rule that covers both',
            text: 'Whichever order you choose, the mechanic is the same and it is the part that matters: minimums everywhere, everything spare at one debt, and the freed-up payment rolls forward. Spreading spare money across all three debts equally is the option that is worse than both.',
          },
        ],
      },
      {
        id: 'before-either',
        title: 'What to do before starting either',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**List every debt with its actual rate.** Not the EMI, the rate. Card statements quote a monthly rate; annualise it before comparing with a loan.',
              '**Build a small buffer first.** Around one month of essential expenses. Without it, the first unexpected bill goes back onto a card and the plan restarts — see [emergency fund size](/learn/saving/emergency-fund-size).',
              '**Fix the leak.** If the balance grew from ongoing overspending rather than a one-off, the payoff plan will be outrun by new borrowing. [Tracking expenses](/learn/budgeting/track-expenses-that-stick) comes first in that case.',
              '**Decide the monthly amount and automate it.** A payoff plan that depends on remembering is a payoff plan that depends on a good month.',
            ],
          },
          {
            kind: 'p',
            text: 'One habit makes either method dramatically more likely to finish, and it costs nothing: when a debt clears, do not let its payment disappear into general spending. The whole mechanic depends on the freed-up amount rolling into the next target, which is why the plan accelerates rather than staying flat — the amount going at the remaining debts grows every time one is cleared. Households that skip this find the last debt takes as long as the first, and conclude that the method does not work when what actually happened is that it was quietly switched off.',
          },
          {
            kind: 'p',
            text: 'It is also worth writing down the projected finish date at the start, on the assumption you keep the current spare amount going. It converts an open-ended slog into a fixed term, which is psychologically a completely different thing — and it gives you something concrete to compare against when a windfall arrives and you are deciding whether to put it at the debt.',
          },
          {
            kind: 'tool',
            toolId: 'budget',
            text: 'Budget Builder separates minimum repayments (a need) from anything above the minimum (savings), which is the split that makes the spare amount visible.',
          },
        ],
      },
    ],
  },

  'credit-card-interest': {
    summary:
      'A credit card is free credit until the statement due date and one of the most expensive borrowings available the moment it is not. Revolving rates in India are commonly quoted per month — often somewhere around 3 to 3.5% — which annualises to well above 40%, and two features make it worse than the headline suggests: interest is typically charged from the transaction date rather than the statement date once you revolve, and the interest-free period does not apply to new purchases while a balance is outstanding. Paying the minimum is not a partial payment; on a typical balance it barely covers the interest, which is why a balance paid at the minimum moves almost imperceptibly.',
    keyPoints: [
      'Card rates are quoted monthly; annualise before comparing them to any loan or any expected investment return.',
      'Once you revolve, new purchases usually attract interest from day one — the interest-free period is suspended.',
      'The minimum payment is designed to keep the account current, not to reduce the balance meaningfully.',
      'Clearing a card balance is a guaranteed return at the card\'s rate, which outranks any investment decision you could make.',
    ],
    faq: [
      {
        q: 'What does a credit card actually cost per year?',
        a: 'Take the monthly rate on your statement and compound it: a rate of 3.2% a month is (1.032)^12 − 1, or roughly 46% a year. Rates vary by card and issuer and the range commonly quoted in India sits around 3 to 3.5% a month, so annualised figures in the forties are typical. Use your own statement rather than any published figure.',
      },
      {
        q: 'Why did I get charged interest even after paying most of the bill?',
        a: 'Because on most cards the interest-free period applies only when the statement is cleared in full. Pay 90% and the remaining balance typically attracts interest from each transaction date rather than from the due date, and new purchases in the following cycle usually lose their interest-free period too. Paying "most of it" is meaningfully different from paying all of it.',
      },
      {
        q: 'Is a card balance worth converting to an EMI?',
        a: 'Frequently yes, because a card issuer\'s EMI conversion rate is usually far below the revolving rate — but check the processing fee, whether GST applies, and the total cost over the tenure rather than the monthly figure. A personal loan at a lower rate can be better again. Any of these beats revolving, which is the comparison that matters most.',
      },
    ],
    sections: [
      {
        id: 'the-rate',
        title: 'The rate, annualised',
        blocks: [
          {
            kind: 'formula',
            label: 'Annualising a monthly card rate',
            expression: 'Annual rate = (1 + m)^12 − 1',
            where: [
              'm — the monthly rate shown on your statement, as a decimal.',
              'At m = 0.030 → about 42.6% a year.',
              'At m = 0.035 → about 51.1% a year.',
              'Simple multiplication by 12 understates it, because the interest itself compounds.',
            ],
          },
          {
            kind: 'p',
            text: 'The monthly presentation is the reason cards are underestimated. Three per cent sounds like a small number and is one of the highest borrowing rates a household will ever encounter. Nothing in a normal financial life competes with it: no investment reliably returns forty per cent, and no other consumer debt charges it.',
          },
          {
            kind: 'warning',
            title: 'Two features that make it worse than the rate',
            text: 'Once a balance revolves, interest is typically charged from each transaction date rather than from the statement date, and new purchases generally lose the interest-free period until the balance is cleared in full. The effective cost of the first month of revolving is therefore higher than the rate alone implies.',
          },
        ],
      },
      {
        id: 'the-minimum',
        title: 'What the minimum payment actually does',
        blocks: [
          {
            kind: 'p',
            text: 'A minimum payment is commonly a small percentage of the outstanding balance. Its purpose is to keep the account in good standing, not to reduce what you owe, and on a typical balance most of it is consumed by that month\'s interest.',
          },
          {
            kind: 'worked',
            title: 'A ₹1,00,000 balance at 3.2% a month, paying only the minimum',
            rows: [
              { label: 'Monthly interest', value: '₹1,00,000 × 3.2% = ₹3,200' },
              { label: 'Minimum payment at 5%', value: '₹5,000' },
              { label: 'Applied to principal', value: '₹5,000 − ₹3,200 = ₹1,800' },
              { label: 'Balance after one month', value: '₹98,200' },
              { label: 'Reduction achieved', value: '1.8% of the balance, in a month' },
            ],
            conclusion:
              'At that pace the balance is still substantial years later, and the total interest paid vastly exceeds the original purchase. The minimum is not slow progress — it is close to no progress, and it is designed that way.',
          },
          {
            kind: 'p',
            text: 'This is also why a card balance outranks everything else in a [payoff plan](/learn/debt/avalanche-vs-snowball). Clearing it is a guaranteed return at the card\'s rate, and no portfolio offers a guaranteed forty per cent.',
          },
        ],
      },
      {
        id: 'getting-out',
        title: 'Getting out, in order',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Stop using the card entirely** until the balance is cleared. While a balance revolves, each new purchase starts accruing interest immediately, so continuing to spend on it is borrowing at the full rate.',
              '**Find a cheaper rate for the existing balance.** An EMI conversion from the issuer, a personal loan, or a balance transfer — checking fees and total cost over the term, not the monthly payment.',
              '**Direct everything spare at it.** It is almost certainly your highest-rate debt and therefore first under the avalanche method by a wide margin.',
              '**Keep a small buffer while you do.** Without one, the next unexpected expense goes back on the card and the progress reverses.',
              '**Then set up full-balance auto-payment,** which is the mechanism that stops this recurring.',
            ],
          },
          {
            kind: 'p',
            text: 'Used with the balance cleared every month, a card is a genuinely useful instrument — a free short-term float, a purchase record, and a factor in [what moves a credit score](/learn/credit-scores/what-moves-a-score). The entire difference between useful and expensive is whether the statement is paid in full.',
          },
        ],
      },
    ],
    sources: [
      {
        label: 'Reserve Bank of India — credit card and debit card directions',
        url: 'https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx',
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Debt is arithmetic with a deadline, and most of the difficulty people have with it is not mathematical. The order in which you clear multiple debts has a mathematically correct answer, and the mathematically correct answer is not always the one you should follow — which is an unusual thing to be true in finance and worth being explicit about.',
      'The one case where there is no trade-off is a revolving credit card balance. At the rates commonly charged in India, annualised well above forty per cent, it outranks every other debt and every investment decision you could make with the same rupee. No portfolio reliably returns what a card charges, so clearing the balance is the highest guaranteed return available to most households.',
      'These guides show the arithmetic in full rather than asserting conclusions, because the conclusions depend on your own rates. Take the numbers from your own statements — a card\'s monthly rate, a loan\'s annual one — and redo the calculations on them.',
    ],
    definitions: [
      {
        term: 'Avalanche method',
        definition:
          'Paying minimums on every debt and directing all spare money at the highest interest rate first. Mathematically optimal — it always minimises total interest — and correct wherever the rate gap between your debts is wide.',
      },
      {
        term: 'Snowball method',
        definition:
          'Paying minimums on every debt and directing all spare money at the smallest balance first. Costs more in interest and clears individual debts sooner, which raises completion rates. A reasonable choice where the rates are close, and an expensive one where they are not.',
      },
      {
        term: 'Revolving',
        definition:
          'Carrying a credit card balance past the statement due date. It triggers interest at the card\'s full rate and typically removes the interest-free period from new purchases until the balance is cleared in full.',
      },
      {
        term: 'Minimum payment',
        definition:
          'The smallest amount that keeps a card account current, usually a small percentage of the balance. On a typical balance most of it is absorbed by that month\'s interest, which is why paying it reduces the principal only marginally.',
      },
    ],
    faq: [
      {
        q: 'Which debt should I pay off first?',
        a: 'The highest interest rate, unless every rate you hold is within a few percentage points of the others — in which case pay the smallest balance first, because the interest difference is small and finishing something visible raises the chance you complete the plan. A revolving card balance is the highest rate in almost every household and comes first under either method.',
      },
      {
        q: 'Is all debt bad?',
        a: 'No, and the useful distinction is rate and purpose rather than morality. A home loan at single-digit rates against an appreciating asset is a different instrument from a card revolving above forty per cent. The test is whether the rate is below what the money could reasonably earn elsewhere, and whether the repayment fits in a month you can survive.',
      },
      {
        q: 'Should I clear debt before building an emergency fund?',
        a: 'Build a small buffer first — around one month of essential expenses — then attack the debt hard, then complete the fund. Without any buffer, the first unexpected expense goes straight back onto a card and the payoff restarts, which is more expensive than the interest the buffer costs you.',
      },
      {
        q: 'Does paying off debt help my credit score?',
        a: 'Reducing card utilisation usually helps and can act relatively quickly. Closing an old account can hurt, because it shortens your credit history and removes available limit. The mechanics are not intuitive, which is why [what moves a credit score](/learn/credit-scores/what-moves-a-score) is worth reading before closing anything.',
      },
    ],
  },
  articles,
};

export default content;
