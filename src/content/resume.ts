/**
 * Editorial copy and article bodies for the Resume topic.
 *
 * Loaded lazily by the topic and article routes (see `src/content/index.ts`) so
 * none of this text reaches the landing page.
 *
 * EDITORIAL CONSTRAINT, and it is the same one the money guides work under: no
 * claim about the world that this site cannot support. There are no recruiter
 * survey statistics here, no "six seconds per resume", no percentage of
 * applications rejected by software. Those numbers circulate endlessly and
 * almost none of them survive being traced to a source. What is here instead is
 * mechanism — what a reader does with a document, what a parser does with a
 * file, what a scoring sheet asks — because mechanism is checkable and a
 * borrowed statistic is not.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'resume-structure': {
    summary:
      'A resume is read in two passes: a fast scan that decides whether to read at all, and a slower read that looks for evidence. Structure it for the scan — name and target role, then a two-line summary, then experience in reverse chronological order with the most recent role given the most space, then education, then skills. Everything above the fold of the first page should answer "what is this person, and are they roughly right for this job?". One page under about eight years of experience, two after that, and never three, because the third page is read by nobody and its existence suggests you could not choose.',
    keyPoints: [
      'Reverse chronological order is not a convention you can ignore: a reader checks recency first, and any other order reads as concealment.',
      'The most recent role gets the most lines. A resume that gives equal space to a job from nine years ago is describing the wrong person.',
      'Skills belong near the bottom as a checkable index, not at the top as a claim — the evidence for them is in the experience section above.',
      'Length is a function of experience, not of achievement: one page under roughly eight years, two beyond it, and a third page never helps.',
    ],
    faq: [
      {
        q: 'Should a resume be one page or two?',
        a: 'One page for anyone with less than roughly eight years of experience, including every student and graduate applicant. Two pages once you have enough distinct, relevant roles that cutting one would remove something a reader needs. Three pages is not a longer resume, it is an unedited one — and the decision of what matters gets made by the reader instead of by you, which is never in your favour.',
      },
      {
        q: 'Do I need a professional summary at the top?',
        a: 'Two lines, and only if they say something the rest of the page does not. A summary that reads "results-driven professional with a passion for excellence" costs you the most valuable space on the document and tells a reader nothing. A useful one names what you are, the domain you work in, and the single most relevant thing you have done: "Credit risk analyst, four years in retail lending. Built the scorecard monitoring pack now used across three portfolios."',
      },
      {
        q: 'Should I include a photo, date of birth or marital status?',
        a: 'No, unless you are applying in a market where it is genuinely standard and expected. These fields add nothing a hiring decision should turn on, they expose you to bias you cannot see or contest, and in many markets they make the document awkward for an employer to circulate internally. The space is better spent on a line of evidence.',
      },
    ],
    sections: [
      {
        id: 'two-passes',
        title: 'A resume is read twice, very differently',
        blocks: [
          {
            kind: 'p',
            text: 'The first pass is a triage. Someone with forty documents to get through is asking one question — is this person plausibly the thing we are hiring for? — and they answer it from the top third of page one. The second pass only happens if the first one succeeded, and it is slower, more sceptical, and looking for evidence rather than claims.',
          },
          {
            kind: 'p',
            text: 'Almost every structural decision follows from that split. The top of the page is triage material: who you are, what you do, and the one line that makes you relevant to this role. The body is evidence for the second reader. Anything that serves neither — an objective statement, a list of soft-skill adjectives, a hobbies section that says "reading and travelling" — is occupying space in the most valuable part of the document.',
          },
          {
            kind: 'note',
            title: 'Write for the second reader, format for the first',
            text: 'The content that wins you an interview is the evidence. But it is only ever read if the format survives triage. Both matter, and they are separate problems — which is why a resume with excellent content and a chaotic layout fails just as reliably as a beautiful one with nothing in it.',
          },
        ],
      },
      {
        id: 'section-order',
        title: 'The order, and why it is that order',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Name and contact.** Name, city, phone, email, and a link to your [LinkedIn profile](/learn/linkedin/linkedin-profile). One line. No full postal address — it is not needed and it is personal data being circulated by email.',
              '**Target and summary.** Two lines that say what you are and the most relevant thing you have done. Cut this entirely rather than fill it with adjectives.',
              '**Experience.** Reverse chronological. Employer, role, dates, then three to five bullets of evidence. The current or most recent role gets the most bullets.',
              '**Education.** Institution, qualification, year. Grades only if they are strong or if the employer asks — [graduate programs](/learn/graduate-programs/application-stages) usually do.',
              '**Skills and certifications.** A scannable index, not a claim: the tools, languages and qualifications a reader can check against the experience above.',
            ],
          },
          {
            kind: 'p',
            text: 'Students and career changers are the only common exception, and only on one point: education moves above experience when the qualification is the most relevant thing you have. It moves back down the moment you have a year of relevant work.',
          },
          {
            kind: 'warning',
            title: 'A skills section is not evidence',
            text: 'Listing "financial modelling, SQL, stakeholder management" proves nothing on its own, and an interviewer who sees a skill in that list and nothing supporting it in the experience section will ask about it specifically. Every skill you list should be traceable to a bullet above it.',
          },
        ],
      },
      {
        id: 'space-allocation',
        title: 'Where the space goes',
        blocks: [
          {
            kind: 'p',
            text: 'Space on a resume is a statement about what matters. A page that gives six bullets to an internship from four years ago and two to your current role is telling the reader that the internship was more significant, which is almost never what you mean.',
          },
          {
            kind: 'table',
            caption: 'A workable allocation for a single-page resume',
            head: ['Section', 'Lines', 'What it is doing'],
            rows: [
              ['Header', '2', 'Identity and how to reach you'],
              ['Summary', '2–3', 'Triage: what you are, and why for this role'],
              ['Current role', '4–5', 'The bulk of the evidence'],
              ['Previous role', '3–4', 'Trajectory and range'],
              ['Earlier roles', '1–2 each', 'Continuity, not detail'],
              ['Education', '2–3', 'Qualification and institution'],
              ['Skills', '2–3', 'A checkable index'],
            ],
            note: 'Roughly 25 lines of content. If yours needs 40 on one page, the font is too small and the first reader will not attempt it.',
          },
          {
            kind: 'p',
            text: 'The corollary is that older roles compress hard. A job from eight years ago earns one line — employer, title, dates — unless something in it is directly relevant to the role you are applying for now. Nobody is going to ask about it, and the space it frees goes to the work that will actually be discussed.',
          },
        ],
      },
      {
        id: 'tailoring',
        title: 'Tailoring without rewriting',
        blocks: [
          {
            kind: 'p',
            text: 'A resume rewritten from scratch for each application is a good idea that lasts about four applications. The sustainable version is a master document with more evidence than fits, from which each application takes a subset: you keep every bullet you have ever written in a longer working file, then cut rather than compose.',
          },
          {
            kind: 'p',
            text: 'What actually changes between applications is small — the summary line, the order of bullets within the current role, and which two or three skills lead the skills index. That takes ten minutes and produces a document that reads as though it were written for the job, because in the only sense that matters, it was.',
          },
          {
            kind: 'tool',
            toolId: 'budget',
            text: 'Once you have an offer to weigh, the arithmetic side of the decision starts — the Budget Builder shows what a given take-home actually supports.',
          },
          {
            kind: 'p',
            text: 'The other half of this is making sure the document survives the software it will be uploaded into. That is a formatting problem rather than an editorial one, and it is covered in [how an ATS actually works](/learn/ats/how-ats-works).',
          },
        ],
      },
    ],
  },

  'quantifying-achievements': {
    summary:
      'The difference between a resume that gets interviews and one that does not is usually the difference between describing duties and describing outcomes. "Responsible for monthly reporting" tells a reader what your job title already implied. "Rebuilt the monthly close pack, cutting preparation from four days to one" tells them what changed because you were there. When your work was never formally measured — which is most work — you can still quantify it by scale, by frequency, by time saved, or by the size of what you were trusted with. The number does not have to be impressive. It has to be specific, because specificity is what makes a claim believable.',
    keyPoints: [
      'A duty describes the job; an outcome describes you. Only the second one distinguishes you from every other applicant with the same title.',
      'Four quantities are almost always available: scale, frequency, time saved and value handled — even when nobody measured your performance.',
      'A modest, specific number beats an impressive vague one, because a reader can picture the first and discounts the second automatically.',
      'Every quantified bullet is also an interview answer waiting to happen, so only write ones you can talk about for three minutes.',
    ],
    faq: [
      {
        q: 'What if my work was never measured?',
        a: 'Then measure it now, from what you remember, and describe the scale rather than the improvement. How many accounts, how many reports a month, how large a portfolio, how many people in the team, how many countries in scope. "Reviewed roughly 60 onboarding files a week across four jurisdictions" is quantified and entirely honest without claiming any improvement at all.',
      },
      {
        q: 'Can I estimate a number I am not certain of?',
        a: 'Yes, if you signal that it is an estimate and you would defend it in an interview. "Around 40 a week" and "roughly a third of the portfolio" are honest and useful. Inventing a precise figure you cannot reconstruct is not, and it fails at exactly the wrong moment — when an interviewer asks how you arrived at it.',
      },
      {
        q: 'Should every bullet have a number in it?',
        a: 'No, and a resume where every line ends in a percentage reads as manufactured. Aim for a number in most bullets on your current role and roughly half elsewhere. The bullets without numbers should be the ones describing something a number would not capture — a decision, a piece of judgement, something you built that did not exist.',
      },
    ],
    sections: [
      {
        id: 'duty-vs-outcome',
        title: 'The rewrite that does most of the work',
        blocks: [
          {
            kind: 'p',
            text: 'Nearly every weak resume bullet starts the same way: "responsible for", "involved in", "assisted with", "worked on". Those openings describe the boundaries of a job rather than anything that happened inside them, and every other applicant with the same title could write the identical line.',
          },
          {
            kind: 'table',
            caption: 'The same work, described two ways',
            head: ['Duty', 'Outcome'],
            rows: [
              [
                'Responsible for the monthly management reporting pack',
                'Rebuilt the monthly reporting pack in Excel, cutting preparation from four days to one',
              ],
              [
                'Involved in the KYC remediation project',
                'Cleared a backlog of ~900 KYC files over five months as one of three analysts on the remediation',
              ],
              [
                'Assisted with credit assessments for SME clients',
                'Wrote credit assessments for SME facilities up to ₹5 crore, presenting six to the credit committee',
              ],
            ],
            note: 'The right-hand column is not longer. It is the same length with the vague words replaced by specific ones.',
          },
          {
            kind: 'p',
            text: 'The mechanical version of the rewrite: start with a verb that describes what you did, follow it with the object, then add the scale or the result. Verb, object, number. If the number does not exist, the scale almost always does.',
          },
        ],
      },
      {
        id: 'four-quantities',
        title: 'Four numbers you almost always have',
        blocks: [
          {
            kind: 'p',
            text: 'The common objection to quantifying achievements is that the work was not measured. That is usually true and rarely a problem, because four different quantities are available in most jobs and only one of them is a performance metric.',
          },
          {
            kind: 'list',
            items: [
              '**Scale** — how much of the thing there was. Accounts, files, clients, transactions, countries, systems, line items, people in the team.',
              '**Frequency** — how often it happened. Daily, weekly, forty a month, every quarter-end, two release cycles a year.',
              '**Time** — how long it took before and after, or how much of a deadline you had. This is the easiest improvement to evidence honestly.',
              '**Value** — the size of what you were trusted with. Portfolio value, budget, facility size, revenue in scope. It measures responsibility rather than performance, which is often the more useful signal.',
            ],
          },
          {
            kind: 'worked',
            title: 'Quantifying a job nobody measured',
            rows: [
              { label: 'The raw duty', value: 'Handled customer complaints for the retail banking team' },
              { label: 'Scale', value: 'About 25 cases open at any time' },
              { label: 'Frequency', value: 'Around 15 new cases a week' },
              { label: 'Time', value: 'Regulatory deadline of 30 days per case' },
              { label: 'Value', value: 'Cases up to ₹2 lakh in disputed amounts' },
            ],
            conclusion:
              'The bullet writes itself: "Managed a rolling caseload of ~25 retail banking complaints, resolving around 15 new cases a week within the 30-day regulatory deadline." No performance metric was needed, and every figure is defensible.',
          },
        ],
      },
      {
        id: 'believability',
        title: 'Why the modest number wins',
        blocks: [
          {
            kind: 'p',
            text: 'There is a strong instinct to reach for the biggest number available, and it backfires. A reader who sees "improved efficiency by 300%" does not picture a threefold improvement — they wonder what the baseline was, whether it was measured, and whether the rest of the document is calibrated the same way. Every subsequent claim is discounted.',
          },
          {
            kind: 'p',
            text: 'A small, precise, checkable figure has the opposite effect. "Cut the reconciliation run from 90 minutes to 35" is unremarkable in isolation and completely credible, and credibility transfers to the lines around it. The purpose of a number on a resume is not to impress. It is to make the reader believe the sentence.',
          },
          {
            kind: 'warning',
            title: 'Every number is a question you have agreed to answer',
            text: 'A quantified bullet is an invitation. If you cannot explain how you arrived at the figure, what you actually did, and what you would do differently, it will cost you more in the interview than it gained you on the page. Write bullets you want to be asked about — that is precisely what a [STAR answer](/learn/behavioural-interviews/star-method) is built from.',
          },
        ],
      },
      {
        id: 'building-the-bank',
        title: 'Building the evidence bank once',
        blocks: [
          {
            kind: 'p',
            text: 'Doing this from memory at application time produces thin bullets, because the specifics have gone. The version that works is a running file you add to while the details are fresh: one entry per piece of work, with the situation, what you did, the numbers as you knew them, and the outcome. Ten minutes at the end of a project.',
          },
          {
            kind: 'p',
            text: 'That file then serves three purposes rather than one. It is where resume bullets come from, it is the raw material for [interview preparation](/learn/interview-preparation/preparation-system), and it is what makes a performance review conversation possible without a week of reconstruction. The same evidence, three uses — which is the only reason the habit survives.',
          },
          {
            kind: 'p',
            text: 'Structure each entry the way a behavioural interviewer will ask for it, and the conversion is free. Most of the work of preparing for an interview is remembering; a file that did the remembering for you at the time removes it.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'A resume is not a record of your career. It is an argument, made to a specific stranger, that a conversation with you is worth thirty minutes of their week. Everything that does not advance that argument is taking up space, and the most common problem with a resume is not that it is badly written but that it is a complete and faithful list of things you have done.',
      'The two failure modes are separate and need separate fixes. A resume can fail on format — unreadable in the first ten seconds, or mangled by the software it was uploaded into — and it can fail on content, where a reader gets through it and finds nothing that distinguishes you from six other applicants with the same job title. Formatting problems are cheap to fix. Content problems take an afternoon and are worth it.',
      'The guides in this topic assume you are applying to real roles at real employers rather than optimising a document in the abstract. Where advice here conflicts with something you have read elsewhere, the difference is usually that the other version is optimising for a machine that does not work the way people think it does — which is worth understanding before you act on it.',
    ],
    definitions: [
      {
        term: 'Reverse chronological',
        definition:
          'Listing roles most recent first. It is the format every reader expects and every parser handles correctly, and any deviation from it — a functional or skills-based resume — is read as an attempt to obscure a gap or a lack of relevant recent work, whether or not that is why you chose it.',
      },
      {
        term: 'Evidence bullet',
        definition:
          'A line describing something that happened because you were there, with enough specificity that a reader can picture it. Distinguished from a duty bullet, which describes the boundaries of the job and would be identical for anyone who held it.',
      },
      {
        term: 'Master resume',
        definition:
          'A working document holding every bullet you have ever written about your work, far longer than any resume you would send. Applications are produced by cutting from it rather than composing from scratch, which is the only version of tailoring that survives more than a handful of applications.',
      },
      {
        term: 'Tailoring',
        definition:
          'Adjusting a resume for a specific role — typically the summary line, the order of bullets and the leading skills. It does not mean rewriting the document, and it does not mean inserting keywords into sentences where they do not belong.',
      },
    ],
    faq: [
      {
        q: 'How long should a resume be?',
        a: 'One page for anyone with under roughly eight years of experience, two beyond that. The rule is about how much genuinely relevant material exists, not about seniority as such — a specialist with fifteen years in one function may still have a strong one-page resume. What does not work is three pages, because the third page is not read and its existence tells a reader you could not decide what mattered.',
      },
      {
        q: 'Should I write a different resume for every application?',
        a: 'No — you should keep one master document with more evidence than fits, and cut a version from it per application. Rewriting from scratch each time is unsustainable and people abandon it within a week. Cutting takes ten minutes and produces a better result, because you are choosing among things you already wrote carefully rather than composing under deadline pressure.',
      },
      {
        q: 'Do resume templates with columns and graphics hurt me?',
        a: 'Sometimes, and the reason is parsing rather than taste. Multi-column layouts, text inside images and content in headers or footers are the layouts most likely to be read out of order or dropped entirely by the software that ingests your file. A clean single-column document is not a stylistic preference; it is the format most likely to survive intact.',
      },
      {
        q: 'Should I include a cover letter if it is optional?',
        a: 'It depends on the application type, and the honest answer is that it is often not read. Where it counts is a smaller employer, a role you are reaching for, or an application where you have a specific reason for approaching this employer that the resume cannot carry. Where it does not is a high-volume graduate scheme with a structured form.',
      },
    ],
  },
  articles,
};

export default content;
