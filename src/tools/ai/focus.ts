/**
 * What the user is looking at when they ask.
 *
 * FinatriX AI is not only a floating panel. Anywhere a figure appears — a
 * category row, a heatmap, a single transaction — there is a button that opens
 * the assistant already pointed at that figure. `AiFocus` is what those buttons
 * pass, and it does three jobs:
 *
 *  1. **It names the subject**, so the panel can say "Groceries" rather than
 *     making the user re-explain what they were looking at.
 *  2. **It carries identity, never figures.** A focus holds a category key or a
 *     transaction id, never an amount. The numbers are resolved from the store
 *     at the moment the question is asked (`focusData.ts`), so an answer can
 *     never be built from a stale value the page happened to be rendering.
 *  3. **It supplies the questions.** Every surface ships the questions worth
 *     asking about it, so the common case is one tap and nobody has to work out
 *     how to phrase a question about a heatmap.
 *
 * This module is imported by ordinary page chunks, so it stays free of
 * analytics imports and holds strings and types only. The figures live in
 * `focusData.ts`, which only the lazy assistant chunk pulls in.
 */

import type { Granularity } from '../lib/budgetTimeline';

export type AiFocus =
  /** The month overview — totals, budget, savings, cash flow. */
  | { kind: 'overview' }
  /** The budget plan as a whole. */
  | { kind: 'budget' }
  /** One spending category. `label` is for display; `key` resolves the data. */
  | { kind: 'category'; key: string; label: string }
  /** One logged transaction, resolved by id at ask-time. */
  | { kind: 'transaction'; id: string; label: string }
  /** The day-by-day spending calendar for the month in view. */
  | { kind: 'heatmap' }
  /** The cumulative spend-against-plan chart. */
  | { kind: 'timeline'; granularity: Granularity }
  /** A proactive insight card the user asked to have explained. */
  | { kind: 'insight'; id: string; title: string; body: string }
  /**
   * One of the two FinatriX scores. `scope` says which; `summary` is the
   * headline the card is showing, so the assistant explains the score the user
   * can see rather than one it recomputes differently.
   */
  | { kind: 'score'; scope: 'plan' | 'execution'; score: number; grade: string; summary: string }
  /** The year-to-date carry-over across every category. */
  | { kind: 'wallet' };

export interface FocusDescription {
  /** Shown as the panel's subject line. */
  title: string;
  /** One line of orientation under the title. */
  subtitle: string;
  /** One-tap questions worth asking about this subject. */
  prompts: readonly string[];
}

/**
 * The label on the button that opens this focus.
 *
 * Deliberately varied rather than "Ask AI" everywhere: "Explain Pattern" on a
 * heatmap tells the user what they will get, and a verb that matches the thing
 * it sits next to reads as part of the surface rather than a bolted-on chatbot.
 */
export function focusButtonLabel(focus: AiFocus): string {
  switch (focus.kind) {
    case 'overview': return 'Financial Summary';
    case 'budget': return 'Ask FinatriX AI';
    case 'category': return 'Analyse Category';
    case 'transaction': return 'Ask FinatriX AI';
    case 'heatmap': return 'Explain Pattern';
    case 'timeline': return 'Analyse Timeline';
    case 'insight': return 'Explain';
    case 'score': return 'Explain my score';
    case 'wallet': return 'Ask about my wallet';
  }
}

/**
 * The button's accessible name.
 *
 * The visible label cannot serve as the accessible name here: a month of
 * transactions puts thirty "Ask FinatriX AI" buttons on one page, and a screen
 * reader listing them would read thirty identical entries with nothing to tell
 * them apart. Naming the subject is what makes the list navigable.
 */
export function focusAriaLabel(focus: AiFocus): string {
  switch (focus.kind) {
    case 'overview': return 'Ask FinatriX AI for a summary of this month';
    case 'budget': return 'Ask FinatriX AI about your budget';
    case 'category': return `Ask FinatriX AI about ${focus.label}`;
    case 'transaction': return `Ask FinatriX AI about this transaction: ${focus.label}`;
    case 'heatmap': return 'Ask FinatriX AI to explain your daily spending pattern';
    case 'timeline': return 'Ask FinatriX AI to analyse your budget timeline';
    case 'insight': return `Ask FinatriX AI to explain: ${focus.title}`;
    case 'score': return focus.scope === 'plan'
      ? 'Ask FinatriX AI to explain your plan score'
      : 'Ask FinatriX AI to explain your execution score';
    case 'wallet': return 'Ask FinatriX AI about your wallet balance';
  }
}

/** The subject line and starting questions for a focus. */
export function describeFocus(focus: AiFocus): FocusDescription {
  switch (focus.kind) {
    case 'overview':
      return {
        title: 'This month at a glance',
        subtitle: 'Income, spending, budget and savings for the month you are viewing.',
        prompts: [
          'Summarise my month',
          'Give me a detailed summary',
          'Am I on track this month?',
          'What should I do next month?',
        ],
      };

    case 'budget':
      return {
        title: 'Your budget',
        subtitle: 'How the plan you set is holding up against what you have spent.',
        prompts: [
          'Why am I over budget?',
          'How can I improve this budget?',
          'Recommend a better budget',
          "Explain this month's performance",
        ],
      };

    case 'category':
      return {
        title: focus.label,
        subtitle: `Spending in ${focus.label}, and how it compares with previous months.`,
        prompts: [
          `Why is ${focus.label} spending changing?`,
          `Compare ${focus.label} to previous months`,
          `Suggest ways to reduce ${focus.label}`,
          `Show the trend for ${focus.label}`,
        ],
      };

    case 'transaction':
      return {
        title: focus.label,
        subtitle: 'One transaction, in the context of everything else you have logged.',
        prompts: [
          'Explain this purchase',
          'Was this unusually expensive?',
          'Should this belong in another category?',
          'Show me similar transactions',
        ],
      };

    case 'heatmap':
      return {
        title: 'Daily spending pattern',
        subtitle: 'Which days money left your account this month, and how much.',
        prompts: [
          'Which days did I spend the most?',
          'Which week had the highest spending?',
          'Identify unusual spending days',
          'Do I spend more at weekends?',
        ],
      };

    case 'timeline':
      return {
        title: 'Budget timeline',
        subtitle: 'How your spending has accumulated against the plan over time.',
        prompts: [
          'Why did spending spike?',
          'Am I spending too quickly?',
          'Will I exceed my budget?',
          'How much can I safely spend per day?',
        ],
      };

    case 'insight':
      return {
        title: focus.title,
        subtitle: 'The figures behind this observation.',
        prompts: [
          'Explain this in more detail',
          'What caused this?',
          'What should I do about it?',
          'Is this a problem?',
        ],
      };

    case 'score':
      return {
        title: focus.scope === 'plan' ? 'Your plan score' : 'Your execution score',
        subtitle: focus.scope === 'plan'
          ? 'How well this budget is built, and what would raise it.'
          : 'How closely this month followed the plan, and what would raise it.',
        prompts: [
          'What is holding this score down?',
          'What is the single fastest thing I could change?',
          'Is this a good score for someone at my income?',
          'How is this score calculated?',
        ],
      };

    case 'wallet':
      return {
        title: 'Your wallet',
        subtitle: 'What every category has left over, added up across the financial year.',
        prompts: [
          'Which categories keep going over?',
          'Can I afford to spend my banked balance?',
          'How do I clear the overdrawn categories?',
          'What does my year look like so far?',
        ],
      };
  }
}

/**
 * A stable key for a focus, used to tell whether the panel is already primed
 * for what the user just clicked. Two buttons pointing at the same category
 * produce the same key; two different categories never do.
 */
export function focusKey(focus: AiFocus | null): string {
  if (!focus) return '';
  switch (focus.kind) {
    case 'category': return `category:${focus.key}`;
    case 'transaction': return `transaction:${focus.id}`;
    case 'timeline': return `timeline:${focus.granularity}`;
    case 'insight': return `insight:${focus.id}`;
    case 'score': return `score:${focus.scope}`;
    default: return focus.kind;
  }
}
