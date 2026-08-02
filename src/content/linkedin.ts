/**
 * Editorial copy and article bodies for the LinkedIn topic.
 *
 * Describes the platform's mechanics as they are stable — a searchable index
 * that recruiters query — rather than the current interface, feature names or
 * algorithm. Screenshots and menu paths date within months; the underlying model
 * of "recruiter runs a search, your profile either matches or does not" has been
 * constant for a decade.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'linkedin-profile': {
    summary:
      'A recruiter does not browse LinkedIn; they search it, with terms drawn from a job specification, and your profile either appears in the result set or it does not. That single fact should drive how the profile is written. The headline and the job titles carry the most weight in that search, so a headline that says "Aspiring Professional | Passionate about Finance" removes you from every query that matters. Write the headline as what you are plus the terms you want to be found for, use recognisable job titles rather than internal ones, and put the substance in the experience entries — where it is both searchable and readable by the person who clicks through.',
    keyPoints: [
      'The headline is the highest-weighted field and the most commonly wasted one — it should carry search terms, not adjectives.',
      'Use the industry-standard job title, not your employer\'s internal one; nobody searches for "Analyst II, Grade 7".',
      'Empty experience entries are invisible to search — two lines per role beats a title with nothing under it.',
      'Turn on the "open to work" recruiter-only setting rather than the public banner if you are employed.',
    ],
    faq: [
      {
        q: 'What should my headline actually say?',
        a: 'What you are, and the terms you want to be found for, in that order. "Credit Risk Analyst | IFRS 9, Portfolio Monitoring, SQL" is searchable and instantly legible. "Aspiring finance professional passionate about making an impact" contains no term any recruiter has ever searched for. If you are between roles, name the thing you do rather than the thing you want: "Financial Crime Analyst" beats "Seeking opportunities".',
      },
      {
        q: 'Does posting content help?',
        a: 'Marginally, and much less than people hope. Recruiters find candidates through search, not through the feed, so a well-written profile outperforms regular posting for job-search purposes. Posting builds a reputation over years and in specific professional communities, which is a real but slow benefit and a poor use of time if you need a role this quarter.',
      },
      {
        q: 'Should my profile just repeat my resume?',
        a: 'The substance should match, but the register differs. A resume is a targeted document for one application; a profile is a standing description for anyone who arrives. That means the profile can be broader, written in the first person, and can include context a resume has no room for. What it must not do is contradict the resume on dates or titles — that inconsistency is checked and it is damaging.',
      },
    ],
    sections: [
      {
        id: 'the-search',
        title: 'How recruiters actually find people',
        blocks: [
          {
            kind: 'p',
            text: 'A recruiter with a vacancy opens a search tool, enters terms from the specification — a title, a skill, a location, sometimes a current employer — and receives a list. They work down that list. Nothing about the process resembles browsing, and the feed plays no part in it at all.',
          },
          {
            kind: 'p',
            text: 'So the operative question for every field on your profile is: would a term in here appear in a search someone runs to find a person like me? Fields that carry search weight deserve care; fields that do not are cosmetic.',
          },
          {
            kind: 'table',
            caption: 'Fields, by how much they affect whether you are found',
            head: ['Field', 'Search weight', 'What to do'],
            rows: [
              ['Headline', 'High', 'What you are, plus three or four terms you want to match'],
              ['Job titles', 'High', 'Recognisable industry titles, not internal grade names'],
              ['Skills', 'High', 'Fifteen to twenty specific ones; remove the generic filler'],
              ['Experience text', 'Medium', 'Two to four lines per role, in the vocabulary of the field'],
              ['About section', 'Medium', 'Three short paragraphs; the first two lines are what shows'],
              ['Location', 'High as a filter', 'Set to the market you want to work in'],
              ['Banner image', 'None', 'Cosmetic. Fine to ignore.'],
            ],
          },
        ],
      },
      {
        id: 'the-titles',
        title: 'The title problem',
        blocks: [
          {
            kind: 'p',
            text: 'Employers use internal titles that mean nothing outside the building. "Officer, Grade 4", "Associate II", "Specialist, Business Services" — none of these is a term anyone searches for, and using them as your LinkedIn title makes you invisible to the searches that would otherwise find you.',
          },
          {
            kind: 'p',
            text: 'The fix is to use the recognisable industry title and put the internal one in the description if you want it recorded. This is not misrepresentation as long as the level is honest: "Credit Risk Analyst" where your badge says "Officer, Risk Grade 4" is a translation, not a promotion. Inflating the level is a different matter and it is checked at reference stage.',
          },
          {
            kind: 'note',
            title: 'Empty roles are invisible roles',
            text: 'A job title with no description underneath contributes almost nothing to search and tells a human reader nothing. Two lines per role — what the team did and what you owned — is the minimum, and it takes ten minutes for an entire career history.',
          },
        ],
      },
      {
        id: 'the-rest',
        title: 'The parts worth doing after the headline',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Photo.** An ordinary, current, well-lit photograph of your face. It does not need to be professionally taken. A profile without one is passed over more often, fairly or not.',
              '**About.** Three short paragraphs: what you do, what you have done that is relevant, what you are looking for. Only the first two lines display before "see more", so put the substance there.',
              '**Skills.** Fifteen to twenty specific ones. Remove "Microsoft Office", "Teamwork" and "Communication" — they match nothing useful and dilute the list a recruiter scans.',
              '**Open to work.** The recruiter-only visibility setting is the one to use while employed; the public green banner is visible to your current employer and to everyone else.',
              '**Custom URL.** Thirty seconds, and it is what goes on your [resume](/learn/resume/resume-structure) instead of a string of digits.',
            ],
          },
          {
            kind: 'p',
            text: 'Together this is under an hour of work, and the headline alone accounts for most of the effect. Once the profile is findable, the remaining lever is outreach — which is a different skill and is covered in [LinkedIn outreach](/learn/linkedin/linkedin-outreach).',
          },
        ],
      },
    ],
  },

  'linkedin-outreach': {
    summary:
      'Cold outreach on LinkedIn works when the message is short, specific to the recipient, and asks for something small. It fails in three recognisable ways: a connection request with no note, a message that could have been sent to anyone, and an immediate request for a referral from someone who has never spoken to you. The structure that gets replies is four sentences — who you are, why this person specifically, a fifteen-minute ask, and an easy way to decline. Send three a week rather than thirty in an evening, because a sustainable rate produces replies you can actually handle and a burst produces a queue you abandon.',
    keyPoints: [
      'Always include a note with a connection request; a bare request from a stranger carries no information and is usually ignored.',
      'The "why this person" sentence is the whole message — without it you have written a template and it reads as one.',
      'Ask for fifteen minutes of conversation, never for a referral or a job, in a first message.',
      'Three messages a week, sustained, beats a batch of thirty followed by nothing.',
    ],
    faq: [
      {
        q: 'Connection request or direct message?',
        a: 'A connection request with a note, in almost every case. It is shorter, it is free, and accepting it is a smaller commitment than replying to a message. Keep the note under the character limit without truncation — the specific sentence about why you approached them matters more than the sentence about yourself.',
      },
      {
        q: 'How many people should I contact?',
        a: 'Three a week, consistently. Reply rates to genuinely specific messages are decent but not high, so volume matters — but batching thirty in an evening produces generic messages and a set of replies arriving at once that you then handle badly. Three a week is sustainable for months, which is the timescale on which this works.',
      },
      {
        q: 'What if nobody replies?',
        a: 'Check the second sentence first, because that is almost always the fault: if it does not name something specific about that person, the message reads as a template regardless of how it is worded. After that, check who you are messaging — people two to five years ahead of you reply considerably more often than senior leaders, and they are also more useful to talk to.',
      },
    ],
    sections: [
      {
        id: 'why-messages-fail',
        title: 'The three ways outreach fails',
        blocks: [
          {
            kind: 'list',
            items: [
              '**The empty connection request.** No note. The recipient has no information and no reason, so it is either ignored or accepted with no relationship formed. It costs nothing to add a sentence, and the sentence is the entire value.',
              '**The template.** "I came across your profile and was impressed by your journey. I would love to connect and learn more about your experience." Sent by thousands of people daily, contains nothing about the recipient, and is recognisable within two seconds.',
              '**The immediate ask.** Connecting and then requesting a referral in the next message. It confirms exactly what the recipient suspected the connection was for, and it closes the contact permanently rather than temporarily.',
            ],
          },
          {
            kind: 'p',
            text: 'All three share one cause: the message is about the sender. Every message that works is about the recipient in its second sentence, and that is the only structural difference.',
          },
        ],
      },
      {
        id: 'the-structure',
        title: 'Four sentences that get answered',
        blocks: [
          {
            kind: 'worked',
            title: 'A connection note, annotated',
            rows: [
              { label: 'Sentence 1', value: '"I am an operations analyst at a mid-size bank in Hyderabad."' },
              { label: 'Sentence 2 — the one that matters', value: '"I noticed you moved from operations into transaction monitoring, which is the move I am trying to make."' },
              { label: 'Sentence 3', value: '"Would you have fifteen minutes to tell me how that transition went?"' },
              { label: 'Sentence 4', value: '"No problem at all if not."' },
            ],
            conclusion:
              'Sixty words. The second sentence proves you looked at their profile rather than a search result, and it names something they can speak to with no preparation. Remove it and the reply rate collapses.',
          },
          {
            kind: 'p',
            text: 'This is the same four-part structure as any [informational interview request](/learn/networking/informational-interviews) — the medium changes nothing. What LinkedIn adds is that the recipient can see who you are in one click, which raises the reply rate if your profile is in order and lowers it if it is not.',
          },
        ],
      },
      {
        id: 'who-to-contact',
        title: 'Who to message, and when',
        blocks: [
          {
            kind: 'table',
            caption: 'Reply likelihood by who you approach',
            head: ['Who', 'Likelihood', 'Why'],
            rows: [
              ['Someone two to five years ahead of you', 'Highest', 'Remembers being where you are; not yet time-poor'],
              ['A fellow alumnus of your institution', 'High', 'The shared institution is a real reason to reply'],
              ['Someone who made the exact move you want', 'High', 'You are asking about a story they enjoy telling'],
              ['A recruiter for a role you have applied to', 'Medium', 'Legitimate, but only after applying and only once'],
              ['A senior leader with no connection', 'Low', 'Volume of inbound; the ask is rarely proportionate'],
            ],
          },
          {
            kind: 'p',
            text: 'The instinct is to aim high. The arithmetic says otherwise: someone three years ahead will reply, will remember the details of the transition you are asking about, and can introduce you to their own manager if the conversation goes well. A department head will not reply, and would have less useful detail if they did.',
          },
          {
            kind: 'warning',
            title: 'One follow-up, then stop',
            text: 'If there is no reply after ten days, one short follow-up is reasonable. After that, stop. A third message converts a non-reply into an active negative impression, and there are always other people to approach.',
          },
          {
            kind: 'p',
            text: 'Two things about the reply itself. Answer within a day, because the person who agreed to fifteen minutes did so on an impulse that fades. And propose specific times rather than asking when suits them — offering three slots is one decision for them to make, while "when are you free?" is a scheduling task you have handed to someone doing you a favour.',
          },
          {
            kind: 'p',
            text: 'It is also worth checking your own profile before you send anything, because the first thing a recipient does is click your name. A message that reads well arriving from a profile with no photo, a placeholder headline and empty roles is a mismatch, and the profile is what they judge. Twenty minutes fixing the [profile](/learn/linkedin/linkedin-profile) raises the reply rate on every message you send afterwards, which makes it the higher-leverage of the two tasks by some distance.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'LinkedIn is best understood as a searchable index that recruiters query, rather than as a social network you participate in. Someone with a vacancy types terms from a job specification into a search tool and works down the results. Your profile is either in that result set or it is not, and almost everything worth doing to a profile follows from that.',
      'This is why the most common profile mistakes are so costly. A headline full of adjectives, an internal job title nobody searches for, or a role listed with no description under it each remove you from queries you would otherwise have matched — silently, with no signal that anything went wrong.',
      'The second half of the platform is outreach, and it obeys different rules. Short messages that name something specific about the recipient get answered; templates and immediate requests for referrals do not. Both halves are learnable in an afternoon, which makes this an unusually high-return hour of work in a job search.',
    ],
    definitions: [
      {
        term: 'Recruiter search',
        definition:
          'The keyword-and-filter search recruiters run to build a candidate list, weighted toward headline, job titles, skills and location. It is how candidates are found on the platform; the public feed plays essentially no part in hiring.',
      },
      {
        term: 'Headline',
        definition:
          'The line under your name, and the highest-weighted field on the profile. It should state what you are and carry the terms you want to match, which is why filling it with aspiration or personality removes you from the searches that matter.',
      },
      {
        term: 'Connection note',
        definition:
          'The short message attached to a connection request. Optional in the interface and effectively mandatory in practice: a bare request from a stranger carries no information, so acceptance is arbitrary and no relationship follows from it.',
      },
      {
        term: 'Open to work (recruiter only)',
        definition:
          'A setting that signals availability to recruiters using the platform\'s hiring tools without displaying the public banner. The appropriate choice while employed, since the public version is visible to your current employer and colleagues.',
      },
    ],
    faq: [
      {
        q: 'How important is LinkedIn in a job search?',
        a: 'Important as an index and much less so as a network. Recruiters search it, hiring managers check it after reading a resume, and referrals often start from it. What it is not is a substitute for applying: profiles do not generate inbound for most people at most levels, and treating it as a channel that will bring roles to you is the most common misuse of it.',
      },
      {
        q: 'Should my profile mirror my resume exactly?',
        a: 'It should be consistent on the facts — titles, employers, dates — and can differ in register and breadth. A resume is targeted at one role and cut hard; a profile is standing and can be broader and written in the first person. Contradictions between the two are checked and are damaging in a way that stylistic differences are not.',
      },
      {
        q: 'Does the "open to work" banner hurt me?',
        a: 'The public green banner is visible to everyone including your current employer, which is the practical objection while employed. The recruiter-only setting achieves the visibility you want without that. Between roles, the public banner is unremarkable and costs nothing.',
      },
      {
        q: 'How does LinkedIn compare with a dedicated job-search tool?',
        a: 'They solve different halves of the problem. LinkedIn is where you are found and where relationships start — a social graph nothing else replicates. A match-scored search tool is for deciding what to apply to and tracking the process afterwards. The comparison is set out in more detail on the [FinatriX Careers comparison pages](/careers/compare).',
      },
    ],
  },
  articles,
};

export default content;
