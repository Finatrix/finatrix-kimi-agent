/**
 * Editorial copy and article bodies for the Behavioural Interviews topic.
 *
 * The useful thing to say about behavioural interviews is that they are a
 * measurement instrument with a published design, and that candidates prepare
 * badly because they treat them as conversation. Everything here describes the
 * instrument.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'star-method': {
    summary:
      'STAR — situation, task, action, result — is a structure for answering a behavioural question, and most people get the proportions wrong. Situation and task together should take about a fifth of the answer; action should take well over half; result closes it. The common failure is spending ninety seconds setting the scene and thirty on what you actually did, which is exactly backwards, because the interviewer is scoring your actions and cannot score context. The second failure is preparing only the story and not the probes: the follow-up questions about what you would change, who disagreed and how you knew are where a rehearsed narrative comes apart and a real memory holds.',
    keyPoints: [
      'Proportions matter more than the acronym: roughly 20% situation and task, 60% action, 20% result.',
      'Say "I" rather than "we" in the action section — an interviewer scoring you cannot give credit to a team.',
      'Every story needs a result, and a result that is a number, an outcome or a decision rather than "it went well".',
      'Prepare the three standard probes for each story: what you would do differently, who pushed back, and how you knew.',
    ],
    faq: [
      {
        q: 'How long should a STAR answer be?',
        a: 'Ninety seconds to two minutes spoken. Under a minute usually means the action section is too thin to score. Over three means the interviewer has stopped tracking the thread and will have to interrupt, which costs you the ending. Time it out loud when you rehearse, because the written version is always shorter than the spoken one.',
      },
      {
        q: 'What if the honest result was that it did not work?',
        a: 'That is a perfectly good answer, and for a failure question it is the only honest one. The result section becomes what happened plus what you did about it plus what changed afterwards. Interviewers are scoring self-awareness on those questions, and a failure story that ends with a genuine lesson scores better than a success story with no reflection in it.',
      },
      {
        q: 'Can I use the same story for more than one question?',
        a: 'Yes, and you should — one substantial project can answer conflict, pressure, influence and analysis depending on which part you foreground. What you cannot do is tell the same story twice in one interview with the same emphasis. Have a second story ready for your strongest theme so you are never repeating yourself in the room.',
      },
    ],
    sections: [
      {
        id: 'proportions',
        title: 'The proportions, which are the whole technique',
        blocks: [
          {
            kind: 'p',
            text: 'Everyone knows the acronym. Almost nobody gets the balance right, and the balance is what determines whether an answer can be scored at all.',
          },
          {
            kind: 'table',
            caption: 'Where the time in a two-minute answer should go',
            head: ['Part', 'Share', 'What it must contain'],
            rows: [
              ['Situation', '~15%', 'Enough context to make the difficulty legible. No more.'],
              ['Task', '~5%', 'What you specifically were responsible for.'],
              ['Action', '~60%', 'What you did, in sequence, in the first person.'],
              ['Result', '~20%', 'What changed, ideally measurable, plus the reflection.'],
            ],
            note: 'Roughly 20 seconds of setup, 70 seconds of action, 25 of result.',
          },
          {
            kind: 'p',
            text: 'The reason is mechanical. An interviewer is marking against behaviours — did the candidate take ownership, did they consider alternatives, did they involve the right people — and every one of those is evidenced in the action section. Context that is not needed to make the actions legible earns nothing and consumes the time the actions needed.',
          },
          {
            kind: 'warning',
            title: '"We" is not scoreable',
            text: 'The single most common way a strong story fails to score is a candidate who describes the team\'s actions throughout. The mark sheet has your name on it. Describe the team where it is genuinely relevant, then be explicit about your own part: "the team agreed to rebuild it; I owned the reconciliation logic and the testing."',
          },
        ],
      },
      {
        id: 'the-probes',
        title: 'Preparing the probes, not just the story',
        blocks: [
          {
            kind: 'p',
            text: 'A prepared story and a remembered one sound identical for about ninety seconds. They diverge at the first follow-up, which is why interviewers ask one.',
          },
          {
            kind: 'list',
            items: [
              '**"What would you do differently?"** The most common probe and the most commonly fumbled. "Nothing, it went well" reads as either dishonest or incurious. Have a genuine answer: something you would sequence differently, someone you would have involved earlier.',
              '**"Who disagreed, and what did they say?"** Tests whether the situation was real. Every non-trivial piece of work has someone who saw it differently, and a story with no dissent in it sounds constructed.',
              '**"How did you know that was the problem?"** Tests reasoning rather than outcome. Be able to say what evidence you had and what you were still uncertain about.',
            ],
          },
          {
            kind: 'p',
            text: 'Adding three bullet points per story to your [evidence bank](/learn/interview-preparation/preparation-system) covers this permanently. It takes a few minutes per story and it is the difference between an answer that survives scrutiny and one that only survives being unchallenged.',
          },
        ],
      },
      {
        id: 'worked-example',
        title: 'A worked answer, timed',
        blocks: [
          {
            kind: 'worked',
            title: '"Tell me about a time you had to influence someone without authority"',
            rows: [
              {
                label: 'Situation (15s)',
                value: 'Our month-end pack depended on a file from the operations team that arrived late roughly half the time.',
              },
              {
                label: 'Task (5s)',
                value: 'I owned the pack but had no authority over the team producing the input.',
              },
              {
                label: 'Action (70s)',
                value: 'I tracked the arrival times for two months so the conversation was about data rather than blame; found the delay was a dependency on a report they also received late; proposed we both take the upstream extract directly; built the intermediate step myself so the change cost their team nothing; ran it in parallel for one cycle before switching.',
              },
              {
                label: 'Result (25s)',
                value: 'The input arrived on the first working day every month afterwards. What I would do differently: I spent three weeks assuming it was a priority problem before I measured it, and the measurement took an afternoon.',
              },
            ],
            conclusion:
              'The action section carries the evidence — measuring before escalating, finding the upstream cause, absorbing the cost of the change, running a parallel period. Those are the behaviours being marked, and every one of them is visible.',
          },
          {
            kind: 'p',
            text: 'Note that the reflection is folded into the result rather than waiting for the probe. Volunteering it costs nothing, sounds like self-awareness rather than defensiveness, and frees the follow-up for something more interesting.',
          },
        ],
      },
    ],
  },

  'competency-frameworks': {
    summary:
      'A behavioural interview in any large employer is scored against a competency framework: a written list of behaviours, each with a scale describing what a weak, adequate and strong answer looks like. The interviewer is filling in a form. That changes preparation considerably — instead of guessing what impresses, you can work out which four or five competencies a role is testing from the job description, and prepare evidence against each one. The tell is the language: "stakeholder management", "commercial awareness", "collaboration", "resilience" are not decoration in a posting, they are the mark sheet quoted back at you.',
    keyPoints: [
      'The interviewer is completing a scoring form, not forming a general impression — the scores are what survive into the hiring decision.',
      'A job description usually names the competencies directly, which makes the mark sheet largely readable in advance.',
      'Prepare one strong story per competency rather than many stories with no mapping; coverage beats volume.',
      'Weak answers are usually generic rather than wrong — the scale rewards specificity, and a general statement scores at the bottom of it.',
    ],
    faq: [
      {
        q: 'How do I find out which competencies are being tested?',
        a: 'Read the job description for repeated abstract nouns — collaboration, judgement, client focus, resilience, commercial awareness. Those are usually lifted from the framework. Large employers, particularly in banking and consulting, also publish their values or competencies on the careers site, and graduate schemes almost always do. Four or five is typical for one interview.',
      },
      {
        q: 'What separates a strong answer from an adequate one?',
        a: 'On most scales it is specificity and ownership. An adequate answer describes a reasonable thing that happened; a strong one names the trade-off that was faced, the decision that was made, why it was made, and what it cost. The gap is rarely the quality of the underlying story — it is how much of the thinking behind it makes it into the answer.',
      },
      {
        q: 'What if I have no example for one of the competencies?',
        a: 'Use a smaller example rather than none. Frameworks score the behaviour, not the scale of the setting, and a well-told story about a two-person disagreement over a shared deliverable evidences collaboration as legitimately as a cross-department programme. An honest small example scores; "I have not been in that situation" does not.',
      },
    ],
    sections: [
      {
        id: 'what-a-framework-is',
        title: 'What is actually on the interviewer\'s desk',
        blocks: [
          {
            kind: 'p',
            text: 'Structured interviewing exists because unstructured interviewing is a poor predictor and hard to defend. So large employers write down the behaviours the role needs, define what each looks like at several levels, and ask every candidate the same questions against them.',
          },
          {
            kind: 'table',
            caption: 'A typical scale for one competency — "influencing others"',
            head: ['Level', 'What it looks like in an answer'],
            rows: [
              ['1 — limited', 'Describes what the team decided; own contribution unclear'],
              ['2 — developing', 'States a position and who they told; no adaptation to the audience'],
              ['3 — effective', 'Tailors the argument to the person, anticipates objections, follows up'],
              ['4 — strong', 'All of the above, plus changes their own position where the counter-argument was better'],
            ],
            note: 'Illustrative of the shape these scales take. The exact wording differs by employer; the structure rarely does.',
          },
          {
            kind: 'p',
            text: 'Reading a scale like that changes what you prepare. Level 4 is not a more impressive story than level 3 — it is the same story with one extra element in it, and that element is something you can decide to include.',
          },
        ],
      },
      {
        id: 'reading-the-posting',
        title: 'Reading the mark sheet out of the job description',
        blocks: [
          {
            kind: 'p',
            text: 'Job descriptions are written by the same people who own the framework, and the vocabulary leaks. Abstract nouns that appear more than once are almost always competencies.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              'Copy the posting into a document and highlight every abstract behavioural noun.',
              'Group the duplicates. Four or five distinct clusters usually remain.',
              'Map one story from your evidence bank to each. Where two competencies map to the same story, find a second for one of them.',
              'For each, check you can name a trade-off and a reflection — that is the gap between an adequate and a strong score.',
            ],
          },
          {
            kind: 'p',
            text: 'This is also how you decide what to lead with. If "commercial awareness" appears three times, the interview will test whether you understand how the employer makes money, which is the first of the [four research questions](/learn/interview-preparation/preparation-system).',
          },
        ],
      },
      {
        id: 'where-marks-are-lost',
        title: 'Where the marks are actually lost',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Generic answers.** "I always make sure to communicate clearly with stakeholders" describes a policy, not an event. Scales reward specific incidents; a policy scores at the bottom.',
              '**No trade-off.** A story where the right answer was obvious evidences nothing about judgement. Choose the story where two reasonable options existed.',
              '**Unowned outcomes.** Describing what happened without saying what you decided leaves the interviewer nothing to mark.',
              '**Repeating one story.** Using the same project for four competencies signals a narrow base of experience, even when it is not true.',
              '**Running out of time.** Frameworks have a fixed number of questions in a fixed slot. A four-minute answer costs you the last competency entirely, which is scored as a zero rather than as an omission.',
            ],
          },
          {
            kind: 'note',
            title: 'The same framework runs the assessment centre',
            text: 'Group exercises, case presentations and written tasks are scored against the same competencies with different evidence. Preparing them once covers the whole day — see [what happens in an assessment centre](/learn/assessment-centres/assessment-centre-format).',
          },
          {
            kind: 'p',
            text: 'One thing a framework changes about how you should answer: interviewers usually have to record evidence against each competency separately, so an answer that touches four of them lightly is harder to score than one that evidences a single competency thoroughly. If a question is clearly aimed at collaboration, answer it about collaboration. Volunteering that the project also demonstrated your commercial awareness and resilience does not earn those marks — those have their own questions — and it dilutes the evidence for the one being asked about.',
          },
          {
            kind: 'p',
            text: 'It also explains a piece of interview behaviour that otherwise looks rude. When an interviewer interrupts to ask "and what did YOU do?", they are not being sceptical about your story; they are missing the evidence they need to write on the sheet. Treat every interruption as a request for a specific kind of detail rather than as a challenge, and answer the narrower question directly instead of returning to the narrative.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'A behavioural interview asks about things you have actually done, on the theory that past behaviour predicts future behaviour better than a hypothetical does. In any employer large enough to have a talent function, it is also a measurement instrument: the interviewer has a written framework, a set of questions tied to it, and a scale for each behaviour.',
      'That is genuinely good news for a candidate, because a measurement instrument with a published design can be prepared for. The competencies are usually named in the job description. The scale for each rewards a specific, owned, reflected-upon example. Neither of those is a secret, and neither requires you to guess what a particular interviewer happens to like.',
      'What preparation cannot do is invent the underlying material. The stories have to be yours and they have to survive a follow-up question, which is why the work sits in building an evidence bank before you need it rather than in polishing a narrative the night before.',
    ],
    definitions: [
      {
        term: 'STAR',
        definition:
          'Situation, task, action, result — a structure for answering a behavioural question. Useful mainly for its proportions: the action section should be well over half the answer, because that is the only part an interviewer can score.',
      },
      {
        term: 'Competency framework',
        definition:
          'A written list of the behaviours a role requires, each with a scale describing weak through strong evidence. The interviewer scores against it, and the scores rather than the impression are what carry into the hiring decision.',
      },
      {
        term: 'Probe',
        definition:
          'A follow-up question after a story — what you would change, who disagreed, how you knew. Probes exist to distinguish a rehearsed narrative from a remembered event, and they are where most behavioural interviews are actually decided.',
      },
      {
        term: 'Structured interview',
        definition:
          'An interview where all candidates receive the same questions in the same order, scored against a framework. Standard in banking, consulting and graduate hiring because it is more defensible and a better predictor than an unstructured conversation.',
      },
    ],
    faq: [
      {
        q: 'What is a behavioural interview actually testing?',
        a: 'Evidence that you have previously behaved in the ways the role requires — taking ownership, handling disagreement, working under pressure, reaching a decision from incomplete information. It is not testing whether you are likeable or whether you know the company\'s history. Answers fail most often by being general rather than by being about the wrong thing.',
      },
      {
        q: 'How many stories should I prepare?',
        a: 'Twelve to fifteen across the standard themes, then map four or five of them to the specific competencies a given role names. The mapping is per-interview work; the stories are permanent. Preparing thirty stories is a way of avoiding the harder task, which is making a few of them genuinely strong.',
      },
      {
        q: 'Should I admit to a real failure?',
        a: 'Yes. A failure question with a disguised-success answer — "I work too hard", "I took on too much" — scores at the bottom of every scale, because the behaviour being measured is self-awareness and the answer demonstrates its absence. Pick something that genuinely went wrong, own your part without over-apologising, and be concrete about what changed afterwards.',
      },
      {
        q: 'Do smaller employers use frameworks too?',
        a: 'Less formally, and often not at all. In a smaller firm the interview is more likely to be a conversation with the person you would work for, and the useful preparation shifts toward the work itself and toward specific knowledge of the business. The stories still help; the mapping exercise matters less.',
      },
    ],
  },
  articles,
};

export default content;
