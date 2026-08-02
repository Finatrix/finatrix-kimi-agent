/**
 * Editorial copy and article bodies for the Networking topic.
 *
 * Written for people who find the whole idea uncomfortable, because that is most
 * people. The framing throughout is that networking is a small set of specific
 * actions with scripts, not a personality trait you either have or lack — which
 * is both true and considerably more actionable than the usual advice.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'informational-interviews': {
    summary:
      'An informational interview is a short conversation with someone doing the job you want, asked for as a conversation rather than as a favour. It works because the request is small, specific and flattering, and because most people genuinely enjoy explaining their own work to someone who has clearly prepared. Ask for fifteen minutes, name why you approached this person specifically, come with four researched questions, take the notes, and — this is the part almost everyone skips — send a short follow-up two months later saying what you did with the advice. That last message is what turns a pleasant conversation into someone who thinks of you when a role opens.',
    keyPoints: [
      'Ask for fifteen minutes, not thirty, and never ask for a job — the small specific request is what gets a yes.',
      'Say why this person, concretely. A message that could have gone to anyone is answered by nobody.',
      'Prepare four questions that could not be answered by reading the company website, and ask them.',
      'The follow-up two months later is the step that creates the relationship, and it is the step nobody takes.',
    ],
    faq: [
      {
        q: 'Why would a stranger agree to talk to me?',
        a: 'Because the request is small, it is specific to them, and people generally like explaining work they know well to someone who has evidently prepared. The requests that get ignored are the ones that are vague, long, or effectively a job application in disguise. "Fifteen minutes about how the credit team is structured" gets answered far more often than "I would love to pick your brain about opportunities".',
      },
      {
        q: 'What do I actually ask?',
        a: 'Things you cannot look up: what the first six months were actually like, what surprised them, what the hardest part of the job is that never appears in the posting, what they would tell someone considering the move. Avoid anything on the careers page — asking it wastes the fifteen minutes and demonstrates that you did not use the fifteen minutes before them.',
      },
      {
        q: 'Is it acceptable to ask for a referral at the end?',
        a: 'Not in the first conversation, no. It converts a conversation into a transaction and it is the thing people are guarding against when they hesitate to reply. Ask instead who else would be worth speaking to — a much smaller request, usually granted, and it compounds. The referral, if it comes, comes later and unprompted because you stayed in contact.',
      },
    ],
    sections: [
      {
        id: 'the-ask',
        title: 'The message that gets a reply',
        blocks: [
          {
            kind: 'p',
            text: 'Four sentences. Who you are, why this person specifically, the small ask, and an easy way to say no. Anything longer reduces the reply rate, because length signals that the conversation will also be long.',
          },
          {
            kind: 'worked',
            title: 'The four sentences',
            rows: [
              { label: '1 — who you are', value: 'I am a final-year economics student in Pune, looking at credit risk roles.' },
              { label: '2 — why them', value: 'I saw you moved from operations into credit risk at your bank, which is close to the route I am considering.' },
              { label: '3 — the ask', value: 'Would you have fifteen minutes in the next couple of weeks to tell me what that move was actually like?' },
              { label: '4 — the exit', value: 'Entirely understand if not — thank you either way.' },
            ],
            conclusion:
              'Under seventy words, and the second sentence is doing all the work. Remove it and the message becomes one that could have been sent to four hundred people, which is exactly what it will be read as.',
          },
          {
            kind: 'p',
            text: 'The same structure works on [LinkedIn](/learn/linkedin/linkedin-outreach), by email, and through an alumni directory. Where you send it matters much less than whether the second sentence is real.',
          },
        ],
      },
      {
        id: 'the-conversation',
        title: 'The fifteen minutes',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Start by restating the ask.** "I mostly wanted to understand what the move was like — is that alright?" It sets the scope and reassures them that this is not going to become something else.',
              '**Ask your four questions.** Prepared, specific, unavailable online. Listen to the answers rather than waiting to ask the next one.',
              '**Watch the clock yourself.** At thirteen minutes, say "I said fifteen minutes and I want to respect that." People almost always continue, and offering to stop is the reason they do.',
              '**Ask the compounding question.** "Is there anyone else you think would be worth me speaking to?" This is the highest-value sentence in the whole conversation.',
              '**Thank them the same day.** Three lines, naming one specific thing you took from it.',
            ],
          },
          {
            kind: 'note',
            title: 'Take notes afterwards, not during',
            text: 'Typing through a fifteen-minute conversation makes it feel like an interrogation. Write for five minutes immediately after instead — what they said, what surprised you, what you will do about it. That file is also where the follow-up message comes from two months later.',
          },
        ],
      },
      {
        id: 'the-follow-up',
        title: 'The message that creates the relationship',
        blocks: [
          {
            kind: 'p',
            text: 'Almost everyone sends the thank-you. Almost nobody sends the second message, and the second message is the one that matters.',
          },
          {
            kind: 'p',
            text: 'Two months later, write three lines: what you did as a result of the conversation, what happened, and no ask at all. "You suggested I look at the monitoring side rather than going straight for investigations — I have started a certification and applied to two of those roles. Thank you, it was useful advice."',
          },
          {
            kind: 'p',
            text: 'What that message does is unusual. It tells them their time produced something, which is rare and genuinely pleasant to receive. It puts you back in mind at a random moment rather than at a moment when you want something. And it establishes that you follow through, which is the single quality most likely to make someone forward your name when a role opens. There is no ask in it, which is precisely why it works.',
          },
          {
            kind: 'warning',
            title: 'Do not batch this',
            text: 'A follow-up that reads as a template destroys the effect entirely and is worse than sending nothing. Three genuine messages beat thirty generic ones, and the whole value of the approach is that it is specific.',
          },
        ],
      },
    ],
  },

  'starting-with-no-contacts': {
    summary:
      'Starting with no professional network is the normal case, not a disadvantage to be overcome before you begin. Four sources reliably produce first contacts and none require knowing anyone: your university\'s alumni directory, second-degree connections through people you already know, professional bodies and their local events, and cold outreach done specifically. The reason it is worth the discomfort is arithmetic — a referred application is reviewed by a person who has a reason to look at it, while a cold application arrives in a queue of several hundred. Ten conversations over three months is a realistic target and it changes the shape of a job search more than another fifty applications will.',
    keyPoints: [
      'Alumni directories are the highest-yield source and the most under-used: a shared institution is a real reason to reply.',
      'A referral changes who reads your application and why, which is a different thing from improving the application.',
      'Ten conversations over three months is achievable, and outperforms fifty additional cold applications.',
      'Track the conversations, or the follow-ups that create the relationships will not happen.',
    ],
    faq: [
      {
        q: 'Does networking really beat applying?',
        a: 'They do different things. Applications get you into a process; conversations change who reads your application and tell you which processes are worth entering. The strongest position is both — a well-targeted application plus one person inside who knows your name. The weakest is a high volume of cold applications with no information behind any of them.',
      },
      {
        q: 'I find this deeply uncomfortable. Is there an alternative?',
        a: 'The discomfort is mostly about the framing. Asking someone to explain their own job for fifteen minutes is not an imposition and is rarely experienced as one; asking a stranger for a favour is, and most people imagine they are doing the second. Written outreach also suits people who dislike events, and it is more effective — a specific message beats a room full of small talk.',
      },
      {
        q: 'How long before this produces anything?',
        a: 'Two to four months before conversations turn into anything concrete, which is why starting late in a job search rarely helps and starting before you need it works well. The first conversation produces information immediately, which is useful on its own; the referrals arrive considerably later and usually from someone you did not expect.',
      },
    ],
    sections: [
      {
        id: 'four-sources',
        title: 'Four sources of a first contact',
        blocks: [
          {
            kind: 'table',
            caption: 'Where first contacts come from, ranked by reply rate',
            head: ['Source', 'Why it works', 'Effort'],
            rows: [
              [
                'University alumni',
                'A shared institution is a genuine reason to reply, and most directories are searchable by employer',
                'Low',
              ],
              [
                'Second-degree connections',
                'A mutual contact converts a cold message into a warm one',
                'Low',
              ],
              [
                'Professional bodies and events',
                'Everyone present has already agreed to talk about the subject',
                'Medium',
              ],
              [
                'Cold outreach',
                'Unlimited supply; reply rate depends entirely on how specific the message is',
                'Medium',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'Alumni directories are consistently the most under-used. The shared institution does real work — it gives the recipient a reason to reply that has nothing to do with generosity — and most universities keep a directory that can be filtered by employer and sector. Start there before anything else.',
          },
        ],
      },
      {
        id: 'the-arithmetic',
        title: 'Why a referral is worth so much',
        blocks: [
          {
            kind: 'p',
            text: 'A cold application enters a queue and is assessed against a specification. A referred application is looked at by someone who has a reason to look at it, usually with a sentence attached from a person the reader knows. The application itself is identical; what changed is the attention it receives and the frame around it.',
          },
          {
            kind: 'worked',
            title: 'Two routes, one candidate',
            rows: [
              { label: 'Cold application', value: 'One of several hundred; screened against the specification alone' },
              { label: 'Referred application', value: 'Flagged by an employee; read with the referral attached' },
              { label: 'What changed', value: 'Not the resume. The probability that a person engages with it properly.' },
            ],
            conclusion:
              'This is why ten conversations can outperform fifty extra applications: the conversations change the conditions under which your existing applications are read, rather than adding more of them to the same queue.',
          },
          {
            kind: 'p',
            text: 'It also explains why referrals arrive late. Nobody refers someone they spoke to once. They refer someone whose name they remember and whose follow-through they have seen, which is what the [two-month follow-up](/learn/networking/informational-interviews) is for.',
          },
        ],
      },
      {
        id: 'a-workable-plan',
        title: 'A plan that survives three months',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Pick fifteen employers.** The same list your applications will target. Networking without a target list produces pleasant conversations and no direction.',
              '**Find two people at each.** Alumni directory first, then LinkedIn. Note their route in, not just their title — the route is what your second sentence is about.',
              '**Send three messages a week.** Not thirty in one evening. Three specific messages weekly is sustainable and the replies arrive at a manageable rate.',
              '**Keep a simple record.** Who, when, what was said, when to follow up. Without it the follow-ups do not happen, and the follow-ups are the entire mechanism.',
              '**Follow up at two months.** No ask. What you did with the advice.',
            ],
          },
          {
            kind: 'p',
            text: 'Three messages a week for twelve weeks is thirty-six messages. At a realistic reply rate that is around ten conversations, which is a network — not a large one, but ten people in your target sector who know your name is a materially different position from where you started.',
          },
          {
            kind: 'p',
            text: 'If you are running this alongside a visa deadline or a fixed graduation date, sequence it early: it is the part of a job search with the longest lag between effort and result. [Job search on a visa](/learn/international-students/job-search-on-a-visa) covers planning backwards from a hard date.',
          },
        ],
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'Networking has an image problem, and the image is largely accurate about the version most people are imagining: working a room, collecting contacts, asking strangers for favours. Almost nobody enjoys that and it does not work particularly well either.',
      'The version that works is smaller and more specific. It is asking one person, for fifteen minutes, about work they know well, having done enough preparation that the question is worth their time. It is written more often than spoken. And its most important step happens two months later, in a message that contains no request at all.',
      'The reason to do it despite the discomfort is that it changes the conditions under which your applications are read. A referred application is looked at by a person with a reason to look; a cold one is assessed against a specification in a queue. Ten conversations over three months will do more for a job search than fifty additional applications, and the conversations also tell you which of those applications were worth making.',
    ],
    definitions: [
      {
        term: 'Informational interview',
        definition:
          'A short conversation with someone doing work you are interested in, requested as a conversation about their job rather than as a request for help finding one. The small, specific request is what makes it answerable, and asking for a job inside it is what makes it fail.',
      },
      {
        term: 'Referral',
        definition:
          'An application flagged by someone inside the employer. It does not improve the application; it changes who reads it and how carefully. Referrals almost always come from a second or third contact rather than a first, which is why follow-up matters more than initial outreach volume.',
      },
      {
        term: 'Second-degree connection',
        definition:
          'Someone you do not know who is connected to someone you do. The highest-conversion cold approach available, because the mutual contact gives the recipient a reason to reply that a well-written message alone cannot manufacture.',
      },
      {
        term: 'The follow-up',
        definition:
          'A short message some weeks after a conversation, reporting what you did with the advice and asking for nothing. The step that converts a pleasant exchange into someone who remembers you, and the step almost everyone omits.',
      },
    ],
    faq: [
      {
        q: 'How do I network if I genuinely know nobody?',
        a: 'Start with your university\'s alumni directory, filtered by the employers you are targeting. A shared institution is a real reason for someone to reply and it costs you nothing to invoke. After that, second-degree connections through anyone you do know, professional bodies with local events, and specific cold outreach. None of these require an existing network, which is the point.',
      },
      {
        q: 'What should I never do?',
        a: 'Ask for a job in a first message, send anything that could have gone to four hundred people, ask questions answered on the company website, or connect and then immediately request a referral. All four are common, all four are read exactly as they are, and each one closes the contact permanently rather than temporarily.',
      },
      {
        q: 'Do events work, or is written outreach better?',
        a: 'Written outreach is more effective per hour for most people, because it is specific and it reaches people who are not at events. Events are useful for a different reason: they produce several weak contacts quickly and they are easier if you find cold messaging harder than talking. The two combine well — meet at an event, then send the specific message afterwards.',
      },
      {
        q: 'When should I start?',
        a: 'Before you need it, because the lag between a first conversation and a referral is months rather than weeks. Networking begun in the same week as an application deadline produces information at best. Begun three months ahead, it produces people who know your name when something opens — which is a different and much more valuable thing.',
      },
    ],
  },
  articles,
};

export default content;
