/**
 * Editorial copy and article bodies for the Credit Scores topic.
 *
 * No score bands and no numeric cutoffs. India has four licensed bureaus with
 * different scales and different models, lenders apply their own thresholds on
 * top, and "750 is good" is a folk belief rather than a published rule. What is
 * describable is the CATEGORY of factor each model weighs and the direction each
 * one moves — which is what a reader can actually act on.
 */

import type { ArticleContent, TopicContent } from './types';

const articles: Record<string, ArticleContent> = {
  'what-moves-a-score': {
    summary:
      'A credit score summarises how you have handled borrowed money, built from a small number of factors that every bureau weighs in broadly the same order. Repayment history dominates: a single missed payment reported to a bureau does more damage than almost anything else you can do, and it takes far longer to recover from than to cause. Credit utilisation — how much of your available limit you are using — comes next and moves quickly in both directions. Then the age of your accounts, the mix of credit types, and recent applications. What does not appear anywhere: your income, your savings, your employer, or checking your own score.',
    keyPoints: [
      'Repayment history is the largest factor by a wide margin, and a missed payment is slow to recover from.',
      'Utilisation moves fast in both directions, which makes it the fastest lever available to you.',
      'Closing an old card can lower your score by shortening history and removing available limit.',
      'Checking your own score is a soft enquiry and has no effect; only lender-initiated hard enquiries register.',
    ],
    faq: [
      {
        q: 'How quickly can I improve my score?',
        a: 'Utilisation changes can show up within one or two reporting cycles, so paying down card balances is the fastest available lever. Everything else is slow: a missed payment stays on the report for years, and account age can only improve with time. Anyone promising a rapid transformation is describing something that either does not work or is not legitimate.',
      },
      {
        q: 'Does checking my own credit score lower it?',
        a: 'No. Your own check is a soft enquiry and is not counted in scoring models. Only hard enquiries — where a lender pulls your report because you applied for credit — register, and a cluster of those in a short window signals credit-seeking behaviour. Checking your own report regularly is sensible and costs nothing in score terms.',
      },
      {
        q: 'Why do my scores differ between bureaus?',
        a: 'India has several licensed bureaus, each with its own scale, its own model, and different data depending on which lenders report to it. Differences between them are normal and not evidence of an error. What matters is whether the underlying information — accounts, balances, payment history — is accurate on each, which is why it is worth checking more than one.',
      },
    ],
    sections: [
      {
        id: 'the-factors',
        title: 'What is actually weighed',
        blocks: [
          {
            kind: 'table',
            caption: 'The factors, in rough order of influence',
            head: ['Factor', 'What it measures', 'How fast it moves'],
            rows: [
              ['Repayment history', 'Whether you paid on time, and how late when you did not', 'Slowly — damage persists for years'],
              ['Credit utilisation', 'Balances as a share of available limit', 'Fast — within a cycle or two'],
              ['Age of credit history', 'How long your accounts have existed', 'Only with time'],
              ['Credit mix', 'Whether you have handled both revolving and instalment credit', 'Slowly'],
              ['Recent enquiries', 'Hard pulls from applications in a recent window', 'Fades over months'],
            ],
            note: 'No weights or score bands are given here on purpose: they differ by bureau and by model, and every published figure for them is an estimate.',
          },
          {
            kind: 'p',
            text: 'Notice what is absent. Income does not appear, nor do savings, nor your employer, nor your qualifications. A high earner who missed three payments scores worse than a modest earner who has never missed one. Lenders consider income separately, at the point of application — it is an affordability input, not a score input.',
          },
        ],
      },
      {
        id: 'utilisation',
        title: 'Utilisation, the fastest lever',
        blocks: [
          {
            kind: 'p',
            text: 'Utilisation is the proportion of your available credit that you are using, usually measured at the point the lender reports the balance rather than as an average or at your payment date. That timing detail matters more than most people realise.',
          },
          {
            kind: 'worked',
            title: 'Same spending, different reported utilisation',
            rows: [
              { label: 'Total card limit', value: '₹2,00,000' },
              { label: 'Monthly spend', value: '₹90,000, cleared in full every month' },
              { label: 'If reported at statement date', value: '₹90,000 ÷ ₹2,00,000 = 45% utilisation' },
              { label: 'If paid down before the statement', value: 'Reported balance ₹20,000 → 10% utilisation' },
              { label: 'Interest paid in either case', value: 'Nil — the bill is cleared in full both ways' },
            ],
            conclusion:
              'Identical behaviour, identical cost, materially different reported figure. Someone who clears their card in full every month can still show high utilisation simply because of when the balance is reported.',
          },
          {
            kind: 'warning',
            title: 'Do not close old cards to "tidy up"',
            text: 'Closing a card removes its limit from your total available credit, which raises utilisation on the same spending, and eventually removes an old account from your history. Both push the score down. If a card has no fee and you do not use it, leaving it open with a small recurring charge is usually better than closing it.',
          },
        ],
      },
      {
        id: 'what-does-not-work',
        title: 'What does not move it',
        blocks: [
          {
            kind: 'list',
            items: [
              '**Checking your own score.** A soft enquiry. No effect, and worth doing regularly.',
              '**Your income, savings or job.** Not reported to bureaus and not in the model. Lenders assess affordability separately.',
              '**Paying a small balance rather than clearing in full.** A persistent myth. Carrying a balance costs interest and does not help the score; clearing in full is better on both counts.',
              '**Debit card use, or a large bank balance.** Neither is credit and neither is reported.',
              '**A one-off large purchase, paid on time.** Utilisation may spike for a cycle and then recovers. It is not a lasting factor.',
            ],
          },
          {
            kind: 'p',
            text: 'The list of things that genuinely help is short and dull: pay on time, every time; keep reported balances low; keep old accounts open; apply for credit sparingly; and check your report for errors, which is where the [dispute process](/learn/credit-scores/credit-report-errors) becomes relevant.',
          },
        ],
      },
    ],
    sources: [
      {
        label: 'Reserve Bank of India — credit information companies',
        url: 'https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx',
      },
    ],
  },

  'credit-report-errors': {
    summary:
      'Credit report errors are common enough that checking is worth doing annually, and the four that recur most are an account you do not recognise, a loan you closed still showing as open, a payment recorded as late that was not, and duplicate entries for the same account. Each is correctable through a dispute process the bureaus are obliged to run, and each is far easier to fix when you find it yourself than when a lender finds it during an application. The practical advice is to check all your reports once a year, keep the closure letter for every loan you settle, and dispute in writing with evidence rather than by phone.',
    keyPoints: [
      'Check every bureau, not one — they hold different data because lenders do not all report to all of them.',
      'A closed loan still showing as open is the most common error and the easiest to prevent with a closure letter.',
      'Dispute in writing with documentary evidence; a phone call leaves no record and no timeline.',
      'Find errors on your own schedule rather than during a loan application, when the timing is against you.',
    ],
    faq: [
      {
        q: 'How often should I check my credit report?',
        a: 'Once a year as routine, and again three months before any significant application such as a home loan. The second check matters because corrections take time to process — finding an error a week before a loan decision leaves you no room to fix it, while finding it three months out is an inconvenience rather than a problem.',
      },
      {
        q: 'What do I do if I find an error?',
        a: 'Raise a dispute with the bureau reporting it, in writing, with documentary evidence — a closure letter, a payment receipt, a bank statement. The bureau is required to investigate with the lender that supplied the data and respond within a defined period. Keep every reference number, and if the outcome is unsatisfactory, escalate through the lender\'s grievance process and then to the regulator.',
      },
      {
        q: 'Can an error be from identity fraud?',
        a: 'An account you genuinely do not recognise is the one error to treat as urgent rather than administrative. Dispute it immediately, notify the lender named on the entry, and check every other bureau for the same entry. The dispute route is the same; the urgency is not, because an unfamiliar account may indicate credit taken in your name.',
      },
    ],
    sections: [
      {
        id: 'the-four',
        title: 'The four errors that recur',
        blocks: [
          {
            kind: 'table',
            caption: 'What to look for, and what proves it',
            head: ['Error', 'Why it happens', 'Evidence to hold'],
            rows: [
              [
                'Closed loan shown as open',
                'The lender never reported the closure to the bureau',
                'The no-dues or closure letter',
              ],
              [
                'Payment marked late that was not',
                'A timing or reporting mismatch at the lender',
                'Bank statement showing the debit date',
              ],
              [
                'Account you do not recognise',
                'Data mismatch, a guarantor entry, or credit taken in your name',
                'None needed — dispute and treat as urgent',
              ],
              [
                'Duplicate entries',
                'The same loan reported twice, often after a transfer or restructure',
                'Loan account numbers showing they are one facility',
              ],
            ],
          },
          {
            kind: 'p',
            text: 'The first is the most common and the most preventable. Every time you clear a loan or close a card, obtain the closure letter and keep it. It costs one email at the time and is the only thing that resolves the dispute quickly two years later.',
          },
        ],
      },
      {
        id: 'reading-it',
        title: 'Reading a report properly',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Personal details.** Name spelling, identifiers, addresses. A mismatch here is how someone else\'s data ends up merged with yours.',
              '**Account list.** Every credit facility ever opened. Check each one exists, that closed ones say closed, and that limits and balances match reality.',
              '**Payment history.** The month-by-month grid per account. Look for any marker other than "paid on time" and check it against your own records.',
              '**Enquiries.** Every hard pull. An enquiry from a lender you never approached is worth querying.',
              '**Then repeat for the other bureaus.** They hold different data and an error on one is frequently absent from another.',
            ],
          },
          {
            kind: 'note',
            title: 'The grid is the part people skip',
            text: 'The payment history grid is dense and unattractive and it is where the damaging entries are. One late marker on one account in one month is exactly the kind of thing that is easy to miss and expensive to leave — it affects the largest single scoring factor.',
          },
        ],
      },
      {
        id: 'the-dispute',
        title: 'Running a dispute',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              '**Raise it with the bureau, in writing.** Each licensed bureau operates a dispute mechanism. Written, because it produces a record and starts a defined timeline; a phone call produces neither.',
              '**Attach the evidence.** Closure letter, statement, receipt. A dispute with documentation is resolved on the documents; one without becomes an argument between you and the lender.',
              '**Keep the reference number** and note the date. You will need both if it is not resolved.',
              '**Dispute with the other bureaus too** if the same error appears there. Correcting one does not correct the others.',
              '**Escalate if needed** — the lender\'s grievance officer first, then the regulator\'s framework. Most errors are resolved before this, and the ones that are not are usually resolved here.',
            ],
          },
          {
            kind: 'p',
            text: 'The reason to do all of this on your own timetable is that an error discovered during a home loan application is discovered at the worst possible moment: the lender has the report, the timeline is theirs, and the correction takes weeks you do not have. An annual check moves the whole problem to a month when nothing depends on it — which is also the argument for keeping a [sinking fund](/learn/saving/sinking-funds) rather than meeting predictable costs as emergencies.',
          },
        ],
      },
    ],
    sources: [
      {
        label: 'Reserve Bank of India — credit information reporting and grievance redress',
        url: 'https://www.rbi.org.in/Scripts/BS_ViewMasDirections.aspx',
      },
    ],
  },
};

const content: TopicContent = {
  topic: {
    intro: [
      'A credit score is a summary of how you have handled borrowed money, produced by a bureau from what lenders report about your accounts. It is not a measure of wealth, income or financial responsibility in any broader sense — someone with substantial savings and no credit history can score poorly, and that is the model working as designed rather than failing.',
      'Most of what circulates about improving a score is either wrong or describes something with no measurable effect. Checking your own score does not lower it. Carrying a small balance does not help. Closing unused cards frequently hurts. The factors that genuinely move it are few, they are the same across bureaus in broad terms, and only one of them moves quickly.',
      'This topic deliberately quotes no score bands or cutoffs. India has several licensed bureaus with different scales and models, lenders set their own thresholds on top, and any specific number presented as "good" is folklore. What is worth knowing is which direction each factor pushes, and that is stable.',
    ],
    definitions: [
      {
        term: 'Credit bureau',
        definition:
          'A licensed company that collects credit information from lenders and produces reports and scores. India has several, they hold different data because not every lender reports to all of them, and their scales are not directly comparable.',
      },
      {
        term: 'Credit utilisation',
        definition:
          'Balances as a proportion of available credit limit, measured at whatever point the lender reports it. The fastest-moving factor in a score, and one that can look poor even for someone who clears their card in full every month.',
      },
      {
        term: 'Hard and soft enquiry',
        definition:
          'A hard enquiry is a lender pulling your report because you applied for credit, and it registers in the score. A soft enquiry — checking your own report, or a pre-approval screen — does not. Only the first has any effect.',
      },
      {
        term: 'Payment history',
        definition:
          'The month-by-month record of whether each account was paid on time. The largest single factor in every scoring model, and the slowest to recover: a missed payment reported to a bureau persists for years.',
      },
    ],
    faq: [
      {
        q: 'What is a good credit score?',
        a: 'There is no single answer, because the bureaus use different scales and every lender sets its own threshold for its own products. Higher is better, the top band widens the range of lenders and rates available to you, and the difference between a mid and a high score is usually in the rate offered rather than in approval. Treat the number as a direction of travel rather than a target.',
      },
      {
        q: 'How do I build a score from nothing?',
        a: 'You need credit reported to a bureau, used and repaid on time. A secured card against a deposit, a small consumer loan, or being added to an existing account are the usual routes. It takes months rather than weeks, and the only mechanism is a record of on-time repayment accumulating — there is no shortcut, and services claiming one are not describing how the model works.',
      },
      {
        q: 'Does a rejected application hurt my score?',
        a: 'The hard enquiry from the application registers whether or not you were approved; the rejection itself is not reported. Several enquiries in a short window signal credit-seeking behaviour and have a modest effect that fades. The practical implication is not to apply to five lenders simultaneously to see who says yes.',
      },
      {
        q: 'Does a credit score matter if I never borrow?',
        a: 'Less, but not nothing. It affects the rate on any future loan, is checked by some landlords and some employers in certain roles, and is difficult to build quickly at the moment you first need it. A thin file is not a good position to be in when you eventually want a home loan, and the fix takes months.',
      },
    ],
  },
  articles,
};

export default content;
