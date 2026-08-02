/**
 * Editorial copy and article bodies for the International Students topic.
 *
 * Immigration rules differ by country, change frequently and carry real
 * consequences when they are got wrong. So this topic contains NO visa rules,
 * durations, categories or eligibility criteria — deliberately. What it contains
 * is the job-search strategy that follows from having a hard date and a
 * sponsorship constraint, which is stable across jurisdictions, plus a clear
 * instruction to verify the rules themselves with the official source and, where
 * the decision warrants it, a registered adviser.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'job-search-on-a-visa': {
    summary:
      'A study visa turns a job search into a scheduling problem. There is a date by which you need an offer, the stages between application and offer take a known and substantial amount of time, and employers who sponsor are a subset of employers who hire — so the search has to be planned backwards from the deadline rather than forwards from when you feel ready. In practice that means starting six to nine months earlier than domestic peers, building a target list filtered for sponsorship history before you write a single application, and accepting that the funnel is narrower rather than trying to widen it by applying everywhere. Verify every rule with the official immigration source; nothing here is immigration advice.',
    keyPoints: [
      'Plan backwards from your hard date: offer, notice, checks and start all consume weeks that are not negotiable.',
      'Filter the target list for employers who have actually sponsored before applying, not after being rejected.',
      'Large employers, regulated sectors and shortage-listed functions sponsor more predictably than small firms.',
      'Start six to nine months ahead of domestic peers; the constraint is timing far more often than it is ability.',
    ],
    faq: [
      {
        q: 'How do I know whether an employer sponsors?',
        a: 'Check the official register of licensed sponsors where the country publishes one, and look at whether their job postings mention sponsorship at all. Employees on the same visa route, found through an alumni directory, are the most reliable source — one conversation confirms both whether they sponsor and how the process ran. Do not rely on a recruiter\'s reassurance without confirmation.',
      },
      {
        q: 'Should I apply to employers that do not sponsor?',
        a: 'Only if you will have work rights independent of them by the time you start, and only if you are certain of that. Applying without that certainty consumes the scarcest resource you have — time — and ends at the point in the process where an employer has invested most, which is not a good relationship to leave behind. A shorter list of viable employers converts better than a long list of unviable ones.',
      },
      {
        q: 'Does a local qualification help?',
        a: 'It helps with two specific things: it removes the question of whether your credential is recognised, and it gives you an alumni network in the market, which is the more valuable of the two. It does not remove a sponsorship requirement. Treat it as a source of contacts and credibility rather than as a solution to the visa constraint.',
      },
    ],
    sections: [
      {
        id: 'the-timeline',
        title: 'Planning backwards from a hard date',
        blocks: [
          {
            kind: 'p',
            text: 'Domestic candidates can afford to start when they feel ready. With a fixed date you cannot, because the process between a first application and a start date is long and most of it is outside your control.',
          },
          {
            kind: 'table',
            caption: 'What sits between applying and starting',
            head: ['Stage', 'Typical elapsed time', 'Within your control?'],
            rows: [
              ['Application to first response', '2–6 weeks', 'No'],
              ['Interview stages', '3–8 weeks', 'Partly'],
              ['Offer and contract', '1–2 weeks', 'No'],
              ['Background and reference checks', '2–6 weeks', 'No'],
              ['Sponsorship and visa processing', 'Varies widely by country', 'No'],
            ],
            note: 'Indicative only, and the last row is the one that varies most. Confirm current processing times with the official immigration source for your country and route.',
          },
          {
            kind: 'p',
            text: 'Add those up and the interval between a first application and a legal start date is commonly four to six months, before any allowance for applications that do not convert. Working backwards from the date you need to be employed is the only planning method that survives contact with that.',
          },
          {
            kind: 'warning',
            title: 'Verify the rules, do not infer them',
            text: 'Nothing on this page is immigration advice, and immigration rules change without much notice. Check the official government source for your country and route, and take advice from a registered adviser where the decision matters. A forum post from two years ago is not a source.',
          },
        ],
      },
      {
        id: 'the-target-list',
        title: 'Filtering the list before you write anything',
        blocks: [
          {
            kind: 'p',
            text: 'The instinct under time pressure is to apply more widely. With a sponsorship constraint that is backwards: a wider list contains more employers who cannot hire you, and each of those consumes weeks to discover.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Start from the official sponsor register** where one exists, filtered to your sector and location. This is the single highest-value hour in the whole search.',
              '**Weight toward larger employers.** Sponsoring requires a licence and a process; organisations that already have both find it routine, while a twenty-person firm may never have done it.',
              '**Note the functions that hire in volume.** Financial crime, risk, technology and operations run large, continuous intakes — see [AML careers](/learn/aml-financial-crime/aml-analyst-role) and [risk career paths](/learn/risk-compliance-careers/risk-career-paths).',
              '**Confirm from the inside.** One conversation with someone on the same route at that employer is worth more than any amount of inference — [how to arrange one](/learn/networking/informational-interviews) if you know nobody.',
            ],
          },
          {
            kind: 'p',
            text: 'Thirty confirmed-viable employers is a better list than two hundred unfiltered ones, and it makes the per-application quality that graduate processes actually reward affordable.',
          },
        ],
      },
      {
        id: 'sequencing',
        title: 'Sequencing the campaign',
        blocks: [
          {
            kind: 'p',
            text: 'Because the funnel is narrower, the order in which you do things matters more than it does for a domestic candidate.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Nine months out:** target list built and verified. Resume finished. [Evidence bank](/learn/interview-preparation/preparation-system) written. Networking started, because it has the longest lag of anything you will do.',
              '**Seven months out:** applications to the structured programmes, which open earliest and take longest — the [graduate calendar](/learn/graduate-programs/graduate-timeline) drives this.',
              '**Five months out:** direct applications, in waves rather than in one batch, so you can adjust based on what is converting.',
              '**Three months out:** widen the functions rather than abandoning the sponsorship filter. An adjacent role at a sponsoring employer beats an ideal role at one that cannot hire you.',
            ],
          },
          {
            kind: 'p',
            text: 'The most common failure is not a weak application. It is starting the whole process three months later than the timeline supports, which converts a manageable constraint into an impossible one.',
          },
        ],
      },
    ],
  },

  'visa-questions': {
    summary:
      'Almost every application asks, in some form, whether you will need sponsorship, and how you handle that question matters more than the answer itself. Answer the form question factually and exactly as asked — never inaccurately, since it is verified and a wrong answer ends more than the application. In interviews, do not volunteer your status before you are asked: it invites the conversation to become about logistics before the interviewer has decided they want you. When it is raised, answer in one calm, specific sentence and return to the role. Length and apology are what make it feel like a problem; brevity is what makes it feel like an administrative detail.',
    keyPoints: [
      'Answer application-form questions accurately and literally — this is verified, and a false answer is unrecoverable.',
      'Do not raise sponsorship before you are asked; let the interviewer establish that they want you first.',
      'One sentence, factual and specific, then return to the role. Do not apologise and do not elaborate.',
      'Know your own dates and current status precisely, because vagueness reads as risk regardless of the underlying facts.',
    ],
    faq: [
      {
        q: 'Should I mention my visa status in my cover letter?',
        a: 'Only if you have current work rights that are not obvious from your resume and stating them removes an objection — "I hold unrestricted work rights" is a single useful line. If you will need sponsorship, the cover letter is the wrong place: it moves the conversation to logistics before anyone has read your evidence. Answer the question honestly wherever it is asked, and do not pre-empt it.',
      },
      {
        q: 'What if the interviewer asks and I know they do not sponsor?',
        a: 'Answer honestly and briefly, and ask whether it is something they have done before. Occasionally the answer surprises you. Where it does not, thank them and treat the conversation as a contact rather than a loss — people move employers, and someone who interviewed you and liked you is a useful person to know.',
      },
      {
        q: 'Is it discriminatory to ask about visa status?',
        a: 'Asking whether you are legally permitted to work, and whether you would require sponsorship, is a legitimate operational question in most jurisdictions and is not the same as asking about nationality. Employers ask it because the answer has real cost and process implications for them. What is worth doing is answering the question that was actually asked, factually, rather than a broader one about your background.',
      },
    ],
    sections: [
      {
        id: 'the-form',
        title: 'The form question, which is not the interview question',
        blocks: [
          {
            kind: 'p',
            text: 'Application forms typically ask two separate things, and conflating them causes real problems: whether you are currently permitted to work, and whether you will require sponsorship now or in the future. They have different answers for many people.',
          },
          {
            kind: 'p',
            text: 'Answer each exactly as written. These answers are verified at offer stage, and an inaccurate one does not merely lose the offer — it ends the relationship with the employer and, in some markets, has consequences beyond it. There is no version of this where guessing is worth the risk.',
          },
          {
            kind: 'note',
            title: 'Know your own dates',
            text: 'Current status, expiry date, and what the transition to a work route requires in your country. Not because an interviewer will test you, but because an answer delivered with certainty is heard as an administrative fact, while the same answer delivered vaguely is heard as an unquantified risk.',
          },
        ],
      },
      {
        id: 'the-interview',
        title: 'The one-sentence answer',
        blocks: [
          {
            kind: 'p',
            text: 'When the question comes up in conversation, the structure that works is: state the fact, state the timing, stop. Then return to the role.',
          },
          {
            kind: 'table',
            caption: 'The same information, delivered two ways',
            head: ['Version', 'How it lands'],
            rows: [
              [
                '"So I am on a student visa, and it runs until next year, and I would need the company to sponsor me, which I know is a whole process, and I completely understand if that is difficult…"',
                'Length and apology signal that you consider it a problem. The interviewer now does too.',
              ],
              [
                '"I have work rights until March and would need sponsorship after that. Is that something the team has done before?"',
                'Factual, specific, ends in a question that hands the conversation back.',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'The closing question matters. It converts a disclosure into an ordinary logistical exchange, and it gets you a useful answer — whether this employer has actually done it — which is information you need regardless of how the interview ends.',
          },
        ],
      },
      {
        id: 'competing-on-substance',
        title: 'What actually decides it',
        blocks: [
          {
            kind: 'p',
            text: 'Sponsorship is a cost and a process, and an employer weighs it against what they get. That is the whole calculation, and it means the useful response to the constraint is not better handling of the question — it is being clearly worth the cost.',
          },
          {
            kind: 'list',
            items: [
              '**A skill they are short of.** Shortage areas exist for a reason and are the strongest single argument available. Technical, quantitative, language and regulated-specialism skills carry disproportionate weight.',
              '**Evidence rather than potential.** A candidate whose resume shows specific, [quantified outcomes](/learn/resume/quantifying-achievements) is easier to justify than one with equivalent grades and no evidence.',
              '**An internal advocate.** A referral matters more here than in any other situation, because someone inside is making the case when you are not in the room.',
              '**Timing that works.** An employer who needs someone in six weeks cannot wait for processing. One recruiting for a cohort starting in nine months can.',
            ],
          },
          {
            kind: 'p',
            text: 'Three of those four are things you build months in advance, which is the same conclusion the [timing guide](/learn/international-students/job-search-on-a-visa) reaches from a different direction. The visa question is answered in one sentence; the position that makes the answer acceptable is built long before it is asked.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'A study visa changes a job search in two specific ways. It puts a hard date on it, and it reduces the set of employers who can actually hire you. Neither is a judgement on your ability, and both are manageable — but only if they are planned around from the start rather than discovered at month four.',
      'The practical consequence is that the search has to run backwards from the deadline. Between a first application and a legal start date there are typically four to six months of stages you do not control, which means an international candidate needs to begin substantially earlier than a domestic peer with the same target roles.',
      'A note on what this topic deliberately does not contain: no visa categories, durations, eligibility criteria or processing times. Immigration rules differ by country, change frequently, and carry real consequences when they are got wrong. Verify every rule with the official government source for your country and route, and take advice from a registered adviser where the decision matters. Nothing here is immigration advice.',
    ],
    definitions: [
      {
        term: 'Sponsorship',
        definition:
          'An employer taking on the legal and administrative responsibility for your right to work. It costs them money and process, which is why the practical question is never whether you deserve it but whether the employer already has the licence and considers the hire worth it.',
      },
      {
        term: 'Sponsor register',
        definition:
          'The official list of employers licensed to sponsor workers, published by several countries. Filtering your target list against it before writing any applications is usually the single highest-value hour in an international job search.',
      },
      {
        term: 'Hard date',
        definition:
          'The date by which you need an offer or a start, set by your current permission rather than by your preference. Planning backwards from it is the only method that accounts for the stages between application and start that you do not control.',
      },
      {
        term: 'Shortage or priority occupation',
        definition:
          'A role a country has identified as difficult to fill domestically, sometimes attracting a simpler or faster route. Where your target function appears on such a list, it is the strongest argument available to an employer weighing the cost of sponsoring.',
      },
    ],
    faq: [
      {
        q: 'When should an international student start applying?',
        a: 'Six to nine months earlier than domestic classmates targeting the same roles. The stages between a first application and a legal start date commonly total four to six months even when everything converts, and most applications do not. Starting late is by a wide margin the most common reason an international job search fails, ahead of anything about the applications themselves.',
      },
      {
        q: 'Which employers are most likely to sponsor?',
        a: 'Large organisations that already hold a licence and have done it before, regulated sectors with continuous hiring, and functions on a shortage list where one exists. Financial crime, risk, technology and operations run large, ongoing intakes in banking. Small firms frequently cannot, not because they are unwilling but because they have never held the licence.',
      },
      {
        q: 'Should I hide that I need sponsorship?',
        a: 'Never on a form — those answers are verified and an inaccurate one is unrecoverable. In conversation it is not hiding to let the interviewer establish that they want you before logistics come up. Answer honestly whenever asked, and do not volunteer it first. The distinction is between concealment, which is a serious problem, and sequencing, which is ordinary.',
      },
      {
        q: 'Is it worth applying to employers who say they do not sponsor?',
        a: 'Not unless you will have independent work rights by the start date and are certain of it. Time is the scarcest thing you have, and these applications consume weeks before ending at the stage where the employer has invested most. Spend the same hours on a shorter, verified list where every application can convert.',
      },
    ],
  },
  articles,
};

export default content;
