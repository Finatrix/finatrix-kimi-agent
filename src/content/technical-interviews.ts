/**
 * Editorial copy and article bodies for the Technical Interviews topic.
 *
 * Scoped deliberately to finance, risk and analytical roles rather than to
 * software engineering, because that is who FinatriX Careers serves and because
 * generic "technical interview" advice written for coding interviews transfers
 * badly to a credit case or a valuation discussion.
 *
 * No question banks. A list of two hundred questions is the least useful format
 * for this material: it encourages memorisation, and memorised technical answers
 * are the ones that collapse fastest under a follow-up.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'finance-technical-questions': {
    summary:
      'Technical interviews in finance and risk roles draw from four question types, and knowing which one you are in tells you what a good answer sounds like. Definitional questions want a crisp definition plus why it matters. Mechanical questions want a walk through a calculation with the assumptions named. Judgement questions want a reasoned position, not a correct answer. Estimation questions want visible arithmetic and stated assumptions rather than a right number. The single most valuable habit across all four is thinking out loud, because the interviewer is assessing your reasoning and cannot assess silence — and the recovery when you do not know is to say so and then reason toward the boundary of what you do know.',
    keyPoints: [
      'Four question types — definitional, mechanical, judgement, estimation — and each has a different shape of good answer.',
      'Think out loud throughout: an interviewer scores reasoning, and a correct answer arrived at silently evidences almost nothing.',
      'Name your assumptions before you calculate. An answer with stated assumptions can be corrected; one without them can only be wrong.',
      '"I do not know, but here is how I would work it out" scores far better than a confident guess that turns out to be wrong.',
    ],
    faq: [
      {
        q: 'What happens if I genuinely do not know the answer?',
        a: 'Say so, immediately and without apology, then show the boundary of what you do know and how you would find the rest. "I have not worked with that instrument directly. What I know is that it behaves like X in this respect, so I would expect Y — is that the direction?" That is a strong answer. A guess delivered confidently is the weak one, because it tells the interviewer they cannot rely on you to flag uncertainty.',
      },
      {
        q: 'How much detail is expected at graduate level?',
        a: 'Considerably less than candidates fear on content, and rather more than they expect on reasoning. A graduate is not expected to know how a specific model is calibrated. They are expected to explain what a discount rate does, why a number moves when an input moves, and to notice when an answer is implausible. Precision about the basics beats vague familiarity with the advanced.',
      },
      {
        q: 'Should I memorise technical question lists?',
        a: 'Use them to find your gaps, not to prepare answers. A memorised definition sounds memorised, and the follow-up — "why does that matter for this business?" — is not on the list. Better to take twenty core concepts and be able to explain each one to a smart person outside finance, because that is the same skill the interview is testing.',
      },
    ],
    sections: [
      {
        id: 'four-types',
        title: 'Four question types, four shapes of answer',
        blocks: [
          {
            kind: 'table',
            caption: 'What each question type is testing, and what a good answer contains',
            head: ['Type', 'Example shape', 'A good answer contains'],
            rows: [
              [
                'Definitional',
                '"What is duration?"',
                'A one-sentence definition, then why it matters to someone doing this job',
              ],
              [
                'Mechanical',
                '"Walk me through how you would size this facility"',
                'The steps in order, the assumptions named, the sanity check at the end',
              ],
              [
                'Judgement',
                '"Would you lend to this borrower?"',
                'A position, the two or three factors that drove it, and what would change it',
              ],
              [
                'Estimation',
                '"How much does this portfolio lose in a downturn?"',
                'Visible arithmetic, stated assumptions, a plausible order of magnitude',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'Misreading the type is the most common way a well-prepared candidate answers badly. A judgement question answered with a definition sounds evasive; a definitional question answered with a fifteen-minute discussion sounds unfocused. If you are unsure which you are in, ask — "do you want the definition or how I would apply it here?" is a good question, not a weak one.',
          },
        ],
      },
      {
        id: 'thinking-out-loud',
        title: 'Thinking out loud, and why silence costs you',
        blocks: [
          {
            kind: 'p',
            text: 'The mark sheet in a technical interview usually has more lines about approach than about the answer. That is not generosity; it is because the job involves reasoning through unfamiliar problems, and an interviewer who cannot see your reasoning has no evidence about the thing they are hiring for.',
          },
          {
            kind: 'p',
            text: 'So narrate. State what you are being asked, what you will assume, what you will calculate, and what would make you doubt the result. It feels laborious and it is the single highest-scoring habit available. It also gives the interviewer somewhere to intervene: most will correct a wrong assumption early rather than watch you build on it, and that only happens if the assumption was spoken.',
          },
          {
            kind: 'worked',
            title: 'The same estimation question, narrated and not',
            rows: [
              { label: 'Question', value: 'Roughly what share of a retail loan book might be in arrears in a bad year?' },
              { label: 'Silent answer', value: '"Maybe five percent."' },
              {
                label: 'Narrated answer',
                value: '"I will assume unsecured retail, so higher than a mortgage book. In a normal year I would expect low single digits; a bad year might be two to three times that, so mid-to-high single digits. I am assuming no policy change and no large concentration. If it were secured I would halve it."',
              },
            ],
            conclusion:
              'Both give a similar number. Only one of them shows the model behind the number, and only one can be corrected mid-answer — which is the difference between a candidate who is easy to work with and one who is not.',
          },
        ],
      },
      {
        id: 'preparing',
        title: 'Preparing twenty concepts rather than two hundred questions',
        blocks: [
          {
            kind: 'p',
            text: 'Technical preparation collapses to a short list if you organise it by concept. Take the twenty ideas your target function actually uses daily and be able to explain each one twice: once to a colleague, once to an intelligent person who does not work in finance. The second version is the harder and more useful one.',
          },
          {
            kind: 'list',
            items: [
              'For a credit role: probability of default, loss given default, exposure at default, security and its limits, covenants, cash-flow versus asset-based lending.',
              'For a markets role: yield and price, duration, the shape of a curve, what a hedge does and what it costs, liquidity versus solvency.',
              'For a risk role: the three lines of defence, inherent versus residual risk, appetite and limits, what a control actually is — see [risk career paths](/learn/risk-compliance-careers/risk-career-paths).',
              'Across all of them: the time value of money, and why the same cash flow is worth different amounts at different dates — the mechanics are in [real versus nominal returns](/learn/inflation/real-returns).',
            ],
          },
          {
            kind: 'note',
            title: 'Arithmetic under mild pressure',
            text: 'Percentages, ratios and rough compounding, done out loud without a calculator, appear in almost every finance technical interview. Ten minutes of practice a day for a week removes the specific fear of being asked to work something out in front of someone, which is what actually degrades performance.',
          },
        ],
      },
    ],
  },

  'modelling-tests': {
    summary:
      'A timed modelling or case test is marked on structure, accuracy, judgement and communication — usually in that order of weight, and rarely on how much you finished. Candidates lose marks before they start by opening the spreadsheet and typing: the first five minutes should be spent reading the brief, deciding the layout, and writing down what the output needs to be. A model that is half-built but clearly laid out, with assumptions in one visible block and a stated conclusion, scores better than a complete one where the marker cannot follow the logic. The most valuable single habit is separating inputs from calculations, because it makes every other mark accessible.',
    keyPoints: [
      'Marks are weighted toward structure and judgement, not completeness — finishing is not the objective and rarely the differentiator.',
      'Spend the first five minutes not typing: read the brief, plan the layout, write down what the answer has to look like.',
      'Inputs in one clearly labelled block, calculations elsewhere, no hard-coded numbers inside formulas. This single habit carries most of the structure marks.',
      'Reserve the last five minutes for a sanity check and a one-line conclusion; an unstated conclusion is an unscored one.',
    ],
    faq: [
      {
        q: 'What if I run out of time?',
        a: 'Expected, and usually designed in. The tests are frequently set so that finishing is not realistic, precisely to see what you prioritise. Make sure the part you did complete is coherent and labelled, and write one line stating what you would have done next and what you would expect it to show. That line often scores better than the section it replaces.',
      },
      {
        q: 'How much does formatting matter?',
        a: 'More than seems reasonable, because it is a proxy for something the marker genuinely cares about — whether your work can be picked up and checked by someone else. Consistent number formats, labelled rows, units stated, inputs visually distinct from calculations. It takes almost no time and it is directly on the mark sheet in most structured tests.',
      },
      {
        q: 'Are case tests different from modelling tests?',
        a: 'The medium differs; the marking does not, much. A case test asks for a recommendation supported by analysis, a modelling test asks for a model that produces one. Both reward a stated structure up front, visible assumptions, and a conclusion that answers the question that was asked. [Case interviews](/learn/consulting-careers/case-interviews) covers the spoken version of the same skill.',
      },
    ],
    sections: [
      {
        id: 'where-the-marks-are',
        title: 'Where the marks actually are',
        blocks: [
          {
            kind: 'table',
            caption: 'Typical weighting on a timed modelling or case test',
            head: ['Criterion', 'Rough weight', 'What the marker looks for'],
            rows: [
              ['Structure', 'High', 'Can someone else follow and check this?'],
              ['Judgement', 'High', 'Sensible assumptions, and the important ones flagged'],
              ['Accuracy', 'Medium', 'The arithmetic holds where it was attempted'],
              ['Communication', 'Medium', 'A conclusion, stated, that answers the question'],
              ['Completeness', 'Low', 'How much got finished'],
            ],
            note: 'Illustrative of the shape rather than any one employer\'s sheet. The consistent finding is that completeness is weighted lowest and candidates optimise for it hardest.',
          },
          {
            kind: 'p',
            text: 'Once you have seen that table, the strategy is obvious and almost nobody follows it: build less, label everything, and always reach a stated conclusion.',
          },
        ],
      },
      {
        id: 'first-five-minutes',
        title: 'The first five minutes',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Read the whole brief before touching anything.** The final paragraph frequently changes the required output, and a model built for the wrong output scores near zero regardless of quality.',
              '**Write the answer shape down.** One sentence: "the output is a three-year cash flow with a headroom figure against the covenant." Everything you build serves that sentence.',
              '**Sketch the layout.** Assumptions block at the top, calculations below, output at the bottom or on the right. Decide once.',
              '**List the assumptions you will need.** Growth, margin, timing, rate. Put them in the block as labelled cells now, even before you know the values.',
            ],
          },
          {
            kind: 'warning',
            title: 'Never hard-code a number inside a formula',
            text: 'A rate typed directly into a calculation is invisible to the marker, impossible to sensitise, and a specific line on most mark sheets. Every number that could change belongs in the assumptions block with a label next to it.',
          },
        ],
      },
      {
        id: 'last-five-minutes',
        title: 'The last five minutes, which most people spend building',
        blocks: [
          {
            kind: 'p',
            text: 'Stop early. The final five minutes are worth more spent checking and concluding than spent adding a section nobody asked for.',
          },
          {
            kind: 'list',
            items: [
              '**Sanity-check one number.** Does the output have a plausible order of magnitude? An implausible figure left unremarked is the worst outcome; the same figure with "this looks high — likely because I assumed X" beside it is a judgement mark.',
              '**Check the units and the periods.** Annual rate applied to a monthly period is the most common silent error in timed tests.',
              '**Write the conclusion.** One or two sentences: what the answer is, what it depends on most, and what you would check next.',
              '**Label anything unfinished.** "Not attempted — would model as Y" is honest and scoreable. Leaving it blank is neither.',
            ],
          },
          {
            kind: 'p',
            text: 'The habit generalises well beyond the test. Work that a colleague can pick up, check and extend is the actual deliverable in most analytical jobs, and a timed test is a compressed version of exactly that. Preparing for it properly is not interview theatre — it is a rehearsal of the job, which is why employers keep using it.',
          },
          {
            kind: 'p',
            text: 'Practising for it is straightforward and almost nobody does it. Take a published set of figures — an annual report, a public dataset — set a forty-five minute timer, and build something that answers a question you have posed yourself. The value is not in the model; it is in discovering how long the setup actually takes you, which is invariably longer than expected and is the single thing most likely to cost you marks on the day.',
          },
          {
            kind: 'p',
            text: 'Two mechanical habits are worth building in that practice because they pay in every timed exercise. Get the layout down before any calculation, so the structure marks are secured whatever happens to the clock. And write the conclusion sentence at the halfway point rather than the end — a conclusion drafted while you still have thirty minutes can be revised, while one attempted with four minutes remaining frequently does not get written at all. The same discipline underpins a spoken [case interview](/learn/consulting-careers/case-interviews).',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'A technical interview for a finance, risk or analytical role is not a quiz, though it is frequently prepared for as one. It is a check that you can reason out loud about the subject matter under mild pressure, that you know what you do not know, and that your working can be followed by someone else.',
      'That reframing changes the preparation entirely. Memorising two hundred questions produces answers that sound memorised and collapse at the first follow-up. Understanding twenty concepts well enough to explain each of them twice — once to a colleague and once to an intelligent outsider — covers far more ground, because the interviewer is probing whether the understanding is real rather than whether the definition is word-perfect.',
      'The same logic runs through the written formats. A timed modelling or case test is marked mostly on structure and judgement, and only lightly on how much you finished, which means the winning strategy is almost the opposite of the instinctive one.',
    ],
    definitions: [
      {
        term: 'Estimation question',
        definition:
          'A question with no retrievable answer, asked to see how you decompose a problem: how large a market is, how much a portfolio might lose. Marked on the visibility of the assumptions and the arithmetic, not on the number.',
      },
      {
        term: 'Assumptions block',
        definition:
          'A single labelled area of a model holding every input that could change. Separating it from the calculations is the one habit that carries most of the structure marks on a timed test, and it is what makes a model checkable by anyone but its author.',
      },
      {
        term: 'Sanity check',
        definition:
          'Asking whether an answer has a plausible order of magnitude before presenting it. Flagging an implausible result yourself scores as judgement; presenting it unremarked scores as a failure to notice, which is the more serious finding.',
      },
      {
        term: 'Case test',
        definition:
          'A written or spoken exercise asking for a recommendation supported by analysis, usually under time pressure. Scored on structure, the quality of the assumptions and whether the recommendation actually answers the question posed.',
      },
    ],
    faq: [
      {
        q: 'What do technical interviews in finance actually test?',
        a: 'Whether you can reason about the subject rather than recite it. The questions cluster into definitions, mechanics, judgement calls and estimations, and in every one of them the interviewer is following your thinking. Candidates who narrate their reasoning score well even when they reach an imperfect answer; candidates who answer silently and correctly evidence surprisingly little.',
      },
      {
        q: 'How do I prepare if I am not from a finance background?',
        a: 'Learn twenty concepts properly rather than a hundred superficially, and choose them from what the target function does daily. A career changer who can explain the time value of money, what a discount rate does, and why a secured loan behaves differently from an unsecured one is better placed than a finance graduate who has memorised terminology without the underlying mechanics.',
      },
      {
        q: 'Is it acceptable to ask for clarification?',
        a: 'Yes, and it is usually scored positively. Asking whether a question wants the definition or the application, or confirming what the output of a case should be, is what a competent colleague would do before starting work. What is penalised is asking so many clarifying questions that you never commit to an approach.',
      },
      {
        q: 'How much mental arithmetic should I expect?',
        a: 'Enough that being visibly uncomfortable with it costs you. Percentages, ratios, rough compounding and order-of-magnitude checks come up constantly, usually without a calculator. It is a practisable skill and a week of short daily drills removes most of the anxiety, which is what actually degrades performance in the room.',
      },
    ],
  },
  articles,
};

export default content;
