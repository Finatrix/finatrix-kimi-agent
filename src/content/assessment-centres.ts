/**
 * Editorial copy and article bodies for the Assessment Centres topic.
 *
 * The organising fact, and the one that changes how people behave on the day, is
 * that exercises are scored independently by assessors who have not seen each
 * other's sheets. Almost every self-inflicted failure at an assessment centre
 * comes from not knowing that.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'assessment-centre-format': {
    summary:
      'An assessment centre is four or five separate exercises run in one day, each scored independently against the same competency framework by an assessor who usually has not seen your other scores. That structure has two consequences worth internalising. First, a weak exercise does not sink the day — the scores are combined at the end and one low mark among five is survivable, but carrying the disappointment into the next room converts one bad score into three. Second, because every exercise is scored against the same framework, preparing the framework once covers the entire day rather than each exercise separately.',
    keyPoints: [
      'Exercises are scored independently, usually by different assessors who have not compared notes — each room starts clean.',
      'One weak exercise is recoverable; carrying it into the next exercise is what actually loses the day.',
      'The same competency framework runs every exercise, so preparation is shared rather than per-exercise.',
      'Assessors record behaviour rather than impressions, which means being visible and specific matters more than being liked.',
    ],
    faq: [
      {
        q: 'What happens if one exercise goes badly?',
        a: 'Considerably less than it feels like at the time. Scores are combined at the end and a single weak mark among five rarely decides the outcome. What does decide it is the candidate who spends the following exercise subdued, apologetic or over-compensating — the assessor in that room does not know the previous one happened and simply records what they see, which is now a second weak performance.',
      },
      {
        q: 'Are candidates competing against each other?',
        a: 'Usually against the standard rather than against each other, particularly on graduate programmes with a target intake. Everyone in the room can pass and everyone can fail. This matters most in the group exercise, where treating it as a contest produces exactly the behaviour that scores badly — see [group exercises](/learn/assessment-centres/group-exercises).',
      },
      {
        q: 'How should I behave during the informal parts?',
        a: 'Normally, and on the assumption that everything is visible. Lunches and coffee breaks are rarely formally scored, but assessors and current employees are present and impressions travel. The realistic advice is not to perform — it is to remember that the day has not ended, and to talk to people as you would on your first week rather than as a candidate.',
      },
    ],
    sections: [
      {
        id: 'the-exercises',
        title: 'The five exercises, and what each one measures',
        blocks: [
          {
            kind: 'table',
            caption: 'A typical assessment centre',
            head: ['Exercise', 'Duration', 'Primarily measures'],
            rows: [
              ['Group exercise', '30–45 min', 'Collaboration, influence, judgement in a group'],
              ['Case or written analysis', '45–60 min', 'Structure, analysis, written communication'],
              ['Presentation', '10–15 min plus questions', 'Clarity, handling challenge, commercial sense'],
              ['Competency interview', '45–60 min', 'Behavioural evidence against the framework'],
              ['Role play or in-tray', '30–45 min', 'Prioritisation, judgement under time pressure'],
            ],
            note: 'The mix varies by employer. Almost all include a group exercise and a competency interview.',
          },
          {
            kind: 'p',
            text: 'The exercises look unrelated and are not. Each is a different way of generating evidence against the same list of behaviours, which is why an employer runs several rather than one long interview: some people evidence collaboration well in conversation and badly in a group, and the centre exists to catch that.',
          },
        ],
      },
      {
        id: 'independence',
        title: 'Why independence is the most useful thing to know',
        blocks: [
          {
            kind: 'p',
            text: 'Assessors are typically assigned to exercises rather than to candidates, and they score what happens in front of them. The scores are collated in a wash-up meeting at the end of the day. Until that meeting, nobody has a composite view of you.',
          },
          {
            kind: 'p',
            text: 'The practical implication is that each room genuinely starts clean. If the group exercise went badly, the interviewer forty minutes later has no idea. Behaving as though they do — leading with an apology, being visibly deflated, or over-asserting to compensate — hands them a second weak observation drawn entirely from your own reaction to the first.',
          },
          {
            kind: 'note',
            title: 'A five-minute reset between exercises',
            text: 'Between rooms: name what went badly to yourself, decide the one thing you would change, then stop. Candidates who can do this reliably outperform equally capable candidates who cannot, and the gap is entirely in the second half of the day.',
          },
        ],
      },
      {
        id: 'preparing-once',
        title: 'Preparing the framework rather than the exercises',
        blocks: [
          {
            kind: 'p',
            text: 'Because one framework runs the whole day, the efficient preparation is to work out which competencies the employer uses and prepare evidence and behaviour for each — not to prepare five exercises separately.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Identify the competencies.** They are usually on the careers site and repeated in the job description. Four to six is typical. [Competency frameworks](/learn/behavioural-interviews/competency-frameworks) covers how to read them out of a posting.',
              '**Map your evidence.** One strong story per competency, from your [evidence bank](/learn/interview-preparation/preparation-system), for the interview.',
              '**Decide the behaviour.** For each competency, what does demonstrating it look like in a group exercise? If "commercial awareness" is on the list, it means bringing cost and customer into the group discussion, out loud, at least once.',
              '**Prepare the same content in three formats.** Spoken in an interview, written in an analysis exercise, presented in a presentation. Same material, three deliveries.',
            ],
          },
          {
            kind: 'p',
            text: 'This is also why the day is more predictable than it appears. The exercises differ, the standard does not, and the standard is usually published by the employer who is about to apply it to you.',
          },
          {
            kind: 'p',
            text: 'A few logistics are worth handling in advance because they consume attention that the exercises need. Know how you are getting there and arrive with time in hand; a candidate who has been running is not at their best in the first exercise, which is frequently the group one. Eat properly beforehand, because the day is long and the interview is often after lunch. And bring a pen and paper even where materials are provided — in the case exercise you will want to plan before writing, and that is not the moment to be looking for something to write with.',
          },
          {
            kind: 'p',
            text: 'If any part of the day would be materially harder for you for a reason the employer can accommodate — a disability, a health condition, anything affecting reading speed or fatigue — tell the recruiter when the invitation arrives rather than on the day. Adjustments are routine, they are made without comment, and they are not visible to the assessors scoring you. Arriving without asking, and performing below your level as a result, is the outcome nobody involved wanted.',
          },
        ],
      },
    ],
  },

  'group-exercises': {
    summary:
      'In a group exercise the assessor is not watching the discussion; they are watching you, with a checklist, recording specific behaviours against competencies. That is why talking the most consistently scores badly and why silence scores worse. Four contributions reliably earn marks: bringing in someone who has not spoken, summarising where the group has got to, introducing a consideration nobody has raised, and moving the group toward a decision when time is short. None of them requires dominating, and all four are available to a quiet person. The task itself almost never matters — groups that fail to complete it routinely contain candidates who all passed.',
    keyPoints: [
      'The assessor is scoring individuals, not the group, and the group outcome is rarely part of the mark.',
      'Talking most is consistently marked down; contributing nothing is marked lower still.',
      'Four specific contributions score: including others, summarising, adding a missing consideration, and driving to a decision.',
      'Time management is visible and scored — a group that runs out of time with no conclusion has been watched doing it.',
    ],
    faq: [
      {
        q: 'Should I try to lead the group?',
        a: 'Do not appoint yourself leader, and do not compete for the role. Assessors see self-appointed chairs constantly and mark the behaviour rather than the title. What scores is leadership behaviour — noticing the group is stuck and proposing a way forward, watching the clock, making sure a quiet person is heard — which anyone can do from any position in the group.',
      },
      {
        q: 'What if another candidate dominates?',
        a: 'Do not compete with them and do not visibly resent them; both are scored and neither helps. Use the inclusion move instead: "I want to check we have heard from everyone — what do you think?" It scores for you, it redistributes the airtime, and it is the single most effective response available. The dominant candidate is usually being marked down without your assistance.',
      },
      {
        q: 'Does the group need to finish the task?',
        a: 'Not usually, and tasks are frequently designed to be unfinishable in the time. What is scored is how you worked, not whether the output was complete. Noticing at the two-thirds point that the group needs to converge, and saying so, scores considerably better than quietly completing the task with no one having heard from you.',
      },
    ],
    sections: [
      {
        id: 'what-is-recorded',
        title: 'What the assessor is actually writing down',
        blocks: [
          {
            kind: 'p',
            text: 'Picture the sheet: your name, a list of competencies down the side, and space for observed behaviours. The assessor writes down things you did — "brought in Priya at 12 minutes", "proposed a structure", "restated the objective when the group drifted" — and maps them to competencies afterwards.',
          },
          {
            kind: 'p',
            text: 'Two consequences follow. Contributions have to be observable, so a good idea you did not voice is worth nothing. And they have to be attributable, so nodding along with a strong point does not score for you even if you agreed with it first.',
          },
          {
            kind: 'warning',
            title: 'Volume is not a competency',
            text: 'Candidates who speak most are frequently among the lowest scorers, because sustained talking crowds out the collaborative behaviours the sheet is looking for and is often recorded explicitly as a negative. Four well-placed contributions in thirty minutes beats continuous participation.',
          },
        ],
      },
      {
        id: 'four-moves',
        title: 'The four contributions that score',
        blocks: [
          {
            kind: 'table',
            caption: 'What to say, and what it evidences',
            head: ['Move', 'What it sounds like', 'Evidences'],
            rows: [
              [
                'Bring someone in',
                '"We have not heard from you — what do you think about the second option?"',
                'Collaboration, awareness of others',
              ],
              [
                'Summarise',
                '"So we agree on A and B, and the open question is C."',
                'Structure, listening, judgement',
              ],
              [
                'Add a missing consideration',
                '"We have covered cost — has anyone thought about what this does to the customer?"',
                'Commercial awareness, analysis',
              ],
              [
                'Drive to a decision',
                '"We have eight minutes. Shall we take option two and use the rest on the risks?"',
                'Time management, decisiveness',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'Each takes under fifteen seconds. Four of them across a thirty-minute exercise is a strong performance and represents perhaps a minute of speaking, which is why this is entirely accessible to someone who finds group settings difficult.',
          },
        ],
      },
      {
        id: 'the-clock',
        title: 'The clock, which almost nobody watches',
        blocks: [
          {
            kind: 'p',
            text: 'Groups reliably spend two-thirds of the available time on the first third of the task and then rush. Assessors watch this happen in exercise after exercise, which makes the candidate who manages time visible for a reason unrelated to the content.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              '**At the start:** "We have thirty minutes — shall we spend ten understanding the options and twenty deciding?" A structure proposed in the first minute is worth more than the same structure at minute fifteen.',
              '**At the halfway point:** "We are halfway — are we on track?" Fifteen seconds, and it is recorded.',
              '**With a quarter left:** "We have eight minutes. What do we need to agree to have something to present?"',
            ],
          },
          {
            kind: 'p',
            text: 'None of this requires expertise in the task, which is why it is the most reliable way to score in an exercise about a subject you know nothing about. It also happens to make the group perform better, which is the point of scoring it.',
          },
          {
            kind: 'p',
            text: 'The same competencies are being marked in every other exercise that day, in different formats — the [format guide](/learn/assessment-centres/assessment-centre-format) sets out how they connect.',
          },
          {
            kind: 'p',
            text: 'One structural feature is worth using rather than resenting: many group exercises give each participant slightly different information, so no one person can see the whole problem. That is deliberate, and it means the group cannot succeed unless information is pooled. Saying "I have something on the third option that I do not think anyone else has — shall I share it?" is both the correct move for the task and a directly scoreable contribution.',
          },
          {
            kind: 'p',
            text: 'The corollary is that withholding an advantage does not work. A candidate who notices they hold the decisive piece of information and saves it for a dramatic moment is competing when the exercise is measuring collaboration, and assessors have seen it many times. Share early, attribute clearly, and let the group\'s use of it be the thing you are marked on.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'An assessment centre is not one long test. It is four or five separate exercises, each observed and scored independently against a written competency framework, with the results combined only at the end of the day. Almost everything that makes the day manageable follows from understanding that structure.',
      'It means a weak exercise is recoverable, because the assessor in the next room has not seen it. It means the group exercise is not a competition against the other candidates, because you are being scored against a standard rather than ranked. And it means preparation is shared across the whole day: the same framework runs every exercise, so working out which competencies an employer uses covers all of them at once.',
      'The most common failures at an assessment centre are not failures of ability. They are a candidate carrying a bad hour into the next room, a candidate who talks continuously in the group exercise because they think volume is participation, and a candidate who never says anything an assessor can write down.',
    ],
    definitions: [
      {
        term: 'Assessment centre',
        definition:
          'A structured selection day combining several exercises, each observed by assessors scoring against a common competency framework. Used because different formats surface different evidence: some people evidence a behaviour well in conversation and poorly in a group.',
      },
      {
        term: 'Wash-up',
        definition:
          'The meeting at the end of the day where assessors combine their scores and reach a decision. Until it happens, no one holds a composite view of you — which is why each exercise genuinely starts clean.',
      },
      {
        term: 'In-tray or role-play exercise',
        definition:
          'A simulation of the job: a queue of emails and documents to prioritise, or a conversation with an actor playing a client or colleague. Scored on prioritisation, judgement and how you behave under mild time pressure rather than on reaching a specific outcome.',
      },
      {
        term: 'Observed behaviour',
        definition:
          'A specific, attributable thing you did that an assessor wrote down. The unit of scoring at an assessment centre — which is why an unvoiced idea is worth nothing and agreement with someone else\'s point does not score for you.',
      },
    ],
    faq: [
      {
        q: 'How should I prepare for an assessment centre?',
        a: 'Find the employer\'s competency framework, prepare one strong story per competency for the interview, and decide what demonstrating each competency would look like in a group setting. Then practise one group exercise and one timed written exercise with other people. The framework work covers the whole day; the practice is about the formats rather than the content.',
      },
      {
        q: 'Are all the exercises equally weighted?',
        a: 'Not usually, and the weighting is rarely published. The competency interview and the exercise closest to the actual job tend to carry more. This is another reason not to write the day off after one weak exercise: you do not know what it was worth, and it is frequently worth less than the exercise you have not done yet.',
      },
      {
        q: 'What do assessors mark down most often?',
        a: 'Dominating a group discussion, contributing nothing observable, ignoring the time, and — in interviews — general answers with no specific example in them. Three of those four are behaviours rather than abilities, which means they are correctable by deciding in advance to behave differently.',
      },
      {
        q: 'Is it worth talking to the other candidates?',
        a: 'Yes, and not for strategic reasons. The day is long and less stressful in company, people are usually pleasant, and some of them will be colleagues or contacts later. Candidates who treat the others as competition tend to bring that posture into the group exercise, where it is precisely the thing being marked down.',
      },
    ],
  },
  articles,
};

export default content;
