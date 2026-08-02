/**
 * Editorial copy and article bodies for the Loans topic.
 *
 * The EMI formula here is the standard reducing-balance annuity formula, which
 * is what every Indian lender's EMI calculation uses. It is stated in full and
 * worked with numbers so a reader can reproduce any quoted instalment — the same
 * editorial contract the SIP article operates under.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'emi-formula': {
    summary:
      'An EMI is produced by one formula — the annuity payment for a reducing-balance loan — and knowing it lets you check any instalment a lender quotes. The formula has three inputs: principal, the monthly interest rate, and the number of months. What it makes visible is the thing borrowers most consistently misjudge, which is what tenure does. Extending a loan lowers the monthly instalment and raises total interest sharply, because interest accrues on the outstanding balance for longer. On a long loan the total interest can approach or exceed the amount borrowed, and the choice of tenure decides that far more than a small difference in rate does.',
    keyPoints: [
      'EMI = P × i × (1+i)^n / ((1+i)^n − 1), where i is the monthly rate and n the number of months.',
      'Early instalments are mostly interest; the principal share rises through the schedule, which is why early prepayment saves most.',
      'Doubling the tenure lowers the EMI substantially and increases total interest by considerably more than double.',
      'Compare loans on total cost over the term, never on the monthly instalment, which can always be lowered by lengthening.',
    ],
    faq: [
      {
        q: 'Why is so much of my early EMI going to interest?',
        a: 'Because interest each month is charged on the balance outstanding that month, and at the start the balance is at its largest. The instalment is fixed, so the interest portion is large and the principal portion is what is left over. As the balance falls the interest shrinks and the principal share grows — which is why the same EMI reduces your debt much faster in year twelve than in year one.',
      },
      {
        q: 'Should I choose a longer tenure to reduce the EMI?',
        a: 'Only as far as affordability genuinely requires. A longer tenure lowers the monthly figure and raises total interest disproportionately, because you are borrowing the same money for longer. The sensible approach is the shortest tenure whose EMI you can service in a bad month, not the longest one the lender will offer.',
      },
      {
        q: 'Does a lower interest rate always mean a cheaper loan?',
        a: 'Not on its own. Processing fees, insurance bundled into the loan, prepayment charges and the tenure all affect total cost. Compute the total amount repaid over the full term for each option, including fees. A quarter-point rate difference is frequently smaller than the fee difference, and always smaller than a tenure difference.',
      },
    ],
    sections: [
      {
        id: 'the-formula',
        title: 'The formula',
        blocks: [
          {
            kind: 'formula',
            label: 'Equated monthly instalment, reducing balance',
            expression: 'EMI = P × i × (1 + i)^n / ((1 + i)^n − 1)',
            where: [
              'P — the principal borrowed.',
              'i — the monthly interest rate: the annual rate divided by 12, as a decimal.',
              'n — the number of monthly instalments.',
              'The result is the fixed monthly payment that exactly clears P over n months at rate i.',
            ],
          },
          {
            kind: 'p',
            text: 'This is the annuity payment formula, and it is the inverse of the future-value formula behind [SIP maths](/learn/investing/sip-maths) — one solves for the payment that clears a present balance, the other for the balance a payment builds. The same arithmetic runs in both directions.',
          },
          {
            kind: 'worked',
            title: 'A ₹40,00,000 loan at 8.5% for 20 years',
            rows: [
              { label: 'Principal (P)', value: '₹40,00,000' },
              { label: 'Monthly rate (i)', value: '8.5% ÷ 12 = 0.0070833' },
              { label: 'Months (n)', value: '240' },
              { label: '(1+i)^n', value: '≈ 5.4517' },
              { label: 'EMI', value: '≈ ₹34,713' },
              { label: 'Total repaid', value: '≈ ₹83.3 lakh' },
              { label: 'Total interest', value: '≈ ₹43.3 lakh — more than the amount borrowed' },
            ],
            conclusion:
              'Over twenty years the interest exceeds the principal. That is not a sign of an unusual rate; it is what borrowing at 8.5% for two decades costs, and it is invisible if you only ever look at the instalment.',
          },
        ],
      },
      {
        id: 'what-tenure-does',
        title: 'What tenure actually costs',
        blocks: [
          {
            kind: 'table',
            caption: 'The same ₹40,00,000 at 8.5%, at different tenures',
            head: ['Tenure', 'Approx. EMI', 'Approx. total interest'],
            rows: [
              ['10 years', '₹49,600', '₹19.5 lakh'],
              ['15 years', '₹39,400', '₹30.9 lakh'],
              ['20 years', '₹34,700', '₹43.3 lakh'],
              ['25 years', '₹32,200', '₹56.6 lakh'],
              ['30 years', '₹30,800', '₹70.8 lakh'],
            ],
            note: 'Figures rounded and computed from the formula above; reproduce any row with your own rate.',
          },
          {
            kind: 'p',
            text: 'Read the extremes. Going from ten years to thirty lowers the instalment by about ₹18,800 a month and raises total interest by roughly ₹51 lakh. The monthly saving is visible every month; the total cost is visible nowhere unless you compute it.',
          },
          {
            kind: 'warning',
            title: 'The lender optimises for the instalment',
            text: 'A longer tenure makes a larger loan look affordable, which is why it is offered readily. Neither the offer nor the acceptance is dishonest — but the number being optimised is the monthly one, and total cost moves in the opposite direction. Ask for the total repayable at each tenure and compare those.',
          },
        ],
      },
      {
        id: 'the-schedule',
        title: 'Reading the amortisation schedule',
        blocks: [
          {
            kind: 'p',
            text: 'Each month, interest is the outstanding balance times the monthly rate, and the principal repaid is the EMI less that interest. Because the balance falls, the interest falls and the principal share rises — slowly at first, then faster.',
          },
          {
            kind: 'worked',
            title: 'The first month and a later month of the loan above',
            rows: [
              { label: 'Month 1 — interest', value: '₹40,00,000 × 0.0070833 ≈ ₹28,333' },
              { label: 'Month 1 — principal', value: '₹34,713 − ₹28,333 ≈ ₹6,380' },
              { label: 'Month 121 — balance', value: '≈ ₹28.4 lakh' },
              { label: 'Month 121 — interest', value: '≈ ₹20,100' },
              { label: 'Month 121 — principal', value: '≈ ₹14,600' },
            ],
            conclusion:
              'In month one, 82% of the payment is interest. Ten years in, it is under 60%. This is the mechanical reason a prepayment made early saves far more than the same amount paid late — it removes principal that would otherwise have been charged interest for the entire remaining term.',
          },
          {
            kind: 'p',
            text: 'Whether that prepayment is the best use of the money is a separate question, and it depends on what the money would otherwise earn after tax — [prepay or invest](/learn/loans/prepay-or-invest) works it through.',
          },
          {
            kind: 'tool',
            toolId: 'budget',
            text: 'An EMI is a fixed cost committed ahead of the month, so it belongs in the needs group of a budget at its minimum contractual amount — Budget Builder shows what remains around it.',
          },
        ],
      },
    ],
  },

  'prepay-or-invest': {
    summary:
      'Prepaying a loan is a guaranteed return equal to the loan\'s interest rate. Investing the same money is an uncertain return that may be higher. The comparison is therefore not "which rate is bigger" but "is the expected return, after tax, enough higher than the loan rate to be worth the uncertainty" — and the answer changes with the type of debt. Against a card or a personal loan the answer is almost always prepay, because no portfolio reliably beats those rates. Against a home loan at single-digit rates the comparison is genuinely close, and two non-financial factors — liquidity and how you would sleep — decide it more often than the arithmetic does.',
    keyPoints: [
      'Prepaying returns the loan rate, guaranteed and tax-free; an investment return is an expectation, not a promise.',
      'Compare the loan rate against the expected post-tax return, not the pre-tax headline of an investment.',
      'Prepayment is irreversible: money in a loan cannot be withdrawn in an emergency, which has a real value.',
      'Do neither before an emergency fund exists, because both are worse than borrowing at card rates later.',
    ],
    faq: [
      {
        q: 'What return does prepaying actually give me?',
        a: 'The loan\'s interest rate, guaranteed, and with no tax on it — because you are not earning income, you are avoiding a cost. A prepayment against an 8.5% loan is equivalent to a guaranteed 8.5% post-tax return, which is a better deal than the same nominal return from an investment taxed at your slab.',
      },
      {
        q: 'Is it better to reduce the EMI or the tenure when I prepay?',
        a: 'Reducing the tenure saves substantially more interest, because you keep paying the same amount against a smaller balance. Reducing the EMI improves monthly cash flow and saves much less. Choose tenure reduction unless the monthly amount is genuinely straining the household — most lenders default to one or the other, so state which you want.',
      },
      {
        q: 'Should I prepay if my loan gives me a tax deduction?',
        a: 'The deduction reduces the effective cost of the loan, so factor it in rather than ignoring it — an 8.5% loan whose interest is deductible costs less than 8.5% net. Whether it still exceeds your expected post-tax investment return is the same comparison, run on the adjusted rate. The deduction narrows the gap; it rarely closes it entirely on its own.',
      },
    ],
    sections: [
      {
        id: 'the-comparison',
        title: 'The comparison, stated properly',
        blocks: [
          {
            kind: 'p',
            text: 'Prepaying returns the loan rate with certainty. Investing returns an expectation with a distribution around it. Comparing the two as though both were rates is the error that makes this question feel harder than it is.',
          },
          {
            kind: 'table',
            caption: 'What each option really offers',
            head: ['', 'Prepay', 'Invest'],
            rows: [
              ['Return', 'The loan rate, exactly', 'An expectation with a wide range'],
              ['Certainty', 'Complete', 'None'],
              ['Tax on the return', 'None — a cost avoided', 'At the applicable rate on the gain'],
              ['Reversibility', 'None — the money is gone', 'Sellable, at whatever the price is'],
              ['Effect on monthly cash flow', 'Frees it up eventually', 'None'],
            ],
          },
          {
            kind: 'p',
            text: 'The row that decides most real cases is reversibility. Money paid into a home loan cannot be taken back out when the roof leaks, whereas an investment can be sold — at a price you may not like, but sold. That optionality is worth something real, and it is why a household without a fund should do neither.',
          },
        ],
      },
      {
        id: 'by-debt-type',
        title: 'The answer by type of debt',
        blocks: [
          {
            kind: 'table',
            caption: 'Where the comparison lands',
            head: ['Debt', 'Typical rate', 'Verdict'],
            rows: [
              ['Credit card, revolving', 'Above 40% annualised', 'Prepay. Nothing competes.'],
              ['Personal loan', 'Mid-teens and up', 'Prepay in almost every case.'],
              ['Vehicle loan', 'Around 9–12%', 'Usually prepay; the gap to expected returns is thin.'],
              ['Home loan', 'Single digits', 'Genuinely close. Depends on rate, deduction and temperament.'],
              ['Education loan', 'Varies; often has a deduction', 'Close. Check the deduction and the remaining term.'],
            ],
            note: 'Rates are indicative category figures for comparison, not quotes. Use your own loan documents.',
          },
          {
            kind: 'p',
            text: 'Only the last two rows are genuine decisions. For the first three the arithmetic is decisive, and the reason people still hesitate is usually that investing feels like progress while prepaying feels like standing still — which is a framing problem rather than a financial one, of the kind [behavioural finance](/learn/behavioural-finance/selling-at-the-bottom) is about.',
          },
        ],
      },
      {
        id: 'the-order',
        title: 'The order that resolves most of it',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Emergency fund to about three months** of essential expenses. Neither prepaying nor investing survives an emergency funded by a credit card.',
              '**Clear every debt above roughly 12%.** No further analysis needed.',
              '**Take any employer retirement match in full.** It is an immediate return nothing else matches.',
              '**Then compare.** Loan rate, adjusted for any deduction, against your expected post-tax return. If the gap is under about two percentage points, treat it as a tie and decide on liquidity and temperament.',
              '**Consider splitting.** Half to prepayment, half invested, is a legitimate answer to a genuine tie rather than an evasion of the question.',
            ],
          },
          {
            kind: 'p',
            text: 'Step four is where the expected-return assumption does all the work, and it is an assumption rather than a fact. Running it at two different rates shows how sensitive the answer is — which is usually more informative than the answer itself.',
          },
          {
            kind: 'p',
            text: 'One asymmetry is worth naming before you decide, because it is the reason thoughtful people land on different answers with the same numbers. Prepaying is irreversible and certain; investing is reversible and uncertain. Someone whose income is stable and whose emergency fund is full can reasonably prefer the certainty. Someone whose income is variable, or who is a single earner, may rationally prefer to keep the money accessible even at a slightly lower expected return — because the option to not sell at a bad moment has real value that no rate comparison captures.',
          },
          {
            kind: 'p',
            text: 'The practical middle path most people end up at is to prepay in periodic lumps rather than by raising the EMI. It keeps the contractual monthly obligation low, which preserves flexibility in a bad month, while still cutting principal early where the interest saving is largest. A lump paid annually from a bonus achieves most of the saving of a higher EMI with none of the commitment.',
          },
          {
            kind: 'tool',
            toolId: 'lifemap',
            text: 'LifeMap is built for exactly this comparison: run the same starting position with a prepayment and with the equivalent investment, and read the difference between the two curves rather than either curve alone.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'A loan is one formula and three decisions. The formula is the reducing-balance annuity that produces the EMI, and it is public — every lender in the country runs it, so any instalment you are quoted can be checked in thirty seconds. The decisions are how much to borrow, over how long, and what to do with any surplus once the loan is running.',
      'Of the three, tenure is the one most consistently underestimated. It is presented as an affordability lever, which it is, and its effect on total cost is enormous: on a twenty-year home loan the interest can exceed the amount borrowed, and stretching to thirty years adds substantially more. None of that appears in the monthly figure, which is the number the conversation is usually conducted in.',
      'The third decision — prepay or invest — has no universal answer, and this topic is explicit about that. Against high-rate debt the arithmetic is decisive. Against a single-digit home loan it is close enough that liquidity and temperament legitimately decide it.',
    ],
    definitions: [
      {
        term: 'EMI',
        definition:
          'The equated monthly instalment: the fixed payment that clears a loan over its term. Produced by the annuity payment formula from principal, monthly rate and number of months, and identical across lenders using reducing-balance interest.',
      },
      {
        term: 'Reducing balance',
        definition:
          'Interest charged each period on the outstanding balance rather than on the original principal. Standard for Indian home, vehicle and personal loans, and the reason the interest share of an EMI falls over the life of the loan.',
      },
      {
        term: 'Amortisation schedule',
        definition:
          'The month-by-month breakdown of an EMI into interest and principal. Reading it is what makes the cost of tenure and the value of early prepayment visible, both of which are invisible in the instalment alone.',
      },
      {
        term: 'Prepayment',
        definition:
          'Paying more than the contractual instalment to reduce principal early. Returns the loan\'s interest rate, guaranteed and untaxed, and saves most when made early — at the cost of being irreversible.',
      },
    ],
    faq: [
      {
        q: 'How is an EMI calculated?',
        a: 'EMI = P × i × (1+i)^n / ((1+i)^n − 1), where P is the principal, i the monthly rate (annual divided by twelve) and n the number of months. Every reducing-balance loan calculator runs this. Working it once for your own loan is the cheapest way to verify that a quoted instalment matches the rate and tenure you were told.',
      },
      {
        q: 'What tenure should I choose?',
        a: 'The shortest one whose instalment you could still service in a bad month — a period of reduced income, a large unexpected expense, one earner between jobs. Longer than that costs a great deal in total interest; shorter than that risks a default on a secured asset, which is a far worse outcome than paying more interest.',
      },
      {
        q: 'Is it better to prepay or invest a surplus?',
        a: 'Prepay anything above roughly twelve per cent without further analysis, because no portfolio reliably beats it and the return is guaranteed. Below that, compare the loan rate — adjusted for any tax deduction — against your expected post-tax return, and treat a gap of under two percentage points as a tie to be settled on liquidity rather than arithmetic.',
      },
      {
        q: 'Do prepayment charges make it not worth it?',
        a: 'Check your loan agreement, because the position differs by loan type and by whether the rate is floating or fixed. Where a charge applies, include it in the comparison: a one-off fee against years of avoided interest usually still favours prepaying, but the arithmetic is worth doing rather than assuming in either direction.',
      },
    ],
  },
  articles,
};

export default content;
