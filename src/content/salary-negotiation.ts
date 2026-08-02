/**
 * Editorial copy and article bodies for the Salary Negotiation topic.
 *
 * No salary data. Compensation varies by market, city, employer, function and
 * cycle far more than any published figure can capture, and a page quoting
 * numbers would be wrong for most readers on the day it shipped and wrong for
 * everyone within a year. What is durable is the MECHANICS — how bands are set,
 * what is movable, and how to reduce two packages to one comparable number.
 *
 * This is the one careers topic that legitimately uses the money calculators,
 * because comparing two offers is arithmetic the tools already do.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'negotiating-an-offer': {
    summary:
      'Negotiating an offer is far safer than it feels, and the fear that an employer will withdraw over a polite counter is largely unfounded — they have spent weeks and real money reaching this point and they expect the conversation. What matters is timing and framing. Negotiate once, after a written offer and before you accept; open with enthusiasm and a specific number rather than a range; and know what is actually movable, because base salary is often the most constrained element while signing amounts, start date, title, leave and review timing are frequently easier. The one situation where you should simply accept is where you have already been given the top of the band and told so.',
    keyPoints: [
      'Negotiate after the written offer and before acceptance — earlier has no leverage, later has none either.',
      'Lead with acceptance-in-principle, then one specific number with a reason. A range gets you its bottom.',
      'Base salary is often the least flexible component; joining amounts, start date, title and review timing move more easily.',
      'Ask once, accept the answer gracefully, and do not reopen — a second round costs goodwill and rarely moves anything.',
    ],
    faq: [
      {
        q: 'Can an offer be withdrawn because I negotiated?',
        a: 'It is rare, and it is almost always a reaction to how the negotiation was conducted rather than to the fact of it. Employers expect a counter and have usually left room for one. What does cause damage is an aggressive framing, an ultimatum you cannot back, negotiating repeatedly, or accepting verbally and then reopening — that last one is the version that genuinely sours relationships.',
      },
      {
        q: 'Should I give a number first?',
        a: 'When you are countering an offer, yes — a specific number anchored to something. When you are asked early in the process for expectations, deflect once ("I would rather understand the role first; what range is the position budgeted at?"), and if pressed, give a researched range and say it is based on the market for the role. A number stated before you know the job is an anchor you may not be able to move.',
      },
      {
        q: 'What if there is genuinely no flexibility on salary?',
        a: 'Believe them, and move to the other components, which is where most successful negotiations actually land. A joining amount, an earlier review date, an additional week of leave, a title, a training budget, a start date that suits you — several of these come from different budgets and different approvers than base salary, which is exactly why they are easier to move.',
      },
    ],
    sections: [
      {
        id: 'timing',
        title: 'The window, which is narrow',
        blocks: [
          {
            kind: 'p',
            text: 'There is one moment when you have leverage: after a written offer has been made and before you have accepted it. Before the offer, the employer has not yet decided they want you specifically. After acceptance, the decision is closed and reopening it is a different and much worse conversation.',
          },
          {
            kind: 'table',
            caption: 'Leverage across the process',
            head: ['Moment', 'Leverage', 'What to do'],
            rows: [
              ['Application', 'None', 'Give a range only if a field requires one'],
              ['Early screening', 'Low', 'Deflect once; give a researched range if pressed'],
              ['After final interview', 'Building', 'Say nothing about numbers'],
              ['Written offer received', 'Highest', 'This is the conversation'],
              ['After acceptance', 'None', 'Do not reopen'],
            ],
          },
          {
            kind: 'p',
            text: 'Ask for the offer in writing before discussing it, and ask for a few days to consider it. Both are entirely normal requests, and the second one converts a phone call where you might agree to something into a conversation you have prepared for.',
          },
        ],
      },
      {
        id: 'the-sentence',
        title: 'The sentence that opens it safely',
        blocks: [
          {
            kind: 'p',
            text: 'The structure is: enthusiasm, then one specific number, then a reason, then silence. Silence is the part people find hardest and it is doing real work — the reply is theirs to make.',
          },
          {
            kind: 'worked',
            title: 'A counter, in four parts',
            rows: [
              { label: 'Enthusiasm, genuinely', value: '"Thank you — I am really pleased, and I want to accept."' },
              { label: 'One specific number', value: '"Would you be able to move the base to ₹14 lakh?"' },
              { label: 'A reason', value: '"That reflects the credit analysis experience I would be bringing in from day one."' },
              { label: 'Stop talking', value: '—' },
            ],
            conclusion:
              'Under thirty words, no ultimatum, no comparison to another offer you may not have, and it is impossible to read as aggressive. It is also specific, which a range is not: offer a range and you will be given its lower end, because that is what a range means.',
          },
          {
            kind: 'warning',
            title: 'Do not invent a competing offer',
            text: 'It is the most commonly suggested tactic and the worst risk-adjusted one. If it is called — "that sounds like a good offer, you should take it" — you have no position left. A real competing offer can be mentioned factually and without a deadline; an imaginary one is a bluff in a conversation you cannot afford to lose.',
          },
        ],
      },
      {
        id: 'what-moves',
        title: 'What is actually movable',
        blocks: [
          {
            kind: 'p',
            text: 'Base salary is frequently the most constrained element in a structured employer, because it sits in a band tied to a grade and moving it has consequences for internal equity. Several other components have different owners and different budgets, and are correspondingly easier.',
          },
          {
            kind: 'list',
            items: [
              '**Joining or sign-on amount.** A one-off, so it does not affect the band or anyone else\'s. Often the easiest single thing to obtain.',
              '**Start date.** Costs the employer nothing and can be worth several weeks of your time.',
              '**Review timing.** An early review at six months instead of twelve is a compounding win — it moves every subsequent raise forward.',
              '**Title.** Sometimes free, sometimes impossible, and worth more than it appears for your next move rather than this one.',
              '**Leave, training budget, certification funding.** Different budgets, frequently approved by the hiring manager directly.',
              '**Notice period and probation terms.** Rarely asked about, occasionally movable, and genuinely valuable.',
            ],
          },
          {
            kind: 'p',
            text: 'Before deciding what to ask for, work out what each component is actually worth to you — which is the arithmetic in [comparing two offers](/learn/salary-negotiation/evaluating-a-package). An extra week of leave and a joining amount are not comparable until you have converted both.',
          },
        ],
      },
    ],
  },

  'evaluating-a-package': {
    summary:
      'Two offers with different structures cannot be compared by looking at them. Reduce each to one annual figure by adding base, expected bonus discounted for its actual variability, employer retirement contributions, the cash value of benefits you would otherwise buy, and any joining amount amortised over the time you expect to stay — then subtract the costs the job imposes, particularly commuting and relocation. The number that comes out is usually closer between two offers than the headline figures suggest, which is the point: it stops a large bonus that may not pay from dominating a decision, and it makes the non-cash terms visible rather than ignored.',
    keyPoints: [
      'Discount a variable bonus by how often it actually pays at target — a guaranteed rupee is not a maybe-rupee.',
      'Employer retirement contributions are real compensation and are routinely left out of the comparison entirely.',
      'Subtract what the job costs you: commuting time and money, relocation, and any benefit you now have to buy yourself.',
      'Convert everything to one annual figure before deciding, and then decide on the non-financial factors, which usually matter more.',
    ],
    faq: [
      {
        q: 'How should I value a bonus that is not guaranteed?',
        a: 'Ask what percentage of target has actually been paid over the last three years — a reasonable question at offer stage, and the answer tells you a great deal about the employer whichever way it goes. Then discount accordingly. A 20% target bonus that has paid at half of target is worth 10%, not 20%, and treating it as guaranteed is the single most common error in comparing two offers.',
      },
      {
        q: 'Does the employer provident fund contribution count?',
        a: 'Yes. It is money paid on your behalf into an account that is yours, and leaving it out understates an offer that contributes more. The same applies to any employer pension or superannuation contribution in other markets. It is less liquid than salary, which is a reason to weight it slightly lower, not a reason to score it at zero — see [EPF and NPS](/learn/epf-nps/epf-vs-nps).',
      },
      {
        q: 'How much is a shorter commute worth?',
        a: 'More than most people account for. An hour a day each way is roughly ten hours a week and around 450 hours a year, plus the direct cost. You do not have to price your time precisely to notice that this frequently exceeds the gap between two offers. It is also the factor most reliably underestimated at the point of accepting and most reliably resented a year later.',
      },
    ],
    sections: [
      {
        id: 'one-number',
        title: 'Reducing an offer to one number',
        blocks: [
          {
            kind: 'formula',
            label: 'Effective annual value',
            expression: 'Base + (Bonus × payout rate) + Employer retirement + Benefit value + (Joining ÷ expected years) − Job costs',
            where: [
              'Base — the contractual annual salary.',
              'Bonus × payout rate — target bonus multiplied by the share of target historically paid.',
              'Employer retirement — provident fund, pension or superannuation paid by the employer.',
              'Benefit value — what you would otherwise pay for health cover, insurance or subsidised services.',
              'Joining ÷ expected years — a one-off spread over how long you realistically expect to stay.',
              'Job costs — commuting, relocation, and any benefit you lose and must replace.',
            ],
          },
          {
            kind: 'p',
            text: 'None of the terms is difficult. The reason people skip the exercise is that it takes twenty minutes and the headline numbers are right there — which is exactly why offers are structured to make the headline number the attractive one.',
          },
        ],
      },
      {
        id: 'worked',
        title: 'Two offers, worked',
        blocks: [
          {
            kind: 'worked',
            title: 'The higher headline is not the better offer',
            rows: [
              { label: 'Offer A — base', value: '₹18,00,000' },
              { label: 'Offer A — bonus', value: '20% target, paid at ~50% historically → ₹1,80,000' },
              { label: 'Offer A — employer PF', value: '₹86,400' },
              { label: 'Offer A — health cover', value: 'Self only → ₹0 additional value' },
              { label: 'Offer A — commute', value: '90 min each way; ₹60,000 a year in travel' },
              { label: 'Offer A — effective', value: '₹18,00,000 + 1,80,000 + 86,400 − 60,000 = ₹19,06,400' },
              { label: 'Offer B — base', value: '₹16,50,000' },
              { label: 'Offer B — bonus', value: '10% target, paid at ~100% historically → ₹1,65,000' },
              { label: 'Offer B — employer PF', value: '₹1,98,000' },
              { label: 'Offer B — health cover', value: 'Family floater worth ~₹35,000 to replace' },
              { label: 'Offer B — commute', value: '25 min each way; ₹18,000 a year' },
              { label: 'Offer B — effective', value: '₹16,50,000 + 1,65,000 + 1,98,000 + 35,000 − 18,000 = ₹20,30,000' },
            ],
            conclusion:
              'Offer A leads by ₹1,50,000 on base and trails by roughly ₹1,23,600 once everything is counted — before valuing the 270 hours a year Offer B gives back. Every figure here is illustrative; the method is the point.',
          },
          {
            kind: 'tool',
            toolId: 'budget',
            text: 'Once you have the effective figure, the Budget Builder shows what that take-home actually supports month to month — which is the question underneath the comparison.',
          },
        ],
      },
      {
        id: 'after-the-arithmetic',
        title: 'What the number cannot tell you',
        blocks: [
          {
            kind: 'p',
            text: 'The arithmetic exists to stop a misleading headline dominating the decision. It does not make the decision, and treating it as though it does is its own error.',
          },
          {
            kind: 'list',
            items: [
              '**What you would learn.** Two years of real skill development is worth more over a career than a difference of a few percent in year one — the compounding argument in [the first ten years](/learn/banking-careers/first-ten-years).',
              '**Who you would work for.** The single largest determinant of whether a job is tolerable, and almost impossible to price.',
              '**Where it leads.** Some roles have wide exits and some narrow them. Worth asking about explicitly at offer stage.',
              '**Stability.** A higher offer from a business under obvious pressure is not the higher offer if it lasts eleven months.',
            ],
          },
          {
            kind: 'p',
            text: 'Do the arithmetic first, then decide on these. Doing it in the other order lets the headline number colour the qualitative judgement, which is precisely the effect the exercise is meant to remove.',
          },
          {
            kind: 'tool',
            toolId: 'lifemap',
            text: 'LifeMap is built for the comparative version of this question — run the same starting position twice with different salary paths and compare the two curves rather than reading either as a forecast.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'A salary negotiated once compounds through every percentage raise that follows it, which makes the twenty minutes after a written offer arrives among the highest-value twenty minutes of a career. Most people spend them saying yes.',
      'The fear behind that is that negotiating puts the offer at risk. It very rarely does. An employer at offer stage has spent weeks and real money on a process, has decided they want you specifically, and in most structured organisations expects a counter — they have often left room for one. What causes damage is not the fact of negotiating but how it is done: an ultimatum, an invented competing offer, or reopening a conversation after accepting.',
      'The second half of this topic is comparison, and it is where the arithmetic lives. Two offers with different structures — one with a large variable bonus, one with a larger employer retirement contribution and a shorter commute — cannot be compared by looking at them, and the differences are frequently large enough to reverse the ranking.',
    ],
    definitions: [
      {
        term: 'Salary band',
        definition:
          'The range attached to a grade or role, within which an individual salary must sit. Bands exist to keep internal pay consistent, which is why base salary is often the least flexible part of an offer even when the employer wants to accommodate you.',
      },
      {
        term: 'Target bonus',
        definition:
          'The bonus percentage payable if performance is at target. Not a guarantee, and the useful question is what proportion of target has actually been paid in recent years — that ratio is what a bonus should be discounted by when comparing offers.',
      },
      {
        term: 'Effective annual value',
        definition:
          'One number combining base, discounted bonus, employer retirement contributions, the replacement cost of benefits and an amortised joining amount, less the costs the job imposes. The only basis on which two differently-structured offers can honestly be compared.',
      },
      {
        term: 'Total compensation',
        definition:
          'Everything of value in an offer rather than base salary alone. Employers use the phrase to present the largest available figure, so read what is included — an unguaranteed bonus counted at full target is the most common inflation in it.',
      },
    ],
    faq: [
      {
        q: 'Is it really safe to negotiate?',
        a: 'In the overwhelming majority of cases, yes, provided you negotiate once, after a written offer, with a specific request and a reason. Employers at that stage have invested substantially in reaching you and expect the conversation. The behaviours that create risk are ultimatums, bluffed competing offers, repeated rounds, and reopening after acceptance — none of which is required to ask for more.',
      },
      {
        q: 'What should I say when asked for salary expectations early?',
        a: 'Deflect once: "I would rather understand the role properly first — is there a range the position is budgeted at?" Many recruiters will answer, and that answer is more useful than anything you could have said. If pressed, give a researched range, describe it as market-based rather than personal, and treat its lower end as the number you have just agreed to.',
      },
      {
        q: 'How do I compare an offer with equity or shares?',
        a: 'Value it on what it is worth if you leave at the end of the vesting cliff, not on a projection. For a listed employer that is a reasonable estimate; for an unlisted one it is genuinely uncertain and should be weighted well below cash. Check the vesting schedule and the cliff, because an offer whose value depends on staying four years is a different offer from one you can bank in year one.',
      },
      {
        q: 'Should I negotiate a graduate programme offer?',
        a: 'Usually there is nothing to negotiate on base — graduate cohorts are paid a single published rate, and moving it for one person is not something the employer can do. What is sometimes available is the start date, the location or the first rotation. Ask about those rather than about salary, and accept a clear no without pushing.',
      },
    ],
  },
  articles,
};

export default content;
