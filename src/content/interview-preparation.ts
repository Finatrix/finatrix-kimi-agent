/**
 * Editorial copy and article bodies for the Interview Preparation topic.
 *
 * The organising claim of this topic is that interview preparation is mostly a
 * storage problem rather than a performance one: people prepare badly because
 * they start from a blank page every time, not because they lack the material.
 * Everything here is built around making the material persist.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'preparation-system': {
    summary:
      'Most interview preparation is wasted because it is thrown away afterwards. The system that fixes it has two halves: an evidence bank you build once and keep forever, and a ninety-minute routine you run per interview. The bank holds twelve to fifteen stories from your own work, each written down while you still remember the detail. The routine covers four research questions about the employer, choosing which stories to lead with, and one rehearsal out loud. After the third interview the bank is doing most of the work and preparation drops to under an hour — which is the difference between preparing properly for six interviews and preparing properly for one.',
    keyPoints: [
      'Build the evidence bank once: twelve to fifteen written stories covering conflict, failure, influence, pressure, initiative and analysis.',
      'Per-interview work is selection and research, not composition — you are choosing from material you already wrote, not inventing it under pressure.',
      'Four research questions cover almost every employer: what they sell, what changed recently, who this team serves, and what the role is really for.',
      'One rehearsal out loud is worth five silent read-throughs, because the failure mode is fluency under mild pressure rather than recall.',
    ],
    faq: [
      {
        q: 'How many stories do I actually need?',
        a: 'Twelve to fifteen covers almost every behavioural question you will meet, because the same story answers several questions from different angles. A project that went wrong is a failure story, a resilience story, a stakeholder story and a lesson-learned story depending on which part you emphasise. Beyond about fifteen you are storing material you will never reach for.',
      },
      {
        q: 'How long should I spend preparing for one interview?',
        a: 'Ninety minutes for the first interview with a new employer, less once the bank exists and you have researched them before. Split it roughly: forty minutes on research, thirty on selecting and adapting stories, twenty on rehearsing out loud. Spending six hours is usually a sign that the evidence bank does not exist yet and you are building it under deadline.',
      },
      {
        q: 'Is it worth writing answers out in full?',
        a: 'Write the stories out in full once, when you build the bank. Do not write out answers to specific questions in full, and never memorise them — a memorised answer is audible, it collapses the moment the interviewer asks something adjacent, and it stops you listening to what was actually asked. Bullet points per story, then speak from them.',
      },
    ],
    sections: [
      {
        id: 'the-bank',
        title: 'The evidence bank',
        blocks: [
          {
            kind: 'p',
            text: 'The bank is a single document with one entry per story from your own work. Each entry is a few lines: the situation, what made it hard, what you specifically did, what happened, and what you would do differently. That last line is the one people skip and the one interviewers reliably probe.',
          },
          {
            kind: 'p',
            text: 'Cover the categories rather than the jobs. Behavioural questions come from a small set of themes, and a bank organised by theme is searchable under pressure in a way a bank organised chronologically is not.',
          },
          {
            kind: 'list',
            items: [
              '**Conflict** — a disagreement with a colleague, a manager or a stakeholder, and how it resolved.',
              '**Failure** — something that genuinely did not work, owned without deflection.',
              '**Influence** — persuading someone with no obligation to agree with you.',
              '**Pressure** — a deadline, an incident, a period of sustained load.',
              '**Initiative** — something that existed because you started it.',
              '**Analysis** — a decision you reached from data, including what the data could not tell you.',
              '**Ambiguity** — a situation where the brief was unclear and you had to choose anyway.',
            ],
          },
          {
            kind: 'note',
            title: 'Write entries while the work is fresh',
            text: 'Ten minutes at the end of a project captures detail that is simply gone six months later. This is the same file that produces [quantified resume bullets](/learn/resume/quantifying-achievements), so the habit pays twice for one effort.',
          },
        ],
      },
      {
        id: 'four-questions',
        title: 'The four research questions',
        blocks: [
          {
            kind: 'p',
            text: 'Employer research goes wrong in a predictable way: people read the About page and arrive able to recite the founding year. What an interviewer notices is understanding of the business, and four questions get you there for almost any employer in forty minutes.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              '**What do they actually sell, and to whom?** Not the mission statement — the revenue. For a bank, which divisions and which customers. [What each division does](/learn/banking-careers/banking-divisions) is the map for this.',
              '**What has changed in the last year?** A results announcement, an acquisition, a new market, a regulatory finding, a restructure. This is where your specific opening sentence comes from.',
              '**Who does this team serve internally, and what do they complain about?** Every function has an internal customer, and the job usually exists because that customer is not fully served.',
              '**Why does this role exist right now?** Growth, backfill, a new obligation, a project. The posting usually says, indirectly, and it tells you what success in the first six months looks like.',
            ],
          },
          {
            kind: 'p',
            text: 'Those four answers also generate the questions you ask at the end, which are scored — see [questions to ask an interviewer](/learn/interview-preparation/questions-to-ask).',
          },
        ],
      },
      {
        id: 'the-routine',
        title: 'The ninety-minute routine',
        blocks: [
          {
            kind: 'table',
            caption: 'What to do the day before an interview',
            head: ['Block', 'Time', 'Output'],
            rows: [
              ['Research', '40 min', 'Answers to the four questions, in writing'],
              ['Story selection', '20 min', 'Six stories chosen and mapped to likely themes'],
              ['Adapt', '10 min', 'Each story\'s emphasis shifted toward this role'],
              ['Rehearse aloud', '20 min', 'Three stories spoken end to end, timed'],
            ],
            note: 'Ninety minutes. The rehearsal block is the one people cut, and it is the one that changes the interview.',
          },
          {
            kind: 'p',
            text: 'Rehearse out loud, standing up, with a timer. A story that reads well in two minutes often takes four when spoken, and discovering that in the room is expensive. You are not memorising; you are finding out where the sentence structure collapses and how long you actually take.',
          },
          {
            kind: 'warning',
            title: 'Prepare for the follow-up, not the question',
            text: 'The first question is rarely where an interview is decided. The probe after it — "what would you do differently", "who disagreed", "how did you know that was the cause" — is where a prepared story either holds up or reveals that you were narrating rather than remembering. See [surviving the follow-up](/learn/behavioural-interviews/star-method).',
          },
        ],
      },
    ],
  },

  'questions-to-ask': {
    summary:
      'The questions you ask at the end of an interview are scored, and most candidates treat them as a formality. What they signal is the level you are operating at: a question about the team\'s current problems reads as someone thinking about the job, while a question answered on the careers page reads as someone who did not look. Four categories reliably produce good questions — the work itself, how success is measured, the team and its constraints, and what happens next. Ask two or three, ask them because you want the answer, and never ask about leave, salary or working hours in a first interview.',
    keyPoints: [
      'Anything answered on the company website is a question that costs you marks, because asking it proves you did not read it.',
      'The strongest questions come from your own research and reference something specific — they show the preparation rather than claiming it.',
      'Two or three questions is right; a list of eight turns the close into an interrogation the interviewer has to manage.',
      'Save compensation, leave and flexible-working questions for the offer stage, where they are normal rather than premature.',
    ],
    faq: [
      {
        q: 'What if all my questions have already been answered?',
        a: 'Say so, and then ask one anyway — a good one is always available. "You mentioned the team is picking up the new reporting obligation; is that changing what you need from this role in the first year?" It references something from the conversation, which is better than anything you prepared, and it shows you were listening rather than waiting.',
      },
      {
        q: 'Is it acceptable to ask about salary in the first interview?',
        a: 'Not usually, unless the interviewer raises it or the recruiter asked you to confirm a range. It is not that the question is rude — it is that it is premature, and it shifts the conversation to terms before either side has established that there is anything to negotiate. That conversation belongs at the [offer stage](/learn/salary-negotiation/negotiating-an-offer).',
      },
      {
        q: 'Should I ask about progression?',
        a: 'Yes, if you ask about it as work rather than as title. "What does someone in this role typically move into?" is a question about the shape of the job. "How quickly can I be promoted?" is a question about you, asked before you have given them a reason to care, and it lands badly in almost every setting.',
      },
    ],
    sections: [
      {
        id: 'why-scored',
        title: 'Why the questions are part of the assessment',
        blocks: [
          {
            kind: 'p',
            text: 'Interviewers are not being polite when they leave ten minutes at the end. What you choose to ask reveals what you think the job is, and that is a harder signal to fake than an answer to a question you knew was coming.',
          },
          {
            kind: 'p',
            text: 'Two candidates give the same behavioural answers. One asks how the team is affected by the reporting change announced last quarter; the other asks what the culture is like. The first has demonstrated that they understand the business and did the work; the second has asked something no interviewer has ever answered informatively. The gap is entirely in preparation, and it is visible.',
          },
        ],
      },
      {
        id: 'four-categories',
        title: 'Four categories that always produce something',
        blocks: [
          {
            kind: 'table',
            caption: 'Question categories, with the shape of a good one',
            head: ['Category', 'What it signals', 'Example shape'],
            rows: [
              [
                'The work itself',
                'You are thinking about doing the job, not getting it',
                '"What does a typical week look like in the first six months?"',
              ],
              [
                'How success is measured',
                'You intend to be measurable',
                '"What would a strong first year look like from your side?"',
              ],
              [
                'The team and its constraints',
                'You understand teams have problems',
                '"What is the hardest part of this role that is not in the posting?"',
              ],
              [
                'What happens next',
                'You are organised and taking it seriously',
                '"What are the remaining stages, and what is the timeline?"',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'The best question of all is usually none of these: it is one built from your own research, naming something specific the employer has done, and asking what it means for this team. That question cannot be recycled, which is exactly why it works — and it comes out of the [four research questions](/learn/interview-preparation/preparation-system) rather than out of a list.',
          },
        ],
      },
      {
        id: 'what-not-to-ask',
        title: 'What not to ask, and why',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Anything on the website.** What the company does, when it was founded, which markets it operates in. The answer is public and asking demonstrates you did not look.',
              '**"What is the culture like?"** Nobody has ever given a useful answer. Ask instead how disagreements get resolved, or what happens when a deadline is at risk — those produce real answers.',
              '**Leave, hours and flexibility, at first interview.** Legitimate questions at the wrong moment. Ask the recruiter, or ask at offer stage.',
              '**"Do you have any concerns about my application?"** It invites an objection the interviewer may not have formed and gives you no room to answer it properly. It is a negotiation tactic in a setting that is not yet a negotiation.',
              '**A list of eight.** The close is a conversation. Prepare five, ask two or three, and read the room on the rest.',
            ],
          },
          {
            kind: 'note',
            title: 'Ask because you want the answer',
            text: 'The questions that land are the ones you would ask even if they were not being scored, because you are also deciding whether to take this job. A candidate genuinely evaluating an employer asks different questions from one performing curiosity, and the difference is obvious from the other side of the table.',
          },
          {
            kind: 'p',
            text: 'Match the question to the person in front of you, because the same question wastes a slot with the wrong interviewer. A hiring manager can tell you what the work actually involves and what a good first year looks like. A prospective peer can tell you what the team is really like on a bad week, which is the most useful answer available and one no manager will give you. A recruiter can tell you about process, timeline and compensation structure, and is the right person for exactly those.',
          },
          {
            kind: 'p',
            text: 'Prepare five and expect to ask two or three, keeping one in reserve that references something said during the conversation itself. That last one is worth more than anything you prepared, because it demonstrates you were listening rather than waiting — and it is the only question in the set that could not have been written the night before.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Interview preparation fails for a structural reason rather than a motivational one. People prepare intensively for one interview, perform, and then throw the material away — so the next interview starts from a blank page again. Six interviews in, they have prepared six times and accumulated nothing.',
      'The alternative is to treat it as two separate things. There is a durable asset — a written bank of stories from your own work, built once and added to over years — and there is a short per-interview routine of research, selection and rehearsal that draws on it. The asset is where the effort belongs, because it compounds; the routine is what makes each individual interview cheap.',
      'This also changes what preparation feels like. Building an evidence bank is a calm activity you do on a Sunday with no deadline. Composing seven stories the night before an interview is not, and the difference shows in the room — not because you are better prepared, but because you are not trying to remember something you wrote four hours ago.',
    ],
    definitions: [
      {
        term: 'Evidence bank',
        definition:
          'A written store of stories from your own work, one per entry, covering the themes behavioural interviews draw from. Built once and maintained, it is the difference between selecting an answer and inventing one under pressure.',
      },
      {
        term: 'Probe',
        definition:
          'The follow-up question after a story — what you would do differently, who disagreed, how you knew. Probes are where an interview is usually decided, because a rehearsed narrative survives the first question and a real memory survives the third.',
      },
      {
        term: 'Structured interview',
        definition:
          'An interview where every candidate is asked the same questions and scored against a written framework. Common in banking, consulting and graduate hiring, and the reason preparing against the framework rather than against the company is the higher-yield strategy.',
      },
      {
        term: 'Closing questions',
        definition:
          'The questions you ask at the end. They are part of the assessment in most structured processes, and they signal the level you are operating at more reliably than any answer you give, because they cannot be prepared from a generic list.',
      },
    ],
    faq: [
      {
        q: 'How far in advance should I start preparing?',
        a: 'The evidence bank should exist before you start applying, because building it takes an unhurried afternoon and it is the part that cannot be rushed. Per-interview preparation is best done the day before, close enough that the research is fresh. Preparing a week out and not revisiting it is the worst of both — the effort is spent and the detail has faded.',
      },
      {
        q: 'What is the single highest-value thing to do?',
        a: 'Rehearse three stories out loud, timed, standing up. It is the step almost everyone skips and the one that most reliably changes the interview, because the failure mode is not forgetting your material — it is discovering that a story you can write in two minutes takes you four to say and loses its shape halfway through.',
      },
      {
        q: 'Should I research the individual interviewers?',
        a: 'Briefly, and only for what changes how you answer: their function, their seniority, how long they have been there. That tells you whether to pitch technically or commercially. Reading their full history and referencing it in the room reads as surveillance rather than diligence, and it makes people uncomfortable.',
      },
      {
        q: 'How do I prepare when I have no relevant experience?',
        a: 'The themes are about behaviour, not about the industry. A conflict you handled in a part-time job, a group project that went wrong, a society you organised — all of these answer the question genuinely. What fails is not the lack of a finance example; it is having no specific example at all, because a general statement about how you approach teamwork cannot be probed and therefore cannot be scored.',
      },
    ],
  },
  articles,
};

export default content;
