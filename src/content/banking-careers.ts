/**
 * Editorial copy and article bodies for the Banking Careers topic.
 *
 * Structural rather than comparative: what each division does and how the ladder
 * works, not which employer is best or what any of them pays. Compensation
 * figures date within a year and vary by market, desk and cycle far more than by
 * brand, so quoting them would be the least reliable thing on the page.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'banking-divisions': {
    summary:
      'A bank is not one employer. Retail, business and corporate banking, markets, investment banking, wealth, operations, technology, finance and risk are separate businesses with different customers, different rhythms and almost no overlap in daily work — and the difference between two divisions at the same bank is far larger than the difference between the same division at two banks. Choosing the division is therefore the decision that matters, and it is the one most applicants make last. The useful sorting questions are who the customer is, whether the work is transactional or advisory, and whether the role sits in the first, second or third line of defence.',
    keyPoints: [
      'The gap between two divisions at one bank is much wider than the gap between the same division at two banks — choose the division first.',
      'Every role has an identifiable customer, internal or external, and that customer determines the rhythm of the job more than the job title does.',
      'The three lines of defence — business, oversight, audit — cut across all divisions and change what "good" means in a role.',
      'Capability and shared-service centres do genuine end-to-end work, not just processing, and are one of the largest entry routes into global banks.',
    ],
    faq: [
      {
        q: 'What is the difference between corporate banking and investment banking?',
        a: 'Corporate banking provides ongoing banking services to companies — lending, cash management, trade finance, working capital — and the relationship is continuous. Investment banking advises on discrete transactions such as raising capital or acquisitions, and the relationship is deal-shaped. The rhythms differ accordingly: corporate banking is portfolio work with recurring reviews, investment banking is intense around a transaction and quieter between them.',
      },
      {
        q: 'Are operations and technology roles a way into front-office work?',
        a: 'Sometimes, and less automatically than people hope. Internal moves happen and are more common where the two functions sit close to each other — product control into markets, a technology role on a trading platform into the desk it serves. What does not work is treating any back-office role as a waiting room; the moves that happen are made by people who built specific, relevant skill and a network inside the business.',
      },
      {
        q: 'What does a capability or global service centre actually do?',
        a: 'Increasingly, the whole function rather than a slice of it. Several large international banks run substantial centres in India and elsewhere covering risk analytics, financial crime, technology, finance and reporting end to end, reporting into the global function rather than to a local branch. It is one of the largest entry routes into a global bank, and the work in a mature centre is often indistinguishable from the equivalent role in a headquarters.',
      },
    ],
    sections: [
      {
        id: 'the-divisions',
        title: 'The divisions, and who each one serves',
        blocks: [
          {
            kind: 'table',
            caption: 'What each division does, and its customer',
            head: ['Division', 'Customer', 'The work'],
            rows: [
              ['Retail banking', 'Individuals', 'Accounts, cards, mortgages, personal lending, branches and digital channels'],
              ['Business / SME banking', 'Small and mid-sized firms', 'Working capital, term lending, transaction accounts, relationship management'],
              ['Corporate banking', 'Large companies', 'Credit facilities, cash management, trade finance, ongoing relationship coverage'],
              ['Investment banking', 'Corporates and investors', 'Advisory on transactions: capital raising, mergers, restructuring'],
              ['Markets', 'Institutional clients', 'Pricing, trading and hedging instruments; sales, trading and structuring'],
              ['Wealth / private banking', 'High-net-worth individuals', 'Investment advice, portfolio construction, planning'],
              ['Operations', 'The rest of the bank', 'Settlement, payments, onboarding, reconciliation, servicing'],
              ['Technology', 'The rest of the bank', 'Platforms, data, engineering, change delivery'],
              ['Risk and compliance', 'The bank and its regulator', 'Independent oversight of what the business is doing'],
            ],
          },
          {
            kind: 'p',
            text: 'Two roles from different rows share an employer, a building and very little else. Someone deciding between divisions is choosing a career, whereas someone deciding between two banks in the same division is choosing an employer — a much smaller decision, and one that is easier to change later.',
          },
        ],
      },
      {
        id: 'three-lines',
        title: 'The three lines of defence, and why they change the job',
        blocks: [
          {
            kind: 'p',
            text: 'Cutting across every division is a structure that determines what a role is accountable for, and it explains far more about day-to-day work than the division name does.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              '**First line — the business.** Owns the risk it takes. A relationship manager, a trader, an operations team. Measured on outcomes and on managing their own controls.',
              '**Second line — risk and compliance.** Independent oversight. Sets appetite and policy, challenges the first line, approves or declines. Measured on whether the framework holds.',
              '**Third line — internal audit.** Independent assurance over both. Measured on whether it finds what the other two missed.',
            ],
          },
          {
            kind: 'p',
            text: 'The same subject matter feels entirely different across the three. A credit analyst in the first line is building a case for a facility; a credit risk analyst in the second is testing whether the case holds; an auditor in the third is checking whether the process that produced both was followed. [Risk career paths](/learn/risk-compliance-careers/risk-career-paths) goes further into the second-line disciplines.',
          },
          {
            kind: 'note',
            title: 'The question that sorts most people',
            text: 'Would you rather originate something and be accountable for the outcome, or examine something and be accountable for the judgement? Almost nobody is genuinely indifferent, and the answer points at a line of defence more reliably than any interest in a product does.',
          },
        ],
      },
      {
        id: 'choosing',
        title: 'Choosing a division without a rotation',
        blocks: [
          {
            kind: 'p',
            text: 'Graduate programmes that rotate you through several divisions solve this problem for you. Most direct-entry roles do not, so the choice has to be made from outside with limited information.',
          },
          {
            kind: 'list',
            items: [
              '**Rhythm.** Deal-shaped work has peaks and troughs; portfolio work is steadier with hard month-end and quarter-end points; markets work is bounded by the trading day. These are lifestyle differences that persist for decades.',
              '**Unit of work.** A transaction, a client relationship, a portfolio, a control, a platform. Which of those you would rather be judged on is a more useful question than which product interests you.',
              '**Who you spend the day with.** External clients, internal stakeholders, a desk, or largely your own analysis. This varies more between divisions than almost anything else.',
              '**Where it leads.** Some divisions have wide exits and some are specialised. Worth knowing before you enter, not after — [the first ten years](/learn/banking-careers/first-ten-years) sets out the usual paths.',
            ],
          },
          {
            kind: 'p',
            text: 'The cheapest way to answer any of these is to ask someone doing the job. Twenty minutes with a person in the division tells you more than a week of reading, and [informational interviews](/learn/networking/informational-interviews) covers how to arrange one without knowing anybody.',
          },
        ],
      },
    ],
  },

  'first-ten-years': {
    summary:
      'A banking career\'s first decade follows a recognisable shape: two to three years as an analyst doing the production work, two to three as an associate owning pieces of it and checking others, then a step to manager or vice president where the job changes character entirely from doing to coordinating. The transition people find hardest is the third one, because everything that made them successful as an analyst — being fast, thorough and self-sufficient — stops being the thing they are measured on. Two exit points recur: around year three, when the analyst work is mastered and the next step is visible, and around year six or seven, when the shift away from technical work becomes unavoidable.',
    keyPoints: [
      'The analyst-to-associate step is an increase in scope; the associate-to-VP step is a change in what the job is.',
      'Being excellent at production work does not prepare you for coordinating it, and no employer teaches the difference explicitly.',
      'Year three and year six are the two points where most people move divisions, employers or out of banking entirely.',
      'Specialist tracks exist in most banks and are a legitimate destination rather than a failure to be promoted.',
    ],
    faq: [
      {
        q: 'How long does each stage usually take?',
        a: 'Two to three years at analyst level and two to three at associate is the common shape, with wide variation by division and by market conditions. Faster is possible in a growing team and slower is normal in a flat one. Time in role is a weaker signal than people assume; what actually gates the next step is whether there is scope available for you to own.',
      },
      {
        q: 'Is it a problem to change divisions after two years?',
        a: 'No, and it is common. Two years is long enough to have learned the first division properly, which is what makes you useful in the second. Moving every twelve months is a different pattern and does read as unsettled. The move is easiest within the same bank, where your record is known and internal mobility is usually encouraged.',
      },
      {
        q: 'What if I do not want to manage people?',
        a: 'Most large banks have a specialist or individual-contributor track — quantitative roles, model validation, structuring, technical risk, credit specialists — where progression continues without a team. It is worth identifying whether your employer genuinely has one before the question becomes urgent, because in some functions the only route upward is management and finding that out at year seven is expensive.',
      },
    ],
    sections: [
      {
        id: 'the-ladder',
        title: 'What changes at each step',
        blocks: [
          {
            kind: 'table',
            caption: 'The first decade, and what is actually being measured',
            head: ['Stage', 'Typical years', 'Measured on'],
            rows: [
              ['Analyst', '0–3', 'Accuracy, speed, reliability of your own output'],
              ['Associate', '3–6', 'Owning a workstream and checking others\' work'],
              ['Manager / VP', '6–9', 'Coordinating people and outcomes you do not produce yourself'],
              ['Senior manager / Director', '9+', 'Judgement on what should be done, and relationships'],
            ],
            note: 'Titles vary considerably between banks and between divisions. The progression of what is measured is more stable than the labels.',
          },
          {
            kind: 'p',
            text: 'Reading down the right-hand column shows the discontinuity. The first two rows are the same job with more scope. The third is a different job, and it is the one where people who were excellent at the first two frequently struggle.',
          },
        ],
      },
      {
        id: 'the-hard-transition',
        title: 'The transition nobody prepares you for',
        blocks: [
          {
            kind: 'p',
            text: 'An analyst succeeds by being fast, careful and self-sufficient. A manager who is still fast, careful and self-sufficient has a team producing worse work than they would produce alone, and no time to do anything else.',
          },
          {
            kind: 'p',
            text: 'What changes: your output is now other people\'s output, you are accountable for work you did not check line by line, and the highest-value thing you do in a day is often a fifteen-minute conversation rather than anything you produced. The instinct to take the difficult piece back and do it yourself is the specific failure mode, and it is nearly universal.',
          },
          {
            kind: 'warning',
            title: 'Start before the promotion',
            text: 'The transition is far easier if you have already reviewed someone\'s work, explained why something was wrong, and had a piece of work depend on someone else\'s output while your name stayed on it. All three are available as an associate. Nobody will assign them to you.',
          },
        ],
      },
      {
        id: 'exit-points',
        title: 'The two points where people move',
        blocks: [
          {
            kind: 'p',
            text: 'Movement out of a role clusters at two predictable moments, and knowing they are coming is more useful than treating either as a crisis.',
          },
          {
            kind: 'list',
            items: [
              '**Around year three.** The analyst work is mastered, the next step is visible, and its shape is now known rather than imagined. This is when people move divisions, move to a competitor for a step up, or leave for [consulting](/learn/consulting-careers/consulting-ladder), industry or further study. It is the cheapest time to change direction, because the skills are still general.',
              '**Around year six or seven.** The shift from technical to coordination work becomes unavoidable, and some people discover they do not want it. Moves here go toward specialist tracks, toward smaller organisations where senior roles stay hands-on, or out of banking to a role where the technical work continues.',
            ],
          },
          {
            kind: 'p',
            text: 'Neither is a failure, and both are considerably easier if the groundwork exists: an evidence bank kept current, a network built before it was needed, and a clear view of what a package is actually worth — see [comparing two offers](/learn/salary-negotiation/evaluating-a-package).',
          },
          {
            kind: 'p',
            text: 'Two things make either move considerably easier, and both have to be built before you need them. An evidence bank kept current, so that a conversation which arrives unexpectedly does not require reconstructing three years of work from memory. And a network built while you did not want anything, because a first approach made in the same month you started looking is read for exactly what it is.',
          },
          {
            kind: 'p',
            text: 'Internal moves deserve more attention than they get. Moving division within the same bank is usually the lowest-friction change available — your record is known, your access is already in place, and most large banks actively encourage internal mobility because it is cheaper than external hiring. It is also the move people are most reluctant to explore, because raising it feels like announcing dissatisfaction. In practice a conversation with a manager in another division is normal, expected, and frequently the fastest route to a genuinely different job.',
          },
          {
            kind: 'tool',
            toolId: 'lifemap',
            text: 'LifeMap projects how a career-path decision at year three compounds across the following decades — useful for comparing two directions rather than for predicting either.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'The most consequential decision in a banking career is usually made with the least information: which division to join. A bank is a dozen distinct businesses sharing a brand and a building, and the daily work of a corporate credit analyst has almost nothing in common with that of a markets structurer, an operations lead or a compliance advisory manager.',
      'Applicants tend to choose the employer first and the division second, which is the wrong order. Moving between banks within a division is straightforward at almost any stage. Moving between divisions gets harder each year, because the skills specialise and the network you have built is inside one of them.',
      'The other structure worth understanding before applying is the three lines of defence. Whether a role sits in the business, in independent oversight, or in audit determines what it is accountable for and what "doing it well" means — and that distinction cuts across every division on the org chart.',
    ],
    definitions: [
      {
        term: 'Front, middle and back office',
        definition:
          'An informal split: front office generates revenue directly, middle office manages risk and control around it, back office processes and settles. Increasingly unhelpful as a description of modern banks, where technology and analytics roles sit across all three, but still used in conversation and in hiring.',
      },
      {
        term: 'Three lines of defence',
        definition:
          'The governance structure that separates the business taking risk (first line), independent risk and compliance oversight (second line), and internal audit assurance over both (third line). Which line a role sits in changes its accountabilities more than which division it belongs to.',
      },
      {
        term: 'Capability or global service centre',
        definition:
          'A large offshore or nearshore site running whole functions for a global bank — risk analytics, financial crime, technology, finance — reporting into the global function rather than a local business. A major entry route into international banks, and in mature centres the work matches the equivalent headquarters role.',
      },
      {
        term: 'Individual contributor track',
        definition:
          'A progression route that increases seniority without adding people management, common in quantitative, model validation, structuring and specialist credit roles. Whether one genuinely exists in a given function is worth establishing early rather than at the point it becomes the only acceptable option.',
      },
    ],
    faq: [
      {
        q: 'Which banking division should I apply to?',
        a: 'Start from three questions rather than from product interest: who the customer is, whether you would rather originate work or examine it, and what rhythm you want — deal-shaped peaks, steady portfolio work, or the bounded trading day. Those sort candidates more reliably than an interest in a product, and they describe differences that persist across an entire career.',
      },
      {
        q: 'Do I need a finance degree to work in banking?',
        a: 'For most divisions, no. Risk, operations, technology, financial crime and much of corporate banking hire from a wide range of backgrounds and teach the domain. It matters most in quantitative markets roles and in some investment banking teams. What is consistently required is comfort with numbers and the ability to reason about them out loud — which is a different thing from a specific qualification.',
      },
      {
        q: 'Is it better to start at a large bank or a small one?',
        a: 'A large bank offers structured training, a recognisable name and internal mobility; a smaller one offers broader scope earlier and more visibility to senior people. Neither dominates. The genuine risk at a large bank is spending three years on a narrow slice of a process; the genuine risk at a small one is that the training is whatever you work out yourself.',
      },
      {
        q: 'How much does the bank\'s brand matter later?',
        a: 'Early on it opens doors, particularly for a first move. After about five years what you have actually done matters considerably more, and a specific, well-evidenced track record at a mid-sized firm travels better than a vague one at a famous employer. Brand is most valuable exactly when you have least else to show, which is also when it is hardest to obtain.',
      },
    ],
  },
  articles,
};

export default content;
