/**
 * Editorial copy and article bodies for the Behavioural Finance topic.
 *
 * Named biases are used sparingly and only where the name adds something. The
 * failure mode of writing about behavioural finance is a taxonomy of forty
 * cognitive biases that a reader recognises, enjoys, and cannot act on. Both
 * articles here are built around one mechanism and the specific structural
 * defence against it.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'selling-at-the-bottom': {
    summary:
      'Selling during a crash is not a failure of intelligence, and treating it as one is why the standard advice does not work. A drawdown is genuinely painful, losses register more strongly than equivalent gains, and the pain arrives daily while the recovery is theoretical — so the decision to sell feels like prudence rather than panic. What actually protects a portfolio is structural rather than motivational: an allocation you would hold through a fall you have already imagined, an emergency fund so a bad market and a bad month never coincide, and a written rule made before the fall about what would genuinely justify selling. The cost of getting this wrong is larger than any allocation decision.',
    keyPoints: [
      'Losses are felt more sharply than equivalent gains, so a 30% fall does not feel like the mirror image of a 30% rise.',
      'Selling converts a paper loss into a realised one and requires a second correct decision — when to return — that most people never make.',
      'The defence is structural: an allocation sized for a drawdown you have imagined, not a resolution to be brave.',
      'An emergency fund is a behavioural instrument as much as a financial one — it stops a bad month forcing a bad sale.',
    ],
    faq: [
      {
        q: 'Is it ever right to sell during a fall?',
        a: 'Yes, in specific cases: you need the money for its intended purpose soon, your circumstances have changed such that the allocation is now wrong, or you are rebalancing according to a rule set in advance. What is almost never right is selling because the fall is frightening, since that reasoning applies most strongly at the point where selling is worst.',
      },
      {
        q: 'What if I already sold at the bottom?',
        a: 'The relevant question is what to do now, not whether the sale was a mistake. Sitting in cash waiting for a comfortable moment is the more expensive half of the error, because comfort arrives only after prices have recovered. Returning in tranches over a set number of months removes the timing decision without requiring you to be confident, which is usually the honest constraint.',
      },
      {
        q: 'Does a SIP protect me from this?',
        a: 'It helps and it does not solve it. A SIP averages your entry price and removes the decision of when to invest, which is genuinely valuable. What it cannot do is stop you cancelling it during a fall — which is exactly when the instalments buy the most units and when cancellations peak. The mechanism protects against timing; it does not protect against your reaction.',
      },
    ],
    sections: [
      {
        id: 'why-it-happens',
        title: 'Why it happens to sensible people',
        blocks: [
          {
            kind: 'p',
            text: 'The standard framing — investors panic — is both condescending and unhelpful, because it suggests the fix is resolve. Three things make selling feel reasonable at the moment it is most costly.',
          },
          {
            kind: 'list',
            items: [
              '**Losses register more strongly than gains.** A 30% fall and a 30% rise are not experienced as mirror images. The fall is felt considerably more sharply, which distorts the comparison you think you are making.',
              '**The pain is daily and the recovery is theoretical.** Every day the portfolio is visible and lower. The recovery exists only as an argument about history, and an argument competes poorly with a number on a screen.',
              '**Selling feels like action.** In a situation that feels out of control, doing something is relief. Holding requires accepting that the correct action is nothing, which is psychologically the hardest instruction to follow.',
            ],
          },
          {
            kind: 'p',
            text: 'None of these is irrationality in the ordinary sense. They are how the decision genuinely feels, which is why a defence built on feeling differently does not survive contact with a real crash.',
          },
        ],
      },
      {
        id: 'the-arithmetic',
        title: 'What the round trip actually costs',
        blocks: [
          {
            kind: 'p',
            text: 'Selling in a fall requires two correct decisions, not one. You have to exit and then re-enter, and the re-entry is the decision people do not make — because the market only feels safe again after it has already risen.',
          },
          {
            kind: 'worked',
            title: 'Two investors through the same fall and recovery',
            rows: [
              { label: 'Both start with', value: '₹20,00,000' },
              { label: 'The market falls', value: '35%, to ₹13,00,000' },
              { label: 'Investor A', value: 'Holds throughout' },
              { label: 'Investor B', value: 'Sells at the bottom, returns after a 25% recovery' },
              { label: 'Market recovers to the prior level', value: 'A is back at ₹20,00,000' },
              { label: 'B re-entered at', value: '₹13,00,000 × 1.25 = ₹16,25,000 level' },
              { label: 'B\'s ₹13,00,000 at that point', value: 'Grows only with the remaining ~23% recovery → ≈ ₹16,00,000' },
              { label: 'Gap', value: '≈ ₹4,00,000, on identical starting capital' },
            ],
            conclusion:
              'B did nothing unusual — sold when it hurt most, waited for confidence, returned when things looked better. That entirely ordinary sequence cost a fifth of the portfolio, and it does not require any single decision to have been obviously foolish.',
          },
          {
            kind: 'note',
            title: 'This dwarfs allocation decisions',
            text: 'The gap between two sensible asset allocations over a decade is usually smaller than the gap in this example, produced by one round trip. Which is why behaviour, rather than [allocation](/learn/investing/asset-allocation-basics), is where outcomes are decided — even though allocation is where the attention goes.',
          },
        ],
      },
      {
        id: 'the-defences',
        title: 'Structural defences, not resolutions',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Size the allocation to a fall you have imagined.** Before investing, write down what your portfolio would be worth after a 35% fall, as a rupee figure. If that number is intolerable, the allocation is wrong now — while changing it is cheap.',
              '**Hold an emergency fund.** The worst forced sales happen when a job loss and a market fall coincide. A fund means one does not force the other, which makes it a behavioural instrument as much as a financial one.',
              '**Write the sell rule in advance.** One page: what would genuinely justify selling. Circumstances change, goal date arrives, rebalancing rule triggers. "It fell a lot" is not on the list, and having written that down beforehand is what makes it binding.',
              '**Reduce how often you look.** Checking daily during a fall converts one decision into thirty opportunities to make it. Monthly is sufficient for a portfolio with a fifteen-year horizon.',
              '**Automate contributions.** A SIP that continues through a fall buys more units at lower prices. The mechanism only works if the decision to continue is not being taken monthly.',
            ],
          },
          {
            kind: 'tool',
            toolId: 'investmatch',
            text: 'InvestMatch reduces the equity share as the horizon shortens regardless of stated appetite, which is the same principle applied mechanically — appetite is what you feel in a calm month, horizon is a fact.',
          },
        ],
      },
    ],
  },

  'lifestyle-creep': {
    summary:
      'Lifestyle creep is the process by which spending expands to absorb each raise, so that a substantially higher income produces no change in savings rate and no felt improvement. It happens because increases arrive gradually and are absorbed one decision at a time — a better flat, a car upgrade, a subscription that seemed trivial — and each individual decision is defensible while the aggregate is not. The structural fix is to split every raise before it reaches your spending account: decide in advance what proportion of an increment goes to savings, automate it on the month the raise lands, and let the rest be absorbed freely. A 50% split, applied consistently, changes a career outcome more than any investment decision.',
    keyPoints: [
      'Raises are absorbed one defensible decision at a time, which is why no single decision ever looks like the problem.',
      'Split the increment before it reaches spending: the month the raise lands is the only moment the money is unclaimed.',
      'Fixed-cost upgrades are the damaging kind — rent and EMIs are hard to reverse, while variable spending is not.',
      'Some lifestyle improvement is the point of earning more; the goal is a chosen proportion, not zero.',
    ],
    faq: [
      {
        q: 'Is lifestyle creep always bad?',
        a: 'No, and framing it that way is why the advice fails. Earning more in order to live exactly as before is a strange objective. The problem is not that spending rises; it is that it rises by default, absorbing the entire increase without a decision. A deliberate split — some to living better, some to saving — is the whole point, and it is a different thing from drift.',
      },
      {
        q: 'What split should I use?',
        a: 'Half to savings is a common and durable choice: it noticeably improves the savings rate while leaving a raise that is genuinely felt. If your savings rate is low, a larger share early is worth more because of how long it compounds. What matters more than the exact proportion is that it is decided in advance and automated, rather than being what happens to be left at month end.',
      },
      {
        q: 'Why does my savings rate not improve when I earn more?',
        a: 'Because the increase arrives in the same account as everything else, and money in a spending account gets spent. The rate is a ratio, so it only improves if savings grow faster than spending — which does not happen by default when the increment is undifferentiated cash. Automating the split on the day of the raise is what breaks the pattern.',
      },
    ],
    sections: [
      {
        id: 'how-it-happens',
        title: 'How it happens without a decision',
        blocks: [
          {
            kind: 'p',
            text: 'Nobody decides to absorb a raise. What happens is a sequence of individually reasonable choices spread over months, each affordable on the new income, and none of them large enough to feel like the moment the raise disappeared.',
          },
          {
            kind: 'worked',
            title: 'A ₹15,000 monthly raise, absorbed in eight months',
            rows: [
              { label: 'Month 1 — the raise', value: '+₹15,000 take-home' },
              { label: 'Month 2 — a better flat', value: '−₹6,000 a month, permanent' },
              { label: 'Month 3 — car EMI', value: '−₹4,500 a month, five years' },
              { label: 'Month 5 — subscriptions and services', value: '−₹1,500 a month' },
              { label: 'Month 8 — more eating out, higher baseline', value: '−₹3,000 a month' },
              { label: 'Remaining', value: '₹0' },
              { label: 'Savings rate change', value: 'None' },
            ],
            conclusion:
              'Every line is defensible in isolation and the aggregate consumed the entire raise. Note that ₹10,500 of it is fixed cost, which is the part that is difficult to reverse if the income changes — a structural downgrade of the household\'s flexibility, achieved without any decision that felt structural.',
          },
          {
            kind: 'p',
            text: 'The fixed-cost detail matters more than the total. Variable spending can be reduced in a difficult month; a lease and an EMI cannot. This is the same asymmetry that makes [fixed costs the right target](/learn/budgeting/cut-spending-without-misery) when cutting spending.',
          },
        ],
      },
      {
        id: 'the-split',
        title: 'Splitting the increment',
        blocks: [
          {
            kind: 'p',
            text: 'There is exactly one moment when a raise is unclaimed money: the month it first arrives. After that it has been absorbed into a baseline and reclaiming it feels like a cut, which is a much harder decision than never having spent it.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Decide the split before the raise, not after.** Fifty-fifty is a good default. Deciding in advance means you are not negotiating with yourself while holding the money.',
              '**Automate on the first month.** Increase the SIP or the transfer by the saved half, dated for the day after salary credit. This is the entire mechanism.',
              '**Spend the other half deliberately.** On something you actually chose. A raise that produces no felt improvement is not sustainable as a policy and will be abandoned.',
              '**Do the same with bonuses.** Lump sums are absorbed even faster because they arrive outside the monthly rhythm, and nothing in the budget was expecting them.',
            ],
          },
          {
            kind: 'note',
            title: 'Why the automation matters more than the proportion',
            text: 'A 40% split that happens automatically every year beats a 60% split that depends on remembering in a busy month. The mechanism is the whole intervention; the percentage is a preference.',
          },
        ],
      },
      {
        id: 'what-it-compounds-to',
        title: 'What the split is worth',
        blocks: [
          {
            kind: 'p',
            text: 'The split looks modest month to month, which is why it is skipped. Its value comes from being applied to every increment across a career, each of which then compounds for however many years remain.',
          },
          {
            kind: 'worked',
            title: 'One ₹7,500 monthly split, invested for twenty years',
            rows: [
              { label: 'Amount split to savings', value: '₹7,500 a month' },
              { label: 'Assumed return', value: '11% a year' },
              { label: 'Months', value: '240' },
              { label: 'Monthly rate', value: '11% ÷ 12 ≈ 0.009167' },
              { label: 'Future value (annuity due)', value: '≈ ₹65 lakh' },
            ],
            conclusion:
              'From half of one raise, sustained. Apply the same discipline to every subsequent increment and the effect is considerably larger — and note that the return assumption is doing less work here than the contribution is, which is the point.',
          },
          {
            kind: 'tool',
            toolId: 'peercompare',
            text: 'PeerCompare puts your savings rate next to a benchmark for your income bracket, which is the metric this whole habit is designed to move.',
          },
          {
            kind: 'p',
            text: 'The arithmetic is the [SIP formula](/learn/investing/sip-maths), and the reason it is worth showing is that lifestyle creep is invisible while its opposite is not. The raise you absorbed left no record; the raise you split shows up as a number you can watch.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'The arithmetic of personal finance is easy and public. Compounding is one formula, a budget is a division, and an EMI is an annuity. If arithmetic were the constraint, outcomes would cluster far more tightly than they do.',
      'What actually separates two people with the same income and the same knowledge is behaviour under specific conditions: what they do in the third month of a falling market, and what happens to their spending the month after a raise. Both are situations where the individually reasonable response produces the worse outcome, which is why willpower is a poor defence and structure is a good one.',
      'These guides avoid the taxonomy of named biases, which is enjoyable to read and difficult to act on. Each one takes a single mechanism, shows what it costs in rupees, and describes the structural change that removes the decision from the moment it is hardest to make.',
    ],
    definitions: [
      {
        term: 'Loss aversion',
        definition:
          'Losses being felt more strongly than equivalent gains. It is why a 30% fall is not experienced as the mirror image of a 30% rise, and why selling during a drawdown feels like prudence at the moment it is most expensive.',
      },
      {
        term: 'Lifestyle creep',
        definition:
          'Spending expanding to absorb rising income, so that a higher salary produces no improvement in savings rate. It happens through a sequence of individually defensible decisions, which is why no single one ever looks like the problem.',
      },
      {
        term: 'The round trip',
        definition:
          'Selling during a fall and buying back later. It requires two correct decisions rather than one, and the second — when to return — is the one most people never make, because a market only feels safe after it has already recovered.',
      },
      {
        term: 'Structural defence',
        definition:
          'A change that removes a decision from the moment it is hardest to make: an allocation sized for a drawdown you have already imagined, an automated split of a raise, a written rule about when selling is justified. Distinguished from a resolution, which is made in a calm month and tested in a bad one.',
      },
    ],
    faq: [
      {
        q: 'Does behaviour really matter more than investment selection?',
        a: 'For most households, yes, and by a wide margin. The gap between two sensible asset allocations over a decade is typically smaller than the gap produced by a single sell-and-return round trip during a fall. The same is true on the saving side: the difference between splitting raises and absorbing them dwarfs the difference between two reasonable funds.',
      },
      {
        q: 'How do I stop myself selling in a crash?',
        a: 'Not by resolving to be calm, because the resolution is made in a calm month and tested in a frightening one. Size the allocation to a fall you have already written down in rupees, hold an emergency fund so a bad month cannot force a sale, write the conditions under which selling is justified before the fall, and reduce how often you look.',
      },
      {
        q: 'Is it wrong to enjoy a raise?',
        a: 'No — earning more in order to live exactly as before is a strange goal. The problem is absorbing the entire increase by default, without a decision. Splitting it, automating the saved portion on the month it arrives and spending the rest deliberately gets both the improvement and the compounding, which is the outcome worth aiming at.',
      },
      {
        q: 'Why focus on structure rather than discipline?',
        a: 'Because discipline is a finite resource and the conditions that test it are precisely the ones where it is scarcest — a frightening market, a stressful month, a large unexpected bill. A structure decided in advance and automated does not require anything from you at the moment it matters, which is the only reliable property a defence can have.',
      },
    ],
  },
  articles,
};

export default content;
