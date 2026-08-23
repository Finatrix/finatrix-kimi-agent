/**
 * What the public `/careers/features` page advertises, as data.
 *
 * Separate from the component so it can be asserted against reality:
 * `publicPages.test.ts` checks that every `section` here is a real route in
 * `CAREERS_ROUTES`, which is what stops the marketing page describing a feature
 * that was never built or one that has since been removed. A features page is
 * the easiest page on a site to let drift, because nothing breaks when it does.
 *
 * Every entry carries a `limit`. That is a house rule, not decoration: a feature
 * list where nothing has a stated boundary reads as marketing, and the boundary
 * is usually the thing a buyer actually needs in order to decide.
 */

export interface CareersFeature {
  /** The Careers route this feature lives at, without the `/careers/` prefix. */
  section: string;
  name: string;
  /** What it does. */
  what: string;
  /** Why that is worth having. */
  why: string;
  /** What it cannot do. */
  limit: string;
}

export const CAREERS_FEATURES: readonly CareersFeature[] = [
  {
    section: 'jobs',
    name: 'Multi-source job search',
    what: 'One query searches several job providers at once and merges the results, removing the duplicates that appear when the same role is posted in three places.',
    why: 'Running the same search on four sites and mentally de-duplicating the results is the single most wasted hour of any job search.',
    limit: 'Coverage is the union of the providers we search, which is not every job in India. Treat it as a wide net, not a complete one.',
  },
  {
    section: 'resumes',
    name: 'Resume library and match scoring',
    what: 'Upload resumes as versions, and every job is scored against the one you choose — requirement by requirement, with matches and gaps both shown.',
    why: 'A score you can open up and disagree with is useful. A ranked feed you cannot inspect is not.',
    limit: 'Scoring reads what the job description states. A vaguely written posting produces a vague score, and no model can fix that.',
  },
  {
    section: 'applications',
    name: 'Application tracking',
    what: 'Saved roles become tracked applications with stages, dates, tasks and notes, so the whole search is one pipeline rather than a spreadsheet and a memory.',
    why: 'Most offers are lost to follow-ups that never happened, not to interviews that went badly.',
    limit: 'You record the stage changes. Nothing reads your inbox to detect them, because nothing here has access to your inbox.',
  },
  {
    section: 'interviews',
    name: 'Interview preparation',
    what: 'Preparation against the specific role — likely questions from the job description, structured answer frames, and a place to keep what you learned in each round.',
    why: 'Generic interview prep is abundant and nearly useless. Preparation against the actual posting is neither.',
    limit: 'It prepares you against what the posting says. It cannot know the panel, the internal politics, or the question the hiring manager always asks.',
  },
  {
    section: 'intelligence',
    name: 'Company research',
    what: 'A profile view of the employer, pulled together so you are not opening nine tabs before every first-round call.',
    why: 'Knowing what a company actually does changes the questions you ask, which is most of what a first round is scoring.',
    limit: 'Research is assembled from available sources and can be incomplete or dated. Verify anything you plan to say out loud.',
  },
  {
    section: 'offers',
    name: 'Offer comparison',
    what: 'Offers laid out side by side — the whole package, not just base pay — so a decision is made on the comparison rather than on the most recent conversation.',
    why: 'Two offers are almost never comparable in the format they arrive in.',
    limit: 'It compares what you enter. It cannot tell you which team you will be happier on, which is usually the deciding factor.',
  },
  {
    section: 'coach',
    name: 'Career coach and AI assistance',
    what: 'AI help across the workspace: tailoring a resume to a posting, drafting outreach and cover letters, and talking through what a job description is really asking for.',
    why: 'The tailoring that measurably improves an application is also the part people skip, because it is tedious rather than difficult.',
    limit: 'AI drafts a starting point and is capped by a monthly quota on every plan. Send nothing it produced without reading it first.',
  },
  {
    section: 'tasks',
    name: 'Tasks and follow-ups',
    what: 'Follow-ups and next actions attached to the application they belong to, rather than living in a separate to-do app that loses the context.',
    why: 'The follow-up email a week after an interview is the cheapest advantage available in a job search, and the easiest to forget.',
    limit: 'Reminders live in the app. It will not call you.',
  },
];
