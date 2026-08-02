/**
 * Editorial copy and article bodies for the Consulting Careers topic.
 *
 * No firm rankings and no salary tables. Both date fast, both vary by market and
 * practice more than by brand, and neither helps with the decision a reader is
 * actually making — which is whether the work suits them and how to prepare for
 * the interview format that gates it.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'consulting-ladder': {
    summary:
      'A consulting career is a sequence of four distinct jobs sharing one employer. An analyst does the analysis. A consultant owns a workstream and manages the client contact around it. A manager runs the project, the team and the client relationship, and does very little analysis themselves. A partner sells work, and everything above manager is fundamentally a sales and relationship role whatever it is called. The up-or-out convention means each step is expected within a few years rather than optional, and the most common exit — around year two to four, into industry, finance or a strategy role at a client — is the normal outcome rather than a failure of the system.',
    keyPoints: [
      'Each grade is a different job, and the analyst-to-manager arc moves you from doing the work to organising it.',
      'Above manager the role is business development; enjoying the analysis is not preparation for that.',
      'Up-or-out means the timeline is imposed rather than chosen, which is the structural difference from most careers.',
      'Exiting at two to four years is the modal outcome and is planned for by the firms themselves.',
    ],
    faq: [
      {
        q: 'What does "up or out" actually mean in practice?',
        a: 'That staying at a grade indefinitely is not an option: you are expected to progress within a broadly defined window, and if you do not, the firm helps you leave — usually with support, often into a client. It is less brutal than it sounds and more consequential than people expect, because it removes the option of a stable, competent, unambitious decade that most careers permit.',
      },
      {
        q: 'Is consulting a good first job?',
        a: 'It is unusually good at breadth: several industries, several problem types and a lot of structured feedback in a short period, which is hard to obtain elsewhere. It is unusually poor at depth — you rarely see the consequences of your own recommendations, which is the part of a career that teaches judgement. Two to four years captures most of the benefit before the lack of depth starts to matter.',
      },
      {
        q: 'What do consultants actually exit into?',
        a: 'Strategy and corporate development roles in industry, operational leadership positions, roles at a client who worked with them, private equity and investment roles, and start-ups. Firms maintain alumni networks deliberately, because former consultants become the people who hire consultants. The exit is designed into the model rather than tolerated by it.',
      },
    ],
    sections: [
      {
        id: 'four-jobs',
        title: 'Four jobs, one career',
        blocks: [
          {
            kind: 'table',
            caption: 'What changes at each grade',
            head: ['Grade', 'Typical years', 'The actual job'],
            rows: [
              ['Analyst', '0–2', 'Analysis, research, building the material'],
              ['Consultant', '2–4', 'Owning a workstream and the client contact within it'],
              ['Manager', '4–7', 'Running the project, the team and the relationship'],
              ['Partner track', '7+', 'Selling work; the practice depends on what you bring in'],
            ],
            note: 'Titles differ by firm — associate, senior consultant, principal, engagement manager. The progression of what is measured is more consistent than the naming.',
          },
          {
            kind: 'p',
            text: 'The break is between consultant and manager. Up to that point you are being assessed on the quality of work you produced. After it you are assessed on the quality of work other people produced, on a timeline you committed to, for a client whose satisfaction is yours to manage.',
          },
          {
            kind: 'p',
            text: 'The banking ladder has the same discontinuity at a similar point — see [the first ten years](/learn/banking-careers/first-ten-years) — but consulting reaches it faster and enforces it more explicitly.',
          },
        ],
      },
      {
        id: 'the-model',
        title: 'Why the model is shaped this way',
        blocks: [
          {
            kind: 'p',
            text: 'Consulting firms sell teams by the week. A project needs a small number of senior people and a larger number of junior ones, which produces a pyramid — and a pyramid only stays in shape if people leave from the middle. Up-or-out is not a cultural quirk; it is the arithmetic of the business model.',
          },
          {
            kind: 'p',
            text: 'Two things follow that are worth knowing before you join. First, the firm is not being adversarial when it manages someone out; it is doing what the structure requires, which is why the support is usually genuine. Second, your exit options are part of the recruitment proposition — the alumni network exists because former consultants become clients, and maintaining it is commercially rational.',
          },
          {
            kind: 'note',
            title: 'Plan the exit at entry, not at year three',
            text: 'The people who exit well have been building toward something specific — an industry, a function, a set of relationships — rather than accumulating projects and then looking around. Choosing project work with a destination in mind is the highest-leverage decision available to a consultant, and it is made early.',
          },
        ],
      },
      {
        id: 'the-life',
        title: 'The parts of the job that decide whether you stay',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Travel and location.** Varies enormously by firm and practice, and it is the single most common reason people leave. Ask specifically about the current staffing model for the practice you would join, not about the firm\'s policy.',
              '**Control over hours.** Low. Deadlines are client-driven and a bad week is not negotiable. The compensating factor is that projects end, and the gap between them is genuinely quieter.',
              '**Feedback density.** Very high, and unusual. Formal review at the end of every project, informal review constantly. People who find continuous assessment stressful should weigh this heavily; people who want to improve fast will not find it elsewhere.',
              '**Distance from consequences.** You leave before the recommendation is implemented. Some people find this liberating and some find it hollow, and which one you are is difficult to predict in advance.',
            ],
          },
          {
            kind: 'p',
            text: 'The first three are researchable before you accept an offer. The fourth is not, and it is the one that most often surprises people who were otherwise well suited to the job.',
          },
        ],
      },
    ],
  },

  'case-interviews': {
    summary:
      'A case interview asks you to reason through a business problem out loud, and it is scored on structure, quantitative comfort, insight and communication — not on reaching a predetermined answer. There is no answer; the interviewer is watching how you decompose a problem you have not seen before. Preparation from zero takes roughly four to six weeks and has three components: learning to build a structure you state out loud before analysing, drilling mental arithmetic until it stops consuming attention, and practising live with another person rather than reading cases silently. The last one is where almost all the improvement comes from, and it is the one people skip.',
    keyPoints: [
      'State your structure out loud before you analyse anything — an unstated structure cannot be scored or corrected.',
      'Mental arithmetic under observation is a separate trainable skill from arithmetic, and it is worth drilling on its own.',
      'Practise live with a partner; silent reading of case books produces very little transfer to the room.',
      'Ask clarifying questions before structuring, then commit — endless clarification reads as an inability to decide.',
    ],
    faq: [
      {
        q: 'How long does case preparation take?',
        a: 'Four to six weeks of consistent work from a standing start, meaning roughly twenty to thirty live cases with a partner plus arithmetic drills. Beyond about thirty-five cases returns fall off sharply and answers start sounding rehearsed, which is itself penalised. Little and often beats an intensive week.',
      },
      {
        q: 'Do I need to memorise frameworks?',
        a: 'No, and visibly applying a memorised framework is a recognisable negative signal — interviewers see it several times a day. Learn the underlying logic of a few, then build a structure specific to the case in front of you. A structure with three genuinely relevant branches beats a textbook framework with two irrelevant ones every time.',
      },
      {
        q: 'What if my arithmetic is wrong?',
        a: 'Say so, correct it, and continue. Interviewers expect errors under time pressure and are watching how you handle one. What is penalised is not noticing — presenting a figure that is off by an order of magnitude without pausing suggests you would do the same in front of a client. A visible sanity check protects you from the version that actually costs marks.',
      },
    ],
    sections: [
      {
        id: 'what-is-scored',
        title: 'What is actually being scored',
        blocks: [
          {
            kind: 'table',
            caption: 'The four criteria, and what each one looks like',
            head: ['Criterion', 'Strong evidence'],
            rows: [
              ['Structure', 'States a clear, case-specific breakdown before analysing, and follows it'],
              ['Quantitative comfort', 'Sets up the calculation correctly, works out loud, sanity-checks the result'],
              ['Insight', 'Draws a conclusion from a number rather than just reporting it'],
              ['Communication', 'Signposts, is concise, and gives a recommendation the client could act on'],
            ],
          },
          {
            kind: 'p',
            text: 'Notice that "reached the right answer" is not a row. Cases rarely have one, and two candidates with different conclusions can both score well if the reasoning holds. What cannot score is analysis that arrives without a stated structure, because the interviewer has nothing to mark it against.',
          },
        ],
      },
      {
        id: 'the-structure',
        title: 'Structuring out loud',
        blocks: [
          {
            kind: 'p',
            text: 'The habit that most improves a case performance is announcing the plan before executing it. Take thirty to sixty seconds of silence, write down three or four branches, then say them: "I would like to look at three things — the revenue side, the cost side, and whether the market itself has changed. Shall I start with revenue?"',
          },
          {
            kind: 'p',
            text: 'That sentence does three jobs at once. It shows the structure, which is the highest-weighted criterion. It gives the interviewer a chance to redirect you before you spend ten minutes in the wrong branch. And it makes the rest of the case legible, because every subsequent statement has a place in a stated plan.',
          },
          {
            kind: 'worked',
            title: 'A structure built for the case rather than pulled from a book',
            rows: [
              { label: 'The prompt', value: 'A regional bank\'s cost-to-income ratio has worsened over three years. Why?' },
              { label: 'Branch 1', value: 'Income: has revenue fallen, and in which product lines?' },
              { label: 'Branch 2', value: 'Cost: which cost lines have grown, and are they fixed or variable?' },
              { label: 'Branch 3', value: 'Mix: has the business shifted toward lower-margin products?' },
              { label: 'The question that follows', value: '"Do we know whether income has fallen in absolute terms, or only relative to costs?"' },
            ],
            conclusion:
              'Three branches, all specific to the ratio in question, stated in about twenty seconds. This is what a structure is; it is not a framework, and it is better than one because it fits.',
          },
        ],
      },
      {
        id: 'a-plan',
        title: 'A four-week plan from zero',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Week 1 — mechanics.** Read enough to understand the format and the four criteria. Start ten minutes of daily arithmetic drills: percentages, ratios, growth rates, order-of-magnitude estimates, all mental.',
              '**Week 2 — structuring only.** Take ten case prompts and build a structure for each without solving anything. Say each one out loud. Fifteen minutes per prompt.',
              '**Week 3 — full cases with a partner.** Five to eight complete cases, alternating who gives and who receives. Giving is as instructive as receiving because you see what vagueness sounds like.',
              '**Week 4 — pressure and polish.** Ten more cases, timed, with the partner deliberately interrupting and challenging. Add the market-sizing and estimation formats if they have not appeared yet.',
            ],
          },
          {
            kind: 'p',
            text: 'Find the partner first, because everything else is easy and this is the step that fails. University consulting societies, alumni networks and peers applying to the same firms all work, and so does the [informational interview](/learn/networking/informational-interviews) approach with someone a year ahead of you.',
          },
          {
            kind: 'warning',
            title: 'Reading cases silently does almost nothing',
            text: 'Case books make sense on the page and then evaporate under observation, because the difficulty is not the analysis — it is doing the analysis out loud while someone watches and interrupts. Twenty live cases beat a hundred read ones, and the difference is not marginal. The same principle governs [timed modelling tests](/learn/technical-interviews/modelling-tests).',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Consulting sells structured thinking by the week, and everything about the career follows from that business model. The pyramid shape means people are expected to progress or leave. The project rhythm means intensity comes in bursts with genuine gaps between them. And the hiring process tests one specific thing — whether you can decompose an unfamiliar problem out loud — because that is the product.',
      'The case interview is unusual among selection methods in being almost entirely trainable. It has published criteria, a recognisable format and a well-understood preparation path, and candidates who practise properly improve dramatically over a few weeks. That is unusual and it is worth exploiting: few other interview formats reward preparation this directly.',
      'What preparation cannot decide is whether the work suits you. The parts that make people leave — travel, imposed timelines, and the distance between recommending something and seeing whether it worked — are structural rather than incidental, and they are worth weighing before the offer rather than during year two.',
    ],
    definitions: [
      {
        term: 'Up or out',
        definition:
          'The convention that consultants progress within a defined window or leave, usually with support and often into a client organisation. It exists because the pyramid staffing model requires attrition from the middle, not because the firm is dissatisfied with the individual.',
      },
      {
        term: 'Case interview',
        definition:
          'An interview where you reason through a business problem out loud with the interviewer. Scored on structure, quantitative comfort, insight and communication rather than on reaching a specific answer, because most cases do not have one.',
      },
      {
        term: 'Structure',
        definition:
          'The stated breakdown of a problem into a few relevant parts, announced before any analysis begins. Distinct from a framework: a structure is built for the case in front of you, while a framework is a template applied to it, and interviewers can tell the difference immediately.',
      },
      {
        term: 'Market sizing',
        definition:
          'A case format asking you to estimate a quantity with no retrievable answer — how many of something exist, how large a market is. Scored on the visibility of the assumptions and the arithmetic rather than on the final figure.',
      },
    ],
    faq: [
      {
        q: 'What do consulting firms actually look for?',
        a: 'Structured reasoning under observation, comfort with numbers, the ability to draw a conclusion rather than report findings, and communication a client would tolerate in a room. The case interview tests all four directly. Academic record and prior experience mostly determine whether you reach the case; the case determines whether you get the offer.',
      },
      {
        q: 'Can I enter consulting from another industry?',
        a: 'Yes, and experienced hiring is a substantial route into most firms. Industry experience is an asset because it gives you a practice area where you already know something clients do not have to explain. The case interview still applies, and career changers often prepare less for it than graduates do — which is the most common reason a strong experienced candidate fails.',
      },
      {
        q: 'How is consulting different from an internal strategy role?',
        a: 'Breadth against depth. Consulting gives you many industries, many problem types and dense feedback, but you leave before the recommendation is implemented. An internal strategy team gives you one organisation, fewer problem types and considerably more accountability for whether the thing actually worked. Consultants who exit into strategy roles frequently cite that last point as the reason.',
      },
      {
        q: 'Is the travel as demanding as people say?',
        a: 'It varies more by practice and by current staffing than by firm, and it has shifted considerably as remote work has become normal. It remains the most common reason people leave, which makes it worth asking about specifically — what the current model is for the practice you would join, not what the firm\'s stated policy is.',
      },
    ],
  },
  articles,
};

export default content;
