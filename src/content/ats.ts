/**
 * Editorial copy and article bodies for the ATS topic.
 *
 * The hardest editorial constraint on this topic is that most of what is written
 * about applicant tracking systems is wrong, confidently sourced to nobody, and
 * repeated because it is frightening. Nothing here asserts a rejection rate, a
 * scoring threshold or a "75% of resumes are never seen by a human" figure. What
 * is described is only what these systems demonstrably do: parse a file into
 * fields, store the record, and let a recruiter search it.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'how-ats-works': {
    summary:
      'An applicant tracking system is a database with a recruiter interface, not a gatekeeper with an opinion. It does three things: it parses your uploaded file into structured fields, it stores the record against the job, and it lets a recruiter filter and search that store. The widely repeated idea that it silently scores you and rejects you below a threshold describes a feature most teams do not switch on, and even where a match score exists it is a sort order rather than a bin. What genuinely costs you an application is a file that parsed badly, so the record a recruiter searches does not contain the words that would have found you.',
    keyPoints: [
      'The failure mode is a bad parse, not a hostile algorithm — your resume is usually rejected by absence from a search result, not by a score.',
      'Recruiters search the stored record with keywords and filters, which is why the words on your resume matter more than their density.',
      'Knockout questions on the application form do auto-reject, and they are answered by you rather than inferred from your resume.',
      'Anything you can only see because of formatting — a two-column layout, a header, a graphic — may not exist in the parsed record at all.',
    ],
    faq: [
      {
        q: 'Does an ATS automatically reject my resume?',
        a: 'Almost never on the resume itself. What does auto-reject is the application form: knockout questions about work authorisation, notice period, minimum qualification or location are evaluated as you submit, and a disqualifying answer can close the application immediately. Those are your own answers to explicit questions, not a machine reading your document and forming a judgement about it.',
      },
      {
        q: 'What is a match score, and does it decide anything?',
        a: 'Some systems compute a similarity score between the parsed resume and the job requisition and use it to order the candidate list. Where it exists it usually decides what a recruiter looks at first, not who is excluded — and plenty of teams sort by application date instead. Treat it as an argument for making your relevant experience easy to find, not as a threshold to game.',
      },
      {
        q: 'Should I paste the job description in white text to beat the system?',
        a: 'No. It is trivially visible in the parsed record, which is plain text with no colours, and it is read as an attempt to deceive — which ends the application and sometimes the relationship with that employer. It also does not work for the thing it is supposed to work for, because the recruiter searching the record sees the stuffed text sitting outside any sensible context.',
      },
    ],
    sections: [
      {
        id: 'three-jobs',
        title: 'The three things the software actually does',
        blocks: [
          {
            kind: 'p',
            text: 'An applicant tracking system exists because an employer running dozens of vacancies needs one place to keep candidates, stages, notes and compliance records. Everything it does for you as an applicant is downstream of that purpose.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Parse.** Your uploaded file is converted into structured fields — name, contact details, employers, titles, dates, education, a block of free text. This is the step that can go wrong, and when it does the rest inherits the damage.',
              '**Store.** The parsed record is attached to the requisition along with your form answers. From this point the file you uploaded is mostly an attachment; the record is the thing the system operates on.',
              '**Search.** A recruiter filters and searches that store — by keyword, by qualification, by location, by answers to the screening questions. This is where an application is won or lost.',
            ],
          },
          {
            kind: 'note',
            title: 'The mental model to replace',
            text: 'The folk version is a machine that reads your resume, forms a judgement and discards you. The accurate version is a filing cabinet with a good search box. Your goal is to be findable and legible in it, not to defeat it.',
          },
        ],
      },
      {
        id: 'the-real-failure',
        title: 'What actually loses you the application',
        blocks: [
          {
            kind: 'p',
            text: 'If a recruiter searches the store for "IFRS 9" and your record does not contain that string — because your resume said "the new impairment standard", or because the words were inside a graphic, or because your two-column layout interleaved the text into nonsense — you are not in the result set. Nothing rejected you. You were never a candidate for that search.',
          },
          {
            kind: 'p',
            text: 'That is the whole risk, and it explains why the useful advice is so mundane: use the terms the industry and the job description use, put them in sentences that describe real work, and upload a file that parses cleanly. The [formatting guide](/learn/ats/ats-formatting) covers exactly which layout choices break a parse and which are harmless.',
          },
          {
            kind: 'warning',
            title: 'Knockout questions are the real automation',
            text: 'The genuinely automatic rejections happen on the form. "Do you have the right to work in this country without sponsorship?" and "Do you hold a bachelor\'s degree?" are evaluated instantly. If sponsorship applies to you, how you handle that question matters — see [answering visa questions](/learn/international-students/visa-questions).',
          },
        ],
      },
      {
        id: 'keywords',
        title: 'Keywords, without the keyword stuffing',
        blocks: [
          {
            kind: 'p',
            text: 'The word "keyword" has done a lot of damage here, because it suggests density matters. It does not. A record either contains a term or it does not; repeating "stakeholder management" nine times makes the document worse to read and no easier to find.',
          },
          {
            kind: 'p',
            text: 'What is worth doing is checking vocabulary. Employers search using the words in their own job descriptions, and organisations name the same thing differently — reconciliation versus substantiation, transaction monitoring versus alert review, provisioning versus impairment. If you have done the work and used a different name for it, name it both ways once, in a sentence where both are true.',
          },
          {
            kind: 'worked',
            title: 'A vocabulary fix, not a keyword insert',
            rows: [
              { label: 'Job description says', value: '"transaction monitoring", "alert disposition"' },
              { label: 'Your original bullet', value: 'Reviewed flagged payments and cleared or escalated them' },
              { label: 'Revised bullet', value: 'Handled transaction monitoring alerts, dispositioning ~40 a week and escalating to the MLRO where warranted' },
            ],
            conclusion:
              'The revision is more specific, uses the employer\'s vocabulary, and would be a better sentence even if no software existed. That is the test for every change made for an ATS.',
          },
        ],
      },
    ],
  },

  'ats-formatting': {
    summary:
      'Only a handful of formatting choices genuinely break resume parsing, and most of the advice circulating about it is myth. What actually causes damage: multi-column layouts, text in headers and footers, content inside images or text boxes, tables used for layout, and non-standard section names. What is harmless despite the folklore: PDFs, bullet points, bold text, colour, and a sensible amount of white space. The five-minute test that settles it for your own file is to save it as plain text and read the result — if the plain-text version is coherent and in the right order, so is the parsed record.',
    keyPoints: [
      'Multi-column layouts are the single most damaging choice, because a parser reading left to right can interleave two columns into nonsense.',
      'A text-based PDF is fine and has been for years; the advice to always use .docx is a decade out of date for most systems.',
      'Anything in a header, a footer, a text box or an image may simply not exist in the parsed record, contact details included.',
      'Use the standard section names — Experience, Education, Skills — because parsers segment on them and creative headings defeat that.',
    ],
    faq: [
      {
        q: 'Is a PDF or a Word document safer?',
        a: 'A text-based PDF is fine for essentially every modern system, and it has the advantage that it renders identically for the human who eventually opens it. The one PDF that fails is a scanned or image-based one, which contains no text at all. Use .docx if the application explicitly asks for it — that instruction sometimes means their parser is old, and it costs nothing to comply.',
      },
      {
        q: 'Do bullet points and bold text cause problems?',
        a: 'No. Standard bullet characters and bold or italic text parse without difficulty and make the document far more readable for the person who matters. The advice to strip all formatting produces a wall of text that survives parsing perfectly and then loses at the human stage, which is the stage that decides.',
      },
      {
        q: 'How do I test my own resume in five minutes?',
        a: 'Open the file, save or export it as plain text, and read what comes out. That approximates what the parser sees. If your contact details are missing, if two columns have merged into alternating fragments, or if the order has scrambled, you have found a real problem. If it reads as a coherent document, your formatting is not what is holding you back.',
      },
    ],
    sections: [
      {
        id: 'what-breaks',
        title: 'The five choices that genuinely break a parse',
        blocks: [
          {
            kind: 'table',
            caption: 'Formatting risks, ranked by how often they cause real damage',
            head: ['Choice', 'What goes wrong', 'Fix'],
            rows: [
              [
                'Two-column layout',
                'A parser reading in document order can interleave the columns, producing alternating fragments',
                'Single column, full width',
              ],
              [
                'Header / footer content',
                'Header and footer regions are often skipped entirely — including contact details placed there',
                'Put contact details in the body, on the first line',
              ],
              [
                'Text inside an image',
                'Images contain no text; a graphical skills chart contributes nothing to the record',
                'Write the same information as text',
              ],
              [
                'Tables used for layout',
                'Cell order does not always match visual order, so dates can detach from the roles they belong to',
                'Plain paragraphs and lists',
              ],
              [
                'Creative section names',
                'Parsers segment on conventional headings; "My Journey" is not recognised as Experience',
                'Experience, Education, Skills',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'These have one thing in common: each of them creates a difference between what the page looks like and what the file contains in order. The parser only ever gets the second one.',
          },
        ],
      },
      {
        id: 'myths',
        title: 'What does not matter, despite the advice',
        blocks: [
          {
            kind: 'list',
            items: [
              '**PDFs.** A text-based PDF parses fine. The exception is a scanned or exported-as-image PDF, which contains no text and fails completely — check by trying to select a word in it.',
              '**Bullets, bold and italics.** All standard, all parsed, all worth keeping because they make the document readable.',
              '**Colour.** A restrained accent colour is irrelevant to a parser and pleasant for a reader. Colour used to carry meaning is a different problem, and an accessibility one.',
              '**Keyword density.** A term is present or absent. Repetition adds nothing and costs readability.',
              '**File name.** It is stored, not scored. Name it after yourself so a recruiter can find it on their desktop — that is the only real reason it matters.',
            ],
          },
          {
            kind: 'note',
            title: 'The rule underneath all of this',
            text: 'A change made for the parser that also makes the document better for a human is worth making. A change that makes the document worse for a human is almost certainly cargo cult, because the human is the one who decides.',
          },
        ],
      },
      {
        id: 'the-test',
        title: 'The five-minute test',
        blocks: [
          {
            kind: 'p',
            text: 'Rather than reasoning about what a parser might do, look at what it gets. Export your resume to plain text and read the output top to bottom. It is an approximation, but it catches every one of the failures in the table above.',
          },
          {
            kind: 'list',
            ordered: true,
            items: [
              'Are your name, phone and email in the first few lines? If not, they are probably in a header.',
              'Does each role sit next to its own employer and dates, in order? If they have detached, a table or column layout is the cause.',
              'Is any content missing entirely? Whatever is missing was in an image, a text box or a shape.',
              'Do the section headings appear as words on their own lines? If they were drawn as graphics, they are gone.',
              'Does the whole thing read in a sensible order? If it does, stop optimising and go back to the content.',
            ],
          },
          {
            kind: 'p',
            text: 'Once the file parses cleanly, formatting has stopped being your constraint, and the remaining work is editorial — which is where nearly all of the real gains are. [Turning responsibilities into evidence](/learn/resume/quantifying-achievements) is the change that actually moves an application forward.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'An applicant tracking system is the database an employer keeps candidates in. It parses the file you upload into fields, stores the result against the vacancy, and gives recruiters a way to search and filter what they have collected. That is the whole of it, and almost everything alarming written about these systems describes a machine that does considerably more.',
      'The distinction matters because it changes what you should do. If the system were a judge, the sensible response would be to game its scoring. Because it is a filing cabinet with a search box, the sensible response is to be legible in it: upload a file that parses cleanly, and use the words the employer uses for the work you have actually done.',
      'There is one place where genuine automation happens, and it is not the resume. The screening questions on the application form — work authorisation, qualifications, notice period, location — are evaluated on submission and can close an application immediately. Those are questions you answer, which means they are worth answering carefully rather than quickly.',
    ],
    definitions: [
      {
        term: 'ATS (applicant tracking system)',
        definition:
          'Software an employer uses to receive, store and progress job applications. It handles the requisition, the candidate record, the interview stages and the compliance trail. It is bought to run a hiring process, not to evaluate resumes, and the evaluation features it offers are optional.',
      },
      {
        term: 'Parsing',
        definition:
          'The conversion of an uploaded file into structured fields — contact details, employers, titles, dates, education, free text. Everything the system later does operates on the parsed record rather than on the document you saw, which is why the gap between the two is where applications go missing.',
      },
      {
        term: 'Knockout question',
        definition:
          'A screening question on the application form whose answer can disqualify you immediately: right to work, minimum qualification, willingness to relocate, notice period. This is the automatic rejection people attribute to resume scanning, and it runs on your own stated answers.',
      },
      {
        term: 'Match score',
        definition:
          'An optional similarity score between a parsed resume and a job requisition, used where it exists to order the candidate list. It affects what a recruiter reads first rather than who is excluded, and many teams sort by date instead.',
      },
    ],
    faq: [
      {
        q: 'Do most resumes really get rejected by software before a human sees them?',
        a: 'That claim is repeated constantly and is not a good description of how these systems are configured. The realistic failure is quieter: a recruiter searches the stored records for the terms that matter to them, and a resume that parsed badly or used different vocabulary is simply not in the results. Nothing rejected it; it was never returned by the search.',
      },
      {
        q: 'What file format should I upload?',
        a: 'A text-based PDF unless the application asks for something else, in which case give them what they ask for. The only format that reliably fails is an image-based PDF or a scan, because it contains no text at all. You can check yours in two seconds by trying to select a word inside it.',
      },
      {
        q: 'Should I match the job description word for word?',
        a: 'Match its vocabulary where you have genuinely done the thing, and nowhere else. If the posting says "transaction monitoring" and you wrote "reviewed flagged payments", use their term — it describes the same work and it is what a recruiter will search for. Do not insert terms for work you have not done: it fails at the interview, which is a worse place to fail.',
      },
      {
        q: 'Is a plain-text resume the safest option?',
        a: 'It is the safest for parsing and among the worst for the human stage, which is the stage that actually decides. A clean single-column document with ordinary bullets and bold headings parses just as reliably and is far easier to read. Optimise for both, because passing the first stage only matters if you can also pass the second.',
      },
    ],
  },
  articles,
};

export default content;
