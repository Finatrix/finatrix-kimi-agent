/**
 * Editorial copy and article bodies for the Risk & Compliance Careers topic.
 *
 * Written to be durable across regulatory change: the disciplines, the three
 * lines of defence and the shape of the work are stable, while specific rules,
 * thresholds and framework versions are not. Nothing here cites a current
 * regulation by number, because a page that does is wrong the year it changes
 * and stays wrong indefinitely.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'risk-career-paths': {
    summary:
      'Risk splits into three disciplines that share a vocabulary and very little else. Credit risk asks whether a borrower will repay, and the work is analytical and case-based with a portfolio view layered over it. Market risk asks how much a portfolio loses when prices move, and is quantitative, fast and tied to the trading day. Operational risk asks what breaks when a process, a system or a person fails, and is the broadest and least mathematical of the three. Skills transfer partially — the framework, the governance and the language are common — but the daily work is different enough that most people pick one within a couple of years and specialise from there.',
    keyPoints: [
      'Credit, market and operational risk share a governance framework and almost nothing about their day-to-day work.',
      'Credit is case-based and analytical; market is quantitative and same-day; operational is process-wide and judgement-heavy.',
      'The second line challenges the first — the job is to be independent, which makes it a different social position from a business role.',
      'Model risk, climate risk and data roles are the fastest-growing adjacencies and take entrants from all three disciplines.',
    ],
    faq: [
      {
        q: 'Which risk discipline is easiest to enter without experience?',
        a: 'Credit risk and operational risk take more entrants from general backgrounds than market risk does, because they lean on structured judgement and process understanding rather than on quantitative methods. Market risk usually expects a numerate degree and comfort with statistics. Financial crime, which sits alongside these, is the single largest volume entry route into risk functions in most large banks.',
      },
      {
        q: 'Is second-line risk work adversarial?',
        a: 'Independent rather than adversarial, and the distinction is the whole craft of the job. The second line exists to challenge, and doing that well means being consistently reasonable so that a genuine objection carries weight. Someone who objects to everything is ignored; someone who objects to nothing has no function. Most of the skill is in choosing which battles matter.',
      },
      {
        q: 'Do I need a professional qualification?',
        a: 'Rarely to enter, sometimes to progress, and the useful ones are discipline-specific rather than general. What consistently matters more is being able to explain a risk clearly to someone who does not want to hear about it, and to write it down in a way that survives review. Certifications signal commitment; they do not substitute for that skill.',
      },
    ],
    sections: [
      {
        id: 'three-disciplines',
        title: 'The three disciplines',
        blocks: [
          {
            kind: 'table',
            caption: 'What each risk discipline asks, and what the work looks like',
            head: ['Discipline', 'The question', 'Daily work'],
            rows: [
              [
                'Credit risk',
                'Will this borrower repay, and what if they do not?',
                'Case assessment, limit setting, portfolio monitoring, provisioning input',
              ],
              [
                'Market risk',
                'How much does the portfolio lose when prices move?',
                'Limit monitoring, sensitivities, stress scenarios, same-day exception review',
              ],
              [
                'Operational risk',
                'What breaks when a process, system or person fails?',
                'Control assessment, incident review, scenario analysis, framework ownership',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'The rhythms differ as much as the content. Market risk is tied to the trading day and its deadlines are hard. Credit risk moves at the pace of transactions and periodic reviews. Operational risk works in longer cycles punctuated by incidents, which arrive without warning and reorder the week.',
          },
          {
            kind: 'note',
            title: 'The adjacencies are where the growth is',
            text: 'Model risk and validation, climate and sustainability risk, and risk data and analytics have expanded faster than the core disciplines and recruit from all three. They also tend to be more portable, because the methods travel better than the product knowledge does.',
          },
        ],
      },
      {
        id: 'the-independence',
        title: 'What independence actually means day to day',
        blocks: [
          {
            kind: 'p',
            text: 'A second-line role sits outside the business it oversees, and that changes the social position of the job in ways nobody explains on day one. You are in the room, you are affected by the outcome, and you do not own the decision — you own the challenge to it.',
          },
          {
            kind: 'p',
            text: 'Done badly this becomes either rubber-stamping or obstruction, and both are common. Done well it looks like being predictable: the business knows what you will object to, knows you will say so early rather than at the approval meeting, and knows that when you do object it is because something is genuinely wrong. That reputation is the whole asset, and it takes about two years to build and one bad call to spend.',
          },
          {
            kind: 'p',
            text: 'The structure underneath this — first line, second line, third line — is set out in [the divisions of a bank](/learn/banking-careers/banking-divisions), and it is worth understanding before an interview because it is the frame the questions will assume.',
          },
        ],
      },
      {
        id: 'entering',
        title: 'Getting in, and what is actually tested',
        blocks: [
          {
            kind: 'p',
            text: 'Risk interviews test three things, and only the first is what candidates prepare for.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Do you understand the mechanics?** What drives a default, what a limit is for, why a control fails. Covered by the [technical preparation](/learn/technical-interviews/finance-technical-questions) approach — twenty concepts explained properly.',
              '**Can you hold a position under pressure?** You will be asked what you would do if the business disagreed. The answer that scores describes escalating with evidence, not either caving or refusing.',
              '**Can you write?** Risk work is written work — assessments, papers, findings. Some processes include a written exercise; all of them are reading your application as a sample.',
            ],
          },
          {
            kind: 'p',
            text: 'The third one is consistently underrated. A risk professional who cannot make a written case that survives review has a ceiling regardless of technical ability, and interviewers know it — which is why the written stages in these processes are weighted more heavily than candidates expect.',
          },
          {
            kind: 'p',
            text: 'The written work has a recognisable shape worth practising: the conclusion first, then the evidence for it, then what would change the conclusion. Risk papers are read by people who will not reach the end, so a document that builds to its finding buries the only part most readers will see. Leading with the answer is not a stylistic preference in this function; it is what makes a paper usable by a committee working through eleven of them.',
          },
          {
            kind: 'p',
            text: 'The other thing worth knowing before entering is that risk work is cyclical in a way that is easy to misread from outside. Hiring expands after a regulatory change or an incident and flattens between them, and the functions that grow fastest are whichever ones the current cycle is about. That is an argument for building framework skills that transfer between disciplines rather than specialising narrowly in year one, because the discipline in demand when you enter is frequently not the one in demand five years later.',
          },
        ],
      },
    ],
  },

  'compliance-roles': {
    summary:
      'Compliance is three distinct jobs sharing a department name. Advisory compliance answers questions from the business before something happens and is fast, conversational and judgement-based. Monitoring and testing checks after the fact whether what should have happened did, and is methodical, evidence-driven and closest in shape to audit. Regulatory change reads what is coming, works out what it means for the firm, and drives the implementation — the most strategic of the three and the hardest to enter without experience. Most people are much better suited to one than the others, and the label on the job posting frequently does not say which one it is.',
    keyPoints: [
      'Advisory, monitoring and regulatory change are different jobs with different temperaments, all posted as "compliance".',
      'Advisory work is judgement under time pressure with incomplete information; monitoring is evidence and method.',
      'The valuable skill across all three is translating a rule into what someone must actually do differently on Monday.',
      'Financial crime compliance is usually a separate function and the largest single entry route — see the AML topic.',
    ],
    faq: [
      {
        q: 'Is compliance a good long-term career?',
        a: 'It has been a structurally growing function for years and it is unusually portable — the framework skills transfer between firms and between sectors, which is not true of most banking specialisms. The honest counterweight is that it is a cost function, which shapes how it is resourced in a downturn, and that some roles become narrow if you stay in one process too long.',
      },
      {
        q: 'What is the difference between compliance and internal audit?',
        a: 'Compliance is second line: it sets policy, advises the business and monitors adherence, and it is accountable for the framework working. Internal audit is third line: it independently assures both the business and compliance, and reports to the audit committee rather than to management. Auditors examine whether compliance is doing its job, which is why the two are deliberately separate.',
      },
      {
        q: 'Do I need a law degree?',
        a: 'No, and most compliance professionals do not have one. It helps in regulatory change and in interpretation-heavy roles. What matters more broadly is the ability to read a rule, work out what it requires in practice, and explain that to someone who has a deadline and no interest in the rule — a skill that is closer to translation than to law.',
      },
    ],
    sections: [
      {
        id: 'three-jobs',
        title: 'Three jobs, one department name',
        blocks: [
          {
            kind: 'table',
            caption: 'The three compliance disciplines',
            head: ['Discipline', 'When it acts', 'Suits someone who'],
            rows: [
              [
                'Advisory',
                'Before — the business asks, you answer',
                'Decides quickly with incomplete information and is comfortable being wrong occasionally',
              ],
              [
                'Monitoring and testing',
                'After — you check what happened',
                'Is methodical, evidence-driven, and untroubled by delivering unwelcome findings',
              ],
              [
                'Regulatory change',
                'Ahead — you read what is coming',
                'Reads closely, thinks in programmes, and can drive work across functions',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'The temperaments genuinely differ. Someone who needs to be certain before answering finds advisory work uncomfortable, because the business needs an answer this afternoon and the perfect one arrives on Friday. Someone who prefers momentum finds monitoring slow. Neither is a deficiency, but a mismatch makes for a long two years.',
          },
        ],
      },
      {
        id: 'the-core-skill',
        title: 'The skill that carries all three',
        blocks: [
          {
            kind: 'p',
            text: 'Rules are written to be precise and complete. Nobody in the business has time to read one, and if they did they would still need to know what to do differently. The core compliance skill is closing that gap: turning an obligation into a specific instruction that a person with a deadline can act on.',
          },
          {
            kind: 'worked',
            title: 'The same obligation, at three levels of usefulness',
            rows: [
              {
                label: 'The rule, restated',
                value: 'The firm must ensure adequate records are maintained of client communications.',
              },
              {
                label: 'A better version',
                value: 'Client conversations that affect an order need to be recorded and kept.',
              },
              {
                label: 'The useful version',
                value: 'If a client changes an instruction by phone, log it in the system before you act on it — same call, not end of day.',
              },
            ],
            conclusion:
              'All three are accurate. Only the third one changes what anybody does, and producing the third consistently is what distinguishes a compliance professional from a person who has read the handbook.',
          },
        ],
      },
      {
        id: 'entering',
        title: 'Routes in',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Financial crime.** The largest entry route by volume in most large banks, and a genuine foundation — the frameworks and escalation habits transfer directly. See [what an AML analyst does](/learn/aml-financial-crime/aml-analyst-role).',
              '**From the business.** Someone who has worked in operations, onboarding or a product area brings knowledge of how the process actually runs, which is scarce and valued in monitoring and advisory work alike.',
              '**Monitoring and testing.** Often the most accessible of the three directly, because the work is methodical and can be learned on structured cases with supervision.',
              '**Graduate programmes.** Several large banks run risk-and-compliance streams that rotate across the disciplines, which solves the choosing problem — see [graduate programmes](/learn/graduate-programs/graduate-timeline).',
            ],
          },
          {
            kind: 'warning',
            title: 'Read the posting for which job it is',
            text: 'A "Compliance Analyst" advertisement may describe any of the three, and the title rarely distinguishes them. Look for the verbs: advise and support means advisory; test, sample and review means monitoring; assess impact and implement means regulatory change. Asking which one it is at interview is a good question rather than an ignorant one.',
          },
          {
            kind: 'p',
            text: 'One further thing to establish before accepting a compliance role is how the function is positioned internally, because it varies enormously between firms and it determines what the job feels like day to day. In some organisations compliance is consulted early and its view carries weight; in others it is asked to sign off on decisions already taken, which is a materially worse job with the same title.',
            },
          {
            kind: 'p',
            text: 'It is a difficult thing to ask about directly, and there are two questions that get at it obliquely. "At what point in a product decision does compliance usually get involved?" — early is a good sign, at approval is not. And "when was the last time compliance changed the shape of something?" A team that cannot produce an example has an answer, whether or not anyone says it.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Risk and compliance are the functions that grow when regulation grows, which over the past two decades has been most of the time. They are also the functions most often applied to without a clear picture of what the daily work involves, partly because the job titles are unusually uninformative — "Risk Analyst" and "Compliance Analyst" each describe at least three genuinely different jobs.',
      'The structural fact underneath both is the three lines of defence. A first-line role owns the risk it takes; a second-line role independently oversees it; a third-line role assures both. Sitting in the second line changes the job in a way that is rarely explained: you are in the room and affected by the decision, but you own the challenge to it rather than the decision itself.',
      'These guides describe the disciplines and how they differ rather than any current rule. Specific regulations change, and a page that anchors itself to one is wrong the year it is amended and misleading for years afterwards.',
    ],
    definitions: [
      {
        term: 'Three lines of defence',
        definition:
          'The standard governance model: the business owns and manages its risk (first line), risk and compliance independently oversee and challenge (second line), internal audit assures both (third line). Which line a role sits in determines its accountabilities and its relationship to the business.',
      },
      {
        term: 'Risk appetite',
        definition:
          'The amount and type of risk a firm has decided it is willing to accept, set at board level and expressed through limits. Most second-line work is ultimately about whether an activity sits inside it, and about escalating clearly when something does not.',
      },
      {
        term: 'Inherent and residual risk',
        definition:
          'Inherent risk is the exposure before controls; residual is what remains after them. The gap between the two is the measure of what the controls actually achieve, and quantifying it honestly is most of operational risk assessment.',
      },
      {
        term: 'Regulatory change',
        definition:
          'The discipline of tracking incoming rules, assessing what they require of the firm, and driving the implementation. The most strategic of the compliance functions, the hardest to enter directly, and the one most dependent on writing clearly.',
      },
    ],
    faq: [
      {
        q: 'What is the difference between risk and compliance?',
        a: 'Risk is concerned with exposures the firm takes on — credit, market, operational — and whether they sit within appetite. Compliance is concerned with obligations the firm is under, whether from regulation, law or its own policy. They overlap in governance and in financial crime, and in smaller firms they are frequently one team, but the underlying questions are different: how much could we lose, versus what are we required to do.',
      },
      {
        q: 'Are these good careers for someone changing fields?',
        a: 'Among the better ones in financial services, because the entry roles teach a framework rather than assuming years of product knowledge, and because financial crime provides a high-volume route in. Prior experience in a process-heavy environment transfers well. What does not transfer is an expectation of autonomy early — these are functions where the framework and the escalation path come first.',
      },
      {
        q: 'Will automation reduce the number of these jobs?',
        a: 'It has already changed their shape. Monitoring, alert triage and evidence collection are increasingly automated, which reduces routine volume and raises the proportion of work that is judgement, investigation and challenge. The roles most exposed are the ones that are purely procedural; the ones that involve deciding what a rule means, or arguing a position with the business, are not close to automatable.',
      },
      {
        q: 'How do these roles differ in a smaller firm?',
        a: 'Considerably broader and less specialised. A single compliance officer at a small firm covers advisory, monitoring, regulatory change and often financial crime, reporting directly to senior management. That means faster exposure and more visibility, at the cost of the structured training and specialist depth a large firm provides. Both are legitimate starts and they suit different people.',
      },
    ],
  },
  articles,
};

export default content;
