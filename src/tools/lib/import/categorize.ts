/**
 * Deciding what a transaction was, without spending a model call on it.
 *
 * Resolution runs in a fixed order, strongest evidence first:
 *
 *   1. **Learned** — this user has categorised this merchant before.
 *   2. **Rule** — the built-in merchant table recognises the descriptor.
 *   3. **Structure** — the description says it is a transfer or a cash
 *      withdrawal, which are movements rather than purchases.
 *   4. **Nothing** — left undecided, and handed to the AI layer.
 *
 * The ordering is the point. Step 1 makes a returning user's import essentially
 * free and — more importantly — consistent with the choices they already made.
 * Steps 2 and 3 cover the merchants everyone has. Only what survives all three
 * is worth a model call, which on a typical statement is a small minority of
 * distinct descriptions.
 *
 * Every category proposed here is checked against the user's *live* category
 * set before it is used, so a category they renamed, archived or never had can
 * never be reintroduced by an importer.
 */

import { deriveMerchant } from './merchant';
import { recallCategory, type LearnedMap } from './learned';
import { CASH_WITHDRAWAL_RE, INTERNAL_MOVEMENT_RE, matchRule } from './rules';
import { isImportable } from './status';
import { MAX_AI_CONFIDENCE, type CategoryOrigin, type DraftRow, type SuggestionMap } from './types';

/**
 * Confidence attached to each deterministic source.
 *
 * These are statements about the *evidence*, not a model's self-assessment: a
 * category the user chose themselves is near-certain; a brand-table hit is
 * strong but can be wrong about a franchise; a structural read of "this is a
 * transfer" is good but not the user's own word. They sit above the review
 * threshold because each one is defensible, and none of them is 100 — nothing
 * about categorising a bank line is ever certain.
 */
const CONFIDENCE = {
  learned: 96,
  rule: 88,
  structural: 84,
} as const;

export interface LocalResolution {
  merchant: string;
  /** A live category key, or '' when nothing decided it. */
  category: string;
  origin: CategoryOrigin;
  confidence: number;
}

/**
 * Resolve one description as far as deterministic code can take it.
 *
 * Returns a merchant even when the category is left undecided — naming the
 * payee is useful on its own, and it is what the learned map is keyed by.
 */
export function resolveLocally(
  description: string,
  learned: LearnedMap,
  validKeys: ReadonlySet<string>,
): LocalResolution {
  const merchant = deriveMerchant(description, validKeys);
  const upper = (description || '').toUpperCase();

  const remembered = merchant ? recallCategory(learned, merchant, validKeys) : null;
  if (remembered) {
    return { merchant, category: remembered, origin: 'learned', confidence: CONFIDENCE.learned };
  }

  const rule = matchRule(upper, validKeys);
  if (rule?.category) {
    return {
      merchant: merchant || rule.merchant,
      category: rule.category,
      origin: 'rule',
      confidence: CONFIDENCE.rule,
    };
  }

  // Money moving between the user's own accounts is not spending. Booking it as
  // a category would inflate that category every month for no reason.
  if (INTERNAL_MOVEMENT_RE.test(upper) && validKeys.has('transfers')) {
    return {
      merchant: merchant || 'Transfer',
      category: 'transfers',
      origin: 'rule',
      confidence: CONFIDENCE.structural,
    };
  }

  // A cash withdrawal is a real outflow with no knowable category — what the
  // cash was spent on is not in the statement. Naming it and leaving the
  // category to the user is the only honest answer.
  if (CASH_WITHDRAWAL_RE.test(upper)) {
    return { merchant: 'Cash withdrawal', category: '', origin: 'none', confidence: 0 };
  }

  return { merchant, category: '', origin: 'none', confidence: 0 };
}

/** True when a draft still needs the model to decide anything. */
export function needsModel(draft: DraftRow): boolean {
  return draft.origin === 'none';
}

/**
 * The distinct descriptions still needing a model, capped.
 *
 * Deduplication is what makes the AI step affordable: a month of statements
 * repeats the same forty payees, so the number of *distinct* unresolved
 * descriptions is a fraction of the row count. The cap is a backstop against a
 * pathological file rather than an expected limit.
 */
/**
 * Merge the model's proposals into the drafts that were still undecided.
 *
 * Only rows the deterministic layer left at `origin: 'none'` are touched, so a
 * category the user chose or a brand the table recognised can never be
 * overwritten by a guess — the model gets the leftovers, not a veto. Categories
 * are re-checked against the live key set here as well as in the AI module: this
 * function is pure and independently testable, and the row that decides what
 * lands in someone's ledger should not depend on validation having happened
 * somewhere else.
 *
 * Returns new drafts; the input is untouched.
 */
export function applySuggestions(
  drafts: readonly DraftRow[],
  suggestions: SuggestionMap,
  validKeys: ReadonlySet<string>,
): DraftRow[] {
  return drafts.map((draft) => {
    if (!needsModel(draft)) return draft;

    const suggestion = suggestions.get(draft.source.description.trim().toUpperCase());
    if (!suggestion) return draft;

    const category = suggestion.category && validKeys.has(suggestion.category) ? suggestion.category : '';
    // The structural merchant for these rows is a fallback, not a canonical
    // name, so a model-supplied payee replaces it when there is one.
    const merchant = suggestion.merchant || draft.merchant;
    if (!category && merchant === draft.merchant) return draft;

    const next: DraftRow = {
      ...draft,
      merchant,
      category: category || draft.category,
      origin: category ? 'ai' : draft.origin,
      confidence: category ? Math.min(suggestion.confidence, MAX_AI_CONFIDENCE) : draft.confidence,
    };

    // A row held back only for want of a category becomes importable the moment
    // it has one, and takes the same default every other ordinary debit takes.
    // Credits and duplicates are unaffected: `isImportable` and the duplicate
    // pass that follows this one both still apply.
    if (!draft.include && category && !draft.issues.includes('credit') && isImportable(next)) {
      next.include = true;
    }
    return next;
  });
}

export function pendingDescriptions(drafts: readonly DraftRow[], cap = 120): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const draft of drafts) {
    if (!needsModel(draft)) continue;
    const description = draft.source.description.trim();
    if (!description) continue;
    const key = description.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(description);
    if (out.length >= cap) break;
  }
  return out;
}
