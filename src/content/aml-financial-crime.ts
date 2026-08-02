/**
 * Editorial copy and article bodies for the AML & Financial Crime Careers topic.
 *
 * Two editorial rules apply here more strictly than elsewhere. First, nothing on
 * this page describes how to evade detection — the content is about the career,
 * not about the typologies, and the level of detail is what a candidate needs to
 * decide whether to apply. Second, no certification is presented as required
 * when it is not; the certification market for financial crime is crowded and
 * sells hard, and an honest page says where a qualification helps and where it
 * is simply a purchase.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'aml-analyst-role': {
    summary:
      'An AML function is four teams doing different jobs. Transaction monitoring reviews alerts raised by the bank\'s detection systems and decides which need investigating. KYC and client due diligence establishes and refreshes who customers are and what they do. Sanctions screening checks names and payments against restricted lists and clears the matches that are not real. Investigations takes the escalations, builds the case, and produces the report that goes to the authorities. Transaction monitoring and KYC take the most entrants, are learnable on the job, and are the largest single entry route into risk and compliance in most large banks — which is why this is the door most career changers come through.',
    keyPoints: [
      'Four functions — monitoring, KYC, sanctions, investigations — with different rhythms and different skills.',
      'Most alerts are not suspicious, and the daily skill is distinguishing unusual from suspicious without over-escalating.',
      'The written case is the product: an investigation that cannot be read and followed has not been completed.',
      'Volume roles are the entry point; the progression is toward investigation, quality assurance, tuning and advisory.',
    ],
    faq: [
      {
        q: 'What does an AML analyst do all day?',
        a: 'In a monitoring role: works a queue of alerts, each flagging activity that met a rule. For each one you review the customer, the account history and the payment context, decide whether the activity is explicable, and either close it with a written rationale or escalate it. Volume is real and the closing rationale is the part that is quality-assured — a correct decision recorded badly counts as a defect in most teams.',
      },
      {
        q: 'Is it repetitive work?',
        a: 'Parts of it, honestly, yes — particularly in high-volume monitoring and in periodic KYC refresh. The work becomes considerably more varied at the investigation stage, and in tuning and quality assurance roles. Most people spend twelve to twenty-four months in a volume role before moving, and the ones who move fastest are those who noticed a pattern in the queue and said so.',
      },
      {
        q: 'Do I need financial services experience to start?',
        a: 'No. These teams recruit widely from graduates and career changers precisely because the domain is taught internally and the underlying skills — careful reading, consistent judgement, clear written reasoning — are not finance-specific. Backgrounds in law enforcement, audit, journalism, research and customer operations all transfer well.',
      },
    ],
    sections: [
      {
        id: 'four-functions',
        title: 'The four functions',
        blocks: [
          {
            kind: 'table',
            caption: 'What each team does, and where entrants usually start',
            head: ['Function', 'The work', 'Entry level?'],
            rows: [
              [
                'Transaction monitoring',
                'Review system-generated alerts; close with rationale or escalate',
                'Yes — the largest entry route',
              ],
              [
                'KYC / client due diligence',
                'Establish and periodically refresh who a customer is and what they do',
                'Yes — high volume, structured',
              ],
              [
                'Sanctions screening',
                'Clear name and payment matches against restricted lists; escalate true matches',
                'Sometimes — often needs prior exposure',
              ],
              [
                'Investigations',
                'Build the case on escalated matters and produce the regulatory report',
                'Rarely direct — usually a progression',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'The four are usually separate teams with separate managers, even though the work flows between them. Which one you join shapes the first two years considerably, and it is worth establishing at interview which queue the role actually sits on.',
          },
        ],
      },
      {
        id: 'the-real-skill',
        title: 'Unusual is not suspicious',
        blocks: [
          {
            kind: 'p',
            text: 'Detection systems raise alerts on patterns, and most patterns have ordinary explanations. A customer whose account activity jumps sharply may have sold a property, received a bonus, or started a business. The analyst\'s job is not to find wrongdoing in every alert; it is to determine whether an explanation consistent with what the bank knows about the customer exists.',
          },
          {
            kind: 'p',
            text: 'Both failure directions are real. Escalating everything makes the queue unworkable and buries the genuine cases; closing everything defeats the control. What separates a good analyst is the ability to be consistent about where that line sits, and to write down the reasoning so a reviewer can agree or disagree with it on the evidence rather than on the conclusion.',
          },
          {
            kind: 'note',
            title: 'The written rationale is the deliverable',
            text: 'The decision takes a few minutes; the record of why is what is quality-assured, what a regulator may read years later, and what determines whether you are promoted. Analysts who treat the write-up as administrative overhead plateau in the queue.',
          },
        ],
      },
      {
        id: 'progression',
        title: 'Where it leads',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Investigations.** Complex cases end to end, with the regulatory report as the output. The natural next step from monitoring and the point at which the work stops being queue-shaped.',
              '**Quality assurance.** Reviewing other analysts\' decisions and rationales. Develops the judgement fastest, because you see the full distribution of how a case can be handled.',
              '**Tuning and analytics.** Working on the rules and thresholds that generate the alerts in the first place. Analytical, closer to data work, and much less crowded.',
              '**Advisory and framework.** Policy, risk assessment and advising the business — the bridge into broader [compliance roles](/learn/risk-compliance-careers/compliance-roles).',
            ],
          },
          {
            kind: 'p',
            text: 'The move that opens most of these is the same one: noticing something structural in the queue — a rule producing false positives, a customer segment consistently misclassified — and writing it up. That is the observable difference between someone working the alerts and someone thinking about them.',
          },
          {
            kind: 'p',
            text: 'Two practical things make that observation possible rather than lucky. Keep a private note of patterns you notice, dated, over a few weeks — a single odd alert is an anecdote and twenty of the same shape is a finding. And learn what the rule that generated your alerts is actually looking for, which is usually documented internally and almost never read by the people working its output. An analyst who can say "this rule fires on X and roughly a third of those are the same benign pattern" is describing something the tuning team can act on.',
          },
          {
            kind: 'p',
            text: 'The pace is worth setting expectations about. The first three months are almost entirely learning the systems, the customer types and the internal escalation language, and it is normal to feel slow. Productivity in these roles is measured on quality-assured decisions rather than raw volume, and the analysts who last are the ones who resist the temptation to speed up before the judgement is reliable — because a fast analyst with an inconsistent record generates more rework than they save.',
          },
        ],
      },
    ],
  },

  'aml-certifications': {
    summary:
      'Financial crime certifications are useful at specific career moments and oversold at every other one. Before your first role, a recognised entry-level qualification demonstrates seriousness to an employer who is looking at a resume with no relevant experience — that is a real effect and it is the strongest case for buying one. Once you are in a team, employers care overwhelmingly more about the quality of your case work than about additional letters, and a second certification at year two typically changes nothing. The exception is a move into a specialism — sanctions, fraud, investigations — where a targeted qualification signals a genuine change of direction that your case history does not yet evidence.',
    keyPoints: [
      'A certification is worth most when you have no experience, because it is the only credible signal available to you.',
      'Once you have twelve months of case work, that record outweighs any additional qualification an employer is choosing between.',
      'Employers frequently fund the recognised qualifications, so paying yourself before you have asked is often unnecessary.',
      'A targeted certification when changing specialism is defensible; collecting a third general one is not.',
    ],
    faq: [
      {
        q: 'Which certification should I get first?',
        a: 'The one your target employers actually name in their job postings, which is the only reliable guide and varies by market. Search a dozen relevant vacancies and count the mentions. Anything appearing in most of them is worth having; anything appearing in none is a purchase, however well marketed. Check the entry-level tier rather than the flagship — the advanced ones usually require experience you do not yet have.',
      },
      {
        q: 'Will my employer pay for it?',
        a: 'Frequently, yes — financial crime training budgets exist in most large banks because regulators expect demonstrable competence. Ask before you buy, including at offer stage where it is a normal thing to raise. Paying several hundred pounds or thousands of rupees for something your employer would have funded three months later is the most common avoidable cost in this field.',
      },
      {
        q: 'Is a certification better than a master\'s degree?',
        a: 'For entering an operational financial crime role, generally yes — it is faster, far cheaper, and more specifically recognised by the teams doing the hiring. A postgraduate degree makes more sense if you are targeting policy, analytics or a regulator, or if you need it for visa or credential-recognition reasons in a new market.',
      },
    ],
    sections: [
      {
        id: 'when-it-helps',
        title: 'The three moments a certification pays',
        blocks: [
          {
            kind: 'table',
            caption: 'Return on a financial crime certification, by career stage',
            head: ['Stage', 'Worth it?', 'Why'],
            rows: [
              [
                'No experience, applying for a first role',
                'Yes',
                'It is the only credible signal you have; it separates you from applicants with none',
              ],
              [
                'One to three years in a team',
                'Rarely',
                'Your case record is a stronger signal; another certificate adds little',
              ],
              [
                'Moving into a specialism',
                'Often',
                'Signals a deliberate direction your current case history does not evidence',
              ],
              [
                'Senior, moving into leadership',
                'Sometimes',
                'A recognised advanced qualification is expected in some markets and functions',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'The pattern is that certifications substitute for evidence. When you have none they are valuable; when you have a year of quality-assured case work they are largely redundant, because the employer can assess the thing itself rather than a proxy for it.',
          },
        ],
      },
      {
        id: 'choosing',
        title: 'Choosing one without being sold one',
        blocks: [
          {
            kind: 'p',
            text: 'The financial crime training market is large and markets hard, and the volume of advertising for a qualification is uncorrelated with how often employers ask for it. One method settles the question.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              'Collect a dozen job postings in your target market and function — the ones you would actually apply to.',
              'Count how many name a specific qualification, and which. Note whether it is "required" or "desirable".',
              'Check whether the entry tier has an experience prerequisite. Several advanced ones do, which makes them unavailable to you now regardless.',
              'Ask two people already in the role whether it changed anything for them. [Informational interviews](/learn/networking/informational-interviews) exist for exactly this kind of question.',
              'Only then look at price. A qualification nobody asks for is expensive at any price.',
            ],
          },
          {
            kind: 'warning',
            title: 'Renewal costs are the part nobody mentions',
            text: 'Most professional certifications require annual maintenance — a fee, continuing education hours, or both. Two or three certifications means a recurring annual cost and an ongoing training obligation, indefinitely. Factor the renewal into the decision, not just the exam.',
          },
        ],
      },
      {
        id: 'what-beats-it',
        title: 'What employers weigh more heavily',
        blocks: [
          {
            kind: 'p',
            text: 'Ask anyone who hires into these teams what separates candidates and the certification is rarely the first answer. Three things come up consistently instead.',
          },
          {
            kind: 'list',
            items: [
              '**Quality of written reasoning.** Can you explain why you closed a case in a way a reviewer can follow and challenge? This is testable at interview and frequently is.',
              '**Consistency of judgement.** Two similar cases handled the same way. Erratic decisions are more damaging than conservative ones, because they cannot be relied on.',
              '**Curiosity about the system.** Noticing that a rule is producing noise, and being able to say why. This is what distinguishes progression from tenure.',
            ],
          },
          {
            kind: 'p',
            text: 'None of the three is certified by anything. All three can be evidenced in an interview by someone who has thought about their own case work, which is why the [evidence bank](/learn/interview-preparation/preparation-system) habit matters more here than another set of letters.',
          },
          {
            kind: 'p',
            text: 'For someone with no experience at all, there is a cheaper signal than a certification and it is frequently more persuasive: demonstrable familiarity with how the controls actually work. Being able to explain, in an interview, why a monitoring rule generates false positives, what a due-diligence refresh is for, or why sanctions screening produces so many name matches shows understanding that a multiple-choice exam does not. Public regulatory and supervisory material is free, and reading a few enforcement notices teaches more about what these teams exist to prevent than most syllabi do.',
          },
          {
            kind: 'p',
            text: 'If you do take a qualification, take the exam and then use it. A certification listed on a resume with nothing said about it in the interview is a line item; the same certification used to answer a question about why a control failed is evidence. The value was never in holding it — it is in being able to reason with what it taught you, which is the thing being assessed.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Financial crime is the largest entry-level hiring pool in banking and the least understood from outside it. Anti-money-laundering, sanctions, fraud and investigations teams have grown steadily for two decades, they recruit widely from non-finance backgrounds, and they teach the domain internally — which makes them one of the most accessible genuine routes into financial services.',
      'The work is a queue with judgement in it. Detection systems raise alerts, and someone has to decide which are explicable and which are not, then write down the reasoning well enough that a reviewer, an auditor or a regulator can follow it years later. That last part is the actual craft, and it is the part most job descriptions understate.',
      'This topic covers what the teams do and how the qualifications market works. It deliberately does not go into typologies or detection thresholds in detail: the level of description useful for choosing a career is different from the level useful for evading one, and only the first belongs on a public page.',
    ],
    definitions: [
      {
        term: 'AML (anti-money laundering)',
        definition:
          'The set of controls a regulated firm operates to detect and prevent the movement of criminal proceeds through it — customer due diligence, transaction monitoring, screening, investigation and reporting. In practice it names both the obligation and the department that discharges it.',
      },
      {
        term: 'KYC (know your customer)',
        definition:
          'Establishing and periodically re-establishing who a customer is, what they do, and whether their activity is consistent with that. The foundation the other controls rest on: monitoring cannot tell unusual from expected without a picture of what expected looks like.',
      },
      {
        term: 'Transaction monitoring',
        definition:
          'Automated review of activity against rules and models that raise alerts for human assessment. Analysts work the resulting queue, deciding which alerts have an explanation consistent with what is known about the customer and which require escalation.',
      },
      {
        term: 'Alert disposition',
        definition:
          'The decision recorded against an alert — closed with rationale, or escalated — together with the written reasoning. The reasoning is the assessed output: a correct decision recorded poorly is treated as a defect in most quality frameworks.',
      },
    ],
    faq: [
      {
        q: 'Is financial crime a good way into banking?',
        a: 'It is one of the most reliable, particularly for career changers and non-finance graduates. The teams are large, they hire continuously, the domain is taught rather than assumed, and the framework skills transfer into broader compliance, risk and audit roles afterwards. The trade is that entry roles are high-volume and structured, which suits some people considerably more than others.',
      },
      {
        q: 'What backgrounds transfer well?',
        a: 'Anything involving careful reading and consistent judgement recorded in writing: law enforcement, audit, legal support, research, journalism, insurance claims, customer operations. Language skills are genuinely valuable in screening and investigation roles. A finance degree is not a requirement and is not, on its own, much of an advantage.',
      },
      {
        q: 'How much does it pay compared with other entry routes?',
        a: 'Entry-level financial crime roles generally sit below front-office graduate salaries and broadly in line with other operational and control functions, varying widely by market and employer. The stronger argument for the route is not the starting number but the optionality: the skills open compliance, risk, audit and investigation paths, several of which converge with better-paid tracks by year five.',
      },
      {
        q: 'Will automation eliminate these jobs?',
        a: 'It is reshaping them rather than removing them. Better models reduce false positives, which cuts routine alert volume — and simultaneously raises the proportion of remaining work that requires judgement, investigation and written reasoning. The roles most exposed are purely procedural ones; tuning, investigations and advisory work have grown as automation has advanced.',
      },
    ],
  },
  articles,
};

export default content;
