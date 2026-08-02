/**
 * Editorial copy and article bodies for the Tax topic.
 *
 * The hardest editorial constraint on this site applies here in full: NO slab
 * rates, NO deduction limits, NO exemption thresholds, NO surcharge bands. Every
 * one of those changes at least annually in India, and a page that states them
 * is wrong from the next Finance Act onwards while continuing to rank and be
 * cited. What is durable is the STRUCTURE — how the two regimes differ in kind,
 * how the break-even between them is found, how gains are classified, and how a
 * CTC becomes a bank credit.
 *
 * Every article therefore teaches a method the reader applies to the current
 * year's numbers, and points at the Income Tax Department for the numbers
 * themselves. That is a slower read than a table of rates and it is the only
 * version that stays true.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'old-vs-new-regime': {
    summary:
      'India offers two income tax regimes: an older one with lower headline treatment of income but a long list of deductions and exemptions, and a newer one with a simpler, generally lighter rate structure and almost none of them. Which costs you less is a single arithmetic question — compute your tax under both using the current year\'s rates and your own actual deductions, and pick the smaller number. There is a break-even level of total deductions above which the old regime wins, and below which the new one does; that level moves every year with the rates, which is why the answer has to be recomputed annually rather than decided once.',
    keyPoints: [
      'The choice is arithmetic, not strategy: compute both with this year\'s rates and your real deductions, then pick the lower.',
      'A break-even deduction total exists each year — above it the old regime wins, below it the new one does.',
      'Only count deductions you would genuinely claim; an investment made solely to justify a regime is a cost, not a saving.',
      'The break-even moves whenever the rates or limits change, so this is an annual decision rather than a permanent one.',
    ],
    faq: [
      {
        q: 'Which regime should I choose?',
        a: 'Whichever produces the lower tax on your own numbers for the current year — there is no general answer, because it depends entirely on how much you genuinely claim in deductions. Broadly, someone with a home loan, substantial retirement contributions and rent exemption tends toward the old regime; someone with few deductions tends toward the new one. Compute both rather than reasoning about which type you are.',
      },
      {
        q: 'Can I switch between regimes?',
        a: 'Salaried taxpayers without business income have generally been able to choose each year, while those with business income face tighter restrictions on switching back. The rules on this have changed more than once, so confirm the current position on the Income Tax Department site for the assessment year in question before relying on being able to switch.',
      },
      {
        q: 'Should I invest specifically to save tax?',
        a: 'Only where you would want the investment anyway. A tax deduction reduces the cost of an investment; it does not make a poor one good. Locking money into an instrument with a mediocre post-tax return and a long lock-in in order to reduce this year\'s tax is a decision that looks sensible in March and looks expensive for the following five years.',
      },
    ],
    sections: [
      {
        id: 'the-difference',
        title: 'What actually differs between them',
        blocks: [
          {
            kind: 'p',
            text: 'The two regimes are not two rate cards on the same base. They differ in what is taxable before the rates are applied at all, which is why comparing headline rates tells you nothing.',
          },
          {
            kind: 'table',
            caption: 'The structural difference',
            head: ['', 'Old regime', 'New regime'],
            rows: [
              ['Rate structure', 'Higher at comparable levels', 'Generally lighter'],
              ['Deductions and exemptions', 'A long list available', 'Almost none'],
              ['Complexity', 'Requires records and planning', 'Little to compute'],
              ['Who it favours', 'High claimers of deductions', 'Low claimers of deductions'],
            ],
            note: 'The specific rates, slab boundaries and which deductions survive in each regime change with each Finance Act. Take them from the Income Tax Department for the year you are computing.',
          },
          {
            kind: 'p',
            text: 'So the comparison is between two different taxable incomes taxed at two different rate cards. That is a calculation rather than a preference, and it is why a colleague\'s answer is not evidence about yours.',
          },
        ],
      },
      {
        id: 'break-even',
        title: 'Finding your break-even',
        blocks: [
          {
            kind: 'p',
            text: 'For any income there is a total deduction figure at which the two regimes cost the same. Below it the new regime is cheaper; above it the old one is. Finding your own is a four-step exercise.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Total your genuine deductions.** Retirement contributions you already make, insurance premiums you already pay, home loan interest, rent exemption if applicable. Only what you would claim regardless of the regime.',
              '**Compute tax under the old regime** on income less those deductions, using this year\'s old-regime rates.',
              '**Compute tax under the new regime** on income with only the deductions that survive there, using this year\'s new-regime rates.',
              '**Compare, and note the gap.** If it is small, the simpler regime is worth something on its own; if it is large, the arithmetic decides.',
            ],
          },
          {
            kind: 'warning',
            title: 'Count only deductions you would make anyway',
            text: 'The common error is including an investment you would only make for the deduction. If a five-year lock-in with a modest post-tax return is the price of tipping the comparison, the comparison has already been lost — you have spent the saving and taken on the lock-in. Run the arithmetic on what you genuinely do.',
          },
        ],
      },
      {
        id: 'what-changes-it',
        title: 'What moves the answer between years',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Rate or limit changes.** Any Finance Act adjustment to either regime moves the break-even, sometimes substantially.',
              '**A home loan starting or ending.** Interest is usually the largest single deduction available, so taking one on or paying it off can flip the answer in either direction.',
              '**A change in rent or in city.** Where a rent-based exemption applies, moving cities can change the deduction total materially.',
              '**A large income change.** The break-even is a deduction total, but its position relative to your income shifts as income moves through the slabs.',
            ],
          },
          {
            kind: 'p',
            text: 'Because all four are common, treat the regime choice as an annual ten-minute recomputation rather than a decision made once and inherited. Any of these events on its own is enough to reverse last year\'s answer.',
          },
          {
            kind: 'p',
            text: 'The other half of understanding your own tax is understanding what your employer deducts before you ever see the money — see [CTC versus take-home](/learn/tax/salary-structure).',
          },
          {
            kind: 'p',
            text: 'One practical point about timing. Employers ask for a regime declaration early in the financial year and compute your monthly TDS from it, so a declaration made carelessly in April changes your take-home for twelve months. It is usually possible to correct the position when the return is filed, but that means either a refund you waited a year for or a shortfall to settle at once — neither of which is as good as spending ten minutes on the comparison before the declaration is due.',
          },
        ],
      },
    ],
    sources: [
      {
        label: 'Income Tax Department — current rates, slabs and deductions',
        url: 'https://www.incometax.gov.in/iec/foportal/',
      },
    ],
  },

  'capital-gains-basics': {
    summary:
      'Investment gains in India are taxed by asset class and by holding period, not at one uniform rate. Equity and equity mutual funds are treated one way, debt funds and most other assets another, and gold and property have their own treatment again — with the holding period deciding whether a gain is short-term or long-term and therefore which rate applies. The consequence for a saver is that two investments with identical gross returns can leave you with meaningfully different amounts, so the only comparison worth making is post-tax. The exact rates and holding periods change with each Finance Act and must be taken from the current year rather than from memory.',
    keyPoints: [
      'Tax depends on both asset class and holding period, which is why headline return is not a comparable number.',
      'The short-term / long-term boundary differs by asset class, and crossing it can change the rate substantially.',
      'Compare investments post-tax at your own slab; two products with the same gross return are frequently not equivalent.',
      'Rates and holding periods change with each Finance Act — take them from the Income Tax Department, not from a blog.',
    ],
    faq: [
      {
        q: 'Why does the asset class change the tax?',
        a: 'Because different asset classes are taxed under different provisions rather than at different rates on one base. Interest income is generally added to your total income and taxed at your slab; equity gains have their own regime with a separate rate and an exemption threshold. That is why a comparison of headline yields across asset classes is not a like-for-like comparison at all.',
      },
      {
        q: 'What is indexation and does it still apply?',
        a: 'Indexation adjusts the purchase cost of an asset for inflation before computing the gain, so only the real gain is taxed. Which assets it applies to has changed, and recent Finance Acts have narrowed it. Because this is exactly the kind of rule that moves, confirm the current treatment for your asset and purchase date with the Income Tax Department rather than assuming last year\'s position.',
      },
      {
        q: 'Do I pay tax on gains I have not sold?',
        a: 'Generally no for listed equity and mutual funds — a gain is realised, and therefore taxed, when you sell or redeem. This is why the timing of a redemption is itself a decision, and why moving between funds is not free even when the balance appears to carry over: a switch is a redemption followed by a purchase, and the redemption is a taxable event.',
      },
    ],
    sections: [
      {
        id: 'two-axes',
        title: 'Two axes: what you hold, and how long',
        blocks: [
          {
            kind: 'p',
            text: 'Every capital gains question resolves to two inputs. Which asset class is this, and how long was it held? The pair determines the treatment; neither alone does.',
          },
          {
            kind: 'table',
            caption: 'The structure of the question, by asset class',
            head: ['Asset', 'Short-term treatment', 'Long-term treatment'],
            rows: [
              ['Listed equity and equity funds', 'Its own rate', 'Its own rate, above an exemption'],
              ['Debt funds', 'Generally at slab', 'Depends on purchase date and current rules'],
              ['Gold and gold funds', 'Generally at slab', 'Its own rate'],
              ['Property', 'Generally at slab', 'Its own rate'],
              ['Bank and deposit interest', 'At slab (not a capital gain)', 'At slab'],
            ],
            note: 'Deliberately no numbers. The rates, the holding periods that separate short from long, and the exemption thresholds all change with each Finance Act — take them from the Income Tax Department for the year you are computing.',
          },
          {
            kind: 'p',
            text: 'The last row is the one most often misclassified. Deposit and savings interest is not a capital gain at all; it is added to income and taxed at your slab, which is why deposits look worse the higher your slab and why [where to park short-term cash](/learn/saving/where-to-park-short-term-cash) ranks options post-tax rather than by rate.',
          },
        ],
      },
      {
        id: 'why-post-tax',
        title: 'Why only the post-tax number is comparable',
        blocks: [
          {
            kind: 'worked',
            title: 'Two investments, same gross return, different outcomes',
            rows: [
              { label: 'Investment A', value: 'Interest-bearing, 7.5% gross, taxed at slab' },
              { label: 'Your slab', value: '30%' },
              { label: 'A, post-tax', value: '7.5% × (1 − 0.30) = 5.25%' },
              { label: 'Investment B', value: 'Equity-taxed, 7.5% gross, long-term rate of 12.5% assumed' },
              { label: 'B, post-tax', value: '7.5% × (1 − 0.125) ≈ 6.56%' },
              { label: 'Difference', value: 'Over 1.3 percentage points, from tax treatment alone' },
            ],
            conclusion:
              'Identical gross returns, materially different outcomes. Reverse the slab to 5% and the gap nearly disappears. This is why "which pays more" is an unanswerable question without knowing whose money it is.',
          },
          {
            kind: 'tool',
            toolId: 'parksmart',
            text: 'ParkSmart applies the treatment per instrument type for the slab you enter, which is the same calculation done for you across the short-horizon options.',
          },
        ],
      },
      {
        id: 'what-to-actually-do',
        title: 'The habits that follow from this',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Record purchase dates and costs.** The holding period determines the rate, and reconstructing a purchase date years later from statements is unpleasant. A single spreadsheet row per purchase is enough.',
              '**Check the boundary before redeeming.** Where a sale sits close to the short-term / long-term threshold, waiting can change the rate on the entire gain. Whether it is worth waiting depends on the amounts, but you cannot decide without knowing the date.',
              '**Treat a fund switch as a sale.** It is one. Moving between schemes realises the gain even though the money never reaches your account.',
              '**Compare post-tax, always.** Especially across asset classes, where the gross figures are not measuring the same thing.',
            ],
          },
          {
            kind: 'p',
            text: 'None of this is tax planning in the aggressive sense, and none of it requires an adviser. It is record-keeping plus the discipline of asking what you keep rather than what is quoted — the same discipline that makes [real returns](/learn/inflation/real-returns) worth computing.',
          },
          {
            kind: 'p',
            text: 'Two mechanics are worth knowing because they change what a year\'s tax bill looks like without changing any investment decision. Losses can generally be set against gains of the appropriate type within a year, and unused losses can often be carried forward if the return is filed on time — which is one of the few concrete reasons the filing deadline matters beyond the penalty. And gains are realised on the date of the transaction, so a redemption in the last week of one financial year and the first week of the next fall into different assessment years entirely.',
          },
          {
            kind: 'p',
            text: 'Neither is a reason to sell something you would otherwise hold. They are reasons to be deliberate about the date when a sale is happening anyway, and to keep records good enough that the option exists — because reconstructing a purchase date and cost from three-year-old statements in the week before a filing deadline is how people end up paying more than they owed.',
          },
        ],
      },
    ],
    sources: [
      {
        label: 'Income Tax Department — capital gains',
        url: 'https://www.incometax.gov.in/iec/foportal/',
      },
    ],
  },

  'salary-structure': {
    summary:
      'CTC is what an employer spends on you; take-home is what reaches your bank account, and the gap is routinely a fifth or more. The reductions come in a predictable order: employer contributions that are counted in CTC but never paid to you as cash, your own provident fund contribution, professional tax where a state levies it, and tax deducted at source. Understanding the sequence matters for two reasons — it stops you budgeting against a number you will never receive, and it makes clear which components of an offer are genuinely negotiable and which are structurally fixed.',
    keyPoints: [
      'CTC includes employer costs you never receive as cash, which is why it overstates spendable income substantially.',
      'Employer provident fund contributions are real compensation but not liquid, so they belong in a package comparison and not in a budget.',
      'Budget from take-home only; every percentage frame on this site is built on the amount that actually arrives.',
      'The allowance structure within a fixed salary is occasionally negotiable and matters mainly under the old tax regime.',
    ],
    faq: [
      {
        q: 'Why is my take-home so much lower than my CTC?',
        a: 'Because CTC is the employer\'s total cost and includes things that never become cash for you: their provident fund contribution, gratuity provision, insurance premiums, and sometimes a variable component not yet earned. Then your own provident fund contribution, professional tax and TDS come out of what remains. A fifth or more of CTC failing to appear in your account is normal rather than an error.',
      },
      {
        q: 'Should I budget on CTC or take-home?',
        a: 'Take-home, always, and specifically the amount that lands in a typical month rather than an annual figure divided by twelve — bonuses and variable pay distort the average. Every budgeting frame on this site, including [the 50/30/20 rule](/learn/budgeting/50-30-20-rule), is defined against take-home for exactly this reason.',
      },
      {
        q: 'Is a higher employer PF contribution good or bad?',
        a: 'It is real compensation into an account that is yours, so it counts in a package comparison. It is also illiquid until you meet a withdrawal condition, so it does nothing for this month\'s cash flow. Two offers with the same CTC and different PF splits differ in liquidity rather than in value — worth weighting, not worth ignoring. See [EPF and NPS](/learn/epf-nps/epf-vs-nps).',
      },
    ],
    sections: [
      {
        id: 'the-sequence',
        title: 'The sequence from CTC to bank credit',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**CTC.** Everything the employer spends: fixed pay, variable pay, their provident fund contribution, gratuity provision, insurance premiums, sometimes facilities.',
              '**Gross salary.** CTC less the employer-side items that were never going to be paid to you as salary.',
              '**Taxable salary.** Gross less any exemptions and deductions that apply under your chosen [tax regime](/learn/tax/old-vs-new-regime).',
              '**Net pay.** Taxable salary less your own provident fund contribution, professional tax where levied, and TDS.',
            ],
          },
          {
            kind: 'worked',
            title: 'An illustrative reconciliation',
            rows: [
              { label: 'CTC', value: '₹12,00,000' },
              { label: 'Less employer PF contribution', value: '−₹57,600' },
              { label: 'Less gratuity provision', value: '−₹28,800' },
              { label: 'Gross salary', value: '₹11,13,600' },
              { label: 'Less own PF contribution', value: '−₹57,600' },
              { label: 'Less professional tax (where levied)', value: '−₹2,400' },
              { label: 'Less TDS', value: 'Depends on regime and deductions' },
              { label: 'Reaching your account', value: 'Materially below ₹1,00,000 a month' },
            ],
            conclusion:
              'Illustrative figures, and the point is the shape rather than any line. Roughly ₹86,000 of the ₹12,00,000 has gone before tax is computed at all, which is why a CTC-based budget is wrong from the first month.',
          },
        ],
      },
      {
        id: 'what-is-negotiable',
        title: 'Which parts of a structure can actually move',
        blocks: [
          {
            kind: 'table',
            caption: 'Components, and how movable each one is',
            head: ['Component', 'Movable?', 'Note'],
            rows: [
              ['Fixed salary', 'Sometimes', 'Constrained by the band for the grade'],
              ['Variable / bonus target', 'Sometimes', 'Discount it by the historical payout rate'],
              ['Allowance split within fixed pay', 'Occasionally', 'Matters mainly under the old regime'],
              ['Employer PF rate', 'Rarely', 'Usually a policy applied uniformly'],
              ['Joining amount', 'Often', 'One-off, so it sits outside the band'],
              ['Gratuity provision', 'No', 'Statutory'],
            ],
          },
          {
            kind: 'p',
            text: 'The practical takeaway for an offer conversation is that arguing about the CTC headline is usually the least productive angle, because most of it is structural. The components that move are the ones outside the band — which is the argument made in [negotiating an offer](/learn/salary-negotiation/negotiating-an-offer).',
          },
        ],
      },
      {
        id: 'budgeting-from-it',
        title: 'Budgeting from the right number',
        blocks: [
          {
            kind: 'p',
            text: 'Take-home also varies across the year in ways an annual figure hides. TDS is often front-loaded or back-loaded depending on how declarations are submitted, variable pay lands in one or two months, and a mid-year regime or declaration change moves the monthly deduction.',
          },
          {
            kind: 'p',
            text: 'So budget on the lowest typical month rather than the average. A plan built on an average that includes a bonus month is under-funded for the ten months that do not contain one, which is a timing problem rather than an income problem — and [the monthly gap](/learn/cash-flow/the-monthly-gap) covers what that feels like from the inside.',
          },
          {
            kind: 'p',
            text: 'There is one more reason to work from the payslip rather than the offer letter, and it is not about budgeting. A payslip is the only place you can check that what is being deducted matches what you expect — that the regime on file is the one you chose, that the provident fund contribution is on the base it should be, and that professional tax is being levied at all if your state does not charge it. Payroll errors are not common and they are not rare either, and nobody else is going to notice one on your behalf.',
          },
          {
            kind: 'p',
            text: 'The habit that catches them is trivial: read the first payslip after any change — a new job, a raise, a regime declaration, a January bonus — and compare it line by line with the one before. Most months you will find nothing, and the month you find something will pay for every other reading several times over.',
          },
          {
            kind: 'tool',
            toolId: 'budget',
            text: 'Budget Builder takes monthly take-home and splits it against the 50/30/20 targets — enter the figure that actually reaches your account, not a twelfth of CTC.',
          },
        ],
      },
    ],
    sources: [
      {
        label: 'EPFO — employees’ provident fund scheme',
        url: 'https://www.epfindia.gov.in/site_en/index.php',
      },
      {
        label: 'Income Tax Department — salary income and TDS',
        url: 'https://www.incometax.gov.in/iec/foportal/',
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Tax is the largest single deduction most households never model. It is taken before the money arrives, it is described in a vocabulary designed for compliance rather than comprehension, and the result is that a great many people know their CTC precisely and their effective tax rate not at all.',
      'These guides teach methods rather than numbers, and that is deliberate. Indian rates, slabs, deduction limits and exemption thresholds change with each Finance Act. A page listing this year\'s figures is wrong from the next Budget onwards and keeps ranking anyway, which makes it worse than a page that teaches you to look them up. Every calculation here is shown as a structure you apply to the current year\'s numbers, taken from the Income Tax Department.',
      'Nothing in this topic is tax advice. It is an explanation of how the arithmetic is put together, so that you can check a payslip, compare two regimes on your own figures, and ask a chartered accountant a more precise question than you otherwise would.',
    ],
    definitions: [
      {
        term: 'CTC (cost to company)',
        definition:
          'The employer\'s total annual cost of employing you, including contributions and provisions that never reach you as cash. It is a recruitment figure, not an income figure, and budgeting against it overstates what you have by a fifth or more.',
      },
      {
        term: 'Take-home pay',
        definition:
          'What actually lands in your bank account after every deduction. The only figure worth budgeting from, and the base every percentage frame on this site is defined against.',
      },
      {
        term: 'Marginal rate',
        definition:
          'The rate applied to your next rupee of income, as opposed to the average rate across all of it. It is the relevant rate for any decision about earning or deducting a little more, and it is always higher than the effective rate.',
      },
      {
        term: 'Post-tax return',
        definition:
          'What an investment leaves you with after the tax on its gain. The only basis on which two investments taxed under different provisions can be compared, and the reason a higher headline yield is frequently the worse option.',
      },
    ],
    faq: [
      {
        q: 'How do I work out which tax regime is cheaper for me?',
        a: 'Compute your tax both ways using the current year\'s rates and only the deductions you would genuinely claim, then take the lower figure. There is no shortcut and no general rule, because the answer depends on your deduction total relative to a break-even that moves each year. It is a ten-minute annual exercise rather than a decision made once.',
      },
      {
        q: 'Why does this site not list the tax slabs?',
        a: 'Because they change and this page would not. Slabs, limits, thresholds and which deductions survive in each regime are revised regularly, and a guide that states them becomes confidently wrong while continuing to be found and cited. Every article here links to the Income Tax Department for the figures and teaches the structure they slot into.',
      },
      {
        q: 'Is tax-saving investment worth it?',
        a: 'Where you would want the investment on its own merits, yes — the deduction reduces its effective cost. Where you would not, the deduction is buying you a lock-in and a mediocre post-tax return in exchange for one year\'s saving. The test is whether you would hold the instrument if the deduction disappeared tomorrow.',
      },
      {
        q: 'Do I need a chartered accountant?',
        a: 'For a straightforward salaried return, usually not. For business income, capital gains across several asset classes, foreign income or assets, or anything involving a notice, the fee is small relative to the cost of getting it wrong. Understanding the structure yourself is worthwhile either way — it makes the conversation shorter and the advice more useful.',
      },
    ],
  },
  articles,
};

export default content;
