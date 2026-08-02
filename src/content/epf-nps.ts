/**
 * Editorial copy and article bodies for the EPF & NPS topic.
 *
 * No contribution rates, no interest rates, no tax treatment percentages, no
 * withdrawal limits. Every one of those has changed within recent memory and is
 * exactly the kind of figure a static page gets wrong permanently. Structure,
 * mechanism and the comparison framework are what is published; the numbers are
 * pointed at EPFO and PFRDA.
 *
 * The second article addresses the superannuation comparison directly. It is
 * written for people moving between an Australian-style super system and India's
 * accounts, which is a real audience given the careers side of this platform —
 * and it is careful to describe structures rather than to give tax or migration
 * advice, which would require jurisdiction-specific professional input.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'epf-vs-nps': {
    summary:
      'EPF and NPS are both long-horizon retirement accounts and they behave very differently. EPF is a debt-like account with an administratively declared return, a contribution rate set by statute, and the strong practical characteristic of being invisible — it accumulates whether or not you pay attention. NPS is a market-linked account where you choose an asset mix, contributions are voluntary above any employer arrangement, and the outcome depends on that mix. The decision is rarely either-or: most salaried people in India end up holding both, and the useful questions are what proportion of your retirement provision each represents and whether the combined asset mix matches your horizon.',
    keyPoints: [
      'EPF behaves like a debt allocation with a declared return; NPS behaves like whatever asset mix you selected.',
      'Together they are a portfolio, and most people never look at the combined equity share across both.',
      'EPF\'s real advantage is behavioural: the contribution happens whether or not you decide anything.',
      'Withdrawal and tax rules for both have changed repeatedly — confirm the current position rather than relying on memory.',
    ],
    faq: [
      {
        q: 'Should I choose EPF or NPS?',
        a: 'For most salaried employees EPF is not a choice — it applies by statute above an eligibility threshold — so the real question is whether to add NPS alongside and at what asset mix. Treat them as one portfolio: if EPF already provides a substantial debt-like allocation, an NPS allocation with more equity may be what balances your overall horizon, subject to how far away retirement actually is.',
      },
      {
        q: 'Is NPS worth it just for the tax deduction?',
        a: 'The deduction is real and it is not sufficient on its own. NPS carries a long lock-in and rules on how the corpus may be used at exit that differ from an ordinary mutual fund. If you would hold the underlying asset mix anyway and the lock-in does not conflict with your other goals, the deduction improves an already reasonable choice. If the lock-in conflicts, the deduction is compensation for a constraint rather than a free gain.',
      },
      {
        q: 'What happens to my EPF when I change jobs?',
        a: 'It transfers rather than closing, and keeping one account across employers preserves the continuity of service that some benefits depend on. Withdrawing between jobs is the common and expensive mistake — it converts long-horizon retirement money into short-term spending, resets the accumulation, and may have tax consequences depending on how long the account has run.',
      },
    ],
    sections: [
      {
        id: 'the-difference',
        title: 'What actually differs',
        blocks: [
          {
            kind: 'table',
            caption: 'Two retirement accounts, compared structurally',
            head: ['', 'EPF', 'NPS'],
            rows: [
              ['Return', 'Administratively declared', 'Market-linked, by chosen asset mix'],
              ['Asset choice', 'None for you to make', 'You choose the equity / debt split'],
              ['Contribution', 'Statutory, above an eligibility threshold', 'Voluntary above any employer arrangement'],
              ['Behaves like', 'A debt allocation', 'Whatever you selected'],
              ['Exit', 'Rules on withdrawal and continuity', 'Rules on how the corpus may be used at exit'],
            ],
            note: 'No rates, limits or percentages are given here on purpose. Confirm the current position with EPFO and PFRDA — all of these have changed in recent years.',
          },
          {
            kind: 'p',
            text: 'The row that matters most for planning is the fourth. EPF is not a neutral savings vehicle sitting outside your portfolio; it is a large, growing debt allocation. Someone with a substantial EPF balance who also holds a conservative mutual fund portfolio has a far lower overall equity share than they believe, because they have never counted the EPF in the denominator.',
          },
        ],
      },
      {
        id: 'as-one-portfolio',
        title: 'Reading them as one portfolio',
        blocks: [
          {
            kind: 'worked',
            title: 'The equity share people think they have, and the one they have',
            rows: [
              { label: 'Mutual fund portfolio', value: '₹12,00,000, 80% equity' },
              { label: 'EPF balance', value: '₹18,00,000, effectively debt' },
              { label: 'Believed equity share', value: '80%' },
              { label: 'Actual equity across both', value: '₹9,60,000 ÷ ₹30,00,000 = 32%' },
            ],
            conclusion:
              'A 48-point gap between the intended allocation and the real one. Whether 32% is right depends on the horizon — for someone twenty-five years out it is probably too conservative, and they cannot know that without doing this arithmetic.',
          },
          {
            kind: 'p',
            text: 'This is the single most useful thing to take from the comparison. The [allocation question](/learn/investing/asset-allocation-basics) has to be asked across everything you own, and retirement accounts are usually the largest thing people leave out of it.',
          },
          {
            kind: 'tool',
            toolId: 'lifemap',
            text: 'LifeMap projects the combined position over decades, which is where the effect of the overall mix shows up rather than the effect of any one account.',
          },
        ],
      },
      {
        id: 'the-behavioural-point',
        title: 'The advantage that does not appear in a comparison table',
        blocks: [
          {
            kind: 'p',
            text: 'EPF has a property no product feature captures: it happens without a decision. The contribution is deducted before the salary arrives, there is nothing to remember, and there is meaningful friction in getting the money out. For a great many people that combination is worth more than any difference in expected return.',
          },
          {
            kind: 'p',
            text: 'The same principle argues for automating whatever you add alongside it. A voluntary contribution that depends on a monthly decision competes with every other use of that money and loses more often than people expect — which is the mechanism behind [lifestyle creep](/learn/behavioural-finance/lifestyle-creep).',
          },
          {
            kind: 'warning',
            title: 'The withdrawal decision at a job change',
            text: 'The most damaging thing most people do to their retirement provision is withdrawing an EPF balance between jobs. It converts decades of compounding into a few months of spending, and the money is rarely replaced. Transfer the account rather than closing it, and treat the balance as unavailable.',
          },
          {
            kind: 'p',
            text: 'The reason this decision is made so often is worth understanding, because it is not carelessness. A job change frequently comes with a gap in income, a relocation, a notice period served without a bonus, or a deposit on a new flat — and the EPF balance is the largest accessible sum the household has. What is really needed at that moment is an emergency fund, and its absence is what makes the retirement account look like one.',
          },
          {
            kind: 'p',
            text: 'That reframes the practical advice. Protecting a provident fund balance is less about resolving not to touch it and more about having something else to touch, which is the argument for building the fund first — see [emergency fund size](/learn/saving/emergency-fund-size). A household with three months of essential expenses set aside is never in the position where a retirement account is the only option.',
          },
        ],
      },
    ],
    sources: [
      {
        label: 'EPFO — employees’ provident fund',
        url: 'https://www.epfindia.gov.in/site_en/index.php',
      },
      {
        label: 'PFRDA — National Pension System',
        url: 'https://www.pfrda.org.in/',
      },
    ],
  },

  'moving-between-systems': {
    summary:
      'Australia\'s superannuation and India\'s EPF and NPS are attempts at the same problem with different mechanics. Super is a compulsory employer contribution into a member-directed fund with market-linked returns and preservation rules tied to age. EPF is a statutory contribution into an administratively-returned account. NPS is closer to super in that the member chooses an asset mix, but the contribution is voluntary and the exit rules differ. For someone moving between the two countries, the practical questions are what happens to a balance left behind, how the destination country treats it, and — the one that is easiest to get wrong — that neither system automatically follows you.',
    keyPoints: [
      'Super is member-directed and market-linked; EPF is administratively returned; NPS sits between them on structure.',
      'A balance left behind does not disappear, but it also does not transfer — the two systems have no automatic bridge.',
      'Cross-border tax treatment of retirement accounts is jurisdiction-specific and needs professional advice, not a web page.',
      'Keep the account details and contribution records before you move; reconstructing them from another country is painful.',
    ],
    faq: [
      {
        q: 'Can I transfer superannuation to EPF or NPS, or the other way?',
        a: 'There is no general automatic mechanism to move a balance between these systems, and any specific arrangement depends on the rules of both jurisdictions at the time and on your own residence and tax status. This is a question for a cross-border adviser and the two regulators, not for a general guide — the cost of acting on a wrong assumption here is measured in years of contributions.',
      },
      {
        q: 'What happens to my balance if I leave the country?',
        a: 'It generally remains in the account, subject to the rules of that system regarding non-residents, access and continued contributions. It is not forfeited. What frequently does happen is that people lose track of it — account details go stale, addresses change, and the balance becomes unclaimed. Recording the account identifiers before you move is the cheap protection against that.',
      },
      {
        q: 'Which system is better?',
        a: 'Not a well-posed question, because they operate in different economies with different inflation, different tax systems and different costs of living. What can be compared is structure: super gives the member asset choice and market exposure by default, EPF does not and provides an administratively declared return instead. Which suits you depends on horizon and on what else you hold.',
      },
    ],
    sections: [
      {
        id: 'structural-comparison',
        title: 'The three systems, structurally',
        blocks: [
          {
            kind: 'table',
            caption: 'How each one is built',
            head: ['', 'Superannuation (AU)', 'EPF (IN)', 'NPS (IN)'],
            rows: [
              ['Contribution', 'Compulsory employer contribution', 'Statutory, employer and employee', 'Voluntary above any employer arrangement'],
              ['Return', 'Market-linked, by chosen fund', 'Administratively declared', 'Market-linked, by chosen mix'],
              ['Member chooses assets', 'Yes', 'No', 'Yes'],
              ['Access', 'Preservation rules tied to age', 'Rules on withdrawal and continuity', 'Rules on exit and corpus use'],
            ],
            note: 'Structure only. Rates, thresholds, preservation ages and tax treatment are jurisdiction-specific, change regularly, and must be taken from the relevant regulator.',
          },
          {
            kind: 'p',
            text: 'The clearest structural difference is asset choice. A super member is a portfolio owner whether or not they engage with it, sitting in a default option if they do not choose. An EPF member is not: the return is declared and there is no mix to select, which makes EPF function as a debt allocation in the way described in [EPF versus NPS](/learn/epf-nps/epf-vs-nps).',
          },
        ],
      },
      {
        id: 'what-to-do-before-moving',
        title: 'What to do before you move, either direction',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Record every account identifier.** Member numbers, fund names, employer references, the portal login. Reconstructing these from another country, years later, is the single most common avoidable problem.',
              '**Download the contribution history.** Statements, annual summaries, anything showing what went in and when. Access to online portals sometimes depends on a local phone number or address you are about to lose.',
              '**Consolidate within a system before leaving, not across systems.** Several accounts in one country is a solvable problem while you are there and a difficult one afterwards.',
              '**Update contact details to something durable.** An email address you will keep, not a work one.',
              '**Then take advice on the cross-border question.** Tax residence, treaty position and how each country treats the other\'s account are genuinely specialist and genuinely consequential.',
            ],
          },
          {
            kind: 'warning',
            title: 'This is not tax or migration advice',
            text: 'Cross-border treatment of retirement accounts depends on your residence status, the treaty position between the two countries, and rules that change. Take advice from a qualified adviser in both jurisdictions before acting. Nothing on this page substitutes for that, and the cost of getting it wrong is not recoverable.',
          },
        ],
      },
      {
        id: 'planning-across-two',
        title: 'Planning when your provision is split',
        blocks: [
          {
            kind: 'p',
            text: 'Someone with a super balance in one country and EPF or NPS in another has a single retirement to fund from two pools, and the planning question is unchanged: what is the combined value, what asset mix does it represent, and what annual income will it support?',
          },
          {
            kind: 'p',
            text: 'Two complications are worth naming. Currency, because a balance in one currency funding expenses in another introduces a risk that has nothing to do with markets. And the fact that each pool follows its own access rules, so the two may not become available at the same time — which is a sequencing problem for the first years of retirement.',
          },
          {
            kind: 'p',
            text: 'Neither changes the underlying arithmetic. The [corpus calculation](/learn/retirement/retirement-corpus) still applies; it simply has to be run on the combined figure, converted, with each pool\'s availability date noted. That is a spreadsheet problem rather than a conceptual one.',
          },
          {
            kind: 'p',
            text: 'For readers making this move as part of a career decision rather than a retirement one, the job-search side is covered in [international students](/learn/international-students/job-search-on-a-visa).',
          },
        ],
      },
    ],
    sources: [
      {
        label: 'EPFO — employees’ provident fund',
        url: 'https://www.epfindia.gov.in/site_en/index.php',
      },
      {
        label: 'PFRDA — National Pension System',
        url: 'https://www.pfrda.org.in/',
      },
      {
        label: 'Australian Taxation Office — superannuation',
        url: 'https://www.ato.gov.au/individuals-and-families/super-for-individuals-and-families',
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Most Indian salaries already pay into a retirement account, and most people who hold one could not say what it is invested in or what it is likely to be worth. EPF accumulates in the background at an administratively declared rate; NPS, where it is held, does whatever the chosen asset mix does. Between them they are frequently the largest single financial asset a household owns.',
      'The most useful correction in this topic is to stop treating them as savings that sit outside your portfolio. EPF functions as a large and growing debt allocation. Someone with a substantial EPF balance and an equity-heavy mutual fund portfolio typically has a far lower overall equity share than they believe, and the gap is often forty points or more.',
      'These guides publish structure rather than numbers. Contribution rates, declared returns, tax treatment and withdrawal rules have all changed within recent memory, and a page stating them becomes wrong and stays findable. EPFO and PFRDA are linked from every article for the current position.',
    ],
    definitions: [
      {
        term: 'EPF (Employees’ Provident Fund)',
        definition:
          'A statutory retirement account funded by employer and employee contributions, with a return declared administratively rather than produced by a market. Functions as a debt allocation within a household\'s overall portfolio, whether or not it is counted as one.',
      },
      {
        term: 'NPS (National Pension System)',
        definition:
          'A voluntary, market-linked retirement account where the member selects an asset mix. Closer in structure to a defined-contribution pension than EPF is, with its own rules on exit and on how the accumulated corpus may be used.',
      },
      {
        term: 'Superannuation',
        definition:
          'Australia\'s compulsory retirement system: employer contributions into a member-directed, market-linked fund with access governed by preservation rules tied to age. Structurally closer to NPS than to EPF because the member holds a portfolio.',
      },
      {
        term: 'Combined asset mix',
        definition:
          'The equity, debt and other allocation across every account a household holds, retirement accounts included. The only allocation figure that means anything, and the one most people have never calculated.',
      },
    ],
    faq: [
      {
        q: 'Should I contribute more to EPF or invest elsewhere?',
        a: 'Ask what your combined asset mix currently is before deciding, because additional EPF is additional debt allocation. For someone decades from retirement whose overall equity share is already low, more EPF may push the mix further from where the horizon suggests it should be. For someone close to retirement, that same conservatism is appropriate. The account is not the question; the resulting mix is.',
      },
      {
        q: 'Is NPS a good investment?',
        a: 'It is an account with a lock-in and rules on how the corpus may be used at exit, holding whatever asset mix you select. Judge it on the mix and on whether the constraints suit your situation, not on the label. The tax deduction improves the case where you would hold the assets anyway; it does not make the lock-in disappear.',
      },
      {
        q: 'How does this compare with superannuation abroad?',
        a: 'Super and NPS are structurally similar in that the member holds a market-linked portfolio; EPF is different because the return is declared rather than earned in a market. For anyone moving between systems the important practical point is that no automatic bridge exists between them, and the cross-border tax position needs specialist advice.',
      },
      {
        q: 'Why does this page not give contribution or interest rates?',
        a: 'Because they change and this page would not. EPF rates are declared periodically, NPS returns depend on the chosen mix, and tax and withdrawal rules for both have been revised more than once in recent years. Publishing them here would create a page that is confidently wrong and still ranking, so every article links to EPFO and PFRDA instead.',
      },
    ],
  },
  articles,
};

export default content;
