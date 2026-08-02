/**
 * Editorial copy and article bodies for the Insurance topic.
 *
 * No products, no insurers, no premium figures. Premiums depend on age, health,
 * sum insured and underwriting, and naming a product would be a recommendation
 * this site does not make. What is stable and worth publishing is the SIZING
 * arithmetic and the clause vocabulary — the two things that decide whether a
 * policy pays what the buyer expected.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'term-cover-amount': {
    summary:
      'Term insurance replaces the income a household loses if an earner dies, so the cover should be sized on what the household actually needs rather than on a multiple of salary. Three methods produce a figure. The income-replacement method takes annual expenses the household could not otherwise meet, multiplied by the years until dependants are self-supporting. The needs-based method adds outstanding liabilities and future obligations, then subtracts existing assets. The multiple-of-income rule is the crudest and the most quoted. Run at least two of them: where they agree the answer is easy, and where they diverge the divergence tells you which assumption is doing the work.',
    keyPoints: [
      'Size cover on the household\'s shortfall, not on a multiple of the earner\'s salary — the two differ substantially.',
      'Subtract existing assets and any existing cover; buying cover you already hold is a recurring cost for nothing.',
      'Include outstanding loans in full, because a liability does not shrink when the income servicing it stops.',
      'Term insurance is protection, not investment — mixing the two produces poor cover and a poor return simultaneously.',
    ],
    faq: [
      {
        q: 'Is ten times annual income enough cover?',
        a: 'It is a starting point that happens to be roughly right for some households and badly wrong for others. It ignores how many years of dependency remain, how much debt is outstanding, and what assets already exist. A household with a large home loan and young children needs considerably more; one with no dependants and no debt may need none at all. Compute rather than adopt the multiple.',
      },
      {
        q: 'Should a non-earning spouse have cover?',
        a: 'Consider it, because the household would need to buy services currently provided unpaid — childcare, eldercare, household management — and that cost is real even though no salary stops. Size it on the replacement cost of those services for the years they would be needed, which is usually a smaller figure than an earner\'s cover but rarely zero.',
      },
      {
        q: 'Why not a policy that returns the premium if I survive?',
        a: 'Because you are buying two products, both priced worse than buying them separately. The premium on a return-of-premium policy is substantially higher, and the difference is invested for you at a return you cannot see and generally would not choose. Buy the cover you need as pure term insurance and invest the difference where you can inspect what it earns.',
      },
    ],
    sections: [
      {
        id: 'three-methods',
        title: 'Three ways to size it',
        blocks: [
          {
            kind: 'p',
            text: 'Each method approaches the same question from a different direction. Running two of them is the useful discipline, because the gap between the answers is where your assumptions are hiding.',
          },
          {
            kind: 'formula',
            label: 'Income replacement',
            expression: 'Cover = Annual shortfall × Years of dependency',
            where: [
              'Annual shortfall — household expenses the surviving members could not meet from their own income.',
              'Years of dependency — until the youngest dependant is self-supporting, or the surviving partner\'s own income suffices.',
              'Deliberately ignores investment returns on the payout, which is a conservative simplification.',
            ],
          },
          {
            kind: 'formula',
            label: 'Needs-based',
            expression: 'Cover = Liabilities + Future obligations + Living costs − Existing assets − Existing cover',
            where: [
              'Liabilities — outstanding loan balances, in full.',
              'Future obligations — education, and anything the household is committed to.',
              'Living costs — the income-replacement figure above.',
              'Existing assets — liquid savings and investments the household could actually use.',
              'Existing cover — employer group cover and any policy already held.',
            ],
          },
          {
            kind: 'worked',
            title: 'Both methods on one household',
            rows: [
              { label: 'Household annual expenses', value: '₹9,00,000' },
              { label: 'Surviving partner\'s income', value: '₹5,00,000' },
              { label: 'Annual shortfall', value: '₹4,00,000' },
              { label: 'Years until youngest is independent', value: '16' },
              { label: 'Income replacement figure', value: '₹4,00,000 × 16 = ₹64 lakh' },
              { label: 'Outstanding home loan', value: '₹35,00,000' },
              { label: 'Education provision', value: '₹25,00,000' },
              { label: 'Existing investments and employer cover', value: '₹30,00,000' },
              { label: 'Needs-based figure', value: '₹35L + ₹25L + ₹64L − ₹30L = ₹94 lakh' },
            ],
            conclusion:
              'The two differ by ₹30 lakh, and the difference is entirely the loan and the education provision that the income-replacement method does not capture. A cover of roughly ₹1 crore is defensible here; ₹64 lakh leaves the loan unfunded.',
          },
        ],
      },
      {
        id: 'what-to-subtract',
        title: 'What to subtract, and what not to',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Subtract employer group cover — carefully.** It is real while you are employed and disappears the day you are not, which is frequently correlated with the moment you need it. Subtract it at a discount, or not at all if your role feels insecure.',
              '**Subtract liquid investments.** Money the household could genuinely access reduces the gap.',
              '**Do not subtract the family home.** A surviving family living in it cannot spend it, and selling under pressure is not a plan.',
              '**Do not subtract retirement savings you would not want touched.** If the intention is that a corpus survives to fund retirement, spending it on a shortfall defeats the purpose.',
            ],
          },
          {
            kind: 'note',
            title: 'Cover falls as the need falls',
            text: 'The required cover declines over time as loans amortise and dependants approach independence. Some households buy a single long policy and accept over-insurance later; others layer shorter policies that expire as the need does. Both are reasonable, and the second is cheaper if you will actually manage it.',
          },
          {
            kind: 'tool',
            toolId: 'lifemap',
            text: 'LifeMap projects the household position across decades, which is where the shape of the declining need becomes visible rather than assumed.',
          },
        ],
      },
      {
        id: 'protection-not-investment',
        title: 'Why protection and investment do not mix',
        blocks: [
          {
            kind: 'p',
            text: 'Products that combine life cover with an investment component are widely sold and are almost always worse than the two bought separately. The cover is smaller for the premium, and the investment component carries charges that are difficult to see and a return you cannot compare with an ordinary fund.',
          },
          {
            kind: 'p',
            text: 'The separation test is simple: can you state what the cover costs and what the investment returns, independently? If a product does not let you answer both, it is not a product you can evaluate — and the reason for the opacity is rarely in your favour.',
          },
          {
            kind: 'p',
            text: 'The same argument applies to the tax deduction sometimes used to justify these products. A deduction reduces the cost of something you wanted; it does not make an expensive, opaque product into a good one — the point made in [tax-saving investment](/learn/tax/old-vs-new-regime).',
          },
          {
            kind: 'p',
            text: 'Two operational details are worth getting right at purchase because they are difficult to correct later. Nominate someone, and keep the nomination current after a marriage, a birth or a death — a policy paying into a disputed estate defeats the point of buying it. And tell the person who would need to claim that the policy exists and where the document is, because a term policy nobody knows about pays nothing at all.',
          },
        ],
      },
    ],
    sources: [
      {
        label: 'IRDAI — consumer information on life insurance',
        url: 'https://irdai.gov.in/',
      },
    ],
  },

  'health-cover-basics': {
    summary:
      'Health insurance in India pays or does not pay based on a handful of clauses that are rarely read before purchase, and the sum insured is not the most important of them. A room-rent limit can proportionally reduce an entire claim, not just the room charge. Sub-limits cap what is payable for specific procedures regardless of the sum insured. Co-pay makes you responsible for a fixed share of every claim. Waiting periods exclude pre-existing conditions and specific treatments for a defined initial period. Employer group cover is genuinely valuable and has two structural weaknesses — it ends with the job, and it is usually thin for a family.',
    keyPoints: [
      'A room-rent limit can scale down the whole claim proportionally, which makes it the clause that costs claimants most.',
      'Sub-limits cap named procedures independently of the sum insured, so a large policy can still under-pay.',
      'Waiting periods for pre-existing conditions are why buying cover while healthy is materially cheaper and safer.',
      'Employer cover ends with employment, so a personal policy exists partly to protect against a gap in the worst month.',
    ],
    faq: [
      {
        q: 'What sum insured should I take?',
        a: 'Enough that a serious hospitalisation in the kind of hospital you would actually use does not exhaust it, which in metro cities means a considerably larger figure than in smaller towns. Sum insured is also the cheapest thing to increase — the premium rises far less than proportionally — so under-insuring to save a small premium is usually the wrong trade.',
      },
      {
        q: 'Is my employer\'s cover enough?',
        a: 'It is a real benefit and it has two structural problems. It ends when the employment does, which is precisely when you can least afford to be uninsured and when a new policy would come with fresh waiting periods. And group cover is frequently thin once a family is included. Holding a personal policy alongside is the usual answer, even a modest one, because it keeps your waiting periods running.',
      },
      {
        q: 'What is a room-rent limit and why does it matter so much?',
        a: 'It caps the daily room charge the insurer will pay. The reason it matters beyond the room itself is that many hospitals price associated charges by room category, so choosing a room above the limit can lead the insurer to scale down the entire claim proportionally — not just the room component. It is the single clause most likely to produce a settlement far below what the policyholder expected.',
      },
    ],
    sections: [
      {
        id: 'the-clauses',
        title: 'The clauses that decide a claim',
        blocks: [
          {
            kind: 'table',
            caption: 'What each clause does to a claim',
            head: ['Clause', 'What it does', 'Why it matters'],
            rows: [
              [
                'Room-rent limit',
                'Caps the daily room charge payable',
                'Exceeding it can scale down the entire claim proportionally',
              ],
              [
                'Sub-limit',
                'Caps the amount payable for specific procedures',
                'A large sum insured does not help if the procedure is capped',
              ],
              [
                'Co-payment',
                'You pay a fixed percentage of every claim',
                'Applies to all claims, so it reduces cover at exactly the wrong moment',
              ],
              [
                'Waiting period',
                'Excludes pre-existing conditions and named treatments initially',
                'The reason to buy while healthy rather than when a need appears',
              ],
              [
                'Network hospital',
                'Determines cashless versus reimbursement',
                'Affects whether you must fund the bill and claim it back',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'The sum insured is the number on the brochure and it is not where most disappointment comes from. Every row above can reduce a settlement without the sum insured being reached at all.',
          },
        ],
      },
      {
        id: 'room-rent',
        title: 'How a room-rent limit reduces a whole claim',
        blocks: [
          {
            kind: 'worked',
            title: 'A proportional deduction, illustrated',
            rows: [
              { label: 'Sum insured', value: '₹5,00,000' },
              { label: 'Room-rent limit', value: '1% of sum insured = ₹5,000 a day' },
              { label: 'Room actually taken', value: '₹10,000 a day' },
              { label: 'Total hospital bill', value: '₹3,00,000' },
              { label: 'Proportion payable', value: '₹5,000 ÷ ₹10,000 = 50%' },
              { label: 'Insurer pays', value: '≈ ₹1,50,000 on the associated charges' },
              { label: 'You pay', value: '≈ ₹1,50,000, despite a ₹5,00,000 sum insured' },
            ],
            conclusion:
              'The sum insured was never reached and half the bill was still yours. Illustrative — the exact mechanism varies by policy wording — but this is the structure that produces the most common complaint about health insurance in India.',
          },
          {
            kind: 'warning',
            title: 'Read this clause before the sum insured',
            text: 'A policy with no room-rent limit and a moderate sum insured frequently pays more in practice than a larger policy with a restrictive one. It is the first clause to check and the one least often mentioned at the point of sale.',
          },
        ],
      },
      {
        id: 'the-gaps',
        title: 'The gaps worth planning around',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Between jobs.** Group cover ends with employment. A personal policy held alongside means you are never uninsured and your waiting periods keep running rather than restarting.',
              '**Waiting periods.** Pre-existing conditions are typically excluded for an initial period. Buying while healthy is the only way to have that period behind you before you need it.',
              '**Parents.** Cover for older parents is priced very differently and frequently has more restrictive terms. Worth pricing separately rather than assuming a family floater extends sensibly.',
              '**The cash gap.** Even a cashless claim can require you to fund something upfront — a non-network hospital, a deposit, an excluded item. This is a specific argument for an [emergency fund](/learn/saving/emergency-fund-size) rather than relying on insurance alone.',
            ],
          },
          {
            kind: 'p',
            text: 'Premiums also belong in the budget as an annual lump rather than as a surprise, which is precisely what a [sinking fund](/learn/saving/sinking-funds) is for. Lapsing health cover to save a premium in a difficult month is among the most expensive economies available.',
          },
          {
            kind: 'p',
            text: 'Two administrative habits prevent most claim disputes and neither takes long. Declare everything at the point of purchase, including conditions that feel minor or historical — non-disclosure is the most common reason a claim that should have been paid is not, and the insurer discovers it precisely when it is examining a large claim. And keep the policy document, the list of network hospitals and the insurer\'s claim number somewhere a family member can find them, because the person who needs to make the claim is frequently not the person who bought the policy.',
          },
          {
            kind: 'p',
            text: 'It is also worth reading the renewal notice rather than paying it. Terms change between years: a room-rent limit can be introduced, a sub-limit revised, a co-pay added at a certain age. A policy that was well chosen when bought is not automatically the same policy five renewals later, and the notice is the one document that says so.',
          },
          {
            kind: 'tool',
            toolId: 'budget',
            text: 'Insurance premiums are a need in a budget — they continue in a bad month, which is the test for the category. Budget Builder shows what the fixed side of your month actually contains.',
          },
        ],
      },
    ],
    sources: [
      {
        label: 'IRDAI — health insurance consumer information',
        url: 'https://irdai.gov.in/',
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Insurance is the cheapest way to stop one bad event undoing a decade of saving, and it is also the most oversold product category in Indian personal finance. Both things are true at once, which is why the useful skill is not deciding whether to buy insurance but knowing how much of what kind, and which clauses decide whether it pays.',
      'The single most useful principle is that protection and investment should not be bought together. Products that combine them deliver less cover per rupee and an investment return you cannot inspect, and the opacity is not accidental. Buy the cover as pure protection, and invest separately where you can see what you are earning.',
      'These guides contain no products, no insurers and no premiums, because those depend on age, health and underwriting and naming one would be a recommendation this site does not make. What they contain is the sizing arithmetic and the clause vocabulary — the two things that determine whether a policy does what its buyer expected.',
    ],
    definitions: [
      {
        term: 'Term insurance',
        definition:
          'Pure life cover for a fixed period, paying out only on death within the term. No maturity value, which is exactly why it is the cheapest way to buy a given amount of cover and why it is the right instrument for protecting a household.',
      },
      {
        term: 'Sum insured',
        definition:
          'The maximum a policy will pay. The headline number, and less decisive than most buyers assume: room-rent limits, sub-limits and co-payment can each reduce a settlement well before the sum insured is reached.',
      },
      {
        term: 'Room-rent limit',
        definition:
          'A cap on the daily hospital room charge payable. Consequential beyond the room itself, because associated charges are frequently priced by room category and exceeding the limit can scale the whole claim down proportionally.',
      },
      {
        term: 'Waiting period',
        definition:
          'An initial period during which pre-existing conditions or specific treatments are excluded. The reason cover bought while healthy is worth more than the same cover bought when a need has appeared, and the reason a gap between policies is costly.',
      },
    ],
    faq: [
      {
        q: 'How much life cover do I actually need?',
        a: 'Enough to cover what the household would lose: outstanding liabilities in full, the future obligations you are committed to, and the annual shortfall multiplied by the years of dependency — less the assets and cover you already hold. Run both the income-replacement and needs-based methods; where they disagree, the gap tells you which assumption is carrying the answer.',
      },
      {
        q: 'Should I buy insurance for the tax deduction?',
        a: 'Buy the cover you need, and take the deduction if one is available. The deduction reduces the cost of something you should own anyway; it does not justify an expensive combined product you would otherwise avoid. A policy chosen for its tax treatment rather than its cover is usually poor at both.',
      },
      {
        q: 'Is employer cover enough on its own?',
        a: 'It is a genuine benefit with two structural weaknesses: it ends when the job does, and it is frequently thin for a family. Holding even a modest personal policy alongside means your waiting periods keep running and you are never uninsured during a job change — which is one of the periods when being uninsured would hurt most.',
      },
      {
        q: 'What should I check before buying a health policy?',
        a: 'The room-rent limit first, then sub-limits on specific procedures, then co-payment, then waiting periods for pre-existing conditions, then the network hospitals near you. The sum insured matters and is the easiest thing to increase later; the clauses are what determine whether the sum insured is ever reached.',
      },
    ],
  },
  articles,
};

export default content;
