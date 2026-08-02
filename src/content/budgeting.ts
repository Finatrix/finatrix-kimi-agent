/**
 * Article bodies for the Budgeting topic.
 *
 * Loaded lazily by the article route (see `src/content/index.ts`) so none of
 * this text reaches the landing page or the edge Worker bundle.
 *
 * Every rupee figure below is arithmetic the reader can redo from the inputs
 * shown on the same page. That is a deliberate editorial constraint rather than
 * a stylistic one: this site has no proprietary market data, so any number
 * presented as a fact about the world — a rent level, a return, an average —
 * would be a claim we cannot support. Worked examples state their inputs and
 * derive everything else.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  '50-30-20-rule': {
    summary:
      'The 50/30/20 rule divides take-home income into 50% needs, 30% wants and 20% savings. It is a diagnostic, not a law: in Indian metros, rent alone often takes 30–40% of take-home, which pushes needs past 50% before any other bill is paid. When that happens the right response is to hold the 20% savings share constant and let needs and wants trade against each other, because the savings rate is the only one of the three that determines how fast your net worth grows.',
    keyPoints: [
      'The split applies to take-home pay, not CTC — allocating money you never receive is the most common way the rule is misapplied.',
      'Needs are what you would still pay in a bad month; the test is not whether an expense feels essential but whether it stops when income does.',
      'A needs share above 50% in a metro is usually structural. The lever is housing or income, not a stricter grocery budget.',
      'Hold the savings share fixed and let the other two flex. It is the only one of the three that compounds.',
    ],
    faq: [
      {
        q: 'Does the 50/30/20 rule work in India?',
        a:
          'Partly. The 20% savings target is achievable across most income levels and is worth holding to. The 50% needs ceiling assumes housing costs well below what the top Indian metros charge — with rent at 30–40% of take-home, needs land at 55–65% before anything else. Treat the ceiling as a diagnostic that tells you housing is the binding constraint, not as a target you have failed to hit.',
      },
      {
        q: 'Do EMIs count as needs or savings?',
        a:
          'Split them. The minimum contractual repayment is a need — you owe it whether or not the month goes well. Anything you pay above the minimum is savings, because it is a voluntary transfer that increases your net worth by reducing a liability. Counting the entire EMI as a need makes prepayment look like it costs you nothing, which distorts the comparison against investing.',
      },
      {
        q: 'What if I cannot reach 20% savings?',
        a:
          'Start with what the current month actually allows and raise it against income rather than against willpower. A step-up of even a few hundred rupees on each increment compounds hard over a career, and it is far more durable than a target set from a spreadsheet in January. What matters most is that the rate is measured every month, because unmeasured rates drift downward.',
      },
    ],
    sections: [
      {
        id: 'what-it-is',
        title: 'What the rule actually says',
        blocks: [
          {
            kind: 'p',
            text: 'The 50/30/20 rule divides **take-home** income into three groups: 50% to needs, 30% to wants, and 20% to savings and investments. It was popularised as a way to make budgeting decidable — instead of tracking forty categories, you track three, and the only question each expense has to answer is which group it belongs to.',
          },
          {
            kind: 'list',
            items: [
              '**Needs** — what you would still pay in a bad month. Rent, utilities, groceries, transport to work, insurance premiums, minimum loan repayments, school fees.',
              '**Wants** — everything discretionary. Eating out, subscriptions, travel, upgrades, the difference between the flat you need and the flat you like.',
              '**Savings** — investments, and any loan repayment above the contractual minimum, because paying down a liability increases net worth exactly as buying an asset does.',
            ],
          },
          {
            kind: 'note',
            title: 'Take-home, not CTC',
            text: 'The split applies to what reaches your bank account after tax and deductions. Budgeting from CTC allocates money you never receive, which overstates every group at once and is the single most common way the rule is misapplied.',
          },
          {
            kind: 'p',
            text: 'The classification test for needs is not whether an expense feels essential. It is whether it stops when your income does. A gym membership feels essential to the person paying it and is cancelled within a fortnight of losing a job; rent is not.',
          },
        ],
      },
      {
        id: 'the-arithmetic',
        title: 'The arithmetic, on a real salary',
        blocks: [
          {
            kind: 'p',
            text: 'Take a monthly take-home of ₹80,000. The targets follow directly.',
          },
          {
            kind: 'worked',
            title: 'Targets at ₹80,000 take-home',
            rows: [
              { label: 'Needs (50%)', value: '₹40,000' },
              { label: 'Wants (30%)', value: '₹24,000' },
              { label: 'Savings (20%)', value: '₹16,000' },
            ],
            conclusion:
              'Now compare that against what a single professional renting alone in a metro actually pays.',
          },
          {
            kind: 'worked',
            title: 'Actual needs, same salary, Bengaluru one-bedroom',
            rows: [
              { label: 'Rent', value: '₹28,000' },
              { label: 'Utilities and connectivity', value: '₹3,000' },
              { label: 'Groceries', value: '₹8,000' },
              { label: 'Transport to work', value: '₹4,000' },
              { label: 'Health and term insurance', value: '₹2,500' },
              { label: 'Total needs', value: '₹45,500 — 56.9% of take-home' },
            ],
            conclusion:
              'Needs overshoot the 50% target by ₹5,500 before a single discretionary rupee is spent. Nothing in that list is extravagant, and no amount of discipline removes it.',
          },
          {
            kind: 'p',
            text: 'That leaves ₹34,500 — 43.1% — to divide between wants and savings. Hold savings at the 20% target of ₹16,000 and wants get ₹18,500, or 23.1%. The split is not 50/30/20. It is roughly 57/23/20, and it is a perfectly good budget.',
          },
        ],
      },
      {
        id: 'where-it-breaks',
        title: 'Where the 50% ceiling breaks',
        blocks: [
          {
            kind: 'p',
            text: 'Rent is the variable that decides whether the ceiling holds. Keeping every other need constant at ₹17,500 and moving only rent shows how quickly it stops being reachable.',
          },
          {
            kind: 'table',
            caption: 'Needs share at ₹80,000 take-home, with non-rent needs fixed at ₹17,500',
            head: ['Rent', 'Rent as % of take-home', 'Total needs', 'Left for wants + savings'],
            rows: [
              ['₹16,000', '20%', '₹33,500 (41.9%)', '58.1%'],
              ['₹24,000', '30%', '₹41,500 (51.9%)', '48.1%'],
              ['₹28,000', '35%', '₹45,500 (56.9%)', '43.1%'],
              ['₹32,000', '40%', '₹49,500 (61.9%)', '38.1%'],
            ],
            note: 'Pure arithmetic — no market data. Substitute your own figures and the shape holds.',
          },
          {
            kind: 'p',
            text: 'The rule was calibrated where housing consumed something closer to a fifth of take-home. At 35% rent it is already unreachable, and at 40% the entire remaining budget has to fund both wants and savings out of 38%. This is not a discipline problem, and treating it as one sends people to cut groceries when the binding constraint is a lease.',
          },
          {
            kind: 'warning',
            title: 'The wrong conclusion to draw',
            text: 'Failing the 50% test does not mean the budget has failed. It means housing is the dominant cost, which is a structural fact with structural answers — flatmates, a different locality, a longer commute, or a higher income. Cutting discretionary spending to fix a rent problem attacks the smallest number in the equation.',
          },
        ],
      },
      {
        id: 'what-to-hold-constant',
        title: 'Hold the savings share, flex the other two',
        blocks: [
          {
            kind: 'p',
            text: 'Of the three shares, only one has a direct mechanical effect on your net worth in ten years. Needs and wants both leave the household; savings is the part that stays and compounds. So when the arithmetic does not fit — and in a metro it usually does not — the savings share is the one to protect and the needs/wants boundary is the one to move.',
          },
          {
            kind: 'p',
            text: 'This also makes the budget testable month to month. A savings rate is one number, it is unambiguous, and it either went up or it did not. A three-way split argued over category boundaries is much harder to hold yourself to.',
          },
          {
            kind: 'tool',
            toolId: 'budget',
            text: 'Enter your own take-home and category spending to see where your split actually lands against the three targets.',
          },
          {
            kind: 'p',
            text: 'If you do not yet know what you spend, the split cannot be computed honestly from memory — nobody estimates their own discretionary spending accurately. Start with [four weeks of tracking](/learn/budgeting/track-expenses-that-stick) and build the budget from measured figures.',
          },
        ],
      },
      {
        id: 'how-to-apply',
        title: 'Applying it without rewriting your life',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              'Take your last three months of take-home pay and use the average, not the best month.',
              'Sort every recurring charge into needs or wants using the stops-when-income-stops test.',
              'Split each EMI: the contractual minimum is a need, anything above it is savings.',
              'Compute your current three shares. Do not set targets before you know where you are.',
              'Set the savings share first, at a level you would still hit in a mediocre month, and let needs and wants take what remains.',
              'Re-check the shares monthly. A savings rate that is not measured drifts downward.',
            ],
          },
          {
            kind: 'p',
            text: 'Once the split is stable, the next question is usually where the savings share should go, which depends entirely on when you need it back — see [how big an emergency fund should be](/learn/saving/emergency-fund-size) before investing anything beyond it.',
          },
        ],
      },
    ],
  },

  'track-expenses-that-stick': {
    summary:
      'Most expense tracking fails because it is set up to capture everything perfectly from day one, which takes about eleven days to abandon. A method that lasts does the opposite: log every transaction for four weeks at the lowest possible effort, categorise loosely, change nothing while you measure, and only then read the result. The finding is almost never the large planned expenses you already knew about — it is one recurring category, usually food delivery, transport or subscriptions, running at two to three times what you would have guessed.',
    keyPoints: [
      'Measure first and change nothing for four weeks. Editing behaviour while measuring destroys the only baseline you will get.',
      'Four weeks is the minimum useful window because it is the first one that contains a full rent-and-bills cycle.',
      'Log at the moment of spending or in one fixed daily sitting. Both work; a weekly catch-up does not, because recall decays fast.',
      'Read the result by recurring category, not by largest transaction. The problem is usually frequency, not size.',
    ],
    faq: [
      {
        q: 'How long does it take to track expenses properly?',
        a:
          'Under two minutes a day once the habit is set, and about four weeks before the data says anything. The first week is always incomplete because you forget things; the second is where the habit either holds or does not. Judge the exercise at the end of week four, not week one.',
      },
      {
        q: 'Should I track cash spending too?',
        a:
          'Yes, and it is the part people skip. Cash and UPI spending is where the underestimate lives, precisely because there is no statement to remind you. If logging every cash transaction is too much friction, log one daily total for cash — an approximate figure that exists beats an accurate one that does not.',
      },
      {
        q: 'Do I need to connect my bank account to track expenses?',
        a:
          'No, and FinatriX deliberately cannot. Manual logging is slower than an automatic feed, and the trade is that nothing here has read access to your accounts. It also has an underrated side effect: typing an amount makes you notice it, which an automatic import does not.',
      },
    ],
    sections: [
      {
        id: 'why-tracking-fails',
        title: 'Why expense tracking usually fails',
        blocks: [
          {
            kind: 'p',
            text: 'Expense tracking is abandoned for a predictable reason: it is set up to be complete and accurate from day one. Forty categories, every transaction, receipts photographed. That system works for about eleven days, and its collapse takes the whole habit with it — including the part that was actually working.',
          },
          {
            kind: 'p',
            text: 'The version that survives inverts the priorities. Completeness beats precision, and the log existing at all beats the log being right. An approximate daily cash total that you record every day is worth far more than an exact one you record for a week.',
          },
          {
            kind: 'note',
            title: 'What you are actually buying',
            text: 'Four weeks of imperfect data tells you which recurring category is two to three times what you assumed. That single finding is the entire return on the exercise, and it does not require precision to surface.',
          },
        ],
      },
      {
        id: 'the-method',
        title: 'The four-week method',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Week 0 — decide the trigger.** Pick one: log at the moment of payment, or log everything in one fixed sitting each evening. Both work. A weekly catch-up does not, because recall of small spending decays within about two days.',
              '**Weeks 1–4 — log everything and change nothing.** This is the hard instruction and the important one. Editing your spending while measuring it destroys the only baseline you will get.',
              '**Cash and UPI get a daily total.** If itemising them is too much friction, record one approximate figure per day. The underestimate lives here precisely because there is no statement to remind you.',
              '**Categorise loosely.** Six to ten categories is plenty. Fine-grained categories create decisions at the moment of logging, which is exactly where friction kills the habit.',
              '**At the end of week 4 — read by category, not by transaction.** Sort categories by monthly total and look at the top three.',
            ],
          },
          {
            kind: 'tool',
            toolId: 'expenses',
            text: 'Log entries in a few seconds each, with frequently-used categories surfacing first as you build history. Works signed out, with your data staying in your own browser.',
          },
        ],
      },
      {
        id: 'reading-the-result',
        title: 'Reading the result',
        blocks: [
          {
            kind: 'p',
            text: 'The instinct is to look for the largest single transaction. That is almost never the finding, because large expenses are planned and you already knew about them. The finding is frequency.',
          },
          {
            kind: 'worked',
            title: 'How a small, frequent expense accumulates',
            rows: [
              { label: 'Food delivery, ₹280 per order', value: '4 orders per week' },
              { label: 'Weekly', value: '₹1,120' },
              { label: 'Monthly (52 weeks ÷ 12)', value: '₹4,853' },
              { label: 'Annual', value: '₹58,240' },
            ],
            conclusion:
              'Nobody budgets ₹58,000 a year for delivery, and almost nobody guesses the figure correctly before measuring it. The transaction that produced it never once looked significant.',
          },
          {
            kind: 'p',
            text: 'Sort by monthly total, then ask of the top three categories only: does this match what I would have guessed? The gap between the guess and the number is where the four weeks paid for themselves.',
          },
        ],
      },
      {
        id: 'what-to-do-next',
        title: 'What to do with four weeks of data',
        blocks: [
          {
            kind: 'p',
            text: 'Two things, in order. First, feed the category totals into a [50/30/20 split](/learn/budgeting/50-30-20-rule) so the numbers have a frame rather than sitting as a list. Second, resist changing more than one or two categories — a broad simultaneous cut is a diet, and [fixed costs are usually the better target](/learn/budgeting/cut-spending-without-misery) anyway.',
          },
          {
            kind: 'p',
            text: 'Keep logging after week four, but at lower intensity. The habit is worth far more as an early-warning system for a category creeping upward than as a monthly audit.',
          },
        ],
      },
    ],
  },

  'cut-spending-without-misery': {
    summary:
      'Spending cuts are usually attacked on the variable side — coffee, delivery, small indulgences — because those feel controllable and are visible every day. The arithmetic favours the opposite approach. A fixed cost is decided once and then charges you every month without further effort, so renegotiating rent, dropping an unused subscription tier, restructuring a loan or changing a commute pattern typically produces a larger and far more durable saving than a year of daily restraint, and costs no ongoing willpower at all.',
    keyPoints: [
      'A ₹2,000 monthly fixed-cost reduction is ₹24,000 a year for one decision; the same amount from daily restraint requires roughly 365 of them.',
      'Fixed costs are also the ones that quietly escalate — rent revisions, subscription price rises, insurance renewals — so they need an annual review whether or not you are cutting.',
      'Variable-cost cuts still matter, but they work best applied to one or two recurring categories rather than spread thin across all of them.',
      'Any cut you would be unwilling to sustain for twelve months is a temporary saving being counted as a permanent one.',
    ],
    faq: [
      {
        q: 'What is the fastest way to reduce monthly spending?',
        a:
          'List every recurring charge — rent, EMIs, insurance, subscriptions, connectivity, school and gym fees — and question each one once. Most people find two or three that are either unused, over-specified for their actual usage, or renewable at a lower rate. That single review usually beats months of discretionary restraint and does not have to be repeated daily.',
      },
      {
        q: 'Is it worth cutting small daily expenses at all?',
        a:
          'Yes, but pick one or two categories and leave the rest alone. Cutting a single recurring category you genuinely do not value much is sustainable; cutting everywhere at once is a diet, and it fails for the same reason diets do. The cut you are still making in month twelve is the only one that counted.',
      },
    ],
    sections: [
      {
        id: 'the-asymmetry',
        title: 'The asymmetry nobody accounts for',
        blocks: [
          {
            kind: 'p',
            text: 'Spending cuts are almost always attacked on the variable side — the coffee, the delivery, the small indulgence — because those are visible daily and feel controllable. Fixed costs are decided once, disappear into an auto-debit, and are rarely reopened. The arithmetic runs the other way.',
          },
          {
            kind: 'formula',
            label: 'What a cut actually costs you',
            expression: 'annual saving ÷ number of decisions required',
            where: [
              'A fixed-cost cut requires one decision and then charges nothing further.',
              'A variable-cost cut requires a fresh decision every time the opportunity to spend arises.',
            ],
          },
          {
            kind: 'worked',
            title: 'Two routes to roughly ₹26,000 a year',
            rows: [
              { label: 'Variable: skip 2 deliveries a week at ₹250', value: '₹500/week → ₹2,167/month → ₹26,000/year' },
              { label: 'Decisions required', value: '≈ 104 per year, each one in the moment' },
              { label: 'Fixed: ₹1,500 off rent at renewal, drop a ₹649 tier, cancel a ₹500 unused membership', value: '₹2,649/month → ₹31,788/year' },
              { label: 'Decisions required', value: '3, once' },
            ],
            conclusion:
              'The fixed route saves more, and after the three phone calls it costs nothing at all to sustain. The variable route asks for restraint 104 times and quietly ends the first week you are tired.',
          },
        ],
      },
      {
        id: 'finding-them',
        title: 'Finding the fixed costs worth attacking',
        blocks: [
          {
            kind: 'p',
            text: 'Fixed costs hide well because they are working as intended — you set them up so you would not have to think about them again. That is also why they escalate: rent revisions, subscription price rises and insurance renewals all happen without asking.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              'List every recurring charge from your bank and card statements for the last three months. Statements, not memory — recurring charges are exactly what memory drops.',
              'Mark each one: used weekly, used occasionally, or not used since it was set up.',
              'For anything not used, cancel it. This is usually two or three items and takes an afternoon.',
              'For anything over-specified — a plan tier above your actual usage, cover you have duplicated — downgrade rather than cancel.',
              'For the big three (rent, EMIs, insurance), check whether the current rate is still the market rate. A loan balance transfer or an insurance re-shop is one decision worth thousands a year.',
            ],
          },
          {
            kind: 'note',
            title: 'Do this annually, not once',
            text: 'The point of the review is not the one-off saving. It is that fixed costs drift upward on their own, and an annual pass is the only thing that stops a budget quietly degrading while nothing visibly changes.',
          },
        ],
      },
      {
        id: 'variable-cuts-that-work',
        title: 'The variable cuts that do work',
        blocks: [
          {
            kind: 'p',
            text: 'Variable cuts are not worthless — they are just badly targeted when spread across everything. Applied to one or two categories they hold, because the decision is made once at the category level rather than repeatedly at the transaction level.',
          },
          {
            kind: 'list',
            items: [
              'Pick one category you genuinely do not value much. Almost everyone has one, and it is rarely the one they would have cut first.',
              'Cut it substantially rather than a little. A category reduced by 60% is a decision; one reduced by 10% is 40 decisions.',
              'Leave everything else entirely alone, including the things that would look indefensible in a spreadsheet.',
            ],
          },
          {
            kind: 'warning',
            title: 'The test for any cut',
            text: 'If you would be unwilling to sustain it for twelve months, it is a temporary saving being counted as a permanent one. Budgets built on those overstate the savings rate and are the reason the January plan and the June reality disagree.',
          },
          {
            kind: 'p',
            text: 'Whatever the cut frees up only matters once it has somewhere to go. Direct it at the savings share before it reaches the account it would otherwise be spent from — and if you do not yet have [an emergency fund](/learn/saving/emergency-fund-size), that is where the first few months of it belong.',
          },
          {
            kind: 'tool',
            toolId: 'peercompare',
            text: 'See how your savings rate and expenses sit against a benchmark for your income bracket and city tier, so a cut has a scale to be judged against.',
          },
        ],
      },
    ],
  },

  'zero-based-budgeting': {
    summary:
      'Zero-based budgeting allocates every rupee of income to a named job — spending, saving or debt — until nothing is unassigned. It is stricter than a percentage frame like 50/30/20 and it earns that extra effort in two specific situations: an irregular income, where percentages of a number you do not yet know are meaningless, and a household that has plateaued, where the money is disappearing somewhere the three broad groups cannot see. It fails in two equally predictable ways — no allowance for annual bills, and no unassigned buffer — and both are fixable in the first month.',
    keyPoints: [
      'Every rupee gets a job, including the leftover: an unassigned surplus is spent by default rather than saved.',
      'It suits irregular income because you allocate money you have received, not a percentage of income you are forecasting.',
      'The two failure modes are forgetting annual bills and leaving no buffer, and both surface in month one.',
      'It is more work than a percentage frame every single month, which is why it should be adopted for a reason rather than by default.',
    ],
    faq: [
      {
        q: 'Is zero-based budgeting better than 50/30/20?',
        a: 'It is more precise and more work, which makes it better in some situations and worse in others. A steady salary with a comfortable savings rate does not need it — the percentage frame catches the same problems with a tenth of the effort. An irregular income, a household that cannot account for its own spending, or a period of deliberate debt payoff all justify the extra precision.',
      },
      {
        q: 'What happens when I overspend a category?',
        a: 'You move money from another category and record it. That is the mechanism working, not failing — the point of the method is that overspending is visible and has to be funded from somewhere identified rather than absorbed invisibly. A month with no reallocations usually means the categories were set too loosely to be informative.',
      },
      {
        q: 'Does it work with an irregular income?',
        a: 'It is the method most suited to one. Budget the money that has actually arrived rather than a percentage of a forecast: when income lands, allocate it across the coming month\'s jobs in priority order. A percentage frame requires a monthly income figure to take a percentage of, which is the one number an irregular earner does not have.',
      },
    ],
    sections: [
      {
        id: 'the-mechanism',
        title: 'Every rupee gets a job',
        blocks: [
          {
            kind: 'p',
            text: 'The rule is that income minus every allocation equals zero. Not zero in the bank — zero unassigned. Savings, investments and debt repayment are allocations like any other, so a month ending with money left over means the leftover has a name and a destination, not that you underspent.',
          },
          {
            kind: 'p',
            text: 'That is the whole difference from a percentage frame. [The 50/30/20 rule](/learn/budgeting/50-30-20-rule) tells you what proportion should go to three broad groups and leaves the detail alone. Zero-based budgeting refuses to leave the detail alone, which is precisely why it finds things the frame cannot.',
          },
          {
            kind: 'worked',
            title: 'A month allocated to zero',
            rows: [
              { label: 'Take-home received', value: '₹80,000' },
              { label: 'Rent and utilities', value: '₹28,000' },
              { label: 'Groceries and household', value: '₹10,000' },
              { label: 'Transport', value: '₹4,000' },
              { label: 'Loan EMI (minimum)', value: '₹9,000' },
              { label: 'Annual bills, monthly share', value: '₹6,500' },
              { label: 'Discretionary', value: '₹8,000' },
              { label: 'Investments', value: '₹12,000' },
              { label: 'Unassigned buffer', value: '₹2,500' },
            ],
            conclusion:
              'Sums to ₹80,000. The two lines most people omit are the annual-bill share and the buffer, and their absence is what causes the method to be abandoned in month two.',
          },
        ],
      },
      {
        id: 'when-it-is-worth-it',
        title: 'When the extra work pays',
        blocks: [
          {
            kind: 'table',
            caption: 'Which method suits which situation',
            head: ['Situation', 'Better method', 'Why'],
            rows: [
              ['Steady salary, savings rate on target', '50/30/20', 'The precision buys nothing you are not already getting'],
              ['Irregular or commission income', 'Zero-based', 'You allocate money received, not a percentage of a forecast'],
              ['Money vanishing, cause unknown', 'Zero-based', 'Broad groups hide the category that is actually the problem'],
              ['Deliberate debt payoff period', 'Zero-based', 'Every spare rupee needs a named destination to survive the month'],
              ['First month of ever budgeting', 'Track first', 'Allocate after you have measured — see the tracking guide'],
            ],
          },
          {
            kind: 'p',
            text: 'The honest position is that zero-based budgeting is more effort every month, indefinitely. Adopt it for one of the reasons above, and drop back to a percentage frame when the reason no longer applies — that is not a failure, it is the method having done its job.',
          },
          {
            kind: 'p',
            text: 'The irregular-income case deserves a note of its own, because it is the one where the two methods are not simply more and less precise versions of each other. A percentage frame needs a monthly income figure to take a percentage of. A freelancer, a commission earner or anyone whose pay arrives in uneven instalments does not have that number until the money lands, so the frame either operates on an average that no individual month resembles, or it operates on a forecast. Zero-based budgeting sidesteps the problem entirely: you allocate what has arrived, in priority order, and a thin month simply funds fewer of the lower-priority jobs.',
          },
          {
            kind: 'p',
            text: 'That priority order is worth writing down once rather than re-deciding each time money arrives. A workable sequence for an irregular income is: the annual-bills share first, because those dates do not move; then essential living costs for the coming month; then the minimum on every debt; then whatever refills the buffer to its target; and only then investments and discretionary spending. Written in advance, allocating a payment takes five minutes. Decided fresh each time, it becomes a negotiation with yourself in a month where the money already feels short.',
          },
        ],
      },
      {
        id: 'the-two-failures',
        title: 'The two ways it breaks',
        blocks: [
          {
            kind: 'list',
            items: [
              '**No line for annual bills.** Insurance renewals, festival spending, school fees and travel do not appear in a typical month and then arrive all at once. Without a monthly share set aside, the first one destroys the budget and the method gets blamed. [Sinking funds](/learn/saving/sinking-funds) is the fix.',
              '**No unassigned buffer.** A budget allocated to the last rupee has no tolerance, and every real month contains a surprise. A small buffer line — two or three per cent of income — absorbs it without requiring a rebuild.',
            ],
          },
          {
            kind: 'warning',
            title: 'Do not build the first one from memory',
            text: 'A zero-based budget built from what you think you spend allocates money to a life you are not living, and the gap shows up as constant reallocation. Measure one full month first — [tracking expenses](/learn/budgeting/track-expenses-that-stick) — then allocate from what you actually found.',
          },
          {
            kind: 'tool',
            toolId: 'budget',
            text: 'Budget Builder groups your categories against the 50/30/20 targets, which is a useful cross-check on a zero-based allocation: if the groups are badly out of proportion, the detail is hiding a structural problem.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'A budget is not a promise to spend less. It is a division of income into groups you have decided matter differently, checked against what you actually spent. The checking is the entire exercise — a plan nobody compares against reality is a wish with categories.',
      'Most budgets in India fail for a structural reason rather than a behavioural one. The popular frames were calibrated on housing costs far below what Mumbai, Bengaluru or Delhi NCR charge, so a household doing everything right still fails the test on paper and concludes it has a discipline problem. It usually has a rent problem, and those have completely different solutions.',
      'The useful sequence is: measure for a month without changing anything, group what you find, then compare the groups against a frame. Doing it in the other order — picking targets first — produces a budget calibrated to a life you are not currently living.',
    ],
    definitions: [
      {
        term: 'Take-home income',
        definition:
          'What actually reaches your bank account after tax, provident fund and every other deduction. Every budget on this site is built from take-home, never from CTC, because you cannot allocate money you never receive.',
      },
      {
        term: 'Needs, wants and savings',
        definition:
          'The three groups the 50/30/20 frame divides income into. Needs are what you would still pay in a bad month — rent, utilities, groceries, transport to work, insurance premiums, minimum loan repayments. Wants are everything discretionary. Savings covers investments and debt repayment above the minimum.',
      },
      {
        term: 'Savings rate',
        definition:
          'Savings and investments as a percentage of take-home income. It is the single most predictive budget number, because it is the only one that directly determines how fast net worth grows.',
      },
      {
        term: 'Fixed versus variable cost',
        definition:
          'A fixed cost is committed ahead of the month — rent, EMIs, insurance, school fees. A variable cost is decided during it. Budgets are usually attacked on the variable side because it feels controllable, while the fixed side is where the money actually is.',
      },
    ],
    faq: [
      {
        q: 'What is a realistic budget for an Indian salary?',
        a:
          'It depends far more on your city than your salary. The 50/30/20 frame — half to needs, three-tenths to wants, a fifth to savings — is a reasonable starting point outside the top metros. Inside them, rent alone often consumes 30–40% of take-home, so a needs share of 55–60% is structural rather than a failure. The number to hold steady is the savings rate; the split between needs and wants can flex around it.',
      },
      {
        q: 'How long should I track spending before I set a budget?',
        a:
          'One complete month, logged honestly, beats three months of partial logging. You need one full cycle because the expenses people underestimate most — annual insurance, festival spending, a wedding, a medical bill — do not appear in a fortnight. Set targets from what you measured, not from what you hoped to find.',
      },
      {
        q: 'Should I budget before or after paying off debt?',
        a:
          'Together, and in that order of priority: minimum repayments belong in needs, and anything above the minimum belongs in savings. High-interest debt — credit cards at 36–42% a year — outranks every investment decision you could make with the same rupee, because no portfolio reliably returns what a card charges.',
      },
      {
        q: 'What percentage of income should go to rent in India?',
        a:
          'The often-quoted 30% ceiling is an American rule of thumb that does not survive contact with metro Indian rents. A more useful test is whether rent plus every other fixed cost stays under about half of take-home, because that is what leaves room for a savings rate worth having. If it does not, the lever is location, flatmates or income — not a stricter food budget.',
      },
    ],
  },
  articles,
};

export default content;
