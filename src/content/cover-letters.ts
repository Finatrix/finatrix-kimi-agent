/**
 * Editorial copy and article bodies for the Cover Letters topic.
 *
 * The honest position of this topic is that cover letters matter less than
 * candidates fear and more than cynics claim, and that which of those is true
 * depends entirely on the application type. Saying so is more useful than
 * pretending every letter is read, and it is what lets a reader spend their
 * limited preparation time on the applications where a letter changes anything.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'cover-letter-structure': {
    summary:
      'A cover letter that works has four paragraphs and each one has exactly one job. The first says why this employer specifically, using something you could not have written about a competitor. The second says what you are and the single most relevant thing you have done. The third gives one worked piece of evidence in three or four sentences — the story your resume only had room to summarise. The fourth closes with a clear next step. Under 350 words in total. The most common failure is spending the first paragraph on enthusiasm, which is the one thing every other applicant also has.',
    keyPoints: [
      'Open with something specific to this employer that you could not paste into another application — that sentence is the whole test.',
      'The letter should add one thing the resume could not carry, not restate the resume in prose.',
      'Three or four sentences of one concrete story beats a paragraph of adjectives about your work ethic every time.',
      'Under 350 words. A letter that fills a page is competing for attention with the resume, and losing.',
    ],
    faq: [
      {
        q: 'How long should a cover letter be?',
        a: 'Three hundred to three hundred and fifty words — comfortably under a page with white space around it. The reader has your resume open in another tab and is deciding whether to keep reading. A short letter that says one specific thing is read to the end; a full page of prose is skimmed for the first sentence and abandoned.',
      },
      {
        q: 'How do I open without sounding like everyone else?',
        a: 'Name something concrete about the employer and connect it to your own work in the same sentence. Something they have built, a market they have moved into, a change in how the function is organised. If the sentence would be equally true of three competitors, it is not doing anything — and "I have long admired your commitment to excellence" is true of every company that has ever existed.',
      },
      {
        q: 'Should I address it to a named person?',
        a: 'Yes, if you can find the name without guessing — the hiring manager or the recruiter on the posting. If you cannot, "Dear Hiring Team" is fine and unremarkable. Do not invent a name, and do not use "To Whom It May Concern", which reads as though the letter was written before the job existed. It usually was.',
      },
    ],
    sections: [
      {
        id: 'four-jobs',
        title: 'Four paragraphs, four jobs',
        blocks: [
          {
            kind: 'table',
            caption: 'What each paragraph is for',
            head: ['Paragraph', 'Its one job', 'Length'],
            rows: [
              ['First', 'Why this employer, specifically and checkably', '2–3 sentences'],
              ['Second', 'What you are, and the most relevant thing you have done', '2–3 sentences'],
              ['Third', 'One piece of evidence, told properly', '3–4 sentences'],
              ['Fourth', 'The close and the next step', '1–2 sentences'],
            ],
            note: 'Roughly 320 words. If a paragraph is doing two jobs, one of them is being done badly.',
          },
          {
            kind: 'p',
            text: 'The structure is not novel and that is the point. A reader who has opened nine letters this morning is grateful for one that arrives in the shape they expect, because it lets them find what they are looking for without reading every word.',
          },
        ],
      },
      {
        id: 'the-opening',
        title: 'The opening sentence, which is the whole letter',
        blocks: [
          {
            kind: 'p',
            text: 'There is one test for a cover letter opening: could you paste this sentence into an application to a different employer without changing anything? If yes, it is doing nothing, and it is occupying the only paragraph you can be confident was read.',
          },
          {
            kind: 'table',
            caption: 'Openings that fail the paste test, and their replacements',
            head: ['Fails', 'Works'],
            rows: [
              [
                'I am writing to express my strong interest in the Analyst position at your organisation.',
                'Your move into supply-chain finance last year is the part of transaction banking I have spent two years working in from the corporate side.',
              ],
              [
                'I have always been passionate about financial services and admire your commitment to innovation.',
                'I spent eighteen months on the same regulatory remediation your risk function published on, from the vendor side of it.',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'Finding that sentence takes ten to fifteen minutes of research, which is precisely why most letters do not have one. It is also why the ones that do are noticeable. The same research feeds directly into [interview preparation](/learn/interview-preparation/preparation-system), so it is not spent twice.',
          },
        ],
      },
      {
        id: 'evidence-paragraph',
        title: 'The evidence paragraph',
        blocks: [
          {
            kind: 'p',
            text: 'This is where a letter earns its place. A resume bullet has room for the outcome and nothing else; the letter has room for the situation, the complication and what you actually did. Pick the one story most relevant to this role and tell it in four sentences.',
          },
          {
            kind: 'worked',
            title: 'A resume bullet expanded into an evidence paragraph',
            rows: [
              {
                label: 'The bullet',
                value: 'Cut monthly close preparation from four days to one',
              },
              {
                label: 'Sentence 1 — situation',
                value: 'The close pack was assembled by hand from eleven source files each month.',
              },
              {
                label: 'Sentence 2 — complication',
                value: 'It took four days, and any late correction meant redoing most of it.',
              },
              {
                label: 'Sentence 3 — action',
                value: 'I rebuilt it around a single reconciled input sheet with the checks automated.',
              },
              {
                label: 'Sentence 4 — result',
                value: 'Preparation dropped to a day, and a late correction now costs an hour rather than three days.',
              },
            ],
            conclusion:
              'Four sentences, no adjectives, and the reader now knows something about how you work that the resume could only assert. This is the same shape as a [STAR answer](/learn/behavioural-interviews/star-method), which is not a coincidence — prepare it once and it serves both.',
          },
          {
            kind: 'p',
            text: 'Choose the story by relevance to this specific role rather than by which one is most impressive. An interviewer reading a letter for a reconciliation-heavy role wants the reconciliation story, even if the acquisition you worked on is the better anecdote. The letter is not a highlight reel; it is an argument that you have already done a version of the thing they need doing, and the closest match makes that argument most efficiently.',
          },
          {
            kind: 'p',
            text: 'The fourth paragraph is the one people over-write. It needs a single sentence stating what you would like to happen next — a conversation — and nothing else. No restatement of your enthusiasm, no summary of the letter above it, no thanks for the reader\'s time in three clauses. A short close reads as confidence and a long one reads as reluctance to stop, which is the last impression you want to leave.',
          },
        ],
      },
    ],
  },

  'when-it-matters': {
    summary:
      'Cover letters are read in some application routes and never opened in others, and the difference is predictable enough to plan around. They matter most where a human owns the shortlist and the pool is small: direct applications to smaller employers, roles you are reaching for, internal moves, speculative approaches, and any application that came from a referral. They matter least in high-volume graduate schemes with structured application forms, agency-submitted applications, and roles where an assessment or test is the real first filter. Writing a careful letter for every application is not diligence — it is spending your best preparation hours where they cannot pay off.',
    keyPoints: [
      'Where a structured application form exists, the form is the screening instrument and the letter is usually an attachment nobody opens.',
      'The smaller the employer and the smaller the applicant pool, the more likely one person reads everything you send.',
      'A letter earns most when your resume raises an obvious question — a career change, a gap, a step down, an unusual route in.',
      'Time saved by not writing letters where they do not count is better spent on research and evidence for the ones where they do.',
    ],
    faq: [
      {
        q: 'Should I write a cover letter if it says optional?',
        a: '"Optional" usually means one person will glance at it and most will not. Write one if you have something the resume cannot say — a reason for approaching this employer, an explanation for something on the page, or a story that changes how a bullet reads. If you would only be restating the resume in prose, skip it and use the time on the resume itself.',
      },
      {
        q: 'Do graduate schemes read cover letters?',
        a: 'Large structured schemes generally screen on the application form, the online tests and the video interview rather than on an attached letter. The written questions on the form are the real thing to prepare — they are read, scored against a framework, and often weighted more heavily than anything else at that stage. Treat those answers with the care you would have given the letter.',
      },
      {
        q: 'What about a career change or an employment gap?',
        a: 'This is exactly where a letter earns its place. A resume can only show the gap; a letter can explain it in one unapologetic sentence and move on. The same is true of a career change, where the letter connects what you did to what you are applying for — a connection the reader will otherwise have to construct themselves, and usually will not.',
      },
    ],
    sections: [
      {
        id: 'where-it-counts',
        title: 'Where a letter is genuinely read',
        blocks: [
          {
            kind: 'p',
            text: 'The question is not whether cover letters work in the abstract. It is whether a person will open yours, and that depends on how the application arrived and how many others arrived with it.',
          },
          {
            kind: 'table',
            caption: 'Likelihood a letter is read, by application route',
            head: ['Route', 'Read?', 'Why'],
            rows: [
              ['Direct application, small employer', 'Usually', 'One person owns the whole shortlist'],
              ['Referral or internal move', 'Usually', 'Someone is already advocating and needs material'],
              ['Speculative approach', 'Always — it is the application', 'There is no posting and no form'],
              ['Mid-size employer, posted role', 'Sometimes', 'Depends on volume and on who screens'],
              ['Large graduate scheme', 'Rarely', 'The structured form and tests are the filter'],
              ['Agency submission', 'Rarely', 'The agency writes its own summary'],
            ],
          },
          {
            kind: 'p',
            text: 'The pattern is consistent: a letter is read wherever a named human owns the decision about you and has time to form a view. It is not read wherever the first filter is a process.',
          },
        ],
      },
      {
        id: 'when-it-changes-things',
        title: 'The four situations where it changes the outcome',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Your resume raises a question.** A gap, a career change, a step down in seniority, a move between countries. Left unexplained, the reader invents an explanation, and the invented one is rarely generous.',
              '**You are reaching.** Where you are plausibly under-qualified on paper, the letter is the only place to make the argument for why the gap is smaller than it looks.',
              '**There is no posting.** A speculative approach is a cover letter with a resume attached. Everything depends on the letter having a reason to exist.',
              '**Someone referred you.** Name them in the first line. A referral converts far better than a cold application, and the letter is where the connection gets made explicit — see [networking](/learn/networking/starting-with-no-contacts).',
            ],
          },
          {
            kind: 'note',
            title: 'One unapologetic sentence',
            text: 'For a gap or a change, brevity is the whole technique. "I took eighteen months out for family care and returned to work in March" needs no more than that. A paragraph of justification signals that you think it is a problem, and the reader takes the hint.',
          },
        ],
      },
      {
        id: 'time-allocation',
        title: 'Spending the hours where they pay',
        blocks: [
          {
            kind: 'p',
            text: 'A carefully researched letter takes forty minutes. Twenty applications a week with a letter each is thirteen hours, and if fifteen of those letters are attached to structured graduate forms nobody opens, most of that time bought nothing.',
          },
          {
            kind: 'p',
            text: 'The better allocation is blunt: no letter where the route says it will not be read, a strong letter where it will, and the reclaimed hours spent on the two things that raise conversion everywhere — better evidence on the resume, and preparation for the stage that actually decides. For graduate schemes that means the written form answers and the [assessment centre](/learn/assessment-centres/assessment-centre-format); for direct applications it means the interview.',
          },
          {
            kind: 'p',
            text: 'This is not an argument for caring less. It is an argument for caring in the places where care is observable, which is a different thing and a considerably more effective one.',
          },
          {
            kind: 'p',
            text: 'There is one exception to all of the above worth stating plainly: when an application explicitly asks for a letter and specifies what it should address, write it and address exactly that. A prompt like "tell us why this role and what you would bring in your first six months" is not a formality — it is a written question that will be read and, in a structured process, scored. Treat it as you would a form answer rather than as a covering note.',
          },
          {
            kind: 'p',
            text: 'The same applies to a letter requested by a named person after a conversation. At that point it is not screening material at all; it is a document someone intends to forward internally on your behalf. Make it easy to forward — short, specific, and containing the one sentence they would want to quote when they pass it on.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'A cover letter has one purpose that a resume cannot serve: it explains why you are writing to this employer rather than to the thirty others hiring the same role. Everything else it is asked to do — summarise your experience, demonstrate your enthusiasm, restate your skills — is either already on the resume or is not worth a reader\'s time.',
      'The uncomfortable truth about letters is that whether yours is opened depends less on how good it is than on how the application arrived. A structured graduate form and a direct approach to a forty-person firm are different games, and writing the same careful letter for both is a way of spending most of your preparation time where it cannot pay off.',
      'These two guides split accordingly. One is about what goes in a letter when you write one; the other is about deciding whether to write one at all. The second question is the one that saves more time, so it is worth answering first.',
    ],
    definitions: [
      {
        term: 'The paste test',
        definition:
          'Checking whether a sentence in your letter could be pasted unchanged into an application to a different employer. Anything that passes the paste test is filler — true of you, true of everyone, and occupying space in the only paragraph you can be sure was read.',
      },
      {
        term: 'Evidence paragraph',
        definition:
          'The three or four sentences in a letter that tell one story properly: situation, complication, action, result. It is the only part of an application where a resume bullet can be expanded into something a reader can picture, and it doubles as prepared interview material.',
      },
      {
        term: 'Speculative application',
        definition:
          'An approach to an employer with no advertised vacancy. Here the letter is the entire application rather than an accompaniment to it, and it needs a specific reason to exist — a change at the employer, a referral, or work of theirs you can speak to concretely.',
      },
      {
        term: 'Structured application form',
        definition:
          'A form with its own written questions, scored against a framework, common in graduate recruitment. Where one exists it is the real screening instrument, and the effort most people put into an attached letter belongs in those answers instead.',
      },
    ],
    faq: [
      {
        q: 'Are cover letters still worth writing?',
        a: 'In some routes, decisively. A named person reading a small shortlist will read a letter, and a letter with one specific, researched sentence in it is memorable because so few have one. In high-volume routes with a structured form, an attached letter is frequently never opened. The skill is telling the two apart before you spend forty minutes.',
      },
      {
        q: 'What should never go in a cover letter?',
        a: 'Anything the resume already says, adjectives about yourself, salary expectations unless asked, and any sentence that would be equally true in an application to a competitor. The most common waste is the entire first paragraph, spent on enthusiasm that every other applicant also expressed and no reader has ever found persuasive.',
      },
      {
        q: 'Should I use AI to write my cover letter?',
        a: 'It is good at structure and grammar and poor at the one thing that matters, which is the specific, researched sentence about this employer — because that comes from information you gathered, not from the model. Used to tighten prose you have drafted, it helps. Used to generate the letter, it produces something that passes the paste test in every paragraph.',
      },
      {
        q: 'Do I need a different letter for every application?',
        a: 'You need a different first paragraph and a different choice of evidence story. The second and fourth paragraphs are largely stable across applications in the same field. That is fifteen minutes per letter rather than forty, and it is honest: the parts that should be specific are specific, and the parts that describe you do not change between employers.',
      },
    ],
  },
  articles,
};

export default content;
