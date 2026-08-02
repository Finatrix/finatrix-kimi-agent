/**
 * Editorial copy and article bodies for the Graduate Programs topic.
 *
 * Deliberately free of employer-specific dates and deadlines. Graduate calendars
 * shift every year and a page listing "applications open in August" is wrong
 * within twelve months and quietly misleading for years after that. What is
 * described instead is the SHAPE of a cycle, which is stable, plus how to find
 * the current dates yourself.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'graduate-timeline': {
    summary:
      'Graduate hiring runs on a calendar, and the calendar beats the candidate more often than the assessment does. Most large programmes open applications roughly a year before the start date, assess on a rolling basis as applications arrive rather than after the deadline, and fill places continuously — so a strong application submitted late in the window competes for far fewer remaining seats than an average one submitted early. Plan backwards from the opening date, not the closing one: have your resume, your evidence bank and your test practice finished before applications open, because the six weeks after they open is when the places are actually allocated.',
    keyPoints: [
      'Rolling assessment means the closing date is not the deadline that matters — places are filled as strong candidates pass through.',
      'The preparation window is before applications open, not after; once they open you should be submitting, not building a resume.',
      'Applying to six employers properly beats twenty applications assembled at speed, because every stage after the form is time-expensive.',
      'Missing a cycle usually costs a full year, which makes the calendar the single highest-consequence thing to get right.',
    ],
    faq: [
      {
        q: 'When should I apply?',
        a: 'In the first few weeks after applications open, and treat the stated closing date as a fallback rather than a target. Where assessment is rolling — which is common for large programmes — the pool of remaining places shrinks continuously, so the same application is worth measurably more in week two than in week ten. Check each employer\'s own careers page for the current cycle rather than relying on last year\'s dates.',
      },
      {
        q: 'How many programmes should I apply to?',
        a: 'Six to ten, chosen deliberately, is a workable target for most people. Each application that progresses consumes real time — tests, a video interview, an assessment centre — and twenty simultaneous processes cannot all be prepared for properly. A smaller list where you can research each employer and tailor each form converts better than a large one you are processing.',
      },
      {
        q: 'What if I have already missed the main cycle?',
        a: 'Look at off-cycle and direct-entry routes rather than waiting a full year by default. Smaller firms, boutiques and regional offices hire outside the graduate calendar, internships and industrial placements sometimes convert, and some programmes run a second, smaller intake. A year spent gaining relevant experience also makes the next cycle\'s application materially stronger, which is not the worst outcome.',
      },
    ],
    sections: [
      {
        id: 'shape-of-a-cycle',
        title: 'The shape of a cycle',
        blocks: [
          {
            kind: 'p',
            text: 'Specific dates vary by employer, market and year. The structure does not, and the structure is what you plan against.',
          },
          {
            kind: 'table',
            caption: 'A typical graduate cycle, relative to the programme start',
            head: ['Phase', 'When', 'What you should already have'],
            rows: [
              ['Applications open', '~12 months before', 'Resume finished, evidence bank written, tests practised'],
              ['Peak assessment', '11–8 months before', 'Nothing left to build — you are submitting and attending'],
              ['Assessment centres', '10–6 months before', 'Group and case practice done'],
              ['Offers issued', '9–5 months before', 'A view on how you will compare offers'],
              ['Closing date', '6–4 months before', 'Largely symbolic where assessment is rolling'],
            ],
            note: 'Indicative only. Confirm each employer\'s current dates on their own careers page — these move every year.',
          },
          {
            kind: 'p',
            text: 'Read the first two rows together and the strategy falls out: everything you might want to prepare has to be finished before the window opens, because once it opens the correct activity is submitting applications and attending stages.',
          },
        ],
      },
      {
        id: 'rolling',
        title: 'Why rolling assessment changes everything',
        blocks: [
          {
            kind: 'p',
            text: 'A deadline-based process assesses everyone against everyone once the window shuts. A rolling process assesses each application as it arrives and makes offers continuously. The two look identical from the outside and behave completely differently.',
          },
          {
            kind: 'p',
            text: 'Under rolling assessment, an application in the first fortnight is competing against a nearly full set of places. The same application three months later is competing for whatever is left, against a bar that has usually risen. Nobody advertises this, and it is the most consequential single fact about graduate hiring.',
          },
          {
            kind: 'warning',
            title: 'Do not submit early at the cost of quality',
            text: 'The conclusion is to be READY early, not to submit something rushed. An application with a weak written answer fails in week two exactly as it would in week ten. The point of planning backwards is that early submission and a good application stop competing with each other.',
          },
        ],
      },
      {
        id: 'planning-backwards',
        title: 'Planning a campaign backwards',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Fix the list.** Six to ten employers, with the current opening date for each taken from their own careers page. This is the only step that needs live information.',
              '**Set the ready-by date.** Two weeks before the earliest opening. Everything else is scheduled to land before it.',
              '**Build the durable assets.** A finished resume, an [evidence bank](/learn/interview-preparation/preparation-system) of twelve to fifteen stories, and practice on the test formats. None of this is employer-specific and all of it is reusable.',
              '**Write the reusable form answers.** The written questions repeat across employers in substance — why this sector, why this firm, a time you led something. Draft each once, adapt per application.',
              '**Then submit, in order of opening date.** Research per employer is the only per-application work left, and it takes under an hour.',
            ],
          },
          {
            kind: 'p',
            text: 'Roughly eighty per cent of the total effort is in steps three and four and is spent once. That is what makes ten applications feasible without any of them being thin — and what each stage is actually filtering for is covered in [the application stages](/learn/graduate-programs/application-stages).',
          },
          {
            kind: 'p',
            text: 'Keep a simple record of the campaign as it runs: employer, date submitted, stage reached, date of the next thing. Five columns in a spreadsheet. With ten live applications at different stages it becomes genuinely difficult to remember who has asked for what by when, and a missed test deadline is the most avoidable way to lose a process you were passing.',
          },
          {
            kind: 'p',
            text: 'The record has a second use that matters more. At the end of the cycle it tells you where you are actually failing — at the form, at the tests, at the video stage, or at the assessment centre — and each of those has a different fix. Without it, a run of rejections reads as undifferentiated bad luck, and the natural response is to apply to more employers rather than to repair the one stage that is losing you every process.',
          },
        ],
      },
    ],
  },

  'application-stages': {
    summary:
      'A graduate application has four or five stages and each screens for something different, which means preparing for them as one process is a mistake. The form filters on eligibility and on written communication. Online tests filter on aptitude under time pressure and are almost purely practice-responsive. The video interview filters on structure and clarity when nobody is reacting to you. The assessment centre observes behaviour against a competency framework across several exercises. The final interview tests motivation and judgement. Knowing which filter you are in tells you what to spend the evening before on, and the answer is different every time.',
    keyPoints: [
      'The written answers on the form are scored and are the most under-prepared stage in the whole process.',
      'Online aptitude tests improve substantially with practice, which makes them the highest-return preparation per hour spent.',
      'A video interview has no interviewer reaction to steer by, so structure and a hard stop matter more than warmth.',
      'Assessment centre exercises are scored independently, so one weak exercise does not sink the day and should not be carried into the next one.',
    ],
    faq: [
      {
        q: 'How much do the written answers on the form matter?',
        a: 'A great deal, and they are consistently the stage candidates rush. They are read and scored against the same competencies as the interview, and for many high-volume programmes they are the main human judgement made before the tests. Treat a 250-word answer with the care you would give a cover letter, because in a structured process it has replaced one.',
      },
      {
        q: 'Can I actually improve at online aptitude tests?',
        a: 'Yes, more than at almost any other stage. Numerical and logical reasoning tests use a small number of recurring question shapes under tight time limits, and familiarity with the format is most of the score. A few hours of timed practice against the specific test provider — usually named in the invitation email — is the highest return available per hour of preparation.',
      },
      {
        q: 'What are video interviews looking for?',
        a: 'Structure, clarity and whether you can hold a coherent two-minute answer with no feedback from a listener. The absence of reaction is the actual difficulty: people either rush or drift because nothing tells them how they are doing. Record yourself once, watch it back, and fix the pace. It is uncomfortable and it is the entire preparation.',
      },
    ],
    sections: [
      {
        id: 'the-filters',
        title: 'What each stage is filtering for',
        blocks: [
          {
            kind: 'table',
            caption: 'The stages, and the different thing each one screens on',
            head: ['Stage', 'Filters on', 'Prepare by'],
            rows: [
              [
                'Application form',
                'Eligibility, and written communication under a word limit',
                'Drafting the recurring answers once, properly',
              ],
              [
                'Online tests',
                'Aptitude under time pressure',
                'Timed practice on the named provider\'s format',
              ],
              [
                'Video interview',
                'Structure and clarity with no listener feedback',
                'Recording yourself and watching it back',
              ],
              [
                'Assessment centre',
                'Observed behaviour against a competency framework',
                'Group and case practice; know the framework',
              ],
              [
                'Final interview',
                'Motivation, judgement, and fit with the specific team',
                'Employer research and considered questions',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'The stages are largely independent. Strong test scores do not compensate for a thin form, and an excellent assessment centre cannot rescue an application that never reached one.',
          },
        ],
      },
      {
        id: 'the-form',
        title: 'The form, and the answers everyone rushes',
        blocks: [
          {
            kind: 'p',
            text: 'Three written questions recur across almost every graduate application, in different words: why this sector, why this firm, and describe a time you did something. All three are scored, all three can be drafted once, and all three are routinely written in twenty minutes at midnight.',
          },
          {
            kind: 'list',
            items: [
              '**Why this sector.** Needs a reason that is specific to you and to the work — a piece of it you have engaged with, not an assertion of interest. "I want to work in a fast-paced environment" describes a preference about pace, not about the sector.',
              '**Why this firm.** Fails the [paste test](/learn/cover-letters/cover-letter-structure) more often than any other answer. Name something the firm does that its competitors do not, and connect it to what you want to work on.',
              '**Describe a time when…** A [STAR answer](/learn/behavioural-interviews/star-method) inside a word limit. Cut the situation hard; the action is what is being scored.',
            ],
          },
          {
            kind: 'note',
            title: 'Word limits are part of the test',
            text: 'A 250-word limit is assessing whether you can be concise, not how much you can fit. An answer at 248 words that says one thing well outperforms one crammed to the character count, and markers notice the difference immediately.',
          },
        ],
      },
      {
        id: 'through-the-day',
        title: 'Carrying nothing between stages',
        blocks: [
          {
            kind: 'p',
            text: 'At an assessment centre each exercise is observed and scored separately, often by a different assessor who has not seen the previous one. That is a structural feature worth internalising, because the most common self-inflicted failure is a candidate who has a poor group exercise and then carries it into the interview an hour later.',
          },
          {
            kind: 'p',
            text: 'The assessor in the interview has no idea the group exercise went badly. Behaving as though they do — apologising, over-compensating, subdued — converts one weak score into two. What happens in each room stays in that room, and the arithmetic of a scored day genuinely supports treating it that way.',
          },
          {
            kind: 'p',
            text: 'The mechanics of each exercise, and what assessors write down during them, are covered in [what happens in an assessment centre](/learn/assessment-centres/assessment-centre-format).',
          },
          {
            kind: 'p',
            text: 'The same independence applies across stages, not only within a day. A rejection from one employer carries no information to another — they do not share results, they use different tests and different frameworks, and the bar varies by intake size. Candidates who take an early rejection as evidence about their prospects generally, and slow down as a result, convert a single outcome into a worse campaign.',
          },
          {
            kind: 'p',
            text: 'What a rejection does carry is information for you, if you look at where it happened. Rejected at the tests means practise the tests. Rejected after the video interview means record yourself and watch it. Rejected at the assessment centre means you are close, and the fix is usually one exercise rather than the whole day. Reading the pattern across several applications is far more useful than reading any single outcome, which is the argument for keeping the record in the first place.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'A graduate programme is a hiring pipeline with a published calendar and a fixed number of seats. Almost everything that distinguishes a successful campaign from an unsuccessful one is decided before the first application is submitted — by whether the durable material exists, and by whether you are ready when the window opens rather than three months into it.',
      'The second thing worth understanding early is that the stages are not one process. A form, an aptitude test, a recorded video interview and an assessment centre screen for four genuinely different things, and preparing generically for "the application" means preparing well for none of them.',
      'These guides describe the shape of a cycle and the purpose of each stage rather than listing dates. Employer calendars move every year, and the only reliable source for a specific deadline is that employer\'s own careers page — anything else is a page that was accurate once.',
    ],
    definitions: [
      {
        term: 'Rolling assessment',
        definition:
          'Assessing and making offers as applications arrive rather than after the closing date. It means places are filled continuously, so an application submitted early competes for a fuller set of seats than the identical application submitted late in the window.',
      },
      {
        term: 'Aptitude test',
        definition:
          'A timed numerical, verbal or logical reasoning test used as an early filter. Scores respond strongly to practice because the question formats repeat, which makes this the stage with the highest return per hour of preparation.',
      },
      {
        term: 'Asynchronous video interview',
        definition:
          'A recorded interview with no interviewer present: a question appears, you have limited time to think and to answer. It screens for structure and clarity without the feedback a live conversation provides, which is what makes it harder than it looks.',
      },
      {
        term: 'Off-cycle hiring',
        definition:
          'Recruitment outside the main graduate calendar — smaller firms, regional offices, replacement hires, second intakes. The route worth pursuing if you have missed a cycle, and often less competitive than the headline programmes.',
      },
    ],
    faq: [
      {
        q: 'Does applying early really help?',
        a: 'Where assessment is rolling, yes, and the effect is significant rather than marginal: places are allocated continuously through the window, so late applications compete for a residual pool. The practical implication is not to rush a submission but to have everything finished before applications open, so that being early costs nothing in quality.',
      },
      {
        q: 'Do grades still matter?',
        a: 'They matter as an eligibility filter more than as a ranking. Many programmes state a minimum and, once you clear it, weight the tests, the written answers and the assessment centre far more heavily. Where a grade requirement has been dropped entirely, something else has usually replaced it — typically the aptitude tests — rather than the bar being lowered.',
      },
      {
        q: 'Is a target-school background necessary?',
        a: 'Less than it once was, and it varies sharply by employer and by division. Structured processes exist partly because they are more defensible than the alternative, and an assessment centre scores what you do on the day. The genuine disadvantage of a non-target background is usually less information and fewer contacts, which is addressable — see [networking from zero](/learn/networking/starting-with-no-contacts).',
      },
      {
        q: 'How many applications is too many?',
        a: 'Beyond about ten simultaneous live processes, quality collapses, because each one that progresses demands tests, a video interview and a full day at an assessment centre. Six to ten researched applications is a realistic ceiling for most people, and it converts better than thirty submitted at speed.',
      },
    ],
  },
  articles,
};

export default content;
